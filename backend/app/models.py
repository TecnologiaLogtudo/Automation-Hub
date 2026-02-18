from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Table
from sqlalchemy.orm import relationship

from app.database import Base


# Many-to-many relationship table for automations and sectors
automation_permissions = Table(
    'automation_permissions',
    Base.metadata,
    Column('automation_id', Integer, ForeignKey('automations.id'), primary_key=True),
    Column('sector_id', Integer, ForeignKey('sectors.id'), primary_key=True)
)


class Sector(Base):
    __tablename__ = "sectors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(50), unique=True, nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="sector")
    automations = relationship(
        "Automation",
        secondary=automation_permissions,
        back_populates="sectors"
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    sector = relationship("Sector", back_populates="users")


class Automation(Base):
    __tablename__ = "automations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(String(500), nullable=True)
    target_url = Column(String(500), nullable=False)
    icon = Column(String(100), default="robot")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    sectors = relationship(
        "Sector",
        secondary=automation_permissions,
        back_populates="automations"
    )
