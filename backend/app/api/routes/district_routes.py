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
from app.models.inventory import InventoryItem, InventoryLog

router = APIRouter()

@router.get("/map-data")
def get_map_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    query = db.query(HealthCentre)
    user_nation_id = getattr(current_user, "nation_id", None) or (current_user.hospital.nation_id if current_user.hospital else None)
    if current_user.role in [UserRole.NATION_ADMIN, UserRole.DISTRICT_ADMIN] and user_nation_id:
        query = query.filter(HealthCentre.nation_id == user_nation_id)
    centres = query.all()
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

    result = {
        "total_phcs": phcs,
        "total_chcs": chcs,
        "doctor_presence_rate": doctor_presence_rate,
        "bed_occupancy_rate": bed_occupancy_rate,
        "medicine_alerts": medicine_alerts,
        "critical_centres": critical_centres,
    }
    return result


@router.get("/requests", response_model=List[ResourceRequestResponse])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    query = db.query(ResourceRequest).join(HealthCentre, ResourceRequest.requesting_phc_id == HealthCentre.id)
    user_nation_id = getattr(current_user, "nation_id", None) or (current_user.hospital.nation_id if current_user.hospital else None)
    if current_user.role in [UserRole.NATION_ADMIN, UserRole.DISTRICT_ADMIN] and user_nation_id:
        query = query.filter(HealthCentre.nation_id == user_nation_id)
    return query.all()

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

class AdminResourceRequestCreate(ResourceRequestCreate):
    donor_phc_id: int
    requesting_phc_id: int

@router.post("/resource-request/admin-create", response_model=ResourceRequestResponse)
def admin_create_resource_request(
    request_in: AdminResourceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.NATION_ADMIN, UserRole.DEVELOPER]))
):
    new_req = ResourceRequest(
        requesting_phc_id=request_in.requesting_phc_id,
        donor_phc_id=request_in.donor_phc_id,
        requested_by_user_id=current_user.id,
        target_district=request_in.target_district,
        resource_type=request_in.resource_type,
        resource_name=request_in.resource_name,
        quantity=request_in.quantity,
        urgency=request_in.urgency,
        notes=request_in.notes,
        status="PENDING_DONOR",
        admin_note="AI Recommended Redistribution"
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    
    # Notify Donor PHC
    target_user = db.query(User).filter(User.hospital_id == new_req.donor_phc_id, User.role.in_([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST])).first()
    if target_user:
        db.add(Notification(
            user_id=target_user.id,
            title="Order from Admin",
            message=f"Please send {new_req.quantity} units of {new_req.resource_name} to target PHC. Request ID: {new_req.id}",
            action_url=f"/api/v1/district/resource-request/{new_req.id}/approve-donation"
        ))
    db.commit()
    
    return new_req

@router.put("/resource-request/{request_id}", response_model=ResourceRequestResponse)
def update_resource_request(
    request_id: int,
    update_in: ResourceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.NATION_ADMIN, UserRole.DEVELOPER]))
):
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Resource request not found")
        
    if update_in.status:
        req.status = update_in.status
    if update_in.admin_note is not None:
        req.admin_note = update_in.admin_note
    if update_in.donor_phc_id is not None:
        req.donor_phc_id = update_in.donor_phc_id
        
    # Trigger a notification to the Donor PHC if it's PENDING_DONOR
    if req.status == "PENDING_DONOR" and req.donor_phc_id:
        target_user = db.query(User).filter(User.hospital_id == req.donor_phc_id, User.role.in_([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST])).first()
        if target_user:
            db.add(Notification(
                user_id=target_user.id,
                title="Order from Admin",
                message=f"Please send {req.quantity} units of {req.resource_name} to target PHC. Request ID: {req.id}",
                action_url=f"/api/v1/district/resource-request/{req.id}/approve-donation"
            ))
            
    # Notify Requesting PHC if rejected
    if req.status == "REJECTED":
        target_user = db.query(User).filter(User.hospital_id == req.requesting_phc_id).first()
        if target_user:
            db.add(Notification(
                user_id=target_user.id,
                title="Request Rejected",
                message=f"Your request for {req.resource_name} was rejected: {req.admin_note}"
            ))

    db.commit()
    db.refresh(req)
    return req

