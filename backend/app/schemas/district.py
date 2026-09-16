from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ResourceRequestBase(BaseModel):
    target_district: str
    resource_type: str
    resource_name: Optional[str] = None
    quantity: int
    urgency: str
    notes: Optional[str] = None

class ResourceRequestCreate(ResourceRequestBase):
    pass

class ResourceRequestUpdate(BaseModel):
    status: str # PENDING_ADMIN/PENDING_DONOR/SHIPPED/COMPLETED/REJECTED
    admin_note: Optional[str] = None
    donor_phc_id: Optional[int] = None

class ResourceRequestResponse(ResourceRequestBase):
    id: int
    requesting_phc_id: int
    donor_phc_id: Optional[int] = None
    requested_by_user_id: Optional[int] = None
    status: str
    admin_note: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
