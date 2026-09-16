from sqlalchemy.orm import Session
from app.models import Nation, HealthCentre, District
from app.services.health_score import calculate_phc_health_score

def get_resilience_index(db: Session, nation_id: int = 1) -> float:
    # 1. Get all PHCs in nation
    hcs = db.query(HealthCentre).join(District).filter(District.nation_id == nation_id).all()
    if not hcs:
        return 0.0
        
    total_score = 0
    for hc in hcs:
        # We reuse the existing PHC health score
        # but in a real app we might weigh it or add cross-district factors
        score_data = calculate_phc_health_score(db, hc.id)
        total_score += score_data["score"]
        
    avg_score = total_score / len(hcs)
    return round(avg_score, 2)

def toggle_emergency_mode(db: Session, nation_id: int, active: bool) -> bool:
    nation = db.query(Nation).filter(Nation.id == nation_id).first()
    if not nation:
        return False
        
    nation.is_emergency_mode = active
    db.commit()
    return active

def get_emergency_status(db: Session, nation_id: int = 1) -> bool:
    nation = db.query(Nation).filter(Nation.id == nation_id).first()
    if not nation:
        return False
    return nation.is_emergency_mode
