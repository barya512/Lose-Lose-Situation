# Lose-Lose — Client

Phaser 3 + Vite + TypeScript HTML5 client. Slots vertical slice.

## Dev

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires the backend running (`make up-local && make migrate && make seed` from
the repo root) with `CORS_ORIGINS` including `http://localhost:5173`.
Backend URL is set by `VITE_API_BASE` in `.env.development`.

## Test

```bash
npm run test       # Vitest — core/session + core/api
```

## Build (itch HTML5)

```bash
npm run build      # -> dist/ (base: './', index.html at root)
```
Zip the **contents** of `dist/` (with `index.html` at the zip root) and upload as
an itch.io HTML5 project. Set `VITE_API_BASE` in `.env.production` to the Render
URL before building for release.

## Structure

- `src/core/` — `api` (typed fetch), `session` (wallet store + win gate),
  `assets` (placeholder manifest), `audio`, `juice`.
- `src/ui/` — `Button`, `WalletHud`, `authForm`.
- `src/scenes/` — Boot → Title → Menu → Slots, plus the module-agnostic Win.

Real art/audio swaps in by replacing entries in `src/core/assets.ts` /
`src/core/audio.ts` — no scene changes needed.
