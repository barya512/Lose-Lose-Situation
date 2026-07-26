import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';
import { PressGuard } from '../core/pressGuard';

interface OrbOpts { radius?: number; enabled?: boolean; }

/**
 * A round bet-select control: a baked orb frame with a bet icon inside and a
 * label underneath. Shares Button's hover/press/enabled conventions so the two
 * feel like one UI kit.
 */
export class Orb extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private selected = false;
  private readonly press = new PressGuard();
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

    this.bg = scene.add.image(0, 0, TEX.orb).setDisplaySize(d, d);
    this.icon = scene.add.image(0, 0, iconKey).setDisplaySize(r, r);
    this.label = scene.add
      .text(0, r + 24, label, { fontSize: '24px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add([this.bg, this.icon, this.label]);

    // Same container-input quirk as Button: the hit point is normalized by the
    // display origin (half-size), so the hit rect must be top-left based.
    this.setSize(d, d);
    this.setInteractive(new Phaser.Geom.Rectangle(0, 0, d, d), Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => { if (this.enabled && !this.selected) this.bg.setTint(0x9d7bd8); });
    this.on('pointerout', () => { this.press.disarm(); this.setScale(1); this.applyTint(); });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.press.down();
      audio.playClick();
      this.setScale(0.96);
    });
    this.on('pointerup', () => {
      this.setScale(1);
      // Only a release that completes a press started HERE counts as a click.
      if (this.press.consumePress() && this.enabled) this.clickHandler();
    });

    scene.add.existing(this);
    if (opts.enabled === false) this.setEnabled(false);
  }

  private applyTint(): void {
    if (this.selected) this.bg.setTint(0xff3ea5);
    else this.bg.clearTint();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    if (!enabled) this.press.disarm(); // cancel a press in flight when disabled
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.applyTint();
    return this;
  }
}
