from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AuditLog, Automation, User
from app.schemas import AuditAccessCreate, AuditLogResponse, PaginatedAuditLogsResponse

router = APIRouter(prefix="/audit", tags=["audit"])


def _user_can_access_automation(current_user: User, automation: Automation) -> bool:
    """Apply the same access rules used by automation access endpoints."""
    if current_user.is_admin or current_user.role in {"manager", "analyst"}:
        return True

    sector_ids = {sector.id for sector in automation.sectors}
    if current_user.sector_id in sector_ids:
        return True

    user_ids = {user.id for user in automation.users_with_access}
    return current_user.id in user_ids


def _map_audit_log(row: AuditLog) -> AuditLogResponse:
    return AuditLogResponse(
        id=row.id,
        user_id=row.user_id,
        user_name=row.user.full_name,
        user_email=row.user.email,
        user_sector_id=row.user_sector_id,
        user_sector_name=row.user.sector.name if row.user and row.user.sector else "N/A",
        automation_id=row.automation_id,
        automation_title=row.automation.title,
        occurred_at=row.occurred_at,
    )


@router.post("/access", response_model=AuditLogResponse, status_code=status.HTTP_201_CREATED)
def track_automation_access(
    payload: AuditAccessCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register an automation access event for the current user."""
    automation = db.query(Automation).filter(Automation.id == payload.automation_id).first()
    if not automation or not automation.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    if not _user_can_access_automation(current_user, automation):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this automation",
        )

    event = AuditLog(
        user_id=current_user.id,
        user_sector_id=current_user.sector_id,
        automation_id=automation.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return _map_audit_log(event)


@router.get("/logs", response_model=PaginatedAuditLogsResponse)
def get_audit_logs(
    start_date: Optional[datetime] = Query(default=None),
    end_date: Optional[datetime] = Query(default=None),
    user_id: Optional[int] = Query(default=None),
    automation_id: Optional[int] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return paginated audit logs with role-based scope filtering."""
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date must be less than or equal to end_date",
        )

    can_view_global = current_user.is_admin or current_user.role == "manager"
    can_view_sector = current_user.role == "sector_admin"

    if not can_view_global and not can_view_sector:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Audit log access denied",
        )

    query = db.query(AuditLog).join(AuditLog.user).join(AuditLog.automation)

    if can_view_sector and not can_view_global:
        query = query.filter(AuditLog.user_sector_id == current_user.sector_id)

    if start_date:
        query = query.filter(AuditLog.occurred_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.occurred_at <= end_date)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if automation_id:
        query = query.filter(AuditLog.automation_id == automation_id)

    total = query.count()
    items = (
        query.order_by(AuditLog.occurred_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return PaginatedAuditLogsResponse(
        items=[_map_audit_log(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
