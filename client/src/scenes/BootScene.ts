import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'LOSE-LOSE', {
        fontSize: '48px',
        color: '#ff3ea5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
  }
}
