from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from typing import List
import uuid

from app.database import get_db
from app.models import Building
from app.schemas import BuildingRead

router = APIRouter()

@router.get("", response_model=List[BuildingRead])
async def get_buildings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Building))
    return result.scalars().all()

@router.get("/search", response_model=List[BuildingRead])
async def search_buildings(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db)
):
    # Search by name (using trgm ILIKE), short_name, or aliases
    query = select(Building).where(
        or_(
            Building.name.ilike(f"%{q}%"),
            Building.short_name.ilike(f"%{q}%"),
            func.array_to_string(Building.aliases, ',').ilike(f"%{q}%")
        )
    )
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/{building_id}", response_model=BuildingRead)
async def get_building(building_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Building).where(Building.id == building_id))
    building = result.scalar_one_or_none()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building
