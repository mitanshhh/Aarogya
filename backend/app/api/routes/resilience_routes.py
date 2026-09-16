from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.services.emergency_service import get_resilience_index, toggle_emergency_mode, get_emergency_status

router = APIRouter()

@router.get("/status")
def get_resilience_status(
    nation_id: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    index = get_resilience_index(db, nation_id)
    is_emergency = get_emergency_status(db, nation_id)
    
    return {
        "resilience_index": index,
        "is_emergency_mode": is_emergency,
        "status_label": "Critical" if index < 40 else "Warning" if index < 70 else "Healthy"
    }

@router.post("/toggle")
def toggle_emergency(
    active: bool,
    nation_id: int = 1,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.NATION_ADMIN, UserRole.DEVELOPER]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    status = toggle_emergency_mode(db, nation_id, active)
    return {"status": "success", "is_emergency_mode": status}
