from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List

from app.db.database import get_db
from app.core.security import get_password_hash
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.api.dependencies import get_current_user, require_role, resolve_hospital_id
import secrets
import string

router = APIRouter()

def generate_random_password(length=12):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(alphabet) for i in range(length))

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("", response_model=List[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    if current_user.role in [UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
        if hospital_id:
            return db.query(User).filter(User.hospital_id == hospital_id).all()
        return db.query(User).all()
    
    return db.query(User).filter(User.hospital_id == current_user.hospital_id).all()

@router.post("", response_model=UserResponse)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    # Auto-assign hospital_id if creating as MEDICAL_OFFICER
    if current_user.role == UserRole.MEDICAL_OFFICER:
        user_in.hospital_id = current_user.hospital_id

    # Check if username or email exists
    if db.query(User).filter(User.username == user_in.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(User).filter(User.email == user_in.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    # Only District Admin/Developer can assign to other hospitals or create other District Admins
    if current_user.role not in [UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
        if user_in.hospital_id != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Cannot create users for other hospitals")
        if user_in.role in [UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
            raise HTTPException(status_code=403, detail="Cannot create admin roles")

    pwd = user_in.password if user_in.password else generate_random_password()
    hashed = get_password_hash(pwd)

    new_user = User(
        username=user_in.username,
        email=user_in.email,
        role=user_in.role,
        hospital_id=user_in.hospital_id,
        hashed_password=hashed
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role not in [UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
        if target_user.hospital_id != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Cannot modify users from other hospitals")

    if user_in.email:
        target_user.email = user_in.email
    if user_in.username:
        target_user.username = user_in.username
    if user_in.role:
        target_user.role = user_in.role
    if user_in.password:
        target_user.hashed_password = get_password_hash(user_in.password)

    db.commit()
    db.refresh(target_user)
    return target_user

@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_user.role not in [UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
        if target_user.hospital_id != current_user.hospital_id:
            raise HTTPException(status_code=403, detail="Cannot delete users from other hospitals")

    db.delete(target_user)
    db.commit()
    return {"message": "User deleted successfully"}
