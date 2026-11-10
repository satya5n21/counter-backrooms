import * as THREE from 'three';
import { softSpriteTexture, decalTexture } from '../world/Textures.js';

const MAX_PARTICLES = 1600;

// One-draw-call particle system plus pooled decals and tracers.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this._particles();
    this._decals();
    this._tracers();
  }

  _particles() {
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    this.pAlpha = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.pMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: softSpriteTexture() }, uScale: { value: 800 } },
      vertexShader: /* glsl */`
        attribute vec3 color;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vCol;
        varying float vA;
        void main() {
          vCol = color; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying vec3 vCol;
        varying float vA;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).r * vA;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, this.pMat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ life: 0, max: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), col: new THREE.Color(), size: 0.1, grav: 0, drag: 0 });
    }
    this.pCursor = 0;
  }

  setViewportHeight(h) { this.pMat.uniforms.uScale.value = h; }

  emit(pos, { count = 10, color = 0xffd08a, speed = 2, spread = 1, life = 0.6, size = 0.06, gravity = 0, drag = 2, dir = null, up = 0, intensity = 1.5 } = {}) {
    const c = new THREE.Color(color).multiplyScalar(intensity);
    for (let i = 0; i < count; i++) {
      const p = this.parts[this.pCursor];
      this.pCursor = (this.pCursor + 1) % MAX_PARTICLES;
      p.life = p.max = life * (0.6 + Math.random() * 0.8);
      p.pos.copy(pos);
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      if (dir) v.multiplyScalar(spread).add(dir).normalize();
      p.vel.copy(v).multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.vel.y += up;
      p.col.copy(c);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.grav = gravity;
      p.drag = drag;
    }
  }

  _decals() {
    this.decalMat = new THREE.MeshBasicMaterial({
      map: decalTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const geo = new THREE.PlaneGeometry(0.11, 0.11);
    this.decals = [];
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(geo, this.decalMat);
      m.visible = false;
      this.scene.add(m);
      this.decals.push(m);
    }
    this.dCursor = 0;
  }

  decal(point, normal) {
    const m = this.decals[this.dCursor];
    this.dCursor = (this.dCursor + 1) % this.decals.length;
    m.position.copy(point).addScaledVector(normal, 0.006);
    m.lookAt(point.clone().add(normal));
    m.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, s);
    m.visible = true;
  }

  _tracers() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0, -0.5);
    this.tracers = [];
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(3, 2.3, 1.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    this.tCursor = 0;
  }

  tracer(from, to) {
    const t = this.tracers[this.tCursor];
    this.tCursor = (this.tCursor + 1) % this.tracers.length;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.012, 0.012, len);
    t.mesh.visible = true;
    t.life = 0.07;
  }

  clear() {
    for (const p of this.parts) p.life = 0;
    for (const d of this.decals) d.visible = false;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
  }

  update(dt) {
    let n = 0;
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02) { p.pos.y = 0.02; p.vel.y *= -0.3; }
      const a = p.life / p.max;
      this.pPos[n * 3] = p.pos.x; this.pPos[n * 3 + 1] = p.pos.y; this.pPos[n * 3 + 2] = p.pos.z;
      this.pCol[n * 3] = p.col.r; this.pCol[n * 3 + 1] = p.col.g; this.pCol[n * 3 + 2] = p.col.b;
      this.pSize[n] = p.size * (0.5 + a * 0.5);
      this.pAlpha[n] = a;
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.8;
      if (t.life <= 0) t.mesh.visible = false;
    }
  }
}
