# Roadmap & Status

| Phase | Scope | Status |
|-------|-------|:------:|
| **1. Infra skeleton** | compose, Dockerfiles, `render.yaml`, Makefile, `.env.example`, FastAPI app + `/health` | ✅ done |
| **2. Config & DB core** | `settings.py`, `game_config.py` (all formulas), models, Alembic `0001`, wallet/economy, JWT + guest auth, `/me` | ✅ done |
| **3. Mechanics & worker** | yfinance provider, `/market` + RabbitMQ + worker resolution (penalty stack, item drops), casino slots + roulette | ✅ done |
| **4. Frontend juice** | title card → menu → slots + market (+ roulette stretch), tweens/particles/screen-shake, inverted SFX | 🚧 in progress — scaffold + slots slice shipped; market next |
| **5. Playtest & balance** | tune `game_config` live, seed items, optional Polls/Sports stretch | ◻ pending |

## Verified so far

- 27 backend tests passing: formulas, "always bet → $0" economy simulation, and
  HTTP integration (guest → slots → wallet, roulette caps, auth guard, market
  one-open-bet-per-symbol, pending-bets listing + caller scoping).
- Full FastAPI app graph imports; all routes present in the OpenAPI schema.

## Engine decision

**Phaser 3, HTML5-only, hosted backend on paid always-on Render.** Full client
plan recorded in [ADR 0003](adr/0003-frontend-engine.md).

## Backend changes for the client (done)

- **One open bet per symbol** — `place_market_bet` rejects a second `PENDING` bet
  on the same ticker for a user (clean 400).
- **`GET /market/bets?status=pending`** — the client's source of truth for open
  bets; the background poll manager rehydrates from it after a reload.

## Next actions

1. Scaffold `/client` (Vite + Phaser 3 + TS + the `AssetManifest` skeleton),
   wired to `VITE_API_BASE`.
2. **Slots first** — auth menu → slot scene → API → juice on result → wallet HUD.
   This proves the shared skeleton and yields a submittable build.
3. **Market second** — non-blocking Option B: background poll manager +
   resolve-notification, multiple concurrent bets (one per symbol), all three
   timeframes.
4. Stand the stack up (`make up-local`, `make migrate && make seed`) and
   smoke-test a real market bet resolving through the worker.
5. Roulette as stretch; playtest and turn `ECON_*` knobs (see the
   [formula cheatsheet](formula-cheatsheet.md)).

## Stretch modules (schema already present)

- **Anonymous Polls** — least-popular-choice-wins paradox (`polls`, `poll_votes`,
  `polls.close` queue).
- **Sports betting** — external odds provider behind the same `PriceProvider`-style
  adapter pattern.
