from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import timedelta, datetime, timezone
import uuid

from app.db.database import get_db
from app.core.security import verify_password, create_access_token
from app.models.user import User, RefreshToken
from app.schemas.user import Token
from app.core.config import settings
from app.core.rate_limit import limiter

router = APIRouter()

@router.post("/login", response_model=Token)
@limiter.limit("5/minute")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    ip = request.client.host

    clean_username = form_data.username.strip().lower()
    user = db.query(User).filter(
        or_(func.lower(User.username) == clean_username, func.lower(User.email) == clean_username)
    ).first()
    if not user or not verify_password(form_data.password.strip(), user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 15 mins for access token
    access_token_expires = timedelta(minutes=15)
    access_token = create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )

    # 7 days for refresh token
    refresh_token_str = str(uuid.uuid4())
    refresh_expires = datetime.now(timezone.utc) + timedelta(days=7)
    
    db_refresh_token = RefreshToken(
        token=refresh_token_str,
        user_id=user.id,
        expires_at=refresh_expires
    )
    db.add(db_refresh_token)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token_str,
        "token_type": "bearer"
    }

@router.post("/refresh", response_model=Token)
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    db_token = db.query(RefreshToken).filter(
        RefreshToken.token == refresh_token,
        RefreshToken.revoked == False
    ).first()

    # Need naive datetime conversion for SQLite if testing locally, but Neon is postgres so timezone aware is fine
    if not db_token or db_token.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    # Issue new access token
    access_token = create_access_token(subject=db_token.user_id, expires_delta=timedelta(minutes=15))
    
    # Issue new refresh token & revoke old one (rotation)
    db_token.revoked = True
    
    new_refresh_str = str(uuid.uuid4())
    new_refresh_expires = datetime.now(timezone.utc) + timedelta(days=7)
    new_db_token = RefreshToken(
        token=new_refresh_str,
        user_id=db_token.user_id,
        expires_at=new_refresh_expires
    )
    db.add(new_db_token)
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_str,
        "token_type": "bearer"
    }

@router.post("/logout")
def logout(refresh_token: str, db: Session = Depends(get_db)):
    db_token = db.query(RefreshToken).filter(RefreshToken.token == refresh_token).first()
    if db_token:
        db_token.revoked = True
        db.commit()
    return {"msg": "Successfully logged out"}
