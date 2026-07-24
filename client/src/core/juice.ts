import Phaser from 'phaser';
import { TEX } from './assets';

export const juice = {
  shake(scene: Phaser.Scene, intensity = 0.012, durationMs = 250): void {
    scene.cameras.main.shake(durationMs, intensity);
  },

  flash(scene: Phaser.Scene, color: number): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    scene.cameras.main.flash(220, r, g, b);
  },

  coinBurst(scene: Phaser.Scene, x: number, y: number): void {
    const emitter = scene.add.particles(x, y, TEX.coin, {
      speed: { min: 200, max: 460 },
      angle: { min: 200, max: 340 },
      gravityY: 700,
      lifespan: 900,
      quantity: 24,
      scale: { start: 1.2, end: 0 },
      emitting: false,
    });
    emitter.explode(24);
    scene.time.delayedCall(1100, () => emitter.destroy());
  },

  glitch(scene: Phaser.Scene): void {
    const cam = scene.cameras.main;
    const emitter = scene.add.particles(scene.scale.width / 2, scene.scale.height / 2, TEX.glitch, {
      speed: { min: 100, max: 500 },
      lifespan: 400,
      quantity: 30,
      scaleX: { start: 3, end: 0 },
      scaleY: { start: 0.6, end: 0 },
      emitting: false,
    });
    emitter.explode(30);
    cam.shake(200, 0.02);
    scene.time.delayedCall(500, () => emitter.destroy());
  },
};
