import hashlib
import secrets
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
import httpx

from app.models import EmailVerificationOTP
from app.core.config import settings

logger = logging.getLogger("kgp_auth")

def generate_otp() -> str:
    """Generate a secure 6-digit OTP."""
    return ''.join(secrets.choice('0123456789') for _ in range(6))

def hash_otp(otp: str) -> str:
    """Hash OTP for secure storage."""
    return hashlib.sha256(otp.encode()).hexdigest()

async def create_and_send_otp(db: AsyncSession, email: str) -> None:
    """Generate, store, and deliver an OTP."""
    
    # Check rate limit (cooldown)
    cooldown_threshold = datetime.now(timezone.utc) - timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS)
    recent_otp_query = await db.execute(
        select(EmailVerificationOTP)
        .where(EmailVerificationOTP.email == email)
        .where(EmailVerificationOTP.created_at > cooldown_threshold)
    )
    if recent_otp_query.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {settings.OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another OTP."
        )

    # Invalidate previous OTPs for this email that are unconsumed
    # We don't strictly need to do this, but it prevents multiple active OTPs
    
    # Generate
    otp = generate_otp()
    otp_hash = hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
    
    # Store
    db_otp = EmailVerificationOTP(
        email=email,
        otp_hash=otp_hash,
        expires_at=expires_at,
        max_attempts=settings.OTP_MAX_ATTEMPTS
    )
    db.add(db_otp)
    await db.commit()
    
    # Deliver
    if settings.OTP_MODE == "development":
        print(f"\n{'='*40}\n[DEV ONLY] OTP generated for testing.\nNever enable OTP_MODE=development in production.\nEmail: {email}\nOTP: {otp}\nExpires: {expires_at}\n{'='*40}\n", flush=True)
    else:
        # Production - Resend API
        if not settings.RESEND_API_KEY:
            logger.error("RESEND_API_KEY is not set in production!")
            raise HTTPException(status_code=500, detail="Email service configuration error")
            
        try:
            with httpx.Client() as client:
                res = client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "from": settings.EMAIL_FROM,
                        "to": [email],
                        "subject": "CampusHelp Verification Code",
                        "html": f"<p>Your verification code is: <strong>{otp}</strong></p><p>This code expires in {settings.OTP_EXPIRY_MINUTES} minutes.</p>"
                    }
                )
                res.raise_for_status()
        except Exception as e:
            logger.error(f"Failed to send email via Resend: {e}")
            raise HTTPException(status_code=500, detail="Failed to send verification email")

async def verify_otp(db: AsyncSession, email: str, otp: str) -> None:
    """Verify an OTP."""
    otp_hash = hash_otp(otp)
    
    # Find active OTP for email
    result = await db.execute(
        select(EmailVerificationOTP)
        .where(EmailVerificationOTP.email == email)
        .where(EmailVerificationOTP.consumed_at.is_(None))
        .order_by(EmailVerificationOTP.created_at.desc())
    )
    db_otp = result.scalars().first()
    
    if not db_otp:
        raise HTTPException(status_code=401, detail="No active OTP found. Please request a new one.")
        
    if datetime.now(timezone.utc) > db_otp.expires_at:
        raise HTTPException(status_code=401, detail="OTP has expired. Please request a new one.")
        
    if db_otp.attempts >= db_otp.max_attempts:
        raise HTTPException(status_code=401, detail="Maximum attempts exceeded. Please request a new OTP.")
        
    if db_otp.otp_hash != otp_hash:
        db_otp.attempts += 1
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid OTP code.")
        
    # Success
    db_otp.consumed_at = datetime.now(timezone.utc)
    await db.commit()
