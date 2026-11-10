import * as THREE from 'three';

// All surfaces are painted on canvases at load time, so the game ships no image files.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

function grain(g, w, h, amount) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
}

// 256px = 1.25m wide, 512px = full wall height.
export function wallpaperTexture() {
  const [c, g] = canvas(256, 512);
  g.fillStyle = '#d8c07a';
  g.fillRect(0, 0, 256, 512);

  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = 'rgba(255, 242, 196, 0.22)';
    g.fillRect(x, 0, 14, 512);
    g.fillStyle = 'rgba(140, 110, 50, 0.13)';
    g.fillRect(x + 15, 0, 2, 512);
  }

  // small diamond motif between the stripes
  g.fillStyle = 'rgba(150, 118, 52, 0.2)';
  for (let col = 0; col < 8; col++) {
    for (let y = 0; y < 512; y += 64) {
      const cx = col * 32 + 24;
      const cy = y + (col % 2) * 32 + 16;
      g.beginPath();
      g.moveTo(cx, cy - 5); g.lineTo(cx + 3.5, cy); g.lineTo(cx, cy + 5); g.lineTo(cx - 3.5, cy);
      g.closePath(); g.fill();
    }
  }

  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, 'rgba(255, 250, 225, 0.10)');
  grad.addColorStop(0.75, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(110, 80, 30, 0.16)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);

  grain(g, 256, 512, 9);
  return toTexture(c);
}

// 512px = one 2.5m cell.
export function carpetTexture() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#ad9459';
  g.fillRect(0, 0, 512, 512);
  // soft mottling (wraps around so the tile is seamless)
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, r = 20 + Math.random() * 70;
    const tone = Math.random() < 0.5 ? '120, 96, 50' : '200, 178, 120';
    for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${tone}, 0.08)`);
      gr.addColorStop(1, `rgba(${tone}, 0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(90, 70, 35, 0.25)' : 'rgba(225, 205, 150, 0.22)';
    g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }
  grain(g, 512, 512, 16);
  return toTexture(c);
}

// 256px = 1.25m: a 2x2 block of drop-ceiling tiles.
export function ceilingTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#e9dfc4';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = 'rgba(150, 130, 95, 0.28)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.2, 1.2);
  }
  g.fillStyle = '#b8aa88';
  for (const p of [0, 128]) {
    g.fillRect(p, 0, 3, 256);
    g.fillRect(0, p, 256, 3);
  }
  g.fillStyle = 'rgba(255, 255, 240, 0.5)';
  for (const p of [3, 131]) {
    g.fillRect(p, 0, 1, 256);
    g.fillRect(0, p, 256, 1);
  }
  grain(g, 256, 256, 6);
  return toTexture(c);
}

// Soft round sprite used for glows, dust and particles.
export function softSpriteTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false, srgb: false });
}

export function decalTexture() {
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(40,28,15,0.95)');
  gr.addColorStop(0.35, 'rgba(60,42,20,0.75)');
  gr.addColorStop(0.7, 'rgba(90,65,30,0.25)');
  gr.addColorStop(1, 'rgba(90,65,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, { repeat: false });
}
