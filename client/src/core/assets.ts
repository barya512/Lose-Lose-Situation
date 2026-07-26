import Phaser from 'phaser';
import { chrome, color, font } from './theme';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from './viewport';
import cherryIcon from '../../../assets/CHERRY.png';
import lemonIcon from '../../../assets/LEMON.png';
import bellIcon from '../../../assets/BELL.png';
import starIcon from '../../../assets/STAR.png';
import sevenIcon from '../../../assets/SEVEN.png';
import skullIcon from '../../../assets/SKULL.png';
import themeMusic from '../../../assets/sounds/Loose Loose Loop.mp3';
import winMusic from '../../../assets/sounds/Cursed Sandman.mp3';

export const SLOT_SYMBOLS = ['CHERRY', 'LEMON', 'BELL', 'STAR', 'SEVEN', 'SKULL'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

const SYMBOL_STYLE: Record<SlotSymbol, { color: number; icon: string }> = {
  CHERRY: { color: 0xff4d6d, icon: cherryIcon },
  LEMON: { color: 0xffe066, icon: lemonIcon },
  BELL: { color: 0xffa94d, icon: bellIcon },
  STAR: { color: 0x74c0fc, icon: starIcon },
  SEVEN: { color: 0xb197fc, icon: sevenIcon },
  SKULL: { color: 0xff3ea5, icon: skullIcon },
};

export const TEX = {
  // Full-screen felt table. Every scene paints this first.
  backdrop: 'ui.backdrop',
  button: 'ui.button',
  buttonHover: 'ui.button.hover',
  panel: 'ui.panel',
  coin: 'particle.coin',
  glitch: 'particle.glitch',
  // Screen-edge chrome: welded to the top and bottom edges of the frame. The
  // wallet and progress readouts share ONE texture so their join has no seam.
  hudChrome: 'ui.hud.chrome',
  backTab: 'ui.backtab',
  backTabHover: 'ui.backtab.hover',
  // Orb (bet-select) + its bet icons.
  orb: 'ui.orb',
  orbHover: 'ui.orb.hover',
  orbBeer: 'ui.orb.beer',
  orbMarket: 'ui.orb.market',
  orbCasino: 'ui.orb.casino',
  // Casino cards: one shared worn face, plus a per-machine ink overlay carrying
  // the corner suit indices and the central emblem (drawn at full card size).
  card: 'ui.card',
  cardHover: 'ui.card.hover',
  cardRoulette: 'ui.card.roulette',
  cardBlackjack: 'ui.card.blackjack',
  cardSlots: 'ui.card.slots',
  // Slot machine chrome.
  slotFrame: 'ui.slotframe', // nine-slice source (24px corner insets)
  lever: 'ui.lever',
  // Slot "changing image" outcome reaction.
  reactionNeutral: 'slot.reaction.neutral',
  reactionWin: 'slot.reaction.win',
  reactionLoss: 'slot.reaction.loss',
} as const;

export const MUSIC = {
  // Main theme, loops for the duration of the session.
  theme: 'music.theme',
  // Stinger for the player's winning screen.
  win: 'music.win',
} as const;

/**
 * Corner inset for the {@link TEX.slotFrame} nine-slice. Unlike almost every
 * other number in this file it is measured in SOURCE-TEXTURE pixels, so it
 * carries the `bake` oversizing that authored units hide.
 */
export const SLOT_FRAME_INSET = 24 * RENDER_SCALE;

/** Source size of the baked card face; Card scales this down to taste. */
const CARD_SOURCE = { width: 300, height: 420 } as const;

export function symbolTextureKey(s: SlotSymbol): string {
  return `slot.${s.toLowerCase()}`;
}

export function symbolIconKey(s: SlotSymbol): string {
  return `slot.icon.${s.toLowerCase()}`;
}

export function symbolStyle(s: SlotSymbol): { color: number; icon: string } {
  return SYMBOL_STYLE[s];
}

export function loadSymbolIcons(scene: Phaser.Scene): void {
  for (const s of SLOT_SYMBOLS) {
    scene.load.image(symbolIconKey(s), SYMBOL_STYLE[s].icon);
  }
}

export function loadMusic(scene: Phaser.Scene): void {
  scene.load.audio(MUSIC.theme, themeMusic);
  scene.load.audio(MUSIC.win, winMusic);
}

// --- baking helpers ---------------------------------------------------------

/** `0xRRGGBB` → `rgba()`, for canvas fills. */
function rgba(c: number, alpha = 1): string {
  const r = (c >> 16) & 0xff;
  const g = (c >> 8) & 0xff;
  const b = c & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Bake a drawing into a texture through a real 2D canvas context.
 *
 * Phaser's `Graphics` has no gradient fills, and this palette leans on them —
 * the felt vignette, the glass orbs, the gold rims, the foxing on the cards. So
 * the art is still procedural and still keyed (real art drops in by key later),
 * it's just drawn with the canvas API instead. See
 * docs/adr/0005-canvas-baked-token-driven-theme.md.
 *
 * `w`/`h` are AUTHORED units. The canvas is allocated at `RENDER_SCALE` times
 * that and pre-scaled, so every drawing below stays in authored units and comes
 * out at device resolution. Consumers that call `setDisplaySize` (nearly all of
 * them) are unaffected; anything drawing a baked texture at its natural size has
 * to divide by `RENDER_SCALE` itself.
 */
function bake(
  scene: Phaser.Scene, key: string, w: number, h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w * RENDER_SCALE, h * RENDER_SCALE);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  draw(ctx, w, h);
  tex.refresh();
}

/**
 * Deterministic 0..1 sequence. The speckle and foxing want randomness that is
 * the SAME every boot — otherwise a screenshot never reproduces.
 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Rounded rect with per-corner radii `[tl, tr, br, bl]`. */
function roundedPath(
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

/** A flat panel with a gold rim — the shape all the edge chrome shares. */
function drawChrome(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  radii: [number, number, number, number], hover = false,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(hover ? 0x1a4c37 : color.panel, 0.97));
  grad.addColorStop(1, rgba(color.feltEdge, 0.97));
  roundedPath(ctx, 1, 1, w - 2, h - 2, radii);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = hover ? rgba(color.goldBright, 0.95) : rgba(color.goldDim, 0.9);
  ctx.lineWidth = hover ? 3 : 2;
  ctx.stroke();
}

/**
 * The top-left HUD, as a single L-shaped piece of chrome rather than two panels
 * pushed together. It is welded to the top and left edges of the frame, runs the
 * full {@link chrome.hudHeight} for the wallet, then steps down to
 * {@link chrome.progressHeight} at `stepX` for the progress bar.
 *
 *   (0,0) ─────────────────────── (w,0)
 *     │                              │
 *     │            progress strip    ╯ step, rounded
 *     │        ╭─────────────────────
 *   wallet     │  <- square inner corner
 *     │        │
 *     ╰────────╯ rounded
 *
 * Drawing it as one path is the whole point: there is no interior edge, so no
 * doubled gold rim and no seam line to suppress. That also leaves the shared
 * {@link drawChrome} helper — which `BackTab` depends on — untouched.
 */
function drawHudChrome(
  ctx: CanvasRenderingContext2D, w: number, h: number, stepX: number, stepH: number,
): void {
  const i = 1; // keep the 2px stroke inside the canvas
  const r = chrome.radius;

  ctx.beginPath();
  ctx.moveTo(i, i);
  ctx.lineTo(w - i, i);
  ctx.lineTo(w - i, stepH - i - r);
  ctx.arcTo(w - i, stepH - i, w - i - r, stepH - i, r);
  ctx.lineTo(stepX, stepH - i);
  ctx.lineTo(stepX, h - i - r);
  ctx.arcTo(stepX, h - i, stepX - r, h - i, r);
  ctx.lineTo(i, h - i);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(color.panel, 0.97));
  grad.addColorStop(1, rgba(color.feltEdge, 0.97));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = rgba(color.goldDim, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
}

// --- textures ---------------------------------------------------------------

/** The felt table: lit centre, vignetted corners, faint dot grid, cloth noise. */
function bakeBackdrop(scene: Phaser.Scene, w: number, h: number): void {
  bake(scene, TEX.backdrop, w, h, (ctx) => {
    const lit = ctx.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h * 0.42, w * 0.72);
    lit.addColorStop(0, rgba(color.felt));
    lit.addColorStop(0.55, rgba(0x1b5540));
    lit.addColorStop(1, rgba(color.feltEdge));
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, h);

    // Dot grid, straight off the mockup.
    ctx.fillStyle = rgba(color.cream, 0.045);
    for (let y = 13; y < h; y += 26) {
      for (let x = 13; x < w; x += 26) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Cloth noise — deterministic so screenshots reproduce.
    const rnd = seeded(0xfe17);
    for (let i = 0; i < 5200; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.fillStyle = rnd() > 0.5 ? rgba(color.cream, 0.022) : rgba(color.shadow, 0.05);
      ctx.fillRect(x, y, 1.6, 1.6);
    }

    // Edge vignette on top of everything, to seat the frame.
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.34, w / 2, h / 2, w * 0.78);
    vig.addColorStop(0, rgba(color.shadow, 0));
    vig.addColorStop(1, rgba(color.shadow, 0.62));
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });
}

