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
| `ECON_MIN_BET_CENTS` | `100` ($1) | Smallest allowed stake — except at **last call** (below). |

## Beer

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_BEER_COST_CENTS` | `100` ($1) | Price of one beer — a pure drain with no payout, no bet, no chance of gaining. The cheapest way to shed money. |

**Last call.** A wallet holding *less* than `ECON_MIN_BET_CENTS` but more than $0
(say `$0.43`) would be softlocked: too poor to bet, not yet at the $0 win. Below
the minimum, the whole remaining balance becomes the **only** legal stake — one
all-in play, no cent-by-cent grinding. Beer follows the same rule: the last one
costs whatever is left rather than the list price. At $0 the run is already won
and the normal minimum applies again.

## Market bet outcome

| Env var | Default | Meaning |
|---------|---------|---------|
| `ECON_WIN_MULTIPLIER` | `2.0` | A win doubles the stake (balance grows — bad). |
| `ECON_BASE_LOSS_PENALTY` | `0.10` | Extra % of the stake skimmed on a loss, before the stack below. |

**Trading hours.** The 15 curated tickers each declare a home exchange
(`CURATED_TICKERS` / `MarketHours`, edited in code). Stocks only accept bets
Mon–Fri during their exchange's local regular session; crypto is always open.
`GET /market/tickers` reports this as `is_open`, and a bet on a closed ticker is
rejected. No holiday calendar — weekday + clock time only.

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

Payouts — the total returned on a hit = stake × payout. Note there are only four
knobs for six bet types: even/odd shares the colour payout, and column shares the
dozen payout.

| Env var | Default | Applies to |
|---------|---------|------------|
| `ECON_ROULETTE_PAYOUT_COLOR` | `2.0` | red/black **and** even/odd |
| `ECON_ROULETTE_PAYOUT_DOZEN` | `3.0` | dozen **and** column |
| `ECON_ROULETTE_PAYOUT_GREEN` | `36.0` | the single 0 |
| `ECON_ROULETTE_PAYOUT_STRAIGHT` | `36.0` | exact number |

## Slots

Reel count is player-chosen, `SLOT_MIN_REELS` (3) to `SLOT_MAX_REELS` (5). Reel
symbol weights (`SLOT_REEL_WEIGHTS`) and three-of-a-kind payouts
(`SLOT_THREE_OF_A_KIND_PAYOUT`) are edited in code, and the whole paytable is
served to the client by `GET /casino/slots/info`.

Two rules keep pairs from flooding the player with money:

- `SLOT_TWO_OF_A_KIND_PAYOUT` (1.5) only pays for symbols in
  `SLOT_PAIR_ELIGIBLE_SYMBOLS` (CHERRY/LEMON) — a pair of anything else is a
  near-miss loss, not a payout. Letting any symbol pair pay would put a floor of
  ~44% on the punish-rate at 3 reels no matter how the weights are tuned
  (birthday paradox with only 6 symbols).
- `SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS` (`{5}`) drops pair payouts entirely
  at **5 reels**, where even an eligible pair is near-guaranteed.

Together these hold the punish-rate (any-payout spin) around 30% on both 3 and 5
reels. `SKULL`/`SEVEN` are the rare jackpot tier — pays the most, so worst for
the player.

## Item effects

Items are the market's reward loop. Each carries an `effect_type` and a
`magnitude`; every effect is a pure function over the player's *active*
inventory (`modules/market/service.active_effects`), so nothing in
`game_config.py` touches the database.

Magnitude is always a **bonus fraction**, never an absolute, so duplicates stack
by summing and every effect has a cap.

| Effect | Function | Magnitude means | Cap |
|---|---|---|---|
| `ANTI_LUCK` | `anti_luck_margin` | price deadband per point (`0.02`/pt) | `ANTI_LUCK_MARGIN_CAP` (1%) |
| `LOSS_MULT` | `item_loss_multiplier` | extra term in the penalty stack | `ITEM_LOSS_MULT_CAP` (1.5) |
| `STAKE_MULT` | `stake_multiplier` | bonus on chips **and** the cap | `STAKE_MULT_CAP` (2.0) |
| `WIN_DAMPEN` | `win_dampen_factor` | share of a winning gain removed | `WIN_DAMPEN_CAP` (0.9) |
| `PASSIVE_DRAIN` | `drain_rate_cents_per_s` | share of the *starting* wallet per `DRAIN_PERIOD_S` | — |

### ANTI_LUCK is a price margin, not a probability

`direction_from_prices(start, end, anti_luck_margin, bet_direction)` applies the
margin **against the player's own call**: an UP bet only counts as a hit if the
price cleared `start * (1 + margin)`. Inside the band it reads as a miss — a
`LOST`, which is the outcome the player wants.

> ⚠️ `ANTI_LUCK_MARGIN_PER_MAGNITUDE` is the most dangerous knob in the economy.
> Black Cat's `magnitude=0.10` read as a raw price fraction would demand a **10%
> move inside a 60-second bet**, so every market bet would auto-lose — and since
> losing is the goal, that is a win button. At the shipped `0.02` it is a 0.2%
> deadband. Expect to tune this from playtest.

### WIN_DAMPEN never zeroes a win

Applied to the *gain* only, never the returned stake, so a dampened win can't
become a net loss. The cap keeps the factor above zero: a win that gained
nothing would make the punishing outcome free, and the market would lose its
only source of pressure. Applies to casino payouts too
(`dampened_payout_cents`), or the player dodges the item by switching machines.

### STAKE_MULT raises the ladder and the cap together

`chip_ladder_cents` and `max_bet_cents` take the same multiplier. Scaling only
the chips would push the top rungs past `MAX_BET_FRACTION` and grey them out —
the item would get *worse* the stronger it got.

## Stake gates: risk buys rarity

`item_stake_gate_cents(rarity, balance)` is the minimum stake a **losing** bet
must have risked to actually earn its pinned item: 1% / 5% / 10% / 25% of the
wallet for COMMON / RARE / EPIC / LEGENDARY. The legendary gate lands exactly on
`MAX_BET_FRACTION` — the largest bet the game normally allows.

This replaces the old hidden `item_drop_chance` roll on the market path with a
visible, deterministic commitment. Farming is an **intended** mechanic: the gate
is the loop's price, not a wall. Every gate is capped at the wallet, so going
all-in always qualifies — a nearly-broke player can still chase a legendary, and
the desperate play stays the correct one.

## The chip ladder is server-canonical

`STAKE_CHIPS_CENTS` lives in `game_config.py` and reaches the client through
`GET /market/offers`. It has to be canonical because **all-in deliberately
overrides `max_bet_cents`**: if the rule were "any stake at or above the balance
goes all in", a client could post `stake_cents: 999999999` and bypass
`MAX_BET_FRACTION` on every bet. Instead `is_valid_stake` grants the all-in
exemption only when a chip on *this player's* ladder is at or above the balance.

## Passive drain: lazy accrual

The wallet is never ticked on a schedule. `users.drain_rate_cents_per_s` plus
`users.drain_anchor_at` let `economy/drain.py` derive what has bled whenever a
request already has the user loaded (auth, `/me`, bet resolution) — no write per
holder per second, no drift when the worker stalls, no race with `resolve_bet`'s
`SELECT ... FOR UPDATE`. The client interpolates between those points
(`Session.displayBalanceCents`) so the number still melts on screen.

`settle_drain` routes through `wallet.apply_delta`, so the $0 clamp,
`total_lost_cents` and the `has_won` flip all keep working and `wallet.py`
remains the only place a balance changes.

> `DRAIN_MAX_OFFLINE_S` (300) caps accrual while away. A permanent drain item is
> the farming loop's best prize; uncapped, the reward for engaging with the game
> would be that the run finishes without you.

## Balancing harness

`backend/tests/test_economy_sim.py` runs an "always bet" simulation and asserts
the bankroll trends toward $0. Tweak a knob, then:

```bash
make test            # or: pytest backend/tests/test_economy_sim.py -q
```
