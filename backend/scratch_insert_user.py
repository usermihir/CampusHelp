import asyncio
from app.database import engine
from sqlalchemy import text

async def insert_dummy_user():
    async with engine.begin() as conn:
        await conn.execute(text("INSERT INTO users (id, email) VALUES ('00000000-0000-0000-0000-000000000000', 'dummy@kgpian.iitkgp.ac.in') ON CONFLICT (id) DO NOTHING"))
        print("Dummy user inserted successfully!")
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(insert_dummy_user())
