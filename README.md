# Portal de Automações Corporativas

Sistema de gerenciamento de acesso às automações da empresa com controle de permissões por setor. /api/v1

## Estrutura

```
├── backend/           # API FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── auth.py
│   │   └── routers/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          # React + TypeScript
│   ├── src/
│   ├── Dockerfile
│   └── ...
├── docker-compose.yml
└── README.md
```

## Configuração

1. Configure as variáveis de ambiente no `.env`
2. Execute `docker compose up -d`
3. Acesse o frontend em `http://localhost`
4. Acesse a API em `http://localhost/api`

## Primeiros Usuários

- Admin: admin@empresa.com / admin123
- Usuário RH: rh@empresa.com / rh123
- Usuário TI: ti@empresa.com / ti123
