from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
from app.db.database import get_db
from app.models.inventory import ForecastCache
from app.core.rate_limit import limiter
from fastapi import Request
import joblib
import os
import pandas as pd
from datetime import datetime, timedelta

router = APIRouter()

# Global variables for models
LGB_MODEL = None
XGB_MODEL = None
MODELS_LOADED = False

def load_models():
    global LGB_MODEL, XGB_MODEL, MODELS_LOADED
    if MODELS_LOADED:
        return
        
    try:
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../ml_models"))
        lgb_path = os.path.join(base_path, "lightgbm_model.pkl")
        xgb_path = os.path.join(base_path, "xgboost_model.pkl")
        
        if os.path.exists(lgb_path):
            LGB_MODEL = joblib.load(lgb_path)
        if os.path.exists(xgb_path):
            XGB_MODEL = joblib.load(xgb_path)
            
        MODELS_LOADED = True
        print("ML Models loaded successfully")
    except Exception as e:
        print(f"Failed to load ML models: {e}")

@router.on_event("startup")
async def startup_event():
    load_models()

def calculate_and_save_forecast(hospital_id: int, db: Session, days: int = 7):
    load_models()
    if not XGB_MODEL or not LGB_MODEL:
        raise Exception("ML Models not available")

    items = db.execute(text("SELECT id, name, category, quantity FROM inventory_items WHERE hospital_id = :hid"), {"hid": hospital_id}).fetchall()
    if not items:
        return []

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=45)
    
    logs = db.execute(text("""
        SELECT inventory_id, DATE(timestamp) as date, SUM(ABS(change_amount)) as demand
        FROM inventory_logs
        WHERE inventory_id IN (SELECT id FROM inventory_items WHERE hospital_id = :hid)
          AND change_type = 'DISPENSE'
          AND timestamp >= :start_date
        GROUP BY inventory_id, DATE(timestamp)
    """), {"hid": hospital_id, "start_date": start_date}).fetchall()
    
    footfall = db.execute(text("""
        SELECT DATE(admitted_at) as date, COUNT(*) as daily_footfall
        FROM patients
        WHERE hospital_id = :hid AND admitted_at >= :start_date
        GROUP BY DATE(admitted_at)
    """), {"hid": hospital_id, "start_date": start_date}).fetchall()
    
    footfall_dict = {f.date: f.daily_footfall for f in footfall}
    
    results = []
    
    for item in items:
        item_logs = {l.date: l.demand for l in logs if l.inventory_id == item.id}
        current_date = end_date
        forecast_timeline = []
        
        history_demand = [item_logs.get(end_date - timedelta(days=d), 0) for d in range(14, 0, -1)]
        history_footfall = [footfall_dict.get(end_date - timedelta(days=d), 5) for d in range(14, 0, -1)]
        
        cumulative_predicted_demand = 0
        
        for _ in range(days):
            current_date += timedelta(days=1)
            
            day_of_week = current_date.weekday()
            is_weekend = 1 if day_of_week >= 5 else 0
            
            demand_lag_1 = history_demand[-1]
            demand_lag_2 = history_demand[-2]
            demand_lag_3 = history_demand[-3]
            demand_lag_7 = history_demand[-7]
            demand_lag_14 = history_demand[-14]
            rolling_mean_7 = sum(history_demand[-7:]) / 7
            footfall_lag_1 = history_footfall[-1]
            
            features = pd.DataFrame([{
                'day_of_week': day_of_week,
                'is_weekend': is_weekend,
                'demand_lag_1': demand_lag_1,
                'demand_lag_2': demand_lag_2,
                'demand_lag_3': demand_lag_3,
                'demand_lag_7': demand_lag_7,
                'demand_lag_14': demand_lag_14,
                'rolling_mean_7': rolling_mean_7,
                'footfall_lag_1': footfall_lag_1
            }])
            
            pred_xgb = max(0, float(XGB_MODEL.predict(features)[0]))
            pred_lgb = max(0, float(LGB_MODEL.predict(features)[0]))
            pred_demand = (pred_xgb + pred_lgb) / 2
            
            forecast_timeline.append({
                "date": current_date.isoformat(),
                "predicted_demand": round(pred_demand, 2)
            })
            
            cumulative_predicted_demand += pred_demand
            history_demand.append(pred_demand)
            history_demand.pop(0)
            history_footfall.append(history_footfall[-1])
            history_footfall.pop(0)
            
        risk_level = "Low"
        if cumulative_predicted_demand > item.quantity:
            risk_level = "Critical (Stockout Expected)"
        elif cumulative_predicted_demand > (item.quantity * 0.7):
            risk_level = "High"
            
        result_data = {
            "inventory_id": item.id,
            "item_name": item.name,
            "category": item.category,
            "current_stock": item.quantity,
            "total_predicted_demand": round(cumulative_predicted_demand, 2),
            "risk_level": risk_level,
            "timeline": forecast_timeline
        }
        
        # Save to cache
        cache_entry = db.query(ForecastCache).filter(
            ForecastCache.hospital_id == hospital_id,
            ForecastCache.inventory_id == item.id
        ).first()
        
        if cache_entry:
            cache_entry.forecast_data = result_data
            cache_entry.last_updated = datetime.utcnow()
        else:
            cache_entry = ForecastCache(
                hospital_id=hospital_id,
                inventory_id=item.id,
                forecast_data=result_data
            )
            db.add(cache_entry)
            
        results.append(result_data)
        
    db.commit()
    return results

@router.get("/demand-forecast/{hospital_id}")
def get_demand_forecast(
    hospital_id: int, 
    db: Session = Depends(get_db)
):
    """
    Returns the demand forecast from DB cache for the given hospital.
    If cache is empty, it calculates it.
    """
    cache_entries = db.query(ForecastCache).filter(ForecastCache.hospital_id == hospital_id).all()
    
    if not cache_entries:
        try:
            results = calculate_and_save_forecast(hospital_id, db)
            return {"forecasts": results}
        except Exception as e:
            raise HTTPException(status_code=503, detail=str(e))
            
    # Return from cache
    results = [entry.forecast_data for entry in cache_entries]
    return {"forecasts": results}

@router.post("/demand-forecast/{hospital_id}/trigger")
@limiter.limit("10/minute")
def trigger_demand_forecast(
    request: Request,
    hospital_id: int, 
    db: Session = Depends(get_db)
):
    """
    Manually triggers ML forecasting calculation.
    """
    try:
        results = calculate_and_save_forecast(hospital_id, db)
        return {"success": True, "message": "Forecast successfully generated and saved.", "forecasts": results}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
