import { describe, it, expect, afterEach, vi } from 'vitest';
import { showAuthForm } from './authForm';

// Seam: the auth overlay is a DOM modal layered over a live Phaser scene.
// Phaser attaches its mouse listeners to `window`, so any overlay click that
// bubbles up to `window` gets hit-tested against the buttons behind the form
// (the click-through that breaks login/register). The modal must trap its own
// mouse events so they never reach window-level listeners.

const noop = () => {};

describe('showAuthForm modality', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not let a mousedown inside the overlay reach window', () => {
    const onWindowDown = vi.fn();
    window.addEventListener('mousedown', onWindowDown);

    showAuthForm('LOGIN', async () => null, noop);

    const inner = document.querySelector('input');
    expect(inner).not.toBeNull();
    inner!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onWindowDown).not.toHaveBeenCalled();

    window.removeEventListener('mousedown', onWindowDown);
  });

  it('does not let a mouseup inside the overlay reach window', () => {
    const onWindowUp = vi.fn();
    window.addEventListener('mouseup', onWindowUp);

    showAuthForm('LOGIN', async () => null, noop);

    const inner = document.querySelector('input');
    inner!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onWindowUp).not.toHaveBeenCalled();

    window.removeEventListener('mouseup', onWindowUp);
  });
});
