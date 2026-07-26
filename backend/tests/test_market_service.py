"""Market resolution tests, driven through ``resolve_bet``.

Resolution is worker-driven -- no HTTP route settles a bet, and outcomes have to
be forced -- so these run against the same entry point the worker calls, with a
real (in-memory) DB and a stubbed price provider. That is the seam; the private
helpers underneath it are not tested directly.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from app.db.base import Base
from app.db.models import Bet, BetModule, BetStatus, MarketItem, User, UserInventory
from app.game_config import CURATED_TICKERS, Direction, ItemEffect, ItemRarity, econ
from app.modules.market import offers, service
from app.scripts.seed import ITEM_CATALOG
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

TICKER = "BTC-USD"  # crypto: always open, so market hours never flake the test


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        yield s
    await engine.dispose()


@pytest.fixture
def price(monkeypatch):
    """Pin the price the resolver will read back."""

    def _set(value: float):
        class _Stub:
            async def get_price(self, ticker: str) -> float:
                return value

        monkeypatch.setattr(service, "get_provider", lambda: _Stub())

    return _set


@pytest.fixture
def no_broker(monkeypatch):
    """place_market_bet publishes to RabbitMQ; there is no broker under test."""

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(service, "publish", _noop)


async def seed_items(session) -> None:
    """The real catalog, inserted into the test session.

    app.scripts.seed.seed_items opens its own SessionLocal, so it can't be
    pointed at the in-memory DB -- but the catalog constant is the real one, so
    these tests roll against the same items the game ships.
    """
    for spec in ITEM_CATALOG:
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
    await session.flush()


async def make_user(session, **overrides) -> User:
    overrides.setdefault("balance_cents", econ.STARTING_BALANCE_CENTS)
    user = User(**overrides)
    session.add(user)
    await session.flush()
    return user


async def grant(
    session,
    user: User,
    effect: ItemEffect,
    magnitude: float,
    *,
    expires_at: datetime | None = None,
) -> MarketItem:
    item = MarketItem(
        key=f"test_{effect.value.lower()}_{uuid.uuid4().hex[:8]}",
        name="Test Charm",
        rarity=ItemRarity.RARE.value,
        effect_type=effect.value,
        magnitude=magnitude,
        duration_s=None,
    )
    session.add(item)
    await session.flush()
    session.add(
        UserInventory(
            user_id=user.id,
            item_id=item.id,
            acquired_at=datetime.now(timezone.utc),
            expires_at=expires_at,
            active=True,
        )
    )
    await session.flush()
    return item


async def make_bet(
    session,
    user: User,
    *,
    start_price: float,
    direction: Direction,
    stake_cents: int = 100_00,
) -> Bet:
    bet = Bet(
        user_id=user.id,
        module=BetModule.MARKET.value,
        ticker=TICKER,
        direction=direction.value,
        timeframe_s=60,
        start_price=start_price,
        resolve_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        stake_cents=stake_cents,
        status=BetStatus.PENDING.value,
        crowd_same_dir_ratio=0.0,
    )
    session.add(bet)
    await session.commit()
    return bet


# --- Offers ---


@pytest.mark.asyncio
async def test_ensure_offers_covers_every_curated_ticker(session):
    user = await make_user(session)
    await seed_items(session)

    rolled = await offers.ensure_offers(session, user)

    assert {o.ticker for o in rolled} == {spec.symbol for spec in CURATED_TICKERS}


@pytest.mark.asyncio
async def test_offers_are_stable_across_reads(session):
    """The tile promises a specific item; re-entering the market must not reroll."""
    user = await make_user(session)
    await seed_items(session)

    first = {o.ticker: o.item_id for o in await offers.ensure_offers(session, user)}
    second = {o.ticker: o.item_id for o in await offers.ensure_offers(session, user)}

    assert first == second


@pytest.mark.asyncio
async def test_consuming_an_offer_does_not_open_a_free_reroll(session):
    """The whole reason offers are persisted rather than deleted on consume.

    If consuming deleted the row, ensure_offers would roll a fresh one on the
    next visit -- so a player could reroll any ticker for the price of one
    minimum bet: place, leave, re-enter, repeat until a legendary shows up.
    """
    user = await make_user(session)
    await seed_items(session)
    before = {o.ticker: o.item_id for o in await offers.ensure_offers(session, user)}
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)

    consumed = await offers.consume_offer(session, user, TICKER, bet.id)
    after = {o.ticker: o.item_id for o in await offers.ensure_offers(session, user)}

    assert consumed == before[TICKER]
    assert after == before


@pytest.mark.asyncio
async def test_a_consumed_offer_knows_which_bet_took_it(session):
    """Lets the tile keep showing the bounty as 'chasing: <item>' while pending."""
    user = await make_user(session)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)

    await offers.consume_offer(session, user, TICKER, bet.id)

    offer = await offers.get_offer(session, user, TICKER)
    assert offer.consumed_by_bet_id == bet.id


@pytest.mark.asyncio
async def test_placing_a_bet_pins_the_offered_item_to_it(session, price, no_broker):
    """The reward can't drift between committing the stake and resolving."""
    price(100.0)
    user = await make_user(session)
    await seed_items(session)
    offered = {o.ticker: o.item_id for o in await offers.ensure_offers(session, user)}
    await session.commit()

    bet = await service.place_market_bet(
        session, user, ticker=TICKER, direction=Direction.UP,
        stake_cents=100_00, timeframe_s=60,
    )

    assert bet.reward_item_id == offered[TICKER]


# --- Granting the pinned item ---


