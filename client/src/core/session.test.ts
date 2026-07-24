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
