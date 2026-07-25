"""End-to-end HTTP smoke tests against in-memory SQLite.

Exercises the instant-bet path (auth -> wallet -> casino formulas -> DB) through
the real FastAPI app + dependency graph. The market path is worker-driven and is
covered by the pure-formula tests; here we prove the synchronous wiring works.
"""

from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db import base as db_base
from app.db.base import Base
from app.game_config import econ


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Point the app at a fresh in-memory DB and create the schema.
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    testing_sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
