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
