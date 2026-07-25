"""FastAPI application factory.

Mounts the versioned API routers and exposes a health check. Game modules
(market, casino, polls, sports) live under ``app.api.v1`` and are wired in as
they come online across the roadmap phases.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: broker connections are opened lazily by request/worker code.
    yield
    # Shutdown: nothing global to tear down yet.


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description="Lose all your money. On purpose.",
        version="0.2.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    # --- Versioned routers (added per roadmap phase) ---
    from app.api.v1 import api_router

    app.include_router(api_router, prefix="/api/v1")

    return app


app = create_app()
