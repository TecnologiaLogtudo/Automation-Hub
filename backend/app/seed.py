"""Seed initial data for the database"""
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
from app.models import Sector, User, Automation
from app.auth import get_password_hash


def seed_initial_data():
    """Seed initial sectors, users, and automations"""
    db = SessionLocal()
    
    try:
        # 1. Sectors (Ensure they exist)
        sectors = {}
        existing_sectors = db.query(Sector).all()
        
        if existing_sectors:
            print("✓ Sectors already exist")
            for s in existing_sectors:
                sectors[s.slug] = s
        else:
            print("Seeding sectors...")
            sectors_data = [
                {"name": "Recursos Humanos", "slug": "rh", "description": "Setor de Recursos Humanos"},
                {"name": "Tecnologia da Informação", "slug": "ti", "description": "Setor de TI"},
                {"name": "Financeiro", "slug": "financeiro", "description": "Setor Financeiro"},
                {"name": "Marketing", "slug": "marketing", "description": "Setor de Marketing"},
                {"name": "Operações", "slug": "operacoes", "description": "Setor de Operações"},
            ]
            
            for sector_data in sectors_data:
                sector = Sector(**sector_data)
                db.add(sector)
                db.flush()
                sectors[sector.slug] = sector
            db.commit()
        
        # 2. Users (Create if missing)
        if db.query(User).first():
            print("✓ Users already exist")
        else:
            print("Seeding users...")
            users_data = [
                {
                    "email": "admin@logtudo.com.br",
                    "password": "admin", # Altere a senha logo após o primeiro login!
                    "full_name": "Administrador",
                    "is_admin": True,
                    "sector_id": sectors["ti"].id
                }
            ]
        
            for user_data in users_data:
                password = user_data.pop("password")
                user = User(
                    **user_data,
                    password_hash=get_password_hash(password)
                )
                db.add(user)
            db.commit()
        
        # 3. Automations (Create if missing)
        if db.query(Automation).first():
            print("✓ Automations already exist")
        else:
            print("Seeding automations...")
            automations_data = []
        
            # Create ID map for easier lookup
            sectors_by_id = {s.id: s for s in sectors.values()}

            for automation_data in automations_data:
                sector_ids = automation_data.pop("sector_ids")
                automation = Automation(**automation_data)
                db.add(automation)
                db.flush()
                
                for sector_id in sector_ids:
                    if sector_id in sectors_by_id:
                        automation.sectors.append(sectors_by_id[sector_id])
            
            db.commit()
            
        print("✓ Initial data seeded successfully")
        
    except Exception as e:
        print(f"Error seeding data: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    Base.metadata.create_all(bind=engine)
    seed_initial_data()
