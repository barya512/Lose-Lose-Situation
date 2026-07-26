"""Casino module: roulette + slots. Both resolve instantly (no worker).

Stakes ARE charged up front here (unlike market bets); a win then credits the
gross payout back. So net change = payout - stake. A losing spin (payout 0)
simply removes the stake — the desired outcome.
"""

from __future__ import annotations

import random
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Bet, BetModule, BetStatus, User
from app.economy.wallet import charge_stake, credit
from app.game_config import (
    ItemEffect,
    RouletteBetType,
    chip_ladder_cents,
    dampened_payout_cents,
    min_bet_cents,
    roulette_is_win,
    roulette_max_bet_cents,
    roulette_payout_multiplier,
    slots_payout_cents,
    spin_roulette,
    spin_slots,
)
from app.modules.market.service import active_effects


class CasinoValidationError(ValueError):
    pass


def resolve_stake(
    stake_cents: int, balance_cents: int, effects: Sequence[tuple[ItemEffect, float]] = ()
) -> int:
    """Turn a requested stake into the amount actually committed.

    A value that matches one of the player's chips is clamped to the wallet, so
    clicking a chip you can't afford goes all in rather than erroring -- the
    same rule the market uses. Any OTHER over-balance number is still refused:
    only a real chip earns the clamp, or a client could post an arbitrary huge
    stake and go all in on every spin.
    """
    if stake_cents > balance_cents and stake_cents in chip_ladder_cents(
        effects, balance_cents
    ):
        return balance_cents
    return stake_cents


def _validate_stake(stake_cents: int, balance_cents: int, cap_cents: int) -> None:
    # Below the configured minimum the floor becomes the whole remaining balance
    # ("last call"), so a sub-$1 wallet can still gamble its way to the $0 win.
    minimum = min_bet_cents(balance_cents)
    if stake_cents < minimum:
        raise CasinoValidationError(f"minimum stake is {minimum} cents")
    if stake_cents > balance_cents:
        raise CasinoValidationError("stake exceeds balance")
    if stake_cents > cap_cents:
        raise CasinoValidationError(f"stake exceeds max for this bet type ({cap_cents} cents)")


async def play_roulette(
    session: AsyncSession,
    user: User,
    *,
    bet_type: RouletteBetType,
    selection: int | str | None,
    stake_cents: int,
    rng: random.Random | None = None,
) -> Bet:
    rng = rng or random.Random()
    effects = await active_effects(session, user)
    stake_cents = resolve_stake(stake_cents, user.balance_cents, effects)
    cap = roulette_max_bet_cents(bet_type, user.balance_cents)
    _validate_stake(stake_cents, user.balance_cents, cap)

    charge_stake(user, stake_cents)
    pocket = spin_roulette(rng)
    won = roulette_is_win(bet_type, pocket, selection)
    payout = int(stake_cents * roulette_payout_multiplier(bet_type)) if won else 0
    payout = dampened_payout_cents(payout, stake_cents, effects)
    if payout:
        credit(user, payout)

    bet = Bet(
        user_id=user.id,
        module=BetModule.CASINO.value,
        stake_cents=stake_cents,
        status=BetStatus.WON.value if won else BetStatus.LOST.value,
        payout_cents=payout,
        result_detail={
            "game": "roulette",
            "bet_type": bet_type.value,
            "selection": selection,
            "pocket": pocket,
            "won": won,
            "net_cents": payout - stake_cents,
        },
    )
    session.add(bet)
    user.bets_count += 1
    await session.commit()
    await session.refresh(bet)
    return bet


async def play_slots(
    session: AsyncSession,
    user: User,
    *,
    stake_cents: int,
    reels: int = 3,
    rng: random.Random | None = None,
) -> Bet:
    rng = rng or random.Random()
    # Slots have no per-type cap beyond the standard min + balance check.
    effects = await active_effects(session, user)
    stake_cents = resolve_stake(stake_cents, user.balance_cents, effects)
    _validate_stake(stake_cents, user.balance_cents, user.balance_cents)

    charge_stake(user, stake_cents)
    symbols = spin_slots(reels, rng)
    payout = dampened_payout_cents(
        slots_payout_cents(symbols, stake_cents), stake_cents, effects
    )
    if payout:
        credit(user, payout)

    bet = Bet(
        user_id=user.id,
        module=BetModule.CASINO.value,
        stake_cents=stake_cents,
        status=BetStatus.WON.value if payout else BetStatus.LOST.value,
        payout_cents=payout,
        result_detail={
            "game": "slots",
            "reels": [s.value for s in symbols],
            "payout_cents": payout,
            "net_cents": payout - stake_cents,
        },
    )
    session.add(bet)
    user.bets_count += 1
    await session.commit()
    await session.refresh(bet)
    return bet
