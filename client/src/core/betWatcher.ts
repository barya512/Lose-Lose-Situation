import type { MarketBet, User } from './types';

/**
 * Watches the player's market bets and announces resolutions, wherever they are.
 *
 * This used to live inside the market panel, which meant its poll and its status
 * diff were torn down on scene shutdown: place a bet, walk to the slots, and the
 * settle simply never announced itself. Docs described a "background poll
 * manager" as though it existed; this is it.
 *
 * Phaser-free on purpose — juice is applied by the subscriber, against whatever
 * scene happens to be live.
 */

const STORAGE_KEY = 'lose-lose.betWatcher';

/** Poll cadence when a bet is about to land — tight enough to feel immediate. */
const URGENT_MS = 3_000;
/** Cadence otherwise. A minute-long bet doesn't need 5s polling for 45s of it. */
const RELAXED_MS = 30_000;
/** How close to resolve_at counts as urgent. */
const URGENT_WINDOW_MS = 15_000;

type ResolvedCb = (bet: MarketBet) => void;

export interface BetWatcherDeps {
  listBets: () => Promise<MarketBet[]>;
  refreshUser: () => Promise<User | void> | void;
}

export class BetWatcher {
  private known = new Map<string, string>();
  private cbs = new Set<ResolvedCb>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _intervalMs: number | null = null;

  constructor(
    private deps: BetWatcherDeps,
    private storage: Storage = window.localStorage,
  ) {
    this.load();
  }

  /**
   * Current cadence, or null when nothing is pending and polling is idle.
   * Exposed so the pacing is observable rather than a hidden timer.
   */
  get intervalMs(): number | null {
    return this._intervalMs;
  }

  onResolved(cb: ResolvedCb): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  start(): void {
    if (this.timer === null) void this.tick();
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** One poll cycle. Public so tests drive it without leaning on timers. */
  async poll(): Promise<void> {
    let bets: MarketBet[];
    try {
      bets = await this.deps.listBets();
    } catch {
      // Offline or a blip: keep the subscriptions and the known-status map, and
      // try again on the next tick rather than tearing the watcher down.
      return;
    }

    const resolved: MarketBet[] = [];
    for (const bet of bets) {
      const previous = this.known.get(bet.id);
      this.known.set(bet.id, bet.status);
      if (bet.status === 'PENDING') continue;
      // Announce a transition we witnessed, and also a bet we have no record of
      // at all — that one resolved between placement and our first poll, which
      // is exactly the case worth announcing. Stay quiet only when we already
      // recorded it as settled, which is what stops a reload replaying juice
      // for bets finished in an earlier session.
      if (previous !== undefined && previous !== 'PENDING') continue;
      resolved.push(bet);
    }
    this.persist();

    if (resolved.length > 0) {
      await this.deps.refreshUser();
      // VOID is neutral: no delta, no item, so no juice. It still counts as
      // consumed above, which is why this filter is here and not earlier.
      for (const bet of resolved) {
        if (bet.status === 'VOID') continue;
        this.cbs.forEach((cb) => cb(bet));
      }
    }

    this._intervalMs = nextIntervalMs(bets);
  }

  private async tick(): Promise<void> {
    await this.poll();
    this.timer = null;
    if (this._intervalMs !== null) {
      this.timer = setTimeout(() => void this.tick(), this._intervalMs);
    }
  }

  private persist(): void {
    try {
      this.storage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this.known)),
      );
    } catch {
      // A full or unavailable storage costs us replay protection across a
      // reload, not correctness within this session.
    }
  }

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Record<string, string>;
      this.known = new Map(Object.entries(data));
    } catch {
      this.storage.removeItem(STORAGE_KEY);
    }
  }
}

/**
 * How long until the next poll: tight near a resolution, relaxed away from one,
 * idle when nothing is pending. GET /market/bets already returns resolve_at
 * ordered soonest-first, so this needs no extra endpoint.
 */
function nextIntervalMs(bets: MarketBet[]): number | null {
  const pending = bets.filter((b) => b.status === 'PENDING' && b.resolve_at);
  if (pending.length === 0) return null;
  const soonest = Math.min(
    ...pending.map((b) => new Date(b.resolve_at!).getTime() - Date.now()),
  );
  return soonest <= URGENT_WINDOW_MS ? URGENT_MS : RELAXED_MS;
}
