from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class District(Base):
    __tablename__ = "districts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    state = Column(String, nullable=False)
    nation_id = Column(Integer, ForeignKey("nations.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    nation = relationship("Nation", back_populates="districts")

class ResourceRequest(Base):
    __tablename__ = "resource_requests"

    id = Column(Integer, primary_key=True, index=True)
    requesting_phc_id = Column(Integer, ForeignKey("health_centres.id"), nullable=False, index=True)
    requested_by_user_id = Column(Integer, nullable=True)
    target_district = Column(String, nullable=False, index=True)
    resource_type = Column(String, nullable=False) # Medicine/Equipment/Staff/Beds
    resource_name = Column(String, nullable=True) # Name of the specific item being requested
    quantity = Column(Integer, nullable=False)
    urgency = Column(String, nullable=False) # LOW/MEDIUM/HIGH/CRITICAL
    status = Column(String, default="PENDING", index=True) # PENDING/APPROVED/REJECTED/FULFILLED
    notes = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
