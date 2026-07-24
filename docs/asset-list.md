# Art & Audio Asset Checklist

**Art direction:** Retro-casino × glitch-core — neon CRT palette, chunky
pixel/vector hybrid, deliberate glitch artifacts when money is lost (leans into
the inverted theme). Source files go in [`/assets`](../assets).

## Visual assets

| Asset | Spec | Status |
|-------|------|:---:|
| Slot reel symbols (CHERRY, LEMON, BELL, STAR, SEVEN, SKULL) | 128×128 PNG, transparent, atlas-packed | ☐ |
| Slot machine frame + lever | 1080×1080; lever 4–6 frame anim | ☐ |
| Roulette wheel + ball | wheel 720×720 (rotatable), ball 32×32 | ☐ |
| Item cards/icons (per catalog `art_key`) | card 300×420, icon 96×96, rarity-framed | ☐ |
| UI: buttons, badges, balance HUD | 9-slice panels, 2× @ 44–64px | ☐ |
| Backgrounds (market, casino, menu) | 1920×1080, parallax layers | ☐ |
| Particle sprites (coins, sparks, glitch) | 32×32 atlas | ☐ |
| Money-loss burst FX | 6–8 frame sprite anim | ☐ |

Item `art_key`s already referenced by the seed catalog: `item_leaky_wallet`,
`item_moth_swarm`, `item_black_cat`, `item_broken_mirror`, `item_cursed_coin`,
`item_void_piggybank`.

## Audio assets (theme is INVERTED)

| Asset | Feel | Status |
|-------|------|:---:|
| **Money LOSS** SFX | rewarding — coin cascade, triumphant chime | ☐ |
| **Money GAIN** SFX | punishing — error buzz, deflating trombone | ☐ |
| Button click / reel spin+stop / roulette tick-down | short, punchy | ☐ |
| Item drop jingle (per rarity) | escalating sparkle | ☐ |
| Opening cutscene track | intro narrative bed | ☐ |
| BGM loops (menu, market, casino) | seamless ~60–120s | ☐ |

## Boot sequence

Launch → (skippable) narrative cutscene: *"your curse is your fortune — lose it
all"* → main menu. First scene in whichever frontend engine is chosen.
