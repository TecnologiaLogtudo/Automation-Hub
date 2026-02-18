from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict


# ============ Sector Schemas ============
class SectorBase(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None


class SectorCreate(SectorBase):
    pass


class SectorResponse(SectorBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ============ User Schemas ============
class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    is_admin: bool = False
    sector_id: int


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_admin: Optional[bool] = None
    sector_id: Optional[int] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_admin: bool
    is_active: bool
    sector_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserWithSector(UserResponse):
    sector: Optional[SectorResponse] = None

    model_config = ConfigDict(from_attributes=True)


# ============ Automation Schemas ============
class AutomationBase(BaseModel):
    title: str
    description: Optional[str] = None
    target_url: str
    icon: str = "robot"
    is_active: bool = True


class AutomationCreate(AutomationBase):
    sector_ids: List[int] = []


class AutomationUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    sector_ids: Optional[List[int]] = None


class AutomationResponse(AutomationBase):
    id: int
    created_at: datetime
    updated_at: datetime
    sectors: List[SectorResponse] = []

    model_config = ConfigDict(from_attributes=True)


# ============ Auth Schemas ============
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int
    email: str
    is_admin: bool
    sector_id: int


# ============ Dashboard Schemas ============
class DashboardStats(BaseModel):
    total_automations: int
    total_users: int
    total_sectors: int
