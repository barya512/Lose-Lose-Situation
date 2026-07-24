import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';

export class SlotsScene extends Phaser.Scene {
  constructor() {
    super('Slots');
  }

  create(): void {
    new WalletHud(this, 60, 80);
    this.add.text(this.scale.width / 2, this.scale.height / 2, 'SLOTS (stub)', {
      fontSize: '32px', color: '#ffffff',
    }).setOrigin(0.5);
  }
}
