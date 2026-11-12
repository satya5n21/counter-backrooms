import * as THREE from 'three';
import { WEAPONS } from '../config.js';
import { softSpriteTexture } from '../world/Textures.js';
import { buildModelWeapons } from './Viewmodels.js';

const metal = new THREE.MeshStandardMaterial({ color: 0x2e2c2a, roughness: 0.45, metalness: 0.6 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: 0.5, metalness: 0.5 });
const tan = new THREE.MeshStandardMaterial({ color: 0xbca57a, roughness: 0.7 });
const wood = new THREE.MeshStandardMaterial({ color: 0x8a5733, roughness: 0.6 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x6e7f73, roughness: 0.9 });
const skin = new THREE.MeshStandardMaterial({ color: 0xd9a988, roughness: 0.8 });

function part(group, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

const fistGeo = new THREE.SphereGeometry(0.036, 12, 10);
const sleeveGeo = new THREE.CylinderGeometry(0.034, 0.042, 0.32, 12);
const cuffGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.03, 12);

function hands(g, gripZ, foreZ = null) {
  const fist = part(g, fistGeo, skin, 0.004, -0.058, gripZ);
  fist.scale.set(1.0, 1.25, 1.3);
  part(g, cuffGeo, sleeve, 0.012, -0.085, gripZ + 0.05, Math.PI / 2 - 0.35, 0, 0.06);
  part(g, sleeveGeo, sleeve, 0.028, -0.135, gripZ + 0.2, Math.PI / 2 - 0.35, 0, 0.1);
  if (foreZ !== null) {
    const f2 = part(g, fistGeo, skin, -0.012, -0.045, foreZ);
    f2.scale.set(1.15, 1.0, 1.4);
    // forearm drops steeply down-left so it stays out of the line of sight
    part(g, sleeveGeo, sleeve, -0.05, -0.2, foreZ + 0.07, 0.35, 0, -0.35);
  }
}

function buildPistol() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.038, 0.045, 0.19), metal, 0, 0.02, -0.05);       // slide
  part(g, new THREE.BoxGeometry(0.034, 0.03, 0.16), darkMetal, 0, -0.012, -0.04);   // frame
  part(g, new THREE.BoxGeometry(0.034, 0.1, 0.05), tan, 0, -0.06, 0.02, 0.22);      // grip
  part(g, new THREE.BoxGeometry(0.008, 0.012, 0.01), darkMetal, 0, 0.05, -0.135);   // sight
  hands(g, 0.025);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, -0.16); g.add(muzzle);
  return { group: g, muzzle, rest: new THREE.Vector3(0.17, -0.17, -0.46) };
}

function buildRifle() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.05, 0.07, 0.42), metal, 0, 0, -0.1);              // receiver
  part(g, new THREE.BoxGeometry(0.055, 0.05, 0.22), tan, 0, -0.005, -0.32);         // handguard
  part(g, new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), darkMetal, 0, 0.005, -0.52, Math.PI / 2);
  part(g, new THREE.BoxGeometry(0.035, 0.14, 0.06), darkMetal, 0, -0.1, -0.08, -0.25); // magazine
  part(g, new THREE.BoxGeometry(0.04, 0.09, 0.04), tan, 0, -0.07, 0.05, 0.3);        // grip
  part(g, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10), darkMetal, 0, 0.06, -0.08, Math.PI / 2); // scope
  part(g, new THREE.BoxGeometry(0.02, 0.025, 0.04), darkMetal, 0, 0.045, -0.08);
  hands(g, 0.05, -0.3);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.005, -0.63); g.add(muzzle);
  return { group: g, muzzle, rest: new THREE.Vector3(0.15, -0.155, -0.48) };
}

