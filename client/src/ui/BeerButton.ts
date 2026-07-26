import Phaser from 'phaser';
import { Orb, type OrbOpts } from './Orb';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { color } from '../core/theme';

const COOLDOWN_MS = 2000;

/**
 * The Beer orb. Enforces a strict client-side cooldown: on tap it disables
 * itself, plays the sip, runs the caller's activation (the buy), and reveals a
 * radial "wipe" overlay that empties over 2s before re-enabling. Taps during the
 * cooldown are ignored. Activation errors are the caller's to surface — the
 * cooldown runs regardless of outcome.
 */
export class BeerButton extends Orb {
  private cooling = false;
  private overlay: Phaser.GameObjects.Graphics;
  private readonly radius: number;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    activate: () => void | Promise<void>, opts: Pick<OrbOpts, 'radius' | 'description'> = {},
  ) {
    const r = opts.radius ?? 90;
    super(scene, x, y, TEX.orbBeer, 'BEER', () => {}, { radius: r, description: opts.description });
    this.radius = r;
    this.overlay = scene.add.graphics();
    this.add(this.overlay);
    this.clickHandler = () => { void this.run(activate); };
  }

  private async run(activate: () => void | Promise<void>): Promise<void> {
    if (this.cooling) return;
    this.cooling = true;
    this.setEnabled(false);
    audio.playBeer();
    this.startWipe();
    try {
      await activate();
    } catch {
      // Surfacing is the caller's concern; the cooldown still runs.
    }
  }

  private startWipe(): void {
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: COOLDOWN_MS, ease: 'Linear',
      onUpdate: (tw) => this.drawWipe(1 - (tw.getValue() ?? 1)),
      onComplete: () => {
        this.overlay.clear();
        this.cooling = false;
        this.setEnabled(true);
      },
    });
  }

  /** Draw a dark pie covering the fraction of cooldown still remaining. */
  private drawWipe(remaining: number): void {
    this.overlay.clear();
    if (remaining <= 0) return;
    const start = -Math.PI / 2;
    const end = start + remaining * Math.PI * 2;
    this.overlay.fillStyle(color.shadow, 0.65);
    this.overlay.slice(0, 0, this.radius, start, end, false);
    this.overlay.fillPath();
  }
}
