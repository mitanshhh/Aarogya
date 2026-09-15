from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
import pandas as pd
import io
from pydantic import BaseModel

from app.db.database import get_db
from app.models.inventory import InventoryItem, InventoryLog
from app.models.notification import Notification
from app.models.district import ResourceRequest
from app.models.health_centre import HealthCentre
from app.models.user import User, UserRole
from app.schemas.inventory import InventoryItemResponse, InventoryItemCreate, InventoryItemUpdate, InventoryLogResponse
from app.schemas.common import PaginatedResponse
from app.api.dependencies import get_current_user, require_role, resolve_hospital_id
from app.services.gemini_service import get_inventory_insights
from app.core.rate_limit import limiter
from fastapi import Request

router = APIRouter()

MAX_CSV_SIZE = 50 * 1024 * 1024 # 50 MB
MAX_CSV_ROWS = 1000

def sanitize_csv_value(val):
    """Prevent CSV injection attacks"""
    if isinstance(val, str) and val.startswith(('=', '+', '-', '@')):
        return "'" + val
    return val

def log_inventory_change(db: Session, inventory_id: int, change_type: str, amount: int, user_id: int, reason: str = None, patient_id: int = None):
    log = InventoryLog(
        inventory_id=inventory_id,
        change_type=change_type,
        change_amount=amount,
        reason=reason,
        performed_by_user_id=user_id,
        patient_id=patient_id
    )
    db.add(log)
    # The caller is responsible for db.commit() to ensure atomicity

@router.get("", response_model=PaginatedResponse[InventoryItemResponse])
def get_inventory(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    category: str = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    query = db.query(InventoryItem).filter(InventoryItem.hospital_id == hospital_id)
    if category:
        query = query.filter(InventoryItem.category == category)
    
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    
    return PaginatedResponse(data=items, total=total, limit=limit, offset=offset)

@router.get("/lookup")
def lookup_inventory_item(
    item_code: str,
    db: Session = Depends(get_db)
):
    item = db.query(InventoryItem).filter(InventoryItem.item_code == item_code).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return {
        "item_code": item.item_code,
        "name": item.name,
        "category": item.category,
        "unit": item.unit
    }

@router.post("", response_model=InventoryItemResponse)
def add_inventory_item(
    item_in: InventoryItemCreate,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.PHARMACIST, UserRole.DATA_ENTRY, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    item_in.hospital_id = hospital_id
    
    status = "Normal"
    if item_in.quantity <= item_in.min_threshold:
        status = "Low Stock"
        
    item_dict = item_in.model_dump(exclude={"status"})
    new_item = InventoryItem(**item_dict, status=status)
    db.add(new_item)
    db.flush()
    
    if status == "Low Stock":
        # Create a notification
        notif = Notification(
            user_id=current_user.id,
            title="Low Stock Alert",
            message=f"Item {new_item.name} is added but below min threshold ({new_item.quantity}/{new_item.min_threshold})."
        )
        db.add(notif)
    
    db.commit()
    db.refresh(new_item)
    
    log_inventory_change(db, new_item.id, "RESTOCK", new_item.quantity, current_user.id, "Initial Add")
    db.commit()
    return new_item

@router.put("/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(
    item_id: int,
    item_in: InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.PHARMACIST, UserRole.DATA_ENTRY, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    old_qty = item.quantity
    
    for key, value in item_in.model_dump(exclude_unset=True).items():
        if key not in ("note", "patient_code"):
            setattr(item, key, value)
        
    if item.quantity <= item.min_threshold:
        item.status = "Low Stock"
    else:
        item.status = "Normal"
        
    if item.quantity != old_qty:
        diff = item.quantity - old_qty
        action_note = item_in.note if item_in.note else "Manual Update"
        
        patient_id = None
        if item_in.patient_code:
            from app.models.patient import Patient
            patient = db.query(Patient).filter(Patient.patient_code == item_in.patient_code).first()
            if patient:
                patient_id = patient.id
                
        log_inventory_change(db, item.id, "UPDATE" if diff > 0 else "DISPENSE", abs(diff), current_user.id, action_note, patient_id)
        
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{item_id}")
def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
        
    db.delete(item)
    db.commit()
    return {"message": "Item deleted successfully"}

@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.PHARMACIST, UserRole.MEDICAL_OFFICER, UserRole.DEVELOPER]))
):
    if not file.filename.endswith('.csv'):
        print("Upload CSV Error: Not a CSV file")
        raise HTTPException(status_code=400, detail="Only CSV files are allowed")
    
    contents = await file.read()
    if len(contents) > MAX_CSV_SIZE:
        print("Upload CSV Error: File too large")
        raise HTTPException(status_code=413, detail="File too large. Max 50MB.")
        
    try:
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        print(f"Upload CSV Error: Pandas failed to parse CSV: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")
        
    if len(df) > MAX_CSV_ROWS:
        print("Upload CSV Error: Too many rows")
        raise HTTPException(status_code=400, detail=f"Too many rows. Max {MAX_CSV_ROWS} rows allowed.")
    
    df.columns = df.columns.str.lower().str.strip()
    
    # Required columns
    required_cols = {'name', 'quantity'}
    if not required_cols.issubset(set(df.columns)):
        print(f"Upload CSV Error: Missing required columns. Found {df.columns.tolist()}")
        raise HTTPException(status_code=400, detail=f"CSV must contain columns: {', '.join(required_cols)}. You provided: {', '.join(df.columns)}")
    
    items_added = 0
    for _, row in df.iterrows():
        # Sanitize
        name = sanitize_csv_value(row.get('name'))
        item_code = sanitize_csv_value(row.get('item_code')) if 'item_code' in df.columns and pd.notna(row.get('item_code')) else None
        cat = sanitize_csv_value(row.get('category')) if 'category' in df.columns and pd.notna(row.get('category')) else "Medicine"
        unit = sanitize_csv_value(row.get('unit')) if 'unit' in df.columns and pd.notna(row.get('unit')) else "unit"
        qty = int(row.get('quantity', 0))
        min_t = int(row.get('min_threshold', 0)) if 'min_threshold' in df.columns else 0
        price = int(row.get('price', row.get('price_of_1_unit', 0))) if ('price' in df.columns or 'price_of_1_unit' in df.columns) else 0
        
        # Check if item exists with same item_code, or fallback to name and price
        existing_item = None
        if item_code:
            existing_item = db.query(InventoryItem).filter(
                InventoryItem.hospital_id == hospital_id,
                InventoryItem.item_code == item_code
            ).first()
            
        if not existing_item:
            existing_item = db.query(InventoryItem).filter(
                InventoryItem.hospital_id == hospital_id,
                func.lower(InventoryItem.name) == name.lower(),
                InventoryItem.price == price
            ).first()

        if existing_item:
            existing_item.quantity += qty
            existing_item.status = "Normal" if existing_item.quantity > existing_item.min_threshold else "Low Stock"
            db.flush()
            
            if existing_item.status == "Low Stock":
                notif = Notification(
                    user_id=current_user.id,
                    title="Low Stock Alert (CSV Update)",
                    message=f"Item {existing_item.name} updated but still has low stock ({existing_item.quantity}/{existing_item.min_threshold})."
                )
                db.add(notif)
            
            log_inventory_change(db, existing_item.id, "RESTOCK", qty, current_user.id, "CSV Bulk Upload Update")
        else:
            item = InventoryItem(
                hospital_id=hospital_id,
                name=name,
                item_code=item_code,
                category=cat,
                quantity=qty,
                unit=unit,
                price=price,
                min_threshold=min_t,
                status="Normal" if qty > min_t else "Low Stock"
            )
            db.add(item)
            db.flush() # flush to get item.id without committing whole transaction yet
            
            if item.status == "Low Stock":
                notif = Notification(
                    user_id=current_user.id,
                    title="Low Stock Alert (CSV)",
                    message=f"Item {item.name} uploaded with low stock ({item.quantity}/{item.min_threshold})."
                )
                db.add(notif)
            
            log_inventory_change(db, item.id, "RESTOCK", qty, current_user.id, "CSV Bulk Upload")
        
        items_added += 1
        
    db.commit()
    return {"message": f"Successfully imported {items_added} items."}