function buildShotgun() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.018, 0.018, 0.6, 10), metal, 0, 0.015, -0.3, Math.PI / 2);   // barrel
  part(g, new THREE.CylinderGeometry(0.015, 0.015, 0.5, 10), darkMetal, 0, -0.022, -0.27, Math.PI / 2); // tube
  part(g, new THREE.BoxGeometry(0.05, 0.065, 0.2), metal, 0, 0, 0.02);                 // receiver
  const pump = part(g, new THREE.BoxGeometry(0.05, 0.045, 0.16), wood, 0, -0.022, -0.3);
  hands(g, 0.08, -0.3);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, -0.61); g.add(muzzle);
  return { group: g, muzzle, pump, rest: new THREE.Vector3(0.15, -0.16, -0.48) };
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.scene = game.weaponScene;
    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    const modelled = buildModelWeapons(game.assets?.models);
    const hemi = new THREE.HemisphereLight(0xffe8c8, 0x6a5030, modelled ? 1.1 : 1.6);
    const key = new THREE.DirectionalLight(0xffc488, modelled ? 2.2 : 1.6);
    key.position.set(-1, 1, 0.5);
    this.scene.add(hemi, key);

    // Downloaded models when all three guns loaded, otherwise the primitive set.
    this.models = modelled || [buildPistol(), buildRifle(), buildShotgun()];
    this.modelled = !!modelled;
    for (const m of this.models) {
      m.group.visible = false;
      this.holder.add(m.group);
    }

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softSpriteTexture(), color: new THREE.Color(4, 2.8, 1.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
    this.flash.visible = false;
    this.holder.add(this.flash);
    this.flashTime = 0;

    // Permanent light so the shader light count never changes.
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 8, 2);
    game.scene.add(this.muzzleLight);

    this.tmp = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.state = WEAPONS.map((w) => ({ mag: w.mag, reserve: w.reserve }));
    this.current = 0;
    this.previous = 1;
    this.cooldown = 0;
    this.reloading = 0;
    this.switching = 0;
    this.pendingSwitch = -1;
    this.bloom = 0;
    this.kick = 0;
    this.swayX = 0; this.swayY = 0;
    this.isFiring = false;
    this.triggerHeld = false;
    this.models.forEach((m, i) => { m.group.visible = i === 0; });
    this.game.hud.setWeapon(this);
  }

  get def() { return WEAPONS[this.current]; }
  get ammo() { return this.state[this.current]; }

  addAmmo() {
    let gave = false;
    WEAPONS.forEach((w, i) => {
      if (!Number.isFinite(w.maxReserve)) return;
      const s = this.state[i];
      const before = s.reserve;
      s.reserve = Math.min(w.maxReserve, s.reserve + (w.id === 'rifle' ? 60 : 12));
      if (s.reserve > before) gave = true;
    });
    this.game.hud.setWeapon(this);
    return gave;
  }

  needsAmmo() {
    return WEAPONS.some((w, i) => Number.isFinite(w.maxReserve) && this.state[i].reserve < w.maxReserve);
  }

  switchTo(i) {
    if (i === this.current && this.pendingSwitch < 0) return;
    if (i < 0 || i >= WEAPONS.length) return;
    this.pendingSwitch = i;
    this.switching = 0.32;
    this.reloading = 0;
    this.game.audio.weaponSwitch();
  }

  startReload() {
    const w = this.def, s = this.ammo;
    if (this.reloading > 0 || this.switching > 0) return;
    if (s.mag >= w.mag || s.reserve <= 0) return;
    this.reloading = w.reloadTime;
    this.game.audio.reload(w.id);
    this.game.hud.setReloading(true);
  }

  _finishReloadStep() {
    const w = this.def, s = this.ammo;
    if (w.shellReload) {
      s.mag++; s.reserve--;
      if (s.mag < w.mag && s.reserve > 0) {
        this.reloading = w.reloadTime;
        this.game.audio.reload(w.id);
      } else {
        this.reloading = 0;
        this.game.hud.setReloading(false);
      }
    } else {
      const need = w.mag - s.mag;
      const take = Math.min(need, s.reserve);
      s.mag += take;
      if (Number.isFinite(s.reserve)) s.reserve -= take;
      this.reloading = 0;
      this.game.hud.setReloading(false);
    }
    this.game.hud.setWeapon(this);
  }

  update(dt, active) {
    const input = this.game.input;
    const player = this.game.player;
    this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.flashTime -= dt;
    this.isFiring = false;

    if (active) {
      // switching input
      for (let i = 0; i < WEAPONS.length; i++) {
        if (input.wasPressed('Digit' + (i + 1))) this.switchTo(i);
      }
      if (input.wasPressed('KeyQ')) this.switchTo(this.previous);
      if (input.wheel !== 0) this.switchTo((this.current + (input.wheel > 0 ? 1 : -1) + WEAPONS.length) % WEAPONS.length);
      if (input.wasPressed('KeyR')) this.startReload();
    }

    if (this.switching > 0) {
      const before = this.switching;
      this.switching -= dt;
      if (before > 0.16 && this.switching <= 0.16 && this.pendingSwitch >= 0) {
        this.models[this.current].group.visible = false;
        this.previous = this.current;
        this.current = this.pendingSwitch;
        this.pendingSwitch = -1;
        this.models[this.current].group.visible = true;
        this.game.hud.setWeapon(this);
        this.game.hud.setReloading(false);
      }
    } else if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this._finishReloadStep();
    }

    if (active && player.alive) {
      const w = this.def;
      const wantFire = w.auto ? input.mouseDown : input.mouseClicked;
      // shotgun shells can be interrupted to shoot
      if (wantFire && this.reloading > 0 && w.shellReload && this.ammo.mag > 0) {
        this.reloading = 0;
        this.game.hud.setReloading(false);
      }
      if (wantFire && this.switching <= 0 && this.reloading <= 0 && this.cooldown <= 0) {
        if (this.ammo.mag > 0) this._fire();
        else {
          if (input.mouseClicked) this.game.audio.dryFire();
          this.startReload();
        }
      }
      if (input.mouseDown) this.isFiring = true;
    }

    this._animate(dt);
  }

  _fire() {
    const w = this.def, game = this.game, player = game.player;
    this.ammo.mag--;
    this.cooldown = w.fireDelay;
    game.stats.shots++;

    const cam = game.camera;
    const origin = cam.position.clone();
    const fwd = player.forward.clone();
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const moveFactor = Math.min(1, player.speed / 5.2);
    const spread = w.spread + this.bloom + w.moveSpread * moveFactor + (player.onGround ? 0 : 0.03);

    const muzzleWorld = this.models[this.current].muzzle.getWorldPosition(new THREE.Vector3());
    let anyHit = false;

    for (let p = 0; p < w.pellets; p++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      const worldHit = game.level.raycast(origin, dir, w.range);
      const maxD = worldHit ? worldHit.dist : w.range;
      const botHit = game.bots.raycast(origin, dir, maxD);
      let end;
      if (botHit) {
        let dmg = w.damage * (botHit.head ? w.headMult : 1);
        if (w.falloff) {
          const [f0, f1, minMul] = w.falloff;
          const t = Math.min(1, Math.max(0, (botHit.dist - f0) / (f1 - f0)));
          dmg *= 1 - t * (1 - minMul);
        }
        botHit.bot.takeDamage(dmg, botHit.point, dir, botHit.head);
        anyHit = true;
        end = botHit.point;
      } else if (worldHit) {
        game.effects.decal(worldHit.point, worldHit.normal);
        game.effects.emit(worldHit.point.clone().addScaledVector(worldHit.normal, 0.03), {
          count: 5, color: 0xffd9a0, speed: 2.2, dir: worldHit.normal, spread: 0.8, life: 0.35, size: 0.035, gravity: 6,
        });
        game.effects.emit(worldHit.point.clone().addScaledVector(worldHit.normal, 0.05), {
          count: 2, color: 0xb59b74, speed: 0.4, dir: worldHit.normal, spread: 0.5, life: 1.0, size: 0.14, drag: 1.5, intensity: 0.35,
        });
        end = worldHit.point;
      } else {
        end = origin.clone().addScaledVector(dir, w.range);
      }
      if (w.id !== 'shotgun' || p < 3) game.effects.tracer(muzzleWorld, end);
    }
    if (anyHit) game.stats.hits++;

    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloomPerShot);
    this.kick = Math.min(1.5, this.kick + (w.id === 'shotgun' ? 1.4 : w.id === 'rifle' ? 0.45 : 0.8));
    player.addRecoil(w.recoil);

    this.flashTime = 0.05;
    this.flash.position.copy(this.models[this.current].muzzle.position).applyMatrix4(this.models[this.current].group.matrix);
    this.flash.material.rotation = Math.random() * Math.PI;
    const fs = w.id === 'shotgun' ? 0.32 : 0.2;
    this.flash.scale.set(fs, fs, fs);
    this.muzzleLight.position.copy(origin).addScaledVector(fwd, 0.8);
    this.muzzleLight.intensity = w.id === 'shotgun' ? 14 : 8;

    game.audio.gunshot(w.id);
    game.hud.setWeapon(this);
    game.hud.pulseCrosshair();
    if (this.ammo.mag === 0 && this.ammo.reserve > 0) {
      setTimeout(() => { if (this.ammo.mag === 0) this.startReload(); }, 180);
    }
  }

  // view-model motion: sway, bob, recoil, reload and switch dips
  _animate(dt) {
    const game = this.game, player = game.player, input = game.input;
    const cam = game.camera;
    this.holder.position.copy(cam.position);
    this.holder.quaternion.copy(cam.quaternion);

    this.swayX += (-input.mouseDX * 0.00035 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (input.mouseDY * 0.00035 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY));
    this.kick *= Math.exp(-dt * 12);

    const m = this.models[this.current];
    const bob = player.bobAmount;
    const ph = player.bobPhase;
    let dip = 0, tilt = 0;
    if (this.switching > 0) {
      const t = this.switching > 0.16 ? (0.32 - this.switching) / 0.16 : this.switching / 0.16;
      dip = t * 0.25;
    }
    if (this.reloading > 0) {
      const w = this.def;
      const total = w.reloadTime;
      const t = 1 - this.reloading / total;
      const curve = w.shellReload ? Math.sin(t * Math.PI) * 0.4 + 0.6 : Math.sin(Math.min(1, t) * Math.PI);
      dip += curve * 0.1;
      tilt = curve * 0.6;
    }
    const sprint = player.sprinting && player.speed > 6 ? 1 : 0;
    this.sprintBlend = (this.sprintBlend || 0) + (sprint - (this.sprintBlend || 0)) * Math.min(1, dt * 8);

    m.group.position.set(
      m.rest.x + this.swayX + Math.cos(ph) * 0.012 * bob + this.sprintBlend * 0.04,
      m.rest.y + this.swayY + Math.abs(Math.sin(ph)) * -0.012 * bob - dip - this.kick * 0.012 - this.sprintBlend * 0.03,
      m.rest.z + this.kick * 0.05,
    );
    m.group.rotation.set(
      this.kick * 0.09 - tilt * 0.3 - this.sprintBlend * 0.25,
      this.swayX * 1.5 + this.sprintBlend * 0.5,
      -tilt * 0.8 + this.swayX * 2,
    );
    const pumpT = this.def.id === 'shotgun' && this.cooldown > 0 ? Math.sin(Math.max(0, 1 - this.cooldown / 0.8) * Math.PI) : 0;
    if (m.pump) m.pump.position.z = -0.3 + pumpT * 0.08;
    if (m.arms) this._animateArms(m, pumpT);
    m.group.updateMatrix();

    this.flash.visible = this.flashTime > 0;
    this.muzzleLight.intensity *= Math.exp(-dt * 40);
  }

  // Hand motions for the modelled arms: pump the shotgun, reach for magazines and shells.
  _animateArms(m, pumpT) {
    const left = m.arms.left, right = m.arms.right;
    if (!left) return;
    left.userData.base ||= left.position.clone();
    right.userData.base ||= right.position.clone();
    const lb = left.userData.base;
    let dx = 0, dy = 0, dz = 0;
    if (this.reloading > 0 && this.switching <= 0) {
      const w = this.def;
      const t = 1 - this.reloading / w.reloadTime;
      if (w.shellReload) {
        // each shell: hand drops under the receiver and pushes forward
        const k = Math.sin(t * Math.PI);
        dx = 0.02 * k; dy = -0.05 * k; dz = 0.18 * k;
      } else if (w.id === 'rifle') {
        // hand drops to the magazine and back
        const k = Math.sin(Math.min(1, t * 1.15) * Math.PI);
        dx = 0.03 * k; dy = -0.12 * k; dz = 0.22 * k;
      } else {
        // pistol: support hand comes off to fetch a magazine
        const k = Math.sin(t * Math.PI);
        dx = -0.04 * k; dy = -0.16 * k; dz = 0.05 * k;
      }
    }
    dz += pumpT * 0.06;
    left.position.set(lb.x + dx, lb.y + dy, lb.z + dz);
  }
}
