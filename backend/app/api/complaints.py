"""
Hall-wise Maintenance Complaint API
Endpoints follow the spec in CampusHelp_Hall_Maintenance_Updated.md
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_current_user
from app.database import get_db
from app.models import (
    Complaint, ComplaintStatusHistory, ComplaintSupporter,
    Hall, UserRole, SLAPolicy, User
)
from app.api.dependencies import RequirePermission
from app.core.permissions import Role
from app.schemas import (
    ComplaintCreate, ComplaintResponse, ComplaintStatusHistoryResponse,
    ConfirmResolution, HallAnalytics, HallCreate, HallResponse,
    SLAPolicyResponse, SLAPolicyUpdate, StatusUpdate, VALID_TRANSITIONS,
)
from app.services.notifications import (
    notify_duplicate_merged, notify_pending_confirmation,
    notify_ticket_resolved, notify_escalation,
)

logger = logging.getLogger("complaints")

router = APIRouter(prefix="/complaints", tags=["maintenance"])
admin_router = APIRouter(prefix="/admin", tags=["maintenance-admin"])

PERSONAL_CATEGORIES = {"repair", "electrical", "plumbing"}
DUPLICATE_SIMILARITY_THRESHOLD = 0.4
DUPLICATE_WINDOW_DAYS = 14

# ---------------------------------------------------------------------------
# Helper: get hall_id for the current user
# ---------------------------------------------------------------------------

async def _get_user_hall(user_id: UUID, db: AsyncSession) -> UUID:
    result = await db.execute(
        select(User.hall_id).where(User.id == user_id)
    )
    hall_id = result.scalar_one_or_none()
    if not hall_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your account is not linked to a hall. Please update your profile.",
        )
    return hall_id


# ---------------------------------------------------------------------------
# Helper: log a status change to the audit trail
# ---------------------------------------------------------------------------

async def _log_history(
    db: AsyncSession,
    complaint_id: UUID,
    from_status: str | None,
    to_status: str,
    changed_by: UUID | None = None,
    note: str | None = None,
) -> None:
    hist = ComplaintStatusHistory(
        complaint_id=complaint_id,
        changed_by=changed_by,
        from_status=from_status,
        to_status=to_status,
        note=note,
    )
    db.add(hist)


# ---------------------------------------------------------------------------
# Halls CRUD (admin only, not behind RLS yet — use carefully)
# ---------------------------------------------------------------------------

@router.get("/halls", response_model=List[HallResponse], summary="List all halls")
async def list_halls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Hall).order_by(Hall.name))
    return result.scalars().all()


@router.post("/halls", response_model=HallResponse, status_code=status.HTTP_201_CREATED,
             summary="Create a new hall (admin)")
async def create_hall(
    payload: HallCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    hall = Hall(name=payload.name)
    db.add(hall)
    await db.commit()
    await db.refresh(hall)
    return hall


# ---------------------------------------------------------------------------
# Profile: set / update user's hall
# ---------------------------------------------------------------------------

@router.patch("/me/hall", summary="Set or update the current user's hall")
async def set_my_hall(
    hall_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    # Verify hall exists
    hall = await db.get(Hall, hall_id)
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")
    await db.execute(
        update(User).where(User.id == current_user).values(hall_id=hall_id)
    )
    await db.commit()
    return {"message": f"Hall updated to '{hall.name}'"}


# ---------------------------------------------------------------------------
# POST /complaints — submit a new issue (with deduplication)
# ---------------------------------------------------------------------------

@router.post("", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED,
             summary="Submit a maintenance complaint")
async def submit_complaint(
    payload: ComplaintCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    hall_id = await _get_user_hall(current_user, db)

    # Validate category and look up SLA policy
    sla_policy = await db.get(SLAPolicy, payload.category)
    if not sla_policy:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown category '{payload.category}'. "
                   f"Allowed: food, cleanliness, repair, electrical, plumbing, other",
        )

    # ------------------------------------------------------------------
    # Duplicate detection via pg_trgm similarity
    # ------------------------------------------------------------------
    window = datetime.now(timezone.utc) - timedelta(days=DUPLICATE_WINDOW_DAYS)
    dup_result = await db.execute(
        text("""
            SELECT id, upvote_count
            FROM complaints
            WHERE hall_id = :hall_id
              AND category = :category
              AND status NOT IN ('resolved', 'rejected')
              AND created_at >= :window
              AND similarity(description, :desc) > :threshold
            ORDER BY similarity(description, :desc) DESC
            LIMIT 1
        """),
        {
            "hall_id": str(hall_id),
            "category": payload.category,
            "window": window,
            "desc": payload.description,
            "threshold": DUPLICATE_SIMILARITY_THRESHOLD,
        },
    )
    existing = dup_result.fetchone()

    if existing:
        # Merge: upvote the existing ticket
        existing_id = existing[0]
        await db.execute(
            update(Complaint)
            .where(Complaint.id == existing_id)
            .values(upvote_count=Complaint.upvote_count + 1, updated_at=datetime.now(timezone.utc))
        )
        # Record supporter linkage (ignore if already recorded)
        try:
            db.add(ComplaintSupporter(complaint_id=existing_id, user_id=current_user))
            await db.flush()
        except Exception:
            pass  # already a supporter — harmless duplicate
        await db.commit()

        notify_duplicate_merged(str(current_user), str(existing_id))
        raise HTTPException(
            status_code=status.HTTP_200_OK,
            detail={
                "merged": True,
                "complaint_id": str(existing_id),
                "message": "A similar issue is already being tracked. Your report has been added as support.",
            },
        )

    # ------------------------------------------------------------------
    # No duplicate — create a new ticket
    # ------------------------------------------------------------------
    sla_deadline = datetime.now(timezone.utc) + timedelta(hours=sla_policy.max_hours)
    complaint = Complaint(
        hall_id=hall_id,
        reporter_id=current_user,
        category=payload.category,
        description=payload.description,
        photo_url=payload.photo_url,
        assigned_role=sla_policy.assigned_role,
        sla_deadline=sla_deadline,
    )
    db.add(complaint)
    await db.flush()  # get complaint.id before logging history

    await _log_history(db, complaint.id, None, "open", changed_by=current_user)
    await db.commit()
    await db.refresh(complaint)
    return complaint


# ---------------------------------------------------------------------------
# GET /complaints/me — student's own tickets
# ---------------------------------------------------------------------------

@router.get("/me", response_model=List[ComplaintResponse], summary="My submitted complaints")
async def my_complaints(
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    result = await db.execute(
        select(Complaint)
        .where(Complaint.reporter_id == current_user)
        .order_by(Complaint.created_at.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# GET /complaints/hall-queue — authority queue (open tickets, oldest+upvote sort)
# ---------------------------------------------------------------------------

@router.get("/hall-queue", response_model=List[ComplaintResponse],
            summary="Authority: scoped complaint queue")
async def hall_queue(
    db: AsyncSession = Depends(get_db),
    authorities: List[UserRole] = Depends(RequirePermission("MAINTENANCE_VIEW_HALL")),
):
    # Get all halls + scopes this authority has access to
    if not authorities:
        raise HTTPException(status_code=403, detail="No authority role found for this account")

    # Build a query matching their hall(s) and category scope(s)
    from sqlalchemy import or_, and_
    conditions = []
    for ha in authorities:
        if ha.category_scope:
            conditions.append(
                and_(
                    Complaint.hall_id == ha.hall_id,
                    Complaint.category.in_(ha.category_scope),
                )
            )
        else:
            conditions.append(Complaint.hall_id == ha.hall_id)

    result = await db.execute(
        select(Complaint)
        .where(
            or_(*conditions),
            Complaint.status.notin_(["resolved", "rejected"]),
            Complaint.escalation_level == 0,
        )
        .order_by(Complaint.created_at.asc(), Complaint.upvote_count.desc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# GET /complaints/escalated — higher-authority escalation inbox
# ---------------------------------------------------------------------------

@router.get("/escalated", response_model=List[ComplaintResponse],
            summary="Authority: escalated tickets inbox")
async def escalated_queue(
    db: AsyncSession = Depends(get_db),
    authorities: List[UserRole] = Depends(RequirePermission("MAINTENANCE_VIEW_HALL")),
):
    if not authorities:
        raise HTTPException(status_code=403, detail="No authority role found for this account")

    from sqlalchemy import or_, and_
    conditions = [Complaint.hall_id == ha.hall_id for ha in authorities]

    result = await db.execute(
        select(Complaint)
        .where(
            or_(*conditions),
            Complaint.escalation_level > 0,
            Complaint.status.notin_(["resolved", "rejected"]),
        )
        .order_by(Complaint.escalation_level.desc(), Complaint.sla_deadline.asc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# PATCH /complaints/{id}/status — update status (state-machine enforced)
# ---------------------------------------------------------------------------

@router.patch("/{complaint_id}/status", response_model=ComplaintResponse,
              summary="Authority/Worker: update ticket status")
async def update_status(
    complaint_id: UUID,
    payload: StatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    complaint = await db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Security: Verify if current_user has authority over this hall and category
    auth_result = await db.execute(
        select(UserRole).where(
            UserRole.user_id == current_user,
            UserRole.hall_id == complaint.hall_id
        )
    )
    authorities = auth_result.scalars().all()
    if not authorities:
        raise HTTPException(status_code=403, detail="You do not have authority in this hall.")

    # Check if any of their roles covers the ticket's category (or if they are global like SUPER_ADMIN)
    has_category_access = False
    for ha in authorities:
        if ha.role in ('SUPER_ADMIN', 'SUPER_ADMIN'):
            has_category_access = True
            break
        if ha.category_scope and complaint.category in ha.category_scope:
            has_category_access = True
            break
        if not ha.category_scope: # e.g. warden has null scope which might mean all
            has_category_access = True
            break
            
    if not has_category_access:
        raise HTTPException(status_code=403, detail="You do not have authority over this category.")

    # State-machine validation
    allowed = VALID_TRANSITIONS.get(complaint.status, set())
    if payload.status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition from '{complaint.status}' to '{payload.status}'. "
                   f"Allowed transitions: {allowed}",
        )

    old_status = complaint.status
    complaint.status = payload.status
    complaint.updated_at = datetime.now(timezone.utc)

    if payload.resolution_note:
        complaint.resolution_note = payload.resolution_note
    if payload.status in ("pending_confirmation", "resolved"):
        complaint.resolved_by = current_user
        complaint.resolution_submitted_at = datetime.now(timezone.utc)

    await _log_history(db, complaint.id, old_status, payload.status,
                       changed_by=current_user, note=payload.note or payload.resolution_note)

    # Notifications
    if payload.status == "pending_confirmation":
        notify_pending_confirmation(str(complaint.reporter_id), str(complaint.id))
    elif payload.status == "resolved" and complaint.category not in PERSONAL_CATEGORIES:
        # Gather all reporter + supporter IDs for general issue notification
        sup_result = await db.execute(
            select(ComplaintSupporter.user_id).where(ComplaintSupporter.complaint_id == complaint.id)
        )
        supporter_ids = [str(r) for r in sup_result.scalars().all()]
        notify_ticket_resolved([str(complaint.reporter_id)] + supporter_ids, str(complaint.id))

    await db.commit()
    await db.refresh(complaint)
    return complaint


# ---------------------------------------------------------------------------
# POST /complaints/{id}/confirm — student confirms or rejects resolution
# ---------------------------------------------------------------------------

@router.post("/{complaint_id}/confirm", response_model=ComplaintResponse,
             summary="Student: confirm or reject worker resolution")
async def confirm_resolution(
    complaint_id: UUID,
    payload: ConfirmResolution,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    complaint = await db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    if complaint.status != "pending_confirmation":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Ticket is not awaiting confirmation.",
        )
    if complaint.reporter_id != current_user:
        raise HTTPException(status_code=403, detail="Only the original reporter can confirm resolution.")

    old_status = complaint.status
    new_status = "resolved" if payload.confirmed else "reopened"
    complaint.status = new_status
    complaint.updated_at = datetime.now(timezone.utc)
    complaint.student_confirmation_at = datetime.now(timezone.utc)
    complaint.student_confirmation_note = payload.note

    await _log_history(db, complaint.id, old_status, new_status,
                       changed_by=current_user, note=payload.note)
    await db.commit()
    await db.refresh(complaint)
    return complaint


# ---------------------------------------------------------------------------
# GET /complaints/{id}/history — full audit trail
# ---------------------------------------------------------------------------

@router.get("/{complaint_id}/history", response_model=List[ComplaintStatusHistoryResponse],
            summary="Full audit trail for a ticket")
async def complaint_history(
    complaint_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    complaint = await db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    # Security: Only reporter, supporter, or authority can view history
    can_view = False
    if complaint.reporter_id == current_user:
        can_view = True
    else:
        # Check if supporter
        sup_result = await db.execute(
            select(ComplaintSupporter).where(
                ComplaintSupporter.complaint_id == complaint_id,
                ComplaintSupporter.user_id == current_user
            )
        )
        if sup_result.scalar_one_or_none():
            can_view = True
        else:
            # Check if authority
            auth_result = await db.execute(
                select(UserRole).where(
                    UserRole.user_id == current_user,
                    UserRole.hall_id == complaint.hall_id
                )
            )
            if auth_result.scalars().first():
                can_view = True

    if not can_view:
        raise HTTPException(status_code=403, detail="Not authorized to view this ticket's history")

    result = await db.execute(
        select(ComplaintStatusHistory)
        .where(ComplaintStatusHistory.complaint_id == complaint_id)
        .order_by(ComplaintStatusHistory.created_at.asc())
    )
    return result.scalars().all()


# ---------------------------------------------------------------------------
# GET /admin/analytics/hall/{hall_id} — aggregate stats
# ---------------------------------------------------------------------------

@admin_router.get("/analytics/hall/{hall_id}", response_model=HallAnalytics,
                  summary="Institute-level aggregate analytics for a hall")
async def hall_analytics(
    hall_id: UUID,
    db: AsyncSession = Depends(get_db),
    authorities: List[UserRole] = Depends(RequirePermission("MAINTENANCE_ANALYTICS_VIEW")),
):
    # RequirePermission handles the role validation (SUPER_ADMIN)

    hall = await db.get(Hall, hall_id)
    if not hall:
        raise HTTPException(status_code=404, detail="Hall not found")

    counts = await db.execute(
        select(
            func.count().filter(Complaint.status == "open").label("open_count"),
            func.count().filter(Complaint.status == "in_progress").label("in_progress_count"),
            func.count().filter(Complaint.status == "resolved").label("resolved_count"),
            func.count().filter(Complaint.escalation_level > 0).label("escalated_count"),
            func.avg(
                func.extract("epoch", Complaint.student_confirmation_at - Complaint.created_at) / 3600
            ).filter(Complaint.status == "resolved").label("avg_resolution_hours"),
        ).where(Complaint.hall_id == hall_id)
    )
    row = counts.one()
    return HallAnalytics(
        hall_id=hall_id,
        hall_name=hall.name,
        open_count=row.open_count or 0,
        in_progress_count=row.in_progress_count or 0,
        resolved_count=row.resolved_count or 0,
        escalated_count=row.escalated_count or 0,
        avg_resolution_hours=row.avg_resolution_hours,
    )


# ---------------------------------------------------------------------------
# GET+PATCH /admin/sla-policies — view/update SLA thresholds
# ---------------------------------------------------------------------------

@admin_router.get("/sla-policies", response_model=List[SLAPolicyResponse],
                  summary="List all SLA policies")
async def get_sla_policies(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SLAPolicy).order_by(SLAPolicy.category))
    return result.scalars().all()


@admin_router.patch("/sla-policies/{category}", response_model=SLAPolicyResponse,
                    summary="Update SLA max_hours for a category")
async def update_sla_policy(
    category: str,
    payload: SLAPolicyUpdate,
    db: AsyncSession = Depends(get_db),
    authorities: List[UserRole] = Depends(RequirePermission("MAINTENANCE_SLA_EDIT")),
):
    # RequirePermission handles the role validation

    policy = await db.get(SLAPolicy, category)
    if not policy:
        raise HTTPException(status_code=404, detail=f"No SLA policy for category '{category}'")
    policy.max_hours = payload.max_hours
    await db.commit()
    await db.refresh(policy)
    return policy
