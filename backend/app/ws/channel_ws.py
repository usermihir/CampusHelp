"""
ws/channel_ws.py — WebSocket endpoint for real-time channel messaging.

Connection URL:
    ws://localhost:8000/ws/channels/{channel_id}?token=<access_token>

Flow:
    1. Client connects with JWT token as query param
    2. Server verifies token → gets user_id
    3. Server checks channel access (public OR member)
    4. On message received: validate → save to DB → broadcast to all in channel
    5. On disconnect: remove from ConnectionManager
"""
import json
import logging
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.supabase_client import get_user_from_token
from app.models import Channel, ChannelMember, Message, User
from app.services.society_service import (
    get_channel_or_404, require_channel_access, is_channel_member
)
from app.ws.manager import manager
from sqlalchemy import select

logger = logging.getLogger(__name__)
ws_router = APIRouter(tags=["websocket"])


async def _get_user_email(user_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    return user.email if user else str(user_id)


@ws_router.websocket("/ws/channels/{channel_id}")
async def channel_websocket(
    websocket: WebSocket,
    channel_id: int,
    token: str = Query(..., description="Supabase JWT access token"),
):
    """
    WebSocket endpoint for real-time channel messaging.
    Token is passed as a query param because browsers cannot set
    custom HTTP headers on WebSocket connections.
    """
    # ── 1. Authenticate ──────────────────────────────────────
    try:
        user_data = get_user_from_token(token)
        user_id = UUID(user_data["id"])
    except Exception as e:
        logger.warning(f"WS auth failed: {e}")
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # ── 2. Authorize (check channel access) ──────────────────
    async with AsyncSessionLocal() as db:
        try:
            channel = await get_channel_or_404(channel_id, db)
            await require_channel_access(channel, user_id, db)
            sender_email = await _get_user_email(user_id, db)
        except Exception as e:
            logger.warning(f"WS access denied for channel={channel_id} user={user_id}: {e}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

    # ── 3. Connect ────────────────────────────────────────────
    await manager.connect(channel_id, websocket)
    logger.info(f"WS user={user_id} joined channel={channel_id}")

    try:
        while True:
            # ── 4. Receive message ────────────────────────────
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
                content = str(data.get("content", "")).strip()
            except (json.JSONDecodeError, AttributeError):
                content = raw.strip()

            # ── 5. Validate ───────────────────────────────────
            if not content:
                await websocket.send_json({"error": "Message cannot be empty"})
                continue
            if len(content) > 5000:
                await websocket.send_json({"error": "Message too long (max 5000 chars)"})
                continue

            # ── 6. Persist ────────────────────────────────────
            async with AsyncSessionLocal() as db:
                # Re-check membership on every message (handles kick mid-session)
                if channel.is_private and not await is_channel_member(channel_id, user_id, db):
                    await websocket.send_json({"error": "Access revoked"})
                    break

                msg = Message(
                    channel_id=channel_id,
                    sender_id=user_id,
                    content=content,
                )
                db.add(msg)
                await db.commit()
                await db.refresh(msg)

            # ── 7. Broadcast ──────────────────────────────────
            payload = {
                "id": msg.id,
                "channel_id": channel_id,
                "sender_id": str(user_id),
                "sender_email": sender_email,
                "content": content,
                "created_at": msg.created_at.isoformat(),
            }
            await manager.broadcast(channel_id, payload)

    except WebSocketDisconnect:
        logger.info(f"WS user={user_id} disconnected from channel={channel_id}")
    except Exception as e:
        logger.error(f"WS error channel={channel_id} user={user_id}: {e}")
    finally:
        manager.disconnect(channel_id, websocket)
