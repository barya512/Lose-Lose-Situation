# Roadmap & Status

| Phase | Scope | Status |
|-------|-------|:------:|
| **1. Infra skeleton** | compose, Dockerfiles, `render.yaml`, Makefile, `.env.example`, FastAPI app + `/health` | ✅ done |
| **2. Config & DB core** | `settings.py`, `game_config.py` (all formulas), models, Alembic `0001`, wallet/economy, JWT + guest auth, `/me` | ✅ done |
| **3. Mechanics & worker** | yfinance provider, `/market` + RabbitMQ + worker resolution (penalty stack, item drops), casino slots + roulette, beer | ✅ done |
| **4. Frontend** | client scaffold, slots, market, beer, poison/casino navigation, casino-felt retheme, 2× render scale | ✅ done |
| **5. Playtest & balance** | tune `game_config` live, roulette/blackjack scenes, item-drop UI, optional Polls/Sports stretch | 🚧 in progress |

## Verified so far

- **43 backend tests** passing (`make test`): formulas, an "always bet → $0"
  economy simulation, broker retry, and HTTP integration (guest → slots → wallet,
  roulette caps, auth guard, market one-open-bet-per-symbol, pending-bets listing
  + caller scoping).
- **41 client tests** passing (`cd client && npm run test`): `core/api`,
  `core/session`, `core/money`, `core/config`, `core/slotLogic`,
  `core/pressGuard`, `ui/authForm`. Phaser visuals are covered by the manual
  smoke test in [getting-started.md](getting-started.md#3-play).
- Full FastAPI app graph imports; all routes present in the OpenAPI schema.

## Shipped in phase 4

- **Client scaffold** — Vite + Phaser 3 + TypeScript, `VITE_API_BASE`-driven,
  Phaser-free testable core ([ADR 0003](adr/0003-frontend-engine.md)).
- **Slots** — lever-triggered, 3–5 reels, live paytable panel from
  `GET /casino/slots/info`, full inverted juice.
- **Market** — DOM panel with 15 tickers, live TradingView mini-charts, three
  timeframes, background poll manager surviving reloads, one open bet per symbol.
- **Beer** — `POST /beer/buy` plus the poison-hub orb with a 2s radial cooldown.
- **Navigation** — Poison hub → Casino machine picker → Slots, with a single
  global `$0` → Win gate.
- **Casino-felt retheme** — one token module (`core/theme.ts`) driving every
  screen; canvas-baked art ([ADR 0005](adr/0005-canvas-baked-token-driven-theme.md)),
  press-matched clicks ([ADR 0004](adr/0004-click-requires-matching-press.md)),
  crisp type at 2× ([ADR 0006](adr/0006-2x-render-scale.md)).

## Next actions

1. **Playtest and turn the `ECON_*` knobs** — no redeploy needed, see the
   [formula cheatsheet](formula-cheatsheet.md).
2. **Roulette scene** — the backend endpoint already exists; only the client card
   is disabled.
3. **Blackjack** — needs both a backend module and a scene.
4. **Item-drop UI** — drops already resolve and land in `user_inventory`, and
   `/me` returns the active inventory, but nothing in the client shows them.
5. **Real art** — swap bakes for hand-authored assets by texture key; checklist
   in [asset-list.md](asset-list.md).

## Stretch modules (schema already present)

- **Anonymous Polls** — least-popular-choice-wins paradox (`polls`, `poll_votes`,
  `polls.close` queue).
- **Sports betting** — external odds provider behind the same `PriceProvider`-style
  adapter pattern.
