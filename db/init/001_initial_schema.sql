-- Local-dev bootstrap schema. Postgres runs every *.sql file in
-- /docker-entrypoint-initdb.d/ once, the first time the data volume is
-- created (see docker-compose.yml). This must stay in sync with the
-- Alembic migration it mirrors: backend/migrations/versions/0001_initial.py
-- (the source of truth for schema changes — update both when adding a
-- migration).

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username VARCHAR(64) UNIQUE,
    password_hash VARCHAR(255),
    is_guest BOOLEAN NOT NULL,
    balance_cents INTEGER NOT NULL,
    total_lost_cents INTEGER NOT NULL,
    bets_count INTEGER NOT NULL,
    has_won BOOLEAN NOT NULL,
    -- Passive drain: rate + anchor, derived on read rather than ticked.
    drain_rate_cents_per_s INTEGER NOT NULL DEFAULT 0,
    drain_anchor_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS market_items (
    id UUID PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    rarity VARCHAR(16) NOT NULL,
    effect_type VARCHAR(32) NOT NULL,
    magnitude DOUBLE PRECISION NOT NULL,
    duration_s INTEGER,
    art_key VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bets (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    module VARCHAR(16) NOT NULL,
    ticker VARCHAR(16),
    direction VARCHAR(8),
    timeframe_s INTEGER,
    start_price DOUBLE PRECISION,
    end_price DOUBLE PRECISION,
    resolve_at TIMESTAMPTZ,
    crowd_same_dir_ratio DOUBLE PRECISION,
    stake_cents INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL,
    penalty_cents INTEGER NOT NULL,
    payout_cents INTEGER NOT NULL,
    result_detail JSONB,
    -- The item this bet was placed to chase, pinned at placement so the reward
    -- can't change between committing the stake and resolving.
    reward_item_id UUID REFERENCES market_items(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bets_status_resolve_at ON bets (status, resolve_at);
CREATE INDEX IF NOT EXISTS ix_bets_user ON bets (user_id);

-- Per-ticker item bounties, rolled before the player bets so a tile can name
-- its prize. Consumed offers are stamped, never deleted: deleting would let the
-- next visit roll a fresh one, turning one minimum bet into a free reroll.
CREATE TABLE IF NOT EXISTS market_offers (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    ticker VARCHAR(16) NOT NULL,
    item_id UUID REFERENCES market_items(id),
    consumed_by_bet_id UUID REFERENCES bets(id),
    rolled_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_offers_user_ticker
    ON market_offers (user_id, ticker);

CREATE TABLE IF NOT EXISTS user_inventory (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    item_id UUID NOT NULL REFERENCES market_items(id),
    acquired_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_inventory_user_active ON user_inventory (user_id, active);

CREATE TABLE IF NOT EXISTS polls (
    id UUID PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    story_md TEXT NOT NULL,
    options JSONB NOT NULL,
    closes_at TIMESTAMPTZ,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poll_votes (
    id UUID PRIMARY KEY,
    poll_id UUID NOT NULL REFERENCES polls(id),
    user_id UUID NOT NULL REFERENCES users(id),
    option_idx INTEGER NOT NULL,
    fee_cents INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pollvote_poll ON poll_votes (poll_id);

-- Stamp Alembic's version table so `make migrate` sees the schema as already
-- applied and doesn't try to re-run it against this bootstrapped DB. This file
-- mirrors every migration, so bump the stamp whenever a new one lands.
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);
INSERT INTO alembic_version (version_num) VALUES ('0002_market_offers')
ON CONFLICT (version_num) DO NOTHING;
