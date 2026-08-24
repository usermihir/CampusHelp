import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_async_engine(db_url)

async def main():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
        await conn.execute(text("""
        CREATE TABLE IF NOT EXISTS buildings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(150) NOT NULL,
            short_name VARCHAR(50),
            aliases TEXT[],
            category VARCHAR(50),
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            location GEOGRAPHY(POINT, 4326),
            description TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_buildings_name_trgm ON buildings USING GIN (name gin_trgm_ops);"))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_buildings_location ON buildings USING GIST (location);"))
        print("Buildings table created successfully")

if __name__ == "__main__":
    asyncio.run(main())
