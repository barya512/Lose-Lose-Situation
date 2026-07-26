"""Unit tests for the central economy/formula module.

These are the balance-critical bits, so they're covered without any DB/broker.
"""

from __future__ import annotations

import random

import pytest

from app import game_config as gc
from app.game_config import (
    Direction,
    ItemRarity,
    RouletteBetType,
    SlotSymbol,
    TickerKind,
    econ,
)


# --- bet sizing ---


def test_max_bet_is_fraction_of_balance():
    assert gc.max_bet_cents(1_000_00) == int(1_000_00 * econ.MAX_BET_FRACTION)


def test_max_bet_never_below_minimum():
    assert gc.max_bet_cents(1) == econ.MIN_BET_CENTS


def test_min_bet_is_the_whole_balance_below_the_minimum():
    # "Last call": a wallet under the minimum stake would otherwise be softlocked
    # (too poor to bet, not yet at the $0 win), so the remainder IS the stake.
    assert gc.min_bet_cents(43) == 43


def test_min_bet_is_the_configured_minimum_when_affordable():
    assert gc.min_bet_cents(1_000_00) == econ.MIN_BET_CENTS


def test_min_bet_offers_no_free_play_at_zero():
    # $0 is the win condition, not a last call — the normal minimum applies and
    # the caller's balance check then rejects the bet.
    assert gc.min_bet_cents(0) == econ.MIN_BET_CENTS


