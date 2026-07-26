import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mountMarketPanel } from './MarketPanel';
import { api } from '../core/api';
import { session } from '../core/session';
import type { Offer, User } from '../core/types';

// Seam: the mount function's behavioural invariants only — which controls are
// live, and that teardown leaves nothing behind. Nothing here asserts markup,
// copy or layout, all of which are meant to change freely.

vi.mock('../core/tradingview', () => ({ mountMiniChart: () => () => {} }));

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    symbol: 'BTC-USD',
    name: 'Bitcoin',
    kind: 'CRYPTO',
    last_price: 61_204,
    is_open: true,
    reward_item: null,
    reward_stake_gate_cents: null,
    pending_bet_id: null,
    chips_cents: [100, 1000, 5000, 10000],
    ...overrides,
  };
}

function user(balance: number): User {
  return {
    id: 'u1', username: null, is_guest: true,
    balance_cents: balance, total_lost_cents: 0, bets_count: 0, has_won: false,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('mountMarketPanel', () => {
  beforeEach(() => {
    session.setAuth({ access_token: 't', token_type: 'bearer', user: user(100_000) });
    vi.spyOn(api, 'marketBets').mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    session.clear();
    vi.restoreAllMocks();
  });

  function directionButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll('button')).filter((b) =>
      /UP|DOWN|ALL IN/.test(b.textContent ?? ''),
    );
  }

  it('keeps direction disabled until a chip is chosen, since direction commits', async () => {
    vi.spyOn(api, 'marketOffers').mockResolvedValue([offer()]);
    const teardown = mountMarketPanel(() => {});
    await flush();

    expect(directionButtons().every((b) => b.disabled)).toBe(true);

    const chip = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === '$10.00',
    )!;
    chip.click();

    expect(directionButtons().some((b) => !b.disabled)).toBe(true);
    teardown();
  });

  it('offers no live controls on a closed market', async () => {
    vi.spyOn(api, 'marketOffers').mockResolvedValue([offer({ is_open: false })]);
    const teardown = mountMarketPanel(() => {});
    await flush();

    const chip = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === '$10.00',
    )!;
    chip.click();

    expect(directionButtons().every((b) => b.disabled)).toBe(true);
    teardown();
  });

  it('relabels to ALL IN when the chosen chip exceeds the wallet', async () => {
    // The irreversible action has to describe itself at the moment of the
    // click, not be silently swapped for a smaller stake.
    session.setUser(user(4_300)); // $43
    vi.spyOn(api, 'marketOffers').mockResolvedValue([offer()]);
    const teardown = mountMarketPanel(() => {});
    await flush();

    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent === '$100.00')!
      .click();

    expect(directionButtons().every((b) => b.textContent?.startsWith('ALL IN'))).toBe(true);
    teardown();
  });

  it('never disables a chip, however poor the wallet', async () => {
    // Disabling would softlock a nearly-broke player out of the all-in, which
    // in this game is the correct play.
    session.setUser(user(50));
    vi.spyOn(api, 'marketOffers').mockResolvedValue([offer()]);
    const teardown = mountMarketPanel(() => {});
    await flush();

    const chips = Array.from(document.querySelectorAll('button')).filter((b) =>
      /^\$/.test(b.textContent ?? ''),
    );
    expect(chips.length).toBe(4);
    expect(chips.every((b) => !b.disabled)).toBe(true);
    teardown();
  });

  it('teardown removes everything it mounted', async () => {
    vi.spyOn(api, 'marketOffers').mockResolvedValue([offer()]);
    const before = document.body.childElementCount;
    const teardown = mountMarketPanel(() => {});
    await flush();

    teardown();

    expect(document.body.childElementCount).toBe(before);
  });
});
