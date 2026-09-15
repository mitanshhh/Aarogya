from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
import random

from app.db.database import SessionLocal
from app.models.attendance import RandomAttendanceCheck, AttendanceRecord, DailyQRSession
from app.models.notification import Notification

scheduler = BackgroundScheduler()

def trigger_random_attendance_check(doctor_id: int, session_id: int):
    """Fired randomly between 1 to 4 hours after initial check-in."""
    db: Session = SessionLocal()
    try:
        # Verify the doctor hasn't already left or been marked absent
        record = db.query(AttendanceRecord).filter(
            AttendanceRecord.doctor_id == doctor_id,
            AttendanceRecord.session_id == session_id
        ).first()
        
        if not record or record.status != "PRESENT":
            return # Don't trigger if they are already absent or no record exists
            
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(minutes=2)
        
        # Create the random check
        check = RandomAttendanceCheck(
            doctor_id=doctor_id,
            session_id=session_id,
            issued_at=now,
            expires_at=expires_at,
            status="PENDING"
        )
        db.add(check)
        db.flush()
        
        # Create a notification for the doctor
        notif = Notification(
            user_id=record.doctor.user_id,
            title="Action Required: Random Verification",
            message="Please scan the live QR code at the Medical Officer's desk within 2 minutes to verify your attendance."
        )
        if record.doctor.user_id:
            db.add(notif)
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error in random attendance check trigger: {e}")
    finally:
        db.close()

def schedule_random_check(doctor_id: int, session_id: int):
    """Schedules the random check to happen in 1 to 4 hours."""
    delay_minutes = random.randint(60, 240)
    run_time = datetime.now(timezone.utc) + timedelta(minutes=delay_minutes)
    
    scheduler.add_job(
        trigger_random_attendance_check,
        trigger=DateTrigger(run_date=run_time),
        args=[doctor_id, session_id],
        id=f"random_check_{session_id}_{doctor_id}",
        replace_existing=True
    )

def enforce_check_expirations():
    """Runs every minute to check for expired pending checks."""
    db: Session = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired_checks = db.query(RandomAttendanceCheck).filter(
            RandomAttendanceCheck.status == "PENDING",
            RandomAttendanceCheck.expires_at < now
        ).all()
        
        for check in expired_checks:
            check.status = "MISSED"
            
            # Mark the doctor as absent
            record = db.query(AttendanceRecord).filter(
                AttendanceRecord.doctor_id == check.doctor_id,
                AttendanceRecord.session_id == check.session_id
            ).first()
            
            if record:
                record.status = "ABSENT"
                
                # Notify them that they missed it
                if check.doctor.user_id:
                    notif = Notification(
                        user_id=check.doctor.user_id,
                        title="Attendance Revoked",
                        message="You failed to complete the random verification in time. Your attendance has been marked as ABSENT."
                    )
                    db.add(notif)
                    
        if expired_checks:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error enforcing check expirations: {e}")
    finally:
        db.close()

def run_weekly_ml_forecasting():
    from app.api.routes.ml_routes import calculate_and_save_forecast
    from app.models.health_centre import HealthCentre
    db: Session = SessionLocal()
    try:
        print("Starting scheduled weekly ML forecasting...")
        hospitals = db.query(HealthCentre).all()
        for h in hospitals:
            try:
                calculate_and_save_forecast(h.id, db)
            except Exception as e:
                print(f"Failed to forecast for hospital {h.id}: {e}")
        print("Completed weekly ML forecasting.")
    except Exception as e:
        print(f"Error in weekly ML forecasting: {e}")
    finally:
        db.close()

def start_scheduler():
    if not scheduler.running:
        # Add the minute-by-minute expiration cron
        scheduler.add_job(
            enforce_check_expirations,
            "interval",
            minutes=1,
            id="enforce_expirations",
            replace_existing=True
        )
        
        # Add the weekly ML forecasting cron (runs every Sunday at 00:00)
        scheduler.add_job(
            run_weekly_ml_forecasting,
            "cron",
            day_of_week="sun",
            hour=0,
            minute=0,
            id="weekly_ml_forecasting",
            replace_existing=True
        )
        scheduler.start()

def shutdown_scheduler():
    if scheduler.running:
        scheduler.shutdown()
