import enum
from datetime import datetime
from sqlalchemy import Column, String, Text, Float, DateTime, ForeignKey, Integer, Enum as SQLEnum, text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import declarative_base, relationship
from pgvector.sqlalchemy import Vector
from geoalchemy2 import Geography

Base = declarative_base()

class ItemType(str, enum.Enum):
    lost = 'lost'
    found = 'found'

class ItemStatus(str, enum.Enum):
    active = 'active'
    matched = 'matched'
    expired = 'expired'
    resolved = 'resolved'

class User(Base):
    __tablename__ = 'users'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String, unique=True, nullable=False)
    hall_id = Column(UUID(as_uuid=True), ForeignKey('halls.id', ondelete='SET NULL'), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

    hall = relationship("Hall", back_populates="residents", foreign_keys=[hall_id])

class EmailVerificationOTP(Base):
    __tablename__ = 'email_verification_otps'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    email = Column(String, nullable=False)
    otp_hash = Column(String, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, nullable=False, default=0, server_default='0')
    max_attempts = Column(Integer, nullable=False, default=5, server_default='5')
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

class Item(Base):
    __tablename__ = 'items'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    type = Column(SQLEnum(ItemType, name="item_type"), nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(Text, nullable=False)
    image_url = Column(Text, nullable=True)
    location = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    status = Column(SQLEnum(ItemStatus, name="item_status"), nullable=False, default=ItemStatus.active, server_default='active')
    created_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)
    expires_at = Column(DateTime(timezone=True), server_default=text("now() + interval '30 days'"), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

class Match(Base):
    __tablename__ = 'matches'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    lost_item_id = Column(UUID(as_uuid=True), ForeignKey('items.id'), nullable=False)
    found_item_id = Column(UUID(as_uuid=True), ForeignKey('items.id'), nullable=False)
    similarity_score = Column(Float, nullable=False)
    status = Column(String, nullable=False, default='proposed', server_default='proposed')
    created_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)

class RoommateProfile(Base):
    __tablename__ = 'roommate_profiles'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), unique=True, nullable=False)

    # Single-capture fields
    sleep_schedule = Column(Float, nullable=False)  # 1 = Early, 5 = Late
    wake_up_time = Column(Float, nullable=False)    # 1 = Early, 5 = Late

    # Dual-capture fields (Self)
    self_cleanliness = Column(Float, nullable=False)
    self_noise_level = Column(Float, nullable=False)
    self_talkativeness = Column(Float, nullable=False)

    # Dual-capture fields (Preference)
    pref_cleanliness = Column(Float, nullable=False)
    pref_noise_level = Column(Float, nullable=False)
    pref_talkativeness = Column(Float, nullable=False)

    # Hard filters
    smoking = Column(Float, default=0, nullable=False)
    requires_non_smoking_roommate = Column(Float, default=0, nullable=False)

    hobbies = Column(Text, nullable=True)
    free_text_notes = Column(Text, nullable=True)
    available = Column(Float, default=1, nullable=False)  # 1=True, 0=False
    feature_vector = Column(Vector(8), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

class RoommateSuggestion(Base):
    __tablename__ = 'roommate_suggestions'
    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    viewer_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    candidate_user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

    compatibility_score = Column(Float, nullable=False)
    llm_summary = Column(Text, nullable=True)
    generated_at = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

class Building(Base):
    __tablename__ = "buildings"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(String(150), nullable=False)
    short_name = Column(String(50))
    aliases = Column(ARRAY(String))
    category = Column(String(50))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location = Column(Geography(geometry_type='POINT', srid=4326))
    description = Column(String)

    created_at = Column(DateTime(timezone=True), server_default=text('now()'))
    updated_at = Column(DateTime(timezone=True), server_default=text('now()'))


# =============================================================
# Hall-wise Maintenance Reporting Models
# =============================================================

class Hall(Base):
    __tablename__ = 'halls'

    id   = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    name = Column(Text, nullable=False, unique=True)

    residents   = relationship("User", back_populates="hall", foreign_keys="[User.hall_id]")
    complaints  = relationship("Complaint", back_populates="hall")
    roles       = relationship("UserRole", back_populates="hall")


class SLAPolicy(Base):
    """Per-category SLA config — tunable by admins without code changes."""
    __tablename__ = 'sla_policies'

    category      = Column(Text, primary_key=True)   # food | cleanliness | repair | electrical | plumbing | other
    max_hours     = Column(Integer, nullable=False)
    assigned_role = Column(Text, nullable=False)      # mess | cleanliness | estate | warden


class UserRole(Base):
    __tablename__ = 'user_roles'

    id             = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    user_id        = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    role           = Column(Text, nullable=False)   # 'STUDENT' | 'HALL_ADMIN' | 'ELECTRICIAN' | 'SUPER_ADMIN'
    hall_id        = Column(UUID(as_uuid=True), ForeignKey('halls.id', ondelete='CASCADE'), nullable=True)
    department_id  = Column(UUID(as_uuid=True), nullable=True)
    category_scope = Column(ARRAY(Text), nullable=True)  # NULL = all categories in role's default scope

    hall = relationship("Hall", back_populates="roles")


class Complaint(Base):
    __tablename__ = 'complaints'

    id                        = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    hall_id                   = Column(UUID(as_uuid=True), ForeignKey('halls.id'), nullable=False)
    reporter_id               = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    category                  = Column(Text, nullable=False)
    description               = Column(Text, nullable=False)
    photo_url                 = Column(Text, nullable=True)
    assigned_role             = Column(Text, nullable=False)   # computed at insert from sla_policies
    status                    = Column(Text, nullable=False, default='open', server_default='open')
    # open | acknowledged | in_progress | pending_confirmation | resolved | reopened | rejected
    upvote_count              = Column(Integer, nullable=False, default=1, server_default='1')
    escalation_level          = Column(Integer, nullable=False, default=0, server_default='0')
    sla_deadline              = Column(DateTime(timezone=True), nullable=False)
    created_at                = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)
    updated_at                = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)
    resolution_note           = Column(Text, nullable=True)
    resolved_by               = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    resolution_submitted_at   = Column(DateTime(timezone=True), nullable=True)
    student_confirmation_at   = Column(DateTime(timezone=True), nullable=True)
    student_confirmation_note = Column(Text, nullable=True)

    hall       = relationship("Hall", back_populates="complaints")
    supporters = relationship("ComplaintSupporter", back_populates="complaint", cascade="all, delete-orphan")
    history    = relationship(
        "ComplaintStatusHistory", back_populates="complaint", cascade="all, delete-orphan",
        order_by="ComplaintStatusHistory.created_at"
    )


class ComplaintSupporter(Base):
    """Links students who were deduplicated onto an existing ticket."""
    __tablename__ = 'complaint_supporters'

    complaint_id = Column(UUID(as_uuid=True), ForeignKey('complaints.id', ondelete='CASCADE'), primary_key=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    created_at   = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

    complaint = relationship("Complaint", back_populates="supporters")


class ComplaintStatusHistory(Base):
    """Append-only audit trail — never update, always insert."""
    __tablename__ = 'complaint_status_history'

    id           = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    complaint_id = Column(UUID(as_uuid=True), ForeignKey('complaints.id', ondelete='CASCADE'), nullable=False)
    changed_by   = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=True)
    from_status  = Column(Text, nullable=True)
    to_status    = Column(Text, nullable=False)
    note         = Column(Text, nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=text('now()'), nullable=False)

    complaint = relationship("Complaint", back_populates="history")
