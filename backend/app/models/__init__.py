from app.models.base import Base
from app.models.user import User, RefreshToken
from app.models.health_centre import HealthCentre
from app.models.inventory import InventoryItem, InventoryLog
from app.models.patient import Patient, PatientAuditLog
from app.models.bed import Bed
from app.models.attendance import Doctor, DailyQRSession, AttendanceRecord
from app.models.district import ResourceRequest, District
from app.models.report import Report
from app.models.notification import Notification
from app.models.nation import Nation
from app.models.forecast import MedicineForecast
from app.models.federation import FederatedModelVersion

# This file imports all models so Alembic can discover them
__all__ = [
    "Base",
    "Nation",
    "District",
    "MedicineForecast",
    "User",
    "RefreshToken",
    "HealthCentre",
    "InventoryItem",
    "InventoryLog",
    "Patient",
    "PatientAuditLog",
    "Bed",
    "Doctor",
    "DailyQRSession",
    "AttendanceRecord",
    "ResourceRequest",
    "Report",
    "Notification",
    "FederatedModelVersion"
]
