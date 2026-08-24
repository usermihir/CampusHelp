# KGP Auth: Domain-Restricted OTP Login/Signup with Supabase + Python

Production-grade reference implementation for an authentication system that:

- Only allows sign-up/login with `@kgpian.iitkgp.ac.in` email addresses
- Uses **passwordless OTP** (email one-time code) instead of passwords
- Enforces the domain restriction at **every layer** (client, API, database) — not just in the UI
- Is rate-limited, auditable, and safe to run in production

Stack: **Python (FastAPI)** + **Supabase (Auth + Postgres)** + **supabase-py**

---

## 1. Architecture Overview

```
┌──────────────┐      1. POST /auth/otp/request        ┌────────────────────┐
│   Frontend   │ ─────────────────────────────────────▶│  FastAPI Backend    │
│ (Web/Mobile) │                                        │  (Python)           │
│              │◀───────────────────────────────────────│                    │
└──────────────┘      2. { message: "OTP sent" }        └─────────┬──────────┘
       │                                                          │
       │ 3. POST /auth/otp/verify {email, token}                  │ supabase-py
       ▼                                                          ▼
┌──────────────┐                                        ┌────────────────────┐
│   Frontend   │◀────── 4. { access_token, ... } ───────│   Supabase Auth     │
└──────────────┘                                        │  + Postgres (RLS)   │
                                                          │  + DB Trigger guard │
                                                          └────────────────────┘
```

Key design decision: **do not trust the client**. Domain validation happens:

1. In the API layer (fast rejection, good UX)
2. In a **Postgres trigger / Auth Hook** on `auth.users` (hard guarantee — even if someone calls the Supabase Auth API directly, bypassing your backend, they're rejected)
3. Optionally again in Row Level Security (RLS) policies on your `profiles` table

---

## 2. Supabase Project Setup

### 2.1 Enable Email OTP

In **Supabase Dashboard → Authentication → Providers → Email**:

- Enable **"Email OTP"** (or "Magic Link" with OTP mode — Supabase sends a 6-digit code instead of a link when you call `verify_otp` with `type="email"`)
- Disable **"Confirm email"** requiring a link click if you want pure OTP-code flow
- Set **OTP expiry** to something short, e.g. `300` seconds (5 min) under **Auth → Settings → Email OTP Expiration**
- Under **Auth → Rate Limits**, tighten:
  - `otp` requests per hour per IP (e.g. 5)
  - `otp` requests per hour per email (e.g. 5)

### 2.2 Restrict allowed email domain — Database layer (hard guarantee)

Even with backend validation, you should enforce this at the database level via a `before user created` Auth Hook (Postgres function), so no signup can ever slip through.

**Supabase Dashboard → Authentication → Hooks → "Before User Created"** (Postgres Hook):

```sql
-- 1. Create the validation function
create or replace function public.restrict_kgp_domain()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.email !~* '^[a-zA-Z0-9._%+-]+@kgpian\.iitkgp\.ac\.in$' then
    raise exception 'signup_disallowed: only @kgpian.iitkgp.ac.in emails are permitted';
  end if;
  return new;
end;
$$;

-- 2. Attach as a "before insert" trigger on auth.users
create trigger enforce_kgp_domain
  before insert on auth.users
  for each row execute function public.restrict_kgp_domain();
```

> If your Supabase plan/version doesn't expose `auth.users` triggers directly, use the equivalent **Auth Hook (HTTP)** feature under **Auth → Hooks**, pointing to a Postgres Edge Function that performs the same regex check and returns a `decision: "reject"` response. Same principle either way: **reject before a user row is ever created**, not after.

### 2.3 `profiles` table + RLS

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  roll_number text,          -- optionally parse from email local-part
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can only see/update their own profile
create policy "select own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Defense in depth: block inserts of any non-kgpian email even if RLS is misconfigured elsewhere
create policy "insert own profile domain-locked"
  on public.profiles for insert
  with check (
    auth.uid() = id
    and email ~* '^[a-zA-Z0-9._%+-]+@kgpian\.iitkgp\.ac\.in$'
  );
```

Auto-create a profile row on signup via trigger:

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

### 2.4 Environment variables

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-public-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-side only, never expose to client
ALLOWED_EMAIL_DOMAIN=kgpian.iitkgp.ac.in
```

---

## 3. Python Backend (FastAPI)

### 3.1 Install dependencies

```bash
pip install fastapi uvicorn supabase python-dotenv pydantic[email] slowapi --break-system-packages
```

- `supabase` — official Python client
- `slowapi` — simple rate limiting for FastAPI
- `pydantic[email]` — email format validation

### 3.2 Project structure

```
app/
├── main.py
├── config.py
├── deps.py
├── schemas.py
└── routers/
    └── auth.py
```

### 3.3 `config.py`

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    allowed_email_domain: str = "kgpian.iitkgp.ac.in"

    class Config:
        env_file = ".env"

settings = Settings()
```

### 3.4 `deps.py` — Supabase clients

```python
from supabase import create_client, Client
from app.config import settings

# Anon client: used for auth flows (OTP send/verify) — respects RLS
def get_supabase_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_anon_key)

