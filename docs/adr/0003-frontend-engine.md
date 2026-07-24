# ADR 0003 — Frontend engine

**Status:** Accepted · **Date:** 2026-07-24

## Context

Game-jam client needs maximum velocity, strong built-in "juice" (screen shake,
particles, tweens), easy asset handling, and trivial REST calls to the FastAPI
backend. The backend + API were built engine-agnostic so this choice is
reversible.

## Options

| Criterion | Phaser 3 | PixiJS | Godot 4 (web) | Electron+React | Tauri |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Jam velocity | ★★★★★ | ★★★ | ★★★★ | ★★★ | ★★ |
| Built-in juice | ★★★★★ | ★★★ DIY | ★★★★★ | ★★ DIY | ★★ DIY |
| Asset/atlas pipeline | ★★★★★ | ★★★★ | ★★★★★ | ★★★ | ★★★ |
| REST → FastAPI | ★★★★★ | ★★★★★ | ★★★ | ★★★★★ | ★★★★ |
| Bundle / web deploy | ★★★★ | ★★★★★ | ★★ | ★ | ★★★★ |

## Recommendation

**Phaser 3 (TypeScript).** Best jam-speed-to-juice ratio: tweens, particle
emitters, and camera shake are one-liners (ideal for "lose money" dopamine
bursts), the sprite/atlas pipeline is mature, `fetch()` to FastAPI is trivial, and
it deploys as a Render Static Site. PixiJS is the fallback if we want a lighter
renderer and don't mind hand-building juice systems.

## Decision

**Phaser 3 (TypeScript), HTML5-only, against the hosted backend.** Locked in for
the game jam. Rationale is the recommendation above: best jam-speed-to-juice
ratio, and the `fetch()` path to FastAPI is trivial. The rest of the client
delivery shape was decided alongside it:

- **Delivery target:** HTML5 only, uploaded to itch.io. No Windows executable.
- **Backend:** keep the existing hosted stack (FastAPI + worker) on a **paid,
  always-on Render** service for the judging window — this removes free-tier
  cold-start, the single biggest way a server-backed jam entry silently fails.
  HTTPS is free on Render's domain; CORS is already `["*"]` (`settings.py`).
- **Project layout:** a new `/client` folder in this monorepo. **Vite + Phaser 3
  + TypeScript.** Backend URL via `VITE_API_BASE` (dev → `localhost:8000`,
  prod → Render URL). Ship = `vite build` → zip `dist/` with `index.html` at the
  **zip root** → itch HTML5 project, Phaser `Scale.FIT` + autoCenter + fullscreen.
  No Render static site — itch hosts the client.
- **Assets:** placeholder / "juice-over-art", but **swappable** — every visual and
  sound resolves through a keyed `AssetManifest` (placeholders baked via
  `generateTexture`); no scene draws a raw primitive inline, so real art drops in
  by flipping one manifest entry.
- **Auth/intro:** landing menu with **PLAY AS GUEST** (`/auth/guest`) or
  **LOGIN/register**; fresh accounts, no guest→account upgrade. Token in
  `localStorage`. A minimal skippable title card frames the inverted premise
  before the menu.
- **Build order:** slots first (instant loop — proves the whole skeleton and
  gives a submittable build fast) → market second (non-blocking: place a bet,
  keep playing slots, a background poll manager fires a notification on resolve;
  multiple concurrent bets, **one open bet per symbol**, all three timeframes
  exposed) → roulette as stretch.

See [roadmap.md](../roadmap.md) for the phased status.
