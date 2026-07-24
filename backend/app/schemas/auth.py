"""Pydantic v2 schemas for auth + the current-user view."""

from __future__ import annotations

import uuid

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


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
