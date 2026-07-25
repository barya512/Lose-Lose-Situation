export interface User {
  id: string;
  username: string | null;
  is_guest: boolean;
  balance_cents: number;
  total_lost_cents: number;
  bets_count: number;
  has_won: boolean;
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
