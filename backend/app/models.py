from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Table, Text, Index
from sqlalchemy.orm import relationship
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


# Many-to-many relationship table for automations and sectors
automation_permissions = Table(
    'automation_permissions',
    Base.metadata,
    Column('automation_id', Integer, ForeignKey('automations.id'), primary_key=True),
    Column('sector_id', Integer, ForeignKey('sectors.id'), primary_key=True)
)

# Many-to-many relationship table for users and automations (direct access)
user_automation_permissions = Table(
    'user_automation_permissions',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('automation_id', Integer, ForeignKey('automations.id'), primary_key=True)
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
    role = Column(String(50), default="user")  # user, manager, analyst, sector_admin, admin
    is_active = Column(Boolean, default=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Suporte nativo ao Postgres JSONB para alto desempenho
    preferences = Column(JSONB, nullable=True, default={})

    # Relationships
    sector = relationship("Sector", back_populates="users")
    extra_automations = relationship(
        "Automation",
        secondary=user_automation_permissions,
        back_populates="users_with_access"
    )
    audit_logs = relationship("AuditLog", back_populates="user")

    @hybrid_property
    def name(self) -> str:
        return self.full_name

    @hybrid_property
    def status(self) -> str:
        return "active" if self.is_active else "inactive"


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
    
    # Suporte nativo ao Postgres JSONB para alto desempenho
    config = Column(JSONB, nullable=True, default={})

    # Relationships
    sectors = relationship(
        "Sector",
        secondary=automation_permissions,
        back_populates="automations"
    )
    users_with_access = relationship(
        "User",
        secondary=user_automation_permissions,
        back_populates="extra_automations"
    )
    audit_logs = relationship("AuditLog", back_populates="automation")

    @hybrid_property
    def name(self) -> str:
        return self.title

    @hybrid_property
    def status(self) -> str:
        return "active" if self.is_active else "inactive"


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_occurred_at", "occurred_at"),
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_user_sector_id", "user_sector_id"),
        Index("ix_audit_logs_automation_id", "automation_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user_sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    automation_id = Column(Integer, ForeignKey("automations.id"), nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="audit_logs")
    automation = relationship("Automation", back_populates="audit_logs")
