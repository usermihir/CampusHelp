from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.api.auth import get_current_user
from app.models import User, UserRole

router = APIRouter()

class RoleResponse(BaseModel):
    role: str
    hall_id: Optional[UUID] = None
    department_id: Optional[UUID] = None
    category_scope: Optional[List[str]] = None

class UserProfileResponse(BaseModel):
    id: UUID
    email: str
    hall_id: Optional[UUID] = None
    roles: List[RoleResponse]

@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user = await db.get(User, current_user)
    
    # Fetch roles
    result = await db.execute(select(UserRole).where(UserRole.user_id == current_user))
    roles = result.scalars().all()
    
    role_responses = [
        RoleResponse(
            role=r.role,
            hall_id=r.hall_id,
            department_id=r.department_id,
            category_scope=r.category_scope
        ) for r in roles
    ]
    
    # Implicit STUDENT role for all authenticated KGP users
    has_student = any(r.role == 'STUDENT' for r in roles)
    if not has_student:
        role_responses.append(RoleResponse(role='STUDENT', hall_id=user.hall_id))
        
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        hall_id=user.hall_id,
        roles=role_responses
    )
