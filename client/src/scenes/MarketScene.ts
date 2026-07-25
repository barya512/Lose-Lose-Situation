import Phaser from 'phaser';
import { mountMarketPanel } from '../ui/MarketPanel';
import { juice } from '../core/juice';
import { audio } from '../core/audio';

export class MarketScene extends Phaser.Scene {
  private teardown?: () => void;

  constructor() {
    super('Market');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0a0410');

    this.teardown = mountMarketPanel(
      () => {
        this.teardown?.();
        this.teardown = undefined;
        this.scene.start('Slots');
      },
      {
        onWon: () => {
          // BAD outcome: the player's direction call was right, balance grew.
          if (!this.scene.isActive()) return;
          juice.glitch(this);
          juice.flash(this, 0xff3ea5);
          audio.playGainPunish();
        },
        onLost: () => {
          // GOOD outcome: money lost is the goal.
          if (!this.scene.isActive()) return;
          juice.flash(this, 0x3ddc84);
          juice.coinBurst(this, this.scale.width / 2, this.scale.height / 2);
          juice.shake(this);
          audio.playLossReward();
        },
      },
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardown?.();
      this.teardown = undefined;
    });
  }
}
