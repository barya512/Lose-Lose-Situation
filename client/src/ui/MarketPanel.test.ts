import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { mountMarketPanel } from './MarketPanel';
import { session } from '../core/session';
import type { MarketTicker } from '../core/types';

// Seam 1 — chart clicks. Each ticker row embeds a TradingView mini-chart,
// which is a cross-origin iframe whose body links out to tradingview.com. A
// click inside it cannot be intercepted from this page, so the chart used to
// navigate the player out of the game. The fix is a transparent hit-layer over
// the chart; these tests pin that the layer toggles the betting drawer exactly
// like the symbol header, not that the chart itself does anything.
//
// Seam 2 — click-through (the one authForm.test.ts also covers). This is a DOM
// overlay above a live Phaser scene, and Phaser hit-tests window-level mouse
// events against whatever is behind. Chart clicks now reach `window` where the
// iframe used to swallow them, so the panel traps its own mouse events.
//
// Seam 3 — open-first ordering. Open markets float above closed ones, both
// within a section and across sections, and must keep doing so when an
// exchange opens or closes while the player is on the screen. The ordering is
// expressed as the CSS `order` property, never by moving nodes: re-parenting a
// row re-parents its iframe, which makes the browser reload the chart.

const state = vi.hoisted(() => ({ tickers: [] as unknown[] }));

vi.mock('../core/tradingview', () => ({
  mountMiniChart: () => () => {},
}));

vi.mock('../core/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    marketTickers: vi.fn(async () => state.tickers),
    marketBets: vi.fn(async () => []),
    marketPlaceBet: vi.fn(),
    getMe: vi.fn(),
  },
}));

function ticker(symbol: string, name: string, is_open: boolean): MarketTicker {
  return { symbol, name, kind: 'STOCK', last_price: 150, is_open };
}

const noopEffects = { onWon: () => {}, onLost: () => {} };
const TICKER_POLL_MS = 10_000; // mirrors MarketPanel's own constant

let teardown = (): void => {};

/** Mounts the panel against `tickers` and settles the initial async build. */
async function mountWith(tickers: MarketTicker[]): Promise<void> {
  state.tickers = tickers;
  teardown = mountMarketPanel(() => {}, noopEffects);
  await vi.advanceTimersByTimeAsync(0);
}

/** The transparent layer covering a chart — the thing seam 1 is about. */
function chartHitLayer(): HTMLElement {
  const layer = document.querySelector<HTMLElement>('div[style*="position: absolute"]');
  expect(layer).not.toBeNull();
  return layer!;
}

function drawerIsOpen(): boolean {
  return [...document.querySelectorAll('button')].some((b) => b.textContent === 'PLACE BET');
}

function findDiv(text: string): HTMLElement {
  const hit = [...document.querySelectorAll<HTMLElement>('div')]
    .find((d) => d.textContent === text && d.children.length === 0);
  expect(hit, `no leaf div with text "${text}"`).toBeTruthy();
  return hit!;
}

/** The row container for a ticker: its name label's grandparent (name → head → row). */
function rowFor(name: string, symbol: string): HTMLElement {
  return findDiv(`${name} (${symbol})`).parentElement!.parentElement!;
}

/** The section container for a heading: the heading's parent. */
function sectionFor(title: string): HTMLElement {
  return findDiv(title).parentElement!;
}

/**
 * What a flex column actually paints, top to bottom: ascending `order`, ties
 * broken by DOM position — the same rule the browser applies. Lets a test
 * assert the visible sequence instead of trusting individual `order` values.
 */
function paintedOrder(container: HTMLElement): HTMLElement[] {
  return [...container.children]
    .map((node, domIndex) => ({ node: node as HTMLElement, domIndex }))
    .sort((a, b) =>
      (Number(a.node.style.order || 0) - Number(b.node.style.order || 0)) || (a.domIndex - b.domIndex))
    .map(({ node }) => node);
}

/** Section headings, top to bottom as painted. */
function paintedSections(): string[] {
  const sectionsEl = sectionFor('CRYPTO').parentElement!;
  return paintedOrder(sectionsEl).map((s) => s.firstElementChild!.textContent!);
}

