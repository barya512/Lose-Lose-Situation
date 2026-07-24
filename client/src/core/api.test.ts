import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { api, ApiError } from './api';
import { session } from './session';

const BASE = 'http://test.local/api/v1';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api', () => {
  beforeEach(() => { session.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('POSTs /auth/guest with no auth header and returns the token result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ access_token: 't', token_type: 'bearer',
        user: { id: 'u', username: null, is_guest: true, balance_cents: 100000,
                total_lost_cents: 0, bets_count: 0, has_won: false } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await api.authGuest();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/auth/guest`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBeUndefined();
    expect(res.access_token).toBe('t');
  });

  it('injects the bearer token on authed calls', async () => {
    session.setAuth({ access_token: 'abc', token_type: 'bearer',
      user: { id: 'u', username: null, is_guest: true, balance_cents: 100000,
              total_lost_cents: 0, bets_count: 0, has_won: false } });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ status: 'LOST', payout_cents: 0,
        result_detail: { game: 'slots', reels: ['CHERRY','LEMON','BELL'],
          payout_cents: 0, net_cents: -1000 } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.slotsSpin(1000, 3);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/casino/slots/spin`);
    expect(init.headers.Authorization).toBe('Bearer abc');
    expect(JSON.parse(init.body)).toEqual({ stake_cents: 1000, reels: 3 });
  });

  it('throws ApiError with status and parsed detail on non-2xx', async () => {
    // mockImplementation (not mockResolvedValue) so each call gets a fresh
    // Response — a Response body can only be read once, and this test
    // invokes the mocked fetch twice.
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ detail: 'stake exceeds balance' }, 400)),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.slotsSpin(999999, 3)).rejects.toMatchObject({
      status: 400,
      message: 'stake exceeds balance',
    });
    await expect(api.slotsSpin(999999, 3)).rejects.toBeInstanceOf(ApiError);
  });
});
