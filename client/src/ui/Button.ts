import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { css, text } from '../core/theme';
import { PressGuard } from '../core/pressGuard';

interface ButtonOpts {
  width?: number;
  height?: number;
  /** Texture for the resting state — lets edge chrome (e.g. BackTab) reshape it. */
  texture?: string;
  /** Texture for hover/selected. Defaults to the gold-rimmed button variant. */
  hoverTexture?: string;
  /**
   * Grow slightly on hover. Off for chrome welded to a screen edge, where
   * scaling from the centre would swell the rounded corner off the frame.
   */
  lift?: boolean;
  /**
   * Override the label's font size. `text.button`'s letter-spacing is tuned
   * for word labels ("PULL", "SPIN") — a lone glyph like '+' or '−' reads
   * thin and off-centre under it, so single-character buttons want a bigger
   * size and no letter-spacing.
   */
  fontSize?: string;
}

/** Hover lift, shared by every widget in the kit. */
export const HOVER_SCALE = 1.03;
/** Press squash. */
export const PRESS_SCALE = 0.96;

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private selected = false;
  private hovered = false;
  private readonly press = new PressGuard();
  private readonly boxW: number;
  private readonly boxH: number;
  private readonly restTexture: string;
  private readonly hoverTexture: string;
  private readonly lift: boolean;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    label: string, onClick: () => void, opts: ButtonOpts = {},
  ) {
    super(scene, x, y);
    this.boxW = opts.width ?? 220;
    this.boxH = opts.height ?? 64;
    this.restTexture = opts.texture ?? TEX.button;
    this.hoverTexture = opts.hoverTexture ?? TEX.buttonHover;
    this.lift = opts.lift ?? true;

    this.bg = scene.add.image(0, 0, this.restTexture).setDisplaySize(this.boxW, this.boxH);
    const labelStyle = opts.fontSize
      ? { ...text.button, fontSize: opts.fontSize, letterSpacing: 0 }
      : text.button;
    this.label = scene.add.text(0, 0, label, labelStyle).setOrigin(0.5);
    this.add([this.bg, this.label]);

    // Container input normalizes the hit point by displayOrigin (half-size)
    // before the rect test, so the hit area must be top-left based, not centred.
    this.setSize(this.boxW, this.boxH);
    const hit = new Phaser.Geom.Rectangle(0, 0, this.boxW, this.boxH);
    this.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => {
      this.hovered = true;
      this.applyState();
    });
    this.on('pointerout', () => {
      this.hovered = false;
      this.press.disarm();
      this.applyState();
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.press.down();
      audio.playClick();
      this.setScale(PRESS_SCALE);
    });
    this.on('pointerup', () => {
      this.applyState();
      // Only a release that completes a press started HERE counts as a click.
      if (this.press.consumePress() && this.enabled) onClick();
    });

    scene.add.existing(this);
  }

  /**
   * Hover and selection are signalled by swapping to the gold-rimmed texture and
   * a small lift — never by tinting. A tint multiplies, which on this palette's
   * cream and gold surfaces reads as dirt rather than highlight.
   */
  private applyState(): void {
    const lit = this.selected || (this.hovered && this.enabled);
    this.bg.setTexture(lit ? this.hoverTexture : this.restTexture);
    this.bg.setDisplaySize(this.boxW, this.boxH); // setTexture resizes to the frame
    this.label.setColor(this.selected ? css.gold : css.cream);
    this.setScale(this.lift && this.hovered && this.enabled ? HOVER_SCALE : 1);
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    if (!enabled) {
      this.press.disarm(); // cancel a press in flight when disabled
      this.hovered = false;
    }
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    this.applyState();
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.applyState();
    return this;
  }

  setText(value: string): this {
    this.label.setText(value);
    return this;
  }
}
