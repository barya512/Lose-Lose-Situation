import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from './session';
import type { TokenResult, User } from './types';

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

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', username: null, is_guest: true,
    balance_cents: 100000, total_lost_cents: 0, bets_count: 0, has_won: false,
    ...overrides,
  };
}

function tokenResult(overrides: Partial<User> = {}): TokenResult {
  return { access_token: 'tok', token_type: 'bearer', user: user(overrides) };
}

describe('Session', () => {
  let s: Session;
  beforeEach(() => { s = new Session(memoryStorage()); });

  it('stores token and user on setAuth', () => {
    s.setAuth(tokenResult());
    expect(s.token).toBe('tok');
    expect(s.user?.balance_cents).toBe(100000);
  });

  it('captures starting balance from the first snapshot', () => {
    s.setAuth(tokenResult({ balance_cents: 80000 }));
    s.setUser(user({ balance_cents: 50000 }));
    expect(s.startingBalance).toBe(80000);
  });

  it('persists across a reload', () => {
    const storage = memoryStorage();
    const a = new Session(storage);
    a.setAuth(tokenResult({ balance_cents: 90000 }));
    const b = new Session(storage);
    expect(b.token).toBe('tok');
    expect(b.user?.balance_cents).toBe(90000);
    expect(b.startingBalance).toBe(90000);
  });

  it('fires onChange when the user changes', () => {
    s.setAuth(tokenResult());
    let seen = -1;
    s.onChange((u) => { seen = u.balance_cents; });
    s.setUser(user({ balance_cents: 42000 }));
    expect(seen).toBe(42000);
  });

  it('progressToZero grows as balance approaches 0', () => {
    s.setAuth(tokenResult({ balance_cents: 100000 }));
    expect(s.progressToZero()).toBeCloseTo(0);
    s.setUser(user({ balance_cents: 25000 }));
    expect(s.progressToZero()).toBeCloseTo(0.75);
    s.setUser(user({ balance_cents: 0, has_won: true }));
    expect(s.progressToZero()).toBeCloseTo(1);
  });

  it('fires onWin exactly once when has_won flips true', () => {
    s.setAuth(tokenResult());
    let wins = 0;
    s.onWin(() => { wins += 1; });
    s.setUser(user({ balance_cents: 0, has_won: true }));
    s.setUser(user({ balance_cents: 0, has_won: true }));
    expect(wins).toBe(1);
  });

  it('applyBeerResult merges the new balance and fires onChange', () => {
    s.setAuth(tokenResult({ balance_cents: 100000 }));
    let seen = -1;
    s.onChange((u) => { seen = u.balance_cents; });
    s.applyBeerResult({ cost_cents: 100, balance_cents: 99900,
      total_lost_cents: 100, has_won: false });
    expect(s.user?.balance_cents).toBe(99900);
    expect(s.user?.total_lost_cents).toBe(100);
    expect(seen).toBe(99900);
  });

  it('applyBeerResult preserves unrelated user fields', () => {
    s.setAuth(tokenResult({ username: 'ava', is_guest: false, bets_count: 7 }));
    s.applyBeerResult({ cost_cents: 100, balance_cents: 50000,
      total_lost_cents: 200, has_won: false });
    expect(s.user?.username).toBe('ava');
    expect(s.user?.is_guest).toBe(false);
    expect(s.user?.bets_count).toBe(7);
  });

  it('applyBeerResult fires onWin when the beer drains the wallet to $0', () => {
    s.setAuth(tokenResult({ balance_cents: 100 }));
    let wins = 0;
    s.onWin(() => { wins += 1; });
    s.applyBeerResult({ cost_cents: 100, balance_cents: 0,
      total_lost_cents: 100000, has_won: true });
    expect(wins).toBe(1);
  });

  it('onChange returns a working unsubscribe', () => {
    s.setAuth(tokenResult());
    let calls = 0;
    const unsubscribe = s.onChange(() => { calls += 1; });
    unsubscribe();
    s.setUser(user({ balance_cents: 42000 }));
    expect(calls).toBe(0);
  });

  it('onWin returns a working unsubscribe', () => {
    s.setAuth(tokenResult());
    let calls = 0;
    const unsubscribe = s.onWin(() => { calls += 1; });
    unsubscribe();
    s.setUser(user({ balance_cents: 0, has_won: true }));
    expect(calls).toBe(0);
  });

  it('clear wipes token, user and storage', () => {
    const storage = memoryStorage();
    const a = new Session(storage);
    a.setAuth(tokenResult());
    a.clear();
    expect(a.token).toBeNull();
    expect(a.user).toBeNull();

    const b = new Session(storage);
    expect(b.token).toBeNull();
    expect(b.user).toBeNull();
  });
});

describe('Session passive drain', () => {
  // The wallet bleeds continuously but the server only writes on request
  // boundaries, so the client interpolates against a rate + anchor. These pin
  // the arithmetic that makes the on-screen number honest between polls.
  function drainingUser(rate: number): User {
    return user({ balance_cents: 10_000, drain_rate_cents_per_s: rate });
  }

  it('reports the plain balance when nothing is draining', () => {
    const s = new Session(memoryStorage(), () => 1_000);
    s.setAuth(tokenResult());
    s.setUser(drainingUser(0));
    expect(s.displayBalanceCents).toBe(10_000);
  });

  it('interpolates the balance down at the drain rate', () => {
    let now = 1_000;
    const s = new Session(memoryStorage(), () => now);
    s.setAuth(tokenResult());
    s.setUser(drainingUser(100));

    now = 11_000; // ten seconds later
    expect(s.displayBalanceCents).toBe(9_000);
  });

  it('never interpolates below zero', () => {
    let now = 1_000;
    const s = new Session(memoryStorage(), () => now);
    s.setAuth(tokenResult());
    s.setUser(drainingUser(100));

    now = 1_000_000;
    expect(s.displayBalanceCents).toBe(0);
  });

  it('re-anchors on every server snapshot so drift cannot accumulate', () => {
    let now = 1_000;
    const s = new Session(memoryStorage(), () => now);
    s.setAuth(tokenResult());
    s.setUser(drainingUser(100));

    now = 11_000;
    // A fresh snapshot is authoritative: interpolation restarts from it.
    s.setUser(user({ balance_cents: 9_500, drain_rate_cents_per_s: 100 }));
    expect(s.displayBalanceCents).toBe(9_500);

    now = 16_000;
    expect(s.displayBalanceCents).toBe(9_000);
  });
});
