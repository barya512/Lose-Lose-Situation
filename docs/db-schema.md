# Database Schema

PostgreSQL via SQLAlchemy v2 async ORM ([`app/db/models.py`](../backend/app/db/models.py)).
UUID PKs, `created_at`/`updated_at` on every table, money as integer cents. JSON
columns are `JSONB` on Postgres and generic `JSON` elsewhere (SQLite tests).

## ERD

```
users ──1:*── bets
  │
  └──1:*── user_inventory ──*:1── market_items

polls ──1:*── poll_votes        (stretch module)
```

## Tables

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| username | varchar(64) unique, null | null for guests |
| password_hash | varchar(255), null | bcrypt; null for guests |
| is_guest | bool | |
| balance_cents | int | current wallet |
| total_lost_cents | int | drives the mercy/catch-up formula |
| bets_count | int | play history |
| has_won | bool | set true when balance ≤ `WIN_TARGET_CENTS`; sticky |
| drain_rate_cents_per_s | int | passive drain, 0 when no drain item is active |
| drain_anchor_at | timestamptz | last time the drain was settled |

The drain pair is deliberately a rate + anchor rather than a ticked balance: the
wallet is never written on a schedule, it is derived whenever a request already
has the user loaded. See `app/economy/drain.py`.

### `bets`
Every wager (market + casino). Market rows are async (worker-resolved); casino
rows resolve instantly.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | FK users | |
| module | varchar(16) | MARKET / CASINO / POLL / SPORT |
| ticker, direction, timeframe_s | nullable | market only |
| start_price, end_price | float null | market only |
| resolve_at | timestamptz null | market only |
| crowd_same_dir_ratio | float null | snapshot for the crowd penalty |
| stake_cents | int | |
| status | varchar(16) | PENDING / WON / LOST / VOID |
| penalty_cents, payout_cents | int | |
| result_detail | JSONB null | reels/pocket/penalty breakdown for the UI |
| reward_item_id | FK market_items null | the bounty pinned at placement |

`status = VOID` is written when a bet is still in flight as the run reaches $0.
Market stakes are not pre-charged, so paying it out would fund an already-won
run — and `has_won` never resets.

Indexes: `(status, resolve_at)` for the due-scanner; `(user_id)`.

### `market_offers`
The item bounty pinned to one ticker for one player, rolled *before* they bet so
the tile can name its prize. Unique on `(user_id, ticker)`.
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | FK users | |
| ticker | varchar(16) | |
| item_id | FK market_items null | null = no bounty this cycle |
| consumed_by_bet_id | FK bets null | non-null while a bet is chasing it |
| rolled_at | timestamptz | |

Consumed offers are **stamped, never deleted**. Deleting would let the next
market visit roll a fresh one, so one minimum-stake bet would buy an unlimited
reroll — place, leave, re-enter, repeat until a legendary appears.

### `market_items`
Droppable item catalog (seeded via `app/scripts/seed.py`).
| Column | Type | Notes |
|--------|------|-------|
| key | varchar(64) unique | stable identifier |
| name | varchar(128) | |
| rarity | varchar(16) | COMMON/RARE/EPIC/LEGENDARY |
| effect_type | varchar(32) | PASSIVE_DRAIN / LOSS_MULT / ANTI_LUCK |
| magnitude | float | effect strength |
| duration_s | int null | null = permanent |
| art_key | varchar(64) null | frontend sprite key |

### `user_inventory`
| Column | Type | Notes |
|--------|------|-------|
| user_id | FK users | |
| item_id | FK market_items | |
| acquired_at | timestamptz | |
| expires_at | timestamptz null | |
| active | bool | |

Index: `(user_id, active)`.

### `polls` / `poll_votes` *(stretch)*
Schema is present so the module can be built without a migration. `polls.options`
is a JSONB array (e.g. `["Guilty","Not Guilty"]`); `poll_votes` records
`option_idx` + `fee_cents`.

## Migrations

Alembic, sync driver (`settings.sync_database_url`). `0001_initial` creates
every table; `0002_market_offers` adds `market_offers`, `bets.reward_item_id`
and the two `users` drain columns. `make migrate` applies `upgrade head`.

`db/init/001_initial_schema.sql` mirrors the whole schema for the
docker-compose bootstrap and stamps `alembic_version` so `make migrate` doesn't
re-run against it. It has no automatic link to the models, so
`backend/tests/test_schema_artifacts.py` fails the build if a table, a column or
the stamp drifts.
