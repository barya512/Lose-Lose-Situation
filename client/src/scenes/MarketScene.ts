import Phaser from 'phaser';
import { mountMarketPanel } from '../ui/MarketPanel';
import { paintBackdrop } from '../ui/Backdrop';
import { fitCamera } from '../core/viewport';

export class MarketScene extends Phaser.Scene {
  private teardown?: () => void;

  constructor() {
    super('Market');
  }

  create(): void {
    // Sits behind the DOM panel; visible in the gaps and while it mounts.
    fitCamera(this);
    paintBackdrop(this);

    // Settle juice is applied by the global bet watcher (see main.ts), so it
    // reaches the player in any scene rather than only this one.
    this.teardown = mountMarketPanel(() => {
      this.teardown?.();
      this.teardown = undefined;
      this.scene.start('Poison');
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.teardown?.();
      this.teardown = undefined;
    });
  }
}
