"""SQLAlchemy v2 ORM models. Money is always integer cents.

See docs/db-schema.md for the ERD. All enums are stored as strings to keep the
schema readable and migrations painless during the jam.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey

# Re-exported so `from app.db.models import ItemEffect` keeps working; the enum
# itself lives in game_config, which the formulas can import without SQLAlchemy.
from app.game_config import ItemEffect as ItemEffect

# JSONB on Postgres (production), generic JSON elsewhere (e.g. SQLite in tests).
JSONType = JSON().with_variant(JSONB(), "postgresql")


class BetModule(str, Enum):
    MARKET = "MARKET"
    CASINO = "CASINO"
    POLL = "POLL"
    SPORT = "SPORT"


class BetStatus(str, Enum):
    PENDING = "PENDING"
    WON = "WON"  # player's guess hit (undesirable — balance grew)
    LOST = "LOST"  # player's guess missed (desirable)
    VOID = "VOID"


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"

    username: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_guest: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    balance_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    total_lost_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bets_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    has_won: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # reached $0

    # Passive drain, stored as rate + anchor and derived on read rather than
    # ticked on a schedule. See app/economy/drain.py.
    drain_rate_cents_per_s: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    drain_anchor_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    bets: Mapped[list["Bet"]] = relationship(back_populates="user")
    inventory: Mapped[list["UserInventory"]] = relationship(back_populates="user")


class Bet(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "bets"
    __table_args__ = (
        Index("ix_bets_status_resolve_at", "status", "resolve_at"),
        Index("ix_bets_user", "user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    module: Mapped[str] = mapped_column(String(16), nullable=False)

    # Market-specific (nullable for casino/instant bets)
    ticker: Mapped[str | None] = mapped_column(String(16), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(8), nullable=True)  # UP/DOWN
    timeframe_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    resolve_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    crowd_same_dir_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)

    stake_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=BetStatus.PENDING.value, nullable=False)
    penalty_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    payout_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Free-form result details for the frontend to render juice (reels, pocket, breakdown).
    result_detail: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    # The item this bet was placed to chase, pinned from the offer at placement
    # so the reward can't change between committing the stake and resolving.
    reward_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("market_items.id"), nullable=True
    )

    user: Mapped["User"] = relationship(back_populates="bets")


class MarketItem(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "market_items"

    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    rarity: Mapped[str] = mapped_column(String(16), nullable=False)
    effect_type: Mapped[str] = mapped_column(String(32), nullable=False)
    magnitude: Mapped[float] = mapped_column(Float, nullable=False)  # effect strength
    duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)  # null = permanent
    art_key: Mapped[str | None] = mapped_column(String(64), nullable=True)


class MarketOffer(UUIDPrimaryKey, Timestamps, Base):
    """The item bounty pinned to one ticker for one player.

    Rolled when the player first sees the market and re-rolled only when a bet
    on that ticker resolves, so the tile can promise a specific item BEFORE the
    stake is committed. Consumed offers are stamped, never deleted: deleting
    would let ensure_offers roll a fresh one on the next visit, turning one
    minimum bet into an unlimited reroll.
    """

    __tablename__ = "market_offers"
    __table_args__ = (Index("ix_offers_user_ticker", "user_id", "ticker", unique=True),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    ticker: Mapped[str] = mapped_column(String(16), nullable=False)
    # NULL = this ticker carries no bounty this cycle (an empty socket).
    item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("market_items.id"), nullable=True
    )
    # Non-NULL = locked to a pending bet; the tile reads "chasing: <item>".
    consumed_by_bet_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("bets.id"), nullable=True
    )
    rolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    item: Mapped["MarketItem | None"] = relationship()


class UserInventory(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "user_inventory"
    __table_args__ = (Index("ix_inventory_user_active", "user_id", "active"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("market_items.id"), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship(back_populates="inventory")
    item: Mapped["MarketItem"] = relationship()


# --- Stretch modules (schema ready; endpoints built only if time allows) ---


class Poll(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "polls"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    story_md: Mapped[str] = mapped_column(String, nullable=False)
    options: Mapped[list] = mapped_column(JSONType, nullable=False)  # ["Guilty", "Not Guilty"]
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="OPEN", nullable=False)


class PollVote(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "poll_votes"
    __table_args__ = (Index("ix_pollvote_poll", "poll_id"),)

    poll_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("polls.id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    option_idx: Mapped[int] = mapped_column(Integer, nullable=False)
    fee_cents: Mapped[int] = mapped_column(Integer, nullable=False)
