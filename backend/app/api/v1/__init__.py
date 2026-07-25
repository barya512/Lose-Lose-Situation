"""Versioned API router aggregation.

Module routers are attached here as each phase lands them. Keeping the include
statements in one place makes the monolith's surface easy to scan.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.beer import router as beer_router
from app.api.v1.casino import router as casino_router
from app.api.v1.market import router as market_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(market_router)
api_router.include_router(casino_router)
api_router.include_router(beer_router)
