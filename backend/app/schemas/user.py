from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models.user import UserRole

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole
    hospital_id: Optional[int] = None
    nation_id: Optional[int] = None

class UserCreate(UserBase):
    password: Optional[str] = None # Optional because admins can generate one

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    created_at: datetime
    hospital_name: Optional[str] = None

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
