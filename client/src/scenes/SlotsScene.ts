import Phaser from 'phaser';
import { mountTopHud } from '../ui/TopHud';
import { BackTab } from '../ui/BackTab';
import { paintBackdrop } from '../ui/Backdrop';
import { Button } from '../ui/Button';
import { SlotInfoPanel } from '../ui/SlotInfoPanel';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { audio } from '../core/audio';
import { juice } from '../core/juice';
import { outcome, text } from '../core/theme';
import { stepReelCount } from '../core/slotLogic';
import { GAME_WIDTH, fitCamera } from '../core/viewport';
import {
  SLOT_SYMBOLS, SLOT_FRAME_INSET, TEX, symbolIconKey, symbolTextureKey,
  type SlotSymbol,
} from '../core/assets';

const STAKE_CHIPS = [100, 1000, 5000, 10000]; // cents: $1 / $10 / $50 / $100
const REEL_SIZE = 128;
const REEL_GAP = 24;
const MACHINE_X_OFFSET = -80; // nudge left so the machine clears the paytable
const MACHINE_Y = 300;
const FRAME_HEIGHT = 320;
const FRAME_PAD = 90;
const REEL_LOCAL_Y = 40;     // reels sit in the lower half of the frame
const REACTION_LOCAL_Y = -128; // "changing image" in the upper half
const REACTION_SIZE = { w: 200, h: 140 } as const; // authored size of the baked face

export class SlotsScene extends Phaser.Scene {
  private stakeCents = 100;
  private reelCount = 3;
  private minReels = 3;
  private maxReels = 5;
  private spinning = false;

  private machine!: Phaser.GameObjects.Container;
  private frame!: Phaser.GameObjects.NineSlice;
  private reaction!: Phaser.GameObjects.Image;
  private reelSprites: Phaser.GameObjects.Image[] = [];
  private reelIcons: Phaser.GameObjects.Image[] = [];
  private chipButtons: { cents: number; btn: Button }[] = [];
  private lever!: Button;
  private plusBtn!: Button;
  private minusBtn!: Button;
  private reelCountText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private infoPanel!: SlotInfoPanel;

  constructor() {
    super('Slots');
  }

  create(): void {
    this.chipButtons = [];
    this.spinning = false;
    this.reelSprites = [];
    this.reelIcons = [];

    const cx = GAME_WIDTH / 2;
    const machineX = cx + MACHINE_X_OFFSET;
    fitCamera(this);
    paintBackdrop(this);
    mountTopHud(this);

    // Clear of the HUD panels, which now own the top 92px of the frame.
    this.add.text(cx, 104, 'SLOTS', text.heading).setOrigin(0.5);

    // The machine as one container so juice can squash-and-stretch the whole unit.
    this.machine = this.add.container(machineX, MACHINE_Y);
    this.frame = this.add.nineslice(
      0, -30, TEX.slotFrame, undefined, 400, FRAME_HEIGHT,
      SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET,
    );
    // Baked textures come out oversized (see `bake`), so the few images that
    // don't otherwise set a size have to state it.
    this.reaction = this.add.image(0, REACTION_LOCAL_Y, TEX.reactionNeutral)
      .setDisplaySize(REACTION_SIZE.w, REACTION_SIZE.h);
    this.machine.add([this.frame, this.reaction]);

    this.buildReels();

    // Pull-lever (the only spin trigger) to the left of the machine.
    this.lever = new Button(this, 150, MACHINE_Y, 'PULL', () => this.pullLever(),
      { width: 96, height: 120 });

    // +/- reel controls to the right of the reels.
    this.add.text(1000, MACHINE_Y - 96, 'REELS', text.label).setOrigin(0.5);
    this.plusBtn = new Button(this, 1000, MACHINE_Y - 48, '+', () => this.changeReels(+1),
      { width: 64, height: 56 });
    this.reelCountText = this.add.text(1000, MACHINE_Y + 8, String(this.reelCount), {
      ...text.money, fontSize: '22px',
    }).setOrigin(0.5);
    this.minusBtn = new Button(this, 1000, MACHINE_Y + 64, '-', () => this.changeReels(-1),
      { width: 64, height: 56 });

    // Stake chips.
    this.add.text(cx, 490, 'STAKE', text.label).setOrigin(0.5);
    STAKE_CHIPS.forEach((cents, i) => {
      const x = cx - 255 + i * 170;
      const btn = new Button(this, x, 540, `$${cents / 100}`, () => this.pickStake(cents), { width: 150 });
      this.chipButtons.push({ cents, btn });
    });

    this.toast = this.add.text(cx, 620, '', text.toast).setOrigin(0.5);

    new BackTab(this, 'go back?', () => this.scene.start('Casino'));

    this.infoPanel = new SlotInfoPanel(this, GAME_WIDTH - 140, 380, 560);
    api.slotsInfo()
      .then((info) => {
        this.minReels = info.min_reels;
        this.maxReels = info.max_reels;
        this.infoPanel.setInfo(info);
        this.updateReelControls();
      })
      .catch(() => { /* paytable is informational-only; ignore fetch failures */ });

    this.pickStake(this.stakeCents);
    this.updateReelControls();
    this.infoPanel.setReelCount(this.reelCount);
  }

