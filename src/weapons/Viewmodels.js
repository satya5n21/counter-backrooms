import * as THREE from 'three';

// First-person weapons built from the downloaded models.
//
// Each gun is turned so its barrel points down -Z, scaled to a real-world length, and
// moved so the point the right hand holds (the grip) sits at the group's origin.
// Points on the gun are given as fractions of its bounding box after that turn:
//   x: 0 = left, 1 = right;  y: 0 = bottom, 1 = top;  z: 0 = muzzle end, 1 = rear.

export const GUNS = {
  pistol: {
    rotY: -Math.PI / 2, length: 0.236,
    grip: [0.5, 0.42, 0.8], muzzle: [0.5, 0.86, 0],
    rest: [0.1, -0.1, -0.34],
  },
  rifle: {
    rotY: Math.PI / 2, length: 0.86,
    grip: [0.5, 0.36, 0.77], fore: [0.5, 0.5, 0.42], muzzle: [0.5, 0.55, 0],
    rest: [0.135, -0.165, -0.32],
    // the scan's albedo is pale; darken it to gunmetal
    tint: 0.6, metalness: 0.7,
  },
  shotgun: {
    rotY: 0, length: 0.98,
    grip: [0.5, 0.42, 0.77], fore: [0.5, 0.6, 0.42], muzzle: [0.5, 0.86, 0],
    rest: [0.135, -0.16, -0.3],
  },
};

// Hand poses per weapon, in the gun's space (metres, -Z = forward, +Y = up).
// The arms model has open hands, so each hand is first re-shaped (see shapeArm):
//   curl:  extra bend at the knuckle, middle and tip joints of the fingers (radians)
//   wrist: [sideways, backward] wrist bend (radians): sideways tips the forearm towards the
//          little-finger side, backward towards the back of the hand
// then placed so the hole inside the curled fingers sits on the grip:
//   pos:   where that hole goes (right hand: relative to the grip; left: to the fore-grip)
//   up:    the line through the hole, from the little finger towards the index finger
//          (up the pistol grip, or forward along the handguard for the supporting hand)
//   dir:   roughly where the forearm should run, from the hand back towards the elbow
export const ARM_POSES = {
  pistol: {
    right: { pos: [0.006, -0.012, 0.004], up: [0, 0.95, -0.3], dir: [0.15, 0, 1], curl: [0.75, 0.8, 0.5], wrist: [0.9, 0.1] },
    left: { pos: [-0.008, -0.032, -0.014], up: [0.15, 0.95, -0.3], dir: [-0.6, 0, 1], curl: [0.55, 0.6, 0.4], wrist: [0.9, 0.2] },
  },
  rifle: {
    right: { pos: [0.006, -0.012, 0.006], up: [0, 0.92, -0.4], dir: [0.15, 0, 1], curl: [0.75, 0.8, 0.5], wrist: [0.9, 0.1] },
    // the support hand holds the handguard at a slight angle, palm up, forearm dropping away
    left: { pos: [0.004, 0.006, 0], up: [0.35, 0, -0.94], dir: [-0.9, 0.3, 0], curl: [0.7, 0.75, 0.5], wrist: [1.15, 1.35] },
  },
  shotgun: {
    right: { pos: [0.006, -0.012, 0.006], up: [0, 0.85, -0.55], dir: [0.15, 0, 1], curl: [0.75, 0.8, 0.5], wrist: [0.9, 0.1] },
    left: { pos: [0.004, 0.006, 0], up: [0.35, 0, -0.94], dir: [-0.9, 0.3, 0], curl: [0.7, 0.75, 0.5], wrist: [1.15, 1.35] },
  },
};

const ARM_SCALE = 0.0084; // the arms model is in centimetres
// Measured on the arms model, in cm back from the fingertips.
const FINGER_JOINTS = [8.3, 4.8, 2.2]; // knuckle, middle joint, tip joint
const WRIST = 17;
// Centre of the hole inside the curled fingers, relative to the knuckle joint (cm):
// across towards the palm, and back towards the wrist.
const GRIP_HOLE = { in: 4.1, back: 1.6 };

function boxPoint(box, f) {
  return new THREE.Vector3(
    THREE.MathUtils.lerp(box.min.x, box.max.x, f[0]),
    THREE.MathUtils.lerp(box.min.y, box.max.y, f[1]),
    THREE.MathUtils.lerp(box.min.z, box.max.z, f[2]),
  );
}

