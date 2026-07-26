import Phaser from 'phaser';
import { mountTopHud } from '../ui/TopHud';
import { BackTab } from '../ui/BackTab';
import { paintBackdrop } from '../ui/Backdrop';
import { Orb } from '../ui/Orb';
import { BeerButton } from '../ui/BeerButton';
import { TEX } from '../core/assets';
import { api, ApiError } from '../core/api';
import { session } from '../core/session';
import { chrome, text } from '../core/theme';
import { GAME_WIDTH, fitCamera } from '../core/viewport';

/** Where the orbs sit on the table. High enough that the tallest orb's hover
 * caption still clears the toast line below. */
const ORB_ROW_Y = 380;

/**
 * Deliberately mismatched orbs: each bet gets its own size and its own height on
 * the table, so the row reads as three things dealt onto felt rather than a row
 * of buttons. Market sits biggest and lowest as the centrepiece.
 */
const ORB_LAYOUT = {
  beer: { dx: -350, dy: -14, radius: 74 },
  market: { dx: 0, dy: 34, radius: 100 },
  casino: { dx: 330, dy: -30, radius: 64 },
} as const;

export class PoisonScene extends Phaser.Scene {
  private toast!: Phaser.GameObjects.Text;

  constructor() {
    super('Poison');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    fitCamera(this);
    paintBackdrop(this);
    mountTopHud(this);

    this.add.text(cx, chrome.contentTop, 'choose your poison', text.title).setOrigin(0.5, 0);

    const { beer, market, casino } = ORB_LAYOUT;
    new BeerButton(this, cx + beer.dx, ORB_ROW_Y + beer.dy, () => this.buyBeer(), {
      radius: beer.radius,
      description: 'buy a round, drain a dollar',
    });
    new Orb(this, cx + market.dx, ORB_ROW_Y + market.dy, TEX.orbMarket, 'MARKET',
      () => this.scene.start('Market'),
      { radius: market.radius, description: 'short the odds, bet on the dip' });
    new Orb(this, cx + casino.dx, ORB_ROW_Y + casino.dy, TEX.orbCasino, 'CASINO',
      () => this.scene.start('Casino'),
      { radius: casino.radius, description: 'pick a machine, feed it' });

    this.toast = this.add.text(cx, 650, '', text.toast).setOrigin(0.5);

    new BackTab(this, 'give up?', () => {
      session.clear();
      this.scene.start('Menu');
    });
  }

  private async buyBeer(): Promise<void> {
    this.toast.setText('');
    try {
      session.applyBeerResult(await api.buyBeer());
    } catch (e) {
      if (!this.scene.isActive()) return; // won mid-request — Win took over
      this.toast.setText(e instanceof ApiError ? e.message : 'connection hiccup — try again');
    }
  }
}
