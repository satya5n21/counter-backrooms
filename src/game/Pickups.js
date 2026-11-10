import * as THREE from 'three';
import { softSpriteTexture } from '../world/Textures.js';

const sprite = softSpriteTexture();
const healthGeo = new THREE.OctahedronGeometry(0.17, 0);
const ammoGeo = new THREE.BoxGeometry(0.26, 0.16, 0.18);

// Floating health (mint) and ammo (amber) pickups.
export class Pickups {
  constructor(game) {
    this.game = game;
    this.items = [];
  }

  spawn(kind, pos, lifetime = Infinity) {
    // don't stack two pickups on the same spot
    if (this.items.some((p) => p.pos.distanceTo(pos) < 0.6)) return;
    const color = kind === 'health' ? new THREE.Color(0x9ff2c8) : new THREE.Color(0xffc46b);
    const mesh = new THREE.Mesh(
      kind === 'health' ? healthGeo : ammoGeo,
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 }),
    );
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sprite, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.1, 1.1, 1);
    const group = new THREE.Group();
    group.add(mesh, glow);
    group.position.copy(pos).setY(0.8);
    this.game.scene.add(group);
    this.items.push({ kind, pos: pos.clone().setY(0), group, mesh, life: lifetime, t: Math.random() * 10 });
  }

  clear() {
    for (const p of this.items) this._remove(p);
    this.items = [];
  }

  _remove(p) {
    this.game.scene.remove(p.group);
    p.mesh.material.dispose();
    p.group.children[1].material.dispose();
  }

  update(dt) {
    const player = this.game.player;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.t += dt;
      p.life -= dt;
      p.group.position.y = 0.8 + Math.sin(p.t * 2) * 0.08;
      p.mesh.rotation.y += dt * 1.4;
      p.mesh.rotation.x = Math.sin(p.t) * 0.3;
      const fading = Number.isFinite(p.life) && p.life < 3;
      p.group.visible = !fading || Math.sin(p.t * 18) > -0.3;

      let taken = false;
      if (player.alive && Math.hypot(player.pos.x - p.pos.x, player.pos.z - p.pos.z) < 1.1) {
        if (p.kind === 'health' && player.health < 100) {
          player.heal(35);
          taken = true;
        } else if (p.kind === 'ammo' && this.game.weapons.needsAmmo()) {
          this.game.weapons.addAmmo();
          taken = true;
        }
        if (taken) {
          this.game.audio.pickup(p.kind);
          this.game.hud.toast(p.kind === 'health' ? '+35 vitality' : 'Ammo restocked');
          this.game.effects.emit(p.group.position, { count: 24, color: p.kind === 'health' ? 0x9ff2c8 : 0xffc46b, speed: 1.6, life: 0.7, size: 0.07, up: 1 });
        }
      }
      if (taken || p.life <= 0) {
        this._remove(p);
        this.items.splice(i, 1);
      }
    }
  }
}
