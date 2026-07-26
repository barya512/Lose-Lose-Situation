# Client Architecture

How the Phaser 3 client is put together: scene flow, the coordinate space, the
theme token contract, the module map and the art pipeline.

Engine choice: [ADR 0003](adr/0003-frontend-engine.md). Running it:
[getting-started.md](getting-started.md). Vocabulary (bet vs machine, poison,
reward vs punish): [CONTEXT.md](../CONTEXT.md).

## Shape

A thin, **Phaser-free core** (`src/core/`) holds every non-visual concern — HTTP,
the wallet store, the palette, money formatting, the coordinate space — and is
unit-tested with Vitest. Phaser widgets (`src/ui/`) and scenes (`src/scenes/`)
sit on top and are verified by hand. Two screens deliberately break out of the
canvas and render as DOM overlays (auth form, market panel).

The wallet is **server-authoritative**: after every wager the client re-reads
`GET /me` rather than computing a new balance locally. The one exception is beer,
whose response already carries the authoritative wallet
(`session.applyBeerResult`).

## Scene flow

```
Boot ──▶ Title ──click──▶ Menu (auth) ──▶ Poison ──┬── beer orb  (buys in place,
                                                   │              2s cooldown)
                                                   ├── market orb ──▶ Market
                                                   └── casino orb ──▶ Casino ──▶ Slots
                              Poison "← give up?" → session.clear() → Menu
                              Slots "← go back?" → Casino    Casino → Poison
                              Market close → Poison

(any scene) ── session.onWin ($0) ──▶ Win        ← the single global gate
```

- **Boot** preloads the symbol PNGs and music, **awaits the webfonts** (3s
  timeout), bakes every procedural texture, then starts Title. Fonts must be
  resident before the first `Text` is created — Phaser rasterises a label once
  and never repaints it ([ADR 0005](adr/0005-canvas-baked-token-driven-theme.md)).
- **The `$0` → Win transition is registered once**, on `session.onWin` in
  `main.ts`, which stops every active scene and starts `Win`. No scene checks the
  win condition itself. Any module that moves money — slots, market, beer — flows
  through it for free. Async handlers must therefore re-check
  `this.scene.isActive()` after an `await`: the scene may have been stopped
  mid-request.
