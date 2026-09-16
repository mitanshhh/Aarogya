from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models import InventoryItem, HealthCentre, District
import math
from typing import List, Dict, Any

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Dummy implementation, real one would use math
    # Or just return a random-ish distance if lat/lon are missing
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 50.0  # fallback 50km
    
    R = 6371  # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def generate_redistribution_plan(db: Session, district_id: int = None, nation_id: int = None) -> List[Dict[str, Any]]:
    # 1. Fetch all health centres
    hc_query = db.query(HealthCentre).join(District, HealthCentre.district == District.name)
    if district_id:
        hc_query = hc_query.filter(District.id == district_id)
    elif nation_id:
        hc_query = hc_query.filter(District.nation_id == nation_id)
        
    health_centres = {hc.id: hc for hc in hc_query.all()}
    if not health_centres:
        return []

    # 2. Fetch all inventory items for these health centres
    items = db.query(InventoryItem).filter(InventoryItem.hospital_id.in_(health_centres.keys())).all()
    
    # 3. Group by category/name to find surpluses and deficits
    inventory_by_name = {}
    for item in items:
        if item.name not in inventory_by_name:
            inventory_by_name[item.name] = {"surplus": [], "deficit": [], "price": item.price}
            
        current_stock = item.quantity
        min_thresh = item.min_threshold
        
        # Determine deficit (needs stock) or surplus (has extra stock)
        if current_stock < min_thresh:
            inventory_by_name[item.name]["deficit"].append({
                "hospital_id": item.hospital_id,
                "amount_needed": min_thresh - current_stock,
                "item_id": item.id
            })
        elif current_stock > min_thresh * 1.5:
            # We consider anything above 1.5x threshold as surplus available to give
            surplus_amt = current_stock - int(min_thresh * 1.5)
            inventory_by_name[item.name]["surplus"].append({
                "hospital_id": item.hospital_id,
                "amount_available": surplus_amt,
                "item_id": item.id
            })
            
    # 4. Match surpluses to deficits
    transfers = []
    
    for item_name, data in inventory_by_name.items():
        surpluses = data["surplus"]
        deficits = data["deficit"]
        
        for deficit in deficits:
            needed = deficit["amount_needed"]
            target_hc = health_centres[deficit["hospital_id"]]
            
            # Find closest surplus
            best_surplus_idx = -1
            best_dist = float('inf')
            
            for i, surplus in enumerate(surpluses):
                if surplus["amount_available"] <= 0 or surplus["hospital_id"] == deficit["hospital_id"]:
                    continue
                source_hc = health_centres[surplus["hospital_id"]]
                dist = haversine_distance(target_hc.latitude, target_hc.longitude, source_hc.latitude, source_hc.longitude)
                
                # If doing cross-district, prefer within same district if possible by artificially lowering distance
                if target_hc.district == source_hc.district:
                    dist = dist * 0.51  # 90% discount for same district
                
                if dist < best_dist:
                    best_dist = dist
                    best_surplus_idx = i
                    
            if best_surplus_idx != -1:
                surplus = surpluses[best_surplus_idx]
                transfer_amt = min(needed, surplus["amount_available"])
                
                source_hc = health_centres[surplus["hospital_id"]]
                
                transfers.append({
                    "item_name": item_name,
                    "from_hospital_id": source_hc.id,
                    "from_hospital_name": source_hc.name,
                    "to_hospital_id": target_hc.id,
                    "to_hospital_name": target_hc.name,
                    "quantity": transfer_amt,
                    "total_cost": transfer_amt * data["price"],
                    "distance_km": round(best_dist if best_dist < 500 else haversine_distance(target_hc.latitude, target_hc.longitude, source_hc.latitude, source_hc.longitude), 2),
                    "is_cross_district": target_hc.district != source_hc.district
                })
                
                surpluses[best_surplus_idx]["amount_available"] -= transfer_amt
                
    return transfers
