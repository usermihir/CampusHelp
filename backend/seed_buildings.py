import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

from app.models import Building

load_dotenv()
db_url = os.getenv("DATABASE_URL")
engine = create_async_engine(db_url)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

HARDCODED_BUILDINGS = [
    {
        "name": "Main Building",
        "short_name": "Main Building",
        "aliases": ["Main Building", "Director's Office"],
        "category": "administrative",
        "latitude": 22.3194, "longitude": 87.3099,
        "description": "IIT Kharagpur Main Administrative Building"
    },
    {
        "name": "Nalanda Complex",
        "short_name": "Nalanda",
        "aliases": ["Nalanda", "Nalanda Classroom Complex", "NR"],
        "category": "academic",
        "latitude": 22.3164, "longitude": 87.3054,
        "description": "Nalanda Academic Complex"
    },
    {
        "name": "Central Library",
        "short_name": "Library",
        "aliases": ["Library", "Central Library"],
        "category": "library",
        "latitude": 22.3190, "longitude": 87.3105,
        "description": "Central Library, IIT Kharagpur"
    },
    {
        "name": "Computer & Informatics Centre",
        "short_name": "CIC",
        "aliases": ["CIC", "Computer and Informatics Centre", "Network Centre"],
        "category": "centre",
        "latitude": 22.3185, "longitude": 87.3039,
        "description": "Central internet and computing facility"
    },
    {
        "name": "Vikramshila",
        "short_name": "Vikramshila",
        "aliases": ["Vikramshila", "V", "Vikramshila Complex"],
        "category": "academic",
        "latitude": 22.3154, "longitude": 87.3045,
        "description": "Vikramshila Academic Complex"
    },
    {
        "name": "Takshashila",
        "short_name": "Takshashila",
        "aliases": ["Takshashila"],
        "category": "academic",
        "latitude": 22.3175, "longitude": 87.3065,
        "description": "Takshashila Building"
    },
    {
        "name": "Netaji Auditorium",
        "short_name": "Netaji Aud",
        "aliases": ["Netaji Auditorium", "Auditorium", "Netaji Aud"],
        "category": "auditorium",
        "latitude": 22.3189, "longitude": 87.3099,
        "description": "Netaji Auditorium"
    },
    {
        "name": "Electrical Engineering Department",
        "short_name": "EE",
        "aliases": ["EE", "Electrical", "Electrical Dept"],
        "category": "department",
        "latitude": 22.3180, "longitude": 87.3115,
        "description": "Department of Electrical Engineering"
    },
    {
        "name": "Computer Science & Engineering Department",
        "short_name": "CSE",
        "aliases": ["CSE", "Computer Science", "CS Dept"],
        "category": "department",
        "latitude": 22.3185, "longitude": 87.3041,
        "description": "Department of Computer Science and Engineering"
    },
    {
        "name": "LBS Hall of Residence",
        "short_name": "LBS",
        "aliases": ["LBS", "LBS Hall", "Lal Bahadur Shastri Hall"],
        "category": "hostel",
        "latitude": 22.3146, "longitude": 87.2974,
        "description": "LBS Hall of Residence"
    },
    {
        "name": "Technology Students Gymkhana",
        "short_name": "TSG",
        "aliases": ["TSG", "Gymkhana"],
        "category": "student facilities",
        "latitude": 22.3182, "longitude": 87.3004,
        "description": "Technology Students' Gymkhana"
    },
    {
        "name": "B.C. Roy Technology Hospital",
        "short_name": "BC Roy",
        "aliases": ["BC Roy", "Hospital", "BC Roy Hospital"],
        "category": "hospital",
        "latitude": 22.3223, "longitude": 87.3072,
        "description": "B.C. Roy Technology Hospital"
    },
    {
        "name": "Tech Market",
        "short_name": "Tech Market",
        "aliases": ["Tech Market", "Tech M", "Market"],
        "category": "market",
        "latitude": 22.3242, "longitude": 87.3060,
        "description": "Tech Market"
    }
]

async def seed_buildings():
    async with AsyncSessionLocal() as session:
        # Clear existing buildings
        await session.execute(text("DELETE FROM buildings;"))
        
        for data in HARDCODED_BUILDINGS:
            db_building = Building(
                name=data['name'],
                short_name=data['short_name'],
                aliases=data['aliases'],
                category=data['category'],
                latitude=data['latitude'],
                longitude=data['longitude'],
                description=data['description']
            )
            session.add(db_building)
            
        await session.commit()
        
        # Update the geography column for PostGIS
        await session.execute(text('''
            UPDATE buildings
            SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        '''))
        await session.commit()
        print(f"Successfully seeded {len(HARDCODED_BUILDINGS)} buildings and updated PostGIS geometries.")

if __name__ == "__main__":
    asyncio.run(seed_buildings())
