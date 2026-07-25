import Phaser from 'phaser';
import { TEX, symbolIconKey, type SlotSymbol } from '../core/assets';
import type { SlotInfo } from '../core/types';

const PANEL_WIDTH = 240;
const ICON_SIZE = 28;
const ROW_HEIGHT = 44;

function fmtMult(n: number): string {
  return Number.isInteger(n) ? `${n}` : n.toFixed(1);
}

/** Side panel explaining the slots paytable — fetched once from /casino/slots/info. */
export class SlotInfoPanel extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private content: Phaser.GameObjects.Container;
  private status: Phaser.GameObjects.Text;
  private info: SlotInfo | null = null;
  private reelCount = 3;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly panelHeight: number) {
    super(scene, x, y);

    this.bg = scene.add.image(0, 0, TEX.panel).setDisplaySize(PANEL_WIDTH, panelHeight);
    this.status = scene.add
      .text(0, 0, 'loading paytable…', { fontSize: '15px', color: '#b197fc' })
      .setOrigin(0.5);
    this.content = scene.add.container(0, 0);

    this.add([this.bg, this.status, this.content]);
    scene.add.existing(this);
  }

  setInfo(info: SlotInfo): void {
    this.info = info;
    this.status.setVisible(false);
    this.render();
  }

  setReelCount(count: number): void {
    this.reelCount = count;
    if (this.info) this.render();
  }

  private render(): void {
    this.content.removeAll(true);
    if (!this.info) return;
    const info = this.info;

    const left = -PANEL_WIDTH / 2 + 18;
    const wrapWidth = PANEL_WIDTH - 36;
    let y = -this.panelHeight / 2 + 22;

    const title = this.scene.add.text(0, y, 'PAYTABLE', {
      fontSize: '20px', color: '#ff3ea5', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.content.add(title);
    y += 34;

    const intro = this.scene.add.text(left, y,
      'This game is rigged in reverse: matching symbols pay OUT, which GROWS your ' +
      'balance. A losing spin is the win you actually want.',
      { fontSize: '13px', color: '#74c0fc', wordWrap: { width: wrapWidth } },
    );
    this.content.add(intro);
    y += intro.height + 16;

    const sub1 = this.scene.add.text(left, y, '3 of a kind', {
      fontSize: '14px', color: '#b197fc', fontStyle: 'bold',
    });
    this.content.add(sub1);
    y += sub1.height + 8;

    for (const row of info.symbols) {
      const icon = this.scene.add.image(left + ICON_SIZE / 2, y + ICON_SIZE / 2, symbolIconKey(row.symbol as SlotSymbol))
        .setDisplaySize(ICON_SIZE, ICON_SIZE);
      const label = this.scene.add.text(
        left + ICON_SIZE + 10, y + ICON_SIZE / 2,
        `×${fmtMult(row.three_of_a_kind_payout)}`,
        { fontSize: '15px', color: '#ffffff' },
      ).setOrigin(0, 0.5);
      this.content.add([icon, label]);
      y += ROW_HEIGHT;
    }

    y += 6;
    const sub2 = this.scene.add.text(left, y, 'Any pair', {
      fontSize: '14px', color: '#b197fc', fontStyle: 'bold',
    });
    this.content.add(sub2);
    y += sub2.height + 8;

    const disabled = info.two_of_a_kind_disabled_reel_counts.includes(this.reelCount);
    const pairColor = disabled ? '#5a4a72' : '#ffffff';
    const pairLine = this.scene.add.text(left, y,
      `×${fmtMult(info.two_of_a_kind_payout)}${disabled ? '  (off at ' + this.reelCount + ' reels)' : ''}`,
      { fontSize: '15px', color: pairColor, wordWrap: { width: wrapWidth } },
    );
    this.content.add(pairLine);
    y += pairLine.height + 10;

    if (disabled) {
      const note = this.scene.add.text(left, y,
        `At ${this.reelCount} reels a pair is nearly guaranteed, so it no longer pays.`,
        { fontSize: '12px', color: '#5a4a72', wordWrap: { width: wrapWidth } },
      );
      this.content.add(note);
    }
  }
}
