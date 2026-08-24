from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from uuid import UUID
from app.database import get_db
from app.models import RoommateProfile, RoommateSuggestion
from app.schemas import RoommateProfileCreate, RoommateProfileResponse, RoommateSuggestionResponse
from app.api.auth import get_current_user
from app.services.roommate_service import generate_feature_vector
from app.services.llm_service import generate_user_profile
from app.tasks.matching_tasks import run_matching_pipeline_async
import asyncio

router = APIRouter()



@router.post("/profile", response_model=RoommateProfileResponse)
async def create_or_update_profile(
    profile: RoommateProfileCreate,
    background_tasks: BackgroundTasks,
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = str(current_user)

    # Calculate feature vector
    profile_dict = profile.model_dump()
    vector = generate_feature_vector(profile_dict)

    # Check if profile exists
    result = await db.execute(select(RoommateProfile).where(RoommateProfile.user_id == user_id_str))
    existing_profile = result.scalars().first()

    if existing_profile:
        # Update existing
        for key, value in profile_dict.items():
            setattr(existing_profile, key, value)
        existing_profile.feature_vector = vector
        existing_profile.available = 1
        await db.commit()
        await db.refresh(existing_profile)
        return_profile = existing_profile
    else:
        # Create new
        new_profile = RoommateProfile(
            user_id=user_id_str,
            **profile_dict,
            feature_vector=vector,
            available=1
        )
        db.add(new_profile)
        await db.commit()
        await db.refresh(new_profile)
        return_profile = new_profile

    # Kick off background task to generate matches for this user without needing Redis
    background_tasks.add_task(run_matching_pipeline_async, user_id_str)

    return return_profile

@router.get("/profile/me", response_model=RoommateProfileResponse)
async def get_my_profile(
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = str(current_user)
    result = await db.execute(select(RoommateProfile).where(RoommateProfile.user_id == user_id_str))
    profile = result.scalars().first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    response = RoommateProfileResponse.model_validate(profile)
    
    # Generate the LLM profile on the fly (or cache it)
    try:
        profile_data = {
            "sleep_schedule": profile.sleep_schedule,
            "wake_up_time": profile.wake_up_time,
            "cleanliness": profile.self_cleanliness,
            "noise_level": profile.self_noise_level,
            "talkativeness": profile.self_talkativeness,
            "hobbies": profile.hobbies,
            "hobbies_notes": profile.free_text_notes,
        }
        response.llm_profile = generate_user_profile(profile_data)
    except Exception as e:
        print(f"Failed to generate LLM profile: {e}")
        
    return response

@router.get("/suggestions/me", response_model=List[RoommateSuggestionResponse])
async def get_my_suggestions(
    current_user: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    user_id_str = str(current_user)
    
    # Fetch suggestions
    query = select(RoommateSuggestion).where(
        RoommateSuggestion.viewer_user_id == user_id_str
    ).order_by(RoommateSuggestion.compatibility_score.asc())
    
    result = await db.execute(query)
    suggestions = result.scalars().all()
    
    response_list = []
    for sug in suggestions:
        # Fetch candidate profile
        prof_res = await db.execute(select(RoommateProfile).where(RoommateProfile.user_id == sug.candidate_user_id))
        candidate_profile = prof_res.scalars().first()
        
        sug_dict = {
            "id": sug.id,
            "viewer_user_id": sug.viewer_user_id,
            "candidate_user_id": sug.candidate_user_id,
            "compatibility_score": sug.compatibility_score,
            "llm_summary": sug.llm_summary,
            "generated_at": sug.generated_at,
            "candidate_profile": candidate_profile
        }
        response_list.append(RoommateSuggestionResponse(**sug_dict))
        
    return response_list

@router.post("/match")
async def trigger_global_matching(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Triggers the background global matching pipeline"""
    background_tasks.add_task(run_matching_pipeline_async, None)
    return {"status": "Matching pipeline triggered"}