/** Ticker labels inside one section, top to bottom as painted. */
function paintedRows(title: string): string[] {
  const rowsEl = sectionFor(title).lastElementChild as HTMLElement;
  return paintedOrder(rowsEl).map((r) => r.firstElementChild!.firstElementChild!.textContent!);
}

describe('MarketPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    session.setUser({
      id: 'u1', username: 'tester', is_guest: false, balance_cents: 100_000,
      total_lost_cents: 0, bets_count: 0, has_won: false,
    });
  });

  afterEach(() => {
    teardown();
    teardown = () => {};
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('chart hit-layer', () => {
    beforeEach(async () => {
      await mountWith([ticker('AAPL', 'Apple', true)]);
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

  describe('open-first ordering', () => {
    it('floats open rows above closed ones inside a section', async () => {
      await mountWith([
        ticker('AAPL', 'Apple', false),
        ticker('MSFT', 'Microsoft', true),
      ]);

      expect(rowFor('Microsoft', 'MSFT').style.order).toBe('0');
      expect(rowFor('Apple', 'AAPL').style.order).toBe('1');
    });

    it('sinks a section with nothing open below one with an open symbol', async () => {
      // The night-time case: every stock shut, only crypto tradeable.
      await mountWith([
        ticker('AAPL', 'Apple', false),
        ticker('BTC-USD', 'Bitcoin', true),
      ]);

      expect(sectionFor('CRYPTO').style.order).toBe('0');
      expect(sectionFor('MAGNIFICENT 7').style.order).toBe('1');
      expect(sectionFor('INDEX ETFS').style.order).toBe('1'); // no symbols at all
    });

    it('keeps every open section above every closed one when several are open', async () => {
      // Mid-session on a weekday: US stocks trading, crypto always on, London
      // shut. Two sections open at once, one of them only partially.
      await mountWith([
        ticker('AAPL', 'Apple', true),
        ticker('MSFT', 'Microsoft', false),
        ticker('SPY', 'S&P 500 ETF', true),
        ticker('AZN.L', 'AstraZeneca', false),
        ticker('BTC-USD', 'Bitcoin', true),
        ticker('ETH-USD', 'Ethereum', true),
      ]);

      // Open sections keep their declared order among themselves, as do closed.
      expect(paintedSections()).toEqual([
        'MAGNIFICENT 7', 'INDEX ETFS', 'CRYPTO', 'INTERNATIONAL',
      ]);
      expect(paintedRows('MAGNIFICENT 7')).toEqual(['Apple (AAPL)', 'Microsoft (MSFT)']);
      expect(paintedRows('CRYPTO')).toEqual(['Bitcoin (BTC-USD)', 'Ethereum (ETH-USD)']);
    });

    it('handles every section being open, and every section being closed', async () => {
      const symbols: [string, string][] = [
        ['AAPL', 'Apple'], ['SPY', 'S&P 500 ETF'], ['AZN.L', 'AstraZeneca'], ['BTC-USD', 'Bitcoin'],
      ];
      const allOpen = symbols.map(([s, n]) => ticker(s, n, true));
      await mountWith(allOpen);

      const declared = ['MAGNIFICENT 7', 'INDEX ETFS', 'INTERNATIONAL', 'CRYPTO'];
      expect(paintedSections()).toEqual(declared);

      // Everything shuts: no section outranks another, so the declared order
      // survives rather than shuffling.
      state.tickers = symbols.map(([s, n]) => ticker(s, n, false));
      await vi.advanceTimersByTimeAsync(TICKER_POLL_MS);

      expect(paintedSections()).toEqual(declared);
    });

    it('re-sorts when an exchange closes while the player is on the screen', async () => {
      await mountWith([
        ticker('AAPL', 'Apple', true),
        ticker('BTC-USD', 'Bitcoin', true),
      ]);
      expect(sectionFor('MAGNIFICENT 7').style.order).toBe('0');
      expect(rowFor('Apple', 'AAPL').style.order).toBe('0');

      state.tickers = [ticker('AAPL', 'Apple', false), ticker('BTC-USD', 'Bitcoin', true)];
      await vi.advanceTimersByTimeAsync(TICKER_POLL_MS);

      expect(rowFor('Apple', 'AAPL').style.order).toBe('1');
      expect(sectionFor('MAGNIFICENT 7').style.order).toBe('1');
      expect(sectionFor('CRYPTO').style.order).toBe('0');
    });
  });
});
