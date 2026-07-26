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

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.broker.rabbit import publish
from app.broker.topology import RK_BET_MARKET_PLACED
from app.db.models import Bet, BetModule, BetStatus, MarketItem, User, UserInventory
from app.economy.drain import drain_rate_cents_per_s, settle_drain
from app.economy.wallet import apply_delta, credit
from app.game_config import (
    ALLOWED_TIMEFRAMES_S,
    TICKER_BY_SYMBOL,
    Direction,
    ItemEffect,
    ItemRarity,
    anti_luck_margin,
    chip_ladder_cents,
    direction_from_prices,
    effective_stake_cents,
    is_market_open,
    MarketResolution,
    is_valid_stake,
    item_stake_gate_cents,
    resolve_market_bet,
)
from app.modules.market import offers
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
    if not is_market_open(spec):
        raise BetValidationError(f"{spec.symbol} market is closed")
    if timeframe_s not in ALLOWED_TIMEFRAMES_S:
        raise BetValidationError(f"timeframe must be one of {ALLOWED_TIMEFRAMES_S}")

    # The posted value is a CHIP, not yet a stake: a chip the wallet can't cover
    # goes all in rather than being refused. Validated against the player's own
    # ladder first, so an arbitrary large number can't buy a free all-in.
    effects = await active_effects(session, user)
    if stake_cents not in chip_ladder_cents(effects, user.balance_cents):
        raise BetValidationError("stake must be one of the offered chip values")
    stake_cents = effective_stake_cents(stake_cents, user.balance_cents)
    if not is_valid_stake(stake_cents, user.balance_cents, effects):
        raise BetValidationError("stake outside allowed range for current balance")

    # One open bet per symbol: reject if this user already has a PENDING bet on
    # this ticker (checked before the price fetch so we don't waste a provider call).
    existing = await session.scalar(
        select(Bet.id)
        .where(
            Bet.user_id == user.id,
            Bet.ticker == ticker,
            Bet.status == BetStatus.PENDING.value,
        )
        .limit(1)
    )
    if existing is not None:
        raise BetValidationError(f"you already have an open bet on {ticker}")

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
    await session.flush()

    # Pin the advertised bounty to this bet, so what the tile promised is what
    # resolution can grant -- and stamp the offer so leaving and re-entering the
    # market can't roll a new one.
    bet.reward_item_id = await offers.consume_offer(session, user, ticker, bet.id)

    await session.commit()
    await session.refresh(bet)

    await publish(
        RK_BET_MARKET_PLACED,
        {"bet_id": str(bet.id), "resolve_at": resolve_at.isoformat()},
    )
    return bet


async def list_market_bets(
    session: AsyncSession, user: User, *, status: str | None = None
) -> list[Bet]:
    """The user's market bets, optionally filtered by status (e.g. PENDING).

    Ordered by ``resolve_at`` so the client sees soonest-to-resolve first. This is
    the server-side source of truth the client rehydrates its poll manager from.
    """
    stmt = select(Bet).where(
        Bet.user_id == user.id,
        Bet.module == BetModule.MARKET.value,
    )
    if status is not None:
        stmt = stmt.where(Bet.status == status)
    stmt = stmt.order_by(Bet.resolve_at)
    rows = await session.scalars(stmt)
    return list(rows)


async def active_effects(session: AsyncSession, user: User) -> list[tuple[ItemEffect, float]]:
    """Every item effect currently biting for this player, as (effect, magnitude).

    Duplicates are kept rather than merged: the formulas in game_config stack
    magnitudes themselves, so holding two of the same charm is twice as strong.
    Covered by the ix_inventory_user_active index.
    """
    now = datetime.now(timezone.utc)
    rows = await session.execute(
        select(MarketItem.effect_type, MarketItem.magnitude)
        .join(UserInventory, UserInventory.item_id == MarketItem.id)
        .where(
            UserInventory.user_id == user.id,
            UserInventory.active.is_(True),
            or_(UserInventory.expires_at.is_(None), UserInventory.expires_at > now),
        )
    )
    return [(ItemEffect(effect), magnitude) for effect, magnitude in rows.all()]


