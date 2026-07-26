// The single home of the game's look: colours, type and the named text styles
// every scene and widget draws with. Phaser-free on purpose — the DOM overlays
// (auth form, market panel, TradingView chart) need the same palette as CSS
// strings, and keeping this module engine-agnostic lets them share it. Editing
// it hot-reloads through Vite, so the palette is tunable mid-playtest, same
// bargain as `core/config.ts`.
//
// Look: a green casino felt table with gold and cream — casino/Balatro.
//
// Semantics matter more than hue here. This game is inverted: reaching $0 WINS,
// so a spin that DRAINS money is the celebrated outcome. Green used to carry
// that meaning, but the table is now green, so gold does instead — see `reward`
// and `punish` below and always reference those rather than a raw colour.

import { RENDER_SCALE } from './viewport';

/** Every colour, as a Phaser-friendly number. */
export const color = {
  felt: 0x256b4f, // backdrop centre
  feltEdge: 0x0e3626, // backdrop vignette + letterbox
  panel: 0x103a29, // HUD and panel fill
  gold: 0xe8c15a, // reward, accents, headings
  goldDim: 0xa98436, // rims, borders, bar troughs
  goldBright: 0xfff0b8, // flashes, highlights
  cream: 0xf2e8d5, // body text
  creamDim: 0xc9bfa8, // labels, secondary text
  cardFace: 0xf0e6d2, // worn card stock
  cardEdge: 0xd9c9a8, // aged card border
  ink: 0x1e2a24, // text and art printed on cream
  inkSoft: 0x4a574f, // secondary ink
  red: 0xb3252b, // punish
  redBright: 0xe04a4a, // glitch particles, error text
  shadow: 0x061a12, // drop shadows, cooldown wipes
} as const;

type ColorName = keyof typeof color;

/** `#rrggbb` form of {@link color}, for CSS in the DOM overlays. */
export const css = Object.fromEntries(
  Object.entries(color).map(([k, v]) => [k, `#${v.toString(16).padStart(6, '0')}`]),
) as Record<ColorName, string>;

/**
 * Outcome semantics. The player WINS by losing money, so `reward` marks a
 * balance that went DOWN and `punish` a balance that went UP.
 */
export const outcome = {
  reward: color.gold,
  punish: color.red,
} as const;

/** {@link outcome} as CSS, for the DOM-rendered screens. */
export const outcomeCss = {
  reward: css.gold,
  punish: css.red,
} as const;

export const font = {
  /** Display serif — titles, money, anything that should feel engraved. */
  display: '"Playfair Display", Georgia, serif',
  /** Wide letterspaced sans — labels, buttons, body copy. */
  ui: 'Inter, system-ui, sans-serif',
} as const;

/** Families to wait for before the first scene draws text. See BootScene. */
export const FONTS_TO_LOAD = [
  '700 40px "Playfair Display"',
  'italic 700 40px "Playfair Display"',
  '600 20px Inter',
] as const;

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * Named text styles. Scenes should reach for one of these rather than spelling
 * out a size and colour, so a type change lands everywhere at once.
 *
 * Sizes are in AUTHORED units (see `core/viewport.ts`), not device pixels.
 * `resolution` is what actually makes the glyphs crisp: it rasterises the text
 * texture at RENDER_SCALE so the zoomed camera samples it 1:1 instead of
 * magnifying a 720p glyph. It belongs on every style — a style that omits it is
 * a soft-text bug, and the one-off sizes in scenes inherit it by spreading a
 * token (`{ ...text.money, fontSize: '22px' }`).
 *
 * `letterSpacing` needs Phaser >= 3.60; we're on 3.90.
 */
export const text = {
  /** Big italic serif scene titles ("choose your poison"). */
  title: {
    fontFamily: font.display, fontSize: '36px', fontStyle: 'italic 700', color: css.cream,
    resolution: RENDER_SCALE,
  },
  /** Gold section headings. */
  heading: {
    fontFamily: font.display, fontSize: '26px', fontStyle: '700', color: css.gold,
    resolution: RENDER_SCALE,
  },
  /** The wallet figure and other engraved numbers. */
  money: {
    fontFamily: font.display, fontSize: '28px', fontStyle: '700', color: css.cream,
    resolution: RENDER_SCALE,
  },
  /** Small wide caps over a panel or control ("BALANCE", "STAKE"). */
  label: {
    fontFamily: font.ui, fontSize: '13px', fontStyle: '600',
    color: css.creamDim, letterSpacing: 5, resolution: RENDER_SCALE,
  },
  /** An orb's name, revealed on hover. */
  orbName: {
    fontFamily: font.ui, fontSize: '18px', fontStyle: '600',
    color: css.cream, letterSpacing: 6, resolution: RENDER_SCALE,
  },
  /** An orb's one-line description, revealed on hover under its name. */
  orbDesc: {
    fontFamily: font.ui, fontSize: '14px', color: css.creamDim,
    resolution: RENDER_SCALE,
  },
  /** A machine card's name, set below the card. */
  cardName: {
    fontFamily: font.ui, fontSize: '17px', fontStyle: '600',
    color: css.cream, letterSpacing: 5, resolution: RENDER_SCALE,
  },
  /** Button labels. */
  button: {
    fontFamily: font.ui, fontSize: '18px', fontStyle: '600',
    color: css.cream, letterSpacing: 3, resolution: RENDER_SCALE,
  },
  /** Body copy — prompts, taglines, paytable rows. */
  body: {
    fontFamily: font.ui, fontSize: '16px', color: css.creamDim,
    resolution: RENDER_SCALE,
  },
  /** Transient error/coming-soon messages. */
  toast: {
    fontFamily: font.ui, fontSize: '16px', color: css.redBright,
    resolution: RENDER_SCALE,
  },
} as const satisfies Record<string, TextStyle>;

/** Screen-edge chrome geometry, shared by the HUD panels and the back tab. */
export const chrome = {
  /** Height of the wallet half — the tall part of the HUD's L. */
  hudHeight: 92,
  walletWidth: 264,
  progressWidth: 300,
  /**
   * Height of the progress half. Deliberately shorter than {@link hudHeight}:
   * the two are welded into one L-shaped piece that steps down at
   * {@link walletWidth}, so this is the height of that step, not a panel.
   */
  progressHeight: 48,
  backWidth: 208,
  backHeight: 64,
  /** Corner radius on the rounded (inward-facing) corners of edge chrome. */
  radius: 18,
  /** First safe y for scene content, clear of the HUD panels. */
  contentTop: 128,
} as const;
