from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class Nation(Base):
    __tablename__ = "nations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    iso_code = Column(String(3), unique=True, index=True, nullable=False)
    data_residency_region = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    districts = relationship("District", back_populates="nation")
