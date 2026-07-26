# Art & Audio Asset Checklist

**Art direction:** Casino felt table × Balatro — a green baize backdrop, gold and
cream chrome, worn playing-card stock, and a display serif paired with a wide
letterspaced sans. Deliberate glitch artifacts when money is *gained* (leans into
the inverted theme). Palette and type live in
[`client/src/core/theme.ts`](../client/src/core/theme.ts); the token contract is
described in [client-architecture.md](client-architecture.md#theme-tokens) and
the decisions behind the look in
[archive/2026-07-26-visual-theme-design.md](archive/2026-07-26-visual-theme-design.md).
Source files go in [`/assets`](../assets).

Unless ticked, a visual below is **baked procedurally** at boot in
[`client/src/core/assets.ts`](../client/src/core/assets.ts) and swappable by
texture key — the checkboxes track real hand-authored art replacing a bake.

## Visual assets

| Asset | Spec | Status |
|-------|------|:---:|
| Slot reel symbols (CHERRY, LEMON, BELL, STAR, SEVEN, SKULL) | 128×128 PNG, transparent | ☑ `assets/{CHERRY,LEMON,BELL,STAR,SEVEN,SKULL}.png`, drawn over baked backing plates |
| Slot machine frame + lever | 1080×1080; lever 4–6 frame anim | ☐ |
| Roulette wheel + ball | wheel 720×720 (rotatable), ball 32×32 | ☐ |
| Item cards/icons (per catalog `art_key`) | card 300×420, icon 96×96, rarity-framed | ☐ |
| UI: buttons, badges, balance HUD | 9-slice panels, 2× @ 44–64px | ☐ |
| Backgrounds (market, casino, menu) | 1920×1080, parallax layers | ☐ |
| Particle sprites (coins, sparks, glitch) | 32×32 atlas | ☐ |
| Money-loss burst FX | 6–8 frame sprite anim | ☐ |
| Bet-select orb frame + bet icons (beer, market, casino) | orb 256×256 ring PNG; icons 96×96 transparent | ☐ |
| Casino machine cards: backgrounds + art (roulette, blackjack, slots) | card 300×420 rarity-framed; art ~200×200; deal-in entrance (rise + Back.Out) | ☐ |
| Beer button states (Active / Cooldown) | 2× @ ~180px; cooldown = 2s radial-wipe overlay | ☐ |
| Slot machine **nine-slice** frame | 9-slice panel, 24px corner insets, 2×; middle stretches to reel span | ☐ |
| Slot pull-lever | idle + pull anim (4–6 frames) | ☐ |
| Slot "changing image" reaction (neutral / win / loss) | ~200×140, one per outcome state | ☐ |
| Juice squash-stretch win FX | no texture (pure tween); optional spark/flash 32×32 atlas | ☐ |
| Felt table backdrop | 1280×720; lit centre → vignetted edge, 26px dot grid, cloth noise | ☐ |
| Top HUD panels (wallet, progress) | 264×92 and 300×92; gold rim, square where they meet the frame edge, rounded inward | ☐ |
| Bottom-left back tab | 208×64; gold rim, only the top-right corner rounded | ☐ |
| Button surface + hover variant | 256×72 pill, gold rim + top sheen; hover = brighter fill, `goldBright` rim | ☐ |
| Bet orb + hover variant | 220×220 dark-glass sphere, gold rim, upper-left specular | ☐ |
| Worn card face + hover variant | 300×420 aged cream stock, ink border, hairline inner frame, foxing speckle | ☐ |
| Machine ink overlays (roulette ♦, blackjack ♥, slots ♠) | 300×420 transparent; corner suit indices (bottom one rotated) + central ink emblem | ☐ |
| Slot symbol backing plates | 128×128; symbol-hued gradient, `goldDim` rim | ☐ |

## Fonts

Self-hosted, latin subset, SIL Open Font License — **shipped**. Declared in
[`client/src/styles/fonts.css`](../client/src/styles/fonts.css) and awaited by
`BootScene` before the first scene draws (see
[ADR 0005](adr/0005-canvas-baked-token-driven-theme.md)). Bake sizes above are
given in authored 720p units; the canvas underneath is twice that
([ADR 0006](adr/0006-2x-render-scale.md)).

| File | Family / axis | Used for |
|------|---------------|----------|
| `assets/fonts/playfair-display-latin-var.woff2` | Playfair Display, wght 400–900 | titles, money, suit glyphs |
| `assets/fonts/playfair-display-italic-latin-var.woff2` | Playfair Display italic | scene titles |
| `assets/fonts/inter-latin-var.woff2` | Inter, wght 400–700 | labels, buttons, body |

Item `art_key`s already referenced by the seed catalog: `item_leaky_wallet`,
`item_moth_swarm`, `item_black_cat`, `item_broken_mirror`, `item_cursed_coin`,
`item_void_piggybank`, `item_high_roller`, `item_void_contract`.

These are drawn today by `client/src/core/itemArt.ts` as procedural rarity
plates baked to **data URLs** (the market tile is DOM, so it cannot read a
Phaser texture). Dropping in real art means keying a PNG import by `art_key` in
that one file — no call-site changes, exactly as `SYMBOL_STYLE[s].icon` works
for the slot symbols. Icons are 48x48 and the rim colour encodes rarity, so a
replacement should keep the same footprint or the grid reflows.

## Audio assets (theme is INVERTED)

| Asset | Feel | Status |
|-------|------|:---:|
| **Money LOSS** SFX | rewarding — coin cascade, triumphant chime | ☐ |
| **Money GAIN** SFX | punishing — error buzz, deflating trombone | ☐ |
| Button click / reel spin+stop / roulette tick-down | short, punchy | ☐ |
| Item drop jingle (per rarity) | escalating sparkle | ☐ |
| Beer sip/gulp SFX | short, wet — plays on beer buy | ☐ |
| Opening cutscene track | intro narrative bed | ☐ |
| Main theme loop | seamless bed under play | ☑ `assets/sounds/Loose Loose Loop.mp3` |
| Win-screen stinger | payoff for reaching $0 | ☑ `assets/sounds/Cursed Sandman.mp3` |
| Per-screen BGM (menu / market / casino) | seamless ~60–120s, if the one bed isn't enough | ☐ |

## Boot sequence

Launch → (skippable) narrative cutscene: *"your curse is your fortune — lose it
all"* → main menu. First scene in whichever frontend engine is chosen.
