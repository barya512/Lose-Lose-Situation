// Market screen, built as a plain DOM overlay (not Phaser game objects) —
// mirrors the relationship `authForm.ts` has with SlotsScene, except this
// panel is persistent for as long as the Market scene is active rather than a
// modal. DOM (not canvas) because most tiles embed a live TradingView iframe;
// keeping 15 of those glued to Phaser-rendered rows across canvas
// scale/resize would be far more fragile than a normal scrollable <div>.
//
// Laid out as a grid of always-open tiles rather than an expanding drawer: the
// point of pre-rolled offers is that you can SCAN fifteen bounties and pick one,
// which a one-at-a-time drawer makes impossible.
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { dollars } from '../core/money';
import { itemIconUrl } from '../core/itemArt';
import { css, font, outcomeCss } from '../core/theme';
import { mountMiniChart } from '../core/tradingview';
import type { MarketBet, MarketDirection, Offer } from '../core/types';

const TIMEFRAMES: { s: number; label: string }[] = [
  { s: 60, label: '1m' },
  { s: 300, label: '5m' },
  { s: 3600, label: '1h' },
];

const OFFERS_POLL_MS = 10_000;
const BETS_POLL_MS = 5_000;
const COUNTDOWN_TICK_MS = 1_000;

function fmtPrice(p: number | null): string {
  return p === null
    ? '—'
    : p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

/**
 * open/closed is plumbing, not an outcome, so it stays gold/cream. Never
 * reward/punish — those are reserved for which way the money moved.
 */
function badgeStyle(open: boolean): string {
  return (
    'font-size:11px;padding:2px 6px;border-radius:5px;' +
    `color:${open ? css.gold : css.creamDim};` +
    `border:1px solid ${open ? css.goldDim : css.creamDim};`
  );
}

interface TileState {
  offer: Offer;
  root: HTMLElement;
  priceEl: HTMLElement;
  badgeEl: HTMLElement;
  chipsEl: HTMLElement;
  gateEl: HTMLElement;
  itemEl: HTMLElement;
  downBtn: HTMLButtonElement;
  upBtn: HTMLButtonElement;
  chartTeardown: () => void;
  selectedChip: number | null;
}

/**
 * Settle juice is no longer this panel's job: core/betWatcher owns the status
 * diff and fires wherever the player is standing, rather than dying with this
 * scene. The panel now only polls to keep its own display current.
 */
export function mountMarketPanel(onBack: () => void): () => void {
  let alive = true;
  let horizonS = TIMEFRAMES[0].s;

  const wrap = el('div',
    `position:fixed;inset:0;overflow-y:auto;background:${css.feltEdge};color:${css.cream};` +
    `font-family:${font.ui};padding:20px 20px 60px;box-sizing:border-box;`);

  // --- header ------------------------------------------------------------

  const header = el('div',
    'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:16px;');
  header.appendChild(makeButton('← BACK',
    `background:transparent;color:${css.creamDim};border:1px solid ${css.goldDim};`, onBack));
  header.appendChild(el('div',
    `font-family:${font.display};font-size:26px;color:${css.gold};letter-spacing:2px;`,
    'THE MARKET'));

  // Pending bets live top-right, out of the grid's way.
  const pendingBox = el('div',
    `min-width:190px;border:1px solid ${css.goldDim};border-radius:10px;padding:8px 10px;` +
    `background:${css.cardFace};`);
  header.appendChild(pendingBox);
  wrap.appendChild(header);

  wrap.appendChild(el('div',
    `color:${css.creamDim};font-size:13px;margin-bottom:14px;`,
    'lose the bet, take the prize.'));

  // --- horizon ------------------------------------------------------------
  // One selector for the whole grid rather than a row per tile: it keeps each
  // tile short, and it composes with direction-as-commit — set it once, then
  // rapid-fire across the grid.

  const horizonRow = el('div',
    'display:flex;align-items:center;gap:8px;margin-bottom:16px;');
  horizonRow.appendChild(el('span', `color:${css.creamDim};font-size:12px;`, 'HORIZON'));
  const horizonBtns = new Map<number, HTMLButtonElement>();
  for (const tf of TIMEFRAMES) {
    const b = makeButton(tf.label, '', () => {
      horizonS = tf.s;
      paintHorizon();
      tiles.forEach(paintDirections);
    });
    horizonBtns.set(tf.s, b);
    horizonRow.appendChild(b);
  }
  wrap.appendChild(horizonRow);

  function paintHorizon(): void {
    for (const [s, b] of horizonBtns) {
      const on = s === horizonS;
      b.style.background = on ? css.gold : 'transparent';
      b.style.color = on ? css.feltEdge : css.creamDim;
      b.style.border = `1px solid ${on ? css.gold : css.goldDim}`;
    }
  }
  paintHorizon();

  // --- grid ---------------------------------------------------------------

  const openHeading = el('div',
    `color:${css.gold};font-size:13px;letter-spacing:2px;margin:6px 0 10px;`, 'OPEN');
  const openGrid = el('div',
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;');
  const closedHeading = el('div',
    `color:${css.creamDim};font-size:13px;letter-spacing:2px;margin:22px 0 10px;`, 'CLOSED');
  const closedGrid = el('div',
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;');
  wrap.append(openHeading, openGrid, closedHeading, closedGrid);

  const tiles = new Map<string, TileState>();
  const errorEl = el('div', `color:${outcomeCss.punish};font-size:13px;margin-top:12px;`);
  wrap.appendChild(errorEl);

  function buildTile(offer: Offer, chartSlot: number): TileState {
    const root = el('div',
      `border:1px solid ${css.goldDim};border-radius:12px;padding:12px;` +
      `background:${css.cardFace};display:flex;flex-direction:column;gap:8px;`);

    const top = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;');
    top.appendChild(el('div',
      `font-family:${font.display};font-size:17px;color:${css.cream};`, offer.symbol));
    const priceEl = el('div', `font-size:15px;color:${css.cream};`, fmtPrice(offer.last_price));
    top.appendChild(priceEl);
    root.appendChild(top);

    const chartHost = el('div', 'height:90px;border-radius:8px;overflow:hidden;');
    root.appendChild(chartHost);
    const chartTeardown = mountMiniChart(chartHost, offer.symbol, chartSlot);

    // One row carrying the bounty and the market state; the icon does the
    // heavy lifting so the tile never needs a rarity label.
    const midRow = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;');
    const itemEl = el('div', 'display:flex;align-items:center;gap:6px;min-height:34px;');
    const badgeEl = el('div', badgeStyle(offer.is_open), offer.is_open ? 'OPEN' : 'CLOSED');
    midRow.append(itemEl, badgeEl);
    root.appendChild(midRow);

    const chipsEl = el('div', 'display:flex;flex-wrap:wrap;gap:6px;');
    root.appendChild(chipsEl);

    const gateEl = el('div', `font-size:11px;color:${css.creamDim};min-height:14px;`);
    root.appendChild(gateEl);

    const dirRow = el('div', 'display:flex;gap:8px;');
    const downBtn = makeButton('DOWN', 'flex:1;', () => void commit(offer.symbol, 'DOWN'));
    const upBtn = makeButton('UP', 'flex:1;', () => void commit(offer.symbol, 'UP'));
    dirRow.append(downBtn, upBtn);
    root.appendChild(dirRow);

    return {
      offer, root, priceEl, badgeEl, chipsEl, gateEl, itemEl,
      downBtn, upBtn, chartTeardown, selectedChip: null,
    };
  }

  function paintItem(tile: TileState): void {
    const { itemEl, offer } = tile;
    itemEl.replaceChildren();

    if (!offer.reward_item) {
      // An empty socket rather than nothing at all: a blank space reads as a
      // rendering bug, a dimmed slot reads as "not this one".
      const socket = el('div',
        `width:30px;height:30px;border-radius:8px;border:1px dashed ${css.creamDim};opacity:0.35;`);
      itemEl.appendChild(socket);
      return;
    }

    const img = document.createElement('img');
    img.src = itemIconUrl(offer.reward_item.art_key, offer.reward_item.rarity);
    img.alt = offer.reward_item.name;
    // The alt text IS the fallback: if the icon failed to bake, the name still
    // tells the player what the tile is worth.
    img.title = `${offer.reward_item.name} (${offer.reward_item.rarity})`;
    img.style.cssText = 'width:30px;height:30px;display:block;';
    itemEl.appendChild(img);

    const chasing = offer.pending_bet_id !== null;
    itemEl.appendChild(el('div',
      `font-size:11px;color:${chasing ? css.gold : css.creamDim};`,
      chasing ? `chasing ${offer.reward_item.name}` : offer.reward_item.name));
  }

  function paintChips(tile: TileState): void {
    const { chipsEl, offer } = tile;
    chipsEl.replaceChildren();
    const balance = session.displayBalanceCents;
    const gate = offer.reward_stake_gate_cents ?? 0;

    for (const cents of offer.chips_cents) {
      // No chip is ever disabled: one above the wallet goes all in. Disabling
      // it would softlock a nearly-broke player out of the desperate play,
      // which in this game is the CORRECT play.
      const selected = tile.selectedChip === cents;
      const belowGate = gate > 0 && Math.min(cents, balance) < gate;
      const b = makeButton(dollars(cents),
        `padding:6px 10px;font-size:12px;` +
        `background:${selected ? css.gold : 'transparent'};` +
        `color:${selected ? css.feltEdge : css.cream};` +
        `border:1px solid ${selected ? css.gold : css.goldDim};` +
        `opacity:${belowGate && !selected ? '0.55' : '1'};`,
        () => {
          tile.selectedChip = cents;
          paintChips(tile);
          paintDirections(tile);
        });
      chipsEl.appendChild(b);
    }

    tile.gateEl.textContent =
      gate > 0 ? `${dollars(gate)}+ to qualify for the item` : '';
  }

  function paintDirections(tile: TileState): void {
    const { offer, downBtn, upBtn } = tile;
    const chip = tile.selectedChip;
    const balance = session.displayBalanceCents;
    const allIn = chip !== null && chip >= balance && balance > 0;
    const label = TIMEFRAMES.find((t) => t.s === horizonS)?.label ?? '';
    const enabled = chip !== null && offer.is_open && offer.pending_bet_id === null;

    for (const [btn, dir] of [[downBtn, '↓'], [upBtn, '↑']] as const) {
      // The button states every parameter of the bet it places, so
      // direction-as-commit has no hidden state behind it.
      btn.textContent = allIn
        ? `ALL IN ${dir}`
        : `${dir === '↑' ? 'UP' : 'DOWN'} · ${label}`;
      btn.disabled = !enabled;
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
      btn.style.opacity = enabled ? '1' : '0.4';
      // All-in is irreversible and commits the whole wallet, so it announces
      // itself in reward gold at the moment of the click.
      btn.style.background = allIn ? css.gold : 'transparent';
      btn.style.color = allIn ? css.feltEdge : css.cream;
      btn.style.border = `1px solid ${allIn ? css.gold : css.goldDim}`;
    }
  }

  function paintTile(tile: TileState): void {
    tile.priceEl.textContent = fmtPrice(tile.offer.last_price);
    tile.badgeEl.textContent = tile.offer.is_open ? 'OPEN' : 'CLOSED';
    tile.badgeEl.style.cssText = badgeStyle(tile.offer.is_open);
    tile.root.style.opacity = tile.offer.is_open ? '1' : '0.45';
    paintItem(tile);
    paintChips(tile);
    paintDirections(tile);
  }

  async function commit(symbol: string, direction: MarketDirection): Promise<void> {
    const tile = tiles.get(symbol);
    if (!tile || tile.selectedChip === null) return;
    errorEl.textContent = '';
    try {
      // The chip is posted as-is; the server clamps it to the wallet when it
      // exceeds the balance (all-in) and rejects anything off the ladder.
      await api.marketPlaceBet(symbol, direction, tile.selectedChip, horizonS);
      tile.selectedChip = null;
      await Promise.all([refreshOffers(), refreshBets()]);
    } catch (err) {
      errorEl.textContent =
        err instanceof ApiError ? err.message : 'could not place that bet';
    }
  }

  // --- pending bets -------------------------------------------------------

  let pendingBets: MarketBet[] = [];

  function renderPendingList(): void {
    pendingBox.replaceChildren();
    pendingBox.appendChild(el('div',
      `font-size:11px;color:${css.creamDim};letter-spacing:1px;margin-bottom:4px;`,
      'PENDING BETS'));
    if (pendingBets.length === 0) {
      pendingBox.appendChild(el('div', `font-size:12px;color:${css.creamDim};`, 'none'));
      return;
    }
    for (const bet of pendingBets) {
      const row = el('div', 'display:flex;justify-content:space-between;gap:8px;font-size:12px;');
      row.appendChild(el('span', `color:${css.cream};`, `${bet.ticker} ${bet.direction}`));
      row.appendChild(el('span', `color:${css.creamDim};`, countdown(bet)));
      pendingBox.appendChild(row);
    }
  }

  function countdown(bet: MarketBet): string {
    if (!bet.resolve_at) return '';
    const left = Math.max(0, new Date(bet.resolve_at).getTime() - Date.now());
    return `${Math.ceil(left / 1000)}s`;
  }

  // --- polling ------------------------------------------------------------

  async function refreshOffers(): Promise<void> {
    let list: Offer[];
    try {
      list = await api.marketOffers();
    } catch {
      return; // keep the last good grid rather than blanking it
    }
    if (!alive) return;

    let slot = 0;
    for (const offer of list) {
      let tile = tiles.get(offer.symbol);
      if (!tile) {
        tile = buildTile(offer, slot);
        tiles.set(offer.symbol, tile);
      }
      tile.offer = offer;
      slot += 1;
    }
    // Re-home tiles so open ones group above the greyed-out closed ones.
    for (const offer of list) {
      const tile = tiles.get(offer.symbol)!;
      (offer.is_open ? openGrid : closedGrid).appendChild(tile.root);
      paintTile(tile);
    }
    closedHeading.style.display = list.some((o) => !o.is_open) ? '' : 'none';
  }

  async function refreshBets(): Promise<void> {
    let list: MarketBet[];
    try {
      list = await api.marketBets();
    } catch {
      return;
    }
    if (!alive) return;
    // No status diff here any more. It used to live in this panel, which meant
    // it died on scene shutdown and only fired if the player happened to still
    // be looking at the market. core/betWatcher owns that now.
    pendingBets = list.filter((b) => b.status === 'PENDING');
    renderPendingList();
  }

  renderPendingList();
  void refreshOffers();
  void refreshBets();
  const offersInterval = window.setInterval(() => void refreshOffers(), OFFERS_POLL_MS);
  const betsInterval = window.setInterval(() => void refreshBets(), BETS_POLL_MS);
  const countdownInterval = window.setInterval(renderPendingList, COUNTDOWN_TICK_MS);
  // The drain moves the balance continuously, which changes which chips are
  // all-in and which clear the gate.
  const unsubBalance = session.onChange(() => tiles.forEach((t) => {
    paintChips(t);
    paintDirections(t);
  }));

  document.body.appendChild(wrap);

  return () => {
    alive = false;
    window.clearInterval(offersInterval);
    window.clearInterval(betsInterval);
    window.clearInterval(countdownInterval);
    unsubBalance();
    for (const tile of tiles.values()) tile.chartTeardown();
    wrap.remove();
  };
}
