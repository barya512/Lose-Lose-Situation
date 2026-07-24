# Architecture

A **modular monolith + one async worker**. Each game module is an isolated
package (`app/modules/<name>`) with its own router + service + schemas, so the
code reads like microservices and could be split later, but ships as one
deployable.

## Services

```
        ┌────────────┐        publish (amqp)      ┌──────────────┐
 client │ lose-lose  │ ───────────────────────▶   │ lose-lose    │
 ─────▶ │   -api     │                            │   -worker    │
        │ (FastAPI)  │ ◀── result via DB poll ──  │ (consumer +  │
        └─────┬──────┘                            │  due-scanner)│
              │                                    └──────┬───────┘
              │  asyncpg                                  │ asyncpg
              ▼                                           ▼
        ┌───────────────────────────────────────────────────┐
        │           lose-lose-db (PostgreSQL)                │
        └───────────────────────────────────────────────────┘
              ▲                                           ▲
              └──────────── lose-lose-rabbitmq ───────────┘
                        (topic exchange, durable)
```

All inter-service traffic uses Render's private `.internal` network.

## RabbitMQ topology (`app/broker/topology.py`)

- **Exchange** `game.events` — topic, durable.
- **Queues** (durable, dead-lettered to `dlx.dead`):
  - `bets.resolve` ← `bet.market.placed`
  - `polls.close` ← `poll.closing` *(stretch)*
  - `items.tick` ← `item.passive_tick` *(stretch)*

## Worker resolution (`app/broker/worker.py`)

Market bets resolve two ways for reliability:

1. **Queue consumer (low latency).** On placement a message carries `bet_id` +
   `resolve_at`. For near-term bets (≤ `INLINE_WAIT_CAP_S`, default 120s) the
   consumer waits out the remaining time then resolves. Long-dated bets are left
   to the scanner so a message never pins a consumer slot for an hour.
2. **Due-scanner (belt-and-suspenders).** Every 5s it resolves any PENDING market
   bet whose `resolve_at` has passed — covering dropped messages and restarts.

`resolve_bet` is **idempotent** (it no-ops on an already-resolved bet and locks
rows `with_for_update`), so overlap between the two paths is harmless.

## Money & correctness

- Balances are **integer cents** everywhere ([ADR 0002](adr/0002-money-as-cents.md)).
- All balance mutations go through `app/economy/wallet.py` so the win condition
  (reaching `$0`) and `total_lost_cents` history stay consistent.
- Every economic constant/formula lives in `app/game_config.py`
  ([formula cheatsheet](formula-cheatsheet.md)).
