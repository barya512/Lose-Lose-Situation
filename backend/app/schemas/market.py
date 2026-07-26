"""Pydantic v2 schemas for the Bet365 market module."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.game_config import ALLOWED_TIMEFRAMES_S, Direction


class TickerOut(BaseModel):
    symbol: str
    name: str
    kind: str
    last_price: float | None = None
    is_open: bool


class ItemOut(BaseModel):
    """An item as the client renders it: name it, price it, draw it."""

    model_config = ConfigDict(from_attributes=True)

    key: str
    name: str
    rarity: str
    effect_type: str
    magnitude: float
    duration_s: int | None = None
    art_key: str | None = None


class OfferOut(BaseModel):
    """One market tile: the ticker, and what losing on it is worth.

    Everything the grid needs in a single request, so 15 tiles don't fan out
    into 15 round-trips.
    """

    symbol: str
    name: str
    kind: str
    last_price: float | None = None
    is_open: bool
    # None = this ticker carries no bounty this cycle (an empty socket).
    reward_item: ItemOut | None = None
    # Minimum stake a LOSING bet must risk to actually earn the item above.
    reward_stake_gate_cents: int | None = None
    # Non-null while a bet is chasing this offer; the tile reads "chasing: X".
    pending_bet_id: uuid.UUID | None = None
    # The stake buttons, already scaled by the player's STAKE_MULT items. The
    # client renders these rather than owning a copy -- a chip above the wallet
    # is not disabled, it goes all in.
    chips_cents: list[int]


class PlaceMarketBet(BaseModel):
    ticker: str
    direction: Direction
    stake_cents: int = Field(gt=0)
    timeframe_s: int = Field(description=f"one of {ALLOWED_TIMEFRAMES_S}")

    @field_validator("timeframe_s")
    @classmethod
    def _validate_timeframe(cls, v: int) -> int:
        if v not in ALLOWED_TIMEFRAMES_S:
            raise ValueError(f"timeframe must be one of {ALLOWED_TIMEFRAMES_S}")
        return v


class MarketBetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ticker: str | None
    direction: str | None
    stake_cents: int
    timeframe_s: int | None
    start_price: float | None
    end_price: float | None
    resolve_at: datetime | None
    status: str
    penalty_cents: int
    payout_cents: int
    result_detail: dict | None = None
