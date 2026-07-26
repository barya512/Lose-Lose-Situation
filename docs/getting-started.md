# Getting Started

Run the backend stack and the Phaser client locally, play through every screen,
run both test suites, build for itch.io, and shut down cleanly.

The backend is a FastAPI monolith + worker in [`/backend`](../backend); the client
is Vite + Phaser 3 + TypeScript in [`/client`](../client). Why that stack:
[ADR 0003](adr/0003-frontend-engine.md). How the client is put together:
[client-architecture.md](client-architecture.md).

## Prerequisites

| Tool | Version | For |
|------|---------|-----|
| Docker Desktop | any recent | the backend stack (`make up-local`) |
| Node.js + npm | Node ≥ 20 | the client (Vite 6) |
| make | optional | shortcut for the compose commands (raw `docker compose` works too) |

The client needs the **backend running** — every screen past the menu talks to
the API. Start the backend first.

## 1. Start the backend

From the repo root:

```bash
make up-local      # build + start api, worker, postgres, rabbitmq
make migrate       # apply the DB schema (Alembic)
make seed          # load the droppable item catalog
```

Without `make`, the equivalents are:

```bash
docker compose up --build -d
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.scripts.seed
```

Wait until the API is up: [http://localhost:8000/docs](http://localhost:8000/docs)
should load the Swagger UI. RabbitMQ's management console is at
[http://localhost:15672](http://localhost:15672) (`guest`/`guest`).

**CORS needs no configuration.** The backend defaults `cors_origins` to `["*"]`
(`backend/app/settings.py`) and the client authenticates with a **bearer token in
the `Authorization` header, not cookies**, so the wildcard origin is accepted by
the browser. Only if you set an explicit `CORS_ORIGINS` must it then include
`http://localhost:5173`.

## 2. Start the client

```bash
cd client
npm install        # first run only
npm run dev
```

Open **[http://localhost:5173](http://localhost:5173)**.

The backend URL comes from `client/.env.development`
(`VITE_API_BASE=http://localhost:8000/api/v1`) — the client never hardcodes it.

## 3. Play

**The game is inverted — the goal is to lose all your money.** A *losing* wager is
the good outcome (gold flash, coin burst, screen shake, balance ticks **down**); a
*winning* one is punished (glitch, red flash, buzz, balance ticks **up**). **Reach
$0 to win.**

```
Title ──click──▶ Menu (auth) ──▶ Poison ──┬─ beer orb   (buy a round, −$1)
                                          ├─ market orb ──▶ Market
                                          └─ casino orb ──▶ Casino ──▶ Slots
```

- **Title card** → click anywhere → **Menu**.
- **PLAY AS GUEST** for a fresh **$1,000** wallet (or **LOGIN / REGISTER**).
- **Poison** — the hub. Three unequal orbs on the felt; they show **no label until
  you hover** them. `← give up?` in the bottom-left clears the wallet and returns
  to auth.
  - **Beer** — buys a round for $1, drains it instantly, then sits under a 2s
    radial-wipe cooldown. The cheapest possible drain.
  - **Market** — a DOM panel over the felt: 15 tickers in four sections
    (Magnificent 7, index ETFs, international, crypto), each with a live
    TradingView mini-chart. Tapping the row header *or* its chart opens the bet
    drawer — the chart is a tap target, never a link out to TradingView. Pick a
    stake chip, a direction (UP/DOWN) and a
    timeframe (1 min / 5 min / 1 hour). Bets resolve in the background — you can
    leave the screen and come back — and one bet per symbol is open at a time.
    Stocks are only bettable during their home exchange's trading hours.
  - **Casino** — three worn cards deal onto the table. **SLOTS** is playable;
    roulette and blackjack are styled but disabled (they toast "isn't dealt in
    yet").
- **Slots** — pull the **lever** on the left to spin (the only trigger; there's no
  SPIN button). **+/−** on the right steps the reel count **3 → 4 → 5**. Four stake
  chips: **$1 / $10 / $50 / $100** (unaffordable ones grey out). The paytable panel
  on the right is served live by the API, and the face above the reels reacts to
  each outcome.
- `← go back?` walks one level back up the chain. Hitting **$0** anywhere — beer,
  market or slots — cuts to the **Win** screen.

Sound starts only after your first click (browser autoplay policy) — that's normal.

## 4. Test

```bash
make test                    # backend — pytest (formulas, economy sim, HTTP integration)
cd client && npm run test    # client — vitest (core logic only)
```

Phaser scenes, tweens and visuals are verified by playing through §3, not by unit
tests — see [client-architecture.md](client-architecture.md#testing-convention).

## 5. Build & ship to itch.io

```bash
cd client
npm run build      # tsc --noEmit + vite build → dist/
npm run preview    # serve the built app locally
```

`npm run build` writes `dist/` with `index.html` at the root and relative asset
paths (`vite.config.ts` sets `base: './'`), so it runs from a zip root.

To release: set `VITE_API_BASE` in `client/.env.production` to the Render backend
URL (see [deployment.md](deployment.md)), run `npm run build`, then zip the
**contents** of `dist/` — `index.html` must be at the zip root — and upload as an
itch.io HTML5 project.

## 6. Shut down

- **Client:** `Ctrl-C` in the terminal running `npm run dev`.
- **Backend:** `make down-local` (or `docker compose down`) — stops all four
  services but **keeps the database volume**, so wallets and bets survive the next
  `make up-local`.
- **Wipe the database too:** `docker compose down -v` removes the volumes; you'll
  need `make migrate && make seed` again after the next start.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Spin does nothing, or a "connection hiccup" toast | Backend unreachable. Confirm [http://localhost:8000/docs](http://localhost:8000/docs) loads and Docker is running. |
| Menu shows but guest login fails | API up but DB not migrated — run `make migrate` (and `make seed`). |
| A market ticker won't accept a bet | Its exchange is closed. Crypto is always open; stocks are gated to their home exchange's regular hours. |
| Charts are blank in the market panel | TradingView's embed is remote — it needs internet access. The rest of the panel still works. |
| Every label renders in Times | The webfonts didn't resolve within the 3s boot gate (`BootScene`). Hard-refresh; check `client/src/styles/fonts.css`. |
| No sound | Expected until your first click (browser autoplay). |
| `npm run dev` port already in use | Another Vite instance on 5173 — stop it, or the client won't be at the URL `VITE_API_BASE` assumes. |
| Blank page after `vite build` | Open the built app via `npm run preview`, not by double-clicking `dist/index.html` (module scripts need a server). |