/** A bet orb: dark glass sphere, gold rim, specular highlight. */
function bakeOrb(scene: Phaser.Scene, key: string, hover: boolean): void {
  const size = 220;
  const r = size / 2;
  bake(scene, key, size, size, (ctx) => {
    const glass = ctx.createRadialGradient(r * 0.72, r * 0.66, r * 0.1, r, r, r);
    glass.addColorStop(0, rgba(0x2c7a5a));
    glass.addColorStop(0.62, rgba(color.panel));
    glass.addColorStop(1, rgba(color.feltEdge));
    ctx.beginPath();
    ctx.arc(r, r, r - 6, 0, Math.PI * 2);
    ctx.fillStyle = glass;
    ctx.fill();

    // Gold rim; brighter and thicker on hover.
    ctx.beginPath();
    ctx.arc(r, r, r - 6, 0, Math.PI * 2);
    ctx.lineWidth = hover ? 5 : 3;
    ctx.strokeStyle = hover ? rgba(color.goldBright, 0.95) : rgba(color.gold, 0.8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(r, r, r - 18, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color.goldDim, 0.45);
    ctx.stroke();

    // Specular highlight, upper-left.
    const spec = ctx.createRadialGradient(r * 0.68, r * 0.6, 2, r * 0.68, r * 0.6, r * 0.85);
    spec.addColorStop(0, rgba(color.cream, hover ? 0.2 : 0.14));
    spec.addColorStop(1, rgba(color.cream, 0));
    ctx.beginPath();
    ctx.arc(r, r, r - 8, 0, Math.PI * 2);
    ctx.fillStyle = spec;
    ctx.fill();
  });
}

/** The shared worn card face: aged cream stock, ink border, foxing. */
function bakeCardFace(scene: Phaser.Scene, key: string, hover: boolean): void {
  const { width: w, height: h } = CARD_SOURCE;
  bake(scene, key, w, h, (ctx) => {
    const stock = ctx.createLinearGradient(0, 0, w * 0.4, h);
    stock.addColorStop(0, rgba(color.cardFace));
    stock.addColorStop(1, rgba(color.cardEdge));
    roundedPath(ctx, 3, 3, w - 6, h - 6, [20, 20, 20, 20]);
    ctx.fillStyle = stock;
    ctx.fill();

    // Worn, darkened corners.
    const rnd = seeded(0x0cad);
    for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
      const wear = ctx.createRadialGradient(cx, cy, 4, cx, cy, 96);
      wear.addColorStop(0, rgba(color.inkSoft, 0.22));
      wear.addColorStop(1, rgba(color.inkSoft, 0));
      ctx.fillStyle = wear;
      ctx.fill();
    }

    // Foxing: age spots freckled across the stock.
    for (let i = 0; i < 260; i++) {
      const x = 8 + rnd() * (w - 16);
      const y = 8 + rnd() * (h - 16);
      ctx.fillStyle = rgba(color.inkSoft, 0.03 + rnd() * 0.05);
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + rnd() * 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Border + hairline inner frame. The foxing loop above left its own arc as
    // the current path, so the border outline has to be re-issued.
    roundedPath(ctx, 3, 3, w - 6, h - 6, [20, 20, 20, 20]);
    ctx.lineWidth = hover ? 5 : 2.5;
    ctx.strokeStyle = hover ? rgba(color.gold, 0.95) : rgba(color.inkSoft, 0.55);
    ctx.stroke();

    roundedPath(ctx, 15, 15, w - 30, h - 30, [12, 12, 12, 12]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color.inkSoft, 0.3);
    ctx.stroke();
  });
}

/**
 * A machine's ink overlay, baked at full card size: a suit index in two opposite
 * corners plus the central emblem. Kept separate from the face so one worn-stock
 * texture (and one hover variant) serves all three machines.
 */
function bakeCardArt(
  scene: Phaser.Scene, key: string, suit: string, suitColor: number,
  emblem: (ctx: CanvasRenderingContext2D, cx: number, cy: number) => void,
): void {
  const { width: w, height: h } = CARD_SOURCE;
  bake(scene, key, w, h, (ctx) => {
    ctx.font = `700 34px ${font.display}`;
    ctx.fillStyle = rgba(suitColor, 0.9);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(suit, 40, 44);
    ctx.save();
    ctx.translate(w - 40, h - 44);
    ctx.rotate(Math.PI); // the bottom index reads upside-down, as on a real card
    ctx.fillText(suit, 0, 0);
    ctx.restore();

    emblem(ctx, w / 2, h / 2 - 10);
  });
}

function bakeUiTextures(scene: Phaser.Scene): void {
  // --- Screen-edge chrome. Square where it meets the frame, rounded inward. ---
  const r = chrome.radius;
  bake(scene, TEX.hudChrome, chrome.walletWidth + chrome.progressWidth, chrome.hudHeight,
    (ctx, w, h) => drawHudChrome(ctx, w, h, chrome.walletWidth, chrome.progressHeight));
  bake(scene, TEX.backTab, chrome.backWidth, chrome.backHeight,
    (ctx, w, h) => drawChrome(ctx, w, h, [0, r, 0, 0]));
  bake(scene, TEX.backTabHover, chrome.backWidth, chrome.backHeight,
    (ctx, w, h) => drawChrome(ctx, w, h, [0, r, 0, 0], true));

  // --- Orbs + bet icons (gold/cream, since the orb face is dark). ---
  bakeOrb(scene, TEX.orb, false);
  bakeOrb(scene, TEX.orbHover, true);

  bake(scene, TEX.orbBeer, 96, 96, (ctx) => {
    ctx.fillStyle = rgba(color.gold);
    roundedPath(ctx, 26, 28, 36, 48, [4, 4, 8, 8]);
    ctx.fill();
    ctx.fillStyle = rgba(color.cream, 0.92); // foam
    roundedPath(ctx, 26, 24, 36, 13, [6, 6, 0, 0]);
    ctx.fill();
    ctx.lineWidth = 5; // handle
    ctx.strokeStyle = rgba(color.goldDim);
    roundedPath(ctx, 62, 38, 16, 26, [8, 8, 8, 8]);
    ctx.stroke();
  });

  bake(scene, TEX.orbMarket, 96, 96, (ctx) => {
    // A descending line — the crash is the outcome the player wants.
    ctx.lineWidth = 6;
    ctx.strokeStyle = rgba(color.gold);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(18, 26);
    ctx.lineTo(40, 48);
    ctx.lineTo(54, 36);
    ctx.lineTo(72, 60);
    ctx.stroke();
    ctx.beginPath(); // arrowhead
    ctx.moveTo(78, 66);
    ctx.lineTo(58, 60);
    ctx.lineTo(74, 44);
    ctx.closePath();
    ctx.fillStyle = rgba(color.gold);
    ctx.fill();
  });

  bake(scene, TEX.orbCasino, 96, 96, (ctx) => {
    ctx.fillStyle = rgba(color.cream);
    roundedPath(ctx, 30, 20, 40, 56, [6, 6, 6, 6]);
    ctx.fill();
    ctx.fillStyle = rgba(color.red);
    ctx.font = `700 34px ${font.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♦', 50, 49);
  });

  // --- Casino cards: shared worn face + per-machine ink overlay. ---
  bakeCardFace(scene, TEX.card, false);
  bakeCardFace(scene, TEX.cardHover, true);

  bakeCardArt(scene, TEX.cardRoulette, '♦', color.red, (ctx, cx, cy) => {
    ctx.lineWidth = 6;
    ctx.strokeStyle = rgba(color.ink, 0.85);
    ctx.beginPath();
    ctx.arc(cx, cy, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(color.inkSoft, 0.8);
    for (let a = 0; a < 8; a++) {
      const rad = (a / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(rad) * 62, cy + Math.sin(rad) * 62);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba(color.red, 0.85);
    ctx.stroke();
    ctx.beginPath(); // the ball
    ctx.arc(cx, cy - 62, 7, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color.ink);
    ctx.fill();
  });

  bakeCardArt(scene, TEX.cardBlackjack, '♥', color.red, (ctx, cx, cy) => {
    // Two dealt cards, outlined in ink on the stock.
    for (const [dx, dy, rot] of [[-22, 6, -0.14], [16, -4, 0.12]]) {
      ctx.save();
      ctx.translate(cx + dx, cy + dy);
      ctx.rotate(rot);
      roundedPath(ctx, -30, -44, 60, 88, [7, 7, 7, 7]);
      ctx.fillStyle = rgba(color.cardFace, 0.85);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(color.ink, 0.8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.font = `700 30px ${font.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(color.red, 0.9);
    ctx.fillText('♥', cx + 18, cy - 4);
    ctx.fillStyle = rgba(color.ink, 0.9);
    ctx.fillText('♠', cx - 24, cy + 8);
  });

  bakeCardArt(scene, TEX.cardSlots, '♠', color.ink, (ctx, cx, cy) => {
    const pips = [color.ink, color.red, color.ink];
    for (let i = 0; i < 3; i++) {
      const x = cx - 66 + i * 46;
      roundedPath(ctx, x - 18, cy - 40, 36, 80, [5, 5, 5, 5]);
      ctx.fillStyle = rgba(color.cardEdge, 0.7);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(color.ink, 0.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, cy, 11, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pips[i], 0.85);
      ctx.fill();
    }
  });

  // --- Slot machine chrome ---
  bake(scene, TEX.slotFrame, 96, 96, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(color.panel));
    grad.addColorStop(1, rgba(color.feltEdge));
    roundedPath(ctx, 2, 2, w - 4, h - 4, [18, 18, 18, 18]);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = rgba(color.gold, 0.85);
    ctx.stroke();
    roundedPath(ctx, 11, 11, w - 22, h - 22, [12, 12, 12, 12]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color.goldDim, 0.5);
    ctx.stroke();
  });

  bake(scene, TEX.lever, 60, 220, (ctx) => {
    ctx.fillStyle = rgba(color.goldDim);
    roundedPath(ctx, 24, 40, 12, 170, [6, 6, 6, 6]);
    ctx.fill();
    const knob = ctx.createRadialGradient(24, 22, 3, 30, 30, 26);
    knob.addColorStop(0, rgba(color.goldBright));
    knob.addColorStop(1, rgba(color.goldDim));
    ctx.beginPath();
    ctx.arc(30, 30, 26, 0, Math.PI * 2);
    ctx.fillStyle = knob;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = rgba(color.shadow, 0.4);
    ctx.stroke();
  });

  // --- Slot "changing image" reactions. Gold = the celebrated LOSS of money. ---
  const reactionFace = (
    key: string, faceColor: number, mouth: 'flat' | 'smile' | 'frown',
  ): void => {
    bake(scene, key, 200, 140, (ctx, w, h) => {
      roundedPath(ctx, 1, 1, w - 2, h - 2, [12, 12, 12, 12]);
      ctx.fillStyle = rgba(color.feltEdge, 0.95);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(faceColor, 0.7);
      ctx.stroke();

      ctx.fillStyle = rgba(faceColor);
      if (mouth === 'frown') {
        ctx.fillRect(70, 54, 16, 8); // squeezed-shut eyes
        ctx.fillRect(114, 54, 16, 8);
      } else {
        ctx.beginPath();
        ctx.arc(78, 58, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(122, 58, 9, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineWidth = 6;
      ctx.strokeStyle = rgba(faceColor);
      ctx.beginPath();
      if (mouth === 'flat') {
        ctx.moveTo(78, 96);
        ctx.lineTo(122, 96);
      } else if (mouth === 'smile') {
        ctx.arc(100, 84, 26, 0.15 * Math.PI, 0.85 * Math.PI);
      } else {
        ctx.arc(100, 112, 26, 1.15 * Math.PI, 1.85 * Math.PI);
      }
      ctx.stroke();
    });
  };
  reactionFace(TEX.reactionNeutral, color.creamDim, 'flat');
  reactionFace(TEX.reactionWin, color.gold, 'smile');
  reactionFace(TEX.reactionLoss, color.red, 'frown');
}

/** A pill-shaped control surface: panel fill, gold rim, top sheen. */
function bakeButton(scene: Phaser.Scene, key: string, hover: boolean): void {
  bake(scene, key, 256, 72, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(hover ? 0x1a4c37 : color.panel));
    grad.addColorStop(1, rgba(color.feltEdge));
    roundedPath(ctx, 2, 2, w - 4, h - 4, [14, 14, 14, 14]);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = hover ? 3 : 2;
    ctx.strokeStyle = hover ? rgba(color.goldBright, 0.95) : rgba(color.goldDim, 0.8);
    ctx.stroke();

    const sheen = ctx.createLinearGradient(0, 2, 0, h * 0.5);
    sheen.addColorStop(0, rgba(color.cream, hover ? 0.12 : 0.07));
    sheen.addColorStop(1, rgba(color.cream, 0));
    roundedPath(ctx, 4, 4, w - 8, h * 0.46, [12, 12, 0, 0]);
    ctx.fillStyle = sheen;
    ctx.fill();
  });
}

/** The plate behind a slot symbol's icon. Symbol hues are the game's own art. */
function bakeSymbolTile(scene: Phaser.Scene, key: string, tint: number): void {
  bake(scene, key, 128, 128, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, rgba(tint, 0.95));
    grad.addColorStop(1, rgba(tint, 0.6));
    roundedPath(ctx, 3, 3, w - 6, h - 6, [16, 16, 16, 16]);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(color.goldDim, 0.85);
    ctx.stroke();
  });
}

/** A particle disc: `c` with a cream glint, so the hue still reads at 8px. */
function bakeDisc(scene: Phaser.Scene, key: string, r: number, c: number): void {
  bake(scene, key, r * 2, r * 2, (ctx) => {
    const grad = ctx.createRadialGradient(r * 0.7, r * 0.7, 1, r, r, r);
    grad.addColorStop(0, rgba(color.cream, 0.85));
    grad.addColorStop(0.45, rgba(c));
    grad.addColorStop(1, rgba(c, 0.9));
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  });
}

export function bakeAll(scene: Phaser.Scene): void {
  bakeBackdrop(scene, GAME_WIDTH, GAME_HEIGHT);
  for (const s of SLOT_SYMBOLS) {
    bakeSymbolTile(scene, symbolTextureKey(s), symbolStyle(s).color);
  }
  bakeButton(scene, TEX.button, false);
  bakeButton(scene, TEX.buttonHover, true);
  bake(scene, TEX.panel, 256, 256, (ctx, w, h) => drawChrome(ctx, w, h, [16, 16, 16, 16]));
  bakeDisc(scene, TEX.coin, 8, color.gold);
  bakeDisc(scene, TEX.glitch, 6, color.red);
  bakeUiTextures(scene);
}
