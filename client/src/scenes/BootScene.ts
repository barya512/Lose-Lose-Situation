import Phaser from 'phaser';
import { bakeAll, loadSymbolIcons } from '../core/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadSymbolIcons(this);
  }

  create(): void {
    bakeAll(this);
    this.scene.start('Title');
  }
}
