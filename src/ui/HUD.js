import { WEAPONS } from '../config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      cross: $('crosshair'), hit: $('hitmarker'), dirs: $('dmg-dirs'),
      waveLabel: $('wave-label'), waveSub: $('wave-sub'),
      banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      toasts: $('toasts'),
      healthBox: $('health-box'), healthNum: $('health-num'), healthFill: $('health-fill'),
      ammoBox: $('ammo-box'), weaponName: $('weapon-name'), mag: $('ammo-mag'), res: $('ammo-res'),
      slots: [...document.querySelectorAll('#weapon-slots span')], reload: $('reload-hint'),
      kills: $('kills-num'),
    };
    this.hurt = 0;
    this.crossPulse = 0;
    this._last = {};
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  reset() {
    this.hurt = 0;
    this.el.dirs.innerHTML = '';
    this.el.toasts.innerHTML = '';
    this.el.banner.classList.remove('show');
    this._last = {};
  }

  _set(key, el, text) {
    if (this._last[key] === text) return;
    this._last[key] = text;
    el.textContent = text;
  }

  setHealth(h) {
    const v = Math.ceil(h);
    this._set('hp', this.el.healthNum, String(v));
    if (this._last.hpw !== v) {
      this._last.hpw = v;
      this.el.healthFill.style.width = `${v}%`;
      this.el.healthBox.classList.toggle('low', v <= 30);
    }
  }

  setWeapon(weapons) {
    const w = WEAPONS[weapons.current];
    const s = weapons.state[weapons.current];
    this._set('wn', this.el.weaponName, w.name);
    this._set('mag', this.el.mag, String(s.mag));
    this._set('res', this.el.res, Number.isFinite(s.reserve) ? `/ ${s.reserve}` : '/ ∞');
    this.el.ammoBox.classList.toggle('empty', s.mag === 0);
    this.el.slots.forEach((el, i) => el.classList.toggle('sel', i === weapons.current));
  }

  setReloading(on) { this.el.reload.classList.toggle('show', on); }

  setKills(k) { this._set('kills', this.el.kills, String(k)); }

  setWave(wave, remaining, countdown) {
    this._set('wl', this.el.waveLabel, `Wave ${wave}`);
    if (countdown !== null) {
      this._set('ws', this.el.waveSub, wave === 1 ? `Begins in ${Math.ceil(countdown)}` : `Next wave in ${Math.ceil(countdown)}`);
    } else {
      this._set('ws', this.el.waveSub, `${remaining} remaining`);
    }
  }

  banner(title, sub) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.banner.classList.remove('show'), 2600);
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    this.el.toasts.appendChild(t);
    setTimeout(() => t.remove(), 1900);
  }

  hitMarker(head, kill) {
    const h = this.el.hit;
    h.classList.remove('show', 'head', 'kill');
    void h.offsetWidth;
    h.classList.add('show');
    if (head) h.classList.add('head');
    if (kill) h.classList.add('kill');
    clearTimeout(this._hitT);
    this._hitT = setTimeout(() => h.classList.remove('show'), 60);
  }

  pulseCrosshair() { this.crossPulse = 1; }

  flashDamage(amount, fromPos, player) {
    this.hurt = Math.min(1, this.hurt + 0.25 + amount / 40);
    if (!fromPos) return;
    const dx = fromPos.x - player.pos.x, dz = fromPos.z - player.pos.z;
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const fwd = dx * -s + dz * -c;
    const right = dx * c + dz * -s;
    const ang = Math.atan2(right, fwd);
    const arc = document.createElement('div');
    arc.className = 'arc';
    arc.style.transform = `rotate(${ang}rad)`;
    this.el.dirs.appendChild(arc);
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.opacity = '0'; }));
    setTimeout(() => arc.remove(), 1000);
  }

  update(dt, weapons, player) {
    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.crossPulse = Math.max(0, this.crossPulse - dt * 8);
    const w = WEAPONS[weapons.current];
    const spread = w.spread + weapons.bloom + w.moveSpread * Math.min(1, player.speed / 5.2) + (player.onGround ? 0 : 0.03);
    const gap = 5 + spread * 260 + this.crossPulse * 5;
    const g = Math.round(gap);
    if (this._last.gap !== g) {
      this._last.gap = g;
      this.el.cross.style.setProperty('--gap', `${g}px`);
    }
    this.setHealth(player.health);
  }
}
