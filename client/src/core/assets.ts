import Phaser from 'phaser';
import cherryIcon from '../../../assets/CHERRY.png';
import lemonIcon from '../../../assets/LEMON.png';
import bellIcon from '../../../assets/BELL.png';
import starIcon from '../../../assets/STAR.png';
import sevenIcon from '../../../assets/SEVEN.png';
import skullIcon from '../../../assets/SKULL.png';

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
  button: 'ui.button',
  panel: 'ui.panel',
  coin: 'particle.coin',
  glitch: 'particle.glitch',
  // Orb (bet-select) + its bet icons.
  orb: 'ui.orb',
  orbBeer: 'ui.orb.beer',
  orbMarket: 'ui.orb.market',
  orbCasino: 'ui.orb.casino',
  // Casino cards + their art.
  card: 'ui.card',
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

/** Corner inset for the {@link TEX.slotFrame} nine-slice (px). */
export const SLOT_FRAME_INSET = 24;

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

/** Bake an arbitrary drawing into a texture — keeps the placeholder art terse. */
function bakeGraphics(
  scene: Phaser.Scene, key: string, w: number, h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function bakeUiTextures(scene: Phaser.Scene): void {
  // --- Orb + bet icons ---
  bakeGraphics(scene, TEX.orb, 180, 180, (g) => {
    g.fillStyle(0x170a26, 1).fillCircle(90, 90, 88);
    g.lineStyle(6, 0xff3ea5, 1).strokeCircle(90, 90, 84);
    g.lineStyle(2, 0xb197fc, 0.6).strokeCircle(90, 90, 74);
  });
  bakeGraphics(scene, TEX.orbBeer, 96, 96, (g) => {
    g.fillStyle(0xffe066, 1).fillRoundedRect(28, 26, 34, 50, 6);
    g.fillStyle(0xffffff, 0.9).fillRect(28, 26, 34, 12); // foam
    g.lineStyle(5, 0xffa94d, 1).strokeRoundedRect(62, 36, 16, 26, 8); // handle
  });
  bakeGraphics(scene, TEX.orbMarket, 96, 96, (g) => {
    g.lineStyle(6, 0x74c0fc, 1);
    g.beginPath();
    g.moveTo(18, 26); g.lineTo(40, 48); g.lineTo(54, 36); g.lineTo(72, 60);
    g.strokePath();
    g.fillStyle(0x74c0fc, 1).fillTriangle(78, 66, 58, 60, 74, 44); // arrowhead
  });
  bakeGraphics(scene, TEX.orbCasino, 96, 96, (g) => {
    g.fillStyle(0xffffff, 1).fillRoundedRect(30, 20, 40, 56, 6);
    g.fillStyle(0xff3ea5, 1).fillCircle(50, 48, 12); // pip
  });

  // --- Casino cards + art ---
  bakeGraphics(scene, TEX.card, 300, 420, (g) => {
    g.fillStyle(0x1f1030, 1).fillRoundedRect(0, 0, 300, 420, 20);
    g.lineStyle(4, 0xb197fc, 0.8).strokeRoundedRect(3, 3, 294, 414, 18);
  });
  bakeGraphics(scene, TEX.cardRoulette, 180, 180, (g) => {
    g.lineStyle(8, 0xff3ea5, 1).strokeCircle(90, 90, 70);
    g.lineStyle(3, 0x74c0fc, 0.8);
    for (let a = 0; a < 8; a++) {
      const rad = (a / 8) * Math.PI * 2;
      g.lineBetween(90, 90, 90 + Math.cos(rad) * 70, 90 + Math.sin(rad) * 70);
    }
    g.lineStyle(4, 0xb197fc, 1).strokeCircle(90, 90, 34);
    g.fillStyle(0x3ddc84, 1).fillCircle(90, 20, 8); // ball
  });
  bakeGraphics(scene, TEX.cardBlackjack, 180, 180, (g) => {
    g.fillStyle(0xffffff, 1).fillRoundedRect(40, 52, 60, 84, 8);
    g.fillStyle(0xf2f2f2, 1).fillRoundedRect(82, 42, 60, 84, 8);
    g.fillStyle(0xff3ea5, 1).fillCircle(112, 84, 12);
    g.fillStyle(0x0a0410, 1).fillCircle(70, 94, 10);
  });
  bakeGraphics(scene, TEX.cardSlots, 180, 180, (g) => {
    const pips = [0xffe066, 0x74c0fc, 0xff3ea5];
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0x2a1640, 1).fillRoundedRect(30 + i * 44, 50, 36, 80, 6);
      g.fillStyle(pips[i], 1).fillCircle(48 + i * 44, 90, 12);
    }
  });

  // --- Slot machine chrome ---
  bakeGraphics(scene, TEX.slotFrame, 96, 96, (g) => {
    g.fillStyle(0x170a26, 1).fillRoundedRect(0, 0, 96, 96, 18);
    g.lineStyle(6, 0xff3ea5, 1).strokeRoundedRect(3, 3, 90, 90, 16);
    g.lineStyle(2, 0xb197fc, 0.5).strokeRoundedRect(10, 10, 76, 76, 12);
  });
  bakeGraphics(scene, TEX.lever, 60, 220, (g) => {
    g.fillStyle(0x3a2456, 1).fillRoundedRect(24, 40, 12, 170, 6); // shaft
    g.fillStyle(0xff3ea5, 1).fillCircle(30, 30, 26); // knob
    g.lineStyle(3, 0xffffff, 0.4).strokeCircle(30, 30, 26);
  });

  // --- Slot "changing image" reactions ---
  bakeGraphics(scene, TEX.reactionNeutral, 200, 140, (g) => {
    g.fillStyle(0x2a1640, 1).fillRoundedRect(0, 0, 200, 140, 12);
    g.fillStyle(0xb197fc, 1).fillCircle(78, 60, 8).fillCircle(122, 60, 8);
    g.lineStyle(5, 0xb197fc, 1).lineBetween(78, 96, 122, 96); // flat mouth
  });
  bakeGraphics(scene, TEX.reactionWin, 200, 140, (g) => {
    g.fillStyle(0x123021, 1).fillRoundedRect(0, 0, 200, 140, 12);
    g.fillStyle(0x3ddc84, 1).fillCircle(78, 58, 9).fillCircle(122, 58, 9);
    g.lineStyle(6, 0x3ddc84, 1);
    g.beginPath(); g.arc(100, 84, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.strokePath();
  });
  bakeGraphics(scene, TEX.reactionLoss, 200, 140, (g) => {
    g.fillStyle(0x3a0f2a, 1).fillRoundedRect(0, 0, 200, 140, 12);
    g.fillStyle(0xff3ea5, 1).fillRect(70, 54, 16, 8).fillRect(114, 54, 16, 8);
    g.lineStyle(6, 0xff3ea5, 1);
    g.beginPath(); g.arc(100, 110, 26, 1.15 * Math.PI, 1.85 * Math.PI); g.strokePath();
  });
}

export function bakeAll(scene: Phaser.Scene): void {
  for (const s of SLOT_SYMBOLS) {
    bakeRoundedTile(scene, symbolTextureKey(s), 128, 128, symbolStyle(s).color);
  }
  bakeRoundedTile(scene, TEX.button, 256, 72, 0x3a2456);
  bakeRoundedTile(scene, TEX.panel, 256, 256, 0x170a26);
  bakeCircle(scene, TEX.coin, 8, 0xffe066);
  bakeCircle(scene, TEX.glitch, 6, 0xff3ea5);
  bakeUiTextures(scene);
}
