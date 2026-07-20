import './styles.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
if (!canvas) {
  throw new Error('Missing #game-canvas');
}

const game = new Game(canvas);
game.init().catch((err) => {
  console.error(err);
  const loading = document.getElementById('screen-loading');
  if (loading) {
    loading.classList.add('active');
    loading.innerHTML = `<div class="loading-inner"><p>Failed to start. Check console.</p><pre style="color:#f4a0c0;font-size:12px;max-width:80vw;white-space:pre-wrap">${String(err)}</pre></div>`;
  }
});
