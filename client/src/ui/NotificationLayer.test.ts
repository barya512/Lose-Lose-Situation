import { describe, it, expect, afterEach, vi } from 'vitest';
import { mountNotificationLayer } from './NotificationLayer';
import type { MarketBet } from '../core/types';

// Seam: a fixed-position DOM overlay layered over a live Phaser scene, same as
// the auth form. Phaser attaches its mouse listeners to `window`, so anything
// that bubbles up there gets hit-tested against whatever is behind the overlay
// — the click-through leak documented in ADR 0004. Behavioural invariants only;
// nothing here asserts markup or copy.

function bet(overrides: Partial<MarketBet> = {}): MarketBet {
  return {
    id: 'b1',
    ticker: 'BTC-USD',
    direction: 'UP',
    stake_cents: 5000,
    timeframe_s: 60,
    start_price: 100,
    end_price: 90,
    resolve_at: new Date().toISOString(),
    status: 'LOST',
    penalty_cents: 250,
    payout_cents: 0,
    result_detail: null,
    ...overrides,
  };
}

describe('mountNotificationLayer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('does not let a mousedown on a card reach window', () => {
    const onWindowDown = vi.fn();
    window.addEventListener('mousedown', onWindowDown);

    const layer = mountNotificationLayer();
    layer.show(bet());

    const card = document.querySelector('[data-notification]');
    expect(card).not.toBeNull();
    card!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onWindowDown).not.toHaveBeenCalled();
    window.removeEventListener('mousedown', onWindowDown);
    layer.teardown();
  });

  it('does not let a mouseup on a card reach window', () => {
    const onWindowUp = vi.fn();
    window.addEventListener('mouseup', onWindowUp);

    const layer = mountNotificationLayer();
    layer.show(bet());
    document
      .querySelector('[data-notification]')!
      .dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(onWindowUp).not.toHaveBeenCalled();
    window.removeEventListener('mouseup', onWindowUp);
    layer.teardown();
  });

  it('caps the stack so a burst of settles cannot bury the screen', () => {
    const layer = mountNotificationLayer();
    for (let i = 0; i < 8; i += 1) layer.show(bet({ id: `b${i}` }));

    expect(document.querySelectorAll('[data-notification]').length).toBeLessThanOrEqual(3);
    layer.teardown();
  });

  it('dismisses a card when it is clicked', () => {
    const layer = mountNotificationLayer();
    layer.show(bet());

    document
      .querySelector('[data-notification]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelectorAll('[data-notification]').length).toBe(0);
    layer.teardown();
  });

  it('teardown removes every node it added', () => {
    const before = document.body.childElementCount;
    const layer = mountNotificationLayer();
    layer.show(bet());
    layer.show(bet({ id: 'b2' }));

    layer.teardown();

    expect(document.body.childElementCount).toBe(before);
  });
});
