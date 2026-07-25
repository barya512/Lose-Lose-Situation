# GUI Polish — Poison Menu, Casino Cards, Slot Relayout & Win Juice

**Date:** 2026-07-25 · **Status:** Implemented
**Scope:** Client-only navigation layer + slot-screen relayout + a reusable win
reaction. No backend changes. Engine/delivery inherited from
[ADR 0003](adr/0003-frontend-engine.md); builds on the slots vertical slice in
[the client-scaffold spec](superpowers/specs/2026-07-24-client-scaffold-slots-design.md).

## Context & goal

The client jumped straight from the auth menu (`MenuScene`, "CHOOSE YOUR RUIN")
into `SlotsScene`. Hand-drawn mockups introduced the missing middle: a game-
selection hub, a casino machine picker, and a polished slot screen — plus a
reusable "juice" flourish on wins. The inverted theme still governs everything:
**reaching $0 wins the game**, so a slot spin that returns `LOST` (money drained)
is the *celebrated* outcome and a `WON` spin (balance grew) is punished.

All new art is **baked procedurally** in `client/src/core/assets.ts` (same
`generateTexture` convention as the existing placeholders) so every screen works
today; real assets are tracked in [asset-list.md](asset-list.md) for later swap-in
by key. Market / Blackjack / Roulette are **coming-soon placeholders** (styled,
disabled, toast on tap) — only Casino→Slots and Beer are interactive.

## Scene flow

```
Boot → Title → Menu(auth) → Poison ──Casino──→ Casino(cards) ──Slots──→ Slots
                              │ Beer orb (buys, 2s radial cooldown, stays on Poison)
                              │ Market orb (coming soon)
                              └ "give up?" → session.clear() → Menu(auth)
(any scene) ── session.onWin ($0) ──→ Win   (global gate, unchanged, in main.ts)
Slots "go back?" → Casino     Casino "go back?" → Poison
```

The `$0` → `WinScene` transition remains the single global gate registered on
`session.onWin` in `main.ts`; no scene checks the win condition itself. Beer wins
flow through the same gate because `session.applyBeerResult` sets `has_won`.

## Decisions & rationale

Settled one-by-one in a grilling session before implementation.

| # | Decision | Choice | Why | Rejected alternative |
|---|----------|--------|-----|----------------------|
| 1 | Poison screen placement | Insert **after** auth (`Menu → Poison`) | Mockup shows a funded wallet, so auth must precede it; auth screen stays untouched | Merge auth into the poison screen |
| 2 | "give up?" behavior | `session.clear()` → **auth `Menu`** | Abandoning a run should wipe the wallet; re-showing the title card is friction | Return to Title; or add a confirm dialog |
| 3 | Back navigation | One level up; label **always "go back?"** | Plain reverse of the forward path; consistent copy | Varied labels / deeper jumps |
| 4 | Slot spin trigger | **Lever only** | Mockup shows only a lever; reuses existing `spin()` | Keep the SPIN button too |
| 5 | Reel control | **+/-** stepping **3→4→5**, clamped | Matches mockup; backend accepts `ge=3,le=5`; 4 was previously unreachable | Keep the old 3/5 toggle |
| 6 | "changing image" | **Outcome-reaction** display (neutral → celebrate on LOST / punished on WON) | Reinforces the inverted theme at a glance; reuses the win/loss branch | Symbol-cycling preview; ambient loop |
| 7 | Stake buttons | Keep the existing **four** chips ($1/$10/$50/$100) | Mockup's "…" is illustrative; current set is tested + affordability-gated | Trim to three |
| 8 | Beer cooldown visual | **Radial-wipe** overlay over the dimmed orb, 2s | Reads instantly as a cooldown; maps to Active/Cooldown asset states | Plain dim only |
| 9 | Beer wallet update | **Merge `BeerResult`** into the session | Server already returns authoritative balance/total_lost/has_won; snappier, no extra request | Re-fetch via `getMe()` like slots |
| 10 | Win reaction trigger | **LOST spins only**, probability from client config | WON already gets the punishing glitch; firing on it sends a mixed signal | Fire on WON too |
| 11 | Win-chance knob home | **Client config** `WIN_JUICE_CHANCE` in `core/config.ts`, client rolls | Purely cosmetic → the client is its home; Vite hot-reload = easiest playtest tuning | `game_config.py` + `slots/info` API; server-rolled per-spin |
| 12 | Card entrance | **Deal-in stagger** (`delay: i*90`, `Back.Out`) | Reads as dealing onto a table | Slide-up in unison; flip-in |

## Architecture: dynamic slot frame (Option A — NineSlice)

Chosen **Phaser 3 native `NineSlice`** over a fixed max-width frame. The reels
already lay out dynamically, so a frame that resizes to hug them is the natural
fit; one baked source texture (24px corner insets, `SLOT_FRAME_INSET`) keeps
corners crisp at any width while the middle stretches. A fixed frame sized for 5
reels would leave dead space or distort corners at 3–4 reels. Perf is a wash —
`NineSlice` recomputes nine quads only when the reel count changes. The frame is
resized in `SlotsScene.buildReels()`.

## Placeholders & scope

- **Coming soon:** Market (orb) and Roulette/Blackjack (cards) are rendered fully
  styled but disabled, with a toast on tap. Only Casino→Slots and Beer act.
- **Procedural art:** every new visual is baked in `assets.ts` (`bakeUiTextures`);
  real art drops in by key. See [asset-list.md](asset-list.md) for the appended
  rows (orb + icons, cards + art, beer states, nine-slice frame, lever, reaction
  frames, beer SFX).

## Testing

Per project convention (and the slots spec), Phaser scenes/visuals/tweens are
verified by the **manual smoke test**; only pure logic gets Vitest coverage.
Four seams were driven test-first (red → green, one vertical slice at a time):

| Seam | Home (Phaser-free) | Behavior locked in |
|------|--------------------|--------------------|
| `api.buyBeer()` | `core/api.ts` | `POST /beer/buy`, bearer header, no body; error → `ApiError` |
| `rollChance(chance, rng)` | `core/config.ts` | fires iff `rng() < chance`; 0 never, 1 always |
| `stepReelCount(cur, delta, min, max)` | `core/slotLogic.ts` | ±1 step, clamped to 3–5 |
| `session.applyBeerResult(result)` | `core/session.ts` | merges balance/total_lost/has_won; fires `onChange` + `onWin` |

**Manual smoke:** guest → Poison → Beer (balance −$1, 2s radial cooldown, taps
ignored while cooling) → Casino (cards deal in) → Slots (pull lever spins; +/-
resizes the nine-slice frame; reaction image swaps on outcome; squash-stretch
fires on ~35% of LOST spins, never on WON) → go back? chain → give up? clears to
auth. To sanity-check the reaction visually, set `WIN_JUICE_CHANCE = 1`.
