from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    HF_API_KEY: str = ""

    # App Environment
    APP_ENV: str = "development"
    
    # OTP Settings
    OTP_MODE: str = "development"
    OTP_EXPIRY_MINUTES: int = 5
    OTP_MAX_ATTEMPTS: int = 5
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    
    # Email Provider (Resend)
    EMAIL_FROM: str = "CampusHelp <noreply@yourdomain.com>"
    RESEND_API_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
