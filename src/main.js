import './style.css';
import { Game } from './core/Game.js';

function boot() {
  const loading = document.getElementById('loading');
  try {
    new Game(document.getElementById('app'));
  } catch (err) {
    console.error(err);
    loading.querySelector('.loading-text').textContent = 'Could not start WebGL in this browser.';
    return;
  }
  loading.classList.add('hidden');
}

// Let the loading text paint before the (synchronous) world build.
setTimeout(boot, 50);
