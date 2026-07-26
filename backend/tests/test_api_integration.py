"""End-to-end HTTP smoke tests against in-memory SQLite.

Exercises the synchronous paths through the real FastAPI app + dependency graph:
auth, wallet, casino formulas, and the market's placement and offers endpoints.

Market *resolution* is not here -- it is worker-driven, with no HTTP route that
settles a bet and no way to force an outcome over the wire. That lives in
test_market_service.py, driven through ``resolve_bet``.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import base as db_base
from app.db.base import Base
from app.db.models import MarketItem
from app.scripts.seed import ITEM_CATALOG
from app.game_config import CURATED_TICKERS, econ


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Point the app at a fresh in-memory DB and create the schema.
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    testing_sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # The item catalog is reference data every real deployment has (`make seed`),
    # and market offers roll against it, so the test DB carries it too.
    async with testing_sessionmaker() as seed_session:
        for spec in ITEM_CATALOG:
            seed_session.add(
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
        await seed_session.commit()

    # Redirect the app's session factory + dependency to the test engine.
    monkeypatch.setattr(db_base, "SessionLocal", testing_sessionmaker)

    async def _get_session():
        async with testing_sessionmaker() as session:
            yield session

    from app.db.base import get_session
    from app.main import app

    app.dependency_overrides[get_session] = _get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_guest_starts_with_starting_balance(client: AsyncClient):
    resp = await client.post("/api/v1/auth/guest")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user"]["balance_cents"] == econ.STARTING_BALANCE_CENTS
    assert body["user"]["is_guest"] is True
    assert body["access_token"]


@pytest.mark.asyncio
async def test_register_then_login_round_trip(client: AsyncClient):
    creds = {"username": "gambler", "password": "dont-lose-this"}

    reg = await client.post("/api/v1/auth/register", json=creds)
    assert reg.status_code == 201, reg.text  # password hashing must not blow up
    reg_body = reg.json()
    assert reg_body["user"]["username"] == "gambler"
    assert reg_body["user"]["is_guest"] is False
    assert reg_body["access_token"]

    # Registering the same username again is a conflict, not a 500.
    dup = await client.post("/api/v1/auth/register", json=creds)
    assert dup.status_code == 409

    # The stored hash verifies on login...
    ok = await client.post("/api/v1/auth/login", json=creds)
    assert ok.status_code == 200, ok.text
    assert ok.json()["user"]["username"] == "gambler"

    # ...and a wrong password is rejected, not accepted or crashed.
    bad = await client.post(
        "/api/v1/auth/login", json={**creds, "password": "wrong-password"}
    )
    assert bad.status_code == 401


@pytest.mark.asyncio
async def test_slot_spin_moves_wallet(client: AsyncClient):
    token = (await client.post("/api/v1/auth/guest")).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    before = (await client.get("/api/v1/me", headers=auth)).json()["balance_cents"]
    stake = 100_00
    resp = await client.post(
        "/api/v1/casino/slots/spin", json={"stake_cents": stake}, headers=auth
    )
    assert resp.status_code == 200
    result = resp.json()

    after = (await client.get("/api/v1/me", headers=auth)).json()["balance_cents"]
    net = result["result_detail"]["net_cents"]
    assert after == before + net
    # A losing spin (the desired outcome) removes exactly the stake.
    if result["payout_cents"] == 0:
        assert after == before - stake


@pytest.mark.asyncio
async def test_slots_info_is_public_and_matches_config(client: AsyncClient):
    from app import game_config as gc

    resp = await client.get("/api/v1/casino/slots/info")
    assert resp.status_code == 200
    body = resp.json()
    assert body["min_reels"] == gc.SLOT_MIN_REELS
    assert body["max_reels"] == gc.SLOT_MAX_REELS
    assert body["two_of_a_kind_payout"] == gc.SLOT_TWO_OF_A_KIND_PAYOUT
    assert body["two_of_a_kind_disabled_reel_counts"] == sorted(
        gc.SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS
    )
    assert {s["symbol"] for s in body["symbols"]} == {s.value for s in gc.SlotSymbol}


@pytest.mark.asyncio
async def test_buy_beer_moves_wallet(client: AsyncClient):
    token = (await client.post("/api/v1/auth/guest")).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}

    me_before = (await client.get("/api/v1/me", headers=auth)).json()
    before = me_before["balance_cents"]
    lost_before = me_before["total_lost_cents"]

    resp = await client.post("/api/v1/beer/buy", headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["cost_cents"] == econ.BEER_COST_CENTS

    me_after = (await client.get("/api/v1/me", headers=auth)).json()
    # One beer removes exactly its price from the wallet...
    assert me_after["balance_cents"] == before - econ.BEER_COST_CENTS
    # ...and that loss is recorded in the running total.
    assert me_after["total_lost_cents"] == lost_before + econ.BEER_COST_CENTS


@pytest.mark.asyncio
async def test_last_beer_costs_the_remainder_and_wins_the_run(
    client: AsyncClient, monkeypatch
):
    """The last beer is priced at whatever is left, so it always finishes a run."""
    monkeypatch.setattr(econ, "STARTING_BALANCE_CENTS", 43)
    auth = await _guest_auth(client)

    resp = await client.post("/api/v1/beer/buy", headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["cost_cents"] == 43  # not the $1 list price

    me = (await client.get("/api/v1/me", headers=auth)).json()
    assert me["balance_cents"] == 0
    assert me["has_won"] is True
    assert me["total_lost_cents"] == 43


@pytest.mark.asyncio
async def test_casino_last_call_stakes_the_whole_remainder(client: AsyncClient, monkeypatch):
    """A sub-$1 wallet must still be able to gamble its way to $0.

    Below MIN_BET_CENTS the remainder is the only legal stake, so both machines
    take it — and a partial stake is still refused.
    """
    monkeypatch.setattr(econ, "STARTING_BALANCE_CENTS", 43)
    auth = await _guest_auth(client)

    partial = await client.post(
        "/api/v1/casino/slots/spin", json={"stake_cents": 20}, headers=auth
    )
    assert partial.status_code == 400  # no cent-by-cent grinding

    spin = await client.post(
        "/api/v1/casino/slots/spin", json={"stake_cents": 43}, headers=auth
    )
    assert spin.status_code == 200, spin.text

    me = (await client.get("/api/v1/me", headers=auth)).json()
    if spin.json()["payout_cents"] == 0:
        # The desired outcome: the last 43c is gone and the run is won.
        assert me["balance_cents"] == 0
        assert me["has_won"] is True
    else:
        # Punished with a payout — still solvent, so roulette takes the new
        # remainder and the run stays playable.
        roulette = await client.post(
            "/api/v1/casino/roulette",
            json={
                "bet_type": "COLOR",
                "selection": "RED",
                "stake_cents": me["balance_cents"],
            },
            headers=auth,
        )
        assert roulette.status_code == 200, roulette.text


@pytest.mark.asyncio
async def test_roulette_rejects_oversized_specific_bet(client: AsyncClient):
    token = (await client.post("/api/v1/auth/guest")).json()["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    # Straight bet cap is 10% of balance; stake the whole bankroll -> rejected.
    resp = await client.post(
        "/api/v1/casino/roulette",
        json={"bet_type": "STRAIGHT", "selection": 7, "stake_cents": econ.STARTING_BALANCE_CENTS},
        headers=auth,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_auth_required_for_me(client: AsyncClient):
    resp = await client.get("/api/v1/me")
    assert resp.status_code == 401  # no bearer token -> unauthenticated


class _FakeProvider:
    """Deterministic price source so market tests never touch the network."""

    async def get_price(self, symbol: str) -> float:
        return 100.0


def _stub_market(monkeypatch):
    """Replace the live price provider + RabbitMQ publish for placing bets."""

    async def _noop_publish(*args, **kwargs):
        return None

    monkeypatch.setattr("app.modules.market.service.get_provider", lambda: _FakeProvider())
    monkeypatch.setattr("app.modules.market.service.publish", _noop_publish)
    # The offers grid prices every curated ticker, so it needs the stub too.
    monkeypatch.setattr("app.api.v1.market.get_provider", lambda: _FakeProvider())



async def _guest_auth(client: AsyncClient) -> dict[str, str]:
    token = (await client.post("/api/v1/auth/guest")).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_market_one_open_bet_per_symbol(client: AsyncClient, monkeypatch):
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)
    body = {"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 50_00, "timeframe_s": 60}

    first = await client.post("/api/v1/market/bets", json=body, headers=auth)
    assert first.status_code == 201

    # Second bet on the SAME symbol while the first is PENDING -> rejected.
    dup = await client.post("/api/v1/market/bets", json=body, headers=auth)
    assert dup.status_code == 400

    # A DIFFERENT symbol is fine — the rule is per-symbol, not per-user.
    other = await client.post(
        "/api/v1/market/bets", json={**body, "ticker": "ETH-USD"}, headers=auth
    )
    assert other.status_code == 201


@pytest.mark.asyncio
async def test_market_pending_bets_listing(client: AsyncClient, monkeypatch):
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)
    body = {"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 50_00, "timeframe_s": 60}
    await client.post("/api/v1/market/bets", json=body, headers=auth)
    await client.post("/api/v1/market/bets", json={**body, "ticker": "ETH-USD"}, headers=auth)

    pending = await client.get("/api/v1/market/bets?status=pending", headers=auth)
    assert pending.status_code == 200
    data = pending.json()
    assert {b["ticker"] for b in data} == {"BTC-USD", "ETH-USD"}
    assert all(b["status"] == "PENDING" for b in data)

    # No filter -> all of the user's market bets.
    all_bets = await client.get("/api/v1/market/bets", headers=auth)
    assert len(all_bets.json()) == 2

    # A bogus status is a clean 400, not a 500.
    bad = await client.get("/api/v1/market/bets?status=bogus", headers=auth)
    assert bad.status_code == 400


@pytest.mark.asyncio
async def test_market_pending_bets_are_scoped_to_caller(client: AsyncClient, monkeypatch):
    _stub_market(monkeypatch)
    body = {"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 50_00, "timeframe_s": 60}

    auth_a = await _guest_auth(client)
    await client.post("/api/v1/market/bets", json=body, headers=auth_a)

    # A second guest sees none of the first guest's bets.
    auth_b = await _guest_auth(client)
    resp = await client.get("/api/v1/market/bets", headers=auth_b)
    assert resp.json() == []


@pytest.mark.asyncio
async def test_market_offers_name_the_item_each_ticker_is_worth(
    client: AsyncClient, monkeypatch
):
    """The point of the whole feature: know the prize BEFORE staking."""
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)

    resp = await client.get("/api/v1/market/offers", headers=auth)

    assert resp.status_code == 200, resp.text
    offers = resp.json()
    assert {o["symbol"] for o in offers} == {s.symbol for s in CURATED_TICKERS}
    withitem = [o for o in offers if o["reward_item"] is not None]
    assert withitem, "no ticker carried a bounty"
    for offer in withitem:
        assert offer["reward_item"]["key"]
        assert offer["reward_item"]["rarity"]
        # A gate the client can render as "$N+ to qualify".
        assert offer["reward_stake_gate_cents"] > 0


@pytest.mark.asyncio
async def test_market_offers_are_stable_and_survive_placing_a_bet(
    client: AsyncClient, monkeypatch
):
    """The decision-1 reroll hole, guarded at the HTTP seam.

    If placing a bet freed the ticker to re-roll, a player could buy an
    unlimited reroll for the price of one minimum stake.
    """
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)

    def by_symbol(payload):
        return {
            o["symbol"]: (o["reward_item"] or {}).get("key") for o in payload
        }

    first = by_symbol((await client.get("/api/v1/market/offers", headers=auth)).json())
    second = by_symbol((await client.get("/api/v1/market/offers", headers=auth)).json())
    assert first == second

    placed = await client.post(
        "/api/v1/market/bets",
        json={"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 50_00,
              "timeframe_s": 60},
        headers=auth,
    )
    assert placed.status_code == 201

    after = (await client.get("/api/v1/market/offers", headers=auth)).json()
    assert by_symbol(after) == first
    # And the tile can still say "chasing: <item>" while the bet runs.
    btc = next(o for o in after if o["symbol"] == "BTC-USD")
    assert btc["pending_bet_id"] == placed.json()["id"]


@pytest.mark.asyncio
async def test_market_offers_are_scoped_to_the_caller(client: AsyncClient, monkeypatch):
    _stub_market(monkeypatch)
    auth_a = await _guest_auth(client)
    auth_b = await _guest_auth(client)

    a = (await client.get("/api/v1/market/offers", headers=auth_a)).json()
    await client.post(
        "/api/v1/market/bets",
        json={"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 50_00,
              "timeframe_s": 60},
        headers=auth_a,
    )
    b = (await client.get("/api/v1/market/offers", headers=auth_b)).json()

    assert all(o["pending_bet_id"] is None for o in b)
    assert next(o for o in a if o["symbol"] == "BTC-USD")


@pytest.mark.asyncio
async def test_market_chip_above_the_wallet_goes_all_in(client: AsyncClient, monkeypatch):
    """No chip on the board is dead: clicking one you can't afford bets it all."""
    _stub_market(monkeypatch)
    monkeypatch.setattr(econ, "STARTING_BALANCE_CENTS", 43)
    auth = await _guest_auth(client)

    resp = await client.post(
        "/api/v1/market/bets",
        json={"ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 100_00,
              "timeframe_s": 60},
        headers=auth,
    )

    assert resp.status_code == 201, resp.text
    assert resp.json()["stake_cents"] == 43  # not the $100 the client asked for


