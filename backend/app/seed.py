"""Seed initial data for the database"""
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine, Base
from app.models import Sector, User, Automation
from app.auth import get_password_hash


def seed_initial_data():
    """Seed initial sectors, users, and automations"""
    db = SessionLocal()
    
    try:
        # Check if data already exists
        if db.query(Sector).first() is not None:
            return  # Data already seeded
        
        # Create sectors
        sectors_data = [
            {"name": "Recursos Humanos", "slug": "rh", "description": "Setor de Recursos Humanos"},
            {"name": "Tecnologia da Informação", "slug": "ti", "description": "Setor de TI"},
            {"name": "Financeiro", "slug": "financeiro", "description": "Setor Financeiro"},
            {"name": "Marketing", "slug": "marketing", "description": "Setor de Marketing"},
            {"name": "Operações", "slug": "operacoes", "description": "Setor de Operações"},
        ]
        
        sectors = {}
        for sector_data in sectors_data:
            sector = Sector(**sector_data)
            db.add(sector)
            db.flush()
            sectors[sector.slug] = sector
        
        # Create users
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
        
        # Create automations
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
        
        for automation_data in automations_data:
            sector_ids = automation_data.pop("sector_ids")
            automation = Automation(**automation_data)
            db.add(automation)
            db.flush()
            
            # Add sector permissions
            automation.sectors = [sectors["rh"]]  # Default
            for sector_id in sector_ids:
                for slug, sector in sectors.items():
                    if sector.id == sector_id:
                        if sector not in automation.sectors:
                            automation.sectors.append(sector)
        
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
