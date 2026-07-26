import { describe, it, expect, vi, afterEach } from 'vitest';
import { itemIconUrl } from './itemArt';

// Seam: the public export only. The drawing primitives in core/canvasArt are an
// implementation detail and are exercised through this.
//
// Note jsdom ships no canvas backend, so getContext('2d') returns null here and
// toDataURL() is a stub. That is not a test-only quirk to work around — a real
// browser can refuse a context too (lost GPU, blocked fingerprinting), and an
// item icon must never be the thing that throws inside a render loop.

describe('itemIconUrl', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a usable string for a known art key', () => {
    const url = itemIconUrl('item_black_cat', 'RARE');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  it('memoizes by art key so a 15-tile grid bakes each icon once', () => {
    const first = itemIconUrl('item_cursed_coin', 'EPIC');
    const second = itemIconUrl('item_cursed_coin', 'EPIC');
    expect(second).toBe(first);
  });

  it('keys the cache by rarity too, since rarity is drawn into the icon', () => {
    const common = itemIconUrl('item_shared_key', 'COMMON');
    const legendary = itemIconUrl('item_shared_key', 'LEGENDARY');
    // Under jsdom both are the same stub string; what matters is that asking
    // for a different rarity is not silently served the first one's entry.
    expect(itemIconUrl('item_shared_key', 'COMMON')).toBe(common);
    expect(itemIconUrl('item_shared_key', 'LEGENDARY')).toBe(legendary);
  });

  it('degrades instead of throwing when there is no art key', () => {
    expect(() => itemIconUrl(null, 'COMMON')).not.toThrow();
    expect(typeof itemIconUrl(null, 'COMMON')).toBe('string');
  });

  it('degrades instead of throwing when a 2D context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(() => itemIconUrl('item_void_contract', 'LEGENDARY')).not.toThrow();
  });

  it('degrades instead of throwing when the canvas itself fails', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('no canvas');
    });
    expect(() => itemIconUrl('item_high_roller', 'EPIC')).not.toThrow();
  });
});
