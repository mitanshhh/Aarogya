from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime

class DailyQRSessionResponse(BaseModel):
    id: int
    hospital_id: int
    date: date
    qr_token: str
    is_active: bool

    model_config = {"from_attributes": True}

class AttendanceRecordResponse(BaseModel):
    id: int
    doctor_id: Optional[int] = None
    user_id: Optional[int] = None
    timestamp: datetime
    status: str
    scanned_via: Optional[str] = None

    model_config = {"from_attributes": True}

class QRScanRequest(BaseModel):
    qr_token: str
    lat: float
    lng: float

class QRGenerateRequest(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
