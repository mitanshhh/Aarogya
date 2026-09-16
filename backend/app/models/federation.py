from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from app.models.base import Base

class FederatedModelVersion(Base):
    __tablename__ = "federated_model_versions"

    id = Column(Integer, primary_key=True, index=True)
    nation_id = Column(Integer, ForeignKey("nations.id"), nullable=False)
    category = Column(String, index=True, nullable=False)
    
    # Store JSON strings for coefficients
    local_coef = Column(String)
    local_intercept = Column(Float)
    local_mae = Column(Float)
    
    global_coef = Column(String, nullable=True)
    global_intercept = Column(Float, nullable=True)
    global_mae = Column(Float, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
