import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Every downloaded file the game uses. Paths are relative to public/assets/.
// Any file that fails to load is reported and skipped: the game then falls back
// to the procedural version of that surface, prop or weapon.
const ROOT = `${import.meta.env.BASE_URL}assets/`;

const pbr = (dir, name, maps) =>
  Object.fromEntries(maps.map((m) => [m, `textures/${dir}/${name}_2K-JPG_${m}.jpg`]));
const BASIC = ['Color', 'NormalGL', 'Roughness'];

export const MANIFEST = {
  textures: {
    wallpaper: pbr('wallpaper', 'Wallpaper002B', BASIC),
    carpet: pbr('carpet', 'Fabric029', BASIC),
    ceiling: pbr('ceiling', 'PavingStones136', [...BASIC, 'AmbientOcclusion']),
    paint: pbr('plaster', 'PaintedWood007C', [...BASIC, 'AmbientOcclusion']),
    wood: pbr('wood', 'WoodFloor051', [...BASIC, 'AmbientOcclusion']),
  },
  models: {
    pistol: 'models/weapons/pistol.glb',
    rifle: 'models/weapons/rifel.glb',
    shotgun: 'models/weapons/shotgun.glb',
    arms: 'models/arms/fps_arms.glb',
    sofa: 'models/props/old_sofa.glb',
    plant: 'models/props/potted_plant.glb',
    lamp: 'models/props/floor_lamp.glb',
    chair: 'models/props/office_chair.glb',
    table: 'models/props/side_table.glb',
    vent: 'models/props/air_vent_grille.glb',
    fixture: 'models/props/ceiling_fluorescent_light.glb',
  },
  hdri: 'hdri/evening_road_01_puresky_2k.hdr',
};

async function fetchBuffer(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    onBytes(n);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out.buffer;
}

// Decode off the main thread where the browser allows it. The image is stored
// already flipped (texture.flipY = false), matching what TextureLoader would give.
// maxSize > 0 shrinks the image while decoding (saves GPU memory on subtle maps).
async function decodeImage(buf, type, maxSize = 0) {
  const blob = new Blob([buf], { type });
  if (typeof createImageBitmap === 'function') {
    try {
      const opts = { imageOrientation: 'flipY' };
      if (maxSize) Object.assign(opts, { resizeWidth: maxSize, resizeHeight: maxSize, resizeQuality: 'high' });
      const image = await createImageBitmap(blob, opts);
      return { image, flipY: false };
    } catch { /* fall through to an <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { image: img, flipY: true };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Loads the sky, finds the sun in it (brightest pixel) and clamps extreme values so
// the environment reflections don't sparkle. Returns a half-float equirect texture.
function buildHdri(buf) {
  const data = new RGBELoader().setDataType(THREE.FloatType).parse(buf);
  const { width: w, height: h } = data;
  const px = data.data;
  let best = -1, bi = 0;
  for (let i = 0; i < w * h; i++) {
    const l = px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722;
    if (l > best) { best = l; bi = i; }
  }
  // Row 0 is the top of the image; with flipY it ends up at v = 1.
  const col = bi % w, row = Math.floor(bi / w);
  const u = (col + 0.5) / w, v = 1 - (row + 0.5) / h;
  const phi = (u - 0.5) * Math.PI * 2;      // inverse of three's equirectUv()
  const theta = (v - 0.5) * Math.PI;
  const sun = new THREE.Vector3(Math.cos(theta) * Math.cos(phi), Math.sin(theta), Math.cos(theta) * Math.sin(phi));

  // Average brightness just above the horizon, used to set the sky's exposure.
  let hsum = 0, hn = 0;
  for (let row = Math.floor(h * 0.42); row < Math.floor(h * 0.5); row++) {
    for (let c = 0; c < w; c += 4) {
      const i = (row * w + c) * 4;
      hsum += px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
      hn++;
    }
  }
  const horizon = hn ? hsum / hn : 1;

  const CLAMP = 48;
  const half = new Uint16Array(px.length);
  for (let i = 0; i < px.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(px[i], CLAMP));
  const tex = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = true;
  tex.needsUpdate = true;
  return { texture: tex, sun, peak: best, horizon };
}

// onProgress(fraction 0..1, loadedBytes, totalBytes)
export async function loadAssets(onProgress = () => {}) {
  const jobs = [];
  for (const [set, maps] of Object.entries(MANIFEST.textures)) {
    for (const [map, path] of Object.entries(maps)) jobs.push({ kind: 'texture', set, map, path });
  }
  for (const [key, path] of Object.entries(MANIFEST.models)) jobs.push({ kind: 'model', key, path });
  jobs.push({ kind: 'hdri', path: MANIFEST.hdri });

  // Ask for every file size first so the bar moves by bytes, not by file count.
  const sizes = await Promise.all(jobs.map((j) =>
    fetch(ROOT + j.path, { method: 'HEAD' })
      .then((r) => (r.ok ? Number(r.headers.get('content-length')) || 0 : 0))
      .catch(() => 0)));
  const known = sizes.filter((s) => s > 0);
  const fallbackSize = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const weights = sizes.map((s) => s || fallbackSize);
  const total = weights.reduce((a, b) => a + b, 0);
  const loaded = new Array(jobs.length).fill(0);
  let shown = 0;
  const report = () => {
    const sum = loaded.reduce((a, b) => a + b, 0);
    shown = Math.max(shown, Math.min(1, sum / total));
    onProgress(shown, sum, total);
  };

  const assets = { textures: {}, models: {}, hdri: null, errors: [] };
  const gltf = new GLTFLoader();

  await Promise.all(jobs.map(async (job, i) => {
    try {
      const buf = await fetchBuffer(ROOT + job.path, (n) => {
        loaded[i] = Math.min(n, weights[i]);
        report();
      });
      loaded[i] = weights[i];
      report();
      if (job.kind === 'texture') {
        // roughness and AO barely change at 1K, and it saves ~12 MB of GPU memory each
        const small = job.map === 'Roughness' || job.map === 'AmbientOcclusion' ? 1024 : 0;
        (assets.textures[job.set] ||= {})[job.map] = await decodeImage(buf, 'image/jpeg', small);
      } else if (job.kind === 'model') {
        const dir = ROOT + job.path.slice(0, job.path.lastIndexOf('/') + 1);
        assets.models[job.key] = await gltf.parseAsync(buf, dir);
      } else {
        assets.hdri = buildHdri(buf);
      }
    } catch (err) {
      console.warn(`[assets] could not load ${job.path}:`, err);
      assets.errors.push(job.path);
      loaded[i] = weights[i];
      report();
    }
  }));

  return assets;
}
