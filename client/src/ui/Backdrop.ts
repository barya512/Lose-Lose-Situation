import Phaser from 'phaser';
import { TEX } from '../core/assets';

/**
 * Paint the felt table behind everything. Call it first in a scene's `create()`.
 *
 * Parked at depth -100 so nothing added afterwards has to think about ordering.
 */
export function paintBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Image {
  return scene.add
    .image(0, 0, TEX.backdrop)
    .setOrigin(0, 0)
    .setDisplaySize(scene.scale.width, scene.scale.height)
    .setDepth(-100);
}
