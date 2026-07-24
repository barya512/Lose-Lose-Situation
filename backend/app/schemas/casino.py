"""Pydantic v2 schemas for the casino module."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.game_config import RouletteBetType


class RouletteBet(BaseModel):
    bet_type: RouletteBetType
    # Interpretation of ``selection`` depends on bet_type:
    #   COLOR -> "RED"/"BLACK", EVENODD -> "EVEN"/"ODD",
    #   DOZEN/COLUMN -> 0|1|2, STRAIGHT -> 0..36, GREEN -> null
    selection: int | str | None = None
    stake_cents: int = Field(gt=0)


class SlotSpin(BaseModel):
    stake_cents: int = Field(gt=0)
    reels: int = Field(default=3, ge=3, le=5)


class CasinoResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    stake_cents: int
    status: str
    payout_cents: int
    result_detail: dict | None = None
