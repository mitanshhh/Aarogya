from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.forecast import MedicineForecast
from app.services.forecasting_service import generate_forecasts

router = APIRouter()

@router.get("/{hospital_id}")
def get_forecasts(
    hospital_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Basic role check
    if current_user.role not in [UserRole.NATION_ADMIN, UserRole.DISTRICT_ADMIN, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    forecasts = db.query(MedicineForecast).filter(MedicineForecast.hospital_id == hospital_id).all()
    
    # We serialize the forecast
    return [
        {
            "id": f.id,
            "item_id": f.item_id,
            "projected_stockout_date": f.projected_stockout_date.isoformat() if f.projected_stockout_date else None,
            "confidence": f.confidence,
            "generated_at": f.generated_at.isoformat() if f.generated_at else None
        }
        for f in forecasts
    ]

@router.post("/trigger")
def trigger_forecast_generation(
    hospital_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.NATION_ADMIN, UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    generate_forecasts(db, hospital_id)
    return {"status": "success", "message": "Forecasts generated"}
