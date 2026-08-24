from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models import ItemType, ItemStatus

class ItemCreate(BaseModel):
    user_id: UUID  # In a real app, this would come from the auth token
    type: ItemType
    title: str
    description: Optional[str] = None
    category: str
    image_url: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class ItemResponse(BaseModel):
    id: UUID
    user_id: UUID
    type: ItemType
    title: str
    description: Optional[str] = None
    category: str
    image_url: Optional[str] = None
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    status: ItemStatus
    created_at: datetime
    expires_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class MatchResponse(BaseModel):
    id: UUID
    lost_item_id: UUID
    found_item_id: UUID
    similarity_score: float
    status: str
    created_at: datetime
    confirmed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

from pydantic import EmailStr, field_validator

class OTPRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def must_be_kgp_domain(cls, v: str) -> str:
        # TEMP: domain check disabled for Resend sandbox testing
        # domain = v.split("@")[-1].lower()
        # if domain != "kgpian.iitkgp.ac.in":
        #     raise ValueError("Only @kgpian.iitkgp.ac.in email addresses are allowed")
        return v.lower()

class OTPVerify(BaseModel):
    email: EmailStr
    token: str  # 6-digit OTP code

    @field_validator("token")
    @classmethod
    def token_must_be_numeric(cls, v: str) -> str:
        if not (v.isdigit() and 6 <= len(v) <= 8):
            raise ValueError("OTP must be a 6-8 digit numeric code")
        return v

class RoommateProfileCreate(BaseModel):
    sleep_schedule: float
    wake_up_time: float
    self_cleanliness: float
    self_noise_level: float
    self_talkativeness: float
    pref_cleanliness: float
    pref_noise_level: float
    pref_talkativeness: float
    smoking: float = 0
    requires_non_smoking_roommate: float = 0
    hobbies: Optional[str] = None
    free_text_notes: Optional[str] = None

class RoommateProfileResponse(RoommateProfileCreate):
    id: UUID
    user_id: UUID
    available: float
    created_at: datetime
    updated_at: datetime

    # We'll include a dynamically generated LLM profile in the response
    # to show on the user's dashboard.
    llm_profile: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RoommateSuggestionResponse(BaseModel):
    id: UUID
    viewer_user_id: UUID
    candidate_user_id: UUID
    compatibility_score: float
    llm_summary: Optional[str] = None
    generated_at: datetime

    candidate_profile: Optional[RoommateProfileResponse] = None

    model_config = ConfigDict(from_attributes=True)

from typing import List

class BuildingBase(BaseModel):
    name: str
    short_name: Optional[str] = None
    aliases: Optional[List[str]] = []
    category: Optional[str] = None
    latitude: float
    longitude: float
    description: Optional[str] = None

class BuildingRead(BuildingBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# =============================================================
# Hall-wise Maintenance Reporting Schemas
# =============================================================

class HallCreate(BaseModel):
    name: str

class HallResponse(BaseModel):
    id: UUID
    name: str

    model_config = ConfigDict(from_attributes=True)

class SLAPolicyResponse(BaseModel):
    category: str
    max_hours: int
    assigned_role: str

    model_config = ConfigDict(from_attributes=True)

class SLAPolicyUpdate(BaseModel):
    max_hours: int

class ComplaintCreate(BaseModel):
    category: str           # food | cleanliness | repair | electrical | plumbing | other
    description: str
    photo_url: Optional[str] = None

class ComplaintResponse(BaseModel):
    id: UUID
    hall_id: UUID
    reporter_id: UUID
    category: str
    description: str
    photo_url: Optional[str] = None
    assigned_role: str
    status: str
    upvote_count: int
    escalation_level: int
    sla_deadline: datetime
    created_at: datetime
    updated_at: datetime
    resolution_note: Optional[str] = None
    resolved_by: Optional[UUID] = None
    resolution_submitted_at: Optional[datetime] = None
    student_confirmation_at: Optional[datetime] = None
    student_confirmation_note: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

# Valid state-machine transitions:
#   General: open -> acknowledged -> in_progress -> resolved | rejected
#   Personal: open -> acknowledged -> in_progress -> pending_confirmation -> resolved | reopened
VALID_TRANSITIONS = {
    "open":                 {"acknowledged", "rejected"},
    "acknowledged":         {"in_progress", "rejected"},
    "in_progress":          {"pending_confirmation", "resolved", "rejected"},
    "pending_confirmation": {"resolved", "reopened"},
    "reopened":             {"acknowledged", "in_progress"},
}

class StatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None
    resolution_note: Optional[str] = None

class ConfirmResolution(BaseModel):
    confirmed: bool           # True = confirmed resolved, False = reject / reopen
    note: Optional[str] = None

class ComplaintStatusHistoryResponse(BaseModel):
    id: UUID
    complaint_id: UUID
    changed_by: Optional[UUID] = None
    from_status: Optional[str] = None
    to_status: str
    note: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class HallAnalytics(BaseModel):
    hall_id: UUID
    hall_name: str
    open_count: int
    in_progress_count: int
    resolved_count: int
    escalated_count: int
    avg_resolution_hours: Optional[float] = None
