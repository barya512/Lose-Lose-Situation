import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';
import { Button } from '../ui/Button';
import { Orb } from '../ui/Orb';
import { BeerButton } from '../ui/BeerButton';
import { TEX } from '../core/assets';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';

export class PoisonScene extends Phaser.Scene {
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Poison');
  }

  create(): void {
    const cx = this.scale.width / 2;
    new WalletHud(this, 60, 80);

    this.add.text(cx, 170, 'choose your poison', {
      fontSize: '40px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5);

    const y = 380;
    new BeerButton(this, cx - 340, y, () => this.buyBeer());
    new Orb(this, cx, y, TEX.orbMarket, 'MARKET',
      () => this.comingSoon('the market'), { enabled: false });
    new Orb(this, cx + 340, y, TEX.orbCasino, 'CASINO',
      () => this.scene.start('Casino'));

    this.toast = this.add.text(cx, 560, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);

    new Button(this, 120, 660, 'give up?', () => {
      session.clear();
      this.scene.start('Menu');
    }, { width: 180, height: 56 });
  }

  private comingSoon(what: string): void {
    this.toast.setText(`${what} isn't open yet`);
  }

  private async buyBeer(): Promise<void> {
    this.toast.setText('');
    try {
      session.applyBeerResult(await api.buyBeer());
    } catch (e) {
      if (!this.scene.isActive()) return; // won mid-request — Win took over
      this.toast.setText(e instanceof ApiError ? e.message : 'connection hiccup — try again');
    }
  }
}
