"""Beer module: buy/drink a beer for a fixed price.

A beer is not a bet — there's no chance and no payout. It just drains the wallet
by ``BEER_COST_CENTS``, which (in this inverted game) nudges the player toward the
$0 win condition. All balance movement flows through the wallet service so
``total_lost_cents`` and the win flag stay consistent.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.economy.wallet import charge_stake
from app.game_config import beer_cents


async def buy_beer(session: AsyncSession, user: User) -> tuple[User, int]:
    """Charge the beer price to the user's wallet and persist.

    Returns the user alongside what this beer actually cost — a wallet holding
    less than the list price pays its remainder instead (see ``beer_cents``), so
    the caller can't assume the constant. Raises ``InsufficientFunds`` if the
    balance can't cover even that, which only happens at $0.
    """
    cost_cents = beer_cents(user.balance_cents)
    charge_stake(user, cost_cents)
    await session.commit()
    await session.refresh(user)
    return user, cost_cents
