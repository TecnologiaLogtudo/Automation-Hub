from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Automation, AccessRequest
from app.schemas import AutomationCreate, AutomationResponse, AutomationUpdate
from app.auth import get_current_user, get_current_admin

router = APIRouter(prefix="/automations", tags=["automations"])


def _user_has_access(user: User, automation: Automation) -> bool:
    if user.is_admin or user.role in {"manager", "analyst"}:
        return True

    sector_ids = {sector.id for sector in automation.sectors}
    if user.sector_id in sector_ids:
        return True

    user_ids = {allowed_user.id for allowed_user in automation.users_with_access}
    return user.id in user_ids


def _serialize_automation(
    automation: Automation,
    has_access: bool,
    access_request_status: Optional[str] = None,
) -> AutomationResponse:
    return AutomationResponse(
        id=automation.id,
        title=automation.title,
        description=automation.description,
        target_url=automation.target_url,
        icon=automation.icon,
        is_active=automation.is_active,
        name=automation.name,
        status=automation.status,
        created_at=automation.created_at,
        updated_at=automation.updated_at,
        config=automation.config,
        sectors=automation.sectors,
        has_access=has_access,
        access_request_status=access_request_status,
    )


@router.get("", response_model=List[AutomationResponse])
def get_automations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get automations available for the current user's sector.
    Regular users see only automations their sector has access to.
    Admins see all automations.
    """
    if current_user.is_admin:
        automations = db.query(Automation).all()
        return [_serialize_automation(item, has_access=True) for item in automations]

    if current_user.role in ["manager", "analyst"]:
        automations = db.query(Automation).filter(Automation.is_active == True).all()
        return [_serialize_automation(item, has_access=True) for item in automations]

    # Regular users see every active automation, with access metadata.
    automations = (
        db.query(Automation)
        .filter(Automation.is_active == True)
        .all()
    )

    latest_requests = (
        db.query(AccessRequest)
        .filter(AccessRequest.requester_user_id == current_user.id)
        .order_by(AccessRequest.automation_id.asc(), desc(AccessRequest.requested_at))
        .all()
    )
    status_by_automation: Dict[int, str] = {}
    for request in latest_requests:
        status_by_automation.setdefault(request.automation_id, request.status)

    response_items: List[AutomationResponse] = []
    for item in automations:
        has_access = _user_has_access(current_user, item)
        response_items.append(
            _serialize_automation(
                item,
                has_access=has_access,
                access_request_status=None if has_access else status_by_automation.get(item.id),
            )
        )
    return response_items


@router.get("/{automation_id}", response_model=AutomationResponse)
def get_automation(
    automation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific automation by ID"""
    automation = db.query(Automation).filter(Automation.id == automation_id).first()
    
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found"
        )
    
    # Check if user has access to this automation
    if not _user_has_access(current_user, automation):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this automation"
        )
    
    return _serialize_automation(automation, has_access=True)


@router.post("", response_model=AutomationResponse, status_code=status.HTTP_201_CREATED)
def create_automation(
    automation: AutomationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Create a new automation (Admin only)"""
    # Create automation
    db_automation = Automation(
        title=automation.title,
        description=automation.description,
        target_url=automation.target_url,
        icon=automation.icon,
        is_active=automation.is_active,
        config=automation.config
    )
    db.add(db_automation)
    db.flush()  # Get the ID before adding sectors
    
    # Add sector permissions
    if automation.sector_ids:
        sectors = db.query(Sector).filter(Sector.id.in_(automation.sector_ids)).all()
        db_automation.sectors = sectors
    
    db.commit()
    db.refresh(db_automation)
    
    return db_automation


@router.put("/{automation_id}", response_model=AutomationResponse)
def update_automation(
    automation_id: int,
    automation_update: AutomationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Update an automation (Admin only)"""
    automation = db.query(Automation).filter(Automation.id == automation_id).first()
    
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found"
        )
    
    # Update fields
    update_data = automation_update.model_dump(exclude_unset=True)
    
    # Handle sector_ids separately
    sector_ids = update_data.pop("sector_ids", None)
    
    for field, value in update_data.items():
        setattr(automation, field, value)
    
    # Update sector permissions if provided
    if sector_ids is not None:
        sectors = db.query(Sector).filter(Sector.id.in_(sector_ids)).all()
        automation.sectors = sectors
    
    db.commit()
    db.refresh(automation)
    
    return automation


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_automation(
    automation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Delete an automation (Admin only)"""
    automation = db.query(Automation).filter(Automation.id == automation_id).first()
    
    if not automation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Automation not found"
        )
    
    db.delete(automation)
    db.commit()
    
    return None
