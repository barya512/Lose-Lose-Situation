"""Economy sanity: a player who always bets should trend toward $0.

This is the whole game's win condition, so we assert the balance actually drains
under repeated random market bets using ONLY the pure formula layer. It doubles
as a balancing harness — tweak game_config and re-run to feel the pace.
"""

from __future__ import annotations

import random

from app import game_config as gc
from app.game_config import Direction, TickerKind, econ


def _simulate(seed: int, rounds: int = 2000) -> int:
    rng = random.Random(seed)
    balance = econ.STARTING_BALANCE_CENTS
    for _ in range(rounds):
        if balance <= 0:
            break
        stake = gc.max_bet_cents(balance)
        stake = min(stake, balance)
        # random true market move + random player guess
        start = 100.0
        end = start * (1 + rng.uniform(-0.05, 0.05))
        direction = rng.choice([Direction.UP, Direction.DOWN])
        crowd = rng.random()
        res = gc.resolve_market_bet(
            stake_cents=stake,
            balance_cents=balance,
            direction=direction,
            start_price=start,
            end_price=end,
            kind=rng.choice([TickerKind.STOCK, TickerKind.CRYPTO]),
            same_direction_ratio=crowd,
            rng=rng,
        )
        balance = max(0, balance + res.balance_delta_cents)
    return balance


def test_repeated_betting_trends_toward_zero():
    """Across many seeds, the average end balance is well below the start."""
    starts = econ.STARTING_BALANCE_CENTS
    ends = [_simulate(seed) for seed in range(25)]
    avg_end = sum(ends) / len(ends)
    # The dynamic penalty stack (esp. mercy catch-up) should erode the bankroll.
    assert avg_end < starts * 0.5
    # And a good fraction of runs should actually hit $0 (the win state).
    zeroed = sum(1 for e in ends if e == 0)
    assert zeroed >= len(ends) // 2
