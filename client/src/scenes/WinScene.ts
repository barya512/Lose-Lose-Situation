import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { session } from '../core/session';
import { audio } from '../core/audio';

export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  create(): void {
    const cx = this.scale.width / 2;
    this.cameras.main.setBackgroundColor('#0a0410');
    audio.playWinTheme(this);

    this.add.text(cx, 220, 'YOU LOST EVERYTHING.', {
      fontSize: '52px', color: '#3ddc84', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(cx, 300, 'YOU WIN.', {
      fontSize: '72px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    new Button(this, cx, 460, 'PLAY AGAIN', () => {
      session.clear();
      this.scene.start('Menu');
    }, { width: 300 });
  }
}
