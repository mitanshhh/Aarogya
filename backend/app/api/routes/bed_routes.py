from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from app.db.database import get_db
from app.models.bed import Bed
from app.models.patient import Patient, PatientAuditLog
from app.models.user import User, UserRole
from app.schemas.bed import BedResponse, BedCreate, BedUpdate
from app.schemas.common import PaginatedResponse
from app.api.dependencies import get_current_user, require_role, resolve_hospital_id
from pydantic import BaseModel
from typing import Optional
router = APIRouter()

from app.models.health_centre import HealthCentre

def sync_health_centre_beds(db: Session, hospital_id: int):
    db.flush()
    hc = db.query(HealthCentre).filter(HealthCentre.id == hospital_id).first()
    if hc:
        hc.total_beds = db.query(Bed).filter(Bed.hospital_id == hospital_id).count()
        hc.available_beds = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == 'Available').count()

def log_audit(db: Session, patient_id: int, user_id: int, action: str, details: str = None):
    audit = PatientAuditLog(
        patient_id=patient_id,
        user_id=user_id,
        action=action,
        details=details
    )
    db.add(audit)
    db.commit()

@router.get("", response_model=PaginatedResponse[BedResponse])
def get_beds(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    status: str = Query(None, description="Filter by status (Available/Occupied/Maintenance)"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0)
):
    query = db.query(Bed).filter(Bed.hospital_id == hospital_id)
    if status:
        query = query.filter(Bed.status == status)
    
    total = query.count()
    beds = query.offset(offset).limit(limit).all()
    
    return PaginatedResponse(
        data=beds,
        total=total,
        limit=limit,
        offset=offset
    )

@router.post("", response_model=BedResponse)
def create_bed(
    bed_in: BedCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    # If not district admin, can only create bed in their own hospital
    if current_user.role != UserRole.DISTRICT_ADMIN and current_user.hospital_id != bed_in.hospital_id:
        raise HTTPException(status_code=403, detail="Not authorized to create beds for this hospital")
        
    db_bed = Bed(**bed_in.model_dump())
    db.add(db_bed)
    sync_health_centre_beds(db, db_bed.hospital_id)
    db.commit()
    db.refresh(db_bed)
    return db_bed

@router.put("/{bed_id}", response_model=BedResponse)
def update_bed(
    bed_id: int,
    bed_in: BedUpdate,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    bed = db.query(Bed).filter(Bed.id == bed_id, Bed.hospital_id == hospital_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
        
    for key, value in bed_in.model_dump(exclude_unset=True).items():
        setattr(bed, key, value)
        
    sync_health_centre_beds(db, bed.hospital_id)
    db.commit()
    db.refresh(bed)
    return bed

@router.get("/analytics")
def get_bed_analytics(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.MEDICAL_OFFICER, UserRole.RECEPTIONIST, UserRole.DEVELOPER]))
):
    total = db.query(Bed).filter(Bed.hospital_id == hospital_id).count()
    occupied = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == 'Occupied').count()
    available = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == 'Available').count()
    maintenance = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == 'Maintenance').count()
    cleaning = db.query(Bed).filter(Bed.hospital_id == hospital_id, Bed.status == 'Cleaning').count()
    
    occupancy_percentage = round((occupied / total * 100) if total > 0 else 0)

    return {
        "ai_alerts": [
            "ICU capacity alert: Ensure adequate staffing." if occupancy_percentage > 80 else "Capacity is stable."
        ],
        "kpis": {
            "total_beds": total,
            "occupied_beds": occupied,
            "available_beds": available,
            "maintenance_beds": maintenance,
            "cleaning_beds": cleaning,
            "occupancy_percentage": occupancy_percentage
        },
        "forecast": [
            {"date": "Day 1", "occupancy": occupancy_percentage},
            {"date": "Day 2", "occupancy": max(0, occupancy_percentage - 2)},
            {"date": "Day 3", "occupancy": min(100, occupancy_percentage + 5)},
            {"date": "Day 4", "occupancy": min(100, occupancy_percentage + 1)},
            {"date": "Day 5", "occupancy": max(0, occupancy_percentage - 4)},
            {"date": "Day 6", "occupancy": min(100, occupancy_percentage + 2)},
            {"date": "Day 7", "occupancy": occupancy_percentage}
        ]
    }


