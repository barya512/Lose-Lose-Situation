import Phaser from 'phaser';
import { audio } from '../core/audio';
import { PressGuard } from '../core/pressGuard';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.add.text(cx, 200, 'LOSE-LOSE SITUATION', {
      fontSize: '56px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(cx, 300, 'your curse is your fortune — lose it all.', {
      fontSize: '24px', color: '#b197fc',
    }).setOrigin(0.5);

    this.add.text(cx, 440, 'reach $0 to WIN.', {
      fontSize: '30px', color: '#3ddc84', fontStyle: 'bold',
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, 560, 'click anywhere to begin', {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    let started = false;
    const go = () => {
      if (started) return; // pointer and keyboard both race for this
      started = true;
      // First user gesture — safe point to start audio under browser autoplay policy.
      audio.playTheme(this);
      this.scene.start('Menu');
    };

    // Advancing on the bare pointerdown handed the *release* to Menu, which
    // hit-tested it against buttons the player had not yet seen. Require the
    // whole click to happen here. Listeners are `on`, not `once`: a release
    // left over from a press begun during Boot's preload must be ignored
    // WITHOUT consuming the listener, or the title card would never advance.
    const press = new PressGuard();
    this.input.on('pointerdown', () => press.down());
    this.input.on('pointerup', () => { if (press.consumePress()) go(); });
    // A widget cancels its press via `pointerout`, but a whole scene has no
    // such event: a release off the canvas arrives as `pointerupoutside` and
    // would otherwise leave the guard armed forever, so a later unmatched
    // release could advance. Cancel explicitly.
    this.input.on('pointerupoutside', () => press.disarm());
    this.input.keyboard?.once('keydown', go);
  }
}
