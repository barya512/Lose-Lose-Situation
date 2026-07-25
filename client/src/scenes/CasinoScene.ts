import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { TEX } from '../core/assets';

export class CasinoScene extends Phaser.Scene {
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Casino');
  }

  create(): void {
    const cx = this.scale.width / 2;
    new WalletHud(this, 60, 80);

    this.add.text(cx, 150, 'casino? great choice', {
      fontSize: '38px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    const y = 400;
    const cards = [
      new Card(this, cx - 300, y, TEX.cardRoulette, 'ROULETTE',
        () => this.comingSoon('roulette'), { enabled: false }),
      new Card(this, cx, y, TEX.cardBlackjack, 'BLACKJACK',
        () => this.comingSoon('blackjack'), { enabled: false }),
      new Card(this, cx + 300, y, TEX.cardSlots, 'SLOTS',
        () => this.scene.start('Slots')),
    ];
    // Deal them onto the table one after another.
    cards.forEach((card, i) => card.playEntrance(i * 90));

    this.toast = this.add.text(cx, 630, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);

    new Button(this, 120, 660, 'go back?', () => this.scene.start('Poison'),
      { width: 180, height: 56 });
  }

  private comingSoon(what: string): void {
    this.toast.setText(`${what} isn't dealt in yet`);
  }
}
