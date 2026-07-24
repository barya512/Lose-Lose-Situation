"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-24
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(64), unique=True, nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_guest", sa.Boolean(), nullable=False),
        sa.Column("balance_cents", sa.Integer(), nullable=False),
        sa.Column("total_lost_cents", sa.Integer(), nullable=False),
        sa.Column("bets_count", sa.Integer(), nullable=False),
        sa.Column("has_won", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "market_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(64), unique=True, nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("rarity", sa.String(16), nullable=False),
        sa.Column("effect_type", sa.String(32), nullable=False),
        sa.Column("magnitude", sa.Float(), nullable=False),
        sa.Column("duration_s", sa.Integer(), nullable=True),
        sa.Column("art_key", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "bets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("module", sa.String(16), nullable=False),
        sa.Column("ticker", sa.String(16), nullable=True),
        sa.Column("direction", sa.String(8), nullable=True),
        sa.Column("timeframe_s", sa.Integer(), nullable=True),
        sa.Column("start_price", sa.Float(), nullable=True),
        sa.Column("end_price", sa.Float(), nullable=True),
        sa.Column("resolve_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("crowd_same_dir_ratio", sa.Float(), nullable=True),
        sa.Column("stake_cents", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("penalty_cents", sa.Integer(), nullable=False),
        sa.Column("payout_cents", sa.Integer(), nullable=False),
        sa.Column("result_detail", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bets_status_resolve_at", "bets", ["status", "resolve_at"])
    op.create_index("ix_bets_user", "bets", ["user_id"])

    op.create_table(
        "user_inventory",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("market_items.id"), nullable=False),
        sa.Column("acquired_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_inventory_user_active", "user_inventory", ["user_id", "active"])

    op.create_table(
        "polls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("story_md", sa.String(), nullable=False),
        sa.Column("options", postgresql.JSONB(), nullable=False),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "poll_votes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("poll_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("polls.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("option_idx", sa.Integer(), nullable=False),
        sa.Column("fee_cents", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_pollvote_poll", "poll_votes", ["poll_id"])


def downgrade() -> None:
    op.drop_table("poll_votes")
    op.drop_table("polls")
    op.drop_table("user_inventory")
    op.drop_table("bets")
    op.drop_table("market_items")
    op.drop_table("users")
