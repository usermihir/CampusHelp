import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
import sys
import os

# Add the parent directory to sys.path so we can import app modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models import Base

async def setup():
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async with engine.begin() as conn:
        print("Enabling vector extension...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        
        print("Dropping existing roommate tables...")
        await conn.execute(text("DROP TABLE IF EXISTS roommate_suggestions CASCADE;"))
        await conn.execute(text("DROP TABLE IF EXISTS roommate_profiles CASCADE;"))

        print("Creating tables...")
        await conn.run_sync(Base.metadata.create_all)
        print("Done!")

if __name__ == "__main__":
    asyncio.run(setup())
