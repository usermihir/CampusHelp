from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel
import uuid

from app.database import get_db, AsyncSessionLocal
from app.schemas import ItemResponse, MatchResponse
from app.models import Item, Match, User, ItemType
from app.services.matching import find_candidates
from app.supabase_client import generate_presigned_url
from app.api.auth import get_current_user

class UploadRequest(BaseModel):
    filename: str

router = APIRouter()

# Helper for background task to get its own session
async def run_matching_task(item_id: UUID):
    async with AsyncSessionLocal() as session:
        await find_candidates(session, item_id)

@router.post("/items/upload-url")
def create_upload_url(request: UploadRequest, current_user: UUID = Depends(get_current_user)):
    try:
        return generate_presigned_url(request.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/items", response_model=ItemResponse, status_code=201)
async def create_item(
    background_tasks: BackgroundTasks,
    type: ItemType = Form(...),
    title: str = Form(...),
    category: str = Form(...),
    description: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    image_url: Optional[str] = Form(None),
    user_id: UUID = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):

    new_item = Item(
        user_id=user_id,
        type=type,
        title=title,
        description=description,
        category=category,
        location=location,
        image_url=image_url
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    
    # Enqueue matching task
    background_tasks.add_task(run_matching_task, new_item.id)
    
    return new_item

@router.get("/items", response_model=List[ItemResponse])
async def list_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Item).order_by(Item.created_at.desc()))
    items = result.scalars().all()
    return items

@router.get("/matches", response_model=List[MatchResponse])
async def list_matches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Match).order_by(Match.created_at.desc()))
    matches = result.scalars().all()
    return matches

@router.post("/matches/{match_id}/confirm")
async def confirm_match(match_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
        
    match.status = 'confirmed'
    
    # Also update items
    lost_item_res = await db.execute(select(Item).where(Item.id == match.lost_item_id))
    found_item_res = await db.execute(select(Item).where(Item.id == match.found_item_id))
    
    lost = lost_item_res.scalar_one()
    found = found_item_res.scalar_one()
    
    lost.status = 'matched'
    found.status = 'matched'
    
    await db.commit()
    return {"status": "confirmed"}
