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
  SLOT_SYMBOLS, SLOT_FRAME_INSET, SLOT_BASE_INSET, TEX, symbolIconKey, symbolTextureKey,
  type SlotSymbol,
} from '../core/assets';

// Stake tiers at the minimum reel count; scales up with `stakeMultiplier()` so
// a wider machine is a bigger-stakes machine, not just a longer one.
const STAKE_BASE = [100, 1000, 5000, 10000]; // cents: $1 / $10 / $50 / $100
const REEL_SIZE = 128;
const REEL_GAP = 24;
const FRAME_PAD = 70; // horizontal padding around the reels inside the window
const MACHINE_X_OFFSET = -80; // nudge left, at the minimum reel count, so the machine clears the paytable
const MACHINE_X_SHIFT_PER_REEL = 18; // extra left nudge per reel past the minimum — a wider cabinet needs more clearance
const MACHINE_Y = 335;

// Cabinet vertical layout: a header marquee (the "changing image" reaction
// lives here — never in the reel window, so the two can't visually collide),
// the reel window, and a base tray. All three share the machine's centre x and
// stretch to the active reel span; see `layoutCabinet`.
const WINDOW_HEIGHT = 170;
const MARQUEE_HEIGHT = 120;
const BASE_HEIGHT = 60;
const CABINET_TOP = -(WINDOW_HEIGHT / 2 + MARQUEE_HEIGHT);
const CABINET_BOTTOM = WINDOW_HEIGHT / 2 + BASE_HEIGHT;
const CABINET_HEIGHT = CABINET_BOTTOM - CABINET_TOP;
const PILLAR_LOCAL_Y = (CABINET_TOP + CABINET_BOTTOM) / 2;
const BASE_LOCAL_Y = WINDOW_HEIGHT / 2 + BASE_HEIGHT / 2;
const REEL_LOCAL_Y = 0; // reels sit centred in the window
const REACTION_LOCAL_Y = -(WINDOW_HEIGHT / 2 + MARQUEE_HEIGHT / 2); // marquee centre
const REACTION_SIZE = { w: 170, h: 88 } as const; // authored size of the baked face

// Side pillars: fixed-size (never stretched), reposition with the frame width.
const PILLAR_WIDTH = 44;
const PILLAR_GAP = 6; // felt reveal between the window and its pillar

// Marquee light row, as fractions of the current frame width.
const BULB_FRACTIONS = [-0.42, -0.25, -0.08, 0.08, 0.25, 0.42] as const;

// The lever image is baked at 60x220 (see assets.ts); scale it, keeping
// aspect, to whatever height looks right mounted on the pillar.
const LEVER_SOURCE_ASPECT = 60 / 220;
const LEVER_HEIGHT = 240;

export class SlotsScene extends Phaser.Scene {
  private stakeIndex = 0;
  private reelCount = 3;
  private minReels = 3;
  private maxReels = 5;
  private spinning = false;

  private machine!: Phaser.GameObjects.Container;
  private base!: Phaser.GameObjects.NineSlice;
  private frame!: Phaser.GameObjects.NineSlice;
  private marquee!: Phaser.GameObjects.NineSlice;
  private pillarL!: Phaser.GameObjects.Image;
  private pillarR!: Phaser.GameObjects.Image;
  private bulbs: Phaser.GameObjects.Image[] = [];
  private reaction!: Phaser.GameObjects.Image;
  private reelSprites: Phaser.GameObjects.Image[] = [];
  private reelIcons: Phaser.GameObjects.Image[] = [];
  private chipButtons: { index: number; btn: Button }[] = [];
  private lever!: Phaser.GameObjects.Image;
  private leverLabel!: Phaser.GameObjects.Text;
  private leverEnabled = true;
  private plusBtn!: Button;
  private minusBtn!: Button;
  private reelLabel!: Phaser.GameObjects.Text;
  private reelCountBg!: Phaser.GameObjects.Image;
  private reelCountText!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private infoPanel!: SlotInfoPanel;
  private idleTween?: Phaser.Tweens.Tween;

  constructor() {
    super('Slots');
  }