async def force_offer(session, user, rarity: ItemRarity) -> MarketItem:
    """Pin a known item of a known rarity to TICKER, bypassing the roll."""
    item = await session.scalar(
        select(MarketItem).where(MarketItem.rarity == rarity.value).limit(1)
    )
    offer = await offers.get_offer(session, user, TICKER)
    offer.item_id = item.id
    await session.flush()
    return item


async def held_item_keys(session, user) -> set[str]:
    rows = await session.execute(
        select(MarketItem.key)
        .join(UserInventory, UserInventory.item_id == MarketItem.id)
        .where(UserInventory.user_id == user.id)
    )
    return {key for (key,) in rows.all()}


@pytest.mark.asyncio
async def test_losing_above_the_gate_grants_exactly_the_pinned_item(session, price):
    """LOST is the REWARD outcome in this game -- that is when the bounty pays."""
    price(90.0)  # UP bet, price fell -> miss -> LOST
    user = await make_user(session)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    item = await force_offer(session, user, ItemRarity.COMMON)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)
    bet.reward_item_id = item.id
    await session.commit()

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.LOST.value
    assert await held_item_keys(session, user) == {item.key}
    assert resolved.result_detail["item_drop"]["key"] == item.key


@pytest.mark.asyncio
async def test_losing_below_the_gate_grants_nothing(session, price):
    """The gate is the price of the farming loop: risk buys rarity."""
    price(90.0)
    user = await make_user(session)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    item = await force_offer(session, user, ItemRarity.LEGENDARY)
    # A legendary demands 25% of a $1000 wallet; this stakes $1.
    bet = await make_bet(
        session, user, start_price=100.0, direction=Direction.UP, stake_cents=1_00
    )
    bet.reward_item_id = item.id
    await session.commit()

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.LOST.value
    assert await held_item_keys(session, user) == set()


@pytest.mark.asyncio
async def test_winning_forfeits_the_item_but_still_rerolls(session, price):
    """WON means the balance grew -- the punishing outcome, so no bounty."""
    price(110.0)  # UP bet, price rose -> hit -> WON
    user = await make_user(session)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    item = await force_offer(session, user, ItemRarity.COMMON)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)
    bet.reward_item_id = item.id
    await offers.consume_offer(session, user, TICKER, bet.id)
    await session.commit()

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.WON.value
    assert await held_item_keys(session, user) == set()
    offer = await offers.get_offer(session, user, TICKER)
    assert offer.consumed_by_bet_id is None  # freed up for the next attempt


# --- Bets that outlive the run ---


@pytest.mark.asyncio
async def test_a_bet_resolving_after_the_run_is_won_is_voided(session, price):
    """Market bets are not pre-charged, so one can outlive the $0 finish line.

    Left alone it would resolve WON, call credit(), and hand money back to a
    player who has already won -- and has_won is sticky, so the run would be
    over and funded at the same time.
    """
    price(110.0)  # UP bet, price rose -> would otherwise be a WON payout
    user = await make_user(session, balance_cents=0, has_won=True)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)
    await session.commit()

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.VOID.value
    assert resolved.payout_cents == 0
    assert user.balance_cents == 0
    assert await held_item_keys(session, user) == set()


@pytest.mark.asyncio
async def test_a_voided_bet_leaves_a_losing_run_untouched_too(session, price):
    """The mirror case: a would-be LOSS is voided as well, and grants nothing."""
    price(90.0)
    user = await make_user(session, balance_cents=0, has_won=True)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    item = await force_offer(session, user, ItemRarity.COMMON)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)
    bet.reward_item_id = item.id
    await session.commit()

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.VOID.value
    assert await held_item_keys(session, user) == set()


# --- ANTI_LUCK ---


@pytest.mark.asyncio
async def test_a_marginal_win_resolves_as_a_win_without_the_charm(session, price):
    """Control: +0.1% on an UP bet is a hit, which in this game is the bad outcome."""
    price(100.10)
    user = await make_user(session)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.WON.value


@pytest.mark.asyncio
async def test_anti_luck_charm_turns_that_same_move_into_a_reward(session, price):
    """A Black Cat (magnitude 0.10 -> 0.2% deadband) swallows the same +0.1% move."""
    price(100.10)
    user = await make_user(session)
    await grant(session, user, ItemEffect.ANTI_LUCK, 0.10)
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.LOST.value
    assert resolved.result_detail["anti_luck"]["margin"] == pytest.approx(0.002)
    assert resolved.result_detail["anti_luck"]["flipped"] is True


@pytest.mark.asyncio
async def test_an_expired_charm_stops_biting(session, price):
    price(100.10)
    user = await make_user(session)
    await grant(
        session,
        user,
        ItemEffect.ANTI_LUCK,
        0.10,
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)

    resolved = await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert resolved.status == BetStatus.WON.value


# --- Passive drain ---


@pytest.mark.asyncio
async def test_granting_a_drain_item_starts_the_wallet_bleeding(session, price):
    """The rate is recomputed whenever inventory changes, not polled for."""
    price(90.0)  # UP bet, price fell -> LOST -> the reward outcome
    user = await make_user(session)
    await seed_items(session)
    await offers.ensure_offers(session, user)
    item = await session.scalar(
        select(MarketItem).where(MarketItem.key == "leaky_wallet")
    )
    offer = await offers.get_offer(session, user, TICKER)
    offer.item_id = item.id
    bet = await make_bet(session, user, start_price=100.0, direction=Direction.UP)
    bet.reward_item_id = item.id
    await session.commit()

    await service.resolve_bet(session, bet.id, rng=random.Random(7))

    assert "leaky_wallet" in await held_item_keys(session, user)
    assert user.drain_rate_cents_per_s == 16  # 0.01 of $1000 over 60s
