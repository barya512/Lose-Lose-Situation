import { describe, it, expect } from 'vitest';

describe('scaffold smoke', () => {
  it('exposes VITE_API_BASE from test env', () => {
    expect(import.meta.env.VITE_API_BASE).toBe('http://test.local/api/v1');
  });
});
