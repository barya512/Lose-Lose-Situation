import Phaser from 'phaser';
import { session } from '../core/session';
import type { User } from '../core/types';

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export class WalletHud extends Phaser.GameObjects.Container {
  private balanceText: Phaser.GameObjects.Text;
  private lostText: Phaser.GameObjects.Text;
  private barBg: Phaser.GameObjects.Rectangle;
  private barFill: Phaser.GameObjects.Rectangle;
  private displayedCents = 0;
  private unsubscribe: () => void;
  private readonly barWidth = 360;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.add(scene.add.text(0, -34, 'BALANCE', { fontSize: '16px', color: '#b197fc' }));
    this.balanceText = scene.add.text(0, -12, '$0.00', {
      fontSize: '40px', color: '#ffffff', fontStyle: 'bold',
    });
    this.lostText = scene.add.text(0, 34, 'lost so far: $0.00', {
      fontSize: '18px', color: '#74c0fc',
    });

    this.barBg = scene.add.rectangle(0, 70, this.barWidth, 14, 0x2a1640).setOrigin(0, 0.5);
    this.barFill = scene.add.rectangle(0, 70, 0, 14, 0x3ddc84).setOrigin(0, 0.5);
    this.add([this.balanceText, this.lostText, this.barBg, this.barFill]);

    scene.add.existing(this);

    this.unsubscribe = session.onChange((u) => this.render(u));
    if (session.user) {
      this.displayedCents = session.user.balance_cents;
      this.render(session.user);
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribe());
  }

  private render(user: User): void {
    this.lostText.setText(`lost so far: ${dollars(user.total_lost_cents)}`);
    this.barFill.width = this.barWidth * session.progressToZero();

    const from = this.displayedCents;
    const to = user.balance_cents;
    this.displayedCents = to;
    this.scene.tweens.addCounter({
      from, to, duration: 400, ease: 'Cubic.Out',
      onUpdate: (tw) => this.balanceText.setText(dollars(Math.round(tw.getValue() ?? to))),
    });
  }
}
