import Phaser from 'phaser';
import { Button } from '../ui/Button';
import { paintBackdrop } from '../ui/Backdrop';
import { css, font, text } from '../core/theme';
import { session } from '../core/session';
import { audio } from '../core/audio';

export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }

  create(): void {
    const cx = this.scale.width / 2;
    paintBackdrop(this);
    audio.playWinTheme(this);

    this.add.text(cx, 220, 'YOU LOST EVERYTHING.', {
      ...text.heading, fontSize: '46px', color: css.cream,
    }).setOrigin(0.5);

    this.add.text(cx, 310, 'YOU WIN.', {
      fontFamily: font.display, fontSize: '78px', fontStyle: '700',
      color: css.gold, letterSpacing: 4,
    }).setOrigin(0.5);

    new Button(this, cx, 460, 'PLAY AGAIN', () => {
      session.clear();
      this.scene.start('Menu');
    }, { width: 300 });
  }
}
