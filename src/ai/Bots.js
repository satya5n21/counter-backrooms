import * as THREE from 'three';
import { BOT_TYPES, CELL, EYE_H } from '../config.js';
import { softSpriteTexture } from '../world/Textures.js';

const BOT_RADIUS = 0.38;
const ATTACK_RANGE = 22;
const sprite = softSpriteTexture();

// Robe-like silhouette, revolved.
const PROFILE = [
  [0.02, 0.0], [0.12, 0.08], [0.24, 0.35], [0.3, 0.7], [0.27, 1.02], [0.31, 1.22],
  [0.25, 1.34], [0.1, 1.41], [0.0, 1.42],
].map(([x, y]) => new THREE.Vector2(x, y));
const bodyGeo = new THREE.LatheGeometry(PROFILE, 20);
const headGeo = new THREE.SphereGeometry(0.17, 18, 14);
const armGeo = new THREE.CapsuleGeometry(0.055, 0.45, 4, 8);
armGeo.translate(0, -0.27, 0);

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function rand(a, b) { return a + Math.random() * (b - a); }

// ray vs sphere, returns entry distance or -1
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -1;
}

class Bot {
  constructor(mgr, typeKey, params, pos) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.typeKey = typeKey;
    this.type = BOT_TYPES[typeKey];
    const t = this.type;
    this.scale = t.scale;
    this.maxHealth = params.health * t.health;
    this.health = this.maxHealth;
    this.damage = params.damage * t.damage;
    this.params = params;
    this.speed = t.speed;
    this.radius = BOT_RADIUS * t.scale;

    this.pos = pos.clone();
    this.vel = new THREE.Vector3();
    this.aim = new THREE.Vector3(1, 0, 0);
    this.facing = Math.random() * Math.PI * 2;
    this.state = 'spawning';
    this.stateTime = 0;
    this.seen = 0;
    this.hasLOS = false;
    this.losTimer = Math.random() * 0.2;
    this.fireCooldown = rand(...params.fireInterval) * t.fireMul + 0.6;
    this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    this.strafeTimer = rand(0.8, 2);
    this.preferred = rand(7, 13);
    this.flash = 0;
    this.phase = Math.random() * 10;
    this.stuckTimer = 0;

