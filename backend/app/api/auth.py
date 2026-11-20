import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException, Request, status, Depends
from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from app.database import get_db
from app.models import User, UserRole
from app.supabase_client import (
    request_otp_via_supabase,
    verify_otp_via_supabase,
    get_user_from_token,
)
from pydantic import BaseModel, EmailStr, field_validator

logger = logging.getLogger("kgp_auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)
security = HTTPBearer()

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _normalize_email(email: str) -> str:
    return str(email).strip().lower()

def _assert_kgp_email(email: str) -> None:
    domain = email.rsplit("@", 1)[-1]
    if domain != "kgpian.iitkgp.ac.in":
        raise HTTPException(
            status_code=400,
            detail="Only @kgpian.iitkgp.ac.in email addresses are allowed.",
        )

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class OTPRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize(cls, v: str) -> str:
        return _normalize_email(v)


class OTPVerify(BaseModel):
    email: EmailStr
    token: str

    @field_validator("email")
    @classmethod
    def normalize(cls, v: str) -> str:
        return _normalize_email(v)

    @field_validator("token")
    @classmethod
    def strip_token(cls, v: str) -> str:
        return v.strip()


# ---------------------------------------------------------------------------
# Auth dependency — keep this working as before for all protected endpoints
# ---------------------------------------------------------------------------

def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    auth: str = Depends(security),
) -> UUID:
    """Dependency that extracts the Supabase UUID from the Bearer token."""
    try:
        user_data = get_user_from_token(auth.credentials)
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return UUID(user_data["id"])


# ---------------------------------------------------------------------------
# NEW: Unified passwordless OTP endpoints
# ---------------------------------------------------------------------------

@router.post("/request-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def request_otp(request: Request, payload: OTPRequest):
    """
    Step 1 — Send a 6-digit OTP to the user's KGPian email.
    Works for both new (signup) and existing (login) accounts.
    Supabase handles OTP generation, storage, expiry and delivery.
    """
    email = payload.email          # already normalised by validator
    _assert_kgp_email(email)

    try:
        await request_otp_via_supabase(email)
    except Exception as e:
        logger.error(f"OTP request failed for {email}: {e}")
        raise HTTPException(
            status_code=502,
            detail="Failed to send OTP. Please try again in a moment.",
        )

    return {"message": "OTP sent to your email. It expires in 5 minutes."}


@router.post("/verify-otp", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
async def verify_otp(
    request: Request,
    payload: OTPVerify,
    db: AsyncSession = Depends(get_db),
):
    """
    Step 2 — Verify the OTP.
    • Supabase validates the code and returns a session.
    • We upsert the user into the local DB (new users get a STUDENT role).
    • Returns access_token, refresh_token, and is_new_user flag.
    """
    email = payload.email          # already normalised by validator
    _assert_kgp_email(email)

    # 1. Verify with Supabase
    try:
        session = await verify_otp_via_supabase(email, payload.token)
    except Exception as e:
        logger.warning(f"OTP verification failed for {email}: {e}")
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired OTP. Please request a new one.",
        )

    # 2. Extract the Supabase user UUID from the session
    try:
        sb_user = session.get("user") or {}
        user_id = UUID(sb_user["id"])
    except Exception as e:
        logger.error(f"Could not extract user UUID from Supabase session: {e}")
        raise HTTPException(status_code=500, detail="Authentication error. Please try again.")

    access_token = session.get("access_token", "")
    refresh_token = session.get("refresh_token", "")

    # 3. Upsert into local users table
    #    Use INSERT ... ON CONFLICT DO NOTHING for concurrency safety.
    is_new_user = False
    result = await db.execute(select(User).where(User.id == user_id))
    existing_user = result.scalars().first()

    if not existing_user:
        is_new_user = True
        new_user = User(id=user_id, email=email)
        db.add(new_user)

        # Assign STUDENT role if not already present
        new_role = UserRole(user_id=user_id, role="STUDENT")
        db.add(new_role)

        try:
            await db.commit()
        except Exception as e:
            # Race condition: another request created the user in between.
            # Roll back and treat as existing user.
            await db.rollback()
            logger.warning(f"Race condition creating local user {email}: {e}")
            is_new_user = False
    else:
        # Existing user — check that STUDENT role exists (don't double-insert)
        role_result = await db.execute(
            select(UserRole).where(
                UserRole.user_id == user_id,
                UserRole.role == "STUDENT",
            )
        )
        if not role_result.scalars().first():
            db.add(UserRole(user_id=user_id, role="STUDENT"))
            await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "is_new_user": is_new_user,
    }
