"""Seed reference data: the droppable item catalog (and demo polls later).

Idempotent — safe to run repeatedly. Run with ``make seed``.
"""

from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import ItemEffect, MarketItem
from app.game_config import ItemRarity

# Items all tilt gameplay toward LOSING money (the objective). Names are flavour.
ITEM_CATALOG: list[dict] = [
    # key, name, rarity, effect_type, magnitude, duration_s, art_key
    dict(key="leaky_wallet", name="Leaky Wallet", rarity=ItemRarity.COMMON,
         effect_type=ItemEffect.PASSIVE_DRAIN, magnitude=0.01, duration_s=None,
         art_key="item_leaky_wallet"),
    dict(key="moth_swarm", name="Moth Swarm", rarity=ItemRarity.COMMON,
         effect_type=ItemEffect.PASSIVE_DRAIN, magnitude=0.02, duration_s=3600,
         art_key="item_moth_swarm"),
    dict(key="black_cat", name="Black Cat", rarity=ItemRarity.RARE,
         effect_type=ItemEffect.ANTI_LUCK, magnitude=0.10, duration_s=1800,
         art_key="item_black_cat"),
    dict(key="broken_mirror", name="Broken Mirror", rarity=ItemRarity.RARE,
         effect_type=ItemEffect.LOSS_MULT, magnitude=0.25, duration_s=3600,
         art_key="item_broken_mirror"),
    dict(key="cursed_coin", name="Cursed Coin", rarity=ItemRarity.EPIC,
         effect_type=ItemEffect.LOSS_MULT, magnitude=0.50, duration_s=None,
         art_key="item_cursed_coin"),
    dict(key="void_piggybank", name="Void Piggybank", rarity=ItemRarity.LEGENDARY,
         effect_type=ItemEffect.PASSIVE_DRAIN, magnitude=0.05, duration_s=None,
         art_key="item_void_piggybank"),
    # Bigger chips AND a bigger cap, so the item that lets you gamble more is
    # also what unlocks the stake gates on the better items.
    dict(key="high_roller", name="High Roller", rarity=ItemRarity.EPIC,
         effect_type=ItemEffect.STAKE_MULT, magnitude=1.0, duration_s=1800,
         art_key="item_high_roller"),
    dict(key="void_contract", name="Void Contract", rarity=ItemRarity.LEGENDARY,
         effect_type=ItemEffect.WIN_DAMPEN, magnitude=0.5, duration_s=None,
         art_key="item_void_contract"),
]


async def seed_items() -> int:
    created = 0
    async with SessionLocal() as session:
        for spec in ITEM_CATALOG:
            exists = await session.scalar(
                select(MarketItem).where(MarketItem.key == spec["key"])
            )
            if exists is not None:
                continue
            session.add(
                MarketItem(
                    key=spec["key"],
                    name=spec["name"],
                    rarity=spec["rarity"].value,
                    effect_type=spec["effect_type"].value,
                    magnitude=spec["magnitude"],
                    duration_s=spec["duration_s"],
                    art_key=spec["art_key"],
                )
            )
            created += 1
        await session.commit()
    return created


async def main() -> None:
    created = await seed_items()
    print(f"Seed complete. {created} new item(s) inserted.")


if __name__ == "__main__":
    asyncio.run(main())