    const color = new THREE.Color(t.color);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.5, roughness: 0.5, transparent: true, opacity: 0.0,
    });
    this.headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: color.clone().lerp(new THREE.Color(0xffffff), 0.5), emissiveIntensity: 1.5,
      roughness: 0.3, transparent: true, opacity: 0.0,
    });
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.head = new THREE.Mesh(headGeo, this.headMat);
    this.head.position.y = 1.6;
    this.armL = new THREE.Mesh(armGeo, this.bodyMat);
    this.armR = new THREE.Mesh(armGeo, this.bodyMat);
    this.armL.position.set(-0.33, 1.25, 0);
    this.armR.position.set(0.33, 1.25, 0);
    this.inner.add(this.body, this.head, this.armL, this.armR);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sprite, color: color.clone().multiplyScalar(0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.halo.scale.set(2.6, 3.2, 1);
    this.halo.position.y = 1.0;
    this.inner.add(this.halo);
    this.inner.scale.setScalar(this.scale);
    this.group.position.copy(this.pos);
    this.game.scene.add(this.group);

    this.game.effects.emit(this.pos.clone().setY(1), { count: 30, color: t.color, speed: 1.5, life: 1.0, size: 0.08, up: 1 });
  }

  get alive() { return this.state !== 'dying' && this.state !== 'dead'; }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.6 * this.scale, this.pos.z);
  }

  // hit spheres in world space: [center, radius, isHead]
  hitSpheres() {
    const s = this.scale, p = this.pos;
    return [
      [new THREE.Vector3(p.x, p.y + 1.6 * s, p.z), 0.2 * s, true],
      [new THREE.Vector3(p.x, p.y + 1.15 * s, p.z), 0.32 * s, false],
      [new THREE.Vector3(p.x, p.y + 0.8 * s, p.z), 0.32 * s, false],
      [new THREE.Vector3(p.x, p.y + 0.42 * s, p.z), 0.27 * s, false],
    ];
  }

  takeDamage(amount, point, dir, head) {
    if (!this.alive) return;
    this.health -= amount;
    this.flash = 1;
    this.seen = Math.max(this.seen, this.params.reaction * 0.6); // getting shot makes them notice you
    this.vel.addScaledVector(dir, 1.2);
    this.game.effects.emit(point, {
      count: head ? 16 : 9, color: this.type.color, speed: 2.5, dir: dir.clone().negate(), spread: 1.2, life: 0.5, size: 0.06, gravity: 2,
    });
    this.game.hud.hitMarker(head, this.health <= 0);
    this.game.audio.botHit(head);
    if (this.health <= 0) this.die();
  }

  die() {
    this.state = 'dying';
    this.stateTime = 0;
    this.game.onBotKilled(this);
    this.game.audio.botDeath(this.pos);
    const c = this.pos.clone().setY(this.pos.y + 1.0 * this.scale);
    this.game.effects.emit(c, { count: 70, color: this.type.color, speed: 2.2, life: 1.6, size: 0.08, up: 1.2, drag: 1.5 });
    this.game.effects.emit(c, { count: 20, color: 0xffffff, speed: 0.8, life: 2.2, size: 0.05, up: 1.6, drag: 0.8 });
  }

  update(dt) {
    this.stateTime += dt;
    this.phase += dt;
    const game = this.game;
    const player = game.player;

    if (this.state === 'dying') {
      const t = this.stateTime / 0.9;
      this.inner.scale.set(this.scale * (1 + t * 0.3), this.scale * Math.max(0.01, 1 - t), this.scale * (1 + t * 0.3));
      this._setOpacity(Math.max(0, 1 - t));
      if (t >= 1) this.state = 'dead';
      return;
    }

    if (this.state === 'spawning') {
      const t = Math.min(1, this.stateTime / 1.0);
      this._setOpacity(t);
      if (t >= 1) this.state = 'active';
    }

    const eye = this.eyePos();
    const target = player.eye;
    target.y -= 0.35; // aim for the chest

    // perception (throttled ray casts)
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.15;
      this.hasLOS = player.alive && game.level.lineOfSight(eye, player.eye);
    }
    const toPlayer = _v2.subVectors(player.pos, this.pos); toPlayer.y = 0;
    const dist = toPlayer.length();
    if (this.hasLOS) this.seen += dt; else this.seen = Math.max(0, this.seen - dt * 0.5);

    // aim tracking with limited turn speed + optional lead
    const p = this.params;
    const flight = dist / p.boltSpeed;
    const aimPoint = target.clone().addScaledVector(player.vel, p.lead * flight);
    const desired = aimPoint.sub(eye).normalize();
    const angle = this.aim.angleTo(desired);
    if (angle > 1e-4) {
      const step = Math.min(1, (p.turnSpeed * dt) / angle);
      this.aim.lerp(desired, step).normalize();
    }

    // movement
    const move = new THREE.Vector3();
    const active = this.state === 'active';
    const level = game.level;
    if (this.hasLOS && dist < ATTACK_RANGE) {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = rand(0.8, 2.4); this.strafeDir *= -1; if (Math.random() < 0.3) this.strafeDir = 0; }
      const n = toPlayer.clone().normalize();
      const side = new THREE.Vector3(-n.z, 0, n.x).multiplyScalar(this.strafeDir * 0.6);
      let radial = 0;
      if (dist > this.preferred + 2) radial = 1;
      else if (dist < this.preferred - 3) radial = -0.7;
      move.copy(side).addScaledVector(n, radial);
    } else {
      // follow the shared flow field
      const cx = level.cellOf(this.pos.x), cz = level.cellOf(this.pos.z);
      let cur = [cx, cz];
      let goal = null;
      if (!Number.isFinite(level.flowAt(cx, cz))) {
        // standing in a blocked cell (pushed): head to the best neighbour
        cur = level.flowStep(cx, cz);
      }
      const chain = [cur];
      for (let i = 0; i < 3; i++) chain.push(level.flowStep(...chain[chain.length - 1]));
      for (let i = chain.length - 1; i >= 1; i--) {
        const c = level.cellCenter(chain[i][0], chain[i][1]);
        if (level.clearPath(this.pos.x, this.pos.z, c.x, c.z, this.radius * 0.9)) { goal = c; break; }
      }
      if (!goal) goal = level.cellCenter(chain[1][0], chain[1][1]);
      if (chain[1][0] === cx && chain[1][1] === cz) goal = player.pos.clone();
      move.set(goal.x - this.pos.x, 0, goal.z - this.pos.z);
    }
    if (move.lengthSq() > 1) move.normalize();
    const speed = active ? this.speed : this.speed * 0.3;
    const k = 1 - Math.exp(-6 * dt);
    this.vel.x += (move.x * speed - this.vel.x) * k;
    this.vel.z += (move.z * speed - this.vel.z) * k;

    const before = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    level.resolveCircle(this.pos, this.radius, 0, 1.8);
    const moved = before.distanceTo(this.pos);
    if (move.lengthSq() > 0.1 && moved < speed * dt * 0.2) {
      this.stuckTimer += dt;
      if (this.stuckTimer > 0.6) { this.strafeDir *= -1; this.stuckTimer = 0; this.vel.set(rand(-2, 2), 0, rand(-2, 2)); }
    } else this.stuckTimer = 0;

    // facing follows aim when engaging, otherwise movement
    const faceDir = this.hasLOS ? this.aim : this.vel;
    if (Math.hypot(faceDir.x, faceDir.z) > 0.05) {
      const targetYaw = Math.atan2(faceDir.x, faceDir.z);
      let d = targetYaw - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 8);
    }

    // firing
    this.fireCooldown -= dt;
    if (active && this.hasLOS && player.alive && dist < ATTACK_RANGE && this.seen >= p.reaction && this.fireCooldown <= 0) {
      if (this.aim.angleTo(desired) < 0.3) {
        this._shoot();
        this.fireCooldown = rand(...p.fireInterval) * this.type.fireMul;
      }
    }

    // visuals
    const hover = 0.12 + Math.sin(this.phase * 1.8) * 0.05;
    this.group.position.set(this.pos.x, this.pos.y + hover, this.pos.z);
    this.group.rotation.y = this.facing;
    this.inner.rotation.z = Math.sin(this.phase * 0.9) * 0.03;
    const engaged = this.hasLOS && this.seen > p.reaction * 0.4 ? 1 : 0;
    // raise the right arm towards the target while engaging (-PI/2 points it forward)
    const armTarget = engaged ? -Math.PI / 2 - Math.asin(Math.max(-1, Math.min(1, this.aim.y))) : -0.15;
    this.armR.rotation.x += (armTarget - this.armR.rotation.x) * Math.min(1, dt * 6);
    this.armL.rotation.x = -0.1 + Math.sin(this.phase * 1.2) * 0.08;
    this.armL.rotation.z = -0.12;
    this.armR.rotation.z = 0.12 * (1 - engaged);

    this.flash = Math.max(0, this.flash - dt * 6);
    this.bodyMat.emissiveIntensity = 0.5 + this.flash * 2.5 + Math.sin(this.phase * 2.2) * 0.08;
    this.headMat.emissiveIntensity = 1.5 + this.flash * 3;
  }

  _setOpacity(o) {
    this.bodyMat.opacity = o * 0.92;
    this.headMat.opacity = o;
    this.halo.material.opacity = o * 0.2;
  }

  _shoot() {
    const origin = new THREE.Vector3(0.33 * this.scale, 1.25 * this.scale, 0.5 * this.scale);
    origin.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.facing).add(this.pos);
    origin.y += 0.12;
    const n = this.type.bolts;
    for (let i = 0; i < n; i++) {
      const dir = this.aim.clone();
      const fan = n > 1 ? (i - (n - 1) / 2) * 0.09 : 0;
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), fan);
      const s = this.params.aimSpread;
      dir.x += (Math.random() - 0.5) * 2 * s;
      dir.y += (Math.random() - 0.5) * 2 * s * 0.6;
      dir.z += (Math.random() - 0.5) * 2 * s;
      dir.normalize();
      this.mgr.bolts.fire(origin, dir, this.params.boltSpeed, this.damage, this.type.color, this);
    }
    this.game.audio.botShoot(origin);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.bodyMat.dispose();
    this.headMat.dispose();
    this.halo.material.dispose();
  }
}

