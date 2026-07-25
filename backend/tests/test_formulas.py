"""Unit tests for the central economy/formula module.

These are the balance-critical bits, so they're covered without any DB/broker.
"""

from __future__ import annotations

import random

import pytest

from app import game_config as gc
from app.game_config import Direction, RouletteBetType, SlotSymbol, TickerKind, econ


# --- bet sizing ---


def test_max_bet_is_fraction_of_balance():
    assert gc.max_bet_cents(1_000_00) == int(1_000_00 * econ.MAX_BET_FRACTION)


def test_max_bet_never_below_minimum():
    assert gc.max_bet_cents(1) == econ.MIN_BET_CENTS


@pytest.mark.parametrize(
    "stake,balance,ok",
    [
        (100_00, 1_000_00, True),  # 10% of balance, >= min
        (1, 1_000_00, False),  # below min
        (300_00, 1_000_00, False),  # 30% > 25% cap
    ],
)
def test_is_valid_stake(stake, balance, ok):
    assert gc.is_valid_stake(stake, balance) is ok


# --- penalty stack bounds ---


def test_crowd_penalty_bounds():
    assert gc.crowd_penalty(0.0) == 0.0
    assert gc.crowd_penalty(1.0) == pytest.approx(econ.CROWD_PENALTY_MAX)
    assert gc.crowd_penalty(2.0) == pytest.approx(econ.CROWD_PENALTY_MAX)  # clamped


def test_mercy_multiplier_scales_with_richness():
    # broke player -> no extra mercy penalty; rich player -> max
    assert gc.mercy_multiplier(0, 1_000_00) == 0.0
    assert gc.mercy_multiplier(1_000_00, 1_000_00) == pytest.approx(econ.MERCY_PENALTY_MAX)


def test_volatility_penalty_crypto_harsher_than_stock():
    assert gc.volatility_penalty(TickerKind.CRYPTO) > gc.volatility_penalty(TickerKind.STOCK)


def test_chaos_penalty_within_range():
    rng = random.Random(42)
    for _ in range(1000):
        v = gc.chaos_penalty(rng)
        assert -econ.CHAOS_PENALTY_MAX <= v <= econ.CHAOS_PENALTY_MAX


def test_loss_penalty_never_negative():
    # Even with maximally lucky chaos, total penalty floors at >= 0.
    rng = random.Random(1)
    for _ in range(500):
        b = gc.compute_loss_penalty(
            stake_cents=100_00,
            balance_cents=10_00,
            kind=TickerKind.STOCK,
            same_direction_ratio=0.0,
            rng=rng,
        )
        assert b.total_penalty_cents >= 0


# --- market resolution ---


def test_win_doubles_stake_and_grows_balance():
    res = gc.resolve_market_bet(
        stake_cents=100_00,
        balance_cents=500_00,
        direction=Direction.UP,
        start_price=100.0,
        end_price=110.0,  # went up -> UP bet wins
        kind=TickerKind.STOCK,
        same_direction_ratio=0.0,
    )
    assert res.won is True
    # winning is BAD: balance grows by (WIN_MULTIPLIER - 1) * stake
    assert res.balance_delta_cents == int(100_00 * (econ.WIN_MULTIPLIER - 1))
    assert res.balance_delta_cents > 0


def test_loss_removes_stake_plus_penalty():
    res = gc.resolve_market_bet(
        stake_cents=100_00,
        balance_cents=500_00,
        direction=Direction.UP,
        start_price=100.0,
        end_price=90.0,  # went down -> UP bet loses
        kind=TickerKind.CRYPTO,
        same_direction_ratio=1.0,
        rng=random.Random(7),
    )
    assert res.won is False
    assert res.balance_delta_cents < 0
    assert res.balance_delta_cents == -(100_00 + res.penalty_cents)


# --- roulette ---


def test_roulette_specific_bets_have_lower_caps():
    bal = 1_000_00
    color_cap = gc.roulette_max_bet_cents(RouletteBetType.COLOR, bal)
    straight_cap = gc.roulette_max_bet_cents(RouletteBetType.STRAIGHT, bal)
    assert straight_cap < color_cap  # more specific => tighter limit


def test_roulette_green_only_wins_on_zero():
    assert gc.roulette_is_win(RouletteBetType.GREEN, 0, None) is True
    assert gc.roulette_is_win(RouletteBetType.GREEN, 17, None) is False


def test_roulette_color_and_zero_swallows_outside_bets():
    assert gc.roulette_is_win(RouletteBetType.COLOR, 0, "RED") is False
    # 1 is red on a European wheel
    assert gc.roulette_is_win(RouletteBetType.COLOR, 1, "RED") is True


# --- slots ---


def test_slots_three_of_a_kind_pays():
    reels = [SlotSymbol.SEVEN, SlotSymbol.SEVEN, SlotSymbol.SEVEN]
    payout = gc.slots_payout_cents(reels, 100_00)
    assert payout == int(100_00 * gc.SLOT_THREE_OF_A_KIND_PAYOUT[SlotSymbol.SEVEN])


def test_slots_no_match_pays_nothing():
    reels = [SlotSymbol.CHERRY, SlotSymbol.LEMON, SlotSymbol.BELL]
    assert gc.slots_payout_cents(reels, 100_00) == 0


def test_slots_pair_pays_on_three_reels():
    reels = [SlotSymbol.CHERRY, SlotSymbol.CHERRY, SlotSymbol.BELL]
    payout = gc.slots_payout_cents(reels, 100_00)
    assert payout == int(100_00 * gc.SLOT_TWO_OF_A_KIND_PAYOUT)


def test_slots_pair_pays_nothing_on_five_reels():
    reels = [
        SlotSymbol.CHERRY,
        SlotSymbol.CHERRY,
        SlotSymbol.BELL,
        SlotSymbol.STAR,
        SlotSymbol.LEMON,
    ]
    assert gc.slots_payout_cents(reels, 100_00) == 0


def test_slots_paytable_matches_config():
    rows = {row.symbol: row for row in gc.slots_paytable()}
    assert set(rows) == set(SlotSymbol)
    for symbol, row in rows.items():
        assert row.weight == gc.SLOT_REEL_WEIGHTS[symbol]
        assert row.three_of_a_kind_payout == gc.SLOT_THREE_OF_A_KIND_PAYOUT[symbol]


def test_item_drop_chance_bounds():
    assert 0.0 <= gc.item_drop_chance(0, 1_000_00) <= 1.0
    assert gc.item_drop_chance(1_000_00, 1_000_00) >= gc.item_drop_chance(1_00, 1_000_00)
