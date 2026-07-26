"""Passive drain: a wallet that bleeds on its own.

Deliberately NOT a scheduled tick. Writing a new balance for every holder every
second would mean a DB write per holder per second on a free-tier Postgres,
drift whenever the worker stalls, and a race with resolve_bet's SELECT ... FOR
UPDATE. Instead we store a rate plus an anchor timestamp and derive what has
drained whenever something already has the user loaded -- auth, /me, resolution.
The client interpolates between those points, so the number still ticks smoothly
on screen without the server writing at 10Hz.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone

from app.economy.wallet import apply_delta
from app.game_config import ItemEffect, econ


def drain_rate_cents_per_s(effects: Sequence[tuple[ItemEffect, float]]) -> int:
    """Summed PASSIVE_DRAIN magnitudes as a flat integer cents/second rate.

    Magnitude reads as a fraction of the STARTING balance drained per
    DRAIN_PERIOD_S, which keeps the rate a constant the client can interpolate
    against: Leaky Wallet (0.01) is ~16c/s, Void Piggybank (0.05) ~83c/s.
    Integer cents/sec means the rate truncates once here rather than drifting.
    """
    total = sum(m for effect, m in effects if effect is ItemEffect.PASSIVE_DRAIN)
    if total <= 0:
        return 0
    return int(total * econ.STARTING_BALANCE_CENTS / econ.DRAIN_PERIOD_S)


def accrued_cents(rate_cents_per_s: int, anchor: datetime, now: datetime) -> int:
    """How much has drained since the anchor. Pure, and safe against bad clocks.

    Elapsed time is clamped to DRAIN_MAX_OFFLINE_S so a closed tab can't finish
    the run for the player, and floored at zero so clock skew never refunds.
    """
    if rate_cents_per_s <= 0:
        return 0
    # Postgres hands back an aware datetime for TIMESTAMPTZ; SQLite (tests, and
    # any local run) hands back a naive one. Treat naive as UTC rather than
    # letting the subtraction explode.
    if anchor.tzinfo is None:
        anchor = anchor.replace(tzinfo=timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    elapsed = (now - anchor).total_seconds()
    elapsed = max(0.0, min(elapsed, float(econ.DRAIN_MAX_OFFLINE_S)))
    return int(rate_cents_per_s * elapsed)


def settle_drain(user, now: datetime) -> int:
    """Apply everything owed since the last settle, and re-anchor. Returns cents.

    Routed through wallet.apply_delta rather than touching balance_cents, so the
    $0 clamp, total_lost_cents accrual and the has_won flip all keep working and
    wallet.py remains the only place a balance changes.
    """
    rate = user.drain_rate_cents_per_s or 0
    if rate <= 0:
        return 0
    drained = accrued_cents(rate, user.drain_anchor_at, now)
    if drained > 0:
        apply_delta(user, -drained)
    user.drain_anchor_at = now
    return drained
