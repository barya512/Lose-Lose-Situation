# ADR 0002 — Money as integer cents

**Status:** Accepted · **Date:** 2026-07-24

## Context

The game is entirely about money moving between the player and the house across
many small bets, penalties, and multipliers. Floating-point money accumulates
rounding drift and produces ugly fractional balances.

## Decision

Store and compute **all money as integer cents**. Columns are `Integer`; formulas
in `game_config.py` take/return cents; multipliers are applied then `int()`-
truncated at the boundary. The only float in the economy is a *multiplier*, never
a balance.

## Consequences

- **+** Exact, reproducible balances; no drift; clean UI values.
- **+** Simple win check (`balance_cents <= WIN_TARGET_CENTS`).
- **−** Every formula must remember to convert to cents (e.g. `$1,000` =
  `100000`). Mitigated by naming (`*_cents`) and tests.
- Display formatting (cents → `$X.YY`) is a frontend concern.
