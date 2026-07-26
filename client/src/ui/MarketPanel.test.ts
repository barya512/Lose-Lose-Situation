import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mountMarketPanel } from './MarketPanel';
import { session } from '../core/session';
import type { MarketTicker } from '../core/types';

// Seam: each ticker row embeds a TradingView mini-chart, which is a
// cross-origin iframe whose body links out to tradingview.com. A click inside
// it cannot be intercepted from this page, so the chart used to navigate the
// player out of the game. The fix is a transparent hit-layer over the chart —
// these tests pin that the layer exists and toggles the betting drawer exactly
// like the symbol header, not that the chart itself does anything.
//
// Second seam (same one authForm.test.ts covers): this is a DOM overlay above
// a live Phaser scene, and Phaser hit-tests window-level mouse events against
// whatever is behind. Chart clicks now reach `window` where the iframe used to
// swallow them, so the panel has to trap its own mouse events.

const TICKER: MarketTicker = {
  symbol: 'AAPL', name: 'Apple', kind: 'STOCK', last_price: 150, is_open: true,
};

vi.mock('../core/tradingview', () => ({
  mountMiniChart: () => () => {},
}));

vi.mock('../core/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    marketTickers: vi.fn(async () => [TICKER]),
    marketBets: vi.fn(async () => []),
    marketPlaceBet: vi.fn(),
    getMe: vi.fn(),
  },
}));

const noopEffects = { onWon: () => {}, onLost: () => {} };

// The rows are built by the async refreshTickers() kicked off during mount.
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** The transparent layer covering the chart — the thing under test. */
function chartHitLayer(): HTMLElement {
  const layer = document.querySelector<HTMLElement>('div[style*="position: absolute"]');
  expect(layer).not.toBeNull();
  return layer!;
}

function drawerIsOpen(): boolean {
  return [...document.querySelectorAll('button')].some((b) => b.textContent === 'PLACE BET');
}

describe('market chart hit-layer', () => {
  let teardown: () => void;

  beforeEach(async () => {
    session.setUser({
      id: 'u1', username: 'tester', is_guest: false, balance_cents: 100_000,
      total_lost_cents: 0, bets_count: 0, has_won: false,
    });
    teardown = mountMarketPanel(() => {}, noopEffects);
    await flush();
  });

  afterEach(() => {
    teardown();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('opens the betting drawer when the chart is clicked', () => {
    expect(drawerIsOpen()).toBe(false);

    chartHitLayer().dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(drawerIsOpen()).toBe(true);
  });

  it('collapses the drawer on a second chart click, same as the header', () => {
    const layer = chartHitLayer();
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(drawerIsOpen()).toBe(true);

    layer.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(drawerIsOpen()).toBe(false);
  });

  it('does not let a mousedown inside the panel reach window', () => {
    const onWindowDown = vi.fn();
    window.addEventListener('mousedown', onWindowDown);

    chartHitLayer().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onWindowDown).not.toHaveBeenCalled();

    window.removeEventListener('mousedown', onWindowDown);
  });
});
