import * as THREE from 'three';
import { SUN_DIR, WALL_H, CELL } from '../config.js';
import { softSpriteTexture } from './Textures.js';

// Sunset sky dome, soft volumetric-looking light shafts through the windows,
// and floating dust motes.
export class Atmosphere {
  // hdri: { texture, sun, horizon } from loadAssets(), or null for the painted sky.
  constructor(scene, level, hdri = null) {
    this.scene = scene;
    this.level = level;
    this.time = 0;
    this.skyRotation = 0;
    if (hdri) this._hdriSky(hdri); else this._sky();
    this._shafts();
    this._dust();
  }

  // Rotation (about Y) that turns the photo's sun towards the game's SUN_DIR.
  // Sampling uses dirHDR = rotateY(dirWorld) with azimuth(dirHDR) = azimuth(dirWorld) + rot.
  static sunAlignment(hdriSun) {
    return Math.atan2(hdriSun.z, hdriSun.x) - Math.atan2(SUN_DIR.z, SUN_DIR.x);
  }

  _hdriSky(hdri) {
    const rot = this.skyRotation = Atmosphere.sunAlignment(hdri.sun);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSky: { value: hdri.texture },
        uRot: { value: new THREE.Vector2(Math.cos(rot), Math.sin(rot)) },
        uExposure: { value: 0.62 / Math.max(hdri.horizon, 1e-3) },
        sunDir: { value: SUN_DIR.clone() },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        #include <common>
        uniform sampler2D uSky;
        uniform vec2 uRot;
        uniform float uExposure;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 h = vec3(uRot.x * d.x - uRot.y * d.z, d.y, uRot.y * d.x + uRot.x * d.z);
          h.x += 1e-5; // atan(0, 0) at the poles is undefined on some GPUs
          vec3 col = texture2D(uSky, equirectUv(normalize(h))).rgb * uExposure;
          // golden-hour grade: strong amber near the horizon, gentler higher up
          vec3 tint = mix(vec3(1.4, 0.9, 0.55), vec3(1.08, 0.92, 0.86), smoothstep(0.04, 0.55, d.y));
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = max(mix(vec3(l), col, 1.15) * tint, 0.0);
          // the photo has no ground: fade into warm haze below the horizon
          vec3 haze = vec3(0.78, 0.52, 0.33);
          col = mix(col, haze, smoothstep(0.0, -0.12, d.y));
          // a soft glow around the game's sun so the shafts and the sky agree
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.65, 0.35) * pow(s, 8.0) * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24), mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _sky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sunDir: { value: SUN_DIR.clone() } },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 horizon = vec3(1.0, 0.6, 0.3);
          vec3 mid = vec3(0.95, 0.55, 0.45);
          vec3 zenith = vec3(0.34, 0.4, 0.66);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          col = mix(col, zenith, smoothstep(0.15, 0.7, h));
          col = mix(col, vec3(0.75, 0.5, 0.32), smoothstep(0.0, -0.25, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += vec3(1.0, 0.65, 0.35) * pow(s, 6.0) * 0.7;
          col += vec3(1.0, 0.85, 0.6) * pow(s, 600.0) * 8.0;
          gl_FragColor = vec4(col * 1.25, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  _shafts() {
    // Three nested copies per window: a crude but cheap way to get soft edges.
    const L = SUN_DIR.clone().negate();
    const length = 10;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { uStrength: { value: 0.05 }, uTime: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aT;
        varying float vT;
        varying float vDist;
        void main() {
          vT = aT;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uStrength;
        uniform float uTime;
        varying float vT;
        varying float vDist;
        void main() {
          // vT can land a hair outside 0..1 after interpolation; pow() of a negative is NaN
          float t = clamp(vT, 0.0, 1.0);
          float fade = pow(1.0 - t, 1.6) * smoothstep(0.0, 0.08, t);
          float near = smoothstep(0.4, 2.5, vDist);
          float shimmer = 0.85 + 0.15 * sin(uTime * 0.6 + vT * 6.0);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * uStrength * fade * near * shimmer, 1.0);
        }`,
    });
    this.shaftMat = mat;

    const positions = [];
    const ts = [];
    const pushTri = (a, b, c, ta, tb, tc) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      ts.push(ta, tb, tc);
    };
    for (const win of this.level.windows) {
      const center = new THREE.Vector3();
      win.corners.forEach((c) => center.add(c));
      center.multiplyScalar(0.25);
      for (const s of [1.0, 0.82, 0.62]) {
        const near = win.corners.map((c) => c.clone().sub(center).multiplyScalar(s).add(center));
        const far = near.map((c) => c.clone().addScaledVector(L, length));
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          pushTri(near[i], near[j], far[j], 0, 0, 1);
          pushTri(near[i], far[j], far[i], 0, 1, 1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(ts, 1));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    this.scene.add(mesh);
  }

  _dust() {
    const count = 2600;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const bright = new Float32Array(count);
    const L = SUN_DIR.clone().negate();
    const wins = this.level.windows;
    const cells = this.level.floorCells;
    for (let i = 0; i < count; i++) {
      let x, y, z, b;
      if (i < count * 0.45 && wins.length) {
        // dust concentrated inside the sun shafts
        const w = wins[(Math.random() * wins.length) | 0];
        const [a, bb, , d] = w.corners;
        const u = Math.random(), v = Math.random(), t = Math.random() * 7;
        const p = a.clone().lerp(bb, u);
        p.y = a.y + (d.y - a.y) * v;
        p.addScaledVector(L, t);
        x = p.x; y = p.y; z = p.z; b = 1.0;
        if (y < 0.05) { y = 0.05 + Math.random() * 1.5; }
      } else {
        const [cx, cz] = cells[(Math.random() * cells.length) | 0];
        x = (cx + Math.random()) * CELL; z = (cz + Math.random()) * CELL;
        y = 0.2 + Math.random() * (WALL_H - 0.4);
        b = 0.35;
      }
      pos.set([x, y, z], i * 3);
      seed[i] = Math.random() * 100;
      bright[i] = b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: softSpriteTexture() },
        uScale: { value: 300 },
      },
      vertexShader: /* glsl */`
        attribute float aSeed;
        attribute float aBright;
        uniform float uTime;
        uniform float uScale;
        varying float vB;
        void main() {
          vec3 p = position;
          float t = uTime * 0.12 + aSeed;
          p.x += sin(t * 1.3) * 0.25 + sin(t * 0.37) * 0.4;
          p.y += sin(t * 0.9 + aSeed) * 0.18;
          p.z += cos(t * 1.1) * 0.25;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vB = aBright * smoothstep(0.8, 2.5, dist) * (1.0 - smoothstep(14.0, 26.0, dist));
          gl_PointSize = min(uScale * 0.014 / max(dist, 0.1), uScale * 0.006);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        varying float vB;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).r;
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a * vB * 0.9, 1.0);
        }`,
    });
    this.dustMat = mat;
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    this.scene.add(this.dust);
  }

  setViewportHeight(h) {
    this.dustMat.uniforms.uScale.value = h;
  }

  update(dt, camera) {
    this.time += dt;
    this.sky.position.copy(camera.position);
    this.dustMat.uniforms.uTime.value = this.time;
    this.shaftMat.uniforms.uTime.value = this.time;
  }
}