@pytest.mark.asyncio
async def test_market_rejects_a_stake_that_is_not_a_chip(client: AsyncClient, monkeypatch):
    """Closes the all-in bypass: a huge stake must not become a free all-in.

    If it did, MAX_BET_FRACTION would be unenforceable -- any client could post
    an enormous number and go all in on every bet.
    """
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)
    body = {"ticker": "BTC-USD", "direction": "DOWN", "timeframe_s": 60}

    huge = await client.post(
        "/api/v1/market/bets", json={**body, "stake_cents": 999_999_999}, headers=auth
    )
    assert huge.status_code == 400

    arbitrary = await client.post(
        "/api/v1/market/bets", json={**body, "stake_cents": 37_42}, headers=auth
    )
    assert arbitrary.status_code == 400


@pytest.mark.asyncio
async def test_market_offers_publish_the_chip_ladder(client: AsyncClient, monkeypatch):
    """The client renders the server's ladder rather than hardcoding its own."""
    _stub_market(monkeypatch)
    auth = await _guest_auth(client)

    offers = (await client.get("/api/v1/market/offers", headers=auth)).json()

    assert offers[0]["chips_cents"] == [1_00, 10_00, 50_00, 100_00]


@pytest.mark.asyncio
async def test_slots_chip_above_the_wallet_goes_all_in(client: AsyncClient, monkeypatch):
    """Same doctrine as the market: a chip you can't afford stakes everything.

    Additive to the existing free-form path -- an arbitrary stake over the
    balance is still refused, because only a ladder chip earns the clamp.
    """
    monkeypatch.setattr(econ, "STARTING_BALANCE_CENTS", 43)
    auth = await _guest_auth(client)

    spin = await client.post(
        "/api/v1/casino/slots/spin", json={"stake_cents": 100_00}, headers=auth
    )
    assert spin.status_code == 200, spin.text
    assert spin.json()["stake_cents"] == 43

    me = (await client.get("/api/v1/me", headers=auth)).json()
    over = await client.post(
        "/api/v1/casino/slots/spin",
        json={"stake_cents": me["balance_cents"] + 7},
        headers=auth,
    )
    assert over.status_code == 400


