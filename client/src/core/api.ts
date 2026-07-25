import { session } from './session';
import type {
  BeerResult,
  MarketBet,
  MarketDirection,
  MarketTicker,
  SlotInfo,
  SlotSpinResult,
  TokenResult,
  User,
} from './types';

const BASE = import.meta.env.VITE_API_BASE;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST';
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = false } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network error');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail =
      (data && typeof data.detail === 'string' && data.detail) ||
      `request failed (${res.status})`;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

export const api = {
  authGuest: () => request<TokenResult>('/auth/guest', { method: 'POST' }),
  register: (username: string, password: string) =>
    request<TokenResult>('/auth/register', { method: 'POST', body: { username, password } }),
  login: (username: string, password: string) =>
    request<TokenResult>('/auth/login', { method: 'POST', body: { username, password } }),
  getMe: () => request<User>('/me', { auth: true }),
  slotsSpin: (stakeCents: number, reels: number) =>
    request<SlotSpinResult>('/casino/slots/spin', {
      method: 'POST',
      auth: true,
      body: { stake_cents: stakeCents, reels },
    }),
  slotsInfo: () => request<SlotInfo>('/casino/slots/info'),
  buyBeer: () => request<BeerResult>('/beer/buy', { method: 'POST', auth: true }),
  marketTickers: () => request<MarketTicker[]>('/market/tickers'),
  marketPlaceBet: (ticker: string, direction: MarketDirection, stakeCents: number, timeframeS: number) =>
    request<MarketBet>('/market/bets', {
      method: 'POST',
      auth: true,
      body: { ticker, direction, stake_cents: stakeCents, timeframe_s: timeframeS },
    }),
  marketBets: (status?: MarketBet['status']) =>
    request<MarketBet[]>(`/market/bets${status ? `?status=${status}` : ''}`, { auth: true }),
};
