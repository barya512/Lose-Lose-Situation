# Client Scaffold + Slots Slice — Implementation Plan

> **Archived.** Every task below was executed; the checkboxes are a historical
> record, **not work to pick up**. The living reference for the client is
> [client-architecture.md](../client-architecture.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a `/client` (Vite + Phaser 3 + TypeScript) and ship a
submittable, fully-juiced inverted **slots** vertical slice against the hosted
FastAPI backend.

**Architecture:** A thin core (`api`, `session`) holds all non-visual logic and
is unit-tested with Vitest. A placeholder-only asset/audio/juice toolkit feeds a
handful of Phaser scenes (Boot → Title → Menu → Slots, with a module-agnostic
Win gate). The wallet is server-authoritative: after every spin the client
re-reads `GET /me`; the win condition ($0) is detected once, centrally, in
`session` and launches `WinScene` over any active scene.

**Tech Stack:** Vite 6, Phaser 3.90, TypeScript 5 (strict), Vitest 2 (jsdom).

## Global Constraints

- **Money is integer cents everywhere.** Never store or compute balances as
  dollars/floats. Format to dollars only at render time.
- **Inverted theme.** `status: "LOST"` / `payout_cents == 0` is the *good,
  celebrated* outcome; `status: "WON"` / `payout_cents > 0` is *bad, punished*.
  Reaching `balance_cents == 0` **wins the game**.
- **No raw primitives as art in scenes.** Every visual resolves through an
  `assets.ts` manifest key so real art swaps in by flipping one entry.
- **Backend base URL** comes only from `import.meta.env.VITE_API_BASE`
  (dev = `http://localhost:8000/api/v1`). Never hardcode a URL in a scene.
- **Auth is JWT bearer** in the `Authorization` header; no cookies.
- **itch-ready build:** `vite.config.ts` must set `base: './'` so `dist/` runs
  from a zip root.
- **Backend dev prerequisite:** the backend's `CORS_ORIGINS` must include
  `http://localhost:5173`. This is a `.env` setting on the backend, not a code
  change here.

Spec: [2026-07-24-client-scaffold-slots-design.md](2026-07-24-client-scaffold-slots-design.md).

---

### Task 1: Project scaffold + Vitest + blank boot

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/.env.development`
- Create: `client/.env.production`
- Create: `client/.gitignore`
- Create: `client/src/main.ts`
- Create: `client/src/scenes/BootScene.ts`
- Create: `client/src/vite-env.d.ts`
- Create: `client/src/core/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a runnable Vite app registering a Phaser game with a `Boot` scene;
  `npm run test` wired to Vitest (jsdom); `import.meta.env.VITE_API_BASE`
  available and typed.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "lose-lose-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "phaser": "^3.90.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `client/vite.config.ts`**

```ts
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
```

- [ ] **Step 4: Create `client/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 5: Create `client/.env.development`, `.env.production`, `.gitignore`**

`.env.development`:
```
VITE_API_BASE=http://localhost:8000/api/v1
```
`.env.production`:
```
VITE_API_BASE=https://REPLACE-WITH-RENDER-URL/api/v1
```
`.gitignore`:
```
node_modules
dist
*.local
```

- [ ] **Step 6: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lose-Lose Situation</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0a0410; overflow: hidden; }
      #game { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `client/src/scenes/BootScene.ts`** (stub for now)

```ts
import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'LOSE-LOSE', {
        fontSize: '48px',
        color: '#ff3ea5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }
}
```

- [ ] **Step 8: Create `client/src/main.ts`**

```ts
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0410',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene],
});
```

- [ ] **Step 9: Create `client/src/core/smoke.test.ts`** (proves Vitest + env wiring)

```ts
import { describe, it, expect } from 'vitest';

describe('scaffold smoke', () => {
  it('exposes VITE_API_BASE from test env', () => {
    expect(import.meta.env.VITE_API_BASE).toBe('http://test.local/api/v1');
  });
});
```

- [ ] **Step 10: Install and verify test + dev**

Run:
```bash
cd client && npm install && npm run test
```
Expected: Vitest runs, `scaffold smoke` passes (1 passed).

Then run `npm run dev` briefly; expected: Vite serves on `localhost:5173`, page
shows the pink "LOSE-LOSE" text centered. Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add client
git commit -m "feat(client): scaffold Vite + Phaser 3 + TS + Vitest boot"
```

---

### Task 2: `session.ts` — token + wallet store + centralized win gate

