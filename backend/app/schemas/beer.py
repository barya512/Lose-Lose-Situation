"""Pydantic v2 schema for the beer module."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class BeerResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    cost_cents: int  # what this beer actually cost — the last one costs the remainder
    balance_cents: int  # new balance after the purchase
    total_lost_cents: int
    has_won: bool  # true once the balance reaches $0
