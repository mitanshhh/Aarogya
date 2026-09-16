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

class AggregatorLocalUpdate(Base):
    __tablename__ = "aggregator_local_updates"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, index=True, nullable=False)
    nation_id = Column(Integer, index=True, nullable=False)
    nation_name = Column(String, nullable=False)
    phc_name = Column(String, nullable=False)
    
    coef = Column(String, nullable=False) # JSON string
    intercept = Column(Float, nullable=False)
    mae = Column(Float, nullable=False)
    
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class AggregatorGlobalModel(Base):
    __tablename__ = "aggregator_global_models"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String, unique=True, index=True, nullable=False)
    
    coef = Column(String, nullable=False) # JSON string
    intercept = Column(Float, nullable=False)
    version = Column(Integer, default=0)
    
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
