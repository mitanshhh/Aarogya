from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, Date
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class MedicineForecast(Base):
    __tablename__ = "medicine_forecasts"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("health_centres.id"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    projected_stockout_date = Column(Date, nullable=True)
    confidence = Column(Float, nullable=False, default=0.0)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    hospital = relationship("HealthCentre")
    item = relationship("InventoryItem")
