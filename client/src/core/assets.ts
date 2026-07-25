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
} as const;

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

export function bakeAll(scene: Phaser.Scene): void {
  for (const s of SLOT_SYMBOLS) {
    bakeRoundedTile(scene, symbolTextureKey(s), 128, 128, symbolStyle(s).color);
  }
  bakeRoundedTile(scene, TEX.button, 256, 72, 0x3a2456);
  bakeRoundedTile(scene, TEX.panel, 256, 256, 0x170a26);
  bakeCircle(scene, TEX.coin, 8, 0xffe066);
  bakeCircle(scene, TEX.glitch, 6, 0xff3ea5);
}
