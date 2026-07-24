"""User lifecycle: guest creation, registration, login."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security import hash_password, verify_password
from app.db.models import MarketItem, User, UserInventory
from app.game_config import econ


async def create_guest(session: AsyncSession) -> User:
    """Instant guest wallet seeded with the starting balance."""
    user = User(is_guest=True, balance_cents=econ.STARTING_BALANCE_CENTS)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def register(session: AsyncSession, username: str, password: str) -> User:
    existing = await session.scalar(select(User).where(User.username == username))
    if existing is not None:
        raise ValueError("username taken")
    user = User(
        username=username,
        password_hash=hash_password(password),
        is_guest=False,
        balance_cents=econ.STARTING_BALANCE_CENTS,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def login(session: AsyncSession, username: str, password: str) -> User | None:
    user = await session.scalar(select(User).where(User.username == username))
    if user is None or user.password_hash is None:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def load_inventory(session: AsyncSession, user_id) -> list[tuple[UserInventory, MarketItem]]:
    now = datetime.now(timezone.utc)
    rows = await session.execute(
        select(UserInventory, MarketItem)
        .join(MarketItem, MarketItem.id == UserInventory.item_id)
        .where(
            UserInventory.user_id == user_id,
            UserInventory.active.is_(True),
        )
    )
    result = []
    for inv, item in rows.all():
        if inv.expires_at is not None and inv.expires_at < now:
            continue
        result.append((inv, item))
    return result
