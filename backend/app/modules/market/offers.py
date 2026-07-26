"""Per-ticker item bounties, rolled before the player bets.

The market used to decide an item drop at resolve time -- chance, then rarity,
then a random item -- which meant a tile could never advertise what it was
worth. Offers invert that: the item is rolled up front and pinned to the ticker,
so the tile can name it, and losing the bet grants it with certainty.

Lifecycle: rolled on first sight of the market, stamped (never deleted) when a
bet consumes it, re-rolled when that bet resolves.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import MarketItem, MarketOffer, User
from app.game_config import CURATED_TICKERS, econ, roll_item_rarity


async def _pick_item(session: AsyncSession, rng: random.Random) -> uuid.UUID | None:
    """Roll a rarity, then one item of it. None when the ticker draws a blank."""
    if rng.random() >= econ.OFFER_ITEM_CHANCE:
        return None
    rarity = roll_item_rarity(rng)
    return await session.scalar(
        select(MarketItem.id)
        .where(MarketItem.rarity == rarity.value)
        .order_by(func.random())
        .limit(1)
    )


async def get_offer(session: AsyncSession, user: User, ticker: str) -> MarketOffer | None:
    return await session.scalar(
        select(MarketOffer).where(
            MarketOffer.user_id == user.id, MarketOffer.ticker == ticker
        )
    )


async def roll_offer(
    session: AsyncSession, user: User, ticker: str, rng: random.Random | None = None
) -> MarketOffer:
    """Roll this ticker a fresh bounty, replacing any consumed one.

    Called after a bet on the ticker resolves -- so one attempt buys exactly one
    reroll, which is what makes farming a paced loop rather than a slot machine.
    """
    rng = rng or random.Random()
    offer = await get_offer(session, user, ticker)
    item_id = await _pick_item(session, rng)
    now = datetime.now(timezone.utc)

    if offer is None:
        offer = MarketOffer(user_id=user.id, ticker=ticker, rolled_at=now)
        session.add(offer)
    offer.item_id = item_id
    offer.consumed_by_bet_id = None
    offer.rolled_at = now
    await session.flush()
    return offer


async def ensure_offers(
    session: AsyncSession, user: User, rng: random.Random | None = None
) -> list[MarketOffer]:
    """Every curated ticker's current offer, rolling only what has never existed.

    Deliberately does NOT re-roll tickers whose offer is consumed or empty: an
    offer the player has already seen is a promise, and re-rolling on read would
    make leaving and re-entering the market a free reroll.
    """
    rng = rng or random.Random()
    existing = {
        offer.ticker: offer
        for offer in await session.scalars(
            select(MarketOffer).where(MarketOffer.user_id == user.id)
        )
    }
    for spec in CURATED_TICKERS:
        if spec.symbol not in existing:
            existing[spec.symbol] = await roll_offer(session, user, spec.symbol, rng)
    return [existing[spec.symbol] for spec in CURATED_TICKERS]


async def consume_offer(
    session: AsyncSession, user: User, ticker: str, bet_id: uuid.UUID
) -> uuid.UUID | None:
    """Lock this ticker's bounty to a bet. Returns the item to pin on the bet."""
    offer = await get_offer(session, user, ticker)
    if offer is None:
        return None
    offer.consumed_by_bet_id = bet_id
    await session.flush()
    return offer.item_id
