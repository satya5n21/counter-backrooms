import * as THREE from 'three';
import * as Tex from './Textures.js';

// Builds the level's surface materials from the downloaded PBR sets, falling back to
// the canvas-painted textures for any set that is missing.
//
// Level geometry carries UVs in metres, so every texture's `repeat` is 1 / (the
// real-world size one copy of the texture covers).

const ANISO = 8;

// Real-world size (metres) covered by one copy of each texture set.
export const TEX_SIZE = { wall: 2.5, carpet: 1.4, ceiling: 2.5, paint: 1.2, wood: 1.6 };

function setup(t, size, srgb) {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = ANISO;
  t.repeat.set(1 / size, 1 / size);
  t.needsUpdate = true;
  return t;
}

// One texture per image, so materials that share a set don't upload it twice.
const cache = new Map();
function imageTexture(entry, size, srgb = false) {
  if (!entry) return null;
  const key = entry.image;
  if (cache.has(key)) return cache.get(key);
  const t = new THREE.Texture(entry.image);
  t.flipY = entry.flipY;
  cache.set(key, setup(t, size, srgb));
  return cache.get(key);
}

function canvasFrom(entry) {
  const { image } = entry;
  const c = document.createElement('canvas');
  c.width = image.width; c.height = image.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0);
  return [c, g];
}

function canvasTexture(c, entry, size) {
  const t = new THREE.CanvasTexture(c);
  t.flipY = entry.flipY;
  return setup(t, size, true);
}

// Keeps the photo's light/dark detail but moves its average colour to `hex`.
function recolor(entry, hex, size, contrast = 1) {
  const [c, g] = canvasFrom(entry);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const n = d.length / 4;
  let mean = 0;
  for (let i = 0; i < d.length; i += 4) mean += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  mean /= n;
  const tr = (hex >> 16) & 255, tg = (hex >> 8) & 255, tb = hex & 255; // sRGB, like the canvas
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / mean;
    const k = Math.pow(Math.max(l, 0), contrast);
    d[i] = tr * k; d[i + 1] = tg * k; d[i + 2] = tb * k;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, entry, size);
}

// Yellow striped backrooms paper, multiplied over the scanned (white, stained) paper.
function wallpaper(entry, size) {
  const [c, g] = canvasFrom(entry);
  const W = c.width, H = c.height;
  const p = document.createElement('canvas');
  p.width = W; p.height = H;
  const pg = p.getContext('2d');
  pg.fillStyle = '#e4c879';
  pg.fillRect(0, 0, W, H);
  const stripes = 16;
  const period = W / stripes;
  for (let i = 0; i < stripes; i++) {
    const x = i * period;
    pg.fillStyle = 'rgba(255, 244, 205, 0.30)';
    pg.fillRect(x, 0, period * 0.44, H);
    pg.fillStyle = 'rgba(150, 115, 50, 0.16)';
    pg.fillRect(x + period * 0.47, 0, period * 0.06, H);
  }
  pg.fillStyle = 'rgba(150, 115, 50, 0.22)';
  const rows = Math.round(H / (period * 2));
  for (let col = 0; col < stripes; col++) {
    for (let r = 0; r < rows; r++) {
      const cx = col * period + period * 0.75;
      const cy = (r + (col % 2) * 0.5) * (H / rows) + period * 0.5;
      const s = period * 0.045;
      pg.beginPath();
      pg.moveTo(cx, cy - s * 1.4); pg.lineTo(cx + s, cy); pg.lineTo(cx, cy + s * 1.4); pg.lineTo(cx - s, cy);
      pg.closePath(); pg.fill();
    }
  }
  // soften the scanned stains so the paper reads as aged, not mouldy
  g.fillStyle = 'rgba(255, 252, 245, 0.62)';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(p, 0, 0);
  g.globalCompositeOperation = 'source-over';
  return canvasTexture(c, entry, size);
}

// Keeps scanned roughness maps from going mirror-smooth: a near-zero roughness gives
// pin-point sun glints that sparkle from frame to frame.
function minRoughness(mat, r) {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
  roughnessFactor = max(roughnessFactor, ${r.toFixed(3)});`,
    );
  };
  mat.customProgramCacheKey = () => `minRoughness${r}`;
  return mat;
}

function pbrMaterial(set, size, { color = 0xffffff, map, normalScale = 1, roughness = 1, aoIntensity = 1 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: map || imageTexture(set.Color, size, true),
    normalMap: imageTexture(set.NormalGL, size),
    roughnessMap: imageTexture(set.Roughness, size),
    aoMap: imageTexture(set.AmbientOcclusion, size),
    roughness,
    aoMapIntensity: aoIntensity,
  });
  if (mat.normalMap) mat.normalScale.set(normalScale, normalScale);
  return minRoughness(mat, 0.28);
}

export function buildLevelMaterials(assets) {
  const T = assets?.textures || {};
  const has = (k) => !!T[k]?.Color;
  const m = {};

  // Walls and pillars
  if (has('wallpaper')) {
    m.wall = pbrMaterial(T.wallpaper, TEX_SIZE.wall, { map: wallpaper(T.wallpaper.Color, TEX_SIZE.wall), normalScale: 0.7 });
  } else {
    const t = Tex.wallpaperTexture();
    t.repeat.set(1 / 1.25, 1 / 3);
    m.wall = new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
  }
  m.pillar = m.wall;

  // Carpet
  if (has('carpet')) {
    m.floor = pbrMaterial(T.carpet, TEX_SIZE.carpet, { map: recolor(T.carpet.Color, 0xb39350, TEX_SIZE.carpet, 0.9), normalScale: 0.8 });
  } else {
    const t = Tex.carpetTexture();
    t.repeat.set(1 / 2.5, 1 / 2.5);
    m.floor = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }

  // Sunlit wood floor in the window gallery (carpet if the set is missing)
  m.woodFloor = has('wood') ? pbrMaterial(T.wood, TEX_SIZE.wood, { color: 0xe8d2b8, normalScale: 0.6, aoIntensity: 0.7 }) : m.floor;

  // Ceiling tiles
  if (has('ceiling')) {
    m.ceiling = pbrMaterial(T.ceiling, TEX_SIZE.ceiling, { map: recolor(T.ceiling.Color, 0xf4ecd8, TEX_SIZE.ceiling, 0.9), normalScale: 0.5, aoIntensity: 0.45 });
  } else {
    const t = Tex.ceilingTexture();
    t.repeat.set(1 / 1.25, 1 / 1.25);
    m.ceiling = new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 });
  }
  m.ceilingFallbackRepeat = !has('ceiling');

  // Painted woodwork: baseboards, pillar caps, window frames
  if (has('paint')) {
    m.trim = pbrMaterial(T.paint, TEX_SIZE.paint, { color: 0xf3e6c8, normalScale: 0.5, aoIntensity: 0.6 });
    m.frame = pbrMaterial(T.paint, TEX_SIZE.paint, { color: 0xffffff, normalScale: 0.5, aoIntensity: 0.6 });
  } else {
    m.trim = new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.55 });
    m.frame = new THREE.MeshStandardMaterial({ color: 0xf7f1e3, roughness: 0.5 });
  }
  return m;
}

// Box-projected UVs in world metres (for merged boxes such as pillars and frames).
export function worldBoxUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else if (ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  uv.needsUpdate = true;
  return geo;
}
