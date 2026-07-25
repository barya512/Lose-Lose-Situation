import type { BeerResult, TokenResult, User } from './types';

const STORAGE_KEY = 'lose-lose.session';

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

  constructor(private storage: Storage = window.localStorage) {
    this.load();
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
    if (this._startingBalance === null) this._startingBalance = user.balance_cents;
    this.persist();
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
    this.storage.removeItem(STORAGE_KEY);
  }

  progressToZero(): number {
    if (!this._user || !this._startingBalance) return 0;
    const p = 1 - this._user.balance_cents / this._startingBalance;
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
