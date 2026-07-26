# ADR 0006 — Render at 2×, author at 720p

**Status:** Accepted · **Date:** 2026-07-26

## Context

The client's type looked soft on every real display, and the obvious reading —
"the fonts need to be higher resolution" — is wrong. The cause is the canvas.

The game was a fixed 1280×720 canvas under `Phaser.Scale.FIT`. Phaser rasterises
every glyph, and every baked texture, into that 1280×720 framebuffer; the browser
then stretches the result to fill the window — 1.5× on a 1080p display, 2× on a
1440p one. Nothing downstream of that stretch can add detail that was never
rasterised, so **shrinking the type would have made it worse, not better**: fewer
real pixels per glyph.

Two apparent escapes do not work, and both are worth recording because both look
like they should:

- **`scale.zoom`** multiplies only the canvas *style* size. `ScaleManager.js`
  says so directly: "the canvas pixel size remains untouched". It changes how big
  the canvas looks, never how many pixels it has.
- **`Text.style.resolution` alone** does render the glyph texture at N×, but that
  texture is still composited into the same small framebuffer, so the extra
  detail is thrown away one step later.

The only fix is more pixels in the framebuffer. The naive way to get them —
raising the design resolution to 2560×1440 — means rescaling every coordinate in
the client: ~380 numeric literals across scenes, widgets and `assets.ts`, with no
test able to catch a missed one.

## Decision

**Render the canvas at 2× and zoom it back with the camera, so all existing
coordinates keep their meaning.**

- `core/viewport.ts` owns `GAME_WIDTH` (1280), `GAME_HEIGHT` (720) and
  `RENDER_SCALE` (2). The Phaser canvas is `GAME_* × RENDER_SCALE` = 2560×1440.
- Every scene calls `fitCamera(scene)` first in `create()`, which sets
  `cameras.main.setZoom(RENDER_SCALE)` and centres on the authored world. The
  zoom and the oversized canvas cancel: **a coordinate is still an authored
  720p unit.**
- Every style in `theme.text` carries `resolution: RENDER_SCALE`. *Now* it works,
  because the framebuffer finally has the pixels to receive it: the glyph texture
  is rendered at 2× and the zoomed camera samples it 1:1.
- `bake()` allocates its canvas at `RENDER_SCALE` times the requested size and
  pre-scales the context, so all ~220 art literals in `assets.ts` stay in
  authored units and still come out at device resolution.
- `RENDER_SCALE` is a fixed 2, not `devicePixelRatio`. Determinism matters here:
  ADR 0005's seeded cloth noise and card foxing only reproduce across machines if
  the bake size does.

`viewport.ts` is deliberately free of any *runtime* Phaser import — `theme.ts`
reads `RENDER_SCALE` from it and is itself shared with the DOM overlays, which
must not pull the engine in. `fitCamera` uses Phaser's ambient global type, which
is erased at compile time.

## Consequences

- **+** Text is rasterised at 2× and art is baked at 2×, so both are genuinely
  crisp at native resolution rather than upscaled.
- **+** Every scene coordinate, `chrome` value and font size in the codebase kept
  its old meaning. The change touched roughly a dozen sites, not 380.
- **−** **`scene.scale.width` now reports 2560, not 1280.** This is the sharp
  edge. Reach for `GAME_WIDTH`/`GAME_HEIGHT` instead; using `scale.width` puts an
  element at double its intended coordinate.
- **−** A scene that forgets `fitCamera` draws into the top-left quarter of the
  screen. It is the first line of every `create()` for that reason.
- **−** Baked textures are `RENDER_SCALE`× oversized. Harmless for the many
  consumers that call `setDisplaySize`, but anything drawing a baked texture at
  its *natural* size must divide back out. Four places do: the slot reaction
  face, the reel symbol tiles, the coin/glitch particle scales, and
  `SLOT_FRAME_INSET` (which is measured in source-texture pixels, so it is
  defined as `24 * RENDER_SCALE`).
- **−** Four times the fill rate and roughly four times the texture memory of the
  old canvas. Irrelevant at this scene complexity — the largest texture is one
  2560×1440 backdrop — but a reason not to raise `RENDER_SCALE` further without
  measuring.
- Loaded PNG art (the slot symbol icons) and the DOM overlays are untouched by
  any of this: the first are real images, the second live in real CSS pixels
  outside the canvas coordinate space entirely.