@router.post("/analyze-ai")
@limiter.limit("5/minute")
def analyze_inventory_ai(
    request: Request,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.PHARMACIST, UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    # Fetch recent logs or current stock for analysis
    items = db.query(InventoryItem).filter(InventoryItem.hospital_id == hospital_id).all()
    data = [{"name": i.name, "qty": i.quantity, "status": i.status} for i in items]
    
    import json
    insights_json = get_inventory_insights(data)
    try:
        if insights_json.startswith("```json"):
            insights_json = insights_json[7:-3].strip()
        elif insights_json.startswith("```"):
            insights_json = insights_json[3:-3].strip()
        return json.loads(insights_json)
    except Exception:
        return {"raw_insights": insights_json}

@router.get("/logs")
def get_inventory_logs(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user)
):
    query = db.query(InventoryLog).join(InventoryItem).filter(InventoryItem.hospital_id == hospital_id)
    total = query.count()
    logs = query.order_by(InventoryLog.timestamp.desc()).offset(offset).limit(limit).all()
    
    # Enrich each log with the item name from the relationship
    data = []
    for log in logs:
        data.append({
            "id": log.id,
            "inventory_id": log.inventory_id,
            "item_name": log.item.name if log.item else f"Item #{log.inventory_id}",
            "change_type": log.change_type,
            "change_amount": log.change_amount,
            "reason": log.reason,
            "performed_by_user_id": log.performed_by_user_id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        })
    
    return {"data": data, "total": total, "limit": limit, "offset": offset}

class RequestCreate(BaseModel):
    item_name: str
    message: str

@router.post("/requests")
def submit_inventory_request(
    request: RequestCreate,
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(get_current_user)
):
    phc = db.query(HealthCentre).filter(HealthCentre.id == hospital_id).first()
    if not phc:
        raise HTTPException(status_code=404, detail="Health centre not found")
        
    new_req = ResourceRequest(
        requesting_phc_id=hospital_id,
        target_district=phc.district,
        resource_type="Medicine",
        resource_name=request.item_name,
        quantity=0, # Variable quantity could be added to schema later
        urgency="CRITICAL",
        status="PENDING",
        notes=request.message
    )
    db.add(new_req)
    db.commit()
    return {"message": f"Request for {request.item_name} submitted to district admin successfully", "status": "PENDING"}

@router.get("/requests")
def get_inventory_requests(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id),
    current_user: User = Depends(get_current_user)
):
    requests = db.query(ResourceRequest).filter(ResourceRequest.requesting_phc_id == hospital_id).order_by(ResourceRequest.created_at.desc()).all()
    return requests
