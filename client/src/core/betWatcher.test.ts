import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BetWatcher } from './betWatcher';
import type { MarketBet } from './types';

// Seam: the market panel used to own the poll + status diff, so both died with
// the scene — settle juice only ever fired if you happened to be standing in
// the market. The watcher is scene-independent and rehydrates from storage, so
// a resolution is announced wherever you are, and exactly once.

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  } as Storage;
}

function bet(overrides: Partial<MarketBet> = {}): MarketBet {
  return {
    id: 'b1',
    ticker: 'BTC-USD',
    direction: 'UP',
    stake_cents: 5000,
    timeframe_s: 60,
    start_price: 100,
    end_price: null,
    resolve_at: new Date(Date.now() + 60_000).toISOString(),
    status: 'PENDING',
    penalty_cents: 0,
    payout_cents: 0,
    result_detail: null,
    ...overrides,
  };
}

describe('BetWatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces a resolution once, not on every subsequent poll', async () => {
    const bets = vi.fn().mockResolvedValue([bet({ status: 'LOST' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());
    const seen: string[] = [];
    w.onResolved((b) => seen.push(b.status));

    await w.poll();
    await w.poll();

    expect(seen).toEqual(['LOST']);
  });

  it('does not announce a bet that was already pending-then-resolved last session', async () => {
    // The old in-scene Map died on navigation, so a reload replayed the juice
    // for bets settled minutes ago. The storage-backed map must not.
    const storage = memoryStorage();
    const bets = vi.fn().mockResolvedValue([bet({ status: 'LOST' })]);

    const first = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, storage);
    await first.poll();

    const afterReload = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, storage);
    const seen: string[] = [];
    afterReload.onResolved((b) => seen.push(b.status));
    await afterReload.poll();

    expect(seen).toEqual([]);
  });

  it('announces a PENDING bet that later resolves', async () => {
    const bets = vi
      .fn()
      .mockResolvedValueOnce([bet()])
      .mockResolvedValueOnce([bet({ status: 'WON' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());
    const seen: string[] = [];
    w.onResolved((b) => seen.push(b.status));

    await w.poll();
    await w.poll();

    expect(seen).toEqual(['WON']);
  });

  it('refreshes the wallet when something resolves, and not otherwise', async () => {
    const refreshUser = vi.fn();
    const bets = vi
      .fn()
      .mockResolvedValueOnce([bet()])
      .mockResolvedValueOnce([bet()])
      .mockResolvedValueOnce([bet({ status: 'LOST' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser }, memoryStorage());

    await w.poll();
    await w.poll();
    expect(refreshUser).not.toHaveBeenCalled();

    await w.poll();
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });

  it('treats VOID as neutral: no juice, but still consumed', async () => {
    // A VOID bet is one the server refused to settle because the run was
    // already won. Announcing it would fire reward juice on the win screen.
    const bets = vi
      .fn()
      .mockResolvedValueOnce([bet()])
      .mockResolvedValueOnce([bet({ status: 'VOID' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());
    const seen: string[] = [];
    w.onResolved((b) => seen.push(b.status));

    await w.poll();
    await w.poll();

    expect(seen).toEqual([]);
  });

  it('polls fast when a bet is about to resolve and slow when it is not', async () => {
    const soon = vi.fn().mockResolvedValue([
      bet({ resolve_at: new Date(Date.now() + 5_000).toISOString() }),
    ]);
    const w = new BetWatcher({ listBets: soon, refreshUser: vi.fn() }, memoryStorage());
    await w.poll();
    expect(w.intervalMs).toBe(3_000);

    const later = vi.fn().mockResolvedValue([
      bet({ resolve_at: new Date(Date.now() + 600_000).toISOString() }),
    ]);
    const w2 = new BetWatcher({ listBets: later, refreshUser: vi.fn() }, memoryStorage());
    await w2.poll();
    expect(w2.intervalMs).toBe(30_000);
  });

  it('stops polling entirely when nothing is pending', async () => {
    const bets = vi.fn().mockResolvedValue([bet({ status: 'LOST' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());

    await w.poll();

    expect(w.intervalMs).toBeNull();
  });

  it('unsubscribing stops delivery', async () => {
    const bets = vi
      .fn()
      .mockResolvedValueOnce([bet()])
      .mockResolvedValueOnce([bet({ status: 'LOST' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());
    let calls = 0;
    const off = w.onResolved(() => { calls += 1; });
    await w.poll();
    off();
    await w.poll();

    expect(calls).toBe(0);
  });

  it('survives a failing poll without losing its subscribers', async () => {
    const bets = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([bet({ status: 'LOST' })]);
    const w = new BetWatcher({ listBets: bets, refreshUser: vi.fn() }, memoryStorage());
    const seen: string[] = [];
    w.onResolved((b) => seen.push(b.status));

    await w.poll();
    await w.poll();

    expect(seen).toEqual(['LOST']);
  });
});
