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
                "email": "admin@empresa.com",
                "password": "admin123",
                "full_name": "Administrador",
                "is_admin": True,
                "sector_id": sectors["ti"].id
            },
            {
                "email": "rh@empresa.com",
                "password": "rh123",
                "full_name": "Colaborador RH",
                "is_admin": False,
                "sector_id": sectors["rh"].id
            },
            {
                "email": "ti@empresa.com",
                "password": "ti123",
                "full_name": "Desenvolvedor",
                "is_admin": False,
                "sector_id": sectors["ti"].id
            },
            {
                "email": "financeiro@empresa.com",
                "password": "fin123",
                "full_name": "Analista Financeiro",
                "is_admin": False,
                "sector_id": sectors["financeiro"].id
            },
            {
                "email": "marketing@empresa.com",
                "password": "mkt123",
                "full_name": "Gerente de Marketing",
                "is_admin": False,
                "sector_id": sectors["marketing"].id
            },
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
            automations_data = [
            {
                "title": "Ponto Eletrônico",
                "description": "Sistema de registro de ponto eletrônico",
                "target_url": "https://ponto.empresa.com",
                "icon": "clock",
                "sector_ids": [sectors["rh"].id, sectors["ti"].id]
            },
            {
                "title": "Gestão de Férias",
                "description": "Sistema de gerenciamento de férias e folgas",
                "target_url": "https://ferias.empresa.com",
                "icon": "calendar",
                "sector_ids": [sectors["rh"].id]
            },
            {
                "title": "Folha de Pagamento",
                "description": "Sistema de folha de pagamento",
                "target_url": "https://folha.empresa.com",
                "icon": "dollar",
                "sector_ids": [sectors["financeiro"].id, sectors["rh"].id]
            },
            {
                "title": "Gestão de Projetos",
                "description": "Sistema de gerenciamento de projetos ágeis",
                "target_url": "https://projetos.empresa.com",
                "icon": "folder",
                "sector_ids": [sectors["ti"].id, sectors["marketing"].id, sectors["operacoes"].id]
            },
            {
                "title": "Help Desk TI",
                "description": "Sistema de tickets e suporte técnico",
                "target_url": "https://suporte.empresa.com",
                "icon": "headset",
                "sector_ids": [sectors["ti"].id]
            },
            {
                "title": "Contas a Pagar",
                "description": "Gestão de contas a pagar",
                "target_url": "https://contaspagar.empresa.com",
                "icon": "credit-card",
                "sector_ids": [sectors["financeiro"].id]
            },
            {
                "title": "Contas a Receber",
                "description": "Gestão de contas a receber",
                "target_url": "https://contasreceber.empresa.com",
                "icon": "trending-up",
                "sector_ids": [sectors["financeiro"].id]
            },
            {
                "title": "CRM Marketing",
                "description": "CRM para gestão de campanhas de marketing",
                "target_url": "https://crm.empresa.com",
                "icon": "users",
                "sector_ids": [sectors["marketing"].id]
            },
            {
                "title": "Automação de E-mails",
                "description": "Plataforma de automação de e-mail marketing",
                "target_url": "https://email.empresa.com",
                "icon": "mail",
                "sector_ids": [sectors["marketing"].id, sectors["rh"].id]
            },
            {
                "title": "Gestão de Estoque",
                "description": "Controle de estoque e inventário",
                "target_url": "https://estoque.empresa.com",
                "icon": "package",
                "sector_ids": [sectors["operacoes"].id]
            },
            {
                "title": "Controle de Acesso",
                "description": "Sistema de controle de acesso e segurança",
                "target_url": "https://acesso.empresa.com",
                "icon": "lock",
                "sector_ids": [sectors["ti"].id, sectors["rh"].id, sectors["operacoes"].id]
            },
            {
                "title": "Dashboard BI",
                "description": "Dashboards de business intelligence",
                "target_url": "https://bi.empresa.com",
                "icon": "bar-chart",
                "sector_ids": [sectors["financeiro"].id, sectors["marketing"].id, sectors["operacoes"].id, sectors["ti"].id]
            },
        ]
        
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
