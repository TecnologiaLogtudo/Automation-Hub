from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict, field_validator


VALID_USER_ROLES = {"user", "manager", "analyst", "admin", "sector_admin"}


# ============ Sector Schemas ============
class SectorBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None


class SectorCreate(SectorBase):
    pass


class SectorUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None

class SectorResponse(SectorBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_validator('description', mode='before')
    @classmethod
    def set_description_default(cls, v):
        return v or ""


# ============ Automation Schemas (Moved Up) ============
class AutomationBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_url: str
    icon: str = "robot"
    is_active: bool = True

# ============ User Schemas ============
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_admin: bool = False
    role: str = "user"
    sector_id: int

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_USER_ROLES:
            raise ValueError(f"Invalid role. Allowed: {', '.join(sorted(VALID_USER_ROLES))}")
        return v


class UserCreate(UserBase):
    password: str
    automation_ids: List[int] = []
    preferences: Optional[dict] = None


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_admin: Optional[bool] = None
    sector_id: Optional[int] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
    automation_ids: Optional[List[int]] = None
    preferences: Optional[dict] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_USER_ROLES:
            raise ValueError(f"Invalid role. Allowed: {', '.join(sorted(VALID_USER_ROLES))}")
        return v


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    name: str # Populated from model hybrid_property
    status: str # Populated from model hybrid_property
    is_admin: bool
    role: str
    is_active: bool
    sector_id: int
    created_at: datetime
    preferences: Optional[dict] = None # Populated from model property
    extra_automations: List[AutomationBase] = []

    model_config = ConfigDict(from_attributes=True)


class UserWithSector(UserResponse):
    sector: Optional[SectorResponse] = None

    model_config = ConfigDict(from_attributes=True)


class AutomationCreate(AutomationBase):
    sector_ids: List[int] = []
    config: Optional[dict] = None


class AutomationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    sector_ids: Optional[List[int]] = None
    config: Optional[dict] = None


class AutomationResponse(AutomationBase):
    id: int
    name: str # Populated from model hybrid_property
    status: str # Populated from model hybrid_property
    created_at: datetime
    updated_at: datetime
    config: Optional[dict] = None # Populated from model property
    sectors: List[SectorResponse] = []

    model_config = ConfigDict(from_attributes=True)

    @field_validator('description', mode='before')
    @classmethod
    def set_description_default(cls, v):
        return v or ""


# ============ Auth Schemas ============
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None
    is_admin: Optional[bool] = None
    sector_id: Optional[int] = None


# ============ Dashboard Schemas ============
class DashboardStats(BaseModel):
    total_automations: int
    total_users: int
    total_sectors: int


# ============ Audit Schemas ============
class AuditAccessCreate(BaseModel):
    automation_id: int


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    user_email: str
    user_sector_id: int
    user_sector_name: str
    automation_id: int
    automation_title: str
    occurred_at: datetime


class PaginatedAuditLogsResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
