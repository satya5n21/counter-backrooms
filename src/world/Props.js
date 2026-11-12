import * as THREE from 'three';

// Simple furniture built from primitives. Each builder returns
// { group, boxes } where boxes are local-space collision boxes
// {minX,maxX,minY,maxY,minZ,maxZ} before the group's rotation/position.

const mats = {};
function mat(key, params) {
  if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial(params);
  return mats[key];
}

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const COUCH_COLORS = [0x9fae8e, 0xc09486, 0xc9a978, 0x8f9fb0];
let couchIndex = 0;

// Couch, 2m long along local X, back at local -Z.
export function makeCouch() {
  const group = new THREE.Group();
  const fabric = mat('couch' + couchIndex % COUCH_COLORS.length, {
    color: COUCH_COLORS[couchIndex % COUCH_COLORS.length], roughness: 0.95,
  });
  couchIndex++;
  const wood = mat('wood', { color: 0x6b4a2e, roughness: 0.7 });

  const add = (geo, m, x, y, z) => {
    const mesh = shadowed(new THREE.Mesh(geo, m));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(2.0, 0.22, 0.85), fabric, 0, 0.27, 0);          // base
  add(new THREE.BoxGeometry(1.7, 0.12, 0.62), fabric, 0, 0.43, 0.06);       // cushion
  add(new THREE.BoxGeometry(2.0, 0.5, 0.2), fabric, 0, 0.6, -0.33);         // back
  add(new THREE.BoxGeometry(0.16, 0.36, 0.85), fabric, -0.92, 0.5, 0);      // arms
  add(new THREE.BoxGeometry(0.16, 0.36, 0.85), fabric, 0.92, 0.5, 0);
  for (const [x, z] of [[-0.9, 0.35], [0.9, 0.35], [-0.9, -0.35], [0.9, -0.35]]) {
    add(new THREE.CylinderGeometry(0.03, 0.025, 0.16, 6), wood, x, 0.08, z);
  }
  // pillows
  const pillow = mat('pillow', { color: 0xf1e6cf, roughness: 1 });
  const p1 = add(new THREE.BoxGeometry(0.4, 0.34, 0.1), pillow, -0.6, 0.62, -0.18);
  p1.rotation.z = 0.12;
  const p2 = add(new THREE.BoxGeometry(0.4, 0.34, 0.1), pillow, 0.6, 0.62, -0.18);
  p2.rotation.z = -0.1;

  const boxes = [
    { minX: -1.0, maxX: 1.0, minY: 0, maxY: 0.5, minZ: -0.43, maxZ: 0.43 },
    { minX: -1.0, maxX: 1.0, minY: 0, maxY: 0.86, minZ: -0.43, maxZ: -0.22 },
  ];
  return { group, boxes };
}

export function makePlant() {
  const group = new THREE.Group();
  const pot = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.2, 0.5, 14),
    mat('pot', { color: 0xb86a45, roughness: 0.85 }),
  ));
  pot.position.y = 0.25;
  group.add(pot);
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.25, 14), mat('soil', { color: 0x3b2a1c, roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 0.48;
  group.add(soil);

  const stem = shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.035, 0.9, 6),
    mat('stem', { color: 0x5b4a2a, roughness: 0.9 }),
  ));
  stem.position.y = 0.9;
  group.add(stem);

  const greens = [0x5d8a4a, 0x6f9a52, 0x4f7a42, 0x86a85e];
  const leafGeo = new THREE.SphereGeometry(0.2, 8, 6);
  for (let i = 0; i < 11; i++) {
    const leaf = shadowed(new THREE.Mesh(
      leafGeo,
      mat('leaf' + (i % greens.length), { color: greens[i % greens.length], roughness: 0.7, flatShading: true }),
    ));
    const a = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
    const r = 0.12 + Math.random() * 0.22;
    leaf.position.set(Math.cos(a) * r, 1.05 + Math.random() * 0.55, Math.sin(a) * r);
    leaf.scale.set(1.0, 0.35, 0.6);
    leaf.rotation.set(Math.random() - 0.5, a, (Math.random() - 0.5) * 0.8);
    group.add(leaf);
  }
  return { group, boxes: [{ minX: -0.3, maxX: 0.3, minY: 0, maxY: 1.6, minZ: -0.3, maxZ: 0.3 }] };
}

export function makeLamp() {
  const group = new THREE.Group();
  const brass = mat('brass', { color: 0xb08a4a, roughness: 0.35, metalness: 0.7 });
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 16), brass));
  base.position.y = 0.02;
  group.add(base);
  const pole = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), brass));
  pole.position.y = 0.78;
  group.add(pole);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: 0xf6e3bd, emissive: 0xffb860, emissiveIntensity: 1.6, roughness: 0.9, side: THREE.DoubleSide,
  });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 0.32, 18, 1, true), shadeMat);
  shade.position.y = 1.62;
  group.add(shade);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1.8) }),
  );
  bulb.position.y = 1.55;
  group.add(bulb);
  return { group, boxes: [{ minX: -0.2, maxX: 0.2, minY: 0, maxY: 1.8, minZ: -0.2, maxZ: 0.2 }], lightY: 1.6 };
}

// ---------- downloaded models ----------

// Wraps a glTF scene so it is `size` metres long along `axis`, centred on X/Z and
// standing on y = 0. Returns a template to clone() per placement (clones share
// geometry and materials). template.userData.size holds the fitted dimensions.
export function makeTemplate(gltf, { size, axis = 'y', shadows = true, setup } = {}) {
  const root = gltf.scene;
  const holder = new THREE.Group();
  holder.add(root);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const dim = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const s = size / dim[axis];
  holder.scale.setScalar(s);
  holder.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  const tpl = new THREE.Group();
  tpl.add(holder);
  tpl.userData.size = dim.multiplyScalar(s);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows;
    o.receiveShadow = true;
    if (setup) for (const m of [].concat(o.material)) setup(m, o);
  });
  return tpl;
}

// Cut-out leaves: alpha-tested instead of blended so they sort and cast shadows properly.
export function cutoutLeaves(m) {
  if (m.transparent || m.alphaMode === 'BLEND') {
    m.transparent = false;
    m.alphaTest = 0.45;
    m.depthWrite = true;
  }
}

export function warmGlow(intensity) {
  return (m) => {
    if (!m.emissiveMap) return;
    m.emissive.set(0xffc27a);
    m.emissiveIntensity = intensity;
  };
}

const sizeOf = (tpl) => tpl.userData.size;

// Couch model: front faces +Z, so the back goes against the wall like makeCouch().
export function modelCouch(tpl) {
  const { x: w, y: h, z: d } = sizeOf(tpl);
  return {
    group: tpl.clone(),
    width: w, depth: d,
    boxes: [
      { minX: -w / 2, maxX: w / 2, minY: 0, maxY: 0.5, minZ: -d / 2, maxZ: d / 2 },
      { minX: -w / 2, maxX: w / 2, minY: 0, maxY: h * 0.85, minZ: -d / 2, maxZ: -d / 2 + 0.3 },
    ],
  };
}

// Round-ish props: one collision box of half-width r up to height `top`.
export function modelProp(tpl, r, top) {
  const t = top ?? sizeOf(tpl).y;
  return { group: tpl.clone(), boxes: [{ minX: -r, maxX: r, minY: 0, maxY: t, minZ: -r, maxZ: r }] };
}

export function modelLamp(tpl) {
  const made = modelProp(tpl, 0.2);
  made.lightY = sizeOf(tpl).y * 0.86;
  return made;
}
