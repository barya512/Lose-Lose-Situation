import Phaser from 'phaser';
import { Button } from './Button';
import { TEX } from '../core/assets';
import { chrome } from '../core/theme';

/**
 * Backward navigation, welded into the bottom-LEFT corner of the frame — the
 * mirror of the wallet panel above it. Touches both the left and bottom edges,
 * with only its top-right corner rounded.
 *
 * Copy stays in the game's voice ("go back?", "give up?"); the arrow is added
 * here so no caller has to remember it.
 */
export class BackTab extends Button {
  constructor(scene: Phaser.Scene, label: string, onClick: () => void) {
    super(
      scene,
      chrome.backWidth / 2,
      scene.scale.height - chrome.backHeight / 2,
      `←  ${label}`,
      onClick,
      {
        width: chrome.backWidth,
        height: chrome.backHeight,
        texture: TEX.backTab,
        hoverTexture: TEX.backTabHover,
        lift: false,
      },
    );
  }
}
