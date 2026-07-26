"""Bet365 market endpoints."""

from __future__ import annotations

import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.base import get_session
from app.db.models import Bet, BetStatus, MarketItem, User
from app.game_config import (
    CURATED_TICKERS,
    ItemRarity,
    chip_ladder_cents,
    is_market_open,
    item_stake_gate_cents,
)
from app.modules.market.offers import ensure_offers
from app.modules.market.providers import ProviderError, get_provider
from app.modules.market.service import (
    BetValidationError,
    active_effects,
    list_market_bets,
    place_market_bet,
)
from app.schemas.market import ItemOut, MarketBetOut, OfferOut, PlaceMarketBet, TickerOut

router = APIRouter(prefix="/market", tags=["market"])


async def _price_or_none(provider, symbol: str) -> float | None:
    try:
        return await provider.get_price(symbol)
    except Exception:  # noqa: BLE001 — never fail the whole list on one bad ticker
        return None


@router.get("/tickers", response_model=list[TickerOut])
async def tickers() -> list[TickerOut]:
    provider = get_provider()
    # Fetched concurrently — sequentially awaiting ~15 yfinance round-trips made
    # this endpoint take 4s+ cold, which the client polls on a 10s cadence.
    prices = await asyncio.gather(
        *(_price_or_none(provider, spec.symbol) for spec in CURATED_TICKERS)
    )
    return [
        TickerOut(
            symbol=spec.symbol,
            name=spec.name,
            kind=spec.kind.value,
            last_price=price,
            is_open=is_market_open(spec),
        )
        for spec, price in zip(CURATED_TICKERS, prices)
    ]


@router.get("/offers", response_model=list[OfferOut])
async def offers(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[OfferOut]:
    """Every curated ticker plus the item bounty currently pinned to it.

    The tile has to name its prize before the player commits a stake, so the
    reward is rolled and persisted server-side rather than decided at resolve
    time. Re-reading this endpoint never re-rolls (see modules/market/offers).
    """
    rolled = await ensure_offers(session, user)
    await session.commit()

    effects = await active_effects(session, user)
    chips = chip_ladder_cents(effects, user.balance_cents)

    provider = get_provider()
    prices = await asyncio.gather(
        *(_price_or_none(provider, spec.symbol) for spec in CURATED_TICKERS)
    )
    item_ids = [o.item_id for o in rolled if o.item_id is not None]
    items = {
        item.id: item
        for item in await session.scalars(
            select(MarketItem).where(MarketItem.id.in_(item_ids))
        )
    } if item_ids else {}

    out: list[OfferOut] = []
    for spec, offer, price in zip(CURATED_TICKERS, rolled, prices):
        item = items.get(offer.item_id) if offer.item_id else None
        out.append(
            OfferOut(
                symbol=spec.symbol,
                name=spec.name,
                kind=spec.kind.value,
                last_price=price,
                is_open=is_market_open(spec),
                reward_item=ItemOut.model_validate(item) if item else None,
                reward_stake_gate_cents=(
                    item_stake_gate_cents(ItemRarity(item.rarity), user.balance_cents)
                    if item
                    else None
                ),
                pending_bet_id=offer.consumed_by_bet_id,
                chips_cents=chips,
            )
        )
    return out


@router.post("/bets", response_model=MarketBetOut, status_code=status.HTTP_201_CREATED)
async def place_bet(
    body: PlaceMarketBet,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MarketBetOut:
    try:
        bet = await place_market_bet(
            session,
            user,
            ticker=body.ticker,
            direction=body.direction,
            stake_cents=body.stake_cents,
            timeframe_s=body.timeframe_s,
        )
    except BetValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    except ProviderError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"market data: {exc}") from exc
    return MarketBetOut.model_validate(bet)


@router.get("/bets", response_model=list[MarketBetOut])
async def list_bets(
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MarketBetOut]:
    """List the caller's market bets, optionally filtered by ``?status=PENDING``.

    Source of truth the client rehydrates its background poll manager from after a
    reload (localStorage is only the fast local cache).
    """
    if status_filter is not None:
        status_filter = status_filter.upper()
        if status_filter not in {s.value for s in BetStatus}:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"invalid status '{status_filter}'")
    bets = await list_market_bets(session, user, status=status_filter)
    return [MarketBetOut.model_validate(b) for b in bets]


@router.get("/bets/{bet_id}", response_model=MarketBetOut)
async def get_bet(
    bet_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MarketBetOut:
    bet = await session.get(Bet, bet_id)
    if bet is None or bet.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bet not found")
    return MarketBetOut.model_validate(bet)
