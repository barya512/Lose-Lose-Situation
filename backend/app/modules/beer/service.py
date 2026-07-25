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
from app.game_config import econ


async def buy_beer(session: AsyncSession, user: User) -> User:
    """Charge the beer price to the user's wallet and persist.

    Raises ``InsufficientFunds`` if the balance can't cover the price.
    """
    charge_stake(user, econ.BEER_COST_CENTS)
    await session.commit()
    await session.refresh(user)
    return user
