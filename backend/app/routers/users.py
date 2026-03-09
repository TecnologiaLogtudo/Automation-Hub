from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Sector, Automation
from app.schemas import UserCreate, UserResponse, UserUpdate
from app.auth import (
    get_current_user,
    get_current_user_manager,
    get_password_hash,
    verify_password,
    is_sector_admin,
)
from app.schemas import ChangePasswordRequest, MessageResponse

router = APIRouter(prefix="/users", tags=["users"])


def _assert_can_manage_target(current_user: User, target_user: User):
    """Ensure manager can manage the target user."""
    if current_user.is_admin:
        return

    if target_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot manage global admin users"
        )

    if target_user.sector_id != current_user.sector_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only manage users in your own sector"
        )


@router.get("", response_model=List[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_manager)
):
    """Get users visible to manager."""
    if current_user.is_admin:
        users = db.query(User).all()
    else:
        users = (
            db.query(User)
            .filter(User.sector_id == current_user.sector_id)
            .filter(User.is_admin == False)
            .all()
        )
    return users


@router.get("/me", response_model=UserResponse)
def get_my_profile(current_user: User = Depends(get_current_user)):
    """Get current user's profile"""
    return current_user


@router.post("/me/change-password", response_model=MessageResponse)
def change_my_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow an authenticated user to change their own password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password",
        )

    current_user.password_hash = get_password_hash(payload.new_password)
    db.commit()

    return MessageResponse(message="Password updated successfully")


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_manager)
):
    """Get a specific user by ID if manager can access it."""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    _assert_can_manage_target(current_user, user)
    
    return user


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_manager)
):
    """Create a new user with scope restrictions for sector admins."""
    if user.role == "admin" and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role 'admin' requires is_admin=true"
        )

    if is_sector_admin(current_user):
        if user.is_admin:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot create global admin users"
            )
        if user.sector_id != current_user.sector_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only create users in your own sector"
            )

    # Check if email already exists
    existing_user = db.query(User).filter(User.email == user.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check if sector exists
    sector = db.query(Sector).filter(Sector.id == user.sector_id).first()
    if not sector:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sector not found"
        )
    
    # Create user
    db_user = User(
        email=user.email,
        full_name=user.full_name,
        password_hash=get_password_hash(user.password),
        is_admin=user.is_admin,
        role=user.role,
        sector_id=user.sector_id,
        preferences=user.preferences
    )

    if user.automation_ids:
        automations = db.query(Automation).filter(Automation.id.in_(user.automation_ids)).all()
        db_user.extra_automations = automations

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_manager)
):
    """Update a user with scope restrictions for sector admins."""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    _assert_can_manage_target(current_user, user)
    
    # Update fields
    update_data = user_update.model_dump(exclude_unset=True)
    
    # Handle automation_ids separately
    automation_ids = update_data.pop("automation_ids", None)

    if is_sector_admin(current_user):
        if "is_admin" in update_data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot change admin privileges"
            )
        if "sector_id" in update_data and update_data["sector_id"] != user.sector_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot move users across sectors"
            )

    if "role" in update_data:
        next_is_admin = update_data.get("is_admin", user.is_admin)
        if update_data["role"] == "admin" and not next_is_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role 'admin' requires is_admin=true"
            )
    elif "is_admin" in update_data and update_data["is_admin"] and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="is_admin=true requires role='admin'"
        )

    # Check if email is being updated and if it's already taken
    if "email" in update_data and update_data["email"] != user.email:
        existing_user = db.query(User).filter(User.email == update_data["email"]).first()
        if existing_user:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
    
    # If password is being updated, hash it
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    
    for field, value in update_data.items():
        setattr(user, field, value)
    
    # Update extra automations if provided
    if automation_ids is not None:
        automations = db.query(Automation).filter(Automation.id.in_(automation_ids)).all()
        user.extra_automations = automations

    db.commit()
    db.refresh(user)
    
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_manager)
):
    """Delete a user with scope restrictions for sector admins."""
    # Prevent deleting yourself
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    _assert_can_manage_target(current_user, user)
    
    db.delete(user)
    db.commit()
    
    return None