@pytest.mark.asyncio
async def test_me_settles_the_drain_and_publishes_the_rate(client: AsyncClient):
    """The wallet bleeds without any scheduled tick: reading it settles it.

    /me also hands back the rate and the server clock so the client can
    interpolate smoothly between polls instead of trusting its own Date.now().
    """
    from datetime import datetime, timedelta, timezone

    from app.db.base import SessionLocal
    from app.db.models import User

    auth = await _guest_auth(client)
    before = (await client.get("/api/v1/me", headers=auth)).json()
    assert before["drain_rate_cents_per_s"] == 0
    assert before["server_time"]

    # Backdate the anchor rather than sleeping: same arithmetic, no wall clock.
    async with SessionLocal() as s:
        user = await s.scalar(User.__table__.select().limit(0)) or None
        from sqlalchemy import select as _select

        u = await s.scalar(_select(User).limit(1))
        u.drain_rate_cents_per_s = 100
        u.drain_anchor_at = datetime.now(timezone.utc) - timedelta(seconds=10)
        await s.commit()

    after = (await client.get("/api/v1/me", headers=auth)).json()

    assert after["drain_rate_cents_per_s"] == 100
    assert after["balance_cents"] == before["balance_cents"] - 1000
    assert after["total_lost_cents"] == before["total_lost_cents"] + 1000
