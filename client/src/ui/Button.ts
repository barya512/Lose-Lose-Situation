import Phaser from 'phaser';
import { TEX } from '../core/assets';
import { audio } from '../core/audio';

interface ButtonOpts { width?: number; height?: number; }

export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private enabled = true;
  private selected = false;

  constructor(
    scene: Phaser.Scene, x: number, y: number,
    label: string, onClick: () => void, opts: ButtonOpts = {},
  ) {
    super(scene, x, y);
    const w = opts.width ?? 220;
    const h = opts.height ?? 64;

    this.bg = scene.add.image(0, 0, TEX.button).setDisplaySize(w, h);
    this.label = scene.add
      .text(0, 0, label, { fontSize: '26px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);

    // Container needs an explicit, centred hit area (children are centred at 0,0).
    this.setSize(w, h);
    const hit = new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h);
    this.setInteractive(hit, Phaser.Geom.Rectangle.Contains);
    if (this.input) this.input.cursor = 'pointer';

    this.on('pointerover', () => { if (this.enabled && !this.selected) this.bg.setTint(0x9d7bd8); });
    this.on('pointerout', () => { this.setScale(1); this.applyTint(); });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      audio.playClick();
      this.setScale(0.96);
    });
    this.on('pointerup', () => {
      this.setScale(1);
      if (this.enabled) onClick();
    });

    scene.add.existing(this);
  }

  private applyTint(): void {
    if (this.selected) this.bg.setTint(0xff3ea5);
    else this.bg.clearTint();
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.4);
    if (this.input) this.input.enabled = enabled;
    return this;
  }

  setSelected(selected: boolean): this {
    this.selected = selected;
    this.applyTint();
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }
}
