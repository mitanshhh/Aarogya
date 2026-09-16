from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.services.redistribution_service import generate_redistribution_plan

router = APIRouter()

@router.get("/")
def get_redistribution_plan(
    district_id: int = None,
    nation_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.DISTRICT_ADMIN, UserRole.NATION_ADMIN, UserRole.DEVELOPER]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    # NATION_ADMIN can see nation-wide (if nation_id provided)
    if current_user.role == UserRole.NATION_ADMIN and nation_id:
        transfers = generate_redistribution_plan(db, nation_id=nation_id)
    # DISTRICT_ADMIN can only see their district
    elif current_user.role == UserRole.DISTRICT_ADMIN:
        # Assuming current_user.hospital.district_id is available or just take param
        transfers = generate_redistribution_plan(db, district_id=district_id or current_user.hospital.district_id)
    else:
        # Fallback for demo
        transfers = generate_redistribution_plan(db, district_id=district_id, nation_id=nation_id)
        
    return {"transfers": transfers}
