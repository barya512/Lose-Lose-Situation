"""Pydantic v2 schemas for auth + the current-user view."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class InventoryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_key: str
    name: str
    rarity: str
    effect_type: str
    magnitude: float
    active: bool


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str | None
    is_guest: bool
    balance_cents: int
    total_lost_cents: int
    bets_count: int
    has_won: bool


class MeOut(UserOut):
    inventory: list[InventoryItemOut] = Field(default_factory=list)
    # Cents per second the wallet bleeds on its own. The client interpolates
    # against this between polls so the number ticks visibly without the server
    # writing at 10Hz. 0 means no drain item is active.
    drain_rate_cents_per_s: int = 0
    # The server's clock at the moment this snapshot was taken, so the client
    # corrects for skew rather than trusting its own Date.now().
    server_time: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
