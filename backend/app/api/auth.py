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
from app.services.otp_service import create_and_send_otp, verify_otp
from app.services.jwt_service import create_temporary_token, verify_temporary_token
from app.supabase_client import admin_create_user, sign_in_with_password, admin_update_user_password, get_user_from_token
from pydantic import BaseModel, EmailStr

logger = logging.getLogger("kgp_auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)
security = HTTPBearer()

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    token: str

class SignupCompleteRequest(BaseModel):
    email: EmailStr
    password: str
    signup_token: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class PasswordResetRequest(BaseModel):
    password: str
    reset_token: str

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

# -----------------------------------------------------------------------------
# SIGNUP FLOW
# -----------------------------------------------------------------------------

@router.post("/signup/request-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def signup_request_otp(request: Request, payload: OTPRequest, db: AsyncSession = Depends(get_db)):
    """Step 1: Request OTP for signup."""
    # Ensure they have @kgpian.iitkgp.ac.in
    if not payload.email.endswith("@kgpian.iitkgp.ac.in"):
        raise HTTPException(status_code=400, detail="Only @kgpian.iitkgp.ac.in emails are permitted")

    # Check if user already exists
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Account already exists. Please login.")

    await create_and_send_otp(db, payload.email)
    return {"message": "OTP sent."}


@router.post("/signup/verify-otp", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
async def signup_verify_otp(request: Request, payload: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Step 2: Verify OTP and return a signup token."""
    await verify_otp(db, payload.email, payload.token)
    
    # Return short-lived token to prove verification in Step 3
    signup_token = create_temporary_token(payload.email, "signup_verified", 15)
    return {"message": "OTP verified successfully.", "signup_token": signup_token}


@router.post("/signup/complete", status_code=status.HTTP_201_CREATED)
async def signup_complete(payload: SignupCompleteRequest, db: AsyncSession = Depends(get_db)):
    """Step 3: Provide password and create the account."""
    # 1. Verify they completed step 2
    try:
        verified_email = verify_temporary_token(payload.signup_token, "signup_verified")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired signup session: {str(e)}")
        
    if verified_email != payload.email:
        raise HTTPException(status_code=401, detail="Email mismatch.")
        
    # 2. Check existence again just in case
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail="Account already exists.")

    # 3. Create user in Supabase
    try:
        sb_user = admin_create_user(payload.email, payload.password)
    except Exception as e:
        logger.error(f"Failed to create Supabase user: {e}")
        raise HTTPException(status_code=500, detail="Failed to create account")
        
    # 4. Insert into local DB
    user_id = UUID(sb_user["id"])
    new_user = User(id=user_id, email=payload.email)
    db.add(new_user)
    
    # 5. Assign default STUDENT role (Prompt requirement: "Signup always creates STUDENT")
    new_role = UserRole(user_id=user_id, role="STUDENT")
    db.add(new_role)
    
    await db.commit()
    
    # 6. Automatically sign them in
    try:
        session = sign_in_with_password(payload.email, payload.password)
        return {"message": "Account created successfully.", "access_token": session["access_token"]}
    except Exception:
        return {"message": "Account created. Please log in."}

# -----------------------------------------------------------------------------
# LOGIN FLOW
# -----------------------------------------------------------------------------

@router.post("/login", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
def login(request: Request, payload: LoginRequest):
    """Standard Email + Password login."""
    try:
        session = sign_in_with_password(payload.email, payload.password)
        return {"access_token": session["access_token"]}
    except Exception as e:
        logger.warning(f"Login failed for {payload.email}: {e}")
        raise HTTPException(status_code=401, detail="Invalid email or password.")

# -----------------------------------------------------------------------------
# PASSWORD RESET FLOW
# -----------------------------------------------------------------------------

@router.post("/password/request-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def password_request_otp(request: Request, payload: OTPRequest, db: AsyncSession = Depends(get_db)):
    """Request OTP for password reset."""
    existing = await db.execute(select(User).where(User.email == payload.email))
    if not existing.scalars().first():
        # Do not leak account existence, just return OK
        return {"message": "If an account exists, an OTP has been sent."}
        
    await create_and_send_otp(db, payload.email)
    return {"message": "If an account exists, an OTP has been sent."}


@router.post("/password/verify-otp", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
async def password_verify_otp(request: Request, payload: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Verify OTP and get a password reset token."""
    await verify_otp(db, payload.email, payload.token)
    reset_token = create_temporary_token(payload.email, "password_reset", 15)
    return {"message": "OTP verified successfully.", "reset_token": reset_token}


@router.post("/password/reset", status_code=status.HTTP_200_OK)
async def password_reset(payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    """Reset the password using the reset token."""
    try:
        verified_email = verify_temporary_token(payload.reset_token, "password_reset")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired reset session: {str(e)}")
        
    try:
        admin_update_user_password(verified_email, payload.password)
    except Exception as e:
        logger.error(f"Failed to update password in Supabase: {e}")
        raise HTTPException(status_code=500, detail="Failed to reset password")
        
    return {"message": "Password has been successfully updated."}
