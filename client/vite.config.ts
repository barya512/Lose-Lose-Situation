/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    // The shared `assets/` directory lives at the repo root, one level above this
    // Vite root. Imported binaries (PNG/MP3) reach it through the module graph,
    // which bypasses this check — but a `url()` inside styles/fonts.css is a
    // plain static request, and dev-server file serving is sandboxed to the Vite
    // root by default. Without this the webfonts 403 in dev (they build fine).
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    env: { VITE_API_BASE: 'http://test.local/api/v1' },
  },
});