  create(): void {
    this.chipButtons = [];
    this.spinning = false;
    this.reelSprites = [];
    this.reelIcons = [];
    this.bulbs = [];

    const cx = GAME_WIDTH / 2;
    fitCamera(this);
    paintBackdrop(this);
    mountTopHud(this);

    // Clear of the HUD panels, which now own the top 92px of the frame.
    this.add.text(cx, 104, 'SLOTS', text.heading).setOrigin(0.5);

    // The machine as one container so juice can squash-and-stretch the whole
    // unit, and so every mounted control (lever, reel controls) rides along.
    this.machine = this.add.container(this.computeMachineX(), MACHINE_Y);

    this.base = this.add.nineslice(
      0, BASE_LOCAL_Y, TEX.slotBase, undefined, 400, BASE_HEIGHT,
      SLOT_BASE_INSET, SLOT_BASE_INSET, SLOT_BASE_INSET, SLOT_BASE_INSET,
    );
    this.frame = this.add.nineslice(
      0, 0, TEX.slotFrame, undefined, 400, WINDOW_HEIGHT,
      SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET,
    );
    this.marquee = this.add.nineslice(
      0, REACTION_LOCAL_Y, TEX.slotFrame, undefined, 400, MARQUEE_HEIGHT,
      SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET, SLOT_FRAME_INSET,
    );
    this.pillarL = this.add.image(0, PILLAR_LOCAL_Y, TEX.slotPillar).setDisplaySize(PILLAR_WIDTH, CABINET_HEIGHT);
    this.pillarR = this.add.image(0, PILLAR_LOCAL_Y, TEX.slotPillar).setDisplaySize(PILLAR_WIDTH, CABINET_HEIGHT);
    this.bulbs = BULB_FRACTIONS.map((_, i) => this.add.image(0, 0, i % 2 === 0 ? TEX.coin : TEX.glitch).setDisplaySize(12, 12));
    // Baked textures come out oversized (see `bake`), so the few images that
    // don't otherwise set a size have to state it.
    this.reaction = this.add.image(0, REACTION_LOCAL_Y, TEX.reactionNeutral)
      .setDisplaySize(REACTION_SIZE.w, REACTION_SIZE.h);
    this.machine.add([this.base, this.pillarL, this.pillarR, this.frame, this.marquee, ...this.bulbs, this.reaction]);

    this.buildLever();
    this.buildReelControls();
    this.buildReels(); // sizes the window/marquee/base/pillars/lever/controls to the initial reel count

    // Stake chips.
    this.add.text(cx, 558, 'STAKE', text.label).setOrigin(0.5);
    STAKE_BASE.forEach((_, i) => {
      const x = cx - 255 + i * 170;
      const btn = new Button(this, x, 608, `$${this.stakeCentsFor(i) / 100}`, () => this.pickStake(i), { width: 150 });
      this.chipButtons.push({ index: i, btn });
    });

    this.toast = this.add.text(cx, 650, '', text.toast).setOrigin(0.5);

    new BackTab(this, 'go back?', () => this.scene.start('Casino'));

    this.infoPanel = new SlotInfoPanel(this, GAME_WIDTH - 140, 380, 560);
    api.slotsInfo()
      .then((info) => {
        this.minReels = info.min_reels;
        this.maxReels = info.max_reels;
        this.infoPanel.setInfo(info);
        this.buildReels(); // reel count's relation to minReels may have shifted the cabinet nudge/stakes
        this.updateReelControls();
        this.refreshStakeChips();
      })
      .catch(() => { /* paytable is informational-only; ignore fetch failures */ });

    this.pickStake(0);
    this.updateReelControls();
    this.infoPanel.setReelCount(this.reelCount);

    // Idle sway — a little life in the cabinet between spins. Paused and
    // zeroed for the duration of a spin so it never fights the outcome juice.
    this.idleTween = this.tweens.add({
      targets: this.machine, angle: 1.6, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
  }

  private computeMachineX(): number {
    const extraReels = Math.max(0, this.reelCount - this.minReels);
    return GAME_WIDTH / 2 + MACHINE_X_OFFSET - extraReels * MACHINE_X_SHIFT_PER_REEL;
  }

  private buildLever(): void {
    const height = LEVER_HEIGHT;
    const width = height * LEVER_SOURCE_ASPECT;
    // Origin at the base — the pivot the pull animation rotates around, and
    // the point the mounting bracket in the art is drawn to meet.
    this.lever = this.add.image(0, CABINET_BOTTOM, TEX.lever).setOrigin(0.5, 1).setDisplaySize(width, height);
    this.leverLabel = this.add.text(0, CABINET_BOTTOM + 16, 'PULL', text.label).setOrigin(0.5, 0);
    this.machine.add([this.lever, this.leverLabel]);

    this.lever.setInteractive({ useHandCursor: true });
    this.lever.on('pointerdown', () => {
      if (this.spinning || !this.leverEnabled) return;
      audio.playClick();
      this.pullLever();
    });
  }

  private setLeverEnabled(enabled: boolean): void {
    this.leverEnabled = enabled;
    this.lever.setAlpha(enabled ? 1 : 0.4);
    if (this.lever.input) this.lever.input.enabled = enabled;
  }

  private buildReelControls(): void {
    this.reelLabel = this.add.text(0, PILLAR_LOCAL_Y - 90, 'REELS', text.label).setOrigin(0.5);
    this.plusBtn = new Button(this, 0, PILLAR_LOCAL_Y - 40, '+', () => this.changeReels(+1), {
      width: 56, height: 50, fontSize: '30px',
    });
    // The count reads as its own control (not just loose text on the pillar)
    // by sharing the exact button chrome the +/- controls either side use.
    this.reelCountBg = this.add.image(0, PILLAR_LOCAL_Y + 15, TEX.button).setDisplaySize(56, 50);
    this.reelCountText = this.add.text(0, PILLAR_LOCAL_Y + 15, String(this.reelCount), {
      ...text.money, fontSize: '22px',
    }).setOrigin(0.5);
    this.minusBtn = new Button(this, 0, PILLAR_LOCAL_Y + 70, '−', () => this.changeReels(-1), {
      width: 56, height: 50, fontSize: '30px',
    });
    this.machine.add([this.reelLabel, this.plusBtn, this.reelCountBg, this.reelCountText, this.minusBtn]);
  }

  /** Resizes the stretchable plates and repositions every pillar-mounted
   *  control to match the active reel span — the fix for controls that used
   *  to sit at a fixed screen x regardless of the cabinet's actual width. */
  private layoutCabinet(frameWidth: number): void {
    this.frame.setSize(frameWidth, WINDOW_HEIGHT);
    this.marquee.setSize(frameWidth, MARQUEE_HEIGHT);
    this.base.setSize(frameWidth, BASE_HEIGHT);

    const pillarX = frameWidth / 2 + PILLAR_GAP + PILLAR_WIDTH / 2;
    this.pillarL.x = -pillarX;
    this.pillarR.x = pillarX;
    this.lever.x = pillarX;
    this.leverLabel.x = pillarX;
    this.reelLabel.x = -pillarX;
    this.plusBtn.x = -pillarX;
    this.reelCountBg.x = -pillarX;
    this.reelCountText.x = -pillarX;
    this.minusBtn.x = -pillarX;

    const bulbY = REACTION_LOCAL_Y - MARQUEE_HEIGHT / 2 + 10;
    this.bulbs.forEach((bulb, i) => {
      bulb.x = BULB_FRACTIONS[i] * frameWidth;
      bulb.y = bulbY;
    });

    this.machine.x = this.computeMachineX();
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

    this.layoutCabinet(span + FRAME_PAD);
  }

  private setReel(i: number, sym: SlotSymbol): void {
    this.reelSprites[i].setTexture(symbolTextureKey(sym));
    this.reelIcons[i].setTexture(symbolIconKey(sym));
  }

  private showReaction(key: string): void {
    this.reaction.setTexture(key);
  }

  /** More reels is purely a stake-per-spin choice (the backend's payout logic
   *  is reel-count agnostic) — so a wider machine plays for higher stakes. */
  private stakeMultiplier(): number {
    return 1 + Math.max(0, this.reelCount - this.minReels);
  }

  private stakeCentsFor(index: number): number {
    return STAKE_BASE[index] * this.stakeMultiplier();
  }

  private get stakeCents(): number {
    return this.stakeCentsFor(this.stakeIndex);
  }

  private pickStake(index: number): void {
    this.stakeIndex = index;
    this.refreshStakeChips();
  }

  private refreshStakeChips(): void {
    const balance = session.user?.balance_cents ?? 0;
    this.chipButtons.forEach(({ index, btn }) => {
      const cents = this.stakeCentsFor(index);
      btn.setText(`$${cents / 100}`);
      btn.setSelected(index === this.stakeIndex);
      btn.setEnabled(cents <= balance);
    });
  }

  private changeReels(delta: number): void {
    if (this.spinning) return;
    const next = stepReelCount(this.reelCount, delta, this.minReels, this.maxReels);
    if (next === this.reelCount) return;
    this.reelCount = next;
    this.buildReels();
    this.updateReelControls();
    this.refreshStakeChips();
    this.infoPanel?.setReelCount(next);
  }

  private updateReelControls(): void {
    this.reelCountText.setText(String(this.reelCount));
    this.minusBtn.setEnabled(!this.spinning && this.reelCount > this.minReels);
    this.plusBtn.setEnabled(!this.spinning && this.reelCount < this.maxReels);
  }

  private setControls(enabled: boolean): void {
    if (!this.scene.isActive()) return; // scene may have handed off to Win
    this.setLeverEnabled(enabled);
    this.chipButtons.forEach(({ btn }) => btn.setEnabled(enabled));
    this.updateReelControls();
    if (enabled) this.refreshStakeChips(); // re-disable unaffordable chips
  }

  private pullLever(): void {
    if (this.spinning) return;
    this.tweens.add({
      targets: this.lever, angle: 30, duration: 90, yoyo: true, ease: 'Sine.InOut',
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
    // Idle sway would otherwise fight the shake/squash juice below on the
    // same `angle` property, so it's paused and the cabinet zeroed for the
    // duration of the spin.
    this.idleTween?.pause();
    this.machine.setAngle(0);
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
      this.idleTween?.resume();
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
