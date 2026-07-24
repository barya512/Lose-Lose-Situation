"""Wallet service — the only place balances change.

Centralizing mutations keeps the win-condition (reaching $0) and the
``total_lost_cents`` history consistent across every game module. All amounts
are integer cents.
"""

from __future__ import annotations

from app.db.models import User
from app.game_config import econ


class InsufficientFunds(Exception):
    """Raised when a stake exceeds the player's balance."""


def apply_delta(user: User, delta_cents: int) -> None:
    """Apply a signed balance change and update derived stats + win flag.

    A negative delta (losing money) also accrues ``total_lost_cents``. Balance is
    clamped at 0 — you can't go below broke, and hitting 0 wins the game.
    """
    new_balance = user.balance_cents + delta_cents
    if new_balance < 0:
        new_balance = 0
    if delta_cents < 0:
        user.total_lost_cents += min(-delta_cents, user.balance_cents)
    user.balance_cents = new_balance
    if user.balance_cents <= econ.WIN_TARGET_CENTS:
        user.has_won = True


def can_afford(user: User, stake_cents: int) -> bool:
    return stake_cents <= user.balance_cents


def charge_stake(user: User, stake_cents: int) -> None:
    """Reserve/spend a stake up front (used by instant casino bets)."""
    if not can_afford(user, stake_cents):
        raise InsufficientFunds(f"stake {stake_cents} > balance {user.balance_cents}")
    apply_delta(user, -stake_cents)


def credit(user: User, amount_cents: int) -> None:
    """Credit a gross payout (winning — undesirable, grows the balance)."""
    apply_delta(user, +amount_cents)