function prepGun(gltf, cfg) {
  const root = gltf.scene;
  const turn = new THREE.Group();
  turn.rotation.y = cfg.rotY;
  turn.add(root);
  const fit = new THREE.Group();
  fit.add(turn);
  fit.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(fit);
  const s = cfg.length / box.getSize(new THREE.Vector3()).z;
  fit.scale.setScalar(s);
  fit.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(fit);

  const grip = boxPoint(box, cfg.grip);
  fit.position.sub(grip);
  const group = new THREE.Group();
  group.add(fit);

  const muzzle = new THREE.Object3D();
  muzzle.position.copy(boxPoint(box, cfg.muzzle)).sub(grip);
  group.add(muzzle);
  const fore = cfg.fore ? boxPoint(box, cfg.fore).sub(grip) : new THREE.Vector3();

  const tuned = new Set(); // materials are shared between meshes: adjust each once
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // always on screen; skip the per-frame check
    for (const m of [].concat(o.material)) {
      if (tuned.has(m)) continue;
      tuned.add(m);
      if (cfg.tint) m.color.multiplyScalar(cfg.tint);
      if (cfg.metalness !== undefined) m.metalness = cfg.metalness;
    }
  });
  return { group, muzzle, fore };
}

// The arms model is one static mesh with both arms side by side, hands towards +Z.
// Split it down the middle so each arm can be shaped and posed on its own.
// Each hand is held upright (like a handshake) with its palm facing the middle.
function splitArms(gltf) {
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  root.traverse((o) => { if (o.isMesh && !mesh) mesh = o; });
  if (!mesh) return null;
  const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.computeBoundingBox();
  const midX = (flat.boundingBox.min.x + flat.boundingBox.max.x) / 2;
  const pos = flat.attributes.position;
  const names = Object.keys(flat.attributes);
  const halves = [[], []]; // 0: x < mid, 1: x >= mid
  for (let t = 0; t < pos.count; t += 3) {
    const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
    halves[cx < midX ? 0 : 1].push(t);
  }
  const build = (tris) => {
    const g = new THREE.BufferGeometry();
    for (const name of names) {
      const src = flat.attributes[name];
      const size = src.itemSize;
      const arr = new Float32Array(tris.length * 3 * size);
      let o = 0;
      for (const t of tris) {
        for (let v = 0; v < 3; v++) {
          for (let k = 0; k < size; k++) arr[o++] = src.getComponent(t + v, k);
        }
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size, src.normalized));
    }
    return g;
  };
  // The model faces +Z, so its right arm is on -X (palm towards +X) and its left on +X.
  return {
    right: { geo: build(halves[0]), side: 1 },
    left: { geo: build(halves[1]), side: -1 },
    material: mesh.material,
  };
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Average of the vertices (xyz array) in a slab `d` cm back from the fingertips,
// optionally only those within a band of y.
function slabCentre(xyz, zTip, d, half, yBand = null) {
  const c = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < xyz.length; i += 3) {
    const y = xyz[i + 1];
    if (Math.abs(xyz[i + 2] - (zTip - d)) > half) continue;
    if (yBand && (y < yBand[0] || y > yBand[1])) continue;
    c.x += xyz[i]; c.y += y; c.z += xyz[i + 2]; n++;
  }
  return c.divideScalar(Math.max(n, 1));
}

// Rotates vertex i (and its normal) by phi about a vertical line at (x = a, z = b),
// or, for axis 'x', about a line along x at (y = a, z = b).
function rotateAt(p, nrm, i, axis, a, b, phi) {
  const c = Math.cos(phi), s = Math.sin(phi);
  if (axis === 'y') {
    const dx = p.getX(i) - a, dz = p.getZ(i) - b;
    p.setXYZ(i, a + dx * c + dz * s, p.getY(i), b - dx * s + dz * c);
    const nx = nrm.getX(i), nz = nrm.getZ(i);
    nrm.setXYZ(i, nx * c + nz * s, nrm.getY(i), -nx * s + nz * c);
  } else {
    const dy = p.getY(i) - a, dz = p.getZ(i) - b;
    p.setXYZ(i, p.getX(i), a + dy * c - dz * s, b + dy * s + dz * c);
    const ny = nrm.getY(i), nz = nrm.getZ(i);
    nrm.setXYZ(i, nrm.getX(i), ny * c - nz * s, ny * s + nz * c);
  }
}

