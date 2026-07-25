import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { SlotsScene } from './scenes/SlotsScene';
import { MarketScene } from './scenes/MarketScene';
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
  // Only process input events that target the canvas. Without this, Phaser's
  // window-level mouse listeners hit-test DOM-overlay clicks (e.g. the auth
  // form) against the buttons behind them — the auth click-through leak.
  input: { windowEvents: false },
  scene: [BootScene, TitleScene, MenuScene, SlotsScene, MarketScene, WinScene],
});

// Module-agnostic win gate: whenever the wallet hits $0 (from any game module),
// stop whatever is active and show the Win screen.
session.onWin(() => {
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key !== 'Win') game.scene.stop(s.scene.key);
  });
  game.scene.start('Win');
});
