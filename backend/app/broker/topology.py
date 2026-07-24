"""RabbitMQ topology declarations.

Single source of truth for exchange/queue names and routing keys so the API
(publisher) and worker (consumer) can never drift. Declared idempotently by
whichever side connects first.
"""

from __future__ import annotations

import aio_pika

# --- Exchange ---
EXCHANGE_NAME = "game.events"

# --- Routing keys ---
RK_BET_MARKET_PLACED = "bet.market.placed"
RK_POLL_CLOSING = "poll.closing"
RK_ITEM_PASSIVE_TICK = "item.passive_tick"

# --- Queues ---
QUEUE_BETS_RESOLVE = "bets.resolve"
QUEUE_POLLS_CLOSE = "polls.close"
QUEUE_ITEMS_TICK = "items.tick"

# --- Dead-letter ---
DLX_NAME = "dlx.dead"
DLQ_NAME = "dlx.dead"


async def declare_topology(channel: aio_pika.abc.AbstractChannel) -> aio_pika.abc.AbstractExchange:
    """Idempotently declare the exchange, queues and bindings. Returns the exchange."""
    dlx = await channel.declare_exchange(DLX_NAME, aio_pika.ExchangeType.FANOUT, durable=True)
    dlq = await channel.declare_queue(DLQ_NAME, durable=True)
    await dlq.bind(dlx)

    exchange = await channel.declare_exchange(
        EXCHANGE_NAME, aio_pika.ExchangeType.TOPIC, durable=True
    )

    queue_args = {"x-dead-letter-exchange": DLX_NAME}

    for queue_name, routing_key in (
        (QUEUE_BETS_RESOLVE, RK_BET_MARKET_PLACED),
        (QUEUE_POLLS_CLOSE, RK_POLL_CLOSING),
        (QUEUE_ITEMS_TICK, RK_ITEM_PASSIVE_TICK),
    ):
        queue = await channel.declare_queue(queue_name, durable=True, arguments=queue_args)
        await queue.bind(exchange, routing_key)

    return exchange
