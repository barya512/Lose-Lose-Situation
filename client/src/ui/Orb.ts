import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { text } from '../core/theme';
import { PressGuard } from '../core/pressGuard';
import { HOVER_SCALE, PRESS_SCALE } from './Button';

export interface OrbOpts {
  radius?: number;
  enabled?: boolean;
  /** One line explaining the bet, revealed under the name on hover. */
  description?: string;
}

/** How far the caption rises as it fades in. */
const CAPTION_RISE = 10;

/**
 * A round bet-select control: a baked glass orb with a bet icon inside. The
 * name and description stay hidden until the pointer is over the orb, so an idle
 * table is just glowing orbs — hovering is what tells you what you're betting
 * on. Shares Button's hover/press/enabled conventions so the two feel like one
 * UI kit.
 */
export class Orb extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image;
  private caption: Phaser.GameObjects.Container;
  private enabled = true;
  private selected = false;
  private readonly press = new PressGuard();
  private readonly diameter: number;
  private readonly captionY: number;
  /** Invoked on a valid tap. Subclasses (e.g. BeerButton) may wrap this. */
  protected clickHandler: () => void;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    iconKey: string, label: string, onClick: () => void, opts: OrbOpts = {},
  ) {
    super(scene, x, y);
    this.clickHandler = onClick;
    const r = opts.radius ?? 90;
    const d = r * 2;
    this.diameter = d;

    this.bg = scene.add.image(0, 0, TEX.orb).setDisplaySize(d, d);
    this.icon = scene.add.image(0, 0, iconKey).setDisplaySize(r * 0.9, r * 0.9);

    const name = scene.add.text(0, 0, label, text.orbName).setOrigin(0.5, 0);
    const desc = scene.add
      .text(0, 30, opts.description ?? '', text.orbDesc)
      .setOrigin(0.5, 0);
    this.captionY = r + 22;
    this.caption = scene.add
      .container(0, this.captionY + CAPTION_RISE, [name, desc])
      .setAlpha(0);

    this.add([this.bg, this.icon, this.caption]);

    // Same container-input quirk as Button: the hit point is normalized by the
    // display origin (half-size), so the hit shape must be top-left based. A
    // circle rather than a rect — with the caption now appearing on hover, a
    // square hit area would reveal it from the empty corners outside the orb.
    this.setSize(d, d);
    this.setInteractive(new Phaser.Geom.Circle(r, r, r), Phaser.Geom.Circle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => {
      if (!this.enabled) return;
      this.applyTexture(true);
      this.setScale(HOVER_SCALE);
      this.revealCaption(true);
    });
    this.on('pointerout', () => {
      this.press.disarm();
      this.setScale(1);
      this.applyTexture(false);
      this.revealCaption(false);
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
      if (this.press.consumePress() && this.enabled) this.clickHandler();
    });

    scene.add.existing(this);
    if (opts.enabled === false) this.setEnabled(false);
  }

  private applyTexture(hovered: boolean): void {
    const lit = hovered || this.selected;
    this.bg.setTexture(lit ? TEX.orbHover : TEX.orb);
    this.bg.setDisplaySize(this.diameter, this.diameter); // setTexture resizes
  }

  private revealCaption(show: boolean): void {
    this.scene.tweens.killTweensOf(this.caption);
    this.scene.tweens.add({
      targets: this.caption,
      alpha: show ? 1 : 0,
      y: show ? this.captionY : this.captionY + CAPTION_RISE,
      duration: show ? 150 : 110,
      ease: 'Cubic.Out',
    });
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    if (!enabled) {
      this.press.disarm(); // cancel a press in flight when disabled
      // A disabled object gets no pointerout, so a caption revealed a moment ago
      // would otherwise hang around for the whole cooldown.
      this.revealCaption(false);
      this.setScale(1);
      this.applyTexture(false);
    }
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.applyTexture(false);
    return this;
  }
}
