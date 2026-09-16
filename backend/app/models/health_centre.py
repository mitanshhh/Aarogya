from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class HealthCentre(Base):
    __tablename__ = "health_centres"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    type = Column(String, nullable=False) # PHC/CHC/Hospital
    nation_id = Column(Integer, ForeignKey("nations.id"), nullable=True, index=True)
    district = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False)
    total_beds = Column(Integer, default=0)
    available_beds = Column(Integer, default=0)
    total_staff = Column(Integer, default=0)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    contact_number = Column(String, nullable=True)
    email = Column(String, nullable=True)
    medical_officer = Column(String, nullable=True)
    phc_id = Column(String, nullable=True)
    admin_email = Column(String, nullable=True)
    admin_mobile = Column(String, nullable=True)
    location = Column(String, nullable=True)
    health_score = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    status = Column(String, default="Active")

    # Relationships
    staff = relationship("User", back_populates="hospital")
    inventory_items = relationship("InventoryItem", back_populates="hospital")
    beds = relationship("Bed", back_populates="hospital")
    patients = relationship("Patient", back_populates="hospital")
