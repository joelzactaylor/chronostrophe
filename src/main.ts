import Phaser from 'phaser';
import { GameScene, VIEW_H, VIEW_W } from './game/GameScene';
import { HudScene } from './game/HudScene';

const HUD_H = 96;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: VIEW_W,
  height: VIEW_H + HUD_H,
  backgroundColor: '#05030a',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, HudScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { chronostrophe: Phaser.Game }).chronostrophe = game;
}
