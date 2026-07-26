import Phaser from 'phaser';
import { mountMarketPanel } from '../ui/MarketPanel';
import { paintBackdrop } from '../ui/Backdrop';
import { juice } from '../core/juice';
import { outcome } from '../core/theme';
import { audio } from '../core/audio';
import { GAME_WIDTH, GAME_HEIGHT, fitCamera } from '../core/viewport';

export class MarketScene extends Phaser.Scene {
  private teardown?: () => void;

  constructor() {
    super('Market');
  }

  create(): void {
    // Sits behind the DOM panel; visible in the gaps and while it mounts.
    fitCamera(this);
    paintBackdrop(this);

    this.teardown = mountMarketPanel(
      () => {
        this.teardown?.();
        this.teardown = undefined;
        this.scene.start('Poison');
      },
      {
        onWon: () => {
          // BAD outcome: the player's direction call was right, balance grew.
          if (!this.scene.isActive()) return;
          juice.glitch(this);
          juice.flash(this, outcome.punish);
          audio.playGainPunish();
        },
        onLost: () => {
          // GOOD outcome: money lost is the goal.
          if (!this.scene.isActive()) return;
          juice.flash(this, outcome.reward);
          juice.coinBurst(this, GAME_WIDTH / 2, GAME_HEIGHT / 2);
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
