import Phaser from 'phaser';
import { bakeAll, loadMusic, loadSymbolIcons } from '../core/assets';
import { FONTS_TO_LOAD } from '../core/theme';

/** Never wait longer than this on the webfonts before booting anyway. */
const FONT_TIMEOUT_MS = 3000;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadSymbolIcons(this);
    loadMusic(this);
  }

  create(): void {
    // Phaser rasterises a Text object with whatever font is available the moment
    // it's created and never repaints it, so the webfonts have to be resident
    // BEFORE the first scene draws — otherwise every label is stuck in Times for
    // the rest of the session. The suit glyphs baked into the card art need them
    // too. A failed or slow font must never brick the boot, hence the race
    // against a timeout: worst case we fall back to Georgia/system-ui.
    void this.awaitFonts().then(() => {
      bakeAll(this);
      this.scene.start('Title');
    });
  }

  private awaitFonts(): Promise<unknown> {
    const loaded = Promise.all(FONTS_TO_LOAD.map((f) => document.fonts.load(f)));
    const timeout = new Promise((resolve) => this.time.delayedCall(FONT_TIMEOUT_MS, resolve));
    return Promise.race([loaded, timeout]).catch(() => undefined);
  }
}