// Re-shapes one arm for a pose (working in the model's space, hand towards +Z), then
// centres it on the hole inside the curled fingers and turns it so the hand points
// forward (-Z). userData.axis is the forearm direction as if the wrist were straight;
// poseArm() lines that up with the pose's `dir`, and the wrist bend then drops it.
function shapeArm(src, pose) {
  const g = src.geo.clone();
  const p = g.attributes.position, nrm = g.attributes.normal;
  const s = src.side;
  const orig = new Float32Array(p.array);
  let zTip = -Infinity;
  for (let i = 2; i < orig.length; i += 3) zTip = Math.max(zTip, orig[i]);

  // 1. curl the fingers: rotate everything past each joint about a vertical line through
  //    it, tip joint first so the knuckle rotation carries the bent tips along. The thumb
  //    starts behind the knuckle line, so it stays put.
  const pivots = FINGER_JOINTS.map((d) => slabCentre(orig, zTip, d, 0.6, [-7, -1]));
  for (let j = FINGER_JOINTS.length - 1; j >= 0; j--) {
    const pv = pivots[j];
    for (let i = 0; i < p.count; i++) {
      const w = smooth(pv.z - 0.7, pv.z + 0.7, orig[i * 3 + 2]);
      if (w > 0) rotateAt(p, nrm, i, 'y', pv.x, pv.z, pose.curl[j] * w * s);
    }
  }

  // the hole inside the curled fingers, at the height of the middle of the fingers
  let ySum = 0, yN = 0;
  for (let i = 0; i < orig.length; i += 3) {
    if (orig[i + 2] > zTip - FINGER_JOINTS[0]) { ySum += orig[i + 1]; yN++; }
  }
  const knuckle = pivots[0];
  const hole = new THREE.Vector3(knuckle.x + GRIP_HOLE.in * s, ySum / Math.max(yN, 1), knuckle.z - GRIP_HOLE.back);
  const axis = slabCentre(orig, zTip, 33, 5).sub(hole);

  // 2. bend the wrist: sideways (forearm towards the little-finger side) and backward
  //    (towards the back of the hand); both turn about lines through the wrist
  const wrist = slabCentre(orig, zTip, WRIST, 1.0);
  const [sideways, backward = 0] = [].concat(pose.wrist);
  for (let i = 0; i < p.count; i++) {
    const w = 1 - smooth(wrist.z - 1.5, wrist.z + 1.5, orig[i * 3 + 2]);
    if (w <= 0) continue;
    rotateAt(p, nrm, i, 'x', wrist.y, wrist.z, -sideways * w);
    if (backward) rotateAt(p, nrm, i, 'y', wrist.x, wrist.z, backward * w * s);
  }

  // 3. centre on the hole, point the hand forward, convert to metres
  g.translate(-hole.x, -hole.y, -hole.z);
  g.rotateY(Math.PI);
  g.scale(ARM_SCALE, ARM_SCALE, ARM_SCALE);
  g.computeBoundingSphere();
  g.userData.axis = axis.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI).normalize();
  return g;
}

// Rotation taking frame (a1, b1) onto (a2, b2): a is matched exactly, b as closely as possible.
function frameQuat(a1, b1, a2, b2) {
  const basis = (a, b) => {
    const x = a.clone().normalize();
    const y = b.clone().addScaledVector(x, -b.dot(x)).normalize();
    return new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y));
  };
  const m1 = basis(a1, b1), m2 = basis(a2, b2);
  return new THREE.Quaternion().setFromRotationMatrix(m2.multiply(m1.transpose()));
}

// After shapeArm the hole runs along +Y (little finger to index finger) and the
// forearm along userData.axis; turn those onto the pose's `up` and `dir`.
function poseArm(arm, pose, base) {
  arm.position.set(...pose.pos).add(base);
  arm.quaternion.copy(frameQuat(
    new THREE.Vector3(0, 1, 0), arm.geometry.userData.axis,
    new THREE.Vector3(...pose.up), new THREE.Vector3(...pose.dir),
  ));
}

// Returns view-models in the same shape as the procedural builders, or null if any
// weapon model is missing (then the procedural set is used for all three).
export function buildModelWeapons(models) {
  if (!models?.pistol || !models?.rifle || !models?.shotgun) return null;
  const arms = models.arms ? splitArms(models.arms) : null;
  const out = [];
  for (const id of ['pistol', 'rifle', 'shotgun']) {
    const cfg = GUNS[id];
    const gun = prepGun(models[id], cfg);
    const vm = { id, group: gun.group, muzzle: gun.muzzle, rest: new THREE.Vector3(...cfg.rest), arms: {} };
    if (arms) {
      for (const side of ['right', 'left']) {
        const arm = new THREE.Mesh(shapeArm(arms[side], ARM_POSES[id][side]), arms.material);
        arm.frustumCulled = false;
        poseArm(arm, ARM_POSES[id][side], side === 'left' ? gun.fore : new THREE.Vector3());
        vm.group.add(arm);
        vm.arms[side] = arm;
      }
    }
    vm.fore = gun.fore;
    out.push(vm);
  }
  return out;
}

export { poseArm, shapeArm, splitArms };
