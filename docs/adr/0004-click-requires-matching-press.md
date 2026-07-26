# ADR 0004 — A click requires a matching press

**Status:** Accepted · **Date:** 2026-07-26

## Context

Phaser 3 has no `click` event. A game object's `pointerup` fires whenever the
pointer is released *over* it, regardless of where the press began. Handlers
written as "act on `pointerup`" therefore act on **half a click**, and this has
now bitten the client three separate times:

1. `a51b27f` — button hover/press reliability.
2. The auth overlay: modal clicks bubbled to `window`, where Phaser hit-tested
   them against the buttons behind the form (see `ui/authForm.test.ts`).
3. The title card: `TitleScene` advanced on `pointerdown`, so one physical click
   split across the scene boundary — the *press* started `Menu`, and the
   *release* landed on whichever button `Menu` had just drawn under the cursor.
   The player pressed `LOGIN` without ever seeing it, and without hearing the
   click SFX (which correctly fires on the press, back in `TitleScene`).

The same gap made press-on-one-widget, release-on-another fire the second
widget, and press-outside, drag-in, release fire a widget that was never pressed.

`Button`, `Card` and `Orb` each held a byte-identical copy of the faulty input
block, so any fix applied in one place would have left the other two wrong.

## Decision

**Nothing in this client acts on half a click.** A click is a press *and* a
release on the same target, uninterrupted.

The rule lives in one Phaser-free state machine, `client/src/core/pressGuard.ts`,
following the `core/slotLogic.ts` precedent of extracting tricky UI logic so it
is unit-testable without a canvas. `Button`, `Card`, `Orb` and `TitleScene` all
delegate to it; they keep their own tint, `selected` and enabled handling.

Leaving the target (`pointerout`) **cancels** the press, and returning does not
re-arm it.

## Consequences

- **+** One place now answers "what counts as a click" for the whole game, with
  the bug-causing transitions pinned by `core/pressGuard.test.ts`.
- **+** Cancel-on-leave matches the `setScale(1)` un-press the widgets already
  performed on `pointerout` — a control that will not fire always *looks* like
  one that will not fire.
- **−** Deliberately diverges from native HTML/OS buttons, which stay armed
  through a drag-off and fire if you return before releasing. Accepted: it is
  not an interaction players perform intentionally, and matching it would have
  required `pointerupoutside` plumbing and a re-press visual in all three
  widgets.
- **−** The three widgets still hold near-identical input wiring; only the
  *rule* was extracted, not the four pointer bindings. A single
  `attachPress()` helper was considered and rejected: `Button` and `Orb` have
  `selected` tint states that `Card` does not, so the `pointerover`/`pointerout`
  handlers do not unify. Adding a widget still means copying the wiring — but
  copying it now means copying `PressGuard` with it.
- **−** One guard serves all pointers, so under multi-touch one finger's press
  can be completed by another finger's release. Accepted for a desktop-first
  jam build; keying the guard by `pointer.id` is the fix if it ever matters.
- `TitleScene` binds `on`, not `once`. A release left over from a press begun
  during `BootScene`'s mp3 preload must be *ignored* without consuming the
  listener, or the title card would never advance. It also disarms on
  `pointerupoutside`, since a scene — unlike a widget — has no `pointerout`.
- New interactive widgets must use `PressGuard`. A raw `pointerup` handler
  reintroduces this bug class.
