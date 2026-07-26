import type { BeerResult, TokenResult, User } from './types';

const STORAGE_KEY = 'lose-lose.session';

/**
 * How often a draining wallet repaints. 10Hz reads as continuous without
 * asking the server for anything — the number is derived locally from the
 * rate, and only corrected when a real snapshot arrives.
 */
const DRAIN_TICK_MS = 100;

interface Persisted {
  token: string;
  user: User;
  startingBalance: number;
}

type UserCb = (user: User) => void;

export class Session {
  private _token: string | null = null;
  private _user: User | null = null;
  private _startingBalance: number | null = null;
  private _wonFired = false;
  private changeCbs = new Set<UserCb>();
  private winCbs = new Set<UserCb>();
  /** When the current balance snapshot was taken, by the injected clock. */
  private _balanceAt = 0;
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private storage: Storage = window.localStorage,
    private now: () => number = () => Date.now(),
  ) {
    this.load();
    this._balanceAt = this.now();
  }

  get token(): string | null { return this._token; }
  get user(): User | null { return this._user; }
  get startingBalance(): number | null { return this._startingBalance; }

  setAuth(result: TokenResult): void {
    this._token = result.access_token;
    this._startingBalance = result.user.balance_cents;
    this._wonFired = false;
    this.setUser(result.user);
  }

  setUser(user: User): void {
    this._user = user;
    // Every server snapshot re-anchors the interpolation, so client-side drift
    // can never accumulate past one poll interval.
    this._balanceAt = this.now();
    if (this._startingBalance === null) this._startingBalance = user.balance_cents;
    this.persist();
    this.syncDrainTimer();
    this.changeCbs.forEach((cb) => cb(user));
    if (user.has_won && !this._wonFired) {
      this._wonFired = true;
      this.winCbs.forEach((cb) => cb(user));
    }
  }

  /**
   * Fold an authoritative BeerResult into the current user. The server already
   * computed the new balance/total-lost/win-flag, so we merge them onto the
   * existing user rather than re-fetching — reusing setUser so the HUD update
   * and the $0 win-gate fire through the single source of truth.
   */
  applyBeerResult(result: BeerResult): void {
    if (!this._user) return;
    this.setUser({
      ...this._user,
      balance_cents: result.balance_cents,
      total_lost_cents: result.total_lost_cents,
      has_won: result.has_won,
    });
  }

  clear(): void {
    this._token = null;
    this._user = null;
    this._startingBalance = null;
    this._wonFired = false;
    if (this.drainTimer !== null) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    this.storage.removeItem(STORAGE_KEY);
  }

  /**
   * The balance to PUT ON SCREEN: the last server snapshot, minus whatever the
   * passive drain has bled since it arrived.
   *
   * The server settles the drain lazily (only when a request already has the
   * user loaded), so between polls the stored balance is stale by design. This
   * interpolates over that gap so the wallet visibly melts. It never goes below
   * zero — reaching $0 is the win, and the confirming fetch drives that gate.
   */
  get displayBalanceCents(): number {
    if (!this._user) return 0;
    const rate = this._user.drain_rate_cents_per_s ?? 0;
    if (rate <= 0) return this._user.balance_cents;
    const elapsedS = Math.max(0, (this.now() - this._balanceAt) / 1000);
    return Math.max(0, this._user.balance_cents - Math.floor(rate * elapsedS));
  }

  /**
   * Run `cb` on every drain tick while a drain is active. Returns an
   * unsubscribe. Separate from onChange so the HUD can tell a smooth drain tick
   * from a discrete wager and skip its 400ms tween on the former.
   */
  private syncDrainTimer(): void {
    const rate = this._user?.drain_rate_cents_per_s ?? 0;
    if (rate > 0 && this.drainTimer === null) {
      this.drainTimer = setInterval(() => {
        if (this._user) this.changeCbs.forEach((cb) => cb(this._user!));
      }, DRAIN_TICK_MS);
    } else if (rate <= 0 && this.drainTimer !== null) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  progressToZero(): number {
    if (!this._user || !this._startingBalance) return 0;
    // Reads the interpolated balance so the bar creeps with the drain rather
    // than jumping a poll at a time.
    const p = 1 - this.displayBalanceCents / this._startingBalance;
    return Math.min(1, Math.max(0, p));
  }

  onChange(cb: UserCb): () => void {
    this.changeCbs.add(cb);
    return () => this.changeCbs.delete(cb);
  }

  onWin(cb: UserCb): () => void {
    this.winCbs.add(cb);
    return () => this.winCbs.delete(cb);
  }

  private persist(): void {
    if (!this._token || !this._user || this._startingBalance === null) return;
    const data: Persisted = {
      token: this._token,
      user: this._user,
      startingBalance: this._startingBalance,
    };
    this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Persisted;
      if (!data.token || !data.user || typeof data.startingBalance !== 'number') {
        this.storage.removeItem(STORAGE_KEY);
        return;
      }
      this._token = data.token;
      this._user = data.user;
      this._startingBalance = data.startingBalance;
      this._wonFired = data.user.has_won;
    } catch {
      this.storage.removeItem(STORAGE_KEY);
    }
  }
}

export const session = new Session();
