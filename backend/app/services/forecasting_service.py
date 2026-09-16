import pandas as pd
import numpy as np
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split
from app.models import HealthCentre, InventoryItem, InventoryLog, MedicineForecast, Patient
from app.schema_constants import FORECAST_FEATURES, TARGET_VARIABLE

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
    LOCAL_MODELS[category] = {
        "coef": model.coef_.tolist(),
        "intercept": float(model.intercept_),
        "mae": float(mae),
        "trained_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Optionally save to FederatedModelVersion if implementing Phase 4
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

# Placeholders for Phase 4
def push_local_model_update():
    pass

def pull_global_model():
    pass
