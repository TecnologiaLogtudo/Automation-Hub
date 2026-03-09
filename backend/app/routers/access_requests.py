from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user, is_sector_admin
from app.database import get_db
from app.models import AccessRequest, Automation, User
from app.schemas import (
    AccessRequestCreate,
    AccessRequestDecision,
    AccessRequestResponse,
)

router = APIRouter(prefix="/access-requests", tags=["access-requests"])


def _user_has_access(user: User, automation: Automation) -> bool:
    if user.is_admin or user.role in {"manager", "analyst"}:
        return True

    sector_ids = {sector.id for sector in automation.sectors}
    if user.sector_id in sector_ids:
        return True

    user_ids = {allowed_user.id for allowed_user in automation.users_with_access}
    return user.id in user_ids


def _can_decide_request(current_user: User, access_request: AccessRequest) -> bool:
    if current_user.is_admin:
        return True
    return is_sector_admin(current_user) and current_user.sector_id == access_request.requester.sector_id


def _to_response(item: AccessRequest) -> AccessRequestResponse:
    return AccessRequestResponse(
        id=item.id,
        requester_user_id=item.requester_user_id,
        requester_user_name=item.requester.full_name,
        requester_user_email=item.requester.email,
        requester_sector_id=item.requester.sector_id,
        requester_sector_name=item.requester.sector.name if item.requester.sector else "N/A",
        automation_id=item.automation_id,
        automation_title=item.automation.title,
        status=item.status,
        requested_at=item.requested_at,
        decided_at=item.decided_at,
        decided_by_user_id=item.decided_by_user_id,
        decided_by_user_name=item.decided_by.full_name if item.decided_by else None,
        decision_note=item.decision_note,
    )


@router.post("", response_model=AccessRequestResponse, status_code=status.HTTP_201_CREATED)
def create_access_request(
    payload: AccessRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.is_admin or current_user.role in {"manager", "analyst"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your profile already has broad access and cannot request automations",
        )

    automation = db.query(Automation).filter(Automation.id == payload.automation_id).first()
    if not automation or not automation.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found",
        )

    if _user_has_access(current_user, automation):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have access to this automation",
        )

    existing_pending = (
        db.query(AccessRequest)
        .filter(AccessRequest.requester_user_id == current_user.id)
        .filter(AccessRequest.automation_id == automation.id)
        .filter(AccessRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="There is already a pending request for this automation",
        )

    access_request = AccessRequest(
        requester_user_id=current_user.id,
        automation_id=automation.id,
        status="pending",
    )
    db.add(access_request)
    db.commit()
    db.refresh(access_request)

    return _to_response(access_request)


@router.get("/mine", response_model=List[AccessRequestResponse])
def get_my_access_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = (
        db.query(AccessRequest)
        .filter(AccessRequest.requester_user_id == current_user.id)
        .order_by(AccessRequest.requested_at.desc())
        .all()
    )
    return [_to_response(item) for item in items]


@router.get("/pending", response_model=List[AccessRequestResponse])
def get_pending_access_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.is_admin and not is_sector_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access request inbox is restricted to approvers",
        )

    query = (
        db.query(AccessRequest)
        .filter(AccessRequest.status == "pending")
        .join(AccessRequest.requester)
    )
    if is_sector_admin(current_user) and not current_user.is_admin:
        query = query.filter(User.sector_id == current_user.sector_id)

    items = query.order_by(AccessRequest.requested_at.desc()).all()
    return [_to_response(item) for item in items]


@router.post("/{request_id}/approve", response_model=AccessRequestResponse)
def approve_access_request(
    request_id: int,
    payload: AccessRequestDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    access_request = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not access_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found",
        )

    if not _can_decide_request(current_user, access_request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to decide this request",
        )

    if access_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be approved",
        )

    automation = access_request.automation
    requester = access_request.requester
    if requester not in automation.users_with_access:
        automation.users_with_access.append(requester)

    access_request.status = "approved"
    access_request.decided_at = datetime.utcnow()
    access_request.decided_by_user_id = current_user.id
    access_request.decision_note = payload.decision_note

    db.commit()
    db.refresh(access_request)

    return _to_response(access_request)


@router.post("/{request_id}/reject", response_model=AccessRequestResponse)
def reject_access_request(
    request_id: int,
    payload: AccessRequestDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    access_request = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not access_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Access request not found",
        )

    if not _can_decide_request(current_user, access_request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to decide this request",
        )

    if access_request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be rejected",
        )

    access_request.status = "rejected"
    access_request.decided_at = datetime.utcnow()
    access_request.decided_by_user_id = current_user.id
    access_request.decision_note = payload.decision_note

    db.commit()
    db.refresh(access_request)

    return _to_response(access_request)
