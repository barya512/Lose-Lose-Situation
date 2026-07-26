import Phaser from 'phaser';
import { mountTopHud } from '../ui/TopHud';
import { BackTab } from '../ui/BackTab';
import { paintBackdrop } from '../ui/Backdrop';
import { Card } from '../ui/Card';
import { TEX } from '../core/assets';
import { chrome, text } from '../core/theme';
import { GAME_WIDTH, fitCamera } from '../core/viewport';

const CARD_ROW_Y = 386;

export class CasinoScene extends Phaser.Scene {
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Casino');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    fitCamera(this);
    paintBackdrop(this);
    mountTopHud(this);

    this.add.text(cx, chrome.contentTop, 'casino? great choice', text.title).setOrigin(0.5, 0);

    const cards = [
      new Card(this, cx - 240, CARD_ROW_Y, TEX.cardRoulette, 'ROULETTE',
        () => this.comingSoon('roulette'), { enabled: false }),
      new Card(this, cx, CARD_ROW_Y, TEX.cardBlackjack, 'BLACKJACK',
        () => this.comingSoon('blackjack'), { enabled: false }),
      new Card(this, cx + 240, CARD_ROW_Y, TEX.cardSlots, 'SLOTS',
        () => this.scene.start('Slots')),
    ];
    // Deal them onto the table one after another.
    cards.forEach((card, i) => card.playEntrance(i * 90));

    this.toast = this.add.text(cx, 640, '', text.toast).setOrigin(0.5);

    new BackTab(this, 'go back?', () => this.scene.start('Poison'));
  }

  private comingSoon(what: string): void {
    this.toast.setText(`${what} isn't dealt in yet`);
  }
}
