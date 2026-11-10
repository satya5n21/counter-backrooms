// Everything here is synthesised with Web Audio: no sound files.
// Ambient room tone + a slow, warm pad with music-box notes, and all SFX.

const CHORDS = [
  [53, 57, 60, 64],   // Fmaj7
  [57, 60, 64, 67],   // Am7
  [50, 53, 57, 60, 64], // Dm9-ish
  [48, 52, 55, 59],   // Cmaj7
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.started = false;
    this.lastStep = 0;
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.ambience = ctx.createGain();

    // shared reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.music.connect(this.reverbSend);
    this.ambience.connect(this.master);
    this.sfxVerb = ctx.createGain();
    this.sfxVerb.gain.value = 0.25;
    this.sfx.connect(this.sfxVerb);
    this.sfxVerb.connect(this.reverbSend);

    this.noise = this._noiseBuffer(2);
    this.applyVolumes();
    this._startAmbience();
    this._startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.volume, t, 0.05);
    this.music.gain.setTargetAtTime(0.5 * this.settings.music, t, 0.1);
    this.sfx.gain.setTargetAtTime(0.9, t, 0.05);
    this.ambience.gain.setTargetAtTime(0.6, t, 0.1);
  }

  setPaused(p) {
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(p ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = camera.position;
    const f = camera.getWorldDirection(this._tmpF || (this._tmpF = camera.position.clone()));
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f.x, t); l.forwardY.setValueAtTime(f.y, t); l.forwardZ.setValueAtTime(f.z, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  // ---------- building blocks ----------
  _noiseBuffer(seconds) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = rate * seconds;
    const b = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  _panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 3;
    p.rolloffFactor = 1.1;
    p.maxDistance = 60;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.sfx);
    return p;
  }

  _noiseHit({ dur = 0.15, freq = 1500, q = 0.8, type = 'bandpass', gain = 0.5, attack = 0.002, dest = null, when = 0, freqEnd = null }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  _tone({ freq = 440, freqEnd = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, dest = null, when = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- ambience & music ----------
  _startAmbience() {
    const ctx = this.ctx;
    // brown-ish room tone
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const g = ctx.createGain(); g.gain.value = 0.06;
    src.connect(lp); lp.connect(g); g.connect(this.ambience);
    src.start();
    // faint, soft fluorescent hum
    for (const [f, a] of [[120, 0.006], [240, 0.003], [360, 0.0012]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = a;
      o.connect(og); og.connect(this.ambience); o.start();
    }
    // slow breathing swell on the room tone
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
  }

  _startMusic() {
    this.chordIndex = 0;
    this.nextChord = this.ctx.currentTime + 0.5;
    this.nextNote = this.ctx.currentTime + 2;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 250);
  }

  _scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    while (this.nextChord < now + 1) {
      this._padChord(CHORDS[this.chordIndex % CHORDS.length], this.nextChord, 9.5);
      this.chordIndex++;
      this.nextChord += 8;
    }
    while (this.nextNote < now + 1) {
      const chord = CHORDS[(this.chordIndex + CHORDS.length - 1) % CHORDS.length];
      const pool = PENTA.filter((m) => chord.some((c) => (m - c) % 12 === 0) || Math.random() < 0.3);
      const m = pool[(Math.random() * pool.length) | 0] || 76;
      this._musicBox(m, this.nextNote);
      if (Math.random() < 0.35) this._musicBox(m + (Math.random() < 0.5 ? 5 : 7), this.nextNote + 0.32);
      this.nextNote += 1.6 + Math.random() * 3.2;
    }
  }

  _padChord(notes, t, dur) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 3);
    g.gain.setValueAtTime(0.05, t + dur - 3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    lp.connect(g); g.connect(this.music);
    for (const n of notes) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = mtof(n - 12);
        o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = 0.35;
        o.connect(og); og.connect(lp);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  }

  _musicBox(midi, t) {
    const ctx = this.ctx;
    const f = mtof(midi);
    for (const [mul, a, d] of [[1, 0.06, 2.2], [2, 0.015, 1.0], [3.01, 0.006, 0.6]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + d + 0.05);
    }
  }

  // ---------- SFX ----------
  gunshot(id) {
    if (!this.ctx) return;
    if (id === 'pistol') {
      this._noiseHit({ dur: 0.14, freq: 1800, q: 0.7, gain: 0.55 });
      this._noiseHit({ dur: 0.05, freq: 5000, type: 'highpass', gain: 0.25 });
      this._tone({ freq: 160, freqEnd: 50, dur: 0.12, gain: 0.5 });
    } else if (id === 'rifle') {
      this._noiseHit({ dur: 0.11, freq: 2400, q: 0.6, gain: 0.45 });
      this._noiseHit({ dur: 0.04, freq: 6000, type: 'highpass', gain: 0.2 });
      this._tone({ freq: 140, freqEnd: 45, dur: 0.1, gain: 0.42 });
    } else {
      this._noiseHit({ dur: 0.32, freq: 2600, freqEnd: 400, type: 'lowpass', q: 0.5, gain: 0.8 });
      this._tone({ freq: 110, freqEnd: 35, dur: 0.25, gain: 0.7 });
      this._noiseHit({ dur: 0.06, freq: 900, gain: 0.3, when: 0.35 });   // pump
      this._noiseHit({ dur: 0.05, freq: 1400, gain: 0.25, when: 0.48 });
    }
  }

  dryFire() {
    if (!this.ctx) return;
    this._noiseHit({ dur: 0.03, freq: 3000, gain: 0.25 });
  }

  reload(id) {
    if (!this.ctx) return;
    if (id === 'shotgun') {
      this._noiseHit({ dur: 0.05, freq: 1200, gain: 0.3, when: 0.15 });
      return;
    }
    this._noiseHit({ dur: 0.04, freq: 2000, gain: 0.3, when: 0.1 });
    this._noiseHit({ dur: 0.06, freq: 900, gain: 0.3, when: 0.45 });
    this._noiseHit({ dur: 0.04, freq: 2600, gain: 0.35, when: id === 'rifle' ? 1.3 : 0.8 });
  }

  weaponSwitch() {
    if (!this.ctx) return;
    this._noiseHit({ dur: 0.05, freq: 1600, gain: 0.18 });
  }

  footstep(strength = 0.55) {
    if (!this.ctx) return;
    this._noiseHit({ dur: 0.09, freq: 380, type: 'lowpass', q: 0.4, gain: 0.25 * strength });
  }

  botShoot(pos) {
    if (!this.ctx) return;
    const p = this._panner(pos);
    this._tone({ freq: 980, freqEnd: 420, dur: 0.35, gain: 0.22, dest: p });
    this._tone({ freq: 1470, freqEnd: 700, dur: 0.25, gain: 0.07, dest: p });
  }

  boltImpact(pos) {
    if (!this.ctx) return;
    const p = this._panner(pos);
    this._noiseHit({ dur: 0.18, freq: 1200, q: 1.2, gain: 0.18, dest: p });
  }

  botHit(head) {
    if (!this.ctx) return;
    this._tone({ freq: head ? 1760 : 1320, dur: head ? 0.35 : 0.18, gain: head ? 0.16 : 0.1 });
  }

  botDeath(pos) {
    if (!this.ctx) return;
    const p = this._panner(pos);
    [76, 81, 86, 88].forEach((m, i) => this._tone({ freq: mtof(m), dur: 1.4, gain: 0.12, dest: p, when: i * 0.07 }));
    this._noiseHit({ dur: 0.8, freq: 3000, freqEnd: 8000, type: 'bandpass', q: 2, gain: 0.08, dest: p });
  }

  playerHurt() {
    if (!this.ctx) return;
    this._tone({ freq: 90, freqEnd: 50, dur: 0.3, gain: 0.5 });
    this._noiseHit({ dur: 0.2, freq: 500, type: 'lowpass', gain: 0.35 });
  }

  pickup(kind) {
    if (!this.ctx) return;
    const base = kind === 'health' ? 72 : 67;
    this._tone({ freq: mtof(base), dur: 0.5, gain: 0.16 });
    this._tone({ freq: mtof(base + 7), dur: 0.7, gain: 0.14, when: 0.09 });
  }

  tick() {
    if (!this.ctx) return;
    this._tone({ freq: 880, dur: 0.25, gain: 0.08 });
  }

  waveStart() {
    if (!this.ctx) return;
    this._tone({ freq: 65, dur: 3.5, gain: 0.35, attack: 0.02 });
    this._tone({ freq: 130.8, dur: 3, gain: 0.12, attack: 0.02 });
    this._tone({ freq: 196, dur: 2.4, gain: 0.08, attack: 0.02 });
  }

  waveClear() {
    if (!this.ctx) return;
    [69, 72, 76, 79, 84].forEach((m, i) => this._tone({ freq: mtof(m), dur: 1.6, gain: 0.12, when: i * 0.12 }));
  }

  gameOver() {
    if (!this.ctx) return;
    [64, 60, 57, 53].forEach((m, i) => this._tone({ freq: mtof(m), dur: 2.5, gain: 0.14, when: i * 0.35 }));
  }
}
