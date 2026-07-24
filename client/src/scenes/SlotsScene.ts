import Phaser from 'phaser';
import { WalletHud } from '../ui/WalletHud';
import { Button } from '../ui/Button';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { audio } from '../core/audio';
import { juice } from '../core/juice';
import { SLOT_SYMBOLS, symbolStyle, symbolTextureKey, type SlotSymbol } from '../core/assets';

const STAKE_CHIPS = [100, 1000, 5000, 10000]; // cents: $1 / $10 / $50 / $100
const REEL_SIZE = 128;
const REEL_GAP = 24;

export class SlotsScene extends Phaser.Scene {
  private stakeCents = 100;
  private reelCount = 3;
  private spinning = false;

  private reelSprites: Phaser.GameObjects.Image[] = [];
  private reelLabels: Phaser.GameObjects.Text[] = [];
  private chipButtons: { cents: number; btn: Button }[] = [];
  private countButtons: { count: number; btn: Button }[] = [];
  private spinButton!: Button;
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Slots');
  }

  create(): void {
    const cx = this.scale.width / 2;
    new WalletHud(this, 60, 80);

    this.add.text(cx, 60, 'SLOTS', { fontSize: '36px', color: '#ff3ea5', fontStyle: 'bold' })
      .setOrigin(0.5);

    this.buildReels();

    // Stake chips.
    this.add.text(cx, 420, 'STAKE', { fontSize: '18px', color: '#b197fc' }).setOrigin(0.5);
    STAKE_CHIPS.forEach((cents, i) => {
      const x = cx - 255 + i * 170;
      const btn = new Button(this, x, 470, `$${cents / 100}`, () => this.pickStake(cents), { width: 150 });
      this.chipButtons.push({ cents, btn });
    });

    // Reel-count toggle.
    this.add.text(cx, 540, 'REELS', { fontSize: '18px', color: '#b197fc' }).setOrigin(0.5);
    [3, 5].forEach((count, i) => {
      const btn = new Button(this, cx - 90 + i * 180, 585, String(count), () => this.pickCount(count), { width: 150 });
      this.countButtons.push({ count, btn });
    });

    this.spinButton = new Button(this, cx, 650, 'SPIN', () => this.spin(), { width: 260, height: 72 });
    this.toast = this.add.text(cx, 700, '', { fontSize: '20px', color: '#ff6b6b' }).setOrigin(0.5);

    this.pickStake(this.stakeCents);
    this.pickCount(this.reelCount);
  }

  private buildReels(): void {
    this.reelSprites.forEach((s) => s.destroy());
    this.reelLabels.forEach((l) => l.destroy());
    this.reelSprites = [];
    this.reelLabels = [];

    const cx = this.scale.width / 2;
    const total = this.reelCount * REEL_SIZE + (this.reelCount - 1) * REEL_GAP;
    const startX = cx - total / 2 + REEL_SIZE / 2;
    const y = 280;

    for (let i = 0; i < this.reelCount; i++) {
      const x = startX + i * (REEL_SIZE + REEL_GAP);
      const sym = SLOT_SYMBOLS[i % SLOT_SYMBOLS.length];
      const img = this.add.image(x, y, symbolTextureKey(sym));
      const label = this.add
        .text(x, y, symbolStyle(sym).glyph, { fontSize: '44px', color: '#1a0a2e', fontStyle: 'bold' })
        .setOrigin(0.5);
      this.reelSprites.push(img);
      this.reelLabels.push(label);
    }
  }

  private setReel(i: number, sym: SlotSymbol): void {
    this.reelSprites[i].setTexture(symbolTextureKey(sym));
    this.reelLabels[i].setText(symbolStyle(sym).glyph);
  }

  private pickStake(cents: number): void {
    this.stakeCents = cents;
    const balance = session.user?.balance_cents ?? 0;
    this.chipButtons.forEach(({ cents: c, btn }) => {
      btn.setSelected(c === cents);
      btn.setEnabled(c <= balance);
    });
  }

  private pickCount(count: number): void {
    if (this.spinning) return;
    this.reelCount = count;
    this.countButtons.forEach(({ count: c, btn }) => btn.setSelected(c === count));
    this.buildReels();
  }

  private setControls(enabled: boolean): void {
    if (!this.scene.isActive()) return; // scene may have handed off to Win
    this.spinButton.setEnabled(enabled);
    this.chipButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    this.countButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    if (enabled) this.pickStake(this.stakeCents); // re-disable unaffordable chips
  }

  private async spin(): Promise<void> {
    if (this.spinning) return;
    const balance = session.user?.balance_cents ?? 0;
    if (this.stakeCents > balance) { this.toast.setText('not enough to stake that'); return; }

    this.spinning = true;
    this.toast.setText('');
    this.setControls(false);
    audio.playSpin();

    // Reel roll animation: cycle random symbols briefly.
    const roll = this.time.addEvent({
      delay: 60, loop: true,
      callback: () => {
        for (let i = 0; i < this.reelCount; i++) {
          this.setReel(i, Phaser.Utils.Array.GetRandom(SLOT_SYMBOLS as unknown as SlotSymbol[]));
        }
      },
    });

    try {
      const result = await api.slotsSpin(this.stakeCents, this.reelCount);
      await this.wait(650);
      roll.remove();
      result.result_detail.reels.forEach((s, i) => this.setReel(i, s as SlotSymbol));

      const fresh = await api.getMe();
      session.setUser(fresh); // may fire the win-watcher and stop this scene
      if (!this.scene.isActive()) return; // won — WinScene has taken over

      if (result.status === 'LOST') {
        // GOOD outcome: money lost is the goal.
        juice.flash(this, 0x3ddc84);
        juice.coinBurst(this, this.scale.width / 2, 280);
        juice.shake(this);
        audio.playLossReward();
      } else {
        // BAD outcome: money gained.
        juice.glitch(this);
        juice.flash(this, 0xff3ea5);
        audio.playGainPunish();
      }
    } catch (e) {
      roll.remove();
      const fresh = await api.getMe().catch(() => null);
      if (fresh) session.setUser(fresh);
      this.toast.setText(e instanceof ApiError ? e.message : 'connection hiccup — try again');
    } finally {
      this.spinning = false;
      this.setControls(true);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
