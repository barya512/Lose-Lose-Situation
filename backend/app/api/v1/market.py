"""Bet365 market endpoints."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.base import get_session
from app.db.models import Bet, User
from app.game_config import CURATED_TICKERS
from app.modules.market.providers import ProviderError, get_provider
from app.modules.market.service import BetValidationError, place_market_bet
from app.schemas.market import MarketBetOut, PlaceMarketBet, TickerOut

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/tickers", response_model=list[TickerOut])
async def tickers() -> list[TickerOut]:
    provider = get_provider()
    out: list[TickerOut] = []
    for spec in CURATED_TICKERS:
        try:
            price = await provider.get_price(spec.symbol)
        except Exception:  # noqa: BLE001 — never fail the whole list on one bad ticker
            price = None
        out.append(
            TickerOut(symbol=spec.symbol, name=spec.name, kind=spec.kind.value, last_price=price)
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
