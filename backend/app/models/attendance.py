from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.models.base import Base

class Doctor(Base):
    __tablename__ = "doctors"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("health_centres.id"), nullable=False, index=True)
    name = Column(String, nullable=False, index=True)
    specialization = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    shift = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    attendance_records = relationship("AttendanceRecord", back_populates="doctor")
    user = relationship("User", foreign_keys=[user_id])


class DailyQRSession(Base):
    __tablename__ = "daily_qr_sessions"

    id = Column(Integer, primary_key=True, index=True)
    hospital_id = Column(Integer, ForeignKey("health_centres.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    qr_token = Column(String, unique=True, nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    device_lat = Column(Float, nullable=True)
    device_lng = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    records = relationship("AttendanceRecord", back_populates="session")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    session_id = Column(Integer, ForeignKey("daily_qr_sessions.id"), nullable=False, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, nullable=False) # PRESENT/LATE
    scanned_via = Column(String, nullable=True)

    doctor = relationship("Doctor", back_populates="attendance_records")
    user = relationship("User", back_populates="attendance_records")
    session = relationship("DailyQRSession", back_populates="records")

class RandomAttendanceCheck(Base):
    __tablename__ = "random_attendance_checks"

    id = Column(Integer, primary_key=True, index=True)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False, index=True)
    session_id = Column(Integer, ForeignKey("daily_qr_sessions.id"), nullable=False, index=True)
    issued_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String, default="PENDING", index=True) # PENDING, COMPLETED, MISSED

    doctor = relationship("Doctor")
    session = relationship("DailyQRSession")
