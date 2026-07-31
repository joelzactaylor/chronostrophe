import Phaser from 'phaser';
import { FADE_COLOUR } from './theme';

/** Long enough to read as a fade, short enough not to sit between two levels. */
export const FADE_MS = 260;

/** Fades a scene up from the backdrop colour as it opens. */
export function fadeIn(scene: Phaser.Scene, ms = FADE_MS): void {
  scene.cameras.main.fadeIn(ms, ...FADE_COLOUR());
}

/**
 * Fades down and then does the thing — leaving a scene, restarting a level. The
 * callback is guarded so a second call while a fade is already running (mashing
 * ENTER, dying twice) cannot run it twice.
 */
export function fadeOutThen(scene: Phaser.Scene, ms: number, then: () => void): void {
  const cam = scene.cameras.main;
  if (cam.fadeEffect.isRunning) return;
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, then);
  cam.fadeOut(ms, ...FADE_COLOUR());
}
