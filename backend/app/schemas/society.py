"""
schemas/society.py — Pydantic request/response schemas for Society Channel feature.
"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, ConfigDict


# ─── Society ──────────────────────────────────────────────────────────────────

class SocietyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    logo_url: Optional[str] = None

class SocietyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    description: Optional[str] = Field(None, max_length=1000)
    logo_url: Optional[str] = None

class SocietyOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    logo_url: Optional[str]
    created_by: UUID
    created_at: datetime
    member_count: Optional[int] = None
    is_admin: Optional[bool] = None   # set at query time for the requesting user

    model_config = ConfigDict(from_attributes=True)


# ─── Channel ──────────────────────────────────────────────────────────────────

class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_private: bool = False

    @field_validator('name')
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('Channel name cannot be blank')
        return v.strip()

class ChannelUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_private: Optional[bool] = None

class ChannelOut(BaseModel):
    id: int
    society_id: int
    name: str
    description: Optional[str]
    is_private: bool
    is_archived: bool
    created_by: UUID
    created_at: datetime
    member_count: Optional[int] = None
    is_member: Optional[bool] = None   # for the requesting user

    model_config = ConfigDict(from_attributes=True)


# ─── Channel Member ───────────────────────────────────────────────────────────

class ChannelMemberOut(BaseModel):
    channel_id: int
    user_id: UUID
    role: str
    joined_at: datetime
    email: Optional[str] = None    # joined from users table

    model_config = ConfigDict(from_attributes=True)

class MemberRoleUpdate(BaseModel):
    role: str = Field(pattern='^(member|admin)$')


# ─── Society Member ───────────────────────────────────────────────────────────

class SocietyMemberOut(BaseModel):
    society_id: int
    user_id: UUID
    joined_at: datetime
    email: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ─── Message ──────────────────────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)

    @field_validator('content')
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('Message cannot be blank')
        return v

class MessageOut(BaseModel):
    id: int
    channel_id: int
    sender_id: UUID
    sender_email: Optional[str] = None
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
