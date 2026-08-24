import httpx
from app.core.config import settings

SUPABASE_URL = None
SUPABASE_KEY = None

def _get_settings():
    global SUPABASE_URL, SUPABASE_KEY
    if SUPABASE_URL is None:
        SUPABASE_URL = settings.SUPABASE_URL
        SUPABASE_KEY = settings.SUPABASE_KEY

def admin_create_user(email: str, password: str) -> dict:
    """Create a new user in Supabase Auth via Admin API (bypasses email confirmation)."""
    _get_settings()
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "email": email,
        "password": password,
        "email_confirm": True
    }
    with httpx.Client() as client:
        response = client.post(url, headers=headers, json=data)
    if response.status_code not in (200, 201):
        raise Exception(f"Failed to create user ({response.status_code}): {response.text}")
    return response.json()

def sign_in_with_password(email: str, password: str) -> dict:
    """Sign in user with email and password, returning tokens."""
    _get_settings()
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    data = {"email": email, "password": password}
    with httpx.Client() as client:
        response = client.post(url, headers=headers, json=data)
    if response.status_code != 200:
        raise Exception(f"Sign in failed ({response.status_code}): {response.text}")
    return response.json()

def admin_update_user_password(email: str, new_password: str) -> dict:
    """Update a user's password using the Admin API."""
    _get_settings()
    # First, lookup the user by email
    url = f"{SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    }
    with httpx.Client() as client:
        response = client.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception("Failed to list users")
        users = response.json().get("users", [])
        target_user = next((u for u in users if u.get("email") == email), None)
        if not target_user:
            raise Exception("User not found")
            
        uid = target_user["id"]
        
        # Update user
        update_url = f"{SUPABASE_URL}/auth/v1/admin/users/{uid}"
        update_data = {"password": new_password}
        update_resp = client.put(update_url, headers=headers, json=update_data)
        if update_resp.status_code != 200:
            raise Exception(f"Failed to update password ({update_resp.status_code}): {update_resp.text}")
        return update_resp.json()

def get_user_from_token(access_token: str) -> dict:
    """Validate a JWT token and return user data from Supabase."""
    _get_settings()
    url = f"{SUPABASE_URL}/auth/v1/user"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {access_token}",
    }
    with httpx.Client() as client:
        response = client.get(url, headers=headers)
    if response.status_code != 200:
        raise Exception(f"Invalid token ({response.status_code})")
    return response.json()

BUCKET = "items"

async def upload_to_supabase(file_name: str, file_bytes: bytes, content_type: str) -> str:
    """Uploads a file to Supabase Storage and returns its public URL."""
    if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")

    upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/{BUCKET}/{file_name}"
    headers = {
        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
        "Content-Type": content_type,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(upload_url, content=file_bytes, headers=headers)
        if response.status_code not in (200, 201):
            raise Exception(f"Supabase upload failed ({response.status_code}): {response.text}")

    public_url = f"{settings.SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{file_name}"
    return public_url
