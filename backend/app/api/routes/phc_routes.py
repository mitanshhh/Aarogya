from fastapi import APIRouter, Depends, HTTPException, Response, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc
from app.db.database import get_db
from app.models.health_centre import HealthCentre
from app.models.user import User, UserRole
from app.schemas.health_centre import HealthCentreCreateResponse, HealthCentreResponse, HealthCentreUpdate, HealthCentreBase
from app.api.dependencies import get_current_user, require_role, resolve_hospital_id
from app.core.security import get_password_hash
from app.services.email_service import send_onboarding_email
from app.services.health_score import calculate_health_score, calculate_batch_health_scores
import secrets

router = APIRouter()

@router.get("/my-centre", response_model=HealthCentreResponse)
def get_my_centre(
    db: Session = Depends(get_db),
    hospital_id: int = Depends(resolve_hospital_id)
):
    hc = db.query(HealthCentre).filter(HealthCentre.id == hospital_id).first()
    if not hc:
        raise HTTPException(status_code=404, detail="Health centre not found")
    return hc

@router.put("/update", response_model=HealthCentreResponse)
def update_my_centre(
    update_data: HealthCentreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.MEDICAL_OFFICER, UserRole.DISTRICT_ADMIN])),
    hospital_id: int = Depends(resolve_hospital_id)
):
    hc = db.query(HealthCentre).filter(HealthCentre.id == hospital_id).first()
    if not hc:
        raise HTTPException(status_code=404, detail="Health centre not found")
    
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(hc, key, value)
    
    db.commit()
    db.refresh(hc)
    return hc

@router.get("/filters")
def get_filters(db: Session = Depends(get_db)):
    types = [t[0] for t in db.query(HealthCentre.type).distinct().all() if t[0]]
    districts = [d[0] for d in db.query(HealthCentre.district).distinct().all() if d[0]]
    locations = [l[0] for l in db.query(HealthCentre.location).distinct().all() if l[0]]
    statuses = [s[0] for s in db.query(HealthCentre.status).distinct().all() if s[0]]
    
    all_locations = list(set(districts + locations))
    
    return {
        "types": sorted(types),
        "districts": sorted(all_locations),
        "statuses": sorted(statuses)
    }

@router.get("", response_model=list[HealthCentreResponse])
def get_all_centres(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    search: Optional[str] = None,
    type: Optional[str] = None,
    location: Optional[str] = None,
    status: Optional[str] = None,
    min_score: Optional[int] = None,
    max_score: Optional[int] = None,
    sort_by: Optional[str] = "id",
    sort_desc: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000)
):
    query = db.query(HealthCentre)
    
    if current_user.role == UserRole.NATION_ADMIN and current_user.nation_id:
        query = query.filter(HealthCentre.nation_id == current_user.nation_id)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                HealthCentre.name.ilike(search_filter),
                HealthCentre.location.ilike(search_filter),
                HealthCentre.district.ilike(search_filter),
                HealthCentre.medical_officer.ilike(search_filter)
            )
        )
    
    if type and type != "All Types":
        query = query.filter(HealthCentre.type == type)
    if location and location != "All Districts":
        # using ilike for generic matching or exact match if preferred
        query = query.filter(or_(HealthCentre.location == location, HealthCentre.district == location))
    if status and status != "All Statuses":
        query = query.filter(HealthCentre.status.ilike(status))
    
    # We will fetch all and do score filtering and sorting in memory
    # because health_score is dynamically calculated.
    centres = query.all()
    
    # Calculate live health score in batch
    centre_ids = [c.id for c in centres]
    scores = calculate_batch_health_scores(db, centre_ids)
    
    for c in centres:
        c.health_score = int(scores.get(c.id, 0.0))
        
    if min_score is not None:
        centres = [c for c in centres if c.health_score >= min_score]
    if max_score is not None:
        centres = [c for c in centres if c.health_score <= max_score]
        
    total_count = len(centres)
    
    if sort_by and hasattr(HealthCentre, sort_by):
        reverse = bool(sort_desc)
        centres.sort(key=lambda x: getattr(x, sort_by, getattr(x, 'id')), reverse=reverse)
    else:
        centres.sort(key=lambda x: x.id)
        
    centres = centres[skip: skip + limit]
    
    response.headers["X-Total-Count"] = str(total_count)
    # Allows frontend to read the custom header in CORS if applicable (assuming CORS config allows it or they are same-origin)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    
    return centres

@router.post("", response_model=HealthCentreCreateResponse)
def create_centre(
    centre_data: HealthCentreBase,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    hc = HealthCentre(**centre_data.model_dump())
    db.add(hc)
    db.commit()
    db.refresh(hc)

    admin_user_created = False
    email_sent = False
    email_detail = "No admin email provided; onboarding email was not sent."
    
    # Auto-create Medical Officer account for this new PHC
    if getattr(hc, 'admin_email', None):
        admin_email = str(hc.admin_email)
        existing_user = (
            db.query(User)
            .filter(or_(User.email == admin_email, User.username == admin_email))
            .first()
        )
        if existing_user:
            email_detail = "Admin user already exists for this email; onboarding email was not sent."
        else:
            password = secrets.token_urlsafe(12)
            new_user = User(
                username=admin_email,
                email=admin_email,
                hashed_password=get_password_hash(password),
                role=UserRole.MEDICAL_OFFICER,
                hospital_id=hc.id
            )
            db.add(new_user)
            db.flush()

            delivery = send_onboarding_email(
                email_to=admin_email,
                username=admin_email,
                raw_password=password,
                centre_name=hc.name,
            )
            email_sent = delivery.sent
            email_detail = delivery.detail
            
            # Always commit the user even if email fails (useful on Render free tier where SMTP is blocked)
            db.commit()
            admin_user_created = True
            
            if not email_sent:
                email_detail += f" The account was still created. Give them this password manually: {password}"

    response = HealthCentreCreateResponse.model_validate(hc).model_dump()
    response.update({
        "admin_user_created": admin_user_created,
        "email_sent": email_sent,
        "email_detail": email_detail,
    })
    return response

@router.put("/{hc_id}", response_model=HealthCentreResponse)
def update_centre_by_id(
    hc_id: int,
    update_data: HealthCentreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    hc = db.query(HealthCentre).filter(HealthCentre.id == hc_id).first()
    if not hc:
        raise HTTPException(status_code=404, detail="Health centre not found")
    
    for key, value in update_data.model_dump(exclude_unset=True).items():
        setattr(hc, key, value)
    
    db.commit()
    db.refresh(hc)
    return hc

@router.delete("/{hc_id}")
def delete_centre(
    hc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.DISTRICT_ADMIN, UserRole.DEVELOPER]))
):
    hc = db.query(HealthCentre).filter(HealthCentre.id == hc_id).first()
    if not hc:
        raise HTTPException(status_code=404, detail="Health centre not found")
    
    db.delete(hc)
    db.commit()
    return {"message": "Health centre deleted successfully"}
