from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class InventoryItemBase(BaseModel):
    item_code: Optional[str] = None
    name: str
    category: str
    quantity: int = 0
    unit: str
    price: int = 0
    min_threshold: int = 0
    expiry_date: Optional[date] = None
    batch_number: Optional[str] = None
    status: str = "Normal"

class InventoryItemCreate(InventoryItemBase):
    hospital_id: Optional[int] = None

class InventoryItemUpdate(BaseModel):
    item_code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    price: Optional[int] = None
    min_threshold: Optional[int] = None
    expiry_date: Optional[date] = None
    batch_number: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    patient_code: Optional[str] = None

class InventoryItemResponse(InventoryItemBase):
    id: int
    hospital_id: int

    model_config = {"from_attributes": True}

class InventoryLogResponse(BaseModel):
    id: int
    inventory_id: int
    item_name: Optional[str] = None
    change_type: str
    change_amount: int
    reason: Optional[str] = None
    performed_by_user_id: int
    timestamp: datetime

    model_config = {"from_attributes": True}