**Files:**
- Create: `client/src/core/types.ts`
- Create: `client/src/core/session.ts`
- Test: `client/src/core/session.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `types.ts`: `User`, `TokenResult`, `SlotSpinResult` interfaces (below).
  - `session.ts`: exported `Session` class and singleton `session`. Public
    surface: `setAuth(result: TokenResult): void`, `setUser(user: User): void`,
    `clear(): void`, getters `token: string | null`, `user: User | null`,
    `startingBalance: number | null`; `progressToZero(): number` (0..1);
    `onChange(cb: (u: User) => void): () => void` (returns unsubscribe);
    `onWin(cb: (u: User) => void): () => void` (fires once when `has_won`).

- [ ] **Step 1: Create `client/src/core/types.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test `client/src/core/session.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from './session';
import type { TokenResult, User } from './types';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  } as Storage;
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1', username: null, is_guest: true,
    balance_cents: 100000, total_lost_cents: 0, bets_count: 0, has_won: false,
    ...overrides,
  };
}

function tokenResult(overrides: Partial<User> = {}): TokenResult {
  return { access_token: 'tok', token_type: 'bearer', user: user(overrides) };
}

describe('Session', () => {
  let s: Session;
  beforeEach(() => { s = new Session(memoryStorage()); });

  it('stores token and user on setAuth', () => {
    s.setAuth(tokenResult());
    expect(s.token).toBe('tok');
    expect(s.user?.balance_cents).toBe(100000);
  });

  it('captures starting balance from the first snapshot', () => {
    s.setAuth(tokenResult({ balance_cents: 80000 }));
    s.setUser(user({ balance_cents: 50000 }));
    expect(s.startingBalance).toBe(80000);
  });

  it('persists across a reload', () => {
    const storage = memoryStorage();
    const a = new Session(storage);
    a.setAuth(tokenResult({ balance_cents: 90000 }));
    const b = new Session(storage);
    expect(b.token).toBe('tok');
    expect(b.user?.balance_cents).toBe(90000);
    expect(b.startingBalance).toBe(90000);
  });

  it('fires onChange when the user changes', () => {
    s.setAuth(tokenResult());
    let seen = -1;
    s.onChange((u) => { seen = u.balance_cents; });
    s.setUser(user({ balance_cents: 42000 }));
    expect(seen).toBe(42000);
  });

  it('progressToZero grows as balance approaches 0', () => {
    s.setAuth(tokenResult({ balance_cents: 100000 }));
    expect(s.progressToZero()).toBeCloseTo(0);
    s.setUser(user({ balance_cents: 25000 }));
    expect(s.progressToZero()).toBeCloseTo(0.75);
    s.setUser(user({ balance_cents: 0, has_won: true }));
    expect(s.progressToZero()).toBeCloseTo(1);
  });

  it('fires onWin exactly once when has_won flips true', () => {
    s.setAuth(tokenResult());
    let wins = 0;
    s.onWin(() => { wins += 1; });
    s.setUser(user({ balance_cents: 0, has_won: true }));
    s.setUser(user({ balance_cents: 0, has_won: true }));
    expect(wins).toBe(1);
  });

  it('clear wipes token, user and storage', () => {
    s.setAuth(tokenResult());
    s.clear();
    expect(s.token).toBeNull();
    expect(s.user).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && npx vitest run src/core/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 4: Create `client/src/core/session.ts`**

```ts
import type { TokenResult, User } from './types';

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
    this.persist();
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/core/session.test.ts`
Expected: PASS (7 passed).

- [ ] **Step 6: Commit**

```bash
git add client/src/core/types.ts client/src/core/session.ts client/src/core/session.test.ts
git commit -m "feat(client): session store with persistence and central win gate"
```

---

### Task 3: `api.ts` — typed fetch wrapper + `ApiError`

**Files:**
- Create: `client/src/core/api.ts`
- Test: `client/src/core/api.test.ts`

**Interfaces:**
- Consumes: `session` (for the bearer token) and `types.ts`
  (`User`, `TokenResult`, `SlotSpinResult`).
- Produces: exported `ApiError extends Error` with a numeric `status`; exported
  `api` object with `authGuest(): Promise<TokenResult>`,
  `register(username, password): Promise<TokenResult>`,
  `login(username, password): Promise<TokenResult>`,
  `getMe(): Promise<User>`,
  `slotsSpin(stakeCents: number, reels: number): Promise<SlotSpinResult>`.

- [ ] **Step 1: Write the failing test `client/src/core/api.test.ts`**

```ts
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
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ detail: 'stake exceeds balance' }, 400),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.slotsSpin(999999, 3)).rejects.toMatchObject({
      status: 400,
      message: 'stake exceeds balance',
    });
    await expect(api.slotsSpin(999999, 3)).rejects.toBeInstanceOf(ApiError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run src/core/api.test.ts`
Expected: FAIL — cannot find module `./api`.

- [ ] **Step 3: Create `client/src/core/api.ts`**

```ts
import { session } from './session';
import type { SlotSpinResult, TokenResult, User } from './types';

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
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/core/api.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full suite**

Run: `cd client && npm run test`
Expected: PASS — smoke + session + api (all green).

- [ ] **Step 6: Commit**

```bash
git add client/src/core/api.ts client/src/core/api.test.ts
git commit -m "feat(client): typed API client with bearer auth and ApiError"
```

---

### Task 4: `assets.ts` manifest + BootScene bakes placeholders

**Files:**
- Create: `client/src/core/assets.ts`
- Modify: `client/src/scenes/BootScene.ts`
- Create: `client/src/scenes/TitleScene.ts` (stub, so Boot has a target)
- Modify: `client/src/main.ts` (register Title)

**Interfaces:**
- Consumes: nothing from earlier tasks (Phaser only).
- Produces:
  - `assets.ts`: `SLOT_SYMBOLS` (readonly tuple) and `SlotSymbol` type;
    `symbolTextureKey(s: SlotSymbol): string`;
    `symbolStyle(s: SlotSymbol): { color: number; glyph: string }`;
    texture-key constants `TEX.button`, `TEX.panel`, `TEX.coin`, `TEX.glitch`;
    `bakeAll(scene: Phaser.Scene): void`.
  - `BootScene` transitions to `Title` after baking.

- [ ] **Step 1: Create `client/src/core/assets.ts`**

```ts
import Phaser from 'phaser';

export const SLOT_SYMBOLS = ['CHERRY', 'LEMON', 'BELL', 'STAR', 'SEVEN', 'SKULL'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

const SYMBOL_STYLE: Record<SlotSymbol, { color: number; glyph: string }> = {
  CHERRY: { color: 0xff4d6d, glyph: 'CH' },
  LEMON: { color: 0xffe066, glyph: 'LE' },
  BELL: { color: 0xffa94d, glyph: 'BE' },
  STAR: { color: 0x74c0fc, glyph: 'ST' },
  SEVEN: { color: 0xb197fc, glyph: '7' },
  SKULL: { color: 0xff3ea5, glyph: 'SK' },
};

export const TEX = {
  button: 'ui.button',
  panel: 'ui.panel',
  coin: 'particle.coin',
  glitch: 'particle.glitch',
} as const;

export function symbolTextureKey(s: SlotSymbol): string {
  return `slot.${s.toLowerCase()}`;
}

export function symbolStyle(s: SlotSymbol): { color: number; glyph: string } {
  return SYMBOL_STYLE[s];
}

function bakeRoundedTile(
  scene: Phaser.Scene, key: string, w: number, h: number, color: number,
): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1).fillRoundedRect(0, 0, w, h, Math.min(16, h / 6));
  g.lineStyle(4, 0xffffff, 0.35).strokeRoundedRect(2, 2, w - 4, h - 4, Math.min(16, h / 6));
  g.generateTexture(key, w, h);
  g.destroy();
}

function bakeCircle(scene: Phaser.Scene, key: string, r: number, color: number): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1).fillCircle(r, r, r);
  g.generateTexture(key, r * 2, r * 2);
  g.destroy();
}

export function bakeAll(scene: Phaser.Scene): void {
  for (const s of SLOT_SYMBOLS) {
    bakeRoundedTile(scene, symbolTextureKey(s), 128, 128, symbolStyle(s).color);
  }
  bakeRoundedTile(scene, TEX.button, 256, 72, 0x3a2456);
  bakeRoundedTile(scene, TEX.panel, 256, 256, 0x170a26);
  bakeCircle(scene, TEX.coin, 8, 0xffe066);
  bakeCircle(scene, TEX.glitch, 6, 0xff3ea5);
}
```

- [ ] **Step 2: Replace `client/src/scenes/BootScene.ts`**

```ts
import Phaser from 'phaser';
import { bakeAll } from '../core/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    bakeAll(this);
    this.scene.start('Title');
  }
}
```

- [ ] **Step 3: Create stub `client/src/scenes/TitleScene.ts`**

```ts
import Phaser from 'phaser';
import { symbolTextureKey } from '../core/assets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    // Temporary proof the manifest baked: show the SKULL tile.
    this.add.image(this.scale.width / 2, this.scale.height / 2, symbolTextureKey('SKULL'));
  }
}
```

- [ ] **Step 4: Update `client/src/main.ts` scene list**

Change the `scene` array to include Title:
```ts
import { TitleScene } from './scenes/TitleScene';
// ...
  scene: [BootScene, TitleScene],
```

- [ ] **Step 5: Verify build compiles**

Run: `cd client && npm run build`
Expected: `tsc --noEmit` passes and `vite build` writes `dist/`.

- [ ] **Step 6: Visual smoke check**

Run `npm run dev`; expected: after Boot, a pink rounded SKULL tile appears
centered (proves `bakeAll` ran and textures resolve by key). Stop the server.

- [ ] **Step 7: Commit**

```bash
git add client/src/core/assets.ts client/src/scenes/BootScene.ts client/src/scenes/TitleScene.ts client/src/main.ts
git commit -m "feat(client): asset manifest + placeholder baking in Boot"
```

---

### Task 5: `audio.ts` + `juice.ts` feedback toolkit

**Files:**
- Create: `client/src/core/audio.ts`
- Create: `client/src/core/juice.ts`

**Interfaces:**
- Consumes: `assets.ts` (`TEX.coin`, `TEX.glitch`).
- Produces:
  - `audio`: `{ playSpin(): void; playClick(): void; playLossReward(): void; playGainPunish(): void }`.
  - `juice`: `shake(scene, intensity?, durationMs?): void`;
    `flash(scene, color: number): void`;
    `coinBurst(scene, x, y): void`;
    `glitch(scene): void`.

- [ ] **Step 1: Create `client/src/core/audio.ts`**

```ts
// Placeholder audio: short WebAudio beeps. Inverted mapping lives here —
// losing money is rewarding, gaining money is punishing. Real SFX will replace
// these tone(...) calls without changing call sites.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.08): void {
  const context = ac();
  if (!context) return;
  const osc = context.createOscillator();
  const g = context.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g).connect(context.destination);
  const now = context.currentTime;
  osc.start(now);
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.stop(now + durationMs / 1000);
}

export const audio = {
  playClick(): void { tone(440, 60, 'square', 0.05); },
  playSpin(): void { tone(220, 120, 'sawtooth', 0.05); },
  // GOOD outcome (money lost): rising triumphant arpeggio.
  playLossReward(): void {
    tone(523, 90, 'triangle');
    setTimeout(() => tone(659, 90, 'triangle'), 90);
    setTimeout(() => tone(784, 140, 'triangle'), 180);
  },
  // BAD outcome (money gained): descending error buzz.
  playGainPunish(): void {
    tone(200, 160, 'sawtooth', 0.09);
    setTimeout(() => tone(150, 220, 'sawtooth', 0.09), 120);
  },
};
```

- [ ] **Step 2: Create `client/src/core/juice.ts`**

```ts
import Phaser from 'phaser';
import { TEX } from './assets';

export const juice = {
  shake(scene: Phaser.Scene, intensity = 0.012, durationMs = 250): void {
    scene.cameras.main.shake(durationMs, intensity);
  },

  flash(scene: Phaser.Scene, color: number): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    scene.cameras.main.flash(220, r, g, b);
  },

  coinBurst(scene: Phaser.Scene, x: number, y: number): void {
    const emitter = scene.add.particles(x, y, TEX.coin, {
      speed: { min: 200, max: 460 },
      angle: { min: 200, max: 340 },
      gravityY: 700,
      lifespan: 900,
      quantity: 24,
      scale: { start: 1.2, end: 0 },
      emitting: false,
    });
    emitter.explode(24);
    scene.time.delayedCall(1100, () => emitter.destroy());
  },

  glitch(scene: Phaser.Scene): void {
    const cam = scene.cameras.main;
    const emitter = scene.add.particles(scene.scale.width / 2, scene.scale.height / 2, TEX.glitch, {
      speed: { min: 100, max: 500 },
      lifespan: 400,
      quantity: 30,
      scaleX: { start: 3, end: 0 },
      scaleY: { start: 0.6, end: 0 },
      emitting: false,
    });
    emitter.explode(30);
    cam.shake(200, 0.02);
    scene.time.delayedCall(500, () => emitter.destroy());
  },
};
```

- [ ] **Step 3: Verify build compiles**

Run: `cd client && npm run build`
Expected: passes (no type errors).

- [ ] **Step 4: Commit**

```bash
git add client/src/core/audio.ts client/src/core/juice.ts
git commit -m "feat(client): audio + juice toolkit (inverted feedback)"
```

---

### Task 6: `Button` + `WalletHud` UI components

**Files:**
- Create: `client/src/ui/Button.ts`
- Create: `client/src/ui/WalletHud.ts`

**Interfaces:**
- Consumes: `assets.ts` (`TEX.button`, `TEX.panel`), `audio` (`playClick`),
  `session` (`onChange`, `user`, `startingBalance`, `progressToZero`),
  `types.ts` (`User`).
- Produces:
  - `Button` (extends `Phaser.GameObjects.Container`): constructor
    `(scene, x, y, label, onClick, opts?: { width?: number; height?: number })`;
    methods `setEnabled(enabled: boolean): this`,
    `setSelected(selected: boolean): this`.
  - `WalletHud` (extends `Phaser.GameObjects.Container`): constructor
    `(scene, x, y)`; auto-subscribes to `session.onChange` and tweens the
    balance; unsubscribes on `destroy`.

- [ ] **Step 1: Create `client/src/ui/Button.ts`**

```ts
import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';

interface ButtonOpts { width?: number; height?: number; }

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private enabled = true;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    label: string, onClick: () => void, opts: ButtonOpts = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 220;
    const h = opts.height ?? 64;

    this.bg = scene.add.image(0, 0, TEX.button).setDisplaySize(w, h);
    this.label = scene.add
      .text(0, 0, label, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);

    // Container needs an explicit, centred hit area (children are centred at 0,0).
    this.setSize(w, h);
    const hit = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
    this.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => { if (this.enabled && !this.selected) this.bg.setTint(0x9d7bd8); });
    this.on('pointerout', () => this.applyTint());
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      audio.playClick();
      this.setScale(0.96);
    });
    this.on('pointerup', () => {
      this.setScale(1);
      if (this.enabled) onClick();
    });

    scene.add.existing(this);
  }

  private selected = false;

  private applyTint(): void {
    if (this.selected) this.bg.setTint(0xff3ea5);
    else this.bg.clearTint();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.applyTint();
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }
}
```

- [ ] **Step 2: Create `client/src/ui/WalletHud.ts`**

```ts
import Phaser from 'phaser';
import { session } from '../core/session';
import type { User } from '../core/types';

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export class WalletHud extends Phaser.GameObjects.Container {
  private balanceText: Phaser.GameObjects.Text;
  private lostText: Phaser.GameObjects.Text;
  private barBg: Phaser.GameObjects.Rectangle;
  private barFill: Phaser.GameObjects.Rectangle;
  private displayedCents = 0;
  private unsubscribe: () => void;
  private readonly barWidth = 360;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.add(scene.add.text(0, -34, 'BALANCE', { fontSize: '16px', color: '#b197fc' }));
    this.balanceText = scene.add.text(0, -12, '$0.00', {
      fontSize: '40px', color: '#ffffff', fontStyle: 'bold',
    });
    this.lostText = scene.add.text(0, 34, 'lost so far: $0.00', {
      fontSize: '18px', color: '#74c0fc',
    });

    this.barBg = scene.add.rectangle(0, 70, this.barWidth, 14, 0x2a1640).setOrigin(0, 0.5);
    this.barFill = scene.add.rectangle(0, 70, 0, 14, 0x3ddc84).setOrigin(0, 0.5);
    this.add([this.balanceText, this.lostText, this.barBg, this.barFill]);

    scene.add.existing(this);

    this.unsubscribe = session.onChange((u) => this.render(u));
    if (session.user) {
      this.displayedCents = session.user.balance_cents;
      this.render(session.user);
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private render(user: User): void {
    this.lostText.setText(`lost so far: ${dollars(user.total_lost_cents)}`);
    this.barFill.width = this.barWidth * session.progressToZero();

    const from = this.displayedCents;
    const to = user.balance_cents;
    this.displayedCents = to;
    this.scene.tweens.addCounter({
      from, to, duration: 400, ease: 'Cubic.Out',
      onUpdate: (tw) => this.balanceText.setText(dollars(Math.round(tw.getValue()))),
    });
  }
}
```

- [ ] **Step 3: Verify build compiles**

Run: `cd client && npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add client/src/ui/Button.ts client/src/ui/WalletHud.ts
git commit -m "feat(client): Button + WalletHud components"
```

---

### Task 7: TitleScene + MenuScene (guest / login / register)

**Files:**
- Modify: `client/src/scenes/TitleScene.ts` (replace stub with real title card)
- Create: `client/src/scenes/MenuScene.ts`
- Create: `client/src/ui/authForm.ts` (DOM `<input>` overlay helper)
- Create: `client/src/scenes/SlotsScene.ts` (stub target for Menu)
- Modify: `client/src/main.ts` (register Menu + Slots)

**Interfaces:**
- Consumes: `Button`, `api` (`authGuest`, `login`, `register`), `session`
  (`setAuth`), `ApiError`.
- Produces:
  - `TitleScene`: any pointer/key → `Menu`.
  - `authForm.ts`: `showAuthForm(onSubmit: (username: string, password: string) => void): () => void`
    — appends centered DOM inputs + submit; returns a teardown fn that removes them.
  - `MenuScene`: guest/login/register flows that `session.setAuth(...)` then
    `this.scene.start('Slots')`.
  - `SlotsScene` stub (real in Task 8).

- [ ] **Step 1: Replace `client/src/scenes/TitleScene.ts`**

```ts
import Phaser from 'phaser';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.text(cx, 200, 'LOSE-LOSE SITUATION', {
      fontSize: '56px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 300, 'your curse is your fortune — lose it all.', {
      fontSize: '24px', color: '#b197fc',
    }).setOrigin(0.5);

    this.add.text(cx, 440, 'reach $0 to WIN.', {
      fontSize: '30px', color: '#3ddc84', fontStyle: 'bold',
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, 560, 'click anywhere to begin', {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    const go = () => this.scene.start('Menu');
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }
}
```

- [ ] **Step 2: Create `client/src/ui/authForm.ts`**

```ts
// Minimal DOM overlay for username/password entry over the Phaser canvas.
// Returns a teardown function that removes the overlay.
export function showAuthForm(
  title: string,
  onSubmit: (username: string, password: string) => void,
): () => void {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(10,4,16,0.85);z-index:10;font-family:sans-serif;';

  const card = document.createElement('div');
  card.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:280px;';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'color:#ff3ea5;font-size:24px;font-weight:bold;text-align:center;';

  const userInput = document.createElement('input');
  userInput.placeholder = 'username';
  const passInput = document.createElement('input');
  passInput.placeholder = 'password';
  passInput.type = 'password';
  for (const el of [userInput, passInput]) {
    el.style.cssText = 'padding:12px;font-size:16px;border-radius:8px;border:none;';
  }

  const submit = document.createElement('button');
  submit.textContent = 'GO';
  submit.style.cssText =
    'padding:12px;font-size:18px;font-weight:bold;border:none;border-radius:8px;' +
    'background:#3a2456;color:#fff;cursor:pointer;';

  const error = document.createElement('div');
  error.style.cssText = 'color:#ff6b6b;font-size:14px;min-height:18px;text-align:center;';

  const fire = () => onSubmit(userInput.value.trim(), passInput.value);
  submit.addEventListener('click', fire);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });

  card.append(heading, userInput, passInput, submit, error);
  wrap.append(card);
  document.body.append(wrap);
  userInput.focus();

  (wrap as any).__setError = (msg: string) => { error.textContent = msg; };
  return () => wrap.remove();
}
```

- [ ] **Step 3: Create `client/src/scenes/MenuScene.ts`**

```ts
import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { showAuthForm } from '../ui/authForm';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import type { TokenResult } from '../core/types';

export class MenuScene extends Phaser.Scene {
  private status?: Phaser.GameObjects.Text;

  constructor() {
    super('Menu');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.text(cx, 140, 'CHOOSE YOUR RUIN', {
      fontSize: '40px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    new Button(this, cx, 280, 'PLAY AS GUEST', () => this.guest(), { width: 320 });
    new Button(this, cx, 360, 'LOGIN', () => this.authForm('LOGIN', api.login), { width: 320 });
    new Button(this, cx, 440, 'REGISTER', () => this.authForm('REGISTER', api.register), { width: 320 });

    this.status = this.add.text(cx, 540, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);
  }

  private enter(result: TokenResult): void {
    session.setAuth(result);
    this.scene.start('Slots');
  }

  private async guest(): Promise<void> {
    this.status?.setText('dealing you in...');
    try {
      this.enter(await api.authGuest());
    } catch (e) {
      this.status?.setText(e instanceof ApiError ? e.message : 'connection failed');
    }
  }

  private authForm(
    title: string,
    call: (u: string, p: string) => Promise<TokenResult>,
  ): void {
    const teardown = showAuthForm(title, async (username, password) => {
      if (!username || !password) return;
      try {
        const result = await call(username, password);
        teardown();
        this.enter(result);
      } catch (e) {
        const msg = e instanceof ApiError
          ? (e.status === 409 ? 'username taken'
            : e.status === 401 ? 'wrong username or password'
            : e.message)
          : 'connection failed';
        this.status?.setText(msg);
      }
    });
  }
}
```

- [ ] **Step 4: Create stub `client/src/scenes/SlotsScene.ts`**

```ts
import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';

export class SlotsScene extends Phaser.Scene {
  constructor() {
    super('Slots');
  }

  create(): void {
    new WalletHud(this, 60, 80);
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'SLOTS (stub)', {
      fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
  }
}
```

- [ ] **Step 5: Update `client/src/main.ts` scene list**

```ts
import { MenuScene } from './scenes/MenuScene';
import { SlotsScene } from './scenes/SlotsScene';
// ...
  scene: [BootScene, TitleScene, MenuScene, SlotsScene],
```

- [ ] **Step 6: Verify build compiles**

Run: `cd client && npm run build`
Expected: passes.

- [ ] **Step 7: Manual smoke (needs backend up — see Task 10 for standup)**

With the backend running and `CORS_ORIGINS` including `http://localhost:5173`:
run `npm run dev`, click through Title → Menu → **PLAY AS GUEST**. Expected: lands
on the Slots stub with the WalletHud showing `$1,000.00`. Reload the page —
expected: session persists (still authed; Boot→Title, guest not required again is
NOT expected here since Menu always shows — that's fine). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add client/src/scenes/TitleScene.ts client/src/scenes/MenuScene.ts client/src/ui/authForm.ts client/src/scenes/SlotsScene.ts client/src/main.ts
git commit -m "feat(client): title card + auth menu (guest/login/register)"
```

---

### Task 8: SlotsScene — reels, stake chips, 3/5 toggle, spin + juice

**Files:**
- Modify: `client/src/scenes/SlotsScene.ts` (replace stub with the full scene)

**Interfaces:**
- Consumes: `WalletHud`, `Button`, `api` (`slotsSpin`, `getMe`), `ApiError`,
  `session` (`setUser`, `user`), `audio`, `juice`, `assets`
  (`SLOT_SYMBOLS`, `SlotSymbol`, `symbolTextureKey`, `symbolStyle`).
- Produces: the playable slots scene. No new exports.

- [ ] **Step 1: Replace `client/src/scenes/SlotsScene.ts`**

```ts
import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';
import { Button } from '../ui/Button';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { audio } from '../core/audio';
import { juice } from '../core/juice';
import { SLOT_SYMBOLS, symbolStyle, symbolTextureKey, type SlotSymbol } from '../core/assets';

const STAKE_CHIPS = [100, 1000, 5000, 10000]; // cents: $1 / $10 / $50 / $100
const REEL_SIZE = 128;
const REEL_GAP = 24;

export class SlotsScene extends Phaser.Scene {
  private stakeCents = 100;
  private reelCount = 3;
  private spinning = false;

  private reelSprites: Phaser.GameObjects.Image[] = [];
  private reelLabels: Phaser.GameObjects.Text[] = [];
  private chipButtons: { cents: number; btn: Button }[] = [];
  private countButtons: { count: number; btn: Button }[] = [];
  private spinButton!: Button;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Slots');
  }

  create(): void {
    const cx = this.scale.width / 2;
    new WalletHud(this, 60, 80);

    this.add.text(cx, 60, 'SLOTS', { fontSize: '36px', color: '#ff3ea5', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.buildReels();

    // Stake chips.
    this.add.text(cx, 420, 'STAKE', { fontSize: '18px', color: '#b197fc' }).setOrigin(0.5);
    STAKE_CHIPS.forEach((cents, i) => {
      const x = cx - 255 + i * 170;
      const btn = new Button(this, x, 470, `$${cents / 100}`, () => this.pickStake(cents), { width: 150 });
      this.chipButtons.push({ cents, btn });
    });

    // Reel-count toggle.
    this.add.text(cx, 540, 'REELS', { fontSize: '18px', color: '#b197fc' }).setOrigin(0.5);
    [3, 5].forEach((count, i) => {
      const btn = new Button(this, cx - 90 + i * 180, 585, String(count), () => this.pickCount(count), { width: 150 });
      this.countButtons.push({ count, btn });
    });

    this.spinButton = new Button(this, cx, 650, 'SPIN', () => this.spin(), { width: 260, height: 72 });
    this.toast = this.add.text(cx, 700, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);

    this.pickStake(this.stakeCents);
    this.pickCount(this.reelCount);
  }

  private buildReels(): void {
    this.reelSprites.forEach((s) => s.destroy());
    this.reelLabels.forEach((l) => l.destroy());
    this.reelSprites = [];
    this.reelLabels = [];

    const cx = this.scale.width / 2;
    const total = this.reelCount * REEL_SIZE + (this.reelCount - 1) * REEL_GAP;
    const startX = cx - total / 2 + REEL_SIZE / 2;
    const y = 280;

    for (let i = 0; i < this.reelCount; i++) {
      const x = startX + i * (REEL_SIZE + REEL_GAP);
      const sym = SLOT_SYMBOLS[i % SLOT_SYMBOLS.length];
      const img = this.add.image(x, y, symbolTextureKey(sym));
      const label = this.add
        .text(x, y, symbolStyle(sym).glyph, { fontSize: '44px', color: '#1a0a2e', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.reelSprites.push(img);
      this.reelLabels.push(label);
    }
  }

  private setReel(i: number, sym: SlotSymbol): void {
    this.reelSprites[i].setTexture(symbolTextureKey(sym));
    this.reelLabels[i].setText(symbolStyle(sym).glyph);
  }

  private pickStake(cents: number): void {
    this.stakeCents = cents;
    const balance = session.user?.balance_cents ?? 0;
    this.chipButtons.forEach(({ cents: c, btn }) => {
      btn.setSelected(c === cents);
      btn.setEnabled(c <= balance);
    });
  }

  private pickCount(count: number): void {
    if (this.spinning) return;
    this.reelCount = count;
    this.countButtons.forEach(({ count: c, btn }) => btn.setSelected(c === count));
    this.buildReels();
  }

  private setControls(enabled: boolean): void {
    if (!this.scene.isActive()) return; // scene may have handed off to Win
    this.spinButton.setEnabled(enabled);
    this.chipButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    this.countButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    if (enabled) this.pickStake(this.stakeCents); // re-disable unaffordable chips
  }

  private async spin(): Promise<void> {
    if (this.spinning) return;
    const balance = session.user?.balance_cents ?? 0;
    if (this.stakeCents > balance) { this.toast.setText('not enough to stake that'); return; }

    this.spinning = true;
    this.toast.setText('');
    this.setControls(false);
    audio.playSpin();

    // Reel roll animation: cycle random symbols briefly.
    const roll = this.time.addEvent({
      delay: 60, loop: true,
      callback: () => {
        for (let i = 0; i < this.reelCount; i++) {
          this.setReel(i, Phaser.Utils.Array.GetRandom(SLOT_SYMBOLS as unknown as SlotSymbol[]));
        }
      },
    });

    try {
      const result = await api.slotsSpin(this.stakeCents, this.reelCount);
      await this.wait(650);
      roll.remove();
      result.result_detail.reels.forEach((s, i) => this.setReel(i, s as SlotSymbol));

      const fresh = await api.getMe();
      session.setUser(fresh); // may fire the win-watcher and stop this scene
      if (!this.scene.isActive()) return; // won — WinScene has taken over

      if (result.status === 'LOST') {
        // GOOD outcome: money lost is the goal.
        juice.flash(this, 0x3ddc84);
        juice.coinBurst(this, this.scale.width / 2, 280);
        juice.shake(this);
        audio.playLossReward();
      } else {
        // BAD outcome: money gained.
        juice.glitch(this);
        juice.flash(this, 0xff3ea5);
        audio.playGainPunish();
      }
    } catch (e) {
      roll.remove();
      const fresh = await api.getMe().catch(() => null);
      if (fresh) session.setUser(fresh);
      this.toast.setText(e instanceof ApiError ? e.message : 'connection hiccup — try again');
    } finally {
      this.spinning = false;
      this.setControls(true);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
```

- [ ] **Step 2: Verify build compiles**

Run: `cd client && npm run build`
Expected: passes.

- [ ] **Step 3: Manual smoke (backend up)**

`npm run dev` → guest → Slots. Pick `$10`, reels `3`, SPIN. Expected: reels roll
then land on 3 symbols; on a `LOST` spin (common) you get coin burst + green flash
+ rising chime and the balance ticks **down**; on a `WON` spin (rarer) you get the
glitch + buzz and balance ticks **up**. Toggle to `5` reels → five columns render.
Stop the server.

- [ ] **Step 4: Commit**

```bash
git add client/src/scenes/SlotsScene.ts
git commit -m "feat(client): playable slots scene with inverted juice"
```

---

### Task 9: WinScene + central win-watcher wiring

**Files:**
- Create: `client/src/scenes/WinScene.ts`
- Modify: `client/src/main.ts` (register WinScene + wire `session.onWin`)

**Interfaces:**
- Consumes: `session` (`onWin`, `clear`), `Button`, the `Phaser.Game` instance.
- Produces: `WinScene` (key `Win`); a single win-watcher on `session.onWin` that
  stops all active scenes and starts `Win`.

- [ ] **Step 1: Create `client/src/scenes/WinScene.ts`**

```ts
import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { session } from '../core/session';

export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.cameras.main.setBackgroundColor('#0a0410');

    this.add.text(cx, 220, 'YOU LOST EVERYTHING.', {
      fontSize: '52px', color: '#3ddc84', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 300, 'YOU WIN.', {
      fontSize: '72px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    new Button(this, cx, 460, 'PLAY AGAIN', () => {
      session.clear();
      this.scene.start('Menu');
    }, { width: 300 });
  }
}
```

- [ ] **Step 2: Update `client/src/main.ts` — register WinScene and wire the watcher**

```ts
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { SlotsScene } from './scenes/SlotsScene';
import { WinScene } from './scenes/WinScene';
import { session } from './core/session';

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0a0410',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [BootScene, TitleScene, MenuScene, SlotsScene, WinScene],
});

// Module-agnostic win gate: whenever the wallet hits $0 (from any game module),
// stop whatever is active and show the Win screen.
session.onWin(() => {
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key !== 'Win') game.scene.stop(s.scene.key);
  });
  game.scene.start('Win');
});
```

- [ ] **Step 3: Verify build compiles**

Run: `cd client && npm run build`
Expected: passes.

- [ ] **Step 4: Manual smoke — win path (backend up)**

`npm run dev` → guest → Slots. Set stake `$100`, spin repeatedly (losses drain
the balance). When balance reaches `$0`, expected: WinScene appears
("YOU LOST EVERYTHING. YOU WIN."). Click PLAY AGAIN → back to Menu with a fresh
guest option. (If draining is slow, this is still expected to trigger once at $0.)
Stop the server.

- [ ] **Step 5: Commit**

```bash
git add client/src/scenes/WinScene.ts client/src/main.ts
git commit -m "feat(client): WinScene + centralized $0 win-watcher"
```

---

### Task 10: Backend standup, full smoke checklist, client README

**Files:**
- Create: `client/README.md`

**Interfaces:**
- Consumes: everything above. Produces: developer docs + a verified end-to-end run.

- [ ] **Step 1: Stand up the backend and confirm CORS**

Run from repo root:
```bash
make up-local
make migrate
make seed
```
Confirm the backend `.env` (or compose env) sets
`CORS_ORIGINS=["http://localhost:5173"]`. Verify: open
`http://localhost:8000/docs` and confirm `/api/v1/casino/slots/spin` is listed.

- [ ] **Step 2: Full manual smoke run**

Run `cd client && npm run dev`, then walk the whole flow:
1. Title card → click → Menu.
2. PLAY AS GUEST → Slots, HUD shows `$1,000.00`.
3. Spin at `$10`, reels `3` — observe a `LOST` (coin burst / green / chime, balance
   down) and, over several spins, a `WON` (glitch / buzz, balance up).
4. Toggle reels to `5` — five columns; spin works.
5. Reload mid-session — still authed (session persists).
6. Set `$100`, drain to `$0` → WinScene → PLAY AGAIN → Menu.

All six expected as described. Note any deviation as a bug to fix before commit.

- [ ] **Step 3: Create `client/README.md`**

```markdown
# Lose-Lose — Client

Phaser 3 + Vite + TypeScript HTML5 client. Slots vertical slice.

## Dev

```bash
npm install
npm run dev        # http://localhost:5173
```

Requires the backend running (`make up-local && make migrate && make seed` from
the repo root) with `CORS_ORIGINS` including `http://localhost:5173`.
Backend URL is set by `VITE_API_BASE` in `.env.development`.

## Test

```bash
npm run test       # Vitest — core/session + core/api
```

## Build (itch HTML5)

```bash
npm run build      # -> dist/ (base: './', index.html at root)
```
Zip the **contents** of `dist/` (with `index.html` at the zip root) and upload as
an itch.io HTML5 project. Set `VITE_API_BASE` in `.env.production` to the Render
URL before building for release.

## Structure

- `src/core/` — `api` (typed fetch), `session` (wallet store + win gate),
  `assets` (placeholder manifest), `audio`, `juice`.
- `src/ui/` — `Button`, `WalletHud`, `authForm`.
- `src/scenes/` — Boot → Title → Menu → Slots, plus the module-agnostic Win.

Real art/audio swaps in by replacing entries in `src/core/assets.ts` /
`src/core/audio.ts` — no scene changes needed.
```

- [ ] **Step 4: Full test suite + build gate**

Run:
```bash
cd client && npm run test && npm run build
```
Expected: all Vitest specs pass; build writes `dist/` with `index.html` at its root.

- [ ] **Step 5: Update roadmap status**

In `docs/roadmap.md`, mark the Phase 4 slots slice done (change the Phase 4 row
note to reflect "scaffold + slots slice shipped; market next"). Keep it a one-line
edit.

- [ ] **Step 6: Commit**

```bash
git add client/README.md docs/roadmap.md
git commit -m "docs(client): README + smoke checklist; roadmap slots slice done"
```

---

## Self-Review Notes

- **Spec coverage:** scaffold (T1), session+win gate (T2), api (T3), asset
  manifest/placeholders (T4), audio+juice inverted feedback (T5), Button+WalletHud
  incl. progress-to-$0 bar (T6), title+auth menu with DOM form (T7), slots with
  $1/$10/$50/$100 chips + 3/5 toggle + inverted juice (T8), module-agnostic
  WinScene + central watcher (T9), CORS/standup + itch build + README (T10). All
  spec sections map to a task.
- **Server-authoritative wallet:** every spin refreshes via `getMe()` then
  `session.setUser` (T8), which is also the single win trigger (T2/T9).
- **Types:** `User`/`TokenResult`/`SlotSpinResult` defined once in `types.ts`
  (T2) and consumed unchanged by `api` (T3) and scenes (T7/T8).
