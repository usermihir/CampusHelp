from typing import List, Optional
from uuid import UUID
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.api.auth import get_current_user
from app.models import UserRole
from app.core.permissions import ROLE_PERMISSIONS, Role

class RequirePermission:
    """
    Dependency that enforces RBAC.
    Returns the list of `UserRole` objects that grant the permission,
    which the route can then use to filter by scope (e.g. hall_id).
    """
    def __init__(self, permission: str):
        self.permission = permission

    async def __call__(
        self,
        current_user: UUID = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
    ) -> List[UserRole]:
        
        result = await db.execute(
            select(UserRole).where(UserRole.user_id == current_user)
        )
        user_roles = result.scalars().all()
        
        # Super admin bypass
        for ur in user_roles:
            if ur.role == Role.SUPER_ADMIN:
                return [ur]
        
        valid_roles = []
        for ur in user_roles:
            # Check if this role has the permission
            role_enum = Role(ur.role)
            if role_enum in ROLE_PERMISSIONS and self.permission in ROLE_PERMISSIONS[role_enum]:
                valid_roles.append(ur)
                
        if not valid_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Missing required permission: {self.permission}"
            )
            
        return valid_roles
