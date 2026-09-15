from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

class PatientBase(BaseModel):
    patient_code: Optional[str] = None
    name: str
    age: int
    dob: Optional[date] = None
    gender: str
    contact: Optional[str] = None
    address: Optional[str] = None
    medical_history: Optional[str] = None

class PatientCreate(PatientBase):
    hospital_id: Optional[int] = None

class PatientUpdate(BaseModel):
    patient_code: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    contact: Optional[str] = None
    address: Optional[str] = None
    medical_history: Optional[str] = None
    status: Optional[str] = None

class PatientResponse(PatientBase):
    id: int
    hospital_id: int
    hospital_name: Optional[str] = None
    patient_code: Optional[str] = None
    status: str
    admitted_at: datetime
    discharged_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
