from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
import uuid

class BuildingBase(BaseModel):
    name: str
    short_name: Optional[str] = None
    aliases: Optional[List[str]] = []
    category: Optional[str] = None
    latitude: float
    longitude: float
    description: Optional[str] = None

class BuildingRead(BuildingBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
