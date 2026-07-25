"""Casino endpoints: roulette + slots (instant resolution)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db.base import get_session
from app.db.models import User
from app.economy.wallet import InsufficientFunds
from app.game_config import (
    SLOT_MAX_REELS,
    SLOT_MIN_REELS,
    SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS,
    SLOT_TWO_OF_A_KIND_PAYOUT,
    slots_paytable,
)
from app.modules.casino.service import CasinoValidationError, play_roulette, play_slots
from app.schemas.casino import CasinoResult, RouletteBet, SlotInfo, SlotSpin, SlotSymbolOut

router = APIRouter(prefix="/casino", tags=["casino"])


def _handle(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("/slots/info", response_model=SlotInfo)
async def slots_info() -> SlotInfo:
    """Public paytable for the slots UI — no auth required."""
    return SlotInfo(
        min_reels=SLOT_MIN_REELS,
        max_reels=SLOT_MAX_REELS,
        symbols=[
            SlotSymbolOut(
                symbol=row.symbol.value,
                weight=row.weight,
                three_of_a_kind_payout=row.three_of_a_kind_payout,
            )
            for row in slots_paytable()
        ],
        two_of_a_kind_payout=SLOT_TWO_OF_A_KIND_PAYOUT,
        two_of_a_kind_disabled_reel_counts=sorted(SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS),
    )


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
