# Roadmap & Status

| Phase | Scope | Status |
|-------|-------|:------:|
| **1. Infra skeleton** | compose, Dockerfiles, `render.yaml`, Makefile, `.env.example`, FastAPI app + `/health` | ✅ done |
| **2. Config & DB core** | `settings.py`, `game_config.py` (all formulas), models, Alembic `0001`, wallet/economy, JWT + guest auth, `/me` | ✅ done |
| **3. Mechanics & worker** | yfinance provider, `/market` + RabbitMQ + worker resolution (penalty stack, item drops), casino slots + roulette | ✅ done |
| **4. Frontend juice** | boot cutscene → menu → market + casino scenes, tweens/particles/screen-shake, inverted SFX | ⛔ blocked on engine pick |
| **5. Playtest & balance** | tune `game_config` live, seed items, optional Polls/Sports stretch | ◻ pending |

## Verified so far

- 24 backend tests passing: formulas, "always bet → $0" economy simulation, and
  HTTP integration (guest → slots → wallet, roulette caps, auth guard).
- Full FastAPI app graph imports; all 10 routes present in the OpenAPI schema.

## Next actions

1. **Pick the frontend engine** ([ADR 0003](adr/0003-frontend-engine.md) recommends
   Phaser 3). The backend/API is engine-agnostic, so this is reversible.
2. Bring the stack up (`make up-local`), run `make migrate && make seed`, and
   smoke-test a real market bet resolving through the worker.
3. Build Phase 4 scenes against the documented API.
4. Playtest and turn `ECON_*` knobs (see the [formula cheatsheet](formula-cheatsheet.md)).

## Stretch modules (schema already present)

- **Anonymous Polls** — least-popular-choice-wins paradox (`polls`, `poll_votes`,
  `polls.close` queue).
- **Sports betting** — external odds provider behind the same `PriceProvider`-style
  adapter pattern.
