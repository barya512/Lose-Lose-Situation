import Phaser from 'phaser';
import './styles/fonts.css';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MenuScene } from './scenes/MenuScene';
import { PoisonScene } from './scenes/PoisonScene';
import { CasinoScene } from './scenes/CasinoScene';
import { SlotsScene } from './scenes/SlotsScene';
import { MarketScene } from './scenes/MarketScene';
import { WinScene } from './scenes/WinScene';
import { session } from './core/session';
import { css } from './core/theme';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE } from './core/viewport';

// The canvas is RENDER_SCALE times the authored size; every scene's camera zooms
// back by the same factor (`fitCamera`). See docs/adr/0006-2x-render-scale.md.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Shows through as the FIT-mode letterbox bars, so it matches the felt's
  // vignetted edge rather than flashing an unrelated colour.
  backgroundColor: css.feltEdge,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH * RENDER_SCALE,
    height: GAME_HEIGHT * RENDER_SCALE,
  },
  // Only process input events that target the canvas. Without this, Phaser's
  // window-level mouse listeners hit-test DOM-overlay clicks (e.g. the auth
  // form) against the buttons behind them — the auth click-through leak.
  input: { windowEvents: false },
  scene: [BootScene, TitleScene, MenuScene, PoisonScene, CasinoScene, SlotsScene, MarketScene, WinScene],
});

// Module-agnostic win gate: whenever the wallet hits $0 (from any game module),
// stop whatever is active and show the Win screen.
session.onWin(() => {
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key !== 'Win') game.scene.stop(s.scene.key);
  });
  game.scene.start('Win');
});