async def grant_pinned_item(session: AsyncSession, user: User, bet: Bet) -> dict | None:
    """Grant the item this losing bet was placed to chase, if the stake qualified.

    No chance roll: the offer already named the item before the stake was
    committed, so the only question left is whether the player bet big enough
    for that rarity (see item_stake_gate_cents). Losing below the gate is just
    an ordinary loss.
    """
    if bet.reward_item_id is None:
        return None
    item = await session.get(MarketItem, bet.reward_item_id)
    if item is None:
        return None

    # Gated against the balance the tile quoted when the player picked their
    # chip. Market bets are not pre-charged, so as long as this runs before the
    # loss is applied, user.balance_cents IS that number.
    gate = item_stake_gate_cents(ItemRarity(item.rarity), user.balance_cents)
    if bet.stake_cents < gate:
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
    return {
        "key": item.key,
        "name": item.name,
        "rarity": item.rarity,
        "effect_type": item.effect_type,
        "magnitude": item.magnitude,
        "duration_s": item.duration_s,
        "art_key": item.art_key,
    }


async def refresh_drain_rate(session: AsyncSession, user: User) -> None:
    """Recompute the wallet's bleed rate after inventory changed.

    Settles what is owed at the OLD rate first, so a newly granted item can't
    retroactively drain time it wasn't held for (and a lapsed one can't stop a
    drain it already earned).
    """
    now = datetime.now(timezone.utc)
    settle_drain(user, now)
    user.drain_rate_cents_per_s = drain_rate_cents_per_s(await active_effects(session, user))
    user.drain_anchor_at = now


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
    # Settle the drain inside the same locked transaction, so the balance this
    # resolution reads (and the has_won check below) is current. The worker
    # resolves bets the player may not be on screen for.
    settle_drain(user, datetime.now(timezone.utc))

    effects = await active_effects(session, user)
    margin = anti_luck_margin(effects)
    direction = Direction(bet.direction)

    resolution = resolve_market_bet(
        stake_cents=bet.stake_cents,
        balance_cents=user.balance_cents,
        direction=direction,
        start_price=bet.start_price,
        end_price=end_price,
        kind=spec.kind,
        same_direction_ratio=bet.crowd_same_dir_ratio or 0.0,
        anti_luck_margin=margin,
        effects=effects,
        rng=rng,
    )

    # Did the charm alone decide this? Without it the same prices would have paid
    # out, so the notification can name the culprit instead of leaving the player
    # thinking the price feed lied to them.
    flipped = margin > 0.0 and not resolution.won and direction is direction_from_prices(
        bet.start_price, end_price
    )

    if user.has_won:
        # The run already reached $0 while this bet was in flight. Market bets
        # are not pre-charged, so paying this one out would hand money back to a
        # player who has finished -- and has_won never resets. No delta, no
        # item, no juice.
        bet.status = BetStatus.VOID.value
        item_drop = None
        resolution = MarketResolution(
            won=False, balance_delta_cents=0, payout_cents=0, penalty_cents=0, penalty=None
        )
    elif resolution.won:
        # The player's call was right, so the balance grows -- the punishing
        # outcome. Winning forfeits the bounty.
        credit(user, resolution.balance_delta_cents)
        bet.status = BetStatus.WON.value
        item_drop = None
    else:
        # Granted before the delta lands, so the stake gate reads the balance
        # the offer was quoted against.
        item_drop = await grant_pinned_item(session, user, bet)
        apply_delta(user, resolution.balance_delta_cents)
        bet.status = BetStatus.LOST.value
        if item_drop is not None:
            await session.flush()  # the new inventory row must be visible
            await refresh_drain_rate(session, user)

    # Win or lose, this ticker gets a fresh bounty: one attempt buys exactly one
    # reroll, which is what paces the farming loop.
    await offers.roll_offer(session, user, bet.ticker, rng)

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
            "item_mult": round(resolution.penalty.item_mult, 4),
        },
        "item_drop": item_drop,
        "anti_luck": {"margin": round(margin, 6), "flipped": flipped},
    }
    await session.commit()
    await session.refresh(bet)
    return bet
