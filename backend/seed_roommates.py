import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from uuid import uuid4
import sys
import os
import random

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.models import User, RoommateProfile
from app.services.roommate_service import generate_feature_vector
from app.services.llm_service import generate_user_profile

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

DUMMY_PROFILES = [
    {
        "email": "gamer@dummy.com",
        "sleep_schedule": 5, # Night Owl
        "wake_up_time": 5,   # Late
        "self_cleanliness": 2, # Messy
        "self_noise_level": 4, # Loud
        "self_talkativeness": 4, # Chatty
        "pref_cleanliness": 2,
        "pref_noise_level": 4,
        "pref_talkativeness": 4,
        "smoking": 0,
        "requires_non_smoking_roommate": 0,
        "hobbies": "Gaming, Anime, PC Building",
        "free_text_notes": "I mostly play games at night."
    },
    {
        "email": "athlete@dummy.com",
        "sleep_schedule": 1, # Early Bird
        "wake_up_time": 1,   # 5 AM
        "self_cleanliness": 5, # Spotless
        "self_noise_level": 2, # Quiet
        "self_talkativeness": 3,
        "pref_cleanliness": 4,
        "pref_noise_level": 2,
        "pref_talkativeness": 3,
        "smoking": 0,
        "requires_non_smoking_roommate": 1,
        "hobbies": "Gym, Football, Running",
        "free_text_notes": "Very active, early riser."
    },
    {
        "email": "reader@dummy.com",
        "sleep_schedule": 2,
        "wake_up_time": 2,
        "self_cleanliness": 4,
        "self_noise_level": 1, # Library Quiet
        "self_talkativeness": 1, # Silent
        "pref_cleanliness": 4,
        "pref_noise_level": 1,
        "pref_talkativeness": 1,
        "smoking": 0,
        "requires_non_smoking_roommate": 1,
        "hobbies": "Reading, Chess, Painting",
        "free_text_notes": "I need absolute silence to study and read."
    }
]

async def seed():
    async with AsyncSessionLocal() as session:
        print("Clearing old dummy users...")
        await session.execute(text("DELETE FROM users WHERE email LIKE '%@dummy.com'"))
        await session.commit()
        
        print("Seeding new dummy users...")
        for data in DUMMY_PROFILES:
            email = data.pop("email")
            
            # Create user
            user_id = uuid4()
            new_user = User(id=user_id, email=email)
            session.add(new_user)
            await session.commit()
            
            # Create profile
            vector = generate_feature_vector(data)
            profile = RoommateProfile(
                user_id=user_id,
                **data,
                feature_vector=vector,
                available=1
            )
            session.add(profile)
            await session.commit()
            print(f"Created profile for {email}")

        print("Done seeding!")

if __name__ == "__main__":
    asyncio.run(seed())