@router.get("/resource-request/{request_id}/donor-candidates")
def get_donor_candidates(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.NATION_ADMIN, UserRole.DEVELOPER]))
):
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Resource request not found")
        
    req_phc = db.query(HealthCentre).filter(HealthCentre.id == req.requesting_phc_id).first()
    if not req_phc:
        raise HTTPException(status_code=400, detail="Requesting PHC not found")

    candidates = db.query(
        HealthCentre.id,
        HealthCentre.name,
        InventoryItem.quantity,
        InventoryItem.min_threshold
    ).join(
        InventoryItem, InventoryItem.hospital_id == HealthCentre.id
    ).filter(
        InventoryItem.name.ilike(req.resource_name),
        HealthCentre.nation_id == req_phc.nation_id,
        HealthCentre.id != req.requesting_phc_id,
        InventoryItem.quantity > InventoryItem.min_threshold
    ).order_by(
        (InventoryItem.quantity - InventoryItem.min_threshold).desc()
    ).limit(5).all()

    results = []
    for c in candidates:
        results.append({
            "id": c.id,
            "name": c.name,
            "surplus": c.quantity - c.min_threshold
        })

    return {"candidates": results}

@router.post("/resource-request/{request_id}/approve-donation")
def approve_donation(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST, UserRole.DEVELOPER]))
):
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if not req or req.status != "PENDING_DONOR":
        raise HTTPException(status_code=400, detail="Invalid request")
        
    if current_user.hospital_id != req.donor_phc_id and current_user.role != UserRole.DEVELOPER:
        raise HTTPException(status_code=403, detail="Not authorized for this donor PHC")
        
    # Deduct inventory from donor
    inventory = db.query(InventoryItem).filter_by(hospital_id=req.donor_phc_id, name=req.resource_name).first()
    if not inventory or inventory.quantity < req.quantity:
        raise HTTPException(status_code=400, detail="Not enough inventory to fulfill donation")
        
    inventory.quantity -= req.quantity
    
    # Log it
    db.add(InventoryLog(inventory_id=inventory.id, change_type="DONATION_DISPENSE", change_amount=-req.quantity, performed_by_user_id=current_user.id))
    
    req.status = "SHIPPED"
    
    # Notify Receiver PHC
    target_user = db.query(User).filter(User.hospital_id == req.requesting_phc_id, User.role.in_([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST])).first()
    if target_user:
        db.add(Notification(
            user_id=target_user.id,
            title="Order Dispatched",
            message=f"{req.quantity} units of {req.resource_name} have been shipped to you.",
            action_url=f"/api/v1/district/resource-request/{req.id}/mark-received"
        ))
        
    db.commit()
    return {"status": "success", "message": "Donation approved and shipped"}

@router.post("/resource-request/{request_id}/mark-received")
def mark_received(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST, UserRole.DEVELOPER]))
):
    req = db.query(ResourceRequest).filter(ResourceRequest.id == request_id).first()
    if not req or req.status != "SHIPPED":
        raise HTTPException(status_code=400, detail="Invalid request")
        
    if current_user.hospital_id != req.requesting_phc_id and current_user.role != UserRole.DEVELOPER:
        raise HTTPException(status_code=403, detail="Not authorized for this requesting PHC")
        
    # Add inventory to receiver
    inventory = db.query(InventoryItem).filter_by(hospital_id=req.requesting_phc_id, name=req.resource_name).first()
    if not inventory:
        # Create it if it doesn't exist
        donor_inv = db.query(InventoryItem).filter_by(hospital_id=req.donor_phc_id, name=req.resource_name).first()
        inventory = InventoryItem(
            hospital_id=req.requesting_phc_id,
            name=req.resource_name,
            item_code=donor_inv.item_code if donor_inv else "",
            category=donor_inv.category if donor_inv else "Medicine",
            quantity=req.quantity,
            unit=donor_inv.unit if donor_inv else "units",
            price=donor_inv.price if donor_inv else 0
        )
        db.add(inventory)
        db.commit() # commit so we get inventory.id
        db.refresh(inventory)
    else:
        inventory.quantity += req.quantity
        
    # Log it
    db.add(InventoryLog(inventory_id=inventory.id, change_type="DONATION_RECEIVE", change_amount=req.quantity, performed_by_user_id=current_user.id))
    
    req.status = "COMPLETED"
    
    # Notify Donor PHC
    target_user = db.query(User).filter(User.hospital_id == req.donor_phc_id, User.role.in_([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST])).first()
    if target_user:
        db.add(Notification(
            user_id=target_user.id,
            title="Donation Received",
            message=f"Target PHC successfully received {req.quantity} units of {req.resource_name}."
        ))
        
    db.commit()
    return {"status": "success", "message": "Meds received and transaction completed"}

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
    
    query = db.query(Patient).join(HealthCentre, Patient.hospital_id == HealthCentre.id)
    
    user_nation_id = getattr(current_user, "nation_id", None) or (current_user.hospital.nation_id if current_user.hospital else None)
    if current_user.role in [UserRole.NATION_ADMIN, UserRole.DISTRICT_ADMIN] and user_nation_id:
        query = query.filter(HealthCentre.nation_id == user_nation_id)
        
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
