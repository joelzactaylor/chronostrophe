import Phaser from 'phaser';
import { GameScene, VIEW_H, VIEW_W } from './game/GameScene';
import { HudScene } from './game/HudScene';
import { MenuScene } from './game/MenuScene';
import { EditorScene } from './game/EditorScene';
import { TitleScene } from './game/TitleScene';
import { initTheme, getCurrentTheme } from './game/theme';
import { initFullscreen } from './game/fullscreen';

const HUD_H = 96;

initTheme();
initFullscreen();
const theme = getCurrentTheme();
const bgHex = `#${theme.bg.toString(16).padStart(6, '0')}`;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: VIEW_W,
  height: VIEW_H + HUD_H,
  backgroundColor: bgHex,
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 0 },
      autoUpdate: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TitleScene, MenuScene, GameScene, HudScene, EditorScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { chronostrophe: Phaser.Game }).chronostrophe = game;
}
