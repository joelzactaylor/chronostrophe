/**
 * Fullscreen, with ESC held inside the page.
 *
 * ESC is the game's back key: it opens the menu from a level, closes the help
 * and settings panels, leaves the editor. The browser also reads it as "leave
 * fullscreen", so by default a single press does both — you step back one
 * screen and lose fullscreen with it. The Keyboard Lock API routes ESC to the
 * page instead, which leaves exactly two deliberate ways out: the level select
 * menu, where ESC is not needed for anything else, and holding ESC (the escape
 * hatch browsers keep for themselves).
 *
 * The lock is Chromium-only and needs a secure context. Elsewhere the requests
 * fail quietly and ESC keeps its native meaning; nothing else changes.
 */

interface KeyboardLock {
  lock(keyCodes?: string[]): Promise<void>;
  unlock(): void;
}

function keyboardLock(): KeyboardLock | null {
  const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  return kb && typeof kb.lock === 'function' ? kb : null;
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

/**
 * Starts watching for fullscreen changes so ESC is captured for as long as we
 * are fullscreen, however that was entered. Call once at boot.
 */
export function initFullscreen(): void {
  document.addEventListener('fullscreenchange', () => {
    if (isFullscreen()) void keyboardLock()?.lock(['Escape']).catch(() => {});
    else keyboardLock()?.unlock();
  });
}

export function enterFullscreen(): void {
  document.documentElement.requestFullscreen().catch(() => {
    // Refused (no user gesture, or disallowed by the embedding page): stay windowed.
  });
}

export function exitFullscreen(): void {
  if (!isFullscreen()) return;
  keyboardLock()?.unlock();
  void document.exitFullscreen().catch(() => {});
}

export function toggleFullscreen(): void {
  if (isFullscreen()) exitFullscreen();
  else enterFullscreen();
}
