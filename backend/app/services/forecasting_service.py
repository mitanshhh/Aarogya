import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from app.models import HealthCentre, InventoryItem, InventoryLog, MedicineForecast, Patient, Nation, FederatedModelVersion
from app.schema_constants import FORECAST_FEATURES, TARGET_VARIABLE
import json

# Placeholder for in-memory category models (so we don't need a DB table for the model blob in this phase)
# In Phase 4, we'll store/pull these from the aggregator.
# Structure: { category_name: { "coef": [...], "intercept": float, "mae": float } }
LOCAL_MODELS = {}

def get_facility_size_bucket(beds: int) -> int:
    if beds < 50:
        return 1
    elif beds < 200:
        return 2
    return 3

def build_dataset_for_category(db: Session, category: str) -> pd.DataFrame:
    """
    Builds the dataset matching FORECAST_FEATURES for the given medicine category
    across all facilities in the nation (or globally).
    """
    items = db.query(InventoryItem).filter(InventoryItem.category == category).all()
    if not items:
        return pd.DataFrame()

    data_rows = []
    
    # We will build daily snapshots
    # For a real implementation, this would be a complex SQL query.
    # Doing it in python for simplicity and hackathon scope.
    
    # Fetch all relevant logs
    item_ids = [item.id for item in items]
    logs = db.query(InventoryLog).filter(InventoryLog.inventory_id.in_(item_ids)).order_by(InventoryLog.timestamp).all()
    
    # Group logs by item
    logs_by_item = {i: [] for i in item_ids}
    for log in logs:
        logs_by_item[log.inventory_id].append(log)
        
    for item in items:
        item_logs = logs_by_item[item.id]
        if not item_logs:
            continue
            
        hc = db.query(HealthCentre).filter(HealthCentre.id == item.hospital_id).first()
        size_bucket = get_facility_size_bucket(hc.total_beds)
        
        # We need continuous daily data. Find min and max date.
        start_date = item_logs[0].timestamp.date()
        end_date = datetime.now(timezone.utc).date()
        
        # Precompute daily dispense and restock
        daily_dispense = {}
        last_restock_date = start_date
        
        for log in item_logs:
            d = log.timestamp.date()
            if log.change_type == "DISPENSE":
                daily_dispense[d] = daily_dispense.get(d, 0) + abs(log.change_amount)
            elif log.change_type == "RESTOCK":
                last_restock_date = d
                
        # To compute rolling means efficiently
        dispense_series = pd.Series({d: daily_dispense.get(d, 0) for d in pd.date_range(start_date, end_date).date})
        
        rolling_7d = dispense_series.rolling(window=7, min_periods=1).mean()
        rolling_30d = dispense_series.rolling(window=30, min_periods=1).mean()
        
        # Build rows for the last 60 days to have targets (next 7 days)
        # We need at least 7 days of future data to compute the target
        days_list = pd.date_range(start_date + timedelta(days=30), end_date - timedelta(days=7)).date
        
        for d in days_list:
            next_7d_dispense = dispense_series.loc[d + timedelta(days=1): d + timedelta(days=7)].sum()
            
            # Approximate patient footfall as related to dispense for hackathon simplicity
            # In a real scenario, this would come from the Patient table
            patient_footfall_7d = dispense_series.loc[d - timedelta(days=6): d].sum() * 1.5
            
            # days since last restock up to d
            # We track last_restock manually or approximate
            # For simplicity, we just use random or a simple heuristic if exact tracking is slow
            days_since_restock = (d - last_restock_date).days if d >= last_restock_date else 5
            
            row = {
                "item_id": item.id,
                "hospital_id": hc.id,
                "date": d,
                "days_since_last_restock": max(0, days_since_restock),
                "rolling_7d_mean_consumption": rolling_7d.get(d, 0),
                "rolling_30d_mean_consumption": rolling_30d.get(d, 0),
                "patient_footfall_7d": patient_footfall_7d,
                "seasonality_index": d.month,  # month of year
                "facility_size_bucket": size_bucket,
                "next_7d_consumption": next_7d_dispense
            }
            data_rows.append(row)
            
    return pd.DataFrame(data_rows)


