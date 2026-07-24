# Formula Cheatsheet (for playtesters)

Every economy knob lives in [`backend/app/game_config.py`](../backend/app/game_config.py).
**All of them are overridable with `ECON_`-prefixed environment variables — no
code change, no redeploy needed.** Set them in `docker-compose.yml` (local) or the
Render env group (prod), or in your shell.

> Remember the inversion: the player WANTS to reach $0. "Winning" a bet is BAD
> (it grows the balance); losing is the goal.

## Wallet

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_STARTING_BALANCE_CENTS` | `100000` ($1,000) | Cash each new player starts with ($X). |
| `ECON_WIN_TARGET_CENTS` | `0` | Reach this balance to WIN the game. |

## Bet sizing

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_MAX_BET_FRACTION` | `0.25` | A single bet may stake at most this fraction of balance ($Y). |
| `ECON_MIN_BET_CENTS` | `100` ($1) | Smallest allowed stake. |

## Market bet outcome

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_WIN_MULTIPLIER` | `2.0` | A win doubles the stake (balance grows — bad). |
| `ECON_BASE_LOSS_PENALTY` | `0.10` | Extra % of the stake skimmed on a loss, before the stack below. |

## Dynamic penalty stack (multipliers on the base loss)

Total loss = `stake + base_penalty × (1 + crowd + chaos + mercy + volatility)`,
floored so chaos-relief can't turn a loss into a gain.

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_CROWD_PENALTY_MAX` | `0.50` | Up to +50% when everyone bet your direction (popularity). |
| `ECON_CHAOS_PENALTY_MAX` | `0.40` | Random ±40% chaos spike. |
| `ECON_MERCY_PENALTY_MAX` | `1.00` | **Catch-up:** up to +100% when the player is "too rich" — drains stuck players faster. |
| `ECON_CRYPTO_VOLATILITY_PENALTY` | `0.35` | Volatile crypto punishes harder. |
| `ECON_STOCK_VOLATILITY_PENALTY` | `0.10` | Blue-chip stocks punish softer. |

## Item drops (on a losing market bet)

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_ITEM_DROP_BASE_RATE` | `0.03` | Base drop chance per qualifying bet. |
| `ECON_ITEM_DROP_RISK_BONUS` | `0.12` | Extra chance scaled by how big the bet was. |

Rarity weights (`ITEM_RARITY_WEIGHTS`) and the item catalog
(`app/scripts/seed.py`) are edited in code.

## Roulette (anti-abuse: specific bets get lower caps)

| Env var | Default | Bet type |
|---------|---------|----------|
| `ECON_ROULETTE_LIMIT_COLOR` | `1.00` | red/black (loosest) |
| `ECON_ROULETTE_LIMIT_EVENODD` | `1.00` | even/odd |
| `ECON_ROULETTE_LIMIT_DOZEN` | `0.60` | dozen |
| `ECON_ROULETTE_LIMIT_COLUMN` | `0.60` | column |
| `ECON_ROULETTE_LIMIT_GREEN` | `0.20` | the single 0 |
| `ECON_ROULETTE_LIMIT_STRAIGHT` | `0.10` | exact number (tightest) |

Payouts: `ECON_ROULETTE_PAYOUT_COLOR` (2.0), `_DOZEN` (3.0), `_GREEN` (36.0),
`_STRAIGHT` (36.0) — the total returned = stake × payout on a hit.

## Slots

Reel symbol weights (`SLOT_REEL_WEIGHTS`) and three-of-a-kind payouts
(`SLOT_THREE_OF_A_KIND_PAYOUT`) are edited in code. `SLOT_TWO_OF_A_KIND_PAYOUT`
(1.5) pays any pair. `SKULL` is the rare jackpot (pays the most = worst for the
player).

## Balancing harness

`backend/tests/test_economy_sim.py` runs an "always bet" simulation and asserts
the bankroll trends toward $0. Tweak a knob, then:

```bash
make test            # or: pytest backend/tests/test_economy_sim.py -q
```
