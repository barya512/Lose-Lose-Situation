"""Bet365 market module: place timed bets and resolve them.

Resolution is shared by the RabbitMQ consumer and the due-scanner (both live in
the worker), so it is written to be idempotent: it only acts on a bet that is
still PENDING and re-reads the wallet inside the transaction.

Stake accounting note: market bets are NOT pre-charged. ``resolve_market_bet``
returns a signed delta that already accounts for the full stake (a loss subtracts
stake + penalty; a win adds the doubled winnings). Balances clamp at $0.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broker.rabbit import publish
from app.broker.topology import RK_BET_MARKET_PLACED
from app.db.models import Bet, BetModule, BetStatus, MarketItem, User, UserInventory
from app.economy.wallet import credit
from app.economy.wallet import apply_delta
from app.game_config import (
    ALLOWED_TIMEFRAMES_S,
    TICKER_BY_SYMBOL,
    Direction,
    is_valid_stake,
    resolve_market_bet,
    roll_item_drop,
    roll_item_rarity,
)
from app.modules.market.providers import get_provider

CROWD_WINDOW = timedelta(hours=1)


class BetValidationError(ValueError):
    pass


async def _crowd_same_direction_ratio(
    session: AsyncSession, ticker: str, direction: Direction
) -> float:
    """Fraction of recent bets on this ticker that chose the same direction."""
    since = datetime.now(timezone.utc) - CROWD_WINDOW
    total = await session.scalar(
        select(func.count())
        .select_from(Bet)
        .where(Bet.ticker == ticker, Bet.created_at >= since)
    )
    if not total:
        return 0.0
    same = await session.scalar(
        select(func.count())
        .select_from(Bet)
        .where(
            Bet.ticker == ticker,
            Bet.direction == direction.value,
            Bet.created_at >= since,
        )
    )
    return (same or 0) / total


async def place_market_bet(
    session: AsyncSession,
    user: User,
    *,
    ticker: str,
    direction: Direction,
    stake_cents: int,
    timeframe_s: int,
) -> Bet:
    spec = TICKER_BY_SYMBOL.get(ticker)
    if spec is None:
        raise BetValidationError(f"unknown ticker '{ticker}'")
    if timeframe_s not in ALLOWED_TIMEFRAMES_S:
        raise BetValidationError(f"timeframe must be one of {ALLOWED_TIMEFRAMES_S}")
    if not is_valid_stake(stake_cents, user.balance_cents):
        raise BetValidationError("stake outside allowed range for current balance")

    start_price = await get_provider().get_price(ticker)
    crowd = await _crowd_same_direction_ratio(session, ticker, direction)
    resolve_at = datetime.now(timezone.utc) + timedelta(seconds=timeframe_s)

    bet = Bet(
        user_id=user.id,
        module=BetModule.MARKET.value,
        ticker=ticker,
        direction=direction.value,
        timeframe_s=timeframe_s,
        start_price=start_price,
        resolve_at=resolve_at,
        crowd_same_dir_ratio=crowd,
        stake_cents=stake_cents,
        status=BetStatus.PENDING.value,
    )
    session.add(bet)
    user.bets_count += 1
    await session.commit()
    await session.refresh(bet)

    await publish(
        RK_BET_MARKET_PLACED,
        {"bet_id": str(bet.id), "resolve_at": resolve_at.isoformat()},
    )
    return bet


async def _maybe_drop_item(
    session: AsyncSession, user: User, bet: Bet, rng: random.Random
) -> dict | None:
    """On a losing bet, maybe grant a random item of a rolled rarity."""
    if not roll_item_drop(bet.stake_cents, user.balance_cents, rng):
        return None
    rarity = roll_item_rarity(rng)
    item = await session.scalar(
        select(MarketItem).where(MarketItem.rarity == rarity.value).order_by(func.random()).limit(1)
    )
    if item is None:
        return None
    expires = None
    if item.duration_s is not None:
        expires = datetime.now(timezone.utc) + timedelta(seconds=item.duration_s)
    session.add(
        UserInventory(
            user_id=user.id,
            item_id=item.id,
            acquired_at=datetime.now(timezone.utc),
            expires_at=expires,
            active=True,
        )
    )
    return {"key": item.key, "name": item.name, "rarity": item.rarity}


async def resolve_bet(
    session: AsyncSession, bet_id: uuid.UUID, rng: random.Random | None = None
) -> Bet | None:
    """Idempotently resolve one market bet. Returns the bet, or None if not found."""
    rng = rng or random.Random()
    bet = await session.get(Bet, bet_id, with_for_update=True)
    if bet is None:
        return None
    if bet.status != BetStatus.PENDING.value:
        return bet  # already resolved — idempotent no-op

    spec = TICKER_BY_SYMBOL[bet.ticker]
    end_price = await get_provider().get_price(bet.ticker)
    user = await session.get(User, bet.user_id, with_for_update=True)

    resolution = resolve_market_bet(
        stake_cents=bet.stake_cents,
        balance_cents=user.balance_cents,
        direction=Direction(bet.direction),
        start_price=bet.start_price,
        end_price=end_price,
        kind=spec.kind,
        same_direction_ratio=bet.crowd_same_dir_ratio or 0.0,
        rng=rng,
    )

    if resolution.won:
        credit(user, resolution.balance_delta_cents)
        bet.status = BetStatus.WON.value
        item_drop = None
    else:
        apply_delta(user, resolution.balance_delta_cents)
        bet.status = BetStatus.LOST.value
        item_drop = await _maybe_drop_item(session, user, bet, rng)

    bet.end_price = end_price
    bet.payout_cents = resolution.payout_cents
    bet.penalty_cents = resolution.penalty_cents
    bet.result_detail = {
        "won": resolution.won,
        "start_price": bet.start_price,
        "end_price": end_price,
        "balance_delta_cents": resolution.balance_delta_cents,
        "penalty": None
        if resolution.penalty is None
        else {
            "base": resolution.penalty.base_penalty_cents,
            "crowd_mult": round(resolution.penalty.crowd_mult, 4),
            "chaos_mult": round(resolution.penalty.chaos_mult, 4),
            "mercy_mult": round(resolution.penalty.mercy_mult, 4),
            "volatility_mult": round(resolution.penalty.volatility_mult, 4),
        },
        "item_drop": item_drop,
    }
    await session.commit()
    await session.refresh(bet)
    return bet
