import sys
import os
import random
from datetime import datetime, timedelta, timezone

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from passlib.context import CryptContext
from app.db.database import SessionLocal, engine
from app.models import Nation, District, HealthCentre, User, InventoryItem, InventoryLog, Base
from app.models.user import UserRole
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def seed_data():
    db = SessionLocal()
    
    # 1. Create Nations
    nations_data = [
        {"name": "India", "iso_code": "IND", "region": "ap-south-1"},
        {"name": "Brazil", "iso_code": "BRA", "region": "sa-east-1"},
        {"name": "South Africa", "iso_code": "ZAF", "region": "af-south-1"},
    ]
    
    # Reset sequence because of manual insert in migration
    db.execute(Base.metadata.tables['nations'].delete().where(Base.metadata.tables['nations'].c.name.in_(['Brazil', 'South Africa'])))
    db.commit()
    db.execute(Base.metadata.tables['districts'].delete().where(Base.metadata.tables['districts'].c.name.like('%Brazil%')))
    db.execute(Base.metadata.tables['districts'].delete().where(Base.metadata.tables['districts'].c.name.like('%South Africa%')))
    db.commit()
    
    nations = {}
    for i, nd in enumerate(nations_data):
        nation = db.query(Nation).filter(Nation.iso_code == nd["iso_code"]).first()
        if not nation:
            # Force ID if needed to avoid sequence conflicts, or let it crash
            nation = Nation(id=i+1, name=nd["name"], iso_code=nd["iso_code"], data_residency_region=nd["region"])
            db.add(nation)
            db.commit()
            db.refresh(nation)
        nations[nd["iso_code"]] = nation

    
    logger.info("Nations seeded.")


    # 2. Create Nation Admin Users
    admin_pw = get_password_hash("password123")
    for iso, nation in nations.items():
        username = f"admin_{iso.lower()}"
        admin_user = db.query(User).filter(User.username == username).first()
        if not admin_user:
            admin_user = User(
                username=username,
                email=f"{username}@example.com",
                hashed_password=admin_pw,
                role=UserRole.NATION_ADMIN
            )
            db.add(admin_user)
            db.commit()
    
    logger.info("Nation admins seeded.")

    # 3. Create Districts & Health Centres
    # For simplicity, 1 district per nation, 2 PHCs per district
    phcs = {}
    
    for iso, nation in nations.items():
        district_name = f"District 1 {nation.name}"
        district = db.query(District).filter(District.name == district_name, District.nation_id == nation.id).first()
        if not district:
            district = District(name=district_name, state=f"State {nation.name}", nation_id=nation.id)
            db.add(district)
            db.commit()
            db.refresh(district)
        
        phcs[iso] = []
        for i in range(1, 3):
            hc_name = f"PHC {i} {district.name}"
            hc = db.query(HealthCentre).filter(HealthCentre.name == hc_name, HealthCentre.district == district.name).first()
            if not hc:
                hc = HealthCentre(
                    name=hc_name,
                    type="PHC",
                    district=district.name,
                    state=district.state,
                    total_beds=20,
                    available_beds=20,
                    latitude=random.uniform(-30, 30),
                    longitude=random.uniform(-30, 30)
                )
                db.add(hc)
                db.commit()
                db.refresh(hc)
            phcs[iso].append(hc)

    logger.info("Districts and Health Centres seeded.")

    # Create a generic Medical Officer to assign logs to
    mo_user = db.query(User).filter(User.username == "generic_mo").first()
    if not mo_user:
        mo_user = User(
            username="generic_mo",
            email="generic_mo@example.com",
            hashed_password=admin_pw,
            role=UserRole.MEDICAL_OFFICER
        )
        db.add(mo_user)
        db.commit()
        db.refresh(mo_user)

    # 4. Generate Synthetic Inventory Data for category "Antibiotics"
    # Target item: "Amoxicillin 500mg"
    target_category = "Antibiotics"
    target_item_name = "Amoxicillin 500mg"
    
    now = datetime.now(timezone.utc)
    
    # We will generate logs going back 90 days
    start_date = now - timedelta(days=90)
    
    for iso, hc_list in phcs.items():
        is_india = (iso == "IND")
        
        for hc in hc_list:
            item = db.query(InventoryItem).filter(InventoryItem.hospital_id == hc.id, InventoryItem.name == target_item_name).first()
            if not item:
                item = InventoryItem(
                    hospital_id=hc.id,
                    name=target_item_name,
                    item_code="AMOX-500",
                    category=target_category,
                    quantity=1000,
                    unit="Tablets",
                    price=5,
                    min_threshold=200
                )
                db.add(item)
                db.commit()
                db.refresh(item)
            
            # Check if we already have logs to prevent duplicating seed
            existing_logs = db.query(InventoryLog).filter(InventoryLog.inventory_id == item.id).count()
            if existing_logs > 0:
                continue
                
            current_date = start_date
            current_qty = 1000
            
            # Add initial restock
            log = InventoryLog(
                inventory_id=item.id,
                change_type="RESTOCK",
                change_amount=1000,
                performed_by_user_id=mo_user.id,
                timestamp=current_date
            )
            db.add(log)
            
            while current_date < now:
                # India gets dense history, others get sparse
                if is_india:
                    # Daily logs
                    dispense = random.randint(5, 20)
                    
                    # Create an outbreak spike 30-15 days ago
                    days_ago = (now - current_date).days
                    if 15 <= days_ago <= 30:
                        dispense = random.randint(50, 100) # massive spike
                else:
                    # Sparse logs: skip days
                    if random.random() < 0.7:
                        current_date += timedelta(days=1)
                        continue
                    dispense = random.randint(1, 10)
                
                if current_qty - dispense < 0:
                    # Restock
                    restock_amt = 500 if not is_india else 1000
                    current_qty += restock_amt
                    log = InventoryLog(
                        inventory_id=item.id,
                        change_type="RESTOCK",
                        change_amount=restock_amt,
                        performed_by_user_id=mo_user.id,
                        timestamp=current_date
                    )
                    db.add(log)
                
                current_qty -= dispense
                log = InventoryLog(
                    inventory_id=item.id,
                    change_type="DISPENSE",
                    change_amount=-dispense,
                    performed_by_user_id=mo_user.id,
                    timestamp=current_date
                )
                db.add(log)
                
                current_date += timedelta(days=1)
            
            # Update final quantity
            item.quantity = current_qty
            db.commit()

    logger.info("Inventory data and logs seeded successfully.")
    db.close()

if __name__ == "__main__":
    seed_data()
