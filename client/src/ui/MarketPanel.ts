// Market screen, built as a plain DOM overlay (not Phaser game objects) —
// mirrors the relationship `authForm.ts` has with SlotsScene, except this
// panel is persistent for as long as the Market scene is active rather than a
// modal. DOM (not canvas) because most rows embed a live TradingView iframe;
// keeping 13 of those glued to Phaser-rendered rows across canvas
// scale/resize would be far more fragile than a normal scrollable <div> list.
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { mountMiniChart } from '../core/tradingview';
import type { MarketBet, MarketDirection, MarketTicker } from '../core/types';

const STAKE_CHIPS = [100, 1000, 5000, 10000]; // cents — matches SlotsScene's chips
const TIMEFRAMES: { s: number; label: string }[] = [
  { s: 60, label: '1 MIN' },
  { s: 300, label: '5 MIN' },
  { s: 3600, label: '1 HOUR' },
];
const SECTIONS: { title: string; symbols: string[] }[] = [
  { title: 'MAGNIFICENT 7', symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'] },
  { title: 'INDEX ETFS', symbols: ['SPY', 'QQQ'] },
  { title: 'INTERNATIONAL', symbols: ['ASML.AS', 'AZN.L', 'BHP.AX', '9988.HK'] },
  { title: 'CRYPTO', symbols: ['BTC-USD', 'ETH-USD'] },
];

const TICKER_POLL_MS = 10_000;
const BETS_POLL_MS = 5_000;
const COUNTDOWN_TICK_MS = 1_000;

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPrice(p: number | null): string {
  return p === null ? '—' : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cssText: string, text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = cssText;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeButton(label: string, cssText: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText =
    'padding:8px 14px;font-size:13px;font-weight:bold;border:none;border-radius:8px;' +
    'cursor:pointer;font-family:inherit;' + cssText;
  btn.addEventListener('click', onClick);
  return btn;
}

interface RowState {
  ticker: MarketTicker;
  rowEl: HTMLElement;
  nameEl: HTMLElement;
  priceEl: HTMLElement;
  badgeEl: HTMLElement;
  drawerEl: HTMLElement;
  chartTeardown: () => void;
  expanded: boolean;
}

export interface MarketPanelEffects {
  onWon(): void; // BAD outcome for the player — glitch/punish juice
  onLost(): void; // GOOD outcome for the player — reward juice
}

export function mountMarketPanel(onBack: () => void, effects: MarketPanelEffects): () => void {
  let alive = true;

  const wrap = el('div',
    'position:fixed;inset:0;overflow-y:auto;background:#0a0410;color:#fff;' +
    'font-family:sans-serif;padding:20px 20px 60px;box-sizing:border-box;');

  const header = el('div', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;');
  header.append(
    el('div', 'color:#ff3ea5;font-size:28px;font-weight:bold;', 'MARKET'),
    makeButton('← BACK', 'background:#3a2456;color:#fff;padding:10px 18px;', () => onBack()),
  );
  wrap.append(header);

  const balanceEl = el('div', 'color:#b197fc;font-size:15px;margin-bottom:20px;');
  wrap.append(balanceEl);
  const renderBalance = (): void => {
    balanceEl.textContent = `balance: ${dollars(session.user?.balance_cents ?? 0)}`;
  };
  renderBalance();
  const unsubBalance = session.onChange(renderBalance);

  const pendingTitle = el('div', 'color:#74c0fc;font-size:15px;font-weight:bold;margin-bottom:8px;display:none;', 'PENDING BETS');
  const pendingList = el('div', 'display:flex;flex-direction:column;gap:8px;margin-bottom:20px;');
  wrap.append(pendingTitle, pendingList);

  const statusEl = el('div', 'color:#6c5a80;font-size:14px;padding:20px 0;', 'loading tickers…');
  const sectionsEl = el('div', 'display:flex;flex-direction:column;gap:24px;');
  wrap.append(statusEl, sectionsEl);

  document.body.append(wrap);

  // --- ticker rows -----------------------------------------------------

  const rows = new Map<string, RowState>();
  let expandedSymbol: string | null = null;

  function badgeStyle(open: boolean): string {
    return open
      ? 'color:#3ddc84;border:1px solid #3ddc84;'
      : 'color:#6c5a80;border:1px solid #6c5a80;';
  }

  function collapseRow(row: RowState): void {
    row.expanded = false;
    row.drawerEl.style.display = 'none';
    row.drawerEl.innerHTML = '';
  }

  function expandRow(row: RowState): void {
    if (expandedSymbol && expandedSymbol !== row.ticker.symbol) {
      const prev = rows.get(expandedSymbol);
      if (prev) collapseRow(prev);
    }
    expandedSymbol = row.ticker.symbol;
    row.expanded = true;
    row.drawerEl.style.display = 'block';
    buildDrawer(row);
  }

  function toggleRow(row: RowState): void {
    if (row.expanded) collapseRow(row);
    else expandRow(row);
  }

  function buildDrawer(row: RowState): void {
    row.drawerEl.innerHTML = '';
    if (!row.ticker.is_open) {
      row.drawerEl.append(el('div', 'color:#6c5a80;font-size:13px;padding:12px 0;', 'market closed — betting disabled'));
      return;
    }

    let direction: MarketDirection = 'UP';
    let stakeCents = STAKE_CHIPS[0];
    let timeframeS = TIMEFRAMES[0].s;
    const balance = session.user?.balance_cents ?? 0;

    const dirRow = el('div', 'display:flex;gap:8px;margin:10px 0 6px;');
    const dirButtons: { dir: MarketDirection; btn: HTMLButtonElement }[] = [];
    (['UP', 'DOWN'] as MarketDirection[]).forEach((d) => {
      const btn = makeButton(d, '', () => {
        direction = d;
        dirButtons.forEach(({ dir, btn: b }) => setSelected(b, dir === direction));
      });
      dirButtons.push({ dir: d, btn });
      dirRow.append(btn);
    });
    dirButtons.forEach(({ dir, btn }) => setSelected(btn, dir === direction));

    const stakeRow = el('div', 'display:flex;gap:8px;margin:6px 0;flex-wrap:wrap;');
    const stakeButtons: { cents: number; btn: HTMLButtonElement }[] = [];
    STAKE_CHIPS.forEach((cents) => {
      const btn = makeButton(`$${cents / 100}`, '', () => {
        stakeCents = cents;
        stakeButtons.forEach(({ cents: c, btn: b }) => setSelected(b, c === stakeCents));
      });
      btn.disabled = cents > balance;
      if (btn.disabled) btn.style.opacity = '0.35';
      stakeButtons.push({ cents, btn });
      stakeRow.append(btn);
    });
    stakeButtons.forEach(({ cents, btn }) => setSelected(btn, cents === stakeCents));

    const tfRow = el('div', 'display:flex;gap:8px;margin:6px 0;');
    const tfButtons: { s: number; btn: HTMLButtonElement }[] = [];
    TIMEFRAMES.forEach(({ s, label }) => {
      const btn = makeButton(label, '', () => {
        timeframeS = s;
        tfButtons.forEach(({ s: ts, btn: b }) => setSelected(b, ts === timeframeS));
      });
      tfButtons.push({ s, btn });
      tfRow.append(btn);
    });
    tfButtons.forEach(({ s, btn }) => setSelected(btn, s === timeframeS));

    const errorEl = el('div', 'color:#ff6b6b;font-size:13px;min-height:18px;margin-top:6px;');
    const confirmBtn = makeButton('PLACE BET', 'background:#ff3ea5;color:#fff;padding:10px 20px;margin-top:4px;', () => {
      void placeBet();
    });

    async function placeBet(): Promise<void> {
      confirmBtn.disabled = true;
      errorEl.textContent = '';
      try {
        await api.marketPlaceBet(row.ticker.symbol, direction, stakeCents, timeframeS);
        if (!alive) return;
        collapseRow(row);
        void refreshBets();
      } catch (e) {
        if (!alive) return;
        errorEl.textContent = e instanceof ApiError ? e.message : 'connection hiccup — try again';
        confirmBtn.disabled = false;
      }
    }

    row.drawerEl.append(dirRow, stakeRow, tfRow, confirmBtn, errorEl);
  }

  function setSelected(btn: HTMLButtonElement, selected: boolean): void {
    btn.style.background = selected ? '#ff3ea5' : '#3a2456';
    btn.style.color = '#fff';
  }

  let chartSlot = 0;

  function buildRow(container: HTMLElement, ticker: MarketTicker): RowState {
    const rowEl = el('div', 'background:#170a26;border-radius:12px;padding:14px 16px;');
    const headEl = el('div', 'display:flex;align-items:center;gap:12px;cursor:pointer;');
    const nameEl = el('div', 'flex:1;font-size:15px;font-weight:bold;');
    const priceEl = el('div', 'font-size:15px;color:#fff;min-width:90px;text-align:right;');
    const badgeEl = el('div', 'font-size:11px;padding:3px 8px;border-radius:6px;');
    headEl.append(nameEl, priceEl, badgeEl);

    const chartEl = el('div', 'width:100%;height:160px;margin-top:10px;');
    const drawerEl = el('div', 'display:none;');

    rowEl.append(headEl, chartEl, drawerEl);
    container.appendChild(rowEl);

    const row: RowState = {
      ticker, rowEl, nameEl, priceEl, badgeEl, drawerEl,
      chartTeardown: mountMiniChart(chartEl, ticker.symbol, chartSlot++),
      expanded: false,
    };
    headEl.addEventListener('click', () => toggleRow(row));
    return row;
  }

  function renderRowData(row: RowState): void {
    row.nameEl.textContent = `${row.ticker.name} (${row.ticker.symbol})`;
    row.priceEl.textContent = fmtPrice(row.ticker.last_price);
    row.badgeEl.textContent = row.ticker.is_open ? 'OPEN' : 'CLOSED';
    row.badgeEl.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:6px;' + badgeStyle(row.ticker.is_open);
  }

  let tickersBuilt = false;
  async function refreshTickers(): Promise<void> {
    let list: MarketTicker[];
    try {
      list = await api.marketTickers();
    } catch {
      if (!tickersBuilt) statusEl.textContent = 'could not reach the market — retrying…';
      return; // transient — next poll will retry
    }
    if (!alive) return;
    statusEl.style.display = 'none';
    const bySymbol = new Map(list.map((t) => [t.symbol, t]));

    if (!tickersBuilt) {
      tickersBuilt = true;
      for (const section of SECTIONS) {
        const secEl = el('div', '');
        secEl.append(el('div', 'color:#b197fc;font-size:14px;font-weight:bold;margin-bottom:10px;letter-spacing:1px;', section.title));
        const secRows = el('div', 'display:flex;flex-direction:column;gap:10px;');
        secEl.append(secRows);
        sectionsEl.append(secEl);

        const inSection = section.symbols
          .map((s) => bySymbol.get(s))
          .filter((t): t is MarketTicker => t !== undefined)
          .sort((a, b) => Number(b.is_open) - Number(a.is_open));
        for (const t of inSection) {
          const row = buildRow(secRows, t);
          rows.set(t.symbol, row);
          renderRowData(row);
        }
      }
    } else {
      for (const [symbol, row] of rows) {
        const fresh = bySymbol.get(symbol);
        if (!fresh) continue;
        row.ticker = fresh;
        renderRowData(row);
      }
    }
  }

  // --- pending bets ------------------------------------------------------

  const knownStatus = new Map<string, string>();
  let pendingBets: MarketBet[] = [];

  function renderPendingList(): void {
    pendingList.innerHTML = '';
    pendingTitle.style.display = pendingBets.length ? 'block' : 'none';
    for (const bet of pendingBets) {
      const rowEl = el('div', 'background:#170a26;border-radius:10px;padding:10px 14px;font-size:13px;');
      rowEl.dataset.betId = bet.id;

      const topLine = el('div', 'display:flex;align-items:center;gap:12px;');
      const timerEl = el('div', 'color:#74c0fc;min-width:70px;text-align:right;');
      timerEl.dataset.role = 'timer';
      topLine.append(
        el('div', 'flex:1;', `${bet.ticker} · ${bet.direction} · ${dollars(bet.stake_cents)}`),
        timerEl,
      );

      const priceLine = el('div',
        'display:flex;align-items:center;gap:8px;margin-top:6px;font-size:12px;color:#6c5a80;');
      const nowEl = el('span', 'font-weight:bold;');
      nowEl.dataset.role = 'now';
      const statusEl = el('span', '');
      statusEl.dataset.role = 'status';
      priceLine.append(
        el('span', '', `start ${fmtPrice(bet.start_price)} →`),
        nowEl,
        statusEl,
      );

      rowEl.append(topLine, priceLine);
      pendingList.append(rowEl);
    }
    tickCountdowns();
  }

  // Colors match the inverted win/loss juice used elsewhere (SlotsScene,
  // MarketScene effects): green = good for the player (heading to a LOSS),
  // pink = bad for the player (heading to a WIN).
  function tickCountdowns(): void {
    const now = Date.now();
    for (const bet of pendingBets) {
      const rowEl = pendingList.querySelector<HTMLElement>(`[data-bet-id="${bet.id}"]`);
      if (!rowEl) continue;

      const timerEl = rowEl.querySelector<HTMLElement>('[data-role="timer"]');
      if (timerEl && bet.resolve_at) {
        const remainingMs = new Date(bet.resolve_at).getTime() - now;
        timerEl.textContent = remainingMs > 0 ? `${Math.ceil(remainingMs / 1000)}s` : 'resolving…';
      }

      const nowEl = rowEl.querySelector<HTMLElement>('[data-role="now"]');
      const statusEl = rowEl.querySelector<HTMLElement>('[data-role="status"]');
      if (!nowEl || !statusEl) continue;

      const currentPrice = bet.ticker ? rows.get(bet.ticker)?.ticker.last_price ?? null : null;
      if (currentPrice === null || bet.start_price === null) {
        nowEl.textContent = '—';
        nowEl.style.color = '';
        statusEl.textContent = '';
        continue;
      }

      nowEl.textContent = fmtPrice(currentPrice);
      const actualDirection = currentPrice >= bet.start_price ? 'UP' : 'DOWN';
      const onTrackToWin = bet.direction === actualDirection;
      const color = onTrackToWin ? '#ff3ea5' : '#3ddc84';
      nowEl.style.color = color;
      statusEl.textContent = onTrackToWin ? 'WINNING (bad)' : 'LOSING (good)';
      statusEl.style.cssText = `font-size:11px;padding:2px 6px;border-radius:5px;color:${color};border:1px solid ${color};`;
    }
  }

  async function refreshBets(): Promise<void> {
    let list: MarketBet[];
    try {
      list = await api.marketBets();
    } catch {
      return;
    }
    if (!alive) return;

    for (const bet of list) {
      const prev = knownStatus.get(bet.id);
      if (prev === 'PENDING' && bet.status !== 'PENDING') {
        if (bet.status === 'WON') effects.onWon();
        else if (bet.status === 'LOST') effects.onLost();
        api.getMe().then((u) => { if (alive) session.setUser(u); }).catch(() => { /* wallet stays stale until next resolve */ });
      }
      knownStatus.set(bet.id, bet.status);
    }
    pendingBets = list.filter((b) => b.status === 'PENDING');
    renderPendingList();
  }

  // --- polling -------------------------------------------------------

  void refreshTickers();
  void refreshBets();
  const tickerInterval = window.setInterval(() => void refreshTickers(), TICKER_POLL_MS);
  const betsInterval = window.setInterval(() => void refreshBets(), BETS_POLL_MS);
  const countdownInterval = window.setInterval(tickCountdowns, COUNTDOWN_TICK_MS);

  return () => {
    alive = false;
    window.clearInterval(tickerInterval);
    window.clearInterval(betsInterval);
    window.clearInterval(countdownInterval);
    unsubBalance();
    for (const row of rows.values()) row.chartTeardown();
    wrap.remove();
  };
}
