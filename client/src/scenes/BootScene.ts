import Phaser from 'phaser';
import { bakeAll, loadMusic, loadSymbolIcons } from '../core/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadSymbolIcons(this);
    loadMusic(this);
  }

  create(): void {
    bakeAll(this);
    this.scene.start('Title');
  }
}
