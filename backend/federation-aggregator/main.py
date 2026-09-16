import sys
import os

# Ensure we can import the backend app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import numpy as np
import json

from app.db.database import SessionLocal
from app.models.federation import AggregatorLocalUpdate, AggregatorGlobalModel

app = FastAPI(title="BRICS Federated Learning Aggregator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ModelUpdate(BaseModel):
    nation_id: int
    nation_name: str = "Unknown"
    phc_name: str = "Unknown"
    category: str
    coef: List[float]
    intercept: float
    mae: float

@app.post("/push-model")
def push_model(update: ModelUpdate):
    db = SessionLocal()
    try:
        # Check if local update exists
        local = db.query(AggregatorLocalUpdate).filter_by(
            category=update.category, nation_id=update.nation_id, phc_name=update.phc_name
        ).first()
        
        if not local:
            local = AggregatorLocalUpdate(
                category=update.category,
                nation_id=update.nation_id,
                nation_name=update.nation_name,
                phc_name=update.phc_name,
                coef=json.dumps(update.coef),
                intercept=update.intercept,
                mae=update.mae
            )
            db.add(local)
        else:
            local.nation_name = update.nation_name
            local.phc_name = update.phc_name
            local.coef = json.dumps(update.coef)
            local.intercept = update.intercept
            local.mae = update.mae
            
        db.commit()
        
        # Trigger FedAvg
        _run_fedavg(update.category, db)
        
        print(f"Received push from nation_id={update.nation_id} ({update.nation_name} - {update.phc_name}) for category={update.category}")
        return {"status": "success", "message": "Model update received"}
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@app.get("/pull-model")
def pull_model(category: str):
    db = SessionLocal()
    try:
        model = db.query(AggregatorGlobalModel).filter_by(category=category).first()
        if not model:
            raise HTTPException(status_code=404, detail="No global model available for this category yet")
        return {
            "coef": json.loads(model.coef),
            "intercept": model.intercept,
            "version": model.version
        }
    finally:
        db.close()

@app.get("/status")
def get_status():
    """Returns aggregator status for the dashboard"""
    db = SessionLocal()
    try:
        categories_updates = db.query(AggregatorLocalUpdate.category).distinct().all()
        categories_global = db.query(AggregatorGlobalModel.category).distinct().all()
        all_categories = set([c[0] for c in categories_updates] + [c[0] for c in categories_global])
        
        stats = []
        for category in all_categories:
            updates = db.query(AggregatorLocalUpdate).filter_by(category=category).all()
            nations_contributed = len(updates)
            
            contributors = []
            for u in updates:
                contributors.append(f"{u.nation_name} ({u.phc_name})")
                
            global_model = db.query(AggregatorGlobalModel).filter_by(category=category).first()
            version = global_model.version if global_model else 0
            
            stats.append({
                "category": category,
                "nations_contributed": nations_contributed,
                "contributors": contributors,
                "global_model_version": version
            })
            
        total_nations_active = db.query(AggregatorLocalUpdate.nation_id).distinct().count()
        return {"categories": stats, "total_nations_active": total_nations_active}
    finally:
        db.close()

def _run_fedavg(category: str, db):
    updates = db.query(AggregatorLocalUpdate).filter_by(category=category).all()
    if not updates:
        return
        
    # FedAvg: simple average of coefficients and intercept
    all_coefs = [np.array(json.loads(u.coef)) for u in updates]
    all_intercepts = [u.intercept for u in updates]
    
    avg_coef = np.mean(all_coefs, axis=0).tolist()
    avg_intercept = np.mean(all_intercepts)
    
    global_model = db.query(AggregatorGlobalModel).filter_by(category=category).first()
    if not global_model:
        global_model = AggregatorGlobalModel(
            category=category,
            coef=json.dumps(avg_coef),
            intercept=float(avg_intercept),
            version=1
        )
        db.add(global_model)
    else:
        global_model.coef = json.dumps(avg_coef)
        global_model.intercept = float(avg_intercept)
        global_model.version += 1
        
    db.commit()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
