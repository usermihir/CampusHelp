import asyncio
from celery import shared_task
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import RoommateProfile, RoommateSuggestion
from app.services.roommate_service import build_preference_lists, run_stable_roommates, compatibility_score
from app.services.llm_service import generate_match_summary

async def run_matching_pipeline_async(user_id_str: str = None):
    """
    If user_id_str is provided, we only generate matches for this user against all others.
    If not, we run the global stable roommates algorithm.
    """
    async with AsyncSessionLocal() as session:
        # Fetch all available profiles
        result = await session.execute(select(RoommateProfile).where(RoommateProfile.available == 1))
        profiles = result.scalars().all()
        
        if len(profiles) < 2:
            return "Not enough profiles to match."

        # Convert to dicts for our pure-python matching service
        profile_dicts = [
            {
                "id": p.user_id,
                "sleep_schedule": p.sleep_schedule,
                "wake_up_time": p.wake_up_time,
                "self_cleanliness": p.self_cleanliness,
                "self_noise_level": p.self_noise_level,
                "self_talkativeness": p.self_talkativeness,
                "pref_cleanliness": p.pref_cleanliness,
                "pref_noise_level": p.pref_noise_level,
                "pref_talkativeness": p.pref_talkativeness,
                "smoking": p.smoking,
                "requires_non_smoking_roommate": p.requires_non_smoking_roommate,
                "hobbies": p.hobbies,
                "free_text_notes": p.free_text_notes,
            }
            for p in profiles
        ]

        if user_id_str:
            # Re-generate suggestions just for this user
            user_profile = next((p for p in profile_dicts if str(p["id"]) == user_id_str), None)
            if not user_profile:
                return "User profile not found."
            
            # Simple sorting instead of Irving for a single user refresh
            preferences = build_preference_lists(profile_dicts)
            candidate_ids = preferences.get(user_profile["id"], [])[:10] # Top 10 matches
            
            # Delete old suggestions for this viewer
            await session.execute(
                RoommateSuggestion.__table__.delete().where(
                    RoommateSuggestion.viewer_user_id == str(user_profile["id"])
                )
            )
            
            for cid in candidate_ids:
                candidate_profile = next((p for p in profile_dicts if p["id"] == cid), None)
                score = compatibility_score(user_profile, candidate_profile)
                
                llm_summary = ""
                try:
                    llm_summary = generate_match_summary(user_profile, candidate_profile)
                except Exception as e:
                    print(f"LLM Generation failed: {e}")
                    llm_summary = "Compatibility analysis unavailable at the moment."
                
                new_suggestion = RoommateSuggestion(
                    viewer_user_id=user_profile["id"],
                    candidate_user_id=candidate_profile["id"],
                    compatibility_score=score,
                    llm_summary=llm_summary
                )
                session.add(new_suggestion)
            
            await session.commit()
            return f"Generated {len(candidate_ids)} new suggestions for user."
        else:
            # Global stable roommates algorithm
            preferences = build_preference_lists(profile_dicts)
            matches = run_stable_roommates(preferences)
            
            for viewer_id, candidate_id in matches.items():
                if not candidate_id:
                    continue
                
                viewer_profile = next(p for p in profile_dicts if p["id"] == viewer_id)
                candidate_profile = next(p for p in profile_dicts if p["id"] == candidate_id)
                
                score = compatibility_score(viewer_profile, candidate_profile)
                
                # Generate RAG summary
                llm_summary = ""
                try:
                    llm_summary = generate_match_summary(viewer_profile, candidate_profile)
                except Exception as e:
                    print(f"LLM Generation failed: {e}")
                    llm_summary = "Compatibility analysis unavailable at the moment."
                
                # Save suggestion to DB
                new_suggestion = RoommateSuggestion(
                    viewer_user_id=viewer_id,
                    candidate_user_id=candidate_id,
                    compatibility_score=score,
                    llm_summary=llm_summary
                )
                session.add(new_suggestion)
            
            await session.commit()
            return f"Generated {len(matches)} new suggestions globally."

@shared_task
def run_matching_pipeline(user_id_str: str = None):
    return asyncio.run(run_matching_pipeline_async(user_id_str))