  private buildReels(): void {
    this.reelSprites.forEach((s) => s.destroy());
    this.reelIcons.forEach((icon) => icon.destroy());
    this.reelSprites = [];
    this.reelIcons = [];

    const span = this.reelCount * REEL_SIZE + (this.reelCount - 1) * REEL_GAP;
    const startX = -span / 2 + REEL_SIZE / 2;

    for (let i = 0; i < this.reelCount; i++) {
      const x = startX + i * (REEL_SIZE + REEL_GAP);
      const sym = SLOT_SYMBOLS[i % SLOT_SYMBOLS.length];
      const img = this.add.image(x, REEL_LOCAL_Y, symbolTextureKey(sym))
        .setDisplaySize(REEL_SIZE, REEL_SIZE);
      const icon = this.add.image(x, REEL_LOCAL_Y, symbolIconKey(sym));
      this.machine.add([img, icon]);
      this.reelSprites.push(img);
      this.reelIcons.push(icon);
    }

    // Resize the nine-slice frame to hug the active reels (Option A).
    this.frame.setSize(span + FRAME_PAD, FRAME_HEIGHT);
  }

  private setReel(i: number, sym: SlotSymbol): void {
    this.reelSprites[i].setTexture(symbolTextureKey(sym));
    this.reelIcons[i].setTexture(symbolIconKey(sym));
  }

  private showReaction(key: string): void {
    this.reaction.setTexture(key);
  }

  private pickStake(cents: number): void {
    this.stakeCents = cents;
    const balance = session.user?.balance_cents ?? 0;
    this.chipButtons.forEach(({ cents: c, btn }) => {
      btn.setSelected(c === cents);
      btn.setEnabled(c <= balance);
    });
  }

  private changeReels(delta: number): void {
    if (this.spinning) return;
    const next = stepReelCount(this.reelCount, delta, this.minReels, this.maxReels);
    if (next === this.reelCount) return;
    this.reelCount = next;
    this.buildReels();
    this.updateReelControls();
    this.infoPanel?.setReelCount(next);
  }

  private updateReelControls(): void {
    this.reelCountText.setText(String(this.reelCount));
    this.minusBtn.setEnabled(!this.spinning && this.reelCount > this.minReels);
    this.plusBtn.setEnabled(!this.spinning && this.reelCount < this.maxReels);
  }

  private setControls(enabled: boolean): void {
    if (!this.scene.isActive()) return; // scene may have handed off to Win
    this.lever.setEnabled(enabled);
    this.chipButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    this.updateReelControls();
    if (enabled) this.pickStake(this.stakeCents); // re-disable unaffordable chips
  }

  private pullLever(): void {
    if (this.spinning) return;
    this.tweens.add({
      targets: this.lever, angle: 12, duration: 90, yoyo: true, ease: 'Sine.InOut',
    });
    void this.spin();
  }

  private async spin(): Promise<void> {
    if (this.spinning) return;
    const balance = session.user?.balance_cents ?? 0;
    if (this.stakeCents > balance) { this.toast.setText('not enough to stake that'); return; }

    this.spinning = true;
    this.toast.setText('');
    this.showReaction(TEX.reactionNeutral);
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
        this.showReaction(TEX.reactionWin);
        juice.flash(this, outcome.reward);
        juice.coinBurst(this, this.machine.x, MACHINE_Y);
        juice.shake(this);
        juice.winReaction(this, this.machine); // probabilistic squash-and-stretch
        audio.playLossReward();
      } else {
        // BAD outcome: money gained.
        this.showReaction(TEX.reactionLoss);
        juice.glitch(this);
        juice.flash(this, outcome.punish);
        audio.playGainPunish();
      }
    } catch (e) {
      roll.remove();
      const fresh = await api.getMe().catch(() => null);
      if (fresh) session.setUser(fresh);
      if (!this.scene.isActive()) return; // won during the error-path refresh — WinScene took over
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
