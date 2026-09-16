import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict
import numpy as np

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

# In-memory storage for hackathon simplicity
# Structure: { category: { nation_id: { "coef": [...], "intercept": float, "mae": float } } }
local_updates: Dict[str, Dict[int, dict]] = {}

# Structure: { category: { "coef": [...], "intercept": float, "version": int } }
global_models: Dict[str, dict] = {}

@app.post("/push-model")
def push_model(update: ModelUpdate):
    if update.category not in local_updates:
        local_updates[update.category] = {}
        
    local_updates[update.category][update.nation_id] = {
        "nation_name": update.nation_name,
        "phc_name": update.phc_name,
        "coef": update.coef,
        "intercept": update.intercept,
        "mae": update.mae
    }
    
    # Trigger FedAvg if we have updates from at least 1 nation (for demo, real world requires more)
    # Actually, we can run it on every push for the hackathon demo so it's always up to date
    _run_fedavg(update.category)
    print(f"Received push from nation_id={update.nation_id} ({update.nation_name} - {update.phc_name}) for category={update.category}")
    return {"status": "success", "message": "Model update received"}

@app.get("/pull-model")
def pull_model(category: str):
    if category not in global_models:
        raise HTTPException(status_code=404, detail="No global model available for this category yet")
    return global_models[category]

@app.get("/status")
def get_status():
    """Returns aggregator status for the dashboard"""
    stats = []
    for category in set(list(local_updates.keys()) + list(global_models.keys())):
        nations_contributed = len(local_updates.get(category, {}))
        version = global_models.get(category, {}).get("version", 0)
        
        contributors = []
        for n_id, data in local_updates.get(category, {}).items():
            contributors.append(f"{data.get('nation_name', 'Unknown')} ({data.get('phc_name', 'Unknown')})")
            
        stats.append({
            "category": category,
            "nations_contributed": nations_contributed,
            "contributors": contributors,
            "global_model_version": version
        })
    return {"categories": stats, "total_nations_active": len(set(n for cats in local_updates.values() for n in cats.keys()))}

def _run_fedavg(category: str):
    updates = local_updates[category].values()
    if not updates:
        return
        
    # FedAvg: simple average of coefficients and intercept
    # Weighting by MAE could be done, but simple average is standard FedAvg
    all_coefs = [np.array(u["coef"]) for u in updates]
    all_intercepts = [u["intercept"] for u in updates]
    
    avg_coef = np.mean(all_coefs, axis=0).tolist()
    avg_intercept = np.mean(all_intercepts)
    
    version = global_models.get(category, {}).get("version", 0) + 1
    
    global_models[category] = {
        "coef": avg_coef,
        "intercept": float(avg_intercept),
        "version": version
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
