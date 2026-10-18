# syntax=docker/dockerfile:1
# Um Dockerfile, duas imagens finais (selecionadas por `target` no docker-compose.yml):
#   api  -> FastAPI + Alembic + worker (Python, usuário sem privilégios)
#   web  -> build do React servido pelo Nginx, que também faz o proxy de /api
# Nenhum segredo entra no build: toda configuração chega por variáveis de ambiente em tempo de execução.

# ---------- Frontend: build ----------
FROM node:22.23.3-alpine3.23 AS web-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---------- Frontend: execução ----------
FROM nginx:1.30.6-alpine AS web
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /src/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

# ---------- Backend ----------
FROM python:3.14.8-slim-trixie AS api
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
# tzdata do sistema: date.today() precisa respeitar TZ (America/Sao_Paulo) no container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin app
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/alembic.ini ./
COPY backend/migrations ./migrations
COPY backend/app ./app
USER app
EXPOSE 8000
# Forma exec: o uvicorn é o PID 1 e recebe SIGTERM diretamente (encerramento gracioso).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*", "--no-server-header"]
