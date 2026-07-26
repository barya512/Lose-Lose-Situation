import { color } from './theme';
import { bakeDataUrl, rgba, roundedPath } from './canvasArt';
import type { ItemRarity } from './types';

/**
 * Item icons, baked to data URLs for the DOM.
 *
 * No item art exists yet — the catalog's `art_key` values point at nothing —
 * and the market tile is a `<div>`, so it can't read a Phaser texture even once
 * art does exist. Following ADR 0005, these are procedural and keyed: when real
 * art lands, this file becomes an `import url from '../../assets/item_x.png'`
 * lookup keyed the same way, with zero call-site changes (exactly how
 * SYMBOL_STYLE[s].icon already works for the slot symbols).
 *
 * Rarity is drawn as the plate's rim rather than written as a label: tile width
 * is the scarce resource in a 15-tile grid, so one glyph has to carry both
 * identity and worth.
 */

const SIZE = 48;

/** Rim colour per rarity: dim cream through bright gold. */
const RARITY_RIM: Record<ItemRarity, number> = {
  COMMON: color.creamDim,
  RARE: color.goldDim,
  EPIC: color.gold,
  LEGENDARY: color.gold,
};

/** Legendary earns a second ring; nothing else does. */
const DOUBLE_RIM: ItemRarity = 'LEGENDARY';

const cache = new Map<string, string>();

/**
 * A data URL for this item's icon, memoized. Cached per (art key, rarity),
 * since rarity is part of what gets drawn.
 *
 * Never throws: with no 2D context available it degrades to a transparent
 * 1px source, and the caller's alt text carries the meaning — the same
 * "degrade to something legible" rule tradingview.ts uses for a dead chart.
 */
export function itemIconUrl(artKey: string | null, rarity: ItemRarity): string {
  const key = `${artKey ?? '_none'}:${rarity}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const url = bakeDataUrl(SIZE, SIZE, (ctx, w, h) => drawPlate(ctx, w, h, artKey, rarity))
    ?? TRANSPARENT_PIXEL;
  cache.set(key, url);
  return url;
}

const TRANSPARENT_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function drawPlate(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  artKey: string | null,
  rarity: ItemRarity,
): void {
  const rim = RARITY_RIM[rarity] ?? color.creamDim;
  const inset = 3;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(color.panel, 0.98));
  grad.addColorStop(1, rgba(color.feltEdge, 0.98));
  roundedPath(ctx, inset, inset, w - inset * 2, h - inset * 2, [10, 10, 10, 10]);
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = rgba(rim, 0.95);
  ctx.lineWidth = 2;
  ctx.stroke();

  if (rarity === DOUBLE_RIM) {
    roundedPath(ctx, inset + 3, inset + 3, w - (inset + 3) * 2, h - (inset + 3) * 2,
      [7, 7, 7, 7]);
    ctx.strokeStyle = rgba(rim, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The item's own mark: its initial, until real art exists. Deliberately the
  // same shape a dropped-in PNG will occupy, so swapping is purely cosmetic.
  const initial = (artKey?.replace(/^item_/, '') ?? '?').charAt(0).toUpperCase();
  ctx.fillStyle = rgba(rim, 0.9);
  ctx.font = `700 ${Math.round(h * 0.44)}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, w / 2, h / 2 + 1);
}
