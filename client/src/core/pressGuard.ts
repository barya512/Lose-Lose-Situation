// Pure press/release tracking. Phaser-free so it stays unit-testable.

/**
 * Decides which releases count as a click.
 *
 * Phaser 3 has no `click` event: a game object's `pointerup` fires whenever the
 * pointer is released over it, whether or not the press began there. Acting on
 * a bare `pointerup` therefore acts on half a click — which is how a click on
 * the title card reached (and pressed) a Menu button that had not been drawn
 * yet, and how pressing one button and releasing on another fires the second.
 *
 * The rule: a click is a press and a release on the same widget, uninterrupted.
 * Leaving the widget cancels the press and it does NOT re-arm on return. That
 * differs from native HTML buttons deliberately — it matches the `setScale(1)`
 * un-press the widgets already perform on `pointerout`, so a guard that will
 * not fire always looks like one that will not fire.
 *
 * See docs/adr/0004-click-requires-matching-press.md.
 */
export class PressGuard {
  private armed = false;

  /** A press landed on the widget. Call from `pointerdown`. */
  down(): void {
    this.armed = true;
  }

  /**
   * Cancel any in-flight press. Call from `pointerout`, and whenever the widget
   * stops accepting input (e.g. being disabled mid-press).
   */
  disarm(): void {
    this.armed = false;
  }

  /**
   * A release landed on the widget. Call from `pointerup`. Consumes any armed
   * press and reports whether there was one — i.e. whether the caller should
   * treat this release as a click. Always disarms, so one press fires once.
   */
  consumePress(): boolean {
    const completed = this.armed;
    this.armed = false;
    return completed;
  }
}
