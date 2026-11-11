import Phaser from 'phaser';
import GameScene, { VIEW_W, VIEW_H } from './scenes/GameScene.js';

export function createGame(parent, runConfig) {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#0e1630',
    pixelArt: true,
    roundPixels: true,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3 },
    scene: [GameScene],
    callbacks: { preBoot: (g) => g.registry.set('runConfig', runConfig) }
  });
  return game;
}
