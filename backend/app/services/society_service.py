"""
services/society_service.py
Authorization helpers for the Society Channel feature.
All DB operations go through here to keep route handlers thin.
"""
from uuid import UUID
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    UserRole,
    Society, SocietyAdmin, SocietyMember,
    Channel, ChannelMember,
)


# ─── Role Checkers ────────────────────────────────────────────────────────────

async def is_super_admin(user_id: UUID, db: AsyncSession) -> bool:
    result = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.role == 'SUPER_ADMIN'
        )
    )
    return result.scalars().first() is not None


async def is_society_admin(society_id: int, user_id: UUID, db: AsyncSession) -> bool:
    result = await db.execute(
        select(SocietyAdmin).where(
            SocietyAdmin.society_id == society_id,
            SocietyAdmin.user_id == user_id
        )
    )
    return result.scalars().first() is not None


async def is_channel_admin(channel_id: int, user_id: UUID, db: AsyncSession) -> bool:
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id,
            ChannelMember.role == 'admin'
        )
    )
    return result.scalars().first() is not None


async def is_channel_member(channel_id: int, user_id: UUID, db: AsyncSession) -> bool:
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == user_id
        )
    )
    return result.scalars().first() is not None


async def can_manage_channel(channel_id: int, society_id: int, user_id: UUID, db: AsyncSession) -> bool:
    """True if user is channel admin, society admin, or super admin."""
    if await is_super_admin(user_id, db):
        return True
    if await is_society_admin(society_id, user_id, db):
        return True
    if await is_channel_admin(channel_id, user_id, db):
        return True
    return False


# ─── Fetch Helpers (raise 404 on missing) ────────────────────────────────────

async def get_society_or_404(society_id: int, db: AsyncSession) -> Society:
    result = await db.execute(select(Society).where(Society.id == society_id))
    society = result.scalars().first()
    if not society:
        raise HTTPException(status_code=404, detail="Society not found")
    return society


async def get_channel_or_404(channel_id: int, db: AsyncSession) -> Channel:
    result = await db.execute(select(Channel).where(Channel.id == channel_id))
    channel = result.scalars().first()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


# ─── Authorization Guards (raise 403 on failure) ─────────────────────────────

async def require_super_admin(user_id: UUID, db: AsyncSession):
    if not await is_super_admin(user_id, db):
        raise HTTPException(status_code=403, detail="SUPER_ADMIN role required")


async def require_society_admin(society_id: int, user_id: UUID, db: AsyncSession):
    """Passes for SUPER_ADMIN or society admin."""
    if await is_super_admin(user_id, db):
        return
    if not await is_society_admin(society_id, user_id, db):
        raise HTTPException(status_code=403, detail="Society admin role required")


async def require_channel_access(channel: Channel, user_id: UUID, db: AsyncSession):
    """Public channel → anyone. Private channel → must be member/admin."""
    if not channel.is_private:
        return   # public, access granted
    if await can_manage_channel(channel.id, channel.society_id, user_id, db):
        return
    if await is_channel_member(channel.id, user_id, db):
        return
    raise HTTPException(status_code=403, detail="You are not a member of this private channel")


# ─── Admin Count Safety ───────────────────────────────────────────────────────

async def count_channel_admins(channel_id: int, db: AsyncSession) -> int:
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.role == 'admin'
        )
    )
    return len(result.scalars().all())
