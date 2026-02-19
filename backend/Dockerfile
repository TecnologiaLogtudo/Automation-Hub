# Estágio 1: Build do Frontend
FROM node:20-alpine as frontend-build
WORKDIR /app-frontend
COPY frontend/package*.json ./

# Garante que as dependências de desenvolvimento (Vite, TypeScript) sejam instaladas
# mesmo se o ambiente global de deploy estiver definido como production
ENV NODE_ENV=development

RUN npm install
COPY frontend/ .

# Define a URL da API como relativa (/) para produção.
# Isso garante que o frontend faça requisições para o domínio atual, e não localhost.
ENV VITE_API_URL=/api/v1

RUN npm run build

# Estágio 2: Backend
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    libpq-dev \
    libssl-dev \
    libffi-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
# Nota: Caminho ajustado pois o contexto de build agora é a raiz do projeto
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt

# Copy application code
# Nota: Copia apenas a pasta backend para o workdir
COPY backend/ .

# Copia os arquivos estáticos gerados no estágio 1 para dentro do backend
COPY --from=frontend-build /app-frontend/dist /app/static

# Expose port
EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
