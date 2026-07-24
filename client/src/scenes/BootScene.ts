import Phaser from 'phaser';
import { bakeAll } from '../core/assets';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    bakeAll(this);
    this.scene.start('Title');
  }
}
