/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    env: { VITE_API_BASE: 'http://test.local/api/v1' },
  },
});
