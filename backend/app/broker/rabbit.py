"""RabbitMQ connection + publish helpers (aio-pika).

A tiny module-level connection manager keeps a single robust connection per
process (API or worker). Robust connections auto-reconnect, which matters on
Render redeploys.
"""

from __future__ import annotations

import asyncio
import json
import logging

import aio_pika
from aio_pika.exceptions import AMQPConnectionError

from app.broker.topology import EXCHANGE_NAME, declare_topology
from app.settings import settings

log = logging.getLogger(__name__)

_connection: aio_pika.abc.AbstractRobustConnection | None = None


async def get_connection() -> aio_pika.abc.AbstractRobustConnection:
    global _connection
    if _connection is None or _connection.is_closed:
        url = settings.rabbitmq_url or ""
        masked = url.replace(settings.rabbitmq_password, "***") if settings.rabbitmq_password else url
        log.info(
            "Connecting to RabbitMQ: host=%r user=%r password_len=%d url=%r",
            settings.rabbitmq_host, settings.rabbitmq_user,
            len(settings.rabbitmq_password or ""), masked,
        )
        _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    return _connection


async def connect_with_retry(
    *, retries: int = 30, base_delay: float = 2.0, max_delay: float = 30.0
) -> aio_pika.abc.AbstractRobustConnection:
    """Connect, tolerating a broker that isn't accepting connections yet.

    ``connect_robust`` only auto-reconnects *after* a first successful connect, so
    the initial attempt can still raise during a startup race (the container is
    "healthy" before the AMQP listener is up) or a transient blip. Retry with a
    linear backoff and re-raise only once ``retries`` attempts are exhausted.
    """
    for attempt in range(1, retries + 1):
        try:
            return await get_connection()
        except (AMQPConnectionError, OSError) as exc:
            if attempt >= retries:
                raise
            delay = min(base_delay * attempt, max_delay)
            log.warning(
                "RabbitMQ unavailable (attempt %d/%d): %s; retrying in %.1fs",
                attempt, retries, exc, delay,
            )
            await asyncio.sleep(delay)
    raise AssertionError("unreachable")  # pragma: no cover


async def publish(routing_key: str, payload: dict) -> None:
    """Publish a JSON message to the game exchange with the given routing key."""
    connection = await get_connection()
    channel = await connection.channel()
    try:
        exchange = await declare_topology(channel)
        message = aio_pika.Message(
            body=json.dumps(payload).encode(),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        await exchange.publish(message, routing_key=routing_key)
    finally:
        await channel.close()


async def close_connection() -> None:
    global _connection
    if _connection is not None and not _connection.is_closed:
        await _connection.close()
    _connection = None


# Exported for callers that want the raw exchange name.
__all__ = ["get_connection", "publish", "close_connection", "EXCHANGE_NAME"]
