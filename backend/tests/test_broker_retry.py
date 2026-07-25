"""Startup-resilience for the broker connection.

The worker (and API) can race RabbitMQ at boot: the container is "healthy" per
the Erlang-node ping before the AMQP listener on 5672 accepts connections, so the
first connect is refused. `connect_with_retry` must ride out that window instead
of letting the process crash.
"""

from __future__ import annotations

import pytest
from aio_pika.exceptions import AMQPConnectionError
from app.broker import rabbit


@pytest.mark.asyncio
async def test_connect_with_retry_succeeds_after_transient_refusals(monkeypatch):
    sentinel = object()
    calls = {"n": 0}

    async def flaky_get_connection():
        calls["n"] += 1
        if calls["n"] < 3:
            raise AMQPConnectionError("connection refused")
        return sentinel

    monkeypatch.setattr(rabbit, "get_connection", flaky_get_connection)

    # base_delay=0 keeps the test fast; the retry policy is what's under test.
    result = await rabbit.connect_with_retry(retries=5, base_delay=0)

    assert result is sentinel
    assert calls["n"] == 3  # failed twice, succeeded on the third attempt


@pytest.mark.asyncio
async def test_connect_with_retry_raises_after_exhausting_attempts(monkeypatch):
    calls = {"n": 0}

    async def always_refused():
        calls["n"] += 1
        raise AMQPConnectionError("connection refused")

    monkeypatch.setattr(rabbit, "get_connection", always_refused)

    with pytest.raises(AMQPConnectionError):
        await rabbit.connect_with_retry(retries=3, base_delay=0)

    assert calls["n"] == 3  # exactly `retries` attempts, then give up
