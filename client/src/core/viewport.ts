// The two coordinate spaces this client lives in, and the one call that bridges
// them. Kept in its own module because `main.ts` imports every scene, so a scene
// importing these back from `main.ts` would close an import cycle.
//
// Runtime-Phaser-free on purpose: `theme.ts` imports RENDER_SCALE from here and
// is itself shared with the DOM overlays. `Phaser.Scene` below is the ambient
// global type, erased at compile time.
//
// See docs/adr/0006-2x-render-scale.md.

/**
 * The size everything is AUTHORED in. Scene coordinates, `chrome` geometry and
 * font sizes are all in these units — never device pixels.
 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/**
 * Device pixels per authored unit. The canvas is this many times bigger than the
 * authored size, and every scene camera zooms by the same factor, so the two
 * cancel and a coordinate keeps its meaning.
 *
 * This is what makes text crisp: a `Scale.FIT` canvas at the authored size
 * rasterises each glyph into 720p and then stretches it. Note that Phaser's
 * `scale.zoom` does NOT help — it resizes only the canvas *style*, leaving the
 * pixel size untouched.
 */
export const RENDER_SCALE = 2;

/**
 * Map the authored {@link GAME_WIDTH}x{@link GAME_HEIGHT} world onto the whole
 * oversized canvas. Every scene must call this first in `create()`; without it
 * the scene draws into the top-left quarter of the screen.
 *
 * Because of this zoom, `scene.scale.width` reports the DEVICE width, not the
 * authored one — reach for {@link GAME_WIDTH} instead.
 */
export function fitCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RENDER_SCALE);
  scene.cameras.main.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
}
