# Visual Theme — Casino Felt / Balatro

**Date:** 2026-07-26 · **Status:** Implemented
**Scope:** Client-only. Palette, type, screen-edge chrome, and the layout of the
poison and casino screens. No backend changes, no gameplay changes. Builds on the
navigation layer from [gui-polish-design.md](gui-polish-design.md).

## Context & goal

The client wore a dark purple/hot-pink "cursed neon" skin — canvas `#0a0410`,
`#ff3ea5` headings, purple orbs and cards — with ~124 colour literals spread over
18 files. Three v0 mockups set a different target: a green baize table with gold
and cream, a display serif, HUD panels welded to the screen edges, unequally
sized orbs that name themselves on hover, and machine cards that look like worn
playing cards.

The goal was one coherent casino/Balatro look across every screen, driven from a
single token module so the *next* palette change is one file rather than
eighteen.

## Decisions & rationale

Settled one-by-one in a grilling session before implementation.

| # | Decision | Choice | Why | Rejected alternative |
|---|----------|--------|-----|----------------------|
| 1 | Backdrop | Felt green, lit centre → **vignette**, plus a faint **dot grid** | Reads as a card table (mockup 1) with the texture of mockup 3 | Either treatment alone |
| 2 | Outcome colours | **Gold** = reward, **deep red** = punish; pink/purple retired | Green *was* the reward colour, but the table is now green — it stopped signalling anything | Keep green reward and brighten it |
| 3 | Type | **Playfair Display** (display serif) + **Inter** (wide letterspaced sans) | Matches all three mockups | All-serif; a Balatro-true pixel font (fights the mockups' elegance) |
| 4 | Font delivery | **Self-hosted woff2**, latin subset, `@font-face` in `styles/fonts.css` | Works offline; no CDN dependency at play time; consistent with the local PNG/MP3 imports | Google Fonts `<link>`; a system stack |
| 5 | Palette home | **`core/theme.ts`** — Phaser-free colour/type/geometry tokens + named text presets | Mirrors `core/config.ts`; hot-reloads for live tuning; the DOM overlays need the same values as CSS strings | Swap the hexes in place |
| 6 | Scope | Theme **every** scene; re-lay-out **Poison + Casino + HUD + back tab** | The token sweep is cheap, and a half-themed game looks like two games while navigating | Poison/Casino only; a full Slots + MarketPanel redesign |
| 7 | Top HUD | **Two panels** fused to the top edge — wallet in the corner, progress beside it | Mockups 1 and 3 | One full-width top bar |
| 8 | `lost so far` line | **Dropped** | The progress bar already says it; the panel reads cleaner without a second figure | Keep it under the bar |
| 9 | Back button | **Flush bottom-left corner**, top-right corner rounded, `←` prefix, no hover lift | Mirrors the wallet panel above it; lifting edge chrome swells its corner off the frame | Flush bottom-centre |
| 10 | Orb sizes | **Hand-tuned** radius + vertical offset per bet, in one table in `PoisonScene` | Deterministic and re-tunable; market sits biggest and lowest as the centrepiece | Size derived from stake weight (no number to bind to); randomised per visit |
| 11 | Orb labels | **Hidden when idle**; hover fades in name + description, rising into place | An idle table is just glowing orbs; hovering is what tells you what the bet is | Names always visible; a Balatro tooltip card |
| 12 | Cards | Worn cream stock, ink border, **corner suit indices**, ink emblem, name **below** the card | "More card like, worn-out white" | Name printed on the face; full rank-and-suit playing-card faces |
| 13 | Art pipeline | Procedural still, but baked via **canvas 2D** | `Graphics` has no gradients, and this palette is built on them — [ADR 0005](adr/0005-canvas-baked-token-driven-theme.md) | Hand-authored PNGs; flat `Graphics` fills |
| 14 | Copy | **Unchanged** (only `lost so far` removed) | Machine names stay honest to what the backend actually serves | Adopt the mockups' wording, incl. renaming ROULETTE → POKER |
| 15 | Money format | **`$` with cents kept** | Reaching exactly `$0` is the win condition, so `$0.40` must never render as `$0` — that reads as a broken game | Drop the decimals; switch to `₪` |
| 16 | Hover state | **Gold-rim texture swap + 3% lift**, never a tint | A tint multiplies; on cream and gold surfaces that reads as dirt, not highlight | Warm near-white tint |

## Tokens

`client/src/core/theme.ts` is the single home of the look, and exports:

- `color` — `0xRRGGBB` numbers for Phaser; `css` — the same values as
  `#rrggbb` strings, for the DOM overlays (auth form, market panel, TradingView
  fallback).
- `outcome.reward` / `outcome.punish` — **always** reference these rather than a
  hue. The game is inverted: `reward` marks a balance that went *down*.
- `font.display` / `font.ui`, and `FONTS_TO_LOAD` (what `BootScene` awaits).
- `text` — named presets (`title`, `heading`, `money`, `label`, `orbName`,
  `orbDesc`, `cardName`, `button`, `body`, `toast`). Scenes reach for a preset
  instead of spelling out a size and colour.
- `chrome` — edge-chrome geometry shared by the HUD panels and the back tab,
  including `contentTop`: the first y a scene may draw at without colliding with
  the HUD.

## Structure

```
core/theme.ts      tokens (Phaser-free)
core/money.ts      dollars(cents) — extracted from WalletHud; MarketPanel had a
                   byte-identical private copy, now deleted
core/assets.ts     every texture, baked through canvas 2D (see ADR 0005)
ui/Backdrop.ts     paintBackdrop(scene) — first call in every scene's create()
ui/TopHud.ts       WalletPanel + ProgressPanel + mountTopHud() — replaces WalletHud
ui/BackTab.ts      the bottom-left flush tab, a Button with edge-chrome textures
```

`Button` grew `texture` / `hoverTexture` / `lift` options, which is what lets
`BackTab` be a differently-shaped Button rather than a fourth copy of the widget
input wiring ([ADR 0004](adr/0004-click-requires-matching-press.md) still governs
what counts as a click).

`Orb`'s hit area also changed from a square to a **circle**. It was always
slightly wrong; it became visible once hover revealed text, because the corners
outside the orb would trigger the caption.

## Testing

Per project convention, Phaser scenes/visuals/tweens are verified by the manual
smoke test; only pure logic gets Vitest coverage. One seam was driven test-first:

| Seam | Home (Phaser-free) | Behaviour locked in |
|------|--------------------|---------------------|
| `dollars(cents)` | `core/money.ts` | grouped `$` string, cents always shown (`40` → `$0.40`, never `$0`), negatives keep the sign |

**Manual smoke:** boot (labels in Playfair/Inter, not Times) → Title → Menu
(auth overlay in-palette) → Poison: wallet panel in the top-left corner touching
both edges, progress panel beside it touching the top, three unequal staggered
orbs showing **no** text until hovered, caption fading in only from inside the
circle, `← give up?` flush to the bottom-left. Buy a beer (balance ticks down, 2s
radial cooldown, caption doesn't hang around while disabled) → Casino (cream cards
deal in, gold rim + lift on hover, names below) → Slots (title clear of the HUD; a
LOST spin flashes **gold** with gold coins, a WON spin flashes **red**; set
`WIN_JUICE_CHANCE = 1` to check the squash-and-stretch) → Market (DOM panel and
chart read as the same product) → `← go back?` chain → drain to `$0` for Win.
Resize the window: the letterbox bars are felt-edge green.
