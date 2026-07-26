# ADR 0005 — Canvas-baked art and a boot-time font gate

**Status:** Accepted · **Date:** 2026-07-26

## Context

The client's whole look was retuned from a purple/pink neon skin to a green
casino felt table (see
[archive/2026-07-26-visual-theme-design.md](../archive/2026-07-26-visual-theme-design.md)). Two
implementation decisions in that change look odd on first reading and are
expensive to reverse once every screen depends on them.

**1. The palette leans on gradients.** The mockups' felt has a lit centre and
vignetted corners; the orbs are dark glass with a specular highlight; the cards
have foxing and worn corners. All new art is still baked procedurally at boot —
that convention is inherited from the client scaffold and keeps every screen
working before real art exists — but `Phaser.GameObjects.Graphics`, which
`bakeAll` used exclusively, **has no gradient fills**. Faking a vignette with
layered translucent rings bands visibly.

**2. Phaser text does not repaint.** A `Phaser.GameObjects.Text` rasterises with
whatever font is resident the instant it is constructed, and never re-rasterises
when a webfont finishes loading. With three self-hosted woff2 files, the first
scene would draw every label in the fallback stack and keep it for the rest of
the session. The suit glyphs baked into the card art have the same exposure,
since they're drawn with `ctx.fillText`.

## Decision

**Bake through a real 2D canvas context, and block the first scene on the fonts.**

`core/assets.ts` gained a `bake(scene, key, w, h, draw)` helper built on
`scene.textures.createCanvas()`, handing the callback a
`CanvasRenderingContext2D`. Every texture is now drawn with the canvas API —
gradients, per-corner radii, `fillText`, alpha speckle — and still registered
under the same texture keys, so real art continues to drop in by key.
`Graphics` remains in use for genuinely *dynamic* drawing (`BeerButton`'s
cooldown wipe), which is not baked.

Randomised detail (cloth noise, card foxing) is driven by a small seeded LCG, not
`Math.random`, so a screenshot of a screen is reproducible.

`BootScene.create()` races `document.fonts.load()` for all three faces against a
**3-second timeout**, then bakes and starts `Title`.

## Consequences

- **+** The felt vignette, orb glass and worn card stock are achievable at all,
  and read as one deliberate palette rather than flat fills.
- **+** Text renders in the intended face on the first frame of every scene, with
  no per-scene font handling and no repaint hack.
- **+** A font that is slow, blocked or 404 costs at most 3s and then degrades to
  Georgia / system-ui. It can never black-screen the boot.
- **−** `assets.ts` now spans two drawing APIs. The rule: **baked → canvas 2D;
  live/dynamic → `Graphics`.** A new bake that reaches for `Graphics` will look
  flatter than everything around it.
- **−** Boot is gated on a network-ish resource. Mitigated by self-hosting (the
  files ship in the bundle, so it is a same-origin fetch, not a CDN round trip)
  and by the timeout.
- **−** `createCanvas` textures are CPU-side canvases; they cost a little more
  memory than `Graphics.generateTexture` output. Irrelevant at this count
  (~30 textures, one 1280×720), but a per-frame bake would not be acceptable.
- **−** Serving the fonts in dev needed `server.fs.allow: ['..']` in
  `vite.config.ts`: the shared `assets/` directory sits above the Vite root, and
  a `url()` in CSS is a plain static request that the dev server sandboxes,
  unlike the PNG/MP3 imports that reach it through the module graph. Production
  builds were unaffected, so this failed **only** in `npm run dev`.
- Colour and type literals must come from `core/theme.ts`. A hard-coded hex is
  now a bug: it is invisible to a palette change and to the DOM overlays that
  read the same tokens as CSS strings.

## Amendment: baking also serves the DOM

This ADR assumed Phaser textures were the only target — `bake()` writes straight
into `scene.textures`. Item icons broke that: the market grid is a DOM overlay,
so a `<div>` tile cannot read a Phaser texture no matter how it was produced.

The drawing primitives (`rgba`, `roundedPath`, and the canvas half of `bake`)
now live in a Phaser-free `core/canvasArt.ts`, shared by `core/assets.ts` (which
still bakes to textures) and `core/itemArt.ts` (which bakes to `toDataURL()` for
an `<img src>`). Same palette, same tokens, same "procedural and keyed, real art
drops in later" promise — one more output format.

`bakeDataUrl` returns `null` rather than throwing when no 2D context is
available. That is not only a jsdom concern: a real browser can refuse a context
(lost GPU context, fingerprinting protection), and an icon must never be the
thing that takes down a render. Callers are expected to have a legible fallback,
which for an item icon is its name in the `alt` text.
