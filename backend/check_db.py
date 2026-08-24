import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
import sys, os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.core.config import settings

async def check():
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        res = await conn.execute(text("SELECT COUNT(*) FROM roommate_profiles"))
        print(f"Profiles count: {res.scalar()}")
        res = await conn.execute(text("SELECT COUNT(*) FROM roommate_suggestions"))
        print(f"Suggestions count: {res.scalar()}")

if __name__ == "__main__":
    asyncio.run(check())
