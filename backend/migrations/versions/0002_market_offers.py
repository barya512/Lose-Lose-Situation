"""market offers: per-ticker item bounties, pinned before the bet

Adds the offer table plus the bet's pin. Together these move the item decision
from resolve time to before placement, so a tile can advertise what losing on it
is worth.

Revision ID: 0002_market_offers
Revises: 0001_initial
Create Date: 2026-07-26
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_market_offers"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "market_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("ticker", sa.String(16), nullable=False),
        # NULL = this ticker carries no bounty this cycle.
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("market_items.id"),
            nullable=True,
        ),
        # Stamped rather than deleted on consume: deleting would let the next
        # visit roll a fresh offer, making one minimum bet buy a free reroll.
        sa.Column(
            "consumed_by_bet_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bets.id"),
            nullable=True,
        ),
        sa.Column("rolled_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_offers_user_ticker", "market_offers", ["user_id", "ticker"], unique=True
    )

    op.add_column(
        "bets",
        sa.Column(
            "reward_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("market_items.id"),
            nullable=True,
        ),
    )

    # Passive drain: rate + anchor, derived on read rather than ticked.
    op.add_column(
        "users",
        sa.Column(
            "drain_rate_cents_per_s", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "drain_anchor_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "drain_anchor_at")
    op.drop_column("users", "drain_rate_cents_per_s")
    op.drop_column("bets", "reward_item_id")
    op.drop_index("ix_offers_user_ticker", table_name="market_offers")
    op.drop_table("market_offers")