def train_local_model(db: Session, category: str):
    df = build_dataset_for_category(db, category)
    if df.empty or len(df) < 10:
        return False
        
    X = df[FORECAST_FEATURES]
    y = df[TARGET_VARIABLE]
    
    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, shuffle=False)
    
    model = Ridge(alpha=1.0)
    model.fit(X_train, y_train)
    
    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    
    # Save local model
    local_coefs = model.coef_.tolist()
    local_intercept = float(model.intercept_)
    local_mae = float(mae)
    
    LOCAL_MODELS[category] = {
        "coef": local_coefs,
        "intercept": local_intercept,
        "mae": local_mae,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "is_global": False
    }
    
    # --- PHASE 4: Federation Integration ---
    # 1. Fetch current Nation (assuming 1 nation per node)
    nation = db.query(Nation).first()
    nation_id = nation.id if nation else 1
    
    # 2. Push local model to aggregator
    push_local_model_update(category, nation_id)
    
    # 3. Pull global model from aggregator
    pull_global_model(category)
    
    # 4. If global model was pulled, evaluate it on local data
    global_mae = None
    if LOCAL_MODELS[category].get("is_global"):
        # The coefficients are now global
        model.coef_ = np.array(LOCAL_MODELS[category]["coef"])
        model.intercept_ = LOCAL_MODELS[category]["intercept"]
        global_preds = model.predict(X_test)
        global_mae = mean_absolute_error(y_test, global_preds)
        LOCAL_MODELS[category]["global_mae"] = float(global_mae)
        
    # 5. Log metrics to DB
    fmv = FederatedModelVersion(
        nation_id=nation_id,
        category=category,
        local_coef=json.dumps(local_coefs),
        local_intercept=local_intercept,
        local_mae=local_mae,
        global_coef=json.dumps(LOCAL_MODELS[category]["coef"]) if LOCAL_MODELS[category].get("is_global") else None,
        global_intercept=LOCAL_MODELS[category]["intercept"] if LOCAL_MODELS[category].get("is_global") else None,
        global_mae=float(global_mae) if global_mae is not None else None
    )
    db.add(fmv)
    db.commit()
    
    return True

def generate_forecasts(db: Session, hospital_id: int = None):
    # Retrieve categories to forecast
    query = db.query(InventoryItem.category).distinct()
    if hospital_id:
        query = query.filter(InventoryItem.hospital_id == hospital_id)
    categories = [row[0] for row in query.all()]
    
    for category in categories:
        if category not in LOCAL_MODELS:
            train_local_model(db, category)
            
    # Now generate specific projections
    items_query = db.query(InventoryItem)
    if hospital_id:
        items_query = items_query.filter(InventoryItem.hospital_id == hospital_id)
        
    items = items_query.all()
    
    now = datetime.now(timezone.utc)
    
    for item in items:
        if item.category not in LOCAL_MODELS:
            continue
            
        model_data = LOCAL_MODELS[item.category]
        
        # Build current feature vector for item
        hc = db.query(HealthCentre).filter(HealthCentre.id == item.hospital_id).first()
        size_bucket = get_facility_size_bucket(hc.total_beds)
        
        logs = db.query(InventoryLog).filter(InventoryLog.inventory_id == item.id).order_by(InventoryLog.timestamp.desc()).limit(30).all()
        
        # Basic derivation from recent logs
        recent_dispense = sum([abs(l.change_amount) for l in logs if l.change_type == "DISPENSE"])
        rolling_7d = recent_dispense / 7.0 if len(logs) > 0 else 0
        rolling_30d = recent_dispense / 30.0 if len(logs) > 0 else 0
        patient_footfall = rolling_7d * 1.5 * 7
        
        last_restock = next((l for l in logs if l.change_type == "RESTOCK"), None)
        days_since_restock = (now.date() - last_restock.timestamp.date()).days if last_restock else 10
        
        features = np.array([[
            days_since_restock,
            rolling_7d,
            rolling_30d,
            patient_footfall,
            now.month,
            size_bucket
        ]])
        
        coef = np.array(model_data["coef"])
        intercept = model_data["intercept"]
        
        predicted_7d = np.dot(features, coef)[0] + intercept
        predicted_daily = max(0.1, predicted_7d / 7.0) # Prevent division by zero or negative
        
        days_until_stockout = item.quantity / predicted_daily
        
        projected_date = now.date() + timedelta(days=int(days_until_stockout))
        # Cap projected date to 1 year
        if days_until_stockout > 365:
            projected_date = now.date() + timedelta(days=365)
            
        confidence = max(0.0, 1.0 - (model_data["mae"] / (predicted_7d + 1)))
        
        # Upsert forecast
        forecast = db.query(MedicineForecast).filter(MedicineForecast.item_id == item.id).first()
        if not forecast:
            forecast = MedicineForecast(hospital_id=item.hospital_id, item_id=item.id)
            db.add(forecast)
            
        forecast.projected_stockout_date = projected_date
        forecast.confidence = confidence
        forecast.generated_at = now
        
    db.commit()

import requests
import os

AGGREGATOR_URL = os.getenv("AGGREGATOR_URL", "http://localhost:8001")

def push_local_model_update(category: str, nation_id: int):
    if category not in LOCAL_MODELS:
        return
        
    model_data = LOCAL_MODELS[category]
    payload = {
        "nation_id": nation_id,
        "category": category,
        "coef": model_data["coef"],
        "intercept": model_data["intercept"],
        "mae": model_data["mae"]
    }
    try:
        # Use a short timeout since it's an internal call
        requests.post(f"{AGGREGATOR_URL}/push-model", json=payload, timeout=5)
    except Exception as e:
        # Fail gracefully
        print(f"Failed to push local model update to aggregator: {e}")

def pull_global_model(category: str):
    try:
        resp = requests.get(f"{AGGREGATOR_URL}/pull-model?category={category}", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            # Update local model with global parameters
            if category in LOCAL_MODELS:
                LOCAL_MODELS[category]["coef"] = data["coef"]
                LOCAL_MODELS[category]["intercept"] = data["intercept"]
                LOCAL_MODELS[category]["is_global"] = True
    except Exception as e:
        print(f"Failed to pull global model from aggregator: {e}")
