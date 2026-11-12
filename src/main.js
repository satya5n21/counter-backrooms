import './style.css';
import { Game } from './core/Game.js';
import { loadAssets } from './core/Assets.js';

const loading = document.getElementById('loading');
const text = loading.querySelector('.loading-text');
const fill = loading.querySelector('.loading-fill');
const detail = loading.querySelector('.loading-detail');

const mb = (b) => (b / 1048576).toFixed(0);

async function boot() {
  // ?lite skips the downloads and uses the original generated textures and models.
  const lite = new URLSearchParams(location.search).has('lite');
  let assets = null;
  try {
    if (!lite) assets = await loadAssets((f, got, total) => {
      fill.style.width = `${(f * 100).toFixed(1)}%`;
      detail.textContent = `${Math.round(f * 100)}%  ·  ${mb(got)} / ${mb(total)} MB`;
    });
  } catch (err) {
    console.error(err);
    assets = null; // fall back to the all-procedural world
  }

  text.textContent = 'Arranging the rooms…';
  detail.textContent = assets?.errors.length ? `${assets.errors.length} file(s) missing, using fallbacks` : '';
  await new Promise((r) => setTimeout(r, 30)); // let that text paint before the synchronous build

  try {
    const game = new Game(document.getElementById('app'), assets);
    await game.warmUp();
  } catch (err) {
    console.error(err);
    text.textContent = 'Could not start WebGL in this browser.';
    return;
  }
  loading.classList.add('hidden');
}

boot();