@pytest.mark.parametrize(
    "stake,balance,ok",
    [
        (100_00, 1_000_00, True),  # 10% of balance, >= min
        (1, 1_000_00, False),  # below min
        (300_00, 1_000_00, False),  # 30% > 25% cap
        (43, 43, True),  # last call: the whole sub-minimum remainder
        (20, 43, False),  # ...but only the WHOLE remainder — no grinding
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


# --- LOSS_MULT and WIN_DAMPEN ---


def test_loss_mult_adds_its_magnitude_to_the_penalty_stack():
    cursed_coin = [(gc.ItemEffect.LOSS_MULT, 0.50)]
    kwargs = dict(
        stake_cents=100_00, balance_cents=500_00, kind=TickerKind.STOCK,
        same_direction_ratio=0.0,
    )
    # Same seed both times, so chaos is identical and the item is the only
    # difference between the two stacks.
    without = gc.compute_loss_penalty(**kwargs, rng=random.Random(7))
    with_item = gc.compute_loss_penalty(
        **kwargs, effects=cursed_coin, rng=random.Random(7)
    )

    assert without.item_mult == 0.0
    assert with_item.item_mult == 0.50
    assert with_item.total_penalty_cents > without.total_penalty_cents


def test_loss_mult_is_capped_when_charms_stack():
    stacked = [(gc.ItemEffect.LOSS_MULT, 0.50)] * 10
    breakdown = gc.compute_loss_penalty(
        stake_cents=100_00, balance_cents=500_00, kind=TickerKind.STOCK,
        same_direction_ratio=0.0, effects=stacked, rng=random.Random(7),
    )
    assert breakdown.item_mult == econ.ITEM_LOSS_MULT_CAP


def test_win_dampen_cuts_the_gain_by_its_magnitude():
    # Void Contract halves what a winning bet gains.
    assert gc.win_dampen_factor([]) == 1.0
    assert gc.win_dampen_factor([(gc.ItemEffect.WIN_DAMPEN, 0.5)]) == 0.5


def test_win_dampen_never_reaches_zero():
    """A win must still gain something, or the punishing outcome becomes free
    and the market loses its only source of pressure."""
    hoard = [(gc.ItemEffect.WIN_DAMPEN, 0.5)] * 10
    assert gc.win_dampen_factor(hoard) == pytest.approx(1.0 - econ.WIN_DAMPEN_CAP)
    assert gc.win_dampen_factor(hoard) > 0.0


def test_win_dampen_cuts_the_gain_but_never_the_returned_stake():
    """A dampened win must not become a net loss -- that would be a free reward."""
    res = gc.resolve_market_bet(
        stake_cents=100_00, balance_cents=500_00, direction=Direction.UP,
        start_price=100.0, end_price=110.0, kind=TickerKind.STOCK,
        same_direction_ratio=0.0, effects=[(gc.ItemEffect.WIN_DAMPEN, 0.5)],
    )
    assert res.won is True
    # Undampened this gains the full stake ($100); halved, it gains $50.
    assert res.balance_delta_cents == 50_00
    assert res.balance_delta_cents > 0


def test_win_dampen_applies_to_casino_payouts_too():
    """Otherwise the player dodges the item by walking to another machine."""
    halved = [(gc.ItemEffect.WIN_DAMPEN, 0.5)]
    # A $100 stake paying $300 is $200 of profit; halved, $100 of profit.
    assert gc.dampened_payout_cents(300_00, 100_00, halved) == 200_00
    # A payout at or below the stake is not profit, so it is untouched.
    assert gc.dampened_payout_cents(100_00, 100_00, halved) == 100_00
    assert gc.dampened_payout_cents(0, 100_00, halved) == 0


# --- STAKE_MULT: the chip ladder and the cap move together ---


def test_stake_multiplier_stacks_and_caps():
    high_roller = [(gc.ItemEffect.STAKE_MULT, 1.0)]
    assert gc.stake_multiplier([]) == 1.0
    assert gc.stake_multiplier(high_roller) == 2.0
    assert gc.stake_multiplier(high_roller * 2) == pytest.approx(
        1.0 + econ.STAKE_MULT_CAP
    )


def test_stake_mult_scales_the_chips():
    # Base ladder is $1 / $10 / $50 / $100; a High Roller doubles every rung.
    assert gc.chip_ladder_cents([], 1_000_00) == [1_00, 10_00, 50_00, 100_00]
    assert gc.chip_ladder_cents([(gc.ItemEffect.STAKE_MULT, 1.0)], 1_000_00) == [
        2_00,
        20_00,
        100_00,
        200_00,
    ]


def test_stake_mult_raises_the_cap_by_the_same_factor():
    """Otherwise the item defeats itself: bigger chips, all above the cap.

    Scaling the ladder alone would push the top rungs past MAX_BET_FRACTION and
    grey them out, making the item that lets you gamble more actually gamble
    less the stronger it got.
    """
    bal = 1_000_00
    assert gc.max_bet_cents(bal) == 250_00
    assert gc.max_bet_cents(bal, stake_mult=2.0) == 500_00


def test_a_chip_above_the_wallet_goes_all_in_rather_than_being_refused():
    # "Last call" generalised: no chip is ever dead, it just stakes everything.
    assert gc.effective_stake_cents(100_00, 1_000_00) == 100_00  # affordable
    assert gc.effective_stake_cents(100_00, 43) == 43  # all in


def test_all_in_is_legal_even_though_it_exceeds_the_max_bet():
    # $43 wallet: the $1 chip is affordable, and every larger chip goes all in.
    assert gc.is_valid_stake(43, 43) is True


def test_a_stake_outside_the_ladder_is_refused_even_at_the_balance():
    """The property Part 2b exists to protect.

    If the server accepted "any stake >= balance means all in", a client could
    post stake_cents: 999999999 and go all in every time, making
    MAX_BET_FRACTION unenforceable. All-in is only reachable through a chip.
    """
    bal = 1_000_00
    assert gc.is_valid_stake(999_999_999, bal) is False
    assert gc.is_valid_stake(bal, bal) is False  # above the 25% cap, not a chip
    assert gc.is_valid_stake(37_42, bal) is False  # arbitrary, affordable, not a chip


# --- ANTI_LUCK price margin ---
#
# The charm biases the *direction call* against the player: the move has to
# clear start_price by the margin to count as a hit. Inside the band the bet
# reads as a miss -- which in this game is the REWARD outcome.


def test_anti_luck_margin_counts_a_small_up_move_as_down():
    # +0.5% move, 1% margin: the price rose, but not enough to pay out.
    actual = gc.direction_from_prices(
        100.0, 100.5, anti_luck_margin=0.01, bet_direction=Direction.UP
    )
    assert actual is Direction.DOWN


def test_anti_luck_margin_counts_a_small_down_move_as_up():
    # -0.5% move, 1% margin: mirror image, so a DOWN bet misses too.
    actual = gc.direction_from_prices(
        100.0, 99.5, anti_luck_margin=0.01, bet_direction=Direction.DOWN
    )
    assert actual is Direction.UP


def test_anti_luck_margin_pays_out_exactly_at_the_boundary():
    # Clearing the margin exactly still counts as a hit, so the band is the
    # half-open interval [start, start*(1+margin)) -- not a silent extra cent.
    assert (
        gc.direction_from_prices(
            100.0, 101.0, anti_luck_margin=0.01, bet_direction=Direction.UP
        )
        is Direction.UP
    )
    assert (
        gc.direction_from_prices(
            100.0, 99.0, anti_luck_margin=0.01, bet_direction=Direction.DOWN
        )
        is Direction.DOWN
    )


def test_anti_luck_margin_of_zero_is_the_bare_comparison():
    # A player holding no charms must see exactly the old behaviour, including
    # the flat-price case resolving UP.
    for start, end in ((100.0, 110.0), (100.0, 90.0), (100.0, 100.0)):
        bare = gc.direction_from_prices(start, end)
        for bet in (Direction.UP, Direction.DOWN):
            assert (
                gc.direction_from_prices(
                    start, end, anti_luck_margin=0.0, bet_direction=bet
                )
                is bare
            )


def test_anti_luck_margin_scales_and_stacks_across_charms():
    # Black Cat carries magnitude 0.10; at 0.02 margin per point of magnitude
    # that is a 0.2% deadband, and a second cat doubles it.
    one_cat = [(gc.ItemEffect.ANTI_LUCK, 0.10)]
    assert gc.anti_luck_margin(one_cat) == pytest.approx(0.002)
    assert gc.anti_luck_margin(one_cat * 2) == pytest.approx(0.004)


def test_anti_luck_margin_is_capped_however_many_stack():
    # Six cats would be 1.2%; the cap holds the deadband at 1% so a hoard can
    # never make every market bet an automatic loss (i.e. a free win).
    assert gc.anti_luck_margin([(gc.ItemEffect.ANTI_LUCK, 0.10)] * 6) == pytest.approx(0.01)


def test_anti_luck_margin_turns_a_marginal_win_into_a_reward():
    # The player called UP and the price DID rise -- but only 0.5%, inside a
    # 1% deadband. The charm converts the punishing WON into the LOST the
    # player actually wants, and the loss is priced like any other.
    res = gc.resolve_market_bet(
        stake_cents=100_00,
        balance_cents=500_00,
        direction=Direction.UP,
        start_price=100.0,
        end_price=100.5,
        kind=TickerKind.STOCK,
        same_direction_ratio=0.0,
        anti_luck_margin=0.01,
        rng=random.Random(7),
    )
    assert res.won is False
    assert res.balance_delta_cents == -(100_00 + res.penalty_cents)


def test_anti_luck_margin_ignores_unrelated_effects():
    assert gc.anti_luck_margin([]) == 0.0
    assert gc.anti_luck_margin([(gc.ItemEffect.PASSIVE_DRAIN, 0.05)]) == 0.0


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


def test_slots_ineligible_pair_pays_nothing_on_three_reels():
    # BELL is not in SLOT_PAIR_ELIGIBLE_SYMBOLS — a bare pair is a near-miss loss.
    reels = [SlotSymbol.BELL, SlotSymbol.BELL, SlotSymbol.CHERRY]
    assert gc.slots_payout_cents(reels, 100_00) == 0
    assert SlotSymbol.BELL not in gc.SLOT_PAIR_ELIGIBLE_SYMBOLS


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


def test_item_stake_gate_rises_with_rarity():
    # On a $1000 wallet: $10 / $50 / $100 / $250. The legendary gate lands
    # exactly on MAX_BET_FRACTION -- the biggest bet the game normally allows.
    bal = 1_000_00
    assert gc.item_stake_gate_cents(ItemRarity.COMMON, bal) == 10_00
    assert gc.item_stake_gate_cents(ItemRarity.RARE, bal) == 50_00
    assert gc.item_stake_gate_cents(ItemRarity.EPIC, bal) == 100_00
    assert gc.item_stake_gate_cents(ItemRarity.LEGENDARY, bal) == 250_00


def test_going_all_in_clears_every_gate_however_poor_the_wallet():
    # Anti-softlock, mirroring "last call": a nearly-broke player must still be
    # able to chase a legendary, so the desperate play stays the correct one.
    for balance in (43, 1_00, 1_000_00):
        for rarity in ItemRarity:
            assert gc.item_stake_gate_cents(rarity, balance) <= balance


def test_item_drop_chance_bounds():
    assert 0.0 <= gc.item_drop_chance(0, 1_000_00) <= 1.0
    assert gc.item_drop_chance(1_000_00, 1_000_00) >= gc.item_drop_chance(1_00, 1_000_00)
