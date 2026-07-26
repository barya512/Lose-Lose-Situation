import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { text } from '../core/theme';
import { PressGuard } from '../core/pressGuard';
import { HOVER_SCALE, PRESS_SCALE } from './Button';

interface CardOpts { width?: number; height?: number; enabled?: boolean; }

/**
 * A casino machine choice rendered as a worn playing card: the shared aged-cream
 * face, the machine's ink overlay (corner suit indices + central emblem, baked at
 * full card size so it registers with the face), and the name set BELOW the card
 * rather than printed on it. `playEntrance` animates it from an off-table "deck"
 * pose into place so a scene can deal several in with a stagger.
 */
export class Card extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private art: Phaser.GameObjects.Image;
  private enabled = true;
  private readonly press = new PressGuard();
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly boxW: number;
  private readonly boxH: number;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    artKey: string, label: string, onClick: () => void, opts: CardOpts = {},
  ) {
    super(scene, x, y);
    this.homeX = x;
    this.homeY = y;
    this.boxW = opts.width ?? 180;
    this.boxH = opts.height ?? 252;

    this.bg = scene.add.image(0, 0, TEX.card).setDisplaySize(this.boxW, this.boxH);
    this.art = scene.add.image(0, 0, artKey).setDisplaySize(this.boxW, this.boxH);
    const name = scene.add
      .text(0, this.boxH / 2 + 20, label, text.cardName)
      .setOrigin(0.5, 0);
    this.add([this.bg, this.art, name]);

    // Top-left hit rect, per the container-input quirk (see Button/Orb). Sized to
    // the card face only — the name below it is not part of the target.
    this.setSize(this.boxW, this.boxH);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.boxW, this.boxH), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => {
      if (!this.enabled) return;
      this.applyTexture(true);
      this.setScale(HOVER_SCALE);
    });
    this.on('pointerout', () => {
      this.press.disarm();
      this.setScale(1);
      this.applyTexture(false);
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.press.down();
      audio.playClick();
      this.setScale(PRESS_SCALE);
    });
    this.on('pointerup', () => {
      this.setScale(this.enabled ? HOVER_SCALE : 1);
      // Only a release that completes a press started HERE counts as a click.
      if (this.press.consumePress() && this.enabled) onClick();
    });

    scene.add.existing(this);
    if (opts.enabled === false) this.setEnabled(false);
  }

  /** Gold rim on hover — a tint would just dirty the cream stock. */
  private applyTexture(hovered: boolean): void {
    this.bg.setTexture(hovered ? TEX.cardHover : TEX.card);
    this.bg.setDisplaySize(this.boxW, this.boxH); // setTexture resizes to the frame
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
    if (!enabled) {
      this.press.disarm(); // cancel a press in flight when disabled
      this.setScale(1);
      this.applyTexture(false);
    }
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }
}