- **Casino → roulette / blackjack** are rendered as styled-but-disabled cards
  that toast on tap. The backend already serves roulette
  ([api-reference.md](api-reference.md#casino-instant)); only the scene is
  missing.

## Coordinate space

Everything is **authored at 1280×720** and **rendered at 2×**
([ADR 0006](adr/0006-2x-render-scale.md), `core/viewport.ts`):

- `GAME_WIDTH` / `GAME_HEIGHT` — the authored units. Scene coordinates, `chrome`
  geometry and font sizes are all in these; never device pixels.
- `RENDER_SCALE = 2` — the canvas is created at twice the authored size and every
  scene camera zooms by the same factor, so the two cancel and glyphs rasterise
  into real pixels instead of being stretched.
- **Every scene calls `fitCamera(this)` first in `create()`.** Without it the
  scene draws into the top-left quarter of the screen.
- Because of the zoom, `scene.scale.width` reports the **device** width — reach
  for `GAME_WIDTH` instead.
- Text styles carry `resolution: RENDER_SCALE`. A style that omits it is a
  soft-text bug; one-off sizes inherit it by spreading a token
  (`{ ...text.money, fontSize: '22px' }`).

## Theme tokens

`core/theme.ts` is the single home of the look. Change the palette there, not in
a scene.

| Export | What |
|--------|------|
| `color` | `0xRRGGBB` numbers for Phaser — `felt`, `gold`, `cream`, `cardFace`, `ink`, `red`… |
| `css` | The same values as `#rrggbb` strings, derived automatically, for the DOM overlays |
| `outcome.reward` / `.punish` | **Always reference these, never a hue.** The game is inverted: `reward` (gold) marks a balance that went *down*; `punish` (red) marks one that went *up*. `outcomeCss` is the CSS form. |
| `font.display` / `font.ui` | Playfair Display (serif) / Inter (wide letterspaced sans) |
| `FONTS_TO_LOAD` | The exact family+weight strings `BootScene` awaits |
| `text` | Named presets — `title`, `heading`, `money`, `label`, `orbName`, `orbDesc`, `cardName`, `button`, `body`, `toast`. Scenes pick a preset rather than spelling out a size and colour. |
| `chrome` | Edge-chrome geometry shared by the HUD and back tab, including **`contentTop`** — the first y a scene may draw at without colliding with the HUD |

Fonts are **self-hosted woff2** (latin subset, OFL), declared in
`src/styles/fonts.css` and shipped from [`/assets/fonts`](../assets/fonts) — no
CDN dependency at play time.

## Module map

### `src/core/` — Phaser-free, Vitest-covered

| Module | Responsibility |
|--------|----------------|
| `api.ts` | Typed `fetch` wrapper over every endpoint; throws `ApiError` with the server's message. Base URL from `VITE_API_BASE`. |
| `session.ts` | The wallet store: token persistence, `setUser`, `applyBeerResult`, `progressToZero()`, `onChange` / `onWin` subscriptions, `clear()`. |
| `theme.ts` | Palette, type and chrome geometry (above). |
| `viewport.ts` | `GAME_WIDTH`/`GAME_HEIGHT`/`RENDER_SCALE`/`fitCamera`. Owns the coordinate space so `main.ts` isn't an import cycle. |
| `money.ts` | `dollars(cents)` — grouped `$` string that **always shows cents**, so `$0.40` never renders as `$0` (that would read as a won game). |
| `config.ts` | Client-side playtest knobs (`WIN_JUICE_CHANCE`) + `rollChance()`. Hot-reloads via Vite. |
| `slotLogic.ts` | `stepReelCount(cur, delta, min, max)` — ±1, clamped. |
| `pressGuard.ts` | A click requires a matching press on the same widget ([ADR 0004](adr/0004-click-requires-matching-press.md)). |
| `assets.ts` | Every texture: canvas-2D bakes + the real PNG/MP3 imports. `TEX` is the key registry. |
| `audio.ts` | `playSpin`, `playLossReward`, `playGainPunish`, music beds. |
| `juice.ts` | `flash`, `coinBurst`, `shake`, `glitch`, `winReaction`. |
| `tradingview.ts` | `mountMiniChart` — the market panel's embedded charts. |
| `types.ts` | Shared API response types. |

### `src/ui/` — Phaser widgets and DOM overlays

`Button` (the base widget — `texture`/`hoverTexture`/`lift` options let `BackTab`
be a differently-shaped Button rather than a second copy of the input wiring) ·
`Orb` (circular hit area; hover fades in name + description) · `Card` (worn card
stock, deal-in entrance) · `BeerButton` (orb + radial-wipe cooldown) · `Backdrop`
(`paintBackdrop` — first call in every scene's `create()`) · `TopHud`
(`WalletPanel` + `ProgressPanel`, welded to the top edge; `mountTopHud`) ·
`BackTab` (flush bottom-left) · `SlotInfoPanel` (live paytable from
`GET /casino/slots/info`) · `MarketPanel` and `authForm` (**DOM overlays**, not
game objects — the market panel embeds live TradingView iframes, which would be
far more fragile glued to canvas-rendered rows).

### `src/scenes/`

`Boot` · `Title` · `Menu` · `Poison` · `Casino` · `Slots` · `Market` · `Win`.
Registered in that order in `main.ts`.

## Art pipeline

Every visual is **baked procedurally at boot** through canvas 2D in
`core/assets.ts` (`bakeAll`), keyed by an entry in `TEX`
([ADR 0005](adr/0005-canvas-baked-token-driven-theme.md) — canvas 2D rather than
Phaser `Graphics` because this palette is built on gradients, which `Graphics`
can't draw). Real hand-authored art drops in by replacing a bake with a load
under the same key; no scene changes.

Real assets already wired: the six slot-symbol PNGs and two music tracks are
imported from [`/assets`](../assets) as Vite assets. Outstanding art is tracked in
[asset-list.md](asset-list.md).

The slot machine's frame is a Phaser **`NineSlice`** (24px corner insets,
`SLOT_FRAME_INSET`) resized in `SlotsScene.buildReels()` so it hugs whatever reel
count is active without distorting corners.

## Testing convention

**Phaser scenes, visuals and tweens are verified by the manual smoke test**
([getting-started.md §3](getting-started.md#3-play)); **only pure logic gets
Vitest coverage.** Seams are pulled into `core/` precisely so they can be tested
without a canvas — `dollars()`, `rollChance()`, `stepReelCount()`,
`session.applyBeerResult()`, `pressGuard`, the `api` wrapper.

To eyeball a probabilistic effect, force it: set `WIN_JUICE_CHANCE = 1` in
`core/config.ts` and Vite hot-reloads.
