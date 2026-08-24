import asyncio
import sys, os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.tasks.matching_tasks import run_matching_pipeline_async
from app.database import AsyncSessionLocal
from sqlalchemy.future import select
from app.models import RoommateProfile

async def test():
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(RoommateProfile.user_id))
        user_ids = result.scalars().all()
        # Find the one that isn't a dummy user (dummy users might have a specific ID, but we just pick one)
        # Actually let's just run global match
        print("Running global match...")
        res = await run_matching_pipeline_async(None)
        print("Global Match Result:", res)
        
        # Or pick the last user ID
        uid = str(user_ids[-1])
        print(f"Running individual match for {uid}...")
        res = await run_matching_pipeline_async(uid)
        print("Individual Match Result:", res)

if __name__ == "__main__":
    asyncio.run(test())