// Slow, glowing, dodgeable light bolts.
class Bolts {
  constructor(game) {
    this.game = game;
    this.pool = [];
    const geo = new THREE.SphereGeometry(0.075, 10, 8);
    for (let i = 0; i < 80; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(geo, mat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sprite, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
      }));
      glow.scale.set(0.7, 0.7, 1);
      mesh.add(glow);
      mesh.visible = false;
      game.scene.add(mesh);
      this.pool.push({ mesh, glow, active: false, vel: new THREE.Vector3(), life: 0, damage: 0, prev: new THREE.Vector3(), trail: 0 });
    }
  }

  fire(pos, dir, speed, damage, color, owner) {
    const b = this.pool.find((x) => !x.active);
    if (!b) return;
    b.active = true;
    b.mesh.visible = true;
    b.mesh.position.copy(pos);
    b.vel.copy(dir).multiplyScalar(speed);
    b.life = 4;
    b.damage = damage;
    b.color = color;
    b.trail = 0;
    const c = new THREE.Color(color);
    b.mesh.material.color.copy(c).multiplyScalar(3.2);
    b.glow.material.color.copy(c);
    b.mesh.scale.set(1, 1, 2.2);
    b.mesh.lookAt(pos.clone().add(dir));
  }

  clear() {
    for (const b of this.pool) { b.active = false; b.mesh.visible = false; }
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    const pFeet = player.pos;
    for (const b of this.pool) {
      if (!b.active) continue;
      b.life -= dt;
      b.prev.copy(b.mesh.position);
      const step = b.vel.length() * dt;
      const dir = b.vel.clone().normalize();
      const hit = game.level.raycast(b.prev, dir, step);
      b.mesh.position.addScaledVector(b.vel, dt);

      // player capsule (segment from knees to eyes) vs bolt segment, approximated by sampling
      if (player.alive) {
        let hitPlayer = false;
        for (let s = 0; s <= 4; s++) {
          const q = b.prev.clone().lerp(b.mesh.position, s / 4);
          const cy = Math.max(pFeet.y + 0.3, Math.min(pFeet.y + EYE_H, q.y));
          const dx = q.x - pFeet.x, dy = q.y - cy, dz = q.z - pFeet.z;
          if (dx * dx + dy * dy + dz * dz < 0.42 * 0.42) { hitPlayer = true; break; }
        }
        if (hitPlayer && (!hit || hit.dist > 0.1)) {
          player.damage(b.damage, b.prev.clone());
          game.effects.emit(b.mesh.position, { count: 14, color: b.color, speed: 2, life: 0.4, size: 0.07 });
          b.active = false; b.mesh.visible = false;
          continue;
        }
      }
      if (hit) {
        game.effects.emit(hit.point.clone().addScaledVector(hit.normal, 0.05), {
          count: 14, color: b.color, speed: 2.4, dir: hit.normal, spread: 1, life: 0.55, size: 0.07, gravity: 1,
        });
        game.audio.boltImpact(hit.point);
        b.active = false; b.mesh.visible = false;
        continue;
      }
      b.trail -= dt;
      if (b.trail <= 0) {
        b.trail = 0.025;
        game.effects.emit(b.mesh.position, { count: 1, color: b.color, speed: 0.15, life: 0.35, size: 0.06, intensity: 0.9 });
      }
      if (b.life <= 0) { b.active = false; b.mesh.visible = false; }
    }
  }
}

