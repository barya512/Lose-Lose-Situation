# Client Setup

How to run the **Phaser 3 client** locally against the backend, build it for
release, and troubleshoot the common failure. The client lives in
[`/client`](../client) (Vite + Phaser 3 + TypeScript). See
[adr/0003](adr/0003-frontend-engine.md) for why this stack, and
[`client/README.md`](../client/README.md) for the short version.

## Prerequisites

| Tool | Version | For |
|------|---------|-----|
| Node.js + npm | Node ≥ 20 | the client (Vite 6) |
| Docker Desktop | any recent | the backend stack (`make up-local`) |
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
should load the Swagger UI. Stop the stack later with `make down-local`.

**CORS:** no change needed. The backend defaults `cors_origins` to `["*"]`
(`backend/app/settings.py`) and the client authenticates with a **bearer token
in the `Authorization` header, not cookies**, so the wildcard origin is accepted
by the browser. (If you ever set an explicit `CORS_ORIGINS`, it must then include
`http://localhost:5173`.)

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

- **Title card** → click anywhere → **Menu**.
- **PLAY AS GUEST** for a fresh **$1,000** wallet (or **LOGIN / REGISTER**).
- In **Slots**: pick a stake chip (**$1 / $10 / $50 / $100**), optionally toggle
  **3 / 5** reels, hit **SPIN**.

**The game is inverted — the goal is to lose all your money.** A *losing* spin is
the good outcome (coin burst, green flash, rising chime, balance ticks **down**);
a *winning* spin is punished (glitch, buzz, balance ticks **up**). **Reach $0 to
win** → the win screen → **PLAY AGAIN**.

Sound starts only after your first click (browser autoplay policy) — that's
normal. Art is intentionally placeholder (colored tiles/text), swappable later
via `client/src/core/assets.ts`.

## 4. Test & build

```bash
npm run test       # Vitest — core/session + core/api unit tests
npm run build      # tsc --noEmit + vite build → dist/
```

`npm run build` writes `dist/` with `index.html` at the root and relative asset
paths (`vite.config.ts` sets `base: './'`), so it runs from a zip root.

**Ship to itch.io:** set `VITE_API_BASE` in `client/.env.production` to the
Render backend URL, run `npm run build`, then zip the **contents** of `dist/`
(with `index.html` at the zip root) and upload as an itch HTML5 project.

## Shutting down

- **Client:** press `Ctrl-C` in the terminal running `npm run dev`.
- **Backend:** `make down-local` (or `docker compose down`) — stops all four
  services but **keeps the database volume**, so your wallets/bets survive the
  next `make up-local`.
- **Wipe the database too** (fresh start next time): `docker compose down -v`
  removes the volumes; you'll need `make migrate && make seed` again after the
  next start.

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Spin does nothing, or a "connection hiccup" toast | Backend unreachable. Confirm [http://localhost:8000/docs](http://localhost:8000/docs) loads and Docker is running. |
| Menu shows but guest login fails | API up but DB not migrated — run `make migrate` (and `make seed`). |
| No sound | Expected until your first click (browser autoplay). |
| `npm run dev` port already in use | Another Vite instance on 5173 — stop it, or the client won't be at the URL the backend's CORS/`VITE_API_BASE` assume. |
| Blank page after `vite build` preview | Ensure you opened the built app via `npm run preview`, not by double-clicking `dist/index.html` (module scripts need a server). |
