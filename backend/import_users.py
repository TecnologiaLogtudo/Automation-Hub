import pandas as pd
import sys
import os
from passlib.context import CryptContext

# Adiciona o diretório do script ao path para que os módulos do app (database, models) possam ser encontrados.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.models import User, Sector

# --- Configuração ---
# Garanta que o nome do arquivo Excel e os nomes das colunas correspondam exatamente ao seu arquivo.
EXCEL_FILE_PATH = "E-mails  Logtudo.xlsx"
COL_NOME = "Nome"
COL_EMAIL = "E-mail"
COL_SENHA = "Senha"
COL_SETOR = "Setor"
COL_FUNCAO = "Função" # Cargo (ex: Analista) -> Será salvo em preferences
COL_TIPO = "Tipo"     # Permissão (ex: Admin, User) -> Será salvo em role
# --- Fim da Configuração ---

# Configuração para hash de senha (deve ser o mesmo usado no seu sistema de autenticação)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Gera o hash de uma senha em texto plano."""
    return pwd_context.hash(password)

def import_users_from_excel(file_path: str):
    """
    Lê um arquivo Excel e importa os usuários para o banco de dados,
    pulando aqueles cujo e-mail já existe.
    """
    if not os.path.exists(file_path):
        print(f"ERRO: Arquivo '{file_path}' não encontrado. Verifique se o arquivo está na mesma pasta que o script (backend/).")
        return

    print(f"Iniciando importação do arquivo: {file_path}")

    db = SessionLocal()
    
    try:
        # 1. Carrega os e-mails já existentes no banco para uma verificação rápida em memória.
        existing_emails = {user.email for user in db.query(User.email).all()}
        print(f"Encontrados {len(existing_emails)} usuários já existentes no banco de dados.")

        # 2. Carrega os setores existentes para mapear nome para ID.
        sectors = db.query(Sector).all()
        if not sectors:
            print("ERRO CRÍTICO: Nenhum setor encontrado no banco de dados. É necessário criar os setores antes de importar usuários.")
            return
        
        # Cria um mapa para busca rápida: { "nome do setor em minúsculo": id }
        sector_map = {s.name.lower(): s.id for s in sectors}
        default_sector_id = sectors[0].id
        print(f"Encontrados {len(sectors)} setores no banco. O setor padrão para fallback é '{sectors[0].name}'.")

        # 3. Lê o arquivo Excel usando pandas
        try:
            df = pd.read_excel(file_path)
            print(f"Arquivo Excel lido com sucesso. Encontradas {len(df)} linhas para processar.")
        except Exception as e:
            print(f"ERRO ao ler o arquivo Excel: {e}")
            return

        users_to_add = []
        users_skipped = 0
        users_failed = 0

        # Mapa para traduzir o que está escrito no Excel para as roles do sistema
        role_mapping = {
            "administrador": "admin",
            "admin": "admin",
            "gerente": "manager",
            "analista": "analyst",
            "usuário": "user",
            "usuario": "user",
            "user": "user"
        }

        # 4. Itera sobre cada linha da planilha
        for index, row in df.iterrows():
            email = str(row.get(COL_EMAIL, '')).strip().lower()
            
            # Validação básica do e-mail
            if not email or '@' not in email:
                print(f"  - Linha {index + 2}: E-mail inválido ou ausente. Linha ignorada.")
                users_failed += 1
                continue

            # Verifica se o usuário já existe
            if email in existing_emails:
                users_skipped += 1
                continue

            # Coleta os outros dados da linha
            full_name = str(row.get(COL_NOME, '')).strip()
            password = str(row.get(COL_SENHA, ''))
            sector_name = str(row.get(COL_SETOR, '')).strip().lower()
            
            # Processa o Tipo (Role)
            raw_type = str(row.get(COL_TIPO, '')).strip().lower()
            role = role_mapping.get(raw_type, "user") # Padrão é 'user' se não reconhecer

            # Processa a Função (Cargo) para salvar nas preferências
            job_title = str(row.get(COL_FUNCAO, '')).strip()

            # Validação da senha
            if not password:
                print(f"  - Linha {index + 2}: Senha não preenchida para o e-mail '{email}'. Linha ignorada.")
                users_failed += 1
                continue

            # Busca o ID do setor. Se não encontrar, usa o setor padrão.
            sector_id = sector_map.get(sector_name)
            if not sector_id:
                print(f"  - Aviso na linha {index + 2}: Setor '{row.get(COL_SETOR)}' não encontrado para o e-mail '{email}'. Usando setor padrão.")
                sector_id = default_sector_id

            # Cria a nova instância do usuário
            new_user = User(
                email=email,
                full_name=full_name or email.split('@')[0],  # Usa parte do e-mail se o nome estiver vazio
                password_hash=get_password_hash(password),
                sector_id=sector_id,
                role=role or "user",  # Garante que 'user' seja o padrão se a célula estiver vazia
                is_active=True,
                preferences={"job_title": job_title} if job_title else {} # Salva a função aqui
            )
            
            users_to_add.append(new_user)
            existing_emails.add(email)  # Adiciona ao set para evitar duplicatas do próprio Excel

        # 5. Adiciona os novos usuários ao banco de dados
        if users_to_add:
            db.add_all(users_to_add)
            db.commit()
            print(f"\nSUCESSO: {len(users_to_add)} novos usuários foram adicionados ao banco de dados.")
        else:
            print("\nNenhum usuário novo foi adicionado.")

        print(f"Resumo: {users_skipped} usuários ignorados (já existiam) e {users_failed} linhas com falha.")

    except Exception as e:
        print(f"\nERRO INESPERADO: Ocorreu um erro durante a transação com o banco de dados.")
        print(f"Detalhes: {e}")
        db.rollback()
    finally:
        db.close()
        print("Conexão com o banco de dados fechada.")

if __name__ == "__main__":
    # O script é executado diretamente, chamando a função principal.
    import_users_from_excel(EXCEL_FILE_PATH)
