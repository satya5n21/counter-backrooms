const KEY = 'counter-rooms-settings-v1';

const DEFAULTS = {
  sensitivity: 1.0,   // multiplier
  fov: 78,
  volume: 0.7,
  music: 0.5,
  quality: 'high',    // 'high' | 'low'
  difficulty: 'normal',
};

export class Settings {
  constructor() {
    Object.assign(this, DEFAULTS);
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this, DEFAULTS, JSON.parse(raw));
    } catch { /* storage unavailable: keep defaults */ }
  }

  save() {
    try {
      const data = {};
      for (const k of Object.keys(DEFAULTS)) data[k] = this[k];
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }
}
