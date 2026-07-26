export interface User {
  id: string;
  username: string | null;
  is_guest: boolean;
  balance_cents: number;
  total_lost_cents: number;
  bets_count: number;
  has_won: boolean;
  /**
   * Cents per second the wallet bleeds from PASSIVE_DRAIN items. The server
   * settles this lazily, so the client interpolates against it between polls
   * (see Session.displayBalanceCents). Absent on older snapshots.
   */
  drain_rate_cents_per_s?: number;
  /** Inventory as returned by GET /me; absent on auth responses. */
  inventory?: InventoryItem[];
}

export interface InventoryItem {
  item_key: string;
  name: string;
  rarity: ItemRarity;
  effect_type: ItemEffect;
  magnitude: number;
  active: boolean;
}

export type ItemRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export type ItemEffect =
  | 'PASSIVE_DRAIN'
  | 'LOSS_MULT'
  | 'ANTI_LUCK'
  | 'STAKE_MULT'
  | 'WIN_DAMPEN';

export interface MarketItem {
  key: string;
  name: string;
  rarity: ItemRarity;
  effect_type: ItemEffect;
  magnitude: number;
  duration_s: number | null;
  art_key: string | null;
}

/** One market tile: the ticker, and what LOSING on it is worth. */
export interface Offer {
  symbol: string;
  name: string;
  kind: string;
  last_price: number | null;
  is_open: boolean;
  reward_item: MarketItem | null;
  reward_stake_gate_cents: number | null;
  pending_bet_id: string | null;
  chips_cents: number[];
}

export interface TokenResult {
  access_token: string;
  token_type: string;
  user: User;
}

export interface SlotSpinResult {
  status: 'WON' | 'LOST';
  payout_cents: number;
  result_detail: {
    game: string;
    reels: string[];
    payout_cents: number;
    net_cents: number;
  };
}

export interface BeerResult {
  cost_cents: number;
  balance_cents: number;
  total_lost_cents: number;
  has_won: boolean;
}

export interface SlotSymbolInfo {
  symbol: string;
  weight: number;
  three_of_a_kind_payout: number;
}

export interface SlotInfo {
  min_reels: number;
  max_reels: number;
  symbols: SlotSymbolInfo[];
  two_of_a_kind_payout: number;
  two_of_a_kind_disabled_reel_counts: number[];
}

export type MarketDirection = 'UP' | 'DOWN';

export interface MarketTicker {
  symbol: string;
  name: string;
  kind: string;
  last_price: number | null;
  is_open: boolean;
}

/**
 * VOID is a real status, not dead enum: the server refuses to settle a bet that
 * was still in flight when the run reached $0, since market stakes aren't
 * pre-charged and paying out would fund an already-won run.
 */
export type MarketBetStatus = 'PENDING' | 'WON' | 'LOST' | 'VOID';

export interface MarketBet {
  id: string;
  ticker: string | null;
  direction: string | null;
  stake_cents: number;
  timeframe_s: number | null;
  start_price: number | null;
  end_price: number | null;
  resolve_at: string | null;
  status: MarketBetStatus;
  penalty_cents: number;
  payout_cents: number;
  result_detail: Record<string, unknown> | null;
}
