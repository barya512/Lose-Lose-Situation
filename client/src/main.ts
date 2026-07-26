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
import { api } from './core/api';
import { BetWatcher } from './core/betWatcher';
import { mountNotificationLayer } from './ui/NotificationLayer';
import { juice } from './core/juice';
import { audio } from './core/audio';
import { css, outcome } from './core/theme';
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

// Cross-screen settle announcements. The watcher polls independently of any
// scene, so a bet placed in the market announces itself in the casino; the
// notification layer is DOM and scene-independent, while juice needs a live
// scene and is applied against whichever one happens to be running.
const notifications = mountNotificationLayer();
const betWatcher = new BetWatcher({
  listBets: () => api.marketBets(),
  refreshUser: () => api.getMe().then((u) => session.setUser(u)),
});

betWatcher.onResolved((bet) => {
  notifications.show(bet);

  const active = game.scene.getScenes(true)[0];
  // No scene mid-transition, and the Win screen has its own ending to deliver.
  if (!active || active.scene.key === 'Win') return;
  if (bet.status === 'LOST') {
    // GOOD outcome: money lost is the goal.
    juice.flash(active, outcome.reward);
    juice.coinBurst(active, GAME_WIDTH / 2, GAME_HEIGHT / 2);
    juice.shake(active);
    audio.playLossReward();
  } else {
    // BAD outcome: the direction call was right, so the balance grew.
    juice.glitch(active);
    juice.flash(active, outcome.punish);
    audio.playGainPunish();
  }
});

if (session.token) betWatcher.start();
session.onWin(() => betWatcher.stop());

// A passive drain crosses $0 on the client's interpolated clock, with no
// request in flight to notice. Confirm ONCE with the server and hand the answer
// to setUser, which fires the same onWin gate every other module uses — no
// second win path, and no trusting the local estimate.
let zeroConfirmed = false;
session.onChange(() => {
  if (zeroConfirmed || session.user?.has_won) return;
  if (!session.user?.drain_rate_cents_per_s) return;
  if (session.displayBalanceCents > 0) return;
  zeroConfirmed = true;
  api.getMe().then((u) => session.setUser(u)).catch(() => { zeroConfirmed = false; });
});

// Module-agnostic win gate: whenever the wallet hits $0 (from any game module),
// stop whatever is active and show the Win screen.
session.onWin(() => {
  game.scene.getScenes(true).forEach((s) => {
    if (s.scene.key !== 'Win') game.scene.stop(s.scene.key);
  });
  game.scene.start('Win');
});
