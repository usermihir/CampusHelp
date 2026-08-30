"""
seed_super_admin.py
-------------------
One-time script to assign SUPER_ADMIN role to an existing user.

Usage:
    python seed_super_admin.py <email>

Example:
    python seed_super_admin.py mihirkumarb813@kgpian.iitkgp.ac.in
"""

import asyncio
import sys
from sqlalchemy import select, text
from app.database import AsyncSessionLocal
from app.models import User, UserRole


async def seed(email: str):
    async with AsyncSessionLocal() as db:
        # 1. Find the user
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalars().first()
        if not user:
            print(f"[ERROR] No user found with email: {email}")
            print("       Make sure the user has signed up first.")
            sys.exit(1)

        # 2. Check if already SUPER_ADMIN
        existing = await db.execute(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role == "SUPER_ADMIN"
            )
        )
        if existing.scalars().first():
            print(f"[INFO] {email} is already a SUPER_ADMIN. Nothing to do.")
            return

        # 3. Insert SUPER_ADMIN role
        role = UserRole(user_id=user.id, role="SUPER_ADMIN")
        db.add(role)
        await db.commit()
        print(f"[OK] SUPER_ADMIN role granted to {email} (user_id={user.id})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python seed_super_admin.py <email>")
        sys.exit(1)
    asyncio.run(seed(sys.argv[1]))
