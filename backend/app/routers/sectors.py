from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, Sector
from app.schemas import SectorCreate, SectorResponse, SectorUpdate
from app.auth import get_current_user, get_current_admin

router = APIRouter(prefix="/sectors", tags=["sectors"])


@router.get("", response_model=List[SectorResponse])
def get_sectors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all sectors"""
    sectors = db.query(Sector).all()
    return sectors


@router.get("/{sector_id}", response_model=SectorResponse)
def get_sector(
    sector_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific sector by ID"""
    sector = db.query(Sector).filter(Sector.id == sector_id).first()
    
    if not sector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector not found"
        )
    
    return sector


@router.post("", response_model=SectorResponse, status_code=status.HTTP_201_CREATED)
def create_sector(
    sector: SectorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Create a new sector (Admin only)"""
    # Check if slug already exists
    existing_sector = db.query(Sector).filter(Sector.slug == sector.slug).first()
    if existing_sector:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sector slug already exists"
        )
    
    # Create sector
    db_sector = Sector(
        name=sector.name,
        slug=sector.slug,
        description=sector.description
    )
    db.add(db_sector)
    db.commit()
    db.refresh(db_sector)
    
    return db_sector


@router.put("/{sector_id}", response_model=SectorResponse)
def update_sector(
    sector_id: int,
    sector_update: SectorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Update a sector (Admin only)"""
    sector = db.query(Sector).filter(Sector.id == sector_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sector not found")

    if sector_update.slug and sector_update.slug != sector.slug:
        existing = db.query(Sector).filter(Sector.slug == sector_update.slug).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sector slug already exists")

    for key, value in sector_update.model_dump(exclude_unset=True).items():
        setattr(sector, key, value)

    db.commit()
    db.refresh(sector)
    return sector

@router.delete("/{sector_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sector(
    sector_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    """Delete a sector (Admin only)"""
    sector = db.query(Sector).filter(Sector.id == sector_id).first()
    
    if not sector:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sector not found"
        )
    
    # Check if there are users in this sector
    users_count = db.query(User).filter(User.sector_id == sector_id).count()
    if users_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete sector with users. Reassign users first."
        )
    
    db.delete(sector)
    db.commit()
    
    return None
