# ADR 0003 — Frontend engine

**Status:** Proposed (decision deferred) · **Date:** 2026-07-24

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

**Deferred by the team.** Backend/API remain engine-agnostic. Fill this ADR in
with the final pick before Phase 4 and record why.
