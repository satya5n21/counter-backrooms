import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL, WALL_H, SUN_DIR } from '../config.js';
import { MAP_ROWS } from './mapData.js';
import * as Tex from './Textures.js';
import { makeCouch, makePlant, makeLamp } from './Props.js';

const FLOOR = 0, WALL = 1, WINDOW = 2;
const STEP_HEIGHT = 0.32;
// Window opening, in metres on the wall face (u along the wall, v up).
const WIN = { u0: 0.42, u1: 2.08, v0: 0.82, v1: 2.5, depth: 0.28 };
const DIRS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Tiny mesh builder that keeps every quad facing the requested normal.
class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; }
  quad(pts, n, uvs) {
    const [a, b, c] = pts;
    const cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    let order = [0, 1, 2, 0, 2, 3];
    if (cross.dot(n) < 0) order = [0, 2, 1, 0, 3, 2];
    for (const i of order) {
      this.pos.push(pts[i].x, pts[i].y, pts[i].z);
      this.nrm.push(n.x, n.y, n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node, pri) {
    const a = this.items; a.push([pri, node]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.items; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top[1];
  }
}

export class Level {
  constructor() {
    this.rows = MAP_ROWS;
    this.w = MAP_ROWS[0].length;
    this.h = MAP_ROWS.length;
    this.width = this.w * CELL;
    this.depth = this.h * CELL;
    this.cells = new Uint8Array(this.w * this.h);
    this.navBlocked = new Uint8Array(this.w * this.h);
    this.flowDist = new Float32Array(this.w * this.h);
    this.boxes = [];
    this.spawnPoints = [];
    this.pickupSpots = [];
    this.floorCells = [];
    this.windows = [];
    this.playerStart = new THREE.Vector3();
    this.propSpecs = [];
    this.group = new THREE.Group();
    this._parse();
  }

  // ---------- grid helpers ----------
  idx(cx, cz) { return cz * this.w + cx; }
  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  isWall(cx, cz) { return !this.inBounds(cx, cz) || this.cells[this.idx(cx, cz)] !== FLOOR; }
  isBlocked(cx, cz) { return this.isWall(cx, cz) || this.navBlocked[this.idx(cx, cz)] === 1; }
  cellOf(v) { return Math.floor(v / CELL); }
  cellCenter(cx, cz, out = new THREE.Vector3()) { return out.set((cx + 0.5) * CELL, 0, (cz + 0.5) * CELL); }

  _parse() {
    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const ch = this.rows[cz][cx];
        const i = this.idx(cx, cz);
        if (ch === '#') this.cells[i] = WALL;
        else if (ch === 'W') this.cells[i] = WINDOW;
        else this.cells[i] = FLOOR;
        if (this.cells[i] !== FLOOR) { this.navBlocked[i] = 1; continue; }
        this.floorCells.push([cx, cz]);
        const c = this.cellCenter(cx, cz);
        switch (ch) {
          case 'P': this.navBlocked[i] = 1; this.propSpecs.push({ kind: 'pillar', cx, cz }); break;
          case 'C': this.navBlocked[i] = 1; this.propSpecs.push({ kind: 'couch', cx, cz }); break;
          case 'T': this.propSpecs.push({ kind: 'plant', cx, cz }); break;
          case 'L': this.propSpecs.push({ kind: 'lamp', cx, cz }); break;
          case 'S': this.spawnPoints.push(c); break;
          case 'h': this.pickupSpots.push(c); break;
          case 'X': this.playerStart.copy(c); break;
        }
      }
    }
  }

  // ---------- visual construction ----------
  build(scene) {
    const wallpaper = Tex.wallpaperTexture();
    const carpet = Tex.carpetTexture();
    const ceilTex = Tex.ceilingTexture();
    carpet.repeat.set(this.width / CELL, this.depth / CELL);
    ceilTex.repeat.set(this.width / 1.25, this.depth / 1.25);

    this.materials = {
      wall: new THREE.MeshStandardMaterial({ map: wallpaper, roughness: 0.92 }),
      floor: new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }),
      ceiling: new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.55 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.5 }),
      pillar: new THREE.MeshStandardMaterial({ color: 0xe7d6ad, roughness: 0.85 }),
    };

    const floor = new THREE.Mesh(this._plane(this.width, this.depth, 0, false), this.materials.floor);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceiling = new THREE.Mesh(this._plane(this.width, this.depth, WALL_H, true), this.materials.ceiling);
    ceiling.castShadow = true;
    ceiling.receiveShadow = true;
    this.group.add(ceiling);

    this._buildWalls();
    this._buildPillars();
    this._buildProps(scene);
    this._buildCeilingPanels();
    this._buildLights(scene);

    scene.add(this.group);
  }

  _plane(w, d, y, down) {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
    g.translate(w / 2, y, d / 2);
    return g;
  }

  // Describes one wall face: bottom-left corner A, horizontal axis `right`, outward normal n.
  _face(cx, cz, dx, dz) {
    const n = new THREE.Vector3(dx, 0, dz);
    const right = new THREE.Vector3(dz, 0, -dx);
    const center = new THREE.Vector3((cx + 0.5) * CELL + dx * CELL / 2, 0, (cz + 0.5) * CELL + dz * CELL / 2);
    const A = center.clone().addScaledVector(right, -CELL / 2);
    const P = (u, v, off = 0) => A.clone().addScaledVector(right, u).add(new THREE.Vector3(0, v, 0)).addScaledVector(n, off);
    return { n, right, A, P, cx, cz };
  }

  _wallQuad(b, F, u0, u1, v0, v1, off = 0) {
    const pts = [F.P(u0, v0, off), F.P(u1, v0, off), F.P(u1, v1, off), F.P(u0, v1, off)];
    const uvs = pts.map((p) => [(p.x * F.right.x + p.z * F.right.z) / 1.25, p.y / WALL_H]);
    b.quad(pts, F.n, uvs);
  }

  _buildWalls() {
    const wallB = new GeoBuilder();
    const trimB = new GeoBuilder();
    const frameGeos = [];
    const up = new THREE.Vector3(0, 1, 0);
    const down = new THREE.Vector3(0, -1, 0);

    const baseboard = (F, u0, u1) => {
      const h = 0.13, off = 0.015;
      const pts = [F.P(u0, 0, off), F.P(u1, 0, off), F.P(u1, h, off), F.P(u0, h, off)];
      trimB.quad(pts, F.n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      const lip = [F.P(u0, h, 0), F.P(u1, h, 0), F.P(u1, h, off), F.P(u0, h, off)];
      trimB.quad(lip, up, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    };

    const box = (F, uc, vc, off, su, sv, sn) => {
      const alongX = Math.abs(F.right.x) > 0.5;
      const g = alongX ? new THREE.BoxGeometry(su, sv, sn) : new THREE.BoxGeometry(sn, sv, su);
      const c = F.P(uc, vc, off);
      g.translate(c.x, c.y, c.z);
      frameGeos.push(g);
    };

    for (let cz = 0; cz < this.h; cz++) {
      for (let cx = 0; cx < this.w; cx++) {
        const type = this.cells[this.idx(cx, cz)];
        if (type === FLOOR) continue;
        for (const [dx, dz] of DIRS4) {
          if (this.isWall(cx + dx, cz + dz)) continue;
          const F = this._face(cx, cz, dx, dz);
          if (type !== WINDOW) {
            this._wallQuad(wallB, F, 0, CELL, 0, WALL_H);
            baseboard(F, 0, CELL);
            continue;
          }
          // Window: wall around an opening, with a shallow reveal and a white frame.
          const { u0, u1, v0, v1, depth: d } = WIN;
          this._wallQuad(wallB, F, 0, CELL, 0, v0);
          this._wallQuad(wallB, F, 0, CELL, v1, WALL_H);
          this._wallQuad(wallB, F, 0, u0, v0, v1);
          this._wallQuad(wallB, F, u1, CELL, v0, v1);
          const rv = (p, n) => wallB.quad(p, n, p.map((q) => [(q.x + q.z) / 1.25, q.y / WALL_H]));
          rv([F.P(u0, v0, 0), F.P(u1, v0, 0), F.P(u1, v0, -d), F.P(u0, v0, -d)], up);
          rv([F.P(u0, v1, 0), F.P(u1, v1, 0), F.P(u1, v1, -d), F.P(u0, v1, -d)], down);
          rv([F.P(u0, v0, 0), F.P(u0, v1, 0), F.P(u0, v1, -d), F.P(u0, v0, -d)], F.right);
          rv([F.P(u1, v0, 0), F.P(u1, v1, 0), F.P(u1, v1, -d), F.P(u1, v0, -d)], F.right.clone().negate());
          baseboard(F, 0, CELL);

          const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2, fo = -d + 0.05, t = 0.05;
          box(F, uc, vc, fo, t, v1 - v0, 0.06);                       // centre mullion
          box(F, uc, v0 + (v1 - v0) * 0.62, fo, u1 - u0, t, 0.06);    // transom
          box(F, uc, v1 - t / 2, fo, u1 - u0, t, 0.07);               // frame top
          box(F, u0 + t / 2, vc, fo, t, v1 - v0, 0.07);               // frame sides
          box(F, u1 - t / 2, vc, fo, t, v1 - v0, 0.07);
          box(F, uc, v0 + 0.02, 0.06 - d / 2, u1 - u0 + 0.16, 0.04, d + 0.12); // sill board

          this.windows.push({
            corners: [F.P(u0, v0, -d), F.P(u1, v0, -d), F.P(u1, v1, -d), F.P(u0, v1, -d)],
            normal: F.n.clone(),
          });
        }
      }
    }

    const walls = new THREE.Mesh(wallB.geometry(), this.materials.wall);
    walls.castShadow = walls.receiveShadow = true;
    const trim = new THREE.Mesh(trimB.geometry(), this.materials.trim);
    trim.receiveShadow = true;
    const frames = new THREE.Mesh(mergeGeometries(frameGeos), this.materials.frame);
    frames.castShadow = frames.receiveShadow = true;
    this.group.add(walls, trim, frames);
  }

  _buildPillars() {
    const geos = [];
    const trims = [];
    for (const s of this.propSpecs) {
      if (s.kind !== 'pillar') continue;
      const c = this.cellCenter(s.cx, s.cz);
      const g = new THREE.BoxGeometry(0.9, WALL_H, 0.9);
      g.translate(c.x, WALL_H / 2, c.z);
      geos.push(g);
      const base = new THREE.BoxGeometry(0.98, 0.16, 0.98);
      base.translate(c.x, 0.08, c.z);
      const cap = new THREE.BoxGeometry(1.0, 0.14, 1.0);
      cap.translate(c.x, WALL_H - 0.07, c.z);
      trims.push(base, cap);
      this.boxes.push({ minX: c.x - 0.5, maxX: c.x + 0.5, minY: 0, maxY: WALL_H, minZ: c.z - 0.5, maxZ: c.z + 0.5 });
    }
    if (!geos.length) return;
    const pillars = new THREE.Mesh(mergeGeometries(geos), this.materials.pillar);
    pillars.castShadow = pillars.receiveShadow = true;
    const pt = new THREE.Mesh(mergeGeometries(trims), this.materials.trim);
    pt.castShadow = pt.receiveShadow = true;
    this.group.add(pillars, pt);
  }

  _wallNeighbors(cx, cz) {
    return DIRS4.filter(([dx, dz]) => this.isWall(cx + dx, cz + dz));
  }

  _buildProps() {
    this.lampSpots = [];
    for (const s of this.propSpecs) {
      if (s.kind === 'pillar') continue;
      const c = this.cellCenter(s.cx, s.cz);
      const walls = this._wallNeighbors(s.cx, s.cz);
      let made, rot = 0;
      const pos = c.clone();
      if (s.kind === 'couch') {
        made = makeCouch();
        const [dx, dz] = walls[0] || [0, -1];
        rot = Math.atan2(-dx, -dz);
        pos.x += dx * 0.76; pos.z += dz * 0.76;
      } else {
        made = s.kind === 'plant' ? makePlant() : makeLamp();
        for (const [dx, dz] of walls.slice(0, 2)) { pos.x += dx * 0.72; pos.z += dz * 0.72; }
        rot = Math.random() * Math.PI * 2;
        if (s.kind === 'lamp') this.lampSpots.push(new THREE.Vector3(pos.x, made.lightY, pos.z));
      }
      made.group.position.copy(pos);
      made.group.rotation.y = rot;
      this.group.add(made.group);

      // Transform local boxes into world AABBs (rotation is arbitrary for round props,
      // so use the rotated corner extents).
      const cos = Math.cos(rot), sin = Math.sin(rot);
      for (const b of made.boxes) {
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]]) {
          const wx = x * cos + z * sin, wz = -x * sin + z * cos;
          minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
          minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
        }
        this.boxes.push({ minX: pos.x + minX, maxX: pos.x + maxX, minY: b.minY, maxY: b.maxY, minZ: pos.z + minZ, maxZ: pos.z + maxZ });
      }
    }
  }

  _buildCeilingPanels() {
    const spots = this.floorCells.filter(([cx, cz]) => (cx + cz) % 2 === 0);
    const geo = new THREE.PlaneGeometry(1.25, 0.62);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.45, 1.32, 1.08) });
    const panels = new THREE.InstancedMesh(geo, mat, spots.length);
    const frameGeo = new THREE.PlaneGeometry(1.38, 0.75);
    frameGeo.rotateX(Math.PI / 2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a3, roughness: 0.6 });
    const frames = new THREE.InstancedMesh(frameGeo, frameMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([cx, cz], i) => {
      const c = this.cellCenter(cx, cz);
      m.makeTranslation(c.x, WALL_H - 0.012, c.z);
      panels.setMatrixAt(i, m);
      m.makeTranslation(c.x, WALL_H - 0.006, c.z);
      frames.setMatrixAt(i, m);
    });
    this.group.add(panels, frames);
  }

  _buildLights(scene) {
    const center = new THREE.Vector3(this.width / 2, 0, this.depth / 2);

    const hemi = new THREE.HemisphereLight(0xffe7c2, 0x8c6c40, 1.35);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffb066, 6.0);
    sun.position.copy(center).addScaledVector(SUN_DIR, 90);
    sun.target.position.copy(center);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const sc = sun.shadow.camera;
    sc.left = -58; sc.right = 58; sc.top = 58; sc.bottom = -58;
    sc.near = 20; sc.far = 180;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    this.sun = sun;

    // Warm interior fills: lamps, plus a few soft ceiling lights over the atrium.
    for (const p of this.lampSpots) {
      const l = new THREE.PointLight(0xffa955, 7, 9, 1.6);
      l.position.copy(p);
      scene.add(l);
    }
    for (const [cx, cz] of [[11, 8], [19, 8], [11, 15], [19, 15], [15, 11]]) {
      const l = new THREE.PointLight(0xffe2b5, 9, 13, 1.5);
      l.position.copy(this.cellCenter(cx, cz)).setY(WALL_H - 0.3);
      scene.add(l);
    }
  }

  // ---------- collision ----------
  _pushOutBox(pos, r, minX, maxX, minZ, maxZ) {
    const qx = Math.max(minX, Math.min(pos.x, maxX));
    const qz = Math.max(minZ, Math.min(pos.z, maxZ));
    const dx = pos.x - qx, dz = pos.z - qz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      pos.x += (dx / d) * (r - d);
      pos.z += (dz / d) * (r - d);
    } else {
      // centre inside the box: leave along the shallowest side
      const pen = [pos.x - minX, maxX - pos.x, pos.z - minZ, maxZ - pos.z];
      const m = pen.indexOf(Math.min(...pen));
      if (m === 0) pos.x = minX - r; else if (m === 1) pos.x = maxX + r;
      else if (m === 2) pos.z = minZ - r; else pos.z = maxZ + r;
    }
    return true;
  }

  // Push a vertical cylinder (feet at feetY, given height) out of walls and props.
  resolveCircle(pos, r, feetY = 0, height = 1.8) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      const x0 = this.cellOf(pos.x - r), x1 = this.cellOf(pos.x + r);
      const z0 = this.cellOf(pos.z - r), z1 = this.cellOf(pos.z + r);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (this.isWall(cx, cz)) {
            hit = this._pushOutBox(pos, r, cx * CELL, (cx + 1) * CELL, cz * CELL, (cz + 1) * CELL) || hit;
          }
        }
      }
      for (const b of this.boxes) {
        if (b.maxY <= feetY + STEP_HEIGHT || b.minY >= feetY + height) continue;
        if (pos.x + r < b.minX || pos.x - r > b.maxX || pos.z + r < b.minZ || pos.z - r > b.maxZ) continue;
        hit = this._pushOutBox(pos, r, b.minX, b.maxX, b.minZ, b.maxZ) || hit;
      }
    }
    return hit;
  }

  // Highest prop surface under the circle that the player could stand on.
  groundHeight(x, z, r, feetY) {
    let h = 0;
    for (const b of this.boxes) {
      if (b.maxY > feetY + STEP_HEIGHT + 0.01) continue;
      if (x + r * 0.6 < b.minX || x - r * 0.6 > b.maxX || z + r * 0.6 < b.minZ || z - r * 0.6 > b.maxZ) continue;
      h = Math.max(h, b.maxY);
    }
    return h;
  }

  // ---------- ray casting ----------
  _inWindowOpening(cx, cz, p) {
    if (this.cells[this.idx(cx, cz)] !== WINDOW) return false;
    if (p.y < WIN.v0 || p.y > WIN.v1) return false;
    for (const [dx, dz] of DIRS4) {
      if (this.isWall(cx + dx, cz + dz)) continue;
      const F = this._face(cx, cz, dx, dz);
      const u = (p.x - F.A.x) * F.right.x + (p.z - F.A.z) * F.right.z;
      if (u > WIN.u0 && u < WIN.u1) return true;
    }
    return false;
  }

  // Returns { dist, point, normal } for the first world surface hit, or null.
  raycast(o, d, maxDist) {
    let best = maxDist;
    const normal = new THREE.Vector3();
    let hit = false;

    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      if (t >= 0 && t < best) { best = t; normal.set(0, 1, 0); hit = true; }
    } else if (d.y > 1e-6) {
      const t = (WALL_H - o.y) / d.y;
      if (t >= 0 && t < best) { best = t; normal.set(0, -1, 0); hit = true; }
    }

    // Grid DDA through wall cells.
    let cx = this.cellOf(o.x), cz = this.cellOf(o.z);
    if (this.isWall(cx, cz)) return { dist: 0, point: o.clone(), normal: d.clone().negate() };
    const stepX = Math.sign(d.x), stepZ = Math.sign(d.z);
    const tDX = stepX !== 0 ? Math.abs(CELL / d.x) : Infinity;
    const tDZ = stepZ !== 0 ? Math.abs(CELL / d.z) : Infinity;
    let tMX = stepX > 0 ? ((cx + 1) * CELL - o.x) / d.x : stepX < 0 ? (cx * CELL - o.x) / d.x : Infinity;
    let tMZ = stepZ > 0 ? ((cz + 1) * CELL - o.z) / d.z : stepZ < 0 ? (cz * CELL - o.z) / d.z : Infinity;
    const p = new THREE.Vector3();
    for (let i = 0; i < 200; i++) {
      let t, side;
      if (tMX < tMZ) { t = tMX; tMX += tDX; cx += stepX; side = 0; }
      else { t = tMZ; tMZ += tDZ; cz += stepZ; side = 1; }
      if (t >= best) break;
      if (this.isWall(cx, cz)) {
        p.copy(o).addScaledVector(d, t);
        if (this.inBounds(cx, cz) && this._inWindowOpening(cx, cz, p)) {
          break; // flew out through a window into the sunset
        }
        best = t; hit = true;
        if (side === 0) normal.set(-stepX, 0, 0); else normal.set(0, 0, -stepZ);
        break;
      }
    }

    // Props (slab test).
    for (const b of this.boxes) {
      let tmin = 0, tmax = best, axis = -1, sgn = 0;
      const lo = [b.minX, b.minY, b.minZ], hi = [b.maxX, b.maxY, b.maxZ];
      const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
      let miss = false;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(dd[a]) < 1e-9) {
          if (oo[a] < lo[a] || oo[a] > hi[a]) { miss = true; break; }
          continue;
        }
        let t1 = (lo[a] - oo[a]) / dd[a], t2 = (hi[a] - oo[a]) / dd[a];
        let s = -1;
        if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sgn = s; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) { miss = true; break; }
      }
      if (miss || axis < 0 || tmin >= best) continue;
      best = tmin; hit = true;
      normal.set(0, 0, 0).setComponent(axis, sgn);
    }

    if (!hit) return null;
    return { dist: best, point: o.clone().addScaledVector(d, best), normal };
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    return !this.raycast(a, d, len);
  }

  // ---------- navigation (one flow field towards the player, shared by all bots) ----------
  computeFlow(tx, tz) {
    const dist = this.flowDist;
    dist.fill(Infinity);
    if (!this.inBounds(tx, tz)) return;
    const heap = new MinHeap();
    const start = this.idx(tx, tz);
    dist[start] = 0;
    heap.push(start, 0);
    while (heap.size) {
      const i = heap.pop();
      const cx = i % this.w, cz = (i / this.w) | 0;
      const base = dist[i];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (this.isBlocked(nx, nz)) continue;
          if (dx && dz && (this.isBlocked(cx + dx, cz) || this.isBlocked(cx, cz + dz))) continue;
          const nd = base + (dx && dz ? 1.4142 : 1);
          const ni = this.idx(nx, nz);
          if (nd < dist[ni]) { dist[ni] = nd; heap.push(ni, nd); }
        }
      }
    }
  }

  flowAt(cx, cz) { return this.inBounds(cx, cz) ? this.flowDist[this.idx(cx, cz)] : Infinity; }

  // Next cell downhill on the flow field.
  flowStep(cx, cz) {
    let best = this.flowAt(cx, cz), bx = cx, bz = cz;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        if (dx && dz && (this.isBlocked(cx + dx, cz) || this.isBlocked(cx, cz + dz))) continue;
        const v = this.flowAt(cx + dx, cz + dz);
        if (v < best) { best = v; bx = cx + dx; bz = cz + dz; }
      }
    }
    return [bx, bz];
  }

  // True if a circle of radius r can slide straight from a to b without hitting blocked cells.
  clearPath(ax, az, bx, bz, r) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const px = -dz / len * r, pz = dx / len * r;
    const steps = Math.ceil(len / 0.3);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = ax + dx * t, z = az + dz * t;
      if (this.isBlocked(this.cellOf(x), this.cellOf(z))) return false;
      if (this.isBlocked(this.cellOf(x + px), this.cellOf(z + pz))) return false;
      if (this.isBlocked(this.cellOf(x - px), this.cellOf(z - pz))) return false;
    }
    return true;
  }
}
