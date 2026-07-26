import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { session } from '../core/session';
import { dollars } from '../core/money';
import { chrome, color, text } from '../core/theme';
import type { User } from '../core/types';

/**
 * The wallet, welded into the top-LEFT corner of the frame: it touches both the
 * top and left edges, and only its inward-facing corner is rounded.
 */
export class WalletPanel extends Phaser.GameObjects.Container {
  private balanceText: Phaser.GameObjects.Text;
  private displayedCents = 0;
  private unsubscribe: () => void;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    const w = chrome.walletWidth;
    const h = chrome.hudHeight;

    const bg = scene.add.image(0, 0, TEX.walletPanel).setOrigin(0, 0).setDisplaySize(w, h);
    const label = scene.add.text(20, 18, 'BALANCE', text.label);
    this.balanceText = scene.add.text(20, 40, dollars(0), text.money);
    this.add([bg, label, this.balanceText]);
    scene.add.existing(this);

    this.unsubscribe = session.onChange((u) => this.render(u));
    if (session.user) {
      this.displayedCents = session.user.balance_cents;
      this.render(session.user);
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private render(user: User): void {
    const from = this.displayedCents;
    const to = user.balance_cents;
    this.displayedCents = to;
    this.scene.tweens.addCounter({
      from, to, duration: 400, ease: 'Cubic.Out',
      onUpdate: (tw) => this.balanceText.setText(dollars(Math.round(tw.getValue() ?? to))),
    });
  }
}

/**
 * How far the run has travelled toward $0 — the win condition. Sits immediately
 * right of the wallet, touching the top edge, rounded along its bottom.
 */
export class ProgressPanel extends Phaser.GameObjects.Container {
  private barFill: Phaser.GameObjects.Rectangle;
  private unsubscribe: () => void;
  private readonly barWidth: number;

  constructor(scene: Phaser.Scene, x: number) {
    super(scene, x, 0);
    const w = chrome.progressWidth;
    const h = chrome.hudHeight;
    this.barWidth = w - 40;

    const bg = scene.add.image(0, 0, TEX.progressPanel).setOrigin(0, 0).setDisplaySize(w, h);
    const label = scene.add.text(20, 18, 'PROGRESS', text.label);
    const trough = scene.add
      .rectangle(20, 58, this.barWidth, 14, color.feltEdge)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, color.goldDim, 0.7);
    this.barFill = scene.add.rectangle(20, 58, 0, 14, color.gold).setOrigin(0, 0.5);
    this.add([bg, label, trough, this.barFill]);
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
 * Build the whole top HUD for a scene. Both panels are pure readouts — nothing
 * up here is clickable, and both unsubscribe themselves on scene shutdown, so a
 * caller never needs a handle on them.
 */
export function mountTopHud(scene: Phaser.Scene): void {
  new WalletPanel(scene);
  new ProgressPanel(scene, chrome.walletWidth + chrome.hudGap);
}
