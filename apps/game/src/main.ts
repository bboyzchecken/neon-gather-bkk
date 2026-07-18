import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

declare global {
  interface Window {
    __neonGame?: Phaser.Game;
  }
}

// Guard against double instantiation (vite HMR / duplicate module evaluation).
if (window.__neonGame) {
  window.__neonGame.destroy(true);
}

const game = new Phaser.Game({
  // CANVAS: reliable snapshots (photo booth in Phase 1) and light enough here.
  type: Phaser.CANVAS,
  parent: 'game',
  backgroundColor: '#12202b',
  pixelArt: false,
  // setTimeout loop instead of RAF: keeps the world stepping in background
  // tabs (RAF freezes when a tab is hidden — bad for a multiplayer world).
  fps: { forceSetTimeOut: true, target: 60 },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
  },
  scene: [BootScene, WorldScene],
});

// Phaser pauses the loop when the document goes hidden; wake it right back up.
game.events.on(Phaser.Core.Events.HIDDEN, () => game.loop.wake());

window.__neonGame = game;
