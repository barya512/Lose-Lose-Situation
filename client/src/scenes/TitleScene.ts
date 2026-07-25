import Phaser from 'phaser';
import { audio } from '../core/audio';

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

    const go = () => {
      // First user gesture — safe point to start audio under browser autoplay policy.
      audio.playTheme(this);
      this.scene.start('Menu');
    };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }
}
