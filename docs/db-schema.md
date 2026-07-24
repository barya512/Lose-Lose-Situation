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
| has_won | bool | set true when balance ≤ `WIN_TARGET_CENTS` |

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

Indexes: `(status, resolve_at)` for the due-scanner; `(user_id)`.

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

Alembic, sync driver (`settings.sync_database_url`). Initial revision
`0001_initial` creates every table. `make migrate` applies `upgrade head`.
