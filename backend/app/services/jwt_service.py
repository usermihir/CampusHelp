import jwt
from datetime import datetime, timezone, timedelta
from app.core.config import settings

# Use SUPABASE_KEY as a signing key for internal temporary tokens
# since it's already a secure secret in the environment.
SECRET_KEY = settings.SUPABASE_KEY
ALGORITHM = "HS256"

def create_temporary_token(email: str, token_type: str, expires_minutes: int = 15) -> str:
    """Create a short-lived token for multi-step flows like Signup and Password Reset."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    to_encode = {"sub": email, "type": token_type, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_temporary_token(token: str, expected_type: str) -> str:
    """Verify the token and return the email address. Raises Exception if invalid."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != expected_type:
            raise Exception("Invalid token payload")
        return email
    except jwt.ExpiredSignatureError:
        raise Exception("Token has expired")
    except jwt.InvalidTokenError:
        raise Exception("Invalid token")