export class BotManager {
  constructor(game) {
    this.game = game;
    this.bots = [];
    this.bolts = new Bolts(game);
    this.flowCell = [-1, -1];
    this.flowTimer = 0;
  }

  get aliveCount() { return this.bots.filter((b) => b.alive).length; }

  spawn(typeKey, pos, params) {
    const bot = new Bot(this, typeKey, params, pos);
    this.bots.push(bot);
    return bot;
  }

  clear() {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.bolts.clear();
    this.flowCell = [-1, -1];
  }

  raycast(o, d, maxDist) {
    let best = null;
    for (const bot of this.bots) {
      if (!bot.alive) continue;
      // cheap reject
      const toB = _v.set(bot.pos.x - o.x, 0, bot.pos.z - o.z);
      if (toB.length() - 1 > maxDist) continue;
      for (const [c, r, head] of bot.hitSpheres()) {
        const t = raySphere(o, d, c, r);
        if (t >= 0 && t < maxDist && (!best || t < best.dist)) {
          best = { bot, dist: t, head, point: o.clone().addScaledVector(d, t) };
        }
      }
    }
    return best;
  }

  // keep the player from walking through bots
  pushOut(pos, r) {
    for (const b of this.bots) {
      if (!b.alive) continue;
      const dx = pos.x - b.pos.x, dz = pos.z - b.pos.z;
      const min = r + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d) * 0.5;
        pos.z += (dz / d) * (min - d) * 0.5;
      }
    }
  }

  update(dt) {
    const game = this.game;
    const level = game.level;
    const pc = [level.cellOf(game.player.pos.x), level.cellOf(game.player.pos.z)];
    this.flowTimer -= dt;
    if ((pc[0] !== this.flowCell[0] || pc[1] !== this.flowCell[1]) && this.flowTimer <= 0) {
      level.computeFlow(pc[0], pc[1]);
      this.flowCell = pc;
      this.flowTimer = 0.2;
    }

    for (const b of this.bots) b.update(dt);

    // bot-bot separation
    const alive = this.bots.filter((b) => b.alive);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius + 0.1;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }

    // remove finished corpses
    for (let i = this.bots.length - 1; i >= 0; i--) {
      if (this.bots[i].state === 'dead') {
        this.bots[i].dispose();
        this.bots.splice(i, 1);
      }
    }

    this.bolts.update(dt);
  }
}

export { CELL };
