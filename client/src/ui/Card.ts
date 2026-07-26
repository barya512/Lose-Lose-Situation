import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { PressGuard } from '../core/pressGuard';

interface CardOpts { width?: number; height?: number; enabled?: boolean; }

/**
 * A casino machine choice rendered as a card: baked card background + art +
 * label. `playEntrance` animates it from an off-table "deck" pose into place so
 * a scene can deal several in with a stagger.
 */
export class Card extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private art: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private readonly press = new PressGuard();
  private readonly homeX: number;
  private readonly homeY: number;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    artKey: string, label: string, onClick: () => void, opts: CardOpts = {},
  ) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    const w = opts.width ?? 240;
    const h = opts.height ?? 336;

    this.bg = scene.add.image(0, 0, TEX.card).setDisplaySize(w, h);
    this.art = scene.add.image(0, -36, artKey).setDisplaySize(w * 0.66, w * 0.66);
    this.label = scene.add
      .text(0, h / 2 - 44, label, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add([this.bg, this.art, this.label]);

    // Top-left hit rect, per the container-input quirk (see Button/Orb).
    this.setSize(w, h);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => { if (this.enabled) this.bg.setTint(0x9d7bd8); });
    this.on('pointerout', () => { this.press.disarm(); this.setScale(1); this.bg.clearTint(); });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.press.down();
      audio.playClick();
      this.setScale(0.97);
    });
    this.on('pointerup', () => {
      this.setScale(1);
      // Only a release that completes a press started HERE counts as a click.
      if (this.press.consumePress() && this.enabled) onClick();
    });

    scene.add.existing(this);
    if (opts.enabled === false) this.setEnabled(false);
  }

  /** Deal this card in: rises from below the table, scaling/rotating to rest. */
  playEntrance(delayMs: number): Phaser.Tweens.Tween {
    const restAlpha = this.enabled ? 1 : 0.4; // don't un-dim a disabled card
    this.setPosition(this.homeX, this.homeY + 140).setScale(0.8).setAngle(-8).setAlpha(0);
    return this.scene.tweens.add({
      targets: this,
      x: this.homeX, y: this.homeY, scale: 1, angle: 0, alpha: restAlpha,
      ease: 'Back.Out', duration: 420, delay: delayMs,
    });
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    if (!enabled) this.press.disarm(); // cancel a press in flight when disabled
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }
}
