import Phaser from 'phaser';
import { TEX } from './assets';
import { WIN_JUICE_CHANCE, rollChance } from './config';

type JuiceTarget = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Transform;

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

  /**
   * Probabilistic squash-and-stretch reaction on any transform target (a
   * Container like the slot machine, or a lone sprite). Fires statistically —
   * `chance` (default `WIN_JUICE_CHANCE`) is rolled through the pure, tested
   * `rollChance`, so it's a treat, not a guarantee. Base scale/angle are captured
   * and restored on completion so repeated calls never drift. Returns whether it
   * fired.
   */
  winReaction(
    scene: Phaser.Scene,
    target: JuiceTarget,
    opts: { chance?: number; rng?: () => number; strength?: number } = {},
  ): boolean {
    if (!rollChance(opts.chance ?? WIN_JUICE_CHANCE, opts.rng)) return false;

    const s = opts.strength ?? 0.18;
    const baseX = target.scaleX;
    const baseY = target.scaleY;
    const baseAngle = target.angle;

    scene.tweens.chain({
      targets: target,
      onComplete: () => target.setScale(baseX, baseY).setAngle(baseAngle),
      tweens: [
        { // squash: wider, shorter, tipped one way
          scaleX: baseX * (1 + s), scaleY: baseY * (1 - s), angle: baseAngle + 3,
          duration: 110, ease: 'Sine.Out',
        },
        { // stretch: taller, narrower, tipped the other way
          scaleX: baseX * (1 - s * 0.6), scaleY: baseY * (1 + s * 0.6), angle: baseAngle - 3,
          duration: 130, ease: 'Sine.InOut',
        },
        { // settle back to rest with a soft overshoot
          scaleX: baseX, scaleY: baseY, angle: baseAngle,
          duration: 210, ease: 'Back.Out',
        },
      ],
    });
    return true;
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
