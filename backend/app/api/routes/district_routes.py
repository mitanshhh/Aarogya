from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.database import get_db
from app.models.district import ResourceRequest
from app.models.health_centre import HealthCentre
from app.models.user import User, UserRole
from app.models.notification import Notification
from app.schemas.district import ResourceRequestResponse, ResourceRequestCreate, ResourceRequestUpdate
from app.schemas.patient import PatientResponse
from app.schemas.common import PaginatedResponse
from app.api.dependencies import get_current_user, require_role, resolve_hospital_id

router = APIRouter()

@router.get("/map-data")
def get_map_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    centres = db.query(HealthCentre).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "type": c.type,
            "district": c.district,
            "latitude": c.latitude,
            "longitude": c.longitude,
            "total_beds": c.total_beds,
            "available_beds": c.available_beds
        }
        for c in centres
    ]

import time

_OVERVIEW_CACHE = {"timestamp": 0.0, "data": None}
_OVERVIEW_CACHE_TTL = 15.0

@router.get("/overview")
def get_district_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    now = time.time()
    if _OVERVIEW_CACHE["data"] and (now - _OVERVIEW_CACHE["timestamp"] < _OVERVIEW_CACHE_TTL):
        return _OVERVIEW_CACHE["data"]

    from app.models.bed import Bed
    from app.models.inventory import InventoryItem
    from app.models.attendance import AttendanceRecord, DailyQRSession
    from app.services.health_score import calculate_batch_health_scores
    from datetime import datetime
    
    phcs = db.query(HealthCentre).filter(HealthCentre.type == "PHC").count()
    chcs = db.query(HealthCentre).filter(HealthCentre.type == "CHC").count()
    
    # Bed Occupancy
    total_beds = db.query(Bed).count()
    occupied_beds = db.query(Bed).filter(Bed.status == "Occupied").count()
    bed_occupancy_rate = round((occupied_beds / total_beds * 100), 1) if total_beds > 0 else 0
    
    # Medicine alerts: items where quantity is at or below threshold
    medicine_alerts = db.query(InventoryItem).filter(InventoryItem.quantity <= InventoryItem.min_threshold).count()
    
    # Critical centres: status == 'Critical' or health_score < 50 or 0 available beds
    all_centres = db.query(HealthCentre).all()
    scores = calculate_batch_health_scores(db, [c.id for c in all_centres])
    critical_centres = 0
    for c in all_centres:
        live_score = scores.get(c.id, 0.0)
        if c.status == "Critical" or live_score < 50 or (c.available_beds == 0 and c.total_beds > 0):
            critical_centres += 1
    
    # Doctor presence rate (today)
    today = datetime.now().date()
    present_docs = db.query(AttendanceRecord).join(DailyQRSession).filter(
        DailyQRSession.date == today,
        AttendanceRecord.status.in_(["PRESENT", "LATE"])
    ).count()
    
    total_docs = db.query(User).filter(User.role == UserRole.DOCTOR).count()
    doctor_presence_rate = round((present_docs / total_docs * 100), 1) if total_docs > 0 else 0
    
    result = {
        "total_phcs": phcs,
        "total_chcs": chcs,
        "doctor_presence_rate": doctor_presence_rate,
        "bed_occupancy_rate": bed_occupancy_rate,
        "medicine_alerts": medicine_alerts,
        "critical_centres": critical_centres,
    }
    _OVERVIEW_CACHE["data"] = result
    _OVERVIEW_CACHE["timestamp"] = now
    return result


@router.get("/requests", response_model=List[ResourceRequestResponse])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    return db.query(ResourceRequest).all()

@router.post("/resource-request", response_model=ResourceRequestResponse)
def create_resource_request(
    request_in: ResourceRequestCreate,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER]))
):
    new_req = ResourceRequest(
        requesting_phc_id=hospital_id,
        requested_by_user_id=current_user.id,
        **request_in.model_dump()
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    return new_req

@router.put("/resource-request/{request_id}", response_model=ResourceRequestResponse)
def update_resource_request(
    request_id: int,
    update_in: ResourceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Resource request not found")
        
    if update_in.status:
        req.status = update_in.status
    if update_in.admin_note:
        req.admin_note = update_in.admin_note
        
    # Trigger a notification to the PHC
    admin_action = "Approved" if req.status == "APPROVED" else "Rejected" if req.status == "REJECTED" else req.status
    
    # We should notify users at the requesting PHC. For simplicity, we just create a broadcast notification 
    # for that PHC or the PHC_ADMIN role.
    # But since Notification model in this app might not support hospital_id targeting natively, we will 
    # just create a generic one for now (or let the PHC staff poll requests). 
    # Find an appropriate user to notify (e.g., any user at that PHC)
    target_user = db.query(User).filter(User.hospital_id == req.requesting_phc_id).first()
    if target_user:
        notif = Notification(
            user_id=target_user.id,
            title=f"Resource Request {admin_action}",
            message=f"Request for {req.resource_name}: {update_in.admin_note or 'No notes provided.'}"
        )
        db.add(notif)
    
    db.commit()
    db.refresh(req)
    return req

@router.get("/patients/search", response_model=PaginatedResponse[PatientResponse])
def search_patients_globally(
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    from sqlalchemy import or_
    from app.models.patient import Patient
    
    query = db.query(Patient)
    if q and q.strip():
        query = query.filter(
            or_(
                Patient.name.ilike(f"%{q}%"),
                Patient.patient_code.ilike(f"%{q}%")
            )
        )
    
    query = query.order_by(Patient.name.asc())
    total = query.count()
    patients = query.offset(offset).limit(limit).all()
    
    return PaginatedResponse(
        data=patients,
        total=total,
        limit=limit,
        offset=offset
    )
