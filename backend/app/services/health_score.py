from sqlalchemy.orm import Session
from app.models.health_centre import HealthCentre
from app.models.inventory import InventoryItem
from app.models.attendance import DailyQRSession, AttendanceRecord, Doctor
from app.models.bed import Bed
from datetime import date

from app.utils.date_utils import get_now_ist

def calculate_health_score(db: Session, hospital_id: int) -> float:
    score = 100.0
    
    # 1. Bed Availability (30% weight) Target 70-85%
    total_beds = db.query(Bed).filter(Bed.hospital_id == hospital_id).count()
    occupied_beds = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == "Occupied").count()
    if total_beds > 0:
        occupancy_rate = occupied_beds / total_beds
        if occupancy_rate > 0.85:
            score -= (occupancy_rate - 0.85) * 100 * 0.3
        elif occupancy_rate < 0.70:
            score -= (0.70 - occupancy_rate) * 100 * 0.3
    else:
        score -= 30 # Penalty for no beds
        
    # 2. Inventory Stock Health (30% weight)
    total_items = db.query(InventoryItem).filter(InventoryItem.hospital_id == hospital_id).count()
    low_stock = db.query(InventoryItem).filter(InventoryItem.hospital_id == hospital_id, InventoryItem.status == "Low Stock").count()
    if total_items > 0:
        low_stock_ratio = low_stock / total_items
        score -= (low_stock_ratio * 100 * 0.3)
        
    # 3. Staff Attendance Rate (20% weight)
    today = get_now_ist().date()
    session = db.query(DailyQRSession).filter(DailyQRSession.hospital_id == hospital_id, DailyQRSession.date == today).first()
    total_doctors = db.query(Doctor).filter(Doctor.hospital_id == hospital_id).count()
    
    if session and total_doctors > 0:
        present = db.query(AttendanceRecord).filter(AttendanceRecord.session_id == session.id).count()
        absence_rate = (total_doctors - present) / total_doctors
        score -= (absence_rate * 100 * 0.20)
    else:
        score -= 20 # Penalty for missing QR session or no doctors
        
    # 4. Forecast Risk (10% weight) - newly added for BRICS hackathon
    from app.models.forecast import MedicineForecast
    from datetime import timedelta
    
    now_date = get_now_ist().date()
    critical_stockouts = db.query(MedicineForecast).filter(
        MedicineForecast.hospital_id == hospital_id,
        MedicineForecast.projected_stockout_date <= now_date + timedelta(days=7)
    ).count()
    
    if critical_stockouts > 0:
        score -= min(10, critical_stockouts * 2) # max 10 points penalty
        
    # 5. Patient Flow & Throughput (10% weight) - Simplified for MVP
    
    return max(0.0, min(100.0, score))


def calculate_batch_health_scores(db: Session, hospital_ids: list[int]) -> dict[int, float]:
    """Calculate health scores for multiple hospitals in batch using aggregated queries."""
    if not hospital_ids:
        return {}
        
    scores = {hid: 100.0 for hid in hospital_ids}
    
    from sqlalchemy import func, case
    
    # 1. Beds by hospital
    bed_stats = db.query(
        Bed.hospital_id,
        func.count(Bed.id).label("total"),
        func.sum(case((Bed.status == "Occupied", 1), else_=0)).label("occupied")
    ).filter(Bed.hospital_id.in_(hospital_ids)).group_by(Bed.hospital_id).all()
    
    bed_map = {row.hospital_id: (row.total or 0, row.occupied or 0) for row in bed_stats}
    
    for hid in hospital_ids:
        total_beds, occupied_beds = bed_map.get(hid, (0, 0))
        if total_beds > 0:
            occupancy_rate = occupied_beds / total_beds
            if occupancy_rate > 0.85:
                scores[hid] -= (occupancy_rate - 0.85) * 100 * 0.3
            elif occupancy_rate < 0.70:
                scores[hid] -= (0.70 - occupancy_rate) * 100 * 0.3
        else:
            scores[hid] -= 30  # Penalty for no beds

    # 2. Inventory stock health
    inv_stats = db.query(
        InventoryItem.hospital_id,
        func.count(InventoryItem.id).label("total"),
        func.sum(case((InventoryItem.status == "Low Stock", 1), else_=0)).label("low_stock")
    ).filter(InventoryItem.hospital_id.in_(hospital_ids)).group_by(InventoryItem.hospital_id).all()
    
    inv_map = {row.hospital_id: (row.total or 0, row.low_stock or 0) for row in inv_stats}
    
    for hid in hospital_ids:
        total_items, low_stock = inv_map.get(hid, (0, 0))
        if total_items > 0:
            low_stock_ratio = low_stock / total_items
            scores[hid] -= (low_stock_ratio * 100 * 0.3)

    # 3. Staff attendance rate
    today = get_now_ist().date()
    sessions = db.query(DailyQRSession).filter(
        DailyQRSession.hospital_id.in_(hospital_ids),
        DailyQRSession.date == today
    ).all()
    session_map = {s.hospital_id: s.id for s in sessions}
    
    # Total doctors by hospital
    doc_stats = db.query(
        Doctor.hospital_id,
        func.count(Doctor.id).label("total")
    ).filter(Doctor.hospital_id.in_(hospital_ids)).group_by(Doctor.hospital_id).all()
    doc_map = {row.hospital_id: (row.total or 0) for row in doc_stats}
    
    # Attendance counts for existing sessions
    attendance_map = {}
    if session_map:
        session_ids = list(session_map.values())
        att_stats = db.query(
            AttendanceRecord.session_id,
            func.count(AttendanceRecord.id).label("present")
        ).filter(AttendanceRecord.session_id.in_(session_ids)).group_by(AttendanceRecord.session_id).all()
        attendance_map = {row.session_id: (row.present or 0) for row in att_stats}
        
    for hid in hospital_ids:
        total_doctors = doc_map.get(hid, 0)
        session_id = session_map.get(hid)
        if session_id and total_doctors > 0:
            present = attendance_map.get(session_id, 0)
            absence_rate = (total_doctors - present) / total_doctors
            scores[hid] -= (absence_rate * 100 * 0.20)
        else:
            scores[hid] -= 20  # Penalty for missing QR session or no doctors

    # 4. Forecast Risk
    from app.models.forecast import MedicineForecast
    from datetime import timedelta
    
    now_date = get_now_ist().date()
    forecast_stats = db.query(
        MedicineForecast.hospital_id,
        func.count(MedicineForecast.id).label("critical_stockouts")
    ).filter(
        MedicineForecast.hospital_id.in_(hospital_ids),
        MedicineForecast.projected_stockout_date <= now_date + timedelta(days=7)
    ).group_by(MedicineForecast.hospital_id).all()
    
    forecast_map = {row.hospital_id: (row.critical_stockouts or 0) for row in forecast_stats}
    
    for hid in hospital_ids:
        critical = forecast_map.get(hid, 0)
        if critical > 0:
            scores[hid] -= min(10, critical * 2)

    return {hid: max(0.0, min(100.0, score)) for hid, score in scores.items()}

