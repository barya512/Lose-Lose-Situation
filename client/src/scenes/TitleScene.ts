import Phaser from 'phaser';
import { symbolTextureKey } from '../core/assets';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    // Temporary proof the manifest baked: show the SKULL tile.
    this.add.image(this.scale.width / 2, this.scale.height / 2, symbolTextureKey('SKULL'));
  }
}
