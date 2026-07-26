"""Beer endpoint: buy/drink a beer for a fixed price (instant, no payout)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.base import get_session
from app.db.models import User
from app.economy.wallet import InsufficientFunds
from app.modules.beer.service import buy_beer
from app.schemas.beer import BeerResult

router = APIRouter(prefix="/beer", tags=["beer"])


@router.post("/buy", response_model=BeerResult)
async def buy(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BeerResult:
    try:
        user, cost_cents = await buy_beer(session, user)
    except InsufficientFunds as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return BeerResult(
        cost_cents=cost_cents,
        balance_cents=user.balance_cents,
        total_lost_cents=user.total_lost_cents,
        has_won=user.has_won,
    )
