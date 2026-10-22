# App image: built frontend + backend. Tagged 1.0.0-<pipeline number> by .gitlab-ci.yml.
FROM node:24.18.0-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# the in-app manual reads these Markdown pages at build time
COPY manual/pages /src/manual/pages
RUN npm run build

FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.12.2 /uv /uvx /bin/
# docker-cli + git: the agent runtime builds and starts its tool containers through the host Docker socket.
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker-cli git ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_LINK_MODE=copy
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock backend/
RUN uv sync --locked --project backend --no-dev --no-install-project
COPY backend/ backend/
COPY infra/hermes/ infra/hermes/
COPY scripts/ scripts/
COPY --from=frontend /src/frontend/dist frontend/dist
RUN uv sync --locked --project backend --no-dev
COPY deploy/entrypoint.sh /app/deploy/entrypoint.sh
RUN chmod +x /app/deploy/entrypoint.sh
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=600s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1
ENTRYPOINT ["/app/deploy/entrypoint.sh"]
