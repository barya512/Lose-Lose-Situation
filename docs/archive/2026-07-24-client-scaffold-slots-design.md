# Client Scaffold + Slots Slice — Design

> **Archived.** Fully implemented — the living reference for the client is
> [client-architecture.md](../client-architecture.md). Kept for the design
> rationale below. The paired execution plan is
> [2026-07-24-client-scaffold-slots-plan.md](2026-07-24-client-scaffold-slots-plan.md).

**Date:** 2026-07-24 · **Status:** Approved (pending spec review)
**Scope:** Roadmap Phase 4, "Next actions" 1–2 — stand up `/client` and ship a
submittable slots vertical slice. Market and roulette are out of scope (separate
specs). Engine and delivery decisions are inherited from
[ADR 0003](../adr/0003-frontend-engine.md) and are not re-litigated here.

## Goal

A player can open the built client, get a wallet (guest or account), and play
slots with full inverted juice. When their balance reaches **$0 they win the
game** and see a win screen. This proves the shared client skeleton (auth, API
client, wallet store, asset manifest, audio, juice helpers) end-to-end and
yields a build that could be zipped to itch as-is.

## Inverted theme (critical — do not get backwards)

The objective is to **lose all money**. Reaching `$0` wins the game.

- A slot spin that returns `status: "LOST"` (payout 0) = the player lost their
  stake = **the desired, celebrated outcome.**
- A spin that returns `status: "WON"` (payout > 0) = balance grew = **the
  punishing, bad outcome.**

