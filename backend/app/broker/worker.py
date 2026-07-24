"""Background worker entrypoint.

Resolves timed market bets two ways, for reliability:

  1. Queue consumer (low latency): when a bet is placed, a message arrives with
     its ``resolve_at``. For near-term bets the consumer waits out the remaining
     time and resolves immediately; long-dated bets are left to the scanner so we
     never hold a message (and a consumer slot) for an hour.
  2. Due-scanner (belt-and-suspenders): every few seconds it resolves any PENDING
     market bet whose ``resolve_at`` has passed — covering dropped messages and
     restarts. ``resolve_bet`` is idempotent, so overlap is harmless.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

import aio_pika
from sqlalchemy import select

from app.broker.rabbit import get_connection
from app.broker.topology import (
    QUEUE_BETS_RESOLVE,
    QUEUE_ITEMS_TICK,
    QUEUE_POLLS_CLOSE,
    declare_topology,
)
from app.db.base import SessionLocal
from app.db.models import Bet, BetModule, BetStatus
from app.modules.market.service import resolve_bet

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker")

PREFETCH = 16
DUE_SCANNER_INTERVAL_S = 5
# Only the consumer path waits inline for bets resolving within this window;
# anything longer is handled by the scanner so we don't pin a message.
INLINE_WAIT_CAP_S = 120


async def _resolve(bet_id: uuid.UUID) -> None:
    async with SessionLocal() as session:
        bet = await resolve_bet(session, bet_id)
        if bet is not None:
            log.info("resolved bet %s -> %s", bet_id, bet.status)


async def _handle_bet_resolve(message: aio_pika.abc.AbstractIncomingMessage) -> None:
    async with message.process(requeue=False):
        payload = json.loads(message.body)
        bet_id = uuid.UUID(payload["bet_id"])
        resolve_at = datetime.fromisoformat(payload["resolve_at"])
        delay = (resolve_at - datetime.now(timezone.utc)).total_seconds()
        if delay > INLINE_WAIT_CAP_S:
            return  # let the due-scanner handle long-dated bets
        if delay > 0:
            await asyncio.sleep(delay)
        await _resolve(bet_id)


async def _handle_poll_close(message: aio_pika.abc.AbstractIncomingMessage) -> None:
    async with message.process(requeue=False):
        log.info("polls.close received: %s", message.body)  # Phase 5 (stretch)


async def _handle_item_tick(message: aio_pika.abc.AbstractIncomingMessage) -> None:
    async with message.process(requeue=False):
        log.info("items.tick received: %s", message.body)  # Phase 5


async def due_scanner() -> None:
    """Resolve any market bet whose resolve_at has passed. Idempotent + safe."""
    while True:
        await asyncio.sleep(DUE_SCANNER_INTERVAL_S)
        try:
            async with SessionLocal() as session:
                now = datetime.now(timezone.utc)
                rows = await session.scalars(
                    select(Bet.id).where(
                        Bet.module == BetModule.MARKET.value,
                        Bet.status == BetStatus.PENDING.value,
                        Bet.resolve_at <= now,
                    )
                )
                due_ids = list(rows)
            for bet_id in due_ids:
                await _resolve(bet_id)
        except Exception:  # noqa: BLE001 — keep the scanner alive across transient errors
            log.exception("due_scanner iteration failed")


async def main() -> None:
    connection = await get_connection()
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=PREFETCH)
    await declare_topology(channel)

    bets_q = await channel.get_queue(QUEUE_BETS_RESOLVE)
    polls_q = await channel.get_queue(QUEUE_POLLS_CLOSE)
    items_q = await channel.get_queue(QUEUE_ITEMS_TICK)

    await bets_q.consume(_handle_bet_resolve)
    await polls_q.consume(_handle_poll_close)
    await items_q.consume(_handle_item_tick)

    log.info("Worker online. Consuming queues + due-scanner running.")
    await asyncio.gather(due_scanner(), asyncio.Future())  # run forever


if __name__ == "__main__":
    asyncio.run(main())
