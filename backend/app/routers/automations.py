from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Automation, Sector
from app.schemas import AutomationCreate, AutomationResponse, AutomationUpdate
from app.auth import get_current_user, get_current_admin

router = APIRouter(prefix="/automations", tags=["automations"])


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
    if current_user.is_admin or current_user.role in ["manager", "analyst"]:
        # Admins, Managers and Analysts see all automations
        automations = db.query(Automation).filter(Automation.is_active == True).all()
    else:
        # 1. Automations from sector
        sector_automations = (
            db.query(Automation)
            .join(Automation.sectors)
            .filter(Sector.id == current_user.sector_id)
            .filter(Automation.is_active == True)
        )
        
        # 2. Automations assigned directly to user (Bonus)
        user_automations = (
            db.query(Automation)
            .join(Automation.users_with_access)
            .filter(User.id == current_user.id)
            .filter(Automation.is_active == True)
        )
        
        # Union of both sets
        automations = sector_automations.union(user_automations).all()
    
    return automations


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
    if not current_user.is_admin and current_user.role not in ["manager", "analyst"]:
        sector_ids = [s.id for s in automation.sectors]
        user_ids = [u.id for u in automation.users_with_access]
        
        if current_user.sector_id not in sector_ids and current_user.id not in user_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this automation"
            )
    
    return automation


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
        is_active=automation.is_active
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
