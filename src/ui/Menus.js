import { CREDITS } from './credits.js';

const $ = (id) => document.getElementById(id);

// Wires the DOM screens (menu, pause, settings, game over) to the game.
export class Menus {
  constructor(game) {
    this.game = game;
    this.screens = { menu: $('menu'), pause: $('pause'), settings: $('settings'), gameover: $('gameover'), credits: $('credits') };
    this.settingsReturn = 'menu';
    const s = game.settings;

    // difficulty
    this.diffButtons = [...document.querySelectorAll('#diff-buttons button')];
    this.diffButtons.forEach((b) => b.addEventListener('click', () => {
      s.difficulty = b.dataset.diff; s.save(); this._syncDiff();
    }));
    this._syncDiff();

    $('btn-play').addEventListener('click', () => game.startGame());
    $('btn-settings').addEventListener('click', () => this.openSettings('menu'));
    $('btn-resume').addEventListener('click', () => game.requestResume());
    $('btn-pause-settings').addEventListener('click', () => this.openSettings('pause'));
    $('btn-quit').addEventListener('click', () => game.toMenu());
    $('btn-retry').addEventListener('click', () => game.startGame());
    $('btn-menu').addEventListener('click', () => game.toMenu());
    $('btn-settings-back').addEventListener('click', () => this.show(this.settingsReturn));
    $('btn-credits').addEventListener('click', () => this.show('credits'));
    $('btn-credits-back').addEventListener('click', () => this.show('menu'));
    this._fillCredits();

    // sliders
    const bind = (id, key, fmt, after) => {
      const input = $(id), out = $(id.replace('set-', '') + '-val');
      input.value = s[key];
      const sync = () => { out.textContent = fmt(Number(input.value)); };
      sync();
      input.addEventListener('input', () => {
        s[key] = Number(input.value); sync(); s.save();
        if (after) after();
      });
    };
    bind('set-sens', 'sensitivity', (v) => v.toFixed(2) + '×');
    bind('set-fov', 'fov', (v) => v + '°');
    bind('set-vol', 'volume', (v) => Math.round(v * 100) + '%', () => game.audio.applyVolumes());
    bind('set-music', 'music', (v) => Math.round(v * 100) + '%', () => game.audio.applyVolumes());
    // the music slider id is set-music -> music-val, the volume slider is set-vol -> vol-val

    this.qualityButtons = [...document.querySelectorAll('#quality-buttons button')];
    this.qualityButtons.forEach((b) => b.addEventListener('click', () => {
      s.quality = b.dataset.quality; s.save(); this._syncQuality(); game.applyQuality();
    }));
    this._syncQuality();
  }

  _syncDiff() {
    this.diffButtons.forEach((b) => b.classList.toggle('sel', b.dataset.diff === this.game.settings.difficulty));
  }

  _syncQuality() {
    this.qualityButtons.forEach((b) => b.classList.toggle('sel', b.dataset.quality === this.game.settings.quality));
  }

  openSettings(from) {
    this.settingsReturn = from;
    this.show('settings');
  }

  // Show one screen (or none).
  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    if (name !== 'pause') $('resume-note').classList.add('hidden');
  }

  _fillCredits() {
    const list = $('credits-list');
    for (const c of CREDITS) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = c.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = c.what;
      const b = document.createElement('b');
      b.append(a);
      const lic = document.createElement('small');
      lic.textContent = c.license;
      li.append(b, ` by ${c.author}`, lic);
      list.append(li);
    }
  }

  showResumeNote() { $('resume-note').classList.remove('hidden'); }

  showGameOver(stats, diffLabel) {
    $('go-wave').textContent = stats.waves;
    $('go-kills').textContent = stats.kills;
    $('go-acc').textContent = stats.shots ? Math.round((stats.hits / stats.shots) * 100) + '%' : '—';
    const t = Math.floor(stats.time);
    $('go-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    $('go-diff').textContent = `${diffLabel} difficulty · reached wave ${stats.reached}`;
    this.show('gameover');
  }
}
