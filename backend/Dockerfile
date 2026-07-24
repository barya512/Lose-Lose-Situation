# Web service image (FastAPI / uvicorn)
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Copy project metadata + source, then install (setuptools needs backend/ present).
COPY pyproject.toml ./
COPY backend/ ./backend/
RUN pip install --upgrade pip && pip install .

WORKDIR /app/backend

EXPOSE 8000

# $PORT is provided by Render; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
