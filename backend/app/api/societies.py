"""
api/societies.py — All REST routes for the Society Channel feature.

Route Map:
  Societies      POST /societies  GET /societies  GET/PATCH /societies/{id}
  Soc Admins     POST /societies/{id}/admins  DELETE /societies/{id}/admins/{uid}
  Soc Members    POST /societies/{id}/members/{uid}  DELETE ...  GET ...
  Channels       POST /societies/{id}/channels  GET /societies/{id}/channels
                 GET/PATCH/DELETE /channels/{id}
  Chan Members   POST /channels/{id}/join  DELETE /channels/{id}/leave
                 GET /channels/{id}/members
                 POST/DELETE/PATCH /channels/{id}/members/{uid}
  Messages       GET /channels/{id}/messages  (POST via WebSocket, not REST)
"""
import logging
from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.api.auth import get_current_user
from app.models import (
    User, Society, SocietyAdmin, SocietyMember,
    Channel, ChannelMember, Message
)
from app.schemas.society import (
    SocietyCreate, SocietyUpdate, SocietyOut,
    ChannelCreate, ChannelUpdate, ChannelOut,
    ChannelMemberOut, MemberRoleUpdate,
    SocietyMemberOut, MessageOut
)
from app.services.society_service import (
    require_super_admin, require_society_admin,
    require_channel_access, can_manage_channel,
    get_society_or_404, get_channel_or_404,
    is_society_admin, is_channel_member, is_channel_admin,
    count_channel_admins, is_super_admin
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["societies"])


# ═══════════════════════════════════════════════════════════════
# SOCIETIES
# ═══════════════════════════════════════════════════════════════

