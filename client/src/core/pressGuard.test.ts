import { describe, it, expect } from 'vitest';
import { PressGuard } from './pressGuard';

// Seam: Phaser 3 has no `click` event. A game object's `pointerup` fires on
// release OVER the object, whether or not the press began there — so a bare
// `pointerup` handler acts on half a click. This is the rule that decides
// which releases count. See docs/adr/0004-click-requires-matching-press.md.

describe('PressGuard', () => {
  it('ignores a release that was never preceded by a press', () => {
    // The title-screen bug: Title consumed the pointerdown and started Menu,
    // so Menu's freshly-built LOGIN button saw only the pointerup.
    const guard = new PressGuard();
    expect(guard.consumePress()).toBe(false);
  });

  it('fires on a release that completes a press', () => {
    const guard = new PressGuard();
    guard.down();
    expect(guard.consumePress()).toBe(true);
  });

  it('ignores a release after the pointer has left', () => {
    // Press GUEST, drag onto LOGIN, release — LOGIN must not fire.
    const guard = new PressGuard();
    guard.down();
    guard.disarm();
    expect(guard.consumePress()).toBe(false);
  });

  it('stays disarmed when the pointer leaves and comes back', () => {
    // Deliberate divergence from native HTML buttons: leaving cancels the
    // press, matching the setScale(1) un-press the widgets already do.
    const guard = new PressGuard();
    guard.down();
    guard.disarm();
    // ...pointer re-enters; `pointerover` is not an arming event...
    expect(guard.consumePress()).toBe(false);
  });

  it('fires at most once per press', () => {
    const guard = new PressGuard();
    guard.down();
    expect(guard.consumePress()).toBe(true);
    expect(guard.consumePress()).toBe(false);
  });

  it('treats a repeated press as still armed', () => {
    const guard = new PressGuard();
    guard.down();
    guard.down();
    expect(guard.consumePress()).toBe(true);
  });

  it('is safe to disarm when not armed', () => {
    const guard = new PressGuard();
    guard.disarm();
    expect(guard.consumePress()).toBe(false);
    guard.down();
    expect(guard.consumePress()).toBe(true);
  });

  it('re-arms cleanly for the next press', () => {
    const guard = new PressGuard();
    guard.down();
    guard.consumePress();
    guard.down();
    expect(guard.consumePress()).toBe(true);
  });
});
