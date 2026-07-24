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
