from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.api.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.federation import FederatedModelVersion
from app.services.forecasting_service import AGGREGATOR_URL
import requests
import json

router = APIRouter()

@router.get("/status")
def get_federation_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.NATION_ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    try:
        resp = requests.get(f"{AGGREGATOR_URL}/status", timeout=5)
        agg_status = resp.json() if resp.status_code == 200 else {}
    except:
        agg_status = {"error": "Aggregator unreachable"}
        
    # Get local models overview
    local_models = db.query(FederatedModelVersion).order_by(FederatedModelVersion.created_at.desc()).limit(50).all()
    
    models_data = []
    for m in local_models:
        models_data.append({
            "id": m.id,
            "category": m.category,
            "local_mae": m.local_mae,
            "global_mae": m.global_mae,
            "improvement": (m.local_mae - m.global_mae) if m.global_mae and m.local_mae else 0,
            "created_at": m.created_at.isoformat() if m.created_at else None
        })
        
    return {
        "aggregator": agg_status,
        "models": models_data
    }