@router.post("/societies", response_model=SocietyOut, status_code=201)
async def create_society(
    payload: SocietyCreate,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SUPER_ADMIN only. Auto-creates a public 'General' channel."""
    await require_super_admin(current_user, db)

    society = Society(
        name=payload.name.strip(),
        description=payload.description,
        logo_url=payload.logo_url,
        created_by=current_user,
    )
    db.add(society)
    await db.flush()  # get society.id before committing

    # Auto-create public General channel
    general = Channel(
        society_id=society.id,
        name="General",
        description="General announcements and discussion.",
        is_private=False,
        created_by=current_user,
    )
    db.add(general)
    await db.flush()

    # Add creator as channel admin of General
    db.add(ChannelMember(channel_id=general.id, user_id=current_user, role='admin'))
    # Also make creator a society admin
    db.add(SocietyAdmin(society_id=society.id, user_id=current_user, granted_by=current_user))

    await db.commit()
    await db.refresh(society)
    out = SocietyOut.model_validate(society)
    out.is_admin = True
    out.member_count = 0
    return out


@router.get("/societies", response_model=List[SocietyOut])
async def list_societies(
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all societies (public endpoint — any authenticated user)."""
    result = await db.execute(select(Society).order_by(Society.name))
    societies = result.scalars().all()

    out = []
    for s in societies:
        # Member count
        mc_result = await db.execute(
            select(func.count()).where(SocietyMember.society_id == s.id)
        )
        member_count = mc_result.scalar()

        admin_flag = await is_society_admin(s.id, current_user, db)
        so = SocietyOut.model_validate(s)
        so.member_count = member_count
        so.is_admin = admin_flag
        out.append(so)
    return out


@router.get("/societies/{society_id}", response_model=SocietyOut)
async def get_society(
    society_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    society = await get_society_or_404(society_id, db)
    mc = await db.execute(select(func.count()).where(SocietyMember.society_id == society_id))
    so = SocietyOut.model_validate(society)
    so.member_count = mc.scalar()
    so.is_admin = await is_society_admin(society_id, current_user, db)
    return so


@router.patch("/societies/{society_id}", response_model=SocietyOut)
async def update_society(
    society_id: int,
    payload: SocietyUpdate,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_society_admin(society_id, current_user, db)
    society = await get_society_or_404(society_id, db)

    if payload.name is not None:
        society.name = payload.name.strip()
    if payload.description is not None:
        society.description = payload.description
    if payload.logo_url is not None:
        society.logo_url = payload.logo_url
    society.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(society)
    so = SocietyOut.model_validate(society)
    so.is_admin = True
    return so


# ═══════════════════════════════════════════════════════════════
# SOCIETY ADMINS
# ═══════════════════════════════════════════════════════════════

@router.post("/societies/{society_id}/admins", status_code=201)
async def add_society_admin(
    society_id: int,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SUPER_ADMIN only."""
    await require_super_admin(current_user, db)
    await get_society_or_404(society_id, db)

    # Verify target user exists
    u = await db.execute(select(User).where(User.id == user_id))
    if not u.scalars().first():
        raise HTTPException(404, "User not found")

    try:
        db.add(SocietyAdmin(society_id=society_id, user_id=user_id, granted_by=current_user))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Already exists — treat as idempotent
    return {"detail": "Admin assigned"}


@router.delete("/societies/{society_id}/admins/{uid}", status_code=200)
async def remove_society_admin(
    society_id: int,
    uid: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SUPER_ADMIN only."""
    await require_super_admin(current_user, db)
    result = await db.execute(
        select(SocietyAdmin).where(
            SocietyAdmin.society_id == society_id,
            SocietyAdmin.user_id == uid,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(404, "Admin not found")
    await db.delete(row)
    await db.commit()
    return {"detail": "Admin removed"}


# ═══════════════════════════════════════════════════════════════
# SOCIETY MEMBERS
# ═══════════════════════════════════════════════════════════════

@router.post("/societies/{society_id}/members/{uid}", status_code=201)
async def add_society_member(
    society_id: int,
    uid: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Society admin adds a user to the society."""
    await require_society_admin(society_id, current_user, db)
    await get_society_or_404(society_id, db)

    u = await db.execute(select(User).where(User.id == uid))
    if not u.scalars().first():
        raise HTTPException(404, "User not found")

    try:
        db.add(SocietyMember(society_id=society_id, user_id=uid, added_by=current_user))
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"detail": "Member added"}


@router.delete("/societies/{society_id}/members/{uid}", status_code=200)
async def remove_society_member(
    society_id: int,
    uid: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_society_admin(society_id, current_user, db)
    result = await db.execute(
        select(SocietyMember).where(
            SocietyMember.society_id == society_id,
            SocietyMember.user_id == uid,
        )
    )
    row = result.scalars().first()
    if not row:
        raise HTTPException(404, "Member not found")
    await db.delete(row)
    await db.commit()
    return {"detail": "Member removed"}


@router.get("/societies/{society_id}/members", response_model=List[SocietyMemberOut])
async def list_society_members(
    society_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_society_admin(society_id, current_user, db)
    result = await db.execute(
        select(SocietyMember, User.email)
        .join(User, User.id == SocietyMember.user_id)
        .where(SocietyMember.society_id == society_id)
        .order_by(SocietyMember.joined_at)
    )
    rows = result.all()
    out = []
    for member, email in rows:
        so = SocietyMemberOut.model_validate(member)
        so.email = email
        out.append(so)
    return out


# ═══════════════════════════════════════════════════════════════
# CHANNELS
# ═══════════════════════════════════════════════════════════════

@router.post("/societies/{society_id}/channels", response_model=ChannelOut, status_code=201)
async def create_channel(
    society_id: int,
    payload: ChannelCreate,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Society admin creates a channel. Creator auto-added as channel admin."""
    await require_society_admin(society_id, current_user, db)
    await get_society_or_404(society_id, db)

    channel = Channel(
        society_id=society_id,
        name=payload.name.strip(),
        description=payload.description,
        is_private=payload.is_private,
        created_by=current_user,
    )
    db.add(channel)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, f"A channel named '{payload.name}' already exists in this society")

    # Auto-add creator as channel admin
    db.add(ChannelMember(channel_id=channel.id, user_id=current_user, role='admin'))
    await db.commit()
    await db.refresh(channel)

    co = ChannelOut.model_validate(channel)
    co.member_count = 1
    co.is_member = True
    return co


@router.get("/societies/{society_id}/channels", response_model=List[ChannelOut])
async def list_channels(
    society_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns active channels the user can see:
    - All public channels
    - Private channels where user is a member/admin
    Society admins/super admins see all channels.
    """
    await get_society_or_404(society_id, db)
    admin = await is_society_admin(society_id, current_user, db) or await is_super_admin(current_user, db)

    result = await db.execute(
        select(Channel)
        .where(Channel.society_id == society_id, Channel.is_archived == False)
        .order_by(Channel.created_at)
    )
    channels = result.scalars().all()

    out = []
    for ch in channels:
        if ch.is_private and not admin:
            # Only include if user is a channel member
            if not await is_channel_member(ch.id, current_user, db):
                continue

        mc = await db.execute(select(func.count()).where(ChannelMember.channel_id == ch.id))
        co = ChannelOut.model_validate(ch)
        co.member_count = mc.scalar()
        co.is_member = await is_channel_member(ch.id, current_user, db)
        out.append(co)
    return out


@router.get("/channels/{channel_id}", response_model=ChannelOut)
async def get_channel(
    channel_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await get_channel_or_404(channel_id, db)
    await require_channel_access(channel, current_user, db)

    mc = await db.execute(select(func.count()).where(ChannelMember.channel_id == channel_id))
    co = ChannelOut.model_validate(channel)
    co.member_count = mc.scalar()
    co.is_member = await is_channel_member(channel_id, current_user, db)
    return co


@router.patch("/channels/{channel_id}", response_model=ChannelOut)
async def update_channel(
    channel_id: int,
    payload: ChannelUpdate,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await get_channel_or_404(channel_id, db)
    if not await can_manage_channel(channel_id, channel.society_id, current_user, db):
        raise HTTPException(403, "Channel or society admin required")

    if payload.name is not None:
        channel.name = payload.name.strip()
    if payload.description is not None:
        channel.description = payload.description
    if payload.is_private is not None:
        channel.is_private = payload.is_private
    channel.updated_at = datetime.now(timezone.utc)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Channel name already exists in this society")
    await db.refresh(channel)
    return ChannelOut.model_validate(channel)


@router.delete("/channels/{channel_id}", status_code=200)
async def archive_channel(
    channel_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete: sets is_archived=True. History preserved."""
    channel = await get_channel_or_404(channel_id, db)
    await require_society_admin(channel.society_id, current_user, db)

    channel.is_archived = True
    channel.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"detail": "Channel archived"}


# ═══════════════════════════════════════════════════════════════
# CHANNEL MEMBERSHIP
# ═══════════════════════════════════════════════════════════════

@router.post("/channels/{channel_id}/join", status_code=201)
async def join_channel(
    channel_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public channels only. Private channels require admin to add."""
    channel = await get_channel_or_404(channel_id, db)
    if channel.is_archived:
        raise HTTPException(400, "Channel is archived")
    if channel.is_private:
        raise HTTPException(403, "Private channels require an admin to add you")

    try:
        db.add(ChannelMember(channel_id=channel_id, user_id=current_user, role='member'))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return {"detail": "Already a member"}
    return {"detail": "Joined successfully"}


@router.delete("/channels/{channel_id}/leave", status_code=200)
async def leave_channel(
    channel_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Leave a channel. Blocks last admin from leaving."""
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == current_user,
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(404, "You are not a member of this channel")

    # Safety: prevent orphaning an adminless channel
    if membership.role == 'admin' and await count_channel_admins(channel_id, db) <= 1:
        raise HTTPException(
            409,
            "You are the last admin. Promote another member to admin before leaving."
        )

    await db.delete(membership)
    await db.commit()
    return {"detail": "Left channel"}


@router.get("/channels/{channel_id}/members", response_model=List[ChannelMemberOut])
async def list_channel_members(
    channel_id: int,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await get_channel_or_404(channel_id, db)
    await require_channel_access(channel, current_user, db)

    result = await db.execute(
        select(ChannelMember, User.email)
        .join(User, User.id == ChannelMember.user_id)
        .where(ChannelMember.channel_id == channel_id)
        .order_by(ChannelMember.joined_at)
    )
    rows = result.all()
    out = []
    for member, email in rows:
        cm = ChannelMemberOut.model_validate(member)
        cm.email = email
        out.append(cm)
    return out


@router.post("/channels/{channel_id}/members/{uid}", status_code=201)
async def add_channel_member(
    channel_id: int,
    uid: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only. Used for adding members to private channels."""
    channel = await get_channel_or_404(channel_id, db)
    if not await can_manage_channel(channel_id, channel.society_id, current_user, db):
        raise HTTPException(403, "Channel or society admin required")

    u = await db.execute(select(User).where(User.id == uid))
    if not u.scalars().first():
        raise HTTPException(404, "User not found")

    try:
        db.add(ChannelMember(channel_id=channel_id, user_id=uid, role='member'))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return {"detail": "Already a member"}
    return {"detail": "Member added"}


@router.delete("/channels/{channel_id}/members/{uid}", status_code=200)
async def remove_channel_member(
    channel_id: int,
    uid: UUID,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    channel = await get_channel_or_404(channel_id, db)
    if not await can_manage_channel(channel_id, channel.society_id, current_user, db):
        raise HTTPException(403, "Channel or society admin required")

    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == uid,
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(404, "Member not found")

    # Safety: can't remove last admin
    if membership.role == 'admin' and await count_channel_admins(channel_id, db) <= 1:
        raise HTTPException(409, "Cannot remove the last admin of a channel")

    await db.delete(membership)
    await db.commit()
    return {"detail": "Member removed"}


@router.patch("/channels/{channel_id}/members/{uid}", status_code=200)
async def update_channel_member_role(
    channel_id: int,
    uid: UUID,
    payload: MemberRoleUpdate,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Promote or demote a member. Blocks demoting last admin."""
    channel = await get_channel_or_404(channel_id, db)
    if not await can_manage_channel(channel_id, channel.society_id, current_user, db):
        raise HTTPException(403, "Channel or society admin required")

    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == uid,
        )
    )
    membership = result.scalars().first()
    if not membership:
        raise HTTPException(404, "Member not found")

    # Safety: can't demote last admin
    if membership.role == 'admin' and payload.role == 'member':
        if await count_channel_admins(channel_id, db) <= 1:
            raise HTTPException(409, "Cannot demote the last admin of a channel")

    membership.role = payload.role
    await db.commit()
    return {"detail": f"Role updated to {payload.role}"}


# ═══════════════════════════════════════════════════════════════
# MESSAGES (REST history load — real-time via WebSocket)
# ═══════════════════════════════════════════════════════════════

@router.get("/channels/{channel_id}/messages", response_model=List[MessageOut])
async def get_messages(
    channel_id: int,
    before_id: Optional[int] = Query(None, description="Cursor for pagination (load older messages)"),
    limit: int = Query(50, ge=1, le=100),
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Load message history. Channel members only."""
    channel = await get_channel_or_404(channel_id, db)
    await require_channel_access(channel, current_user, db)

    query = (
        select(Message, User.email)
        .join(User, User.id == Message.sender_id)
        .where(Message.channel_id == channel_id)
    )
    if before_id:
        query = query.where(Message.id < before_id)

    query = query.order_by(Message.created_at.desc()).limit(limit)
    result = await db.execute(query)
    rows = result.all()

    # Return in ascending order (oldest first)
    out = []
    for msg, email in reversed(rows):
        mo = MessageOut.model_validate(msg)
        mo.sender_email = email
        out.append(mo)
    return out
