import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);

game.init().catch((err) => {
  console.error('[CatTopSim] fatal boot error', err);
  const el = document.querySelector('#screen-loading .loading-text');
  if (el) el.textContent = 'failed to start: ' + (err?.message ?? err);
});

// debug / test harness hook
(window as any).__cat = game;
