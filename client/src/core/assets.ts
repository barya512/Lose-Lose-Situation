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