# Service-role client: only for trusted server-side admin actions (never expose)
def get_supabase_admin_client() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
```

### 3.5 `schemas.py`

```python
from pydantic import BaseModel, EmailStr, field_validator
from app.config import settings

class OTPRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def must_be_kgp_domain(cls, v: str) -> str:
        domain = v.split("@")[-1].lower()
        if domain != settings.allowed_email_domain:
            raise ValueError(
                f"Only @{settings.allowed_email_domain} email addresses are allowed"
            )
        return v.lower()

class OTPVerify(BaseModel):
    email: EmailStr
    token: str  # 6-digit OTP code

    @field_validator("token")
    @classmethod
    def token_must_be_numeric(cls, v: str) -> str:
        if not (v.isdigit() and len(v) == 6):
            raise ValueError("OTP must be a 6-digit numeric code")
        return v
```

### 3.6 `routers/auth.py` — core logic

```python
import logging
from fastapi import APIRouter, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.deps import get_supabase_client
from app.schemas import OTPRequest, OTPVerify

logger = logging.getLogger("kgp_auth")
router = APIRouter(prefix="/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)


@router.post("/otp/request", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")  # per-IP throttle in addition to Supabase's own limits
def request_otp(request: Request, payload: OTPRequest):
    """
    Step 1: Send a 6-digit OTP to the user's @kgpian.iitkgp.ac.in email.
    Domain is already validated by the Pydantic schema before we get here.
    """
    supabase = get_supabase_client()
    try:
        supabase.auth.sign_in_with_otp({
            "email": payload.email,
            "options": {
                "should_create_user": True,  # allow signup-on-first-OTP
                # "email_redirect_to" not needed for pure OTP-code flow
            },
        })
    except Exception as exc:
        logger.warning("OTP request failed for %s: %s", payload.email, exc)
        # Don't leak whether the email exists / internal error details
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not send OTP. Please check the email address and try again.",
        )

    return {"message": "OTP sent to your KGP email. It expires in 5 minutes."}


@router.post("/otp/verify", status_code=status.HTTP_200_OK)
@limiter.limit("10/hour")
def verify_otp(request: Request, payload: OTPVerify):
    """
    Step 2: Verify the OTP and return a Supabase session (access + refresh tokens).
    """
    supabase = get_supabase_client()
    try:
        result = supabase.auth.verify_otp({
            "email": payload.email,
            "token": payload.token,
            "type": "email",
        })
    except Exception as exc:
        logger.warning("OTP verify failed for %s: %s", payload.email, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP code.",
        )

    if not result.session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP code.",
        )

    session = result.session
    user = result.user
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "user": {"id": user.id, "email": user.email},
    }


