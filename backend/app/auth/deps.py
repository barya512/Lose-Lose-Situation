"""FastAPI dependencies for authenticated access."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import decode_token
from app.db.base import get_session
from app.db.models import User
from app.economy.drain import settle_drain

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    user_id = decode_token(creds.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")

    # Bring the passive drain up to date before any handler reads the balance,
    # so stake checks and caps see the real number rather than a stale one.
    # This is the choke point the lazy-accrual design leans on: no scheduled
    # tick, just settle wherever the user is already loaded.
    if settle_drain(user, datetime.now(timezone.utc)):
        await session.commit()
    return user