All feedback is inverted accordingly (see [Slots scene UX](#slots-scene-ux)).

## Non-goals (this slice)

- Market module, background poll manager, concurrent bets.
- Roulette.
- Item drops / inventory UI. Slots does not drop items (that is a market
  mechanic), so `GET /me` inventory is not consumed here.
- Real art/audio. Everything is a keyed placeholder, swappable later via the
  manifest without touching scenes.
- Guest → account upgrade (ADR 0003: fresh accounts only).

## Backend contract (confirmed against source)

Base URL: `http://localhost:8000/api/v1` (dev). Auth is JWT bearer in the
`Authorization` header. Money is integer cents throughout.

| Call | Request | Response (relevant fields) |
|------|---------|----------------------------|
| `POST /auth/guest` | (no body) | `{ access_token, user }` |
| `POST /auth/register` | `{ username, password }` | `201 { access_token, user }` (409 if taken) |
| `POST /auth/login` | `{ username, password }` | `200 { access_token, user }` (401 bad creds) |
| `GET /me` | — (auth) | `{ ...user, inventory: [...] }` |
| `POST /casino/slots/spin` | `{ stake_cents, reels }` (reels = 3 or 5) | `{ status, payout_cents, result_detail: { reels: [...], payout_cents, net_cents } }` |

`user` shape: `{ id, username, is_guest, balance_cents, total_lost_cents,
bets_count, has_won }`.

Economy facts (from `game_config.py`, env-overridable — treat as runtime data,
never hardcode balances in UI logic): starting balance `100000`¢ ($1000), win
target `0`¢, min bet `100`¢ ($1). Slots stake cap = full balance (`min ≤ stake ≤
balance`); the 25% `MAX_BET_FRACTION` applies to market bets, not slots. Slot
symbols: `CHERRY, LEMON, BELL, STAR, SEVEN, SKULL`.

Casino errors return `400` on stake below min / above balance.

## CORS / dev prerequisite

The browser origin `http://localhost:5173` (Vite default) must be in the
backend's `CORS_ORIGINS`. `.env.example` already shows the correct form
(`CORS_ORIGINS=["http://localhost:5173"]`); document that the client dev loop
requires it set. No backend code change in this slice.

## Project layout

New `/client` folder in the monorepo:

```
client/
  index.html
  package.json  vite.config.ts  tsconfig.json
  .env.development            # VITE_API_BASE=http://localhost:8000/api/v1
  .env.production            # VITE_API_BASE=<render url>/api/v1
  src/
    main.ts                  # Phaser game config + scene registration
    core/
      api.ts                 # typed fetch wrapper (bearer + JSON + ApiError)
      session.ts             # token + user in localStorage; wallet store + change event
      assets.ts              # AssetManifest: keyed textures/audio, generateTexture placeholders
      audio.ts               # keyed SFX playback (inverted mapping lives here)
      juice.ts               # shake / particle / balance-tween helpers
    scenes/
      BootScene.ts           # bake placeholder textures from manifest -> Title
      TitleScene.ts          # skippable title card, any input -> Menu
      MenuScene.ts           # PLAY AS GUEST / LOGIN / REGISTER
      SlotsScene.ts          # HUD + reels + spin + juice
      WinScene.ts            # reached $0
    ui/
      WalletHud.ts           # balance + total lost + progress-to-$0
      Button.ts              # placeholder button component
```

Phaser config: `Scale.FIT` + `autoCenter`, logical 1280×720, `pixelArt` off (or
on — placeholder-neutral). Fullscreen toggle available for the itch shell.

## Component design (deep modules, well-bounded)

### `core/api.ts`
Single private `request(path, { method, body, auth })` that: prefixes
`VITE_API_BASE`, sets `Content-Type: application/json`, injects
`Authorization: Bearer <token>` from `session` when `auth`, and maps any non-2xx
to a thrown `ApiError { status, message }` (parsed from the FastAPI error body).
Scenes never call `fetch` directly. Public surface:
`authGuest()`, `login(u,p)`, `register(u,p)`, `getMe()`,
`slotsSpin(stakeCents, reels)`. Each returns a typed result.

- **What it does:** turns typed method calls into authenticated HTTP.
- **Depends on:** `session` (for the token), `VITE_API_BASE`.
- **Testable:** yes — inject a fake `fetch`; assert URL, headers, body, and
  error mapping.

### `core/session.ts`
Holds `{ token, user }`, persisted to `localStorage` under one key. Exposes
`setAuth(tokenResult)`, `setUser(user)`, `clear()`, `get token`, `get user`,
and two subscriptions: `onChange(cb)` fired whenever `user` changes, and
`onWin(cb)` fired the first time the wallet hits the win condition.
`applySpin(result)` is **not** here — the wallet's new balance comes from
re-reading the server's authoritative value: after a spin the client calls
`getMe()` and calls `session.setUser(user)`. The HUD subscribes to `onChange`.
Single source of truth for balance.

- **Win detection is centralized here, not in any game scene.** `setUser`
  inspects the authoritative `user` and fires `onWin` when the game is won —
  keyed off the server's `has_won` flag (equivalently `balance_cents == 0`),
  fired once per session. This is the single win gate for **every** money
  module: slots today, market/roulette later all reach `$0` through the same
  `setUser` → `onWin` path, so no module re-implements the check.
- Decision: after each spin, refresh the wallet from `getMe()` so the HUD never
  drifts from the server (stake charging + payout happen server-side). Cheap,
  and it keeps the client dumb about economy math.

### `core/assets.ts`
An `AssetManifest`: a keyed record mapping logical names
(`slot.symbol.cherry`, `ui.button`, `sfx.loss`, …) to either a placeholder
generator (a function that bakes a texture via `scene.make.graphics` →
`generateTexture(key)`) or, later, a real file URL. `BootScene` iterates the
manifest and bakes every placeholder. No scene draws a raw primitive inline;
every visual resolves through a manifest key so real art drops in by flipping
one entry.

### `core/audio.ts`
Thin keyed wrapper over Phaser sound. Encodes the **inverted mapping** in one
place: `playLossReward()` (triumphant chime — good outcome) and
`playGainPunish()` (error buzz — bad outcome), plus `playSpin()`, `playClick()`.
Placeholders: short generated beeps (WebAudio) until real audio lands. If audio
assets are not yet available, methods no-op safely.

### `core/juice.ts`
Reusable helpers: `shake(scene, intensity)`, `coinBurst(scene, x, y)` (particle
emitter), `glitch(scene)` (bad-outcome red flash/offset), and
`tweenBalance(hud, from, to)`. Keeps scenes declarative.

### `ui/WalletHud.ts`
Renders balance (large), total lost, and a **progress bar that fills as balance
approaches $0** (progress = `1 - balance/starting`, starting read from the first
`user` snapshot). Subscribes to `session.onChange`.

### `ui/Button.ts`
Placeholder button (manifest-textured panel + label + hover/press states +
`onClick`). Used by menu and slots.

## Scene flow

```
BootScene ─bake textures─> TitleScene ─any input─> MenuScene
MenuScene ──guest / login / register (stores token+user)──> SlotsScene
(any scene) ── session.onWin (balance reached $0) ──> WinScene
```

- **TitleScene:** one skippable card stating the inverted premise ("your curse
  is your fortune — lose it all"). Any key / tap → Menu.
- **MenuScene:** three buttons. `PLAY AS GUEST` → `authGuest()`. `LOGIN` /
  `REGISTER` → a minimal username/password form (an HTML DOM `<input>` overlay
  positioned over the canvas — reliable text entry without a Phaser input
  plugin) → respective API call. On success store auth, go to Slots.
  On error (409 / 401) show an inline message.
- **SlotsScene:** see below.
- **WinScene:** celebratory end card ("you lost everything. you win."). Button
  back to Menu (starts a fresh wallet via a new guest/login).

**WinScene is module-agnostic.** It is not entered from any game scene directly.
A single win-watcher — registered once at game start on `session.onWin` — starts
the `WinScene` on top of whatever scene is active. Slots is the only trigger in
this slice, but market/roulette resolving a wallet to `$0` later go through the
exact same gate with no change to WinScene or its entry.

## Slots scene UX

- **WalletHud** pinned top.
- **Stake selector:** preset chips **$1 / $10 / $50 / $100** (no MAX — betting
  the whole wallet in one tap is intentionally not offered). Current stake shown.
  A chip whose value exceeds the current balance is disabled. Selecting a chip
  sets the active stake.
- **Reel-count selector:** a **3 / 5** toggle. The backend `slots/spin` takes a
  `reels` param and its payout logic (three-of-a-kind / pair) works for either
  count, so this is purely a stake-per-spin / juice choice for the player. The
  scene lays out the chosen number of reel columns dynamically (default 3).
- **Reels:** the selected number of reel columns + a **SPIN** button.
- **Spin sequence:** disable controls → `playSpin()` + reel spin animation →
  `slotsSpin(stake, reelCount)` → land reels on `result_detail.reels` (length
  matches the requested count) → refresh wallet from `getMe()` → play outcome
  juice → re-enable controls.
- **Inverted juice:**
  - `LOST` (payout 0, **good**): `coinBurst` + `shake` + green flash +
    `playLossReward()`; balance tweens **down** (celebrated).
  - `WON` (payout > 0, **bad**): `glitch` red flash + screen dim +
    `playGainPunish()`; balance tweens **up** (punished).
- The win transition ($0 → WinScene) is handled centrally by the `session.onWin`
  watcher after the wallet refresh — the scene does not check for it.

## Error handling

- **Network / 5xx:** `ApiError` surfaces a non-blocking toast ("connection
  hiccup — try again"); controls re-enable; no wallet mutation.
- **400 on spin** (e.g. stake > balance from a race): toast the message, refresh
  wallet from `getMe()`, re-enable.
- **401 anywhere** (expired token): clear session, return to Menu.
- **Auth form errors:** inline under the form (409 "username taken", 401 "wrong
  username or password").

## Testing

- **Vitest unit tests** for the pure/isolatable logic:
  - `api.ts`: URL prefixing, bearer header injection, JSON body, non-2xx →
    `ApiError` mapping (fake `fetch`).
  - `session.ts`: persist/restore round-trip, `onChange` fires on user change,
    progress-to-$0 derivation.
- **Manual smoke test** against a local backend: `make up-local` →
  `make migrate && make seed` → dev server → guest → spin until a `WON` and a
  `LOST` are both observed → drain to `$0` → WinScene. Documented as a checklist
  in the client README.

Phaser scenes themselves are verified by the manual smoke test, not unit tests
(rendering/tween behavior is not worth mocking for a jam slice).

## Build / ship (inherited from ADR 0003, noted for completeness)

`vite build` → `dist/` with `index.html` at the zip root → itch HTML5. Not part
of this slice's acceptance, but the scaffold must not preclude it (relative asset
paths, `base: './'` in `vite.config.ts`).

## Acceptance criteria

1. `cd client && npm install && npm run dev` serves the client at
   `localhost:5173`.
2. Title → Menu → (guest) → Slots works; token persisted across reload.
3. A spin calls the real backend and lands reels on the returned symbols.
4. Loss (payout 0) is celebrated; win (payout > 0) is punished; both audible and
   visible; balance HUD matches the server.
5. Draining to `$0` shows the WinScene.
6. `npm run test` (Vitest) passes for `api.ts` and `session.ts`.
7. `npm run build` produces a `dist/` with `index.html` at its root.
