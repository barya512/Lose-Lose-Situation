"""RabbitMQ connection + publish helpers (aio-pika).

A tiny module-level connection manager keeps a single robust connection per
process (API or worker). Robust connections auto-reconnect, which matters on
Render redeploys.
"""

from __future__ import annotations

import json

import aio_pika

from app.broker.topology import EXCHANGE_NAME, declare_topology
from app.settings import settings

_connection: aio_pika.abc.AbstractRobustConnection | None = None


async def get_connection() -> aio_pika.abc.AbstractRobustConnection:
    global _connection
    if _connection is None or _connection.is_closed:
        _connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    return _connection


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
