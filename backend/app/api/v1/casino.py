"""Casino endpoints: roulette + slots (instant resolution)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.base import get_session
from app.db.models import User
from app.economy.wallet import InsufficientFunds
from app.modules.casino.service import CasinoValidationError, play_roulette, play_slots
from app.schemas.casino import CasinoResult, RouletteBet, SlotSpin

router = APIRouter(prefix="/casino", tags=["casino"])


def _handle(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.post("/roulette", response_model=CasinoResult)
async def roulette(
    body: RouletteBet,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CasinoResult:
    try:
        bet = await play_roulette(
            session,
            user,
            bet_type=body.bet_type,
            selection=body.selection,
            stake_cents=body.stake_cents,
        )
    except (CasinoValidationError, InsufficientFunds) as exc:
        raise _handle(exc) from exc
    return CasinoResult.model_validate(bet)


@router.post("/slots/spin", response_model=CasinoResult)
async def slots(
    body: SlotSpin,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CasinoResult:
    try:
        bet = await play_slots(session, user, stake_cents=body.stake_cents, reels=body.reels)
    except (CasinoValidationError, InsufficientFunds) as exc:
        raise _handle(exc) from exc
    return CasinoResult.model_validate(bet)