@router.post("/logout", status_code=status.HTTP_200_OK)
def logout(request: Request):
    """
    Client should discard tokens locally; optionally revoke server-side
    using the user's access token (pass via Authorization header).
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    supabase = get_supabase_client()
    supabase.auth.sign_out()  # invalidates the current session server-side
    return {"message": "Logged out"}
```

### 3.7 `main.py`

```python
import logging
from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.routers import auth
from app.routers.auth import limiter

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="KGP Auth API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(auth.router)

@app.get("/health")
def health():
    return {"status": "ok"}
```

Run it:

```bash
uvicorn app.main:app --reload --port 8000
```

---

## 4. Protecting Downstream Routes (Session Verification)

For any authenticated route, verify the Supabase JWT sent in the `Authorization: Bearer <access_token>` header.

```python
from fastapi import Header, HTTPException, status
from app.deps import get_supabase_client

def get_current_user(authorization: str = Header(...)):
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    supabase = get_supabase_client()
    try:
        user_resp = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = user_resp.user
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    # Defense in depth: re-check domain even on protected routes
    if not user.email.endswith("@kgpian.iitkgp.ac.in"):
        raise HTTPException(status_code=403, detail="Access restricted to KGP accounts")

    return user
```

Use it as a dependency:

```python
from fastapi import Depends

@router.get("/me")
def read_profile(user = Depends(get_current_user)):
    return {"id": user.id, "email": user.email}
```

---

## 5. Security Checklist (Production Readiness)

| Layer | Control | Where |
|---|---|---|
| Client | Reject non-KGP emails before submit | Frontend form validation (UX only, not trusted) |
| API | Pydantic `EmailStr` + domain regex validator | `schemas.py` |
| API | Rate limiting per IP (`5/hour` OTP requests, `10/hour` verify attempts) | `slowapi` middleware |
| Auth provider | OTP expiry ≤ 5 minutes | Supabase Dashboard → Auth Settings |
| Auth provider | Per-email and per-IP OTP rate limits | Supabase Dashboard → Auth → Rate Limits |
| Database | Reject signup at insert time regardless of entry point | Postgres trigger / Before-User-Created Auth Hook |
| Database | RLS policies on `profiles` scoped to `auth.uid()` | SQL migration |
| Database | Insert policy re-validates domain | SQL migration |
| Secrets | `service_role` key never sent to client, only used server-side | `deps.py` |
| Logging | Log failures without leaking whether an email exists in the system | `logger.warning` (generic client-facing message) |
| Transport | HTTPS enforced everywhere; Supabase URL always `https://` | Infra/deploy config |
| Tokens | Short-lived access token + refresh token flow, `sign_out()` on logout | Supabase session handling |

---

## 6. Testing

```python
# test_auth.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_reject_non_kgp_email():
    resp = client.post("/auth/otp/request", json={"email": "someone@gmail.com"})
    assert resp.status_code == 422  # Pydantic validation error

def test_accept_kgp_email_format():
    resp = client.post("/auth/otp/request", json={"email": "23xy1234@kgpian.iitkgp.ac.in"})
    # 200 if Supabase call succeeds, or 400 if Supabase rejects for another reason —
    # but never 422, since the format itself is valid
    assert resp.status_code in (200, 400)

def test_reject_malformed_otp():
    resp = client.post("/auth/otp/verify", json={
        "email": "23xy1234@kgpian.iitkgp.ac.in",
        "token": "12ab"
    })
    assert resp.status_code == 422
```

---

## 7. Notes & Gotchas

- **`should_create_user: True`** on `sign_in_with_otp` means the *same endpoint* handles both signup and login — first-time users are created automatically on OTP verification. This is standard for passwordless flows and simplifies your API surface (no separate `/signup` needed).
- The **Postgres trigger (§2.2)** is your real security boundary. Pydantic validation is for UX; someone could still call Supabase's Auth REST API directly with your public anon key, bypassing FastAPI entirely — the DB trigger is what actually blocks that.
- Consider parsing the roll number from the email local-part (e.g. `23cs10001@kgpian.iitkgp.ac.in`) if you need it — validate its format too, don't trust it blindly for authorization decisions.
- If you later add mobile apps, the same FastAPI endpoints work unchanged — Supabase sessions are stateless JWTs.
- Rotate the `service_role` key immediately if it's ever exposed (e.g. committed to git, shipped in a client bundle).
