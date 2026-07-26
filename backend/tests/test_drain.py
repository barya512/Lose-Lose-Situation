"""Passive drain: rate derivation and lazy accrual.

The wallet is never ticked on a schedule. We store a rate plus an anchor
timestamp and derive what has drained whenever something already loads the
user, so there is no per-holder-per-second write and no drift when the worker
stalls. These cover the arithmetic that makes that safe.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.economy import drain
from app.game_config import ItemEffect, econ

ANCHOR = datetime(2026, 7, 26, 12, 0, 0, tzinfo=timezone.utc)


def test_drain_rate_is_zero_without_items():
    assert drain.drain_rate_cents_per_s([]) == 0
    assert drain.drain_rate_cents_per_s([(ItemEffect.LOSS_MULT, 0.5)]) == 0


def test_drain_rate_reads_magnitude_as_a_share_of_the_starting_wallet():
    # 0.01 of a $1000 start, spread over a minute: ~16c/s (integer cents/sec,
    # so the rate truncates rather than drifting fractionally).
    assert drain.drain_rate_cents_per_s([(ItemEffect.PASSIVE_DRAIN, 0.01)]) == 16
    assert drain.drain_rate_cents_per_s([(ItemEffect.PASSIVE_DRAIN, 0.05)]) == 83


def test_drain_rates_stack():
    two = [(ItemEffect.PASSIVE_DRAIN, 0.01), (ItemEffect.PASSIVE_DRAIN, 0.02)]
    assert drain.drain_rate_cents_per_s(two) == 50  # 0.03 of $1000 over 60s


def test_accrual_is_rate_times_elapsed():
    assert drain.accrued_cents(100, ANCHOR, ANCHOR + timedelta(seconds=10)) == 1000
    assert drain.accrued_cents(100, ANCHOR, ANCHOR) == 0


def test_accrual_is_clamped_to_the_offline_window():
    """Uncapped, the best prize in the game would be not having to play it.

    A permanent drain item is the loop's top reward; if it accrued while the tab
    was closed, the reward for engaging would be that the run finishes itself.
    """
    a_day_later = ANCHOR + timedelta(days=1)
    assert drain.accrued_cents(100, ANCHOR, a_day_later) == 100 * econ.DRAIN_MAX_OFFLINE_S


def test_a_clock_that_runs_backwards_accrues_nothing():
    """Client/server clock skew must never hand money back."""
    assert drain.accrued_cents(100, ANCHOR, ANCHOR - timedelta(hours=1)) == 0


def test_settle_drain_moves_the_wallet_through_the_one_sanctioned_path():
    """Routed through wallet.apply_delta so the $0 clamp, total_lost_cents and
    the has_won flip all keep working -- wallet.py stays the only place a
    balance changes."""

    class FakeUser:
        balance_cents = 10_000
        total_lost_cents = 0
        has_won = False
        drain_rate_cents_per_s = 100
        drain_anchor_at = ANCHOR

    user = FakeUser()
    drained = drain.settle_drain(user, ANCHOR + timedelta(seconds=10))

    assert drained == 1000
    assert user.balance_cents == 9_000
    assert user.total_lost_cents == 1000
    assert user.drain_anchor_at == ANCHOR + timedelta(seconds=10)


def test_settle_drain_wins_the_run_at_zero():
    class FakeUser:
        balance_cents = 500
        total_lost_cents = 0
        has_won = False
        drain_rate_cents_per_s = 100
        drain_anchor_at = ANCHOR

    user = FakeUser()
    drain.settle_drain(user, ANCHOR + timedelta(seconds=60))

    assert user.balance_cents == 0
    assert user.has_won is True


def test_settle_drain_is_a_no_op_without_a_drain():
    class FakeUser:
        balance_cents = 10_000
        total_lost_cents = 0
        has_won = False
        drain_rate_cents_per_s = 0
        drain_anchor_at = ANCHOR

    user = FakeUser()
    assert drain.settle_drain(user, ANCHOR + timedelta(hours=1)) == 0
    assert user.balance_cents == 10_000


@pytest.mark.parametrize("elapsed_s", [1, 7, 60, 299])
def test_accrual_never_exceeds_the_rate_times_the_window(elapsed_s: int):
    accrued = drain.accrued_cents(83, ANCHOR, ANCHOR + timedelta(seconds=elapsed_s))
    assert accrued == 83 * elapsed_s
