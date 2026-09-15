from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("health_centres.id"), nullable=False, index=True)
    patient_code = Column(String, nullable=True, unique=True, index=True)
    name = Column(String, nullable=False, index=True)
    age = Column(Integer, nullable=False)
    dob = Column(Date, nullable=True)
    gender = Column(String, nullable=False)
    contact = Column(String, nullable=True)
    address = Column(String, nullable=True)
    medical_history = Column(Text, nullable=True)
    status = Column(String, nullable=False, index=True) # Admitted/Discharged/Outpatient
    admitted_at = Column(DateTime(timezone=True), server_default=func.now())
    discharged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    hospital = relationship("HealthCentre", back_populates="patients")
    
    @property
    def hospital_name(self):
        return self.hospital.name if self.hospital else None
    bed = relationship("Bed", back_populates="patient", uselist=False)
    audit_logs = relationship("PatientAuditLog", back_populates="patient", cascade="all, delete-orphan")


class PatientAuditLog(Base):
    __tablename__ = "patient_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String, nullable=False) # VIEW/EDIT/CREATE
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    details = Column(Text, nullable=True)

    patient = relationship("Patient", back_populates="audit_logs")