class AdmitPayload(BaseModel):
    action: str
    patient_name: str
    patient_code: Optional[str] = None
    patient_phone: Optional[str] = None
    admission_reason: Optional[str] = None
    doctor_id: Optional[int] = None
    expected_discharge: Optional[datetime] = None

@router.post("/{bed_id}/admit")
def admit_patient(
    bed_id: int,
    payload: AdmitPayload,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.RECEPTIONIST, UserRole.DATA_ENTRY, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    bed = db.query(Bed).filter(Bed.id == bed_id, Bed.hospital_id == hospital_id).first()
    
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
    if bed.status != "Available":
        raise HTTPException(status_code=400, detail="Bed is not available")
    if not payload.patient_name or not payload.patient_name.strip():
        raise HTTPException(status_code=400, detail="Patient name is required")
    
    # Check if patient exists by patient_code
    existing_patient = None
    if payload.patient_code:
        existing_patient = db.query(Patient).filter(
            Patient.hospital_id == hospital_id,
            Patient.patient_code.ilike(payload.patient_code.strip())
        ).first()

    if existing_patient:
        # Check if the patient is already assigned to another bed
        existing_bed = db.query(Bed).filter(Bed.patient_id == existing_patient.id).first()
        if existing_bed and existing_bed.id != bed_id:
            raise HTTPException(status_code=400, detail=f"Patient is already assigned to Bed {existing_bed.bed_number}")
            
        patient_record = existing_patient
        patient_record.status = "Admitted"
        if payload.admission_reason:
            patient_record.medical_history = (patient_record.medical_history or "") + f" | Bed Admission: {payload.admission_reason}"
        if payload.patient_phone:
            patient_record.contact = payload.patient_phone
    else:
        # Create a new patient record
        patient_record = Patient(
            hospital_id=hospital_id,
            patient_code=payload.patient_code.strip() if payload.patient_code else None,
            name=payload.patient_name.strip(),
            contact=payload.patient_phone,
            medical_history=payload.admission_reason,
            status="Admitted",
            age=0,
            gender="Unknown",
            admitted_at=datetime.now(timezone.utc)
        )
        db.add(patient_record)
        db.flush()
        if not patient_record.patient_code:
            patient_record.patient_code = f"PT-{str(patient_record.id).zfill(4)}"
        db.refresh(patient_record)

    if payload.action == "Reserve":
        bed.status = "Reserved"
    else:
        bed.status = "Occupied"
        
    bed.patient_id = patient_record.id
    bed.admitted_at = datetime.now(timezone.utc)
    
    action_text = "Reserved" if payload.action == "Reserve" else "Admitted to"
    log_audit(db, patient_record.id, current_user.id, "BED_ALLOCATED", f"{action_text} bed {bed.bed_number}")
    sync_health_centre_beds(db, bed.hospital_id)
    db.commit()
    db.refresh(bed)
    return bed

@router.post("/{bed_id}/discharge")
def discharge_patient(
    bed_id: int,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.RECEPTIONIST, UserRole.DATA_ENTRY, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    bed = db.query(Bed).filter(Bed.id == bed_id, Bed.hospital_id == hospital_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
        
    patient = None
    if bed.patient_id:
        patient = db.query(Patient).filter(Patient.id == bed.patient_id).first()
    elif bed.status not in ["Occupied", "Reserved"]:
        raise HTTPException(status_code=400, detail="Bed is not occupied or reserved")
    
    bed.status = "Cleaning"
    bed.patient_id = None
    bed.admitted_at = None
    
    if patient:
        patient.status = "Discharged"
        patient.discharged_at = datetime.now(timezone.utc)
        log_audit(db, patient.id, current_user.id, "BED_RELEASED", "Discharged patient")
    
    sync_health_centre_beds(db, bed.hospital_id)
    db.commit()
    
    return {"message": "Patient discharged successfully"}

class StatusPayload(BaseModel):
    status: str

@router.put("/{bed_id}/status")
def change_bed_status(
    bed_id: int,
    payload: StatusPayload,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.RECEPTIONIST, UserRole.DATA_ENTRY, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    bed = db.query(Bed).filter(Bed.id == bed_id, Bed.hospital_id == hospital_id).first()
    if not bed:
        raise HTTPException(status_code=404, detail="Bed not found")
        
    bed.status = payload.status
    sync_health_centre_beds(db, bed.hospital_id)
    db.commit()
    db.refresh(bed)
    return bed
