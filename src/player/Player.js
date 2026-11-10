import * as THREE from 'three';
import { EYE_H, PLAYER_RADIUS, PLAYER_MAX_HEALTH } from '../config.js';

const WALK = 5.2;
const SPRINT = 8.0;
const JUMP = 5.4;
const GRAVITY = 18;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.level = game.level;
    this.input = game.input;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.punch = 0;          // recovering recoil kick
    this.health = PLAYER_MAX_HEALTH;
    this.alive = true;
    this.onGround = true;
    this.sprinting = false;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.stepDist = 0;
    this.lastDamageTime = -10;
    this.fovKick = 0;
    this.shake = 0;
    this.forward = new THREE.Vector3();
  }

  reset() {
    this.pos.copy(this.level.playerStart);
    this.vel.set(0, 0, 0);
    this.yaw = -Math.PI / 2; // face east, towards the far rooms
    this.pitch = 0;
    this.punch = 0;
    this.health = PLAYER_MAX_HEALTH;
    this.alive = true;
    this.onGround = true;
    this.shake = 0;
  }

  get eye() {
    return new THREE.Vector3(this.pos.x, this.pos.y + EYE_H, this.pos.z);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  addRecoil(amount) {
    this.pitch += amount * 0.55;
    this.punch += amount * 0.45;
    this.yaw += (Math.random() - 0.5) * amount * 0.35;
  }

  damage(amount, fromPos) {
    if (!this.alive) return;
    this.health = Math.max(0, this.health - amount);
    this.lastDamageTime = this.game.time;
    this.shake = Math.min(1, this.shake + amount / 25);
    this.game.hud.flashDamage(amount, fromPos, this);
    this.game.audio.playerHurt();
    if (this.health <= 0) {
      this.alive = false;
      this.game.onPlayerDeath();
    }
  }

  heal(amount) {
    this.health = Math.min(PLAYER_MAX_HEALTH, this.health + amount);
  }

  update(dt) {
    const input = this.input;
    const s = this.game.settings;

    // look
    const sens = 0.0021 * s.sensitivity;
    this.yaw -= input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));
    this.punch *= Math.exp(-dt * 10);

    // move
    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const str = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fwd + cos * str;
    let wz = -cos * fwd - sin * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }

    const firing = this.game.weapons.isFiring;
    this.sprinting = (input.down('ShiftLeft') || input.down('ShiftRight')) && fwd > 0 && !firing;
    const target = this.sprinting ? SPRINT : WALK;
    const k = this.onGround ? 12 : 2.5;
    const blend = 1 - Math.exp(-k * dt);
    this.vel.x += (wx * target - this.vel.x) * blend;
    this.vel.z += (wz * target - this.vel.z) * blend;

    if (this.onGround && input.wasPressed('Space')) {
      this.vel.y = JUMP;
      this.onGround = false;
      this.game.audio.footstep(0.6);
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.level.resolveCircle(this.pos, PLAYER_RADIUS, this.pos.y, 1.8);
    this.game.bots.pushOut(this.pos, PLAYER_RADIUS);

    // vertical
    this.vel.y -= GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    const ground = this.level.groundHeight(this.pos.x, this.pos.z, PLAYER_RADIUS, this.pos.y);
    if (this.pos.y <= ground) {
      if (!this.onGround && this.vel.y < -4) {
        this.landDip = Math.min(0.12, -this.vel.y * 0.012);
        this.game.audio.footstep(0.9);
      }
      this.pos.y = ground;
      this.vel.y = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }

    // head bob + footsteps
    const sp = this.speed;
    const moving = this.onGround && sp > 0.5;
    this.bobAmount += ((moving ? Math.min(1, sp / WALK) : 0) - this.bobAmount) * Math.min(1, dt * 8);
    if (moving) {
      this.bobPhase += dt * sp * 1.45;
      this.stepDist += sp * dt;
      const stride = this.sprinting ? 2.5 : 2.1;
      if (this.stepDist > stride) { this.stepDist = 0; this.game.audio.footstep(this.sprinting ? 0.8 : 0.55); }
    }
    this.landDip *= Math.exp(-dt * 9);
    this.shake *= Math.exp(-dt * 6);

    this.fovKick += ((this.sprinting && sp > 6 ? 6 : 0) - this.fovKick) * Math.min(1, dt * 6);
    const fov = s.fov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    this.applyCamera();
  }

  applyCamera() {
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.025 * this.bobAmount;
    const sh = this.shake * 0.02;
    this.camera.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX + (Math.random() - 0.5) * sh,
      this.pos.y + EYE_H + bobY - this.landDip + (Math.random() - 0.5) * sh,
      this.pos.z - Math.sin(this.yaw) * bobX,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch + this.punch, this.yaw, Math.sin(this.bobPhase) * 0.004 * this.bobAmount);
    this.camera.getWorldDirection(this.forward);
  }
}
