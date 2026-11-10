import * as THREE from 'three';
import { scaledDifficulty } from '../config.js';

const FIRST_DELAY = 4;
const BREAK_TIME = 12;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Runs the wave loop: calm break -> wave -> calm break...
export class WaveDirector {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.state = 'break';
    this.timer = FIRST_DELAY;
    this.queue = [];
    this.spawnTimer = 0;
    this.maxAlive = 4;
    this.waveTotal = 0;
    this.lastCountdown = -1;
  }

  get remaining() {
    return this.queue.length + this.game.bots.aliveCount;
  }

  _composition(wave) {
    const count = Math.min(40, 4 + (wave - 1) * 2);
    const wardens = wave >= 5 ? Math.min(6, Math.floor((wave - 3) / 2)) : 0;
    const wisps = wave >= 3 ? Math.floor((count - wardens) * 0.3) : 0;
    const list = [];
    for (let i = 0; i < wardens; i++) list.push('warden');
    for (let i = 0; i < wisps; i++) list.push('wisp');
    while (list.length < count) list.push('drifter');
    return shuffle(list);
  }

  startWave() {
    this.wave++;
    this.state = 'active';
    this.queue = this._composition(this.wave);
    this.waveTotal = this.queue.length;
    this.maxAlive = Math.min(10, 3 + Math.floor(this.wave / 2));
    this.spawnTimer = 0.5;
    this.params = scaledDifficulty(this.game.difficulty, this.wave);
    this.game.hud.banner(`Wave ${this.wave}`, this.wave === 1 ? 'They drift in from the quiet rooms' : 'The light stirs again');
    this.game.audio.waveStart();
  }

  _cleared() {
    this.state = 'break';
    this.timer = BREAK_TIME;
    this.game.stats.waves = this.wave;
    this.game.hud.banner(`Wave ${this.wave} cleared`, 'Breathe. Supplies have appeared.');
    this.game.audio.waveClear();
    this._spawnSupplies();
  }

  _spawnSupplies() {
    const spots = shuffle(this.game.level.pickupSpots.slice());
    const n = Math.min(spots.length, 4);
    for (let i = 0; i < n; i++) this.game.pickups.spawn(i % 2 === 0 ? 'health' : 'ammo', spots[i]);
  }

  _pickSpawn() {
    const game = this.game;
    const level = game.level;
    const eye = game.player.eye;
    const candidates = level.spawnPoints.map((p) => {
      const jitter = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
      const pos = p.clone().add(jitter);
      const d = pos.distanceTo(game.player.pos);
      const visible = level.lineOfSight(eye, pos.clone().setY(1.2));
      return { pos, d, visible };
    });
    const good = candidates.filter((c) => c.d > 14 && !c.visible);
    if (good.length) return good[(Math.random() * good.length) | 0].pos;
    candidates.sort((a, b) => b.d - a.d);
    return candidates[0].pos;
  }

  update(dt) {
    if (this.state === 'break') {
      this.timer -= dt;
      const c = Math.ceil(this.timer);
      if (c !== this.lastCountdown) {
        this.lastCountdown = c;
        if (c <= 3 && c > 0) this.game.audio.tick();
      }
      this.game.hud.setWave(this.wave + 1, null, Math.max(0, this.timer));
      if (this.timer <= 0) this.startWave();
      return;
    }

    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0 && this.game.bots.aliveCount < this.maxAlive) {
      const type = this.queue.shift();
      this.game.bots.spawn(type, this._pickSpawn(), this.params);
      this.spawnTimer = 1.1;
    }
    this.game.hud.setWave(this.wave, this.remaining, null);
    if (!this.queue.length && this.game.bots.aliveCount === 0) this._cleared();
  }
}
