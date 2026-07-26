/**
 * Phaser-free 2D drawing primitives.
 *
 * These used to be private to core/assets.ts, where every consumer was a Phaser
 * texture. Item icons broke that assumption: they render into DOM `<img>` tags
 * in the market grid, so they need the same palette and the same shapes without
 * the texture manager. Extracting them keeps ADR 0005's "procedural, keyed" art
 * pipeline single-sourced instead of growing a second one for the DOM.
 *
 * Lives in core/ because it is pure drawing with no engine dependency — the
 * same reason slotLogic and money live here.
 */

/** A palette int (0xRRGGBB) as a css rgba() string. */
export function rgba(c: number, alpha = 1): string {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Trace a rounded rectangle with independently sized corners. */
export function roundedPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: [number, number, number, number],
): void {
  const [tl, tr, br, bl] = r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
  ctx.lineTo(x + bl, y + h);
  ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/**
 * Draw into an offscreen canvas and hand back a data URL for a DOM `<img>`.
 *
 * Returns null rather than throwing when no 2D context is available. That is
 * not only a jsdom concern: a real browser can refuse a context (lost GPU
 * context, fingerprinting protection), and an icon must never be the thing that
 * takes down a render. Callers are expected to have a legible fallback.
 */
export function bakeDataUrl(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    draw(ctx, width, height);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}
