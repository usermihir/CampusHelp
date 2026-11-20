from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""          # service-role key — backend only, never expose to frontend
    SUPABASE_ANON_KEY: str = ""     # anon/public key — used for user-facing auth calls
    HF_API_KEY: str = ""

    # App Environment
    APP_ENV: str = "development"

    # Email domain restriction
    ALLOWED_EMAIL_DOMAIN: str = "kgpian.iitkgp.ac.in"

    # CORS — comma-separated list of allowed frontend origins
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Deprecated: kept for backward-compat, no longer used in auth flow ---
    OTP_MODE: str = "development"
    OTP_EXPIRY_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    EMAIL_FROM: str = "CampusHelp <noreply@yourdomain.com>"
    RESEND_API_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
