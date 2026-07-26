import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { session } from '../core/session';
import { dollars } from '../core/money';
import { chrome, color, text } from '../core/theme';
import type { User } from '../core/types';

/**
 * The wallet readout, in the top-LEFT corner of the frame. Only the live text —
 * the chrome behind it belongs to the shared L drawn by {@link mountTopHud}.
 */
export class WalletPanel extends Phaser.GameObjects.Container {
  private balanceText: Phaser.GameObjects.Text;
  private displayedCents = 0;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);

    const label = scene.add.text(20, 18, 'BALANCE', text.label);
    this.balanceText = scene.add.text(20, 40, dollars(0), text.money);
    this.add([label, this.balanceText]);
    scene.add.existing(this);

    this.unsubscribe = session.onChange((u) => this.render(u));
    if (session.user) {
      this.displayedCents = session.displayBalanceCents;
      this.render(session.user);
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private render(_user: User): void {
    const from = this.displayedCents;
    const to = session.displayBalanceCents;
    this.displayedCents = to;

    // A passive drain fires onChange at 10Hz. Tweening each of those would pile
    // up ~4 overlapping counters at all times, and they'd fight each other over
    // the same label. The drain is already smooth by construction, so only a
    // discrete change (a wager settling) earns the ease.
    if (session.user?.drain_rate_cents_per_s) {
      this.balanceText.setText(dollars(to));
      return;
    }

    this.scene.tweens.addCounter({
      from, to, duration: 400, ease: 'Cubic.Out',
      onUpdate: (tw) => this.balanceText.setText(dollars(Math.round(tw.getValue() ?? to))),
    });
  }
}

/**
 * How far the run has travelled toward $0 — the win condition. A bare bar, with
 * no caption: it lives in the short step of the HUD's L, immediately right of
 * the wallet it is read against.
 */
export class ProgressPanel extends Phaser.GameObjects.Container {
  private barFill: Phaser.GameObjects.Rectangle;
  private unsubscribe: () => void;
  private readonly barWidth: number;

  constructor(scene: Phaser.Scene, x: number) {
    super(scene, x, 0);
    this.barWidth = chrome.progressWidth - 40;
    const midY = chrome.progressHeight / 2;

    const trough = scene.add
      .rectangle(20, midY, this.barWidth, 14, color.feltEdge)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, color.goldDim, 0.7);
    this.barFill = scene.add.rectangle(20, midY, 0, 14, color.gold).setOrigin(0, 0.5);
    this.add([trough, this.barFill]);
    scene.add.existing(this);

    this.unsubscribe = session.onChange(() => this.render());
    this.render();
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private render(): void {
    this.barFill.width = this.barWidth * session.progressToZero();
  }
}

/**
 * Build the whole top HUD for a scene: one L-shaped plate of chrome, then the
 * two live readouts on top of it. Both readouts are pure output — nothing up
 * here is clickable, and both unsubscribe themselves on scene shutdown, so a
 * caller never needs a handle on them.
 */
export function mountTopHud(scene: Phaser.Scene): void {
  scene.add
    .image(0, 0, TEX.hudChrome)
    .setOrigin(0, 0)
    .setDisplaySize(chrome.walletWidth + chrome.progressWidth, chrome.hudHeight);
  new WalletPanel(scene);
  new ProgressPanel(scene, chrome.walletWidth);
}
