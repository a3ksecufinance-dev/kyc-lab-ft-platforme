FROM python:3.12-slim AS base

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    libpq-dev gcc curl \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

RUN addgroup --gid 1001 mlservice && \
    adduser --uid 1001 --gid 1001 --no-create-home --disabled-password mlservice && \
    mkdir -p /app/models && chown -R mlservice:mlservice /app

USER mlservice

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--loop", "uvloop", \
     "--log-level", "warning"]
