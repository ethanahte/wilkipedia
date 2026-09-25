// The 三渲二 look, part 1: materials.
//
// Every surface is MeshToonMaterial with a hard light ramp, so light falls off in
// bands instead of gradients. Each material is also patched to write a second
// output: the view-space normal and the distance from the camera. post.js reads
// that to draw ink outlines wherever the depth jumps or a crease folds, which
// works at every distance and costs no extra render of the scene.
//
// Textures are painted on canvases at load, so the whole look downloads as code.

import * as THREE from 'three';

export let maxAniso = 4;
export const setAniso = (n) => { maxAniso = n; };

// Light ramp over (N·L)*0.5+0.5, eight bins: far side, a narrow terminator band, lit.
// The far side gets no sunlight at all, exactly like a cast shadow, so a wall
// turned away from the sun and a wall in a building's shadow are the same
// flat colour (the anime way), and shadow-map acne can't show on it.
function ramp(values) {
  const t = new THREE.DataTexture(new Uint8Array(values), values.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
export const TOON = ramp([0, 0, 0, 0, 140, 255, 255, 255]);
export const SOFT = ramp([150, 150, 150, 190, 225, 255, 255, 255]);

// ── the G-buffer patch ──
const OUT = 'layout(location = 1) out highp vec4 gNormalDepth;\n';
export function gbuffer(mat, { noInk = false } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.(s, r);
    const hasNormal = /normal_fragment_begin/.test(s.fragmentShader);
    const n = hasNormal && !noInk ? 'normalize(normal) * 0.5 + 0.5' : 'vec3(0.5, 0.5, 1.0)';
    s.fragmentShader = OUT + s.fragmentShader.replace(/}\s*$/,
      `  gNormalDepth = vec4(${n}, 1.0 / gl_FragCoord.w);\n}`);
  };
  mat.customProgramCacheKey = () => `gbuf${noInk ? 'n' : ''}|${mat.type}|${mat.map ? 1 : 0}|${mat.alphaTest}`;
  return mat;
}

// ── canvas textures ──
export function canvasTex(w, h, draw, { repeat = null, srgb = true, mips = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / repeat[0], 1 / repeat[1]); }
  t.anisotropy = maxAniso;
  t.generateMipmaps = mips;
  return t;
}

function noise(g, w, h, amount, seed = 7) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (r() - 0.5) * amount;
    d[i] += k; d[i + 1] += k; d[i + 2] += k;
  }
  g.putImageData(img, 0, 0);
}

export function makeTextures() {
  const T = {};
  // Stucco: white (tinted per vertex), faint horizontal reveals every 0.625 m and
  // a panel joint every 2.5 m, like the scored stucco on B and R.
  T.stucco = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 10);
    g.fillStyle = 'rgba(90,70,40,0.10)';
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, w, 2);
    g.fillStyle = 'rgba(90,70,40,0.07)'; g.fillRect(0, 0, 2, h);
  }, { repeat: [2.5, 2.5] });

  // Glass: sky-bright at the top, dark below, and an anime glint across it.
  T.glass = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#9fc3dd'); gr.addColorStop(0.45, '#56738a'); gr.addColorStop(1, '#2f3f4d');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.moveTo(w * 0.15, h); g.lineTo(w * 0.45, h); g.lineTo(w * 1.1, h * 0.25); g.lineTo(w * 0.8, h * 0.25); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.moveTo(w * 0.55, h); g.lineTo(w * 0.65, h); g.lineTo(w * 1.2, h * 0.45); g.lineTo(w * 1.1, h * 0.45); g.fill();
  }, { repeat: [1.6, 2.4] });

  T.louver = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#d9dadc'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = '#6e7277'; g.fillRect(0, y + 9, w, 5); g.fillStyle = '#f2f2f2'; g.fillRect(0, y, w, 2); }
  }, { repeat: [1, 0.25] });

  T.roof = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); noise(g, w, h, 26, 3);
  }, { repeat: [4, 4] });

  T.solar = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b8c6d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#233a63';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    g.fillStyle = 'rgba(160,190,230,0.35)';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h);
  }, { repeat: [1, 1] });

  T.metal = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, 0, 4, h);
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(5, 0, 3, h);
  }, { repeat: [0.55, 4] });

  T.brick = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#8f8a86'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let col = -1; col < 3; col++) {
        const x = col * 64 + (row % 2) * 32, y = row * 16;
        g.fillStyle = ['#4a403d', '#554943', '#3f3735'][(row + col + 3) % 3];
        g.fillRect(x + 2, y + 2, 60, 12);
      }
    }
  }, { repeat: [0.8, 0.4] });

  // Chain-link fence: a diamond mesh, see-through between the wires.
  T.chain = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h); g.closePath(); g.stroke();
  }, { repeat: [0.12, 0.12] });

  T.mosaic = canvasTex(256, 256, (g, w, h) => {
    const cols = ['#8b7355', '#a89276', '#6f6252', '#c9b89c', '#5c5046', '#b7a58a', '#7d6d5c'];
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      g.fillStyle = cols[((x * 7 + y * 13 + ((x * y) >> 5)) >>> 0) % cols.length]; g.fillRect(x, y, 7, 7);
    }
    // the dark vertical streams from the gym-entrance photo
    g.fillStyle = '#2f2a27';
    for (const x0 of [40, 110, 190]) for (let y = 0; y < h; y += 8) g.fillRect(x0 + Math.sin(y / 30) * 14, y, 16, 7);
  }, { repeat: [3, 3] });
  return T;
}

// ── materials ──
export function makeMaterials(T) {
  const toon = (o = {}) => gbuffer(new THREE.MeshToonMaterial({ gradientMap: TOON, vertexColors: true, ...o }));
  const M = {
    flat: toon(),
    stucco: toon({ map: T.stucco }),
    glass: toon({ map: T.glass }),
    louver: toon({ map: T.louver }),
    roof: toon({ map: T.roof }),
    solar: toon({ map: T.solar }),
    metal: toon({ map: T.metal }),
    brick: toon({ map: T.brick }),
    mosaic: toon({ map: T.mosaic }),
    leaf: toon({ side: THREE.DoubleSide }),
    fence: toon({ map: T.chain, alphaTest: 0.5, side: THREE.DoubleSide }),
    soft: gbuffer(new THREE.MeshToonMaterial({ gradientMap: SOFT, vertexColors: true })),
  };
  M.fence.userData.noCast = true;
  return M;
}

// An unlit textured plane material for signs and lettering.
// It writes the wall's own normal to the G-buffer, so the ink pass sees one
// continuous wall and never outlines the plane's rectangle.
export function decalMat(tex, { transparent = true } = {}) {
  const m = new THREE.MeshToonMaterial({ map: tex, gradientMap: TOON, transparent, alphaTest: transparent ? 0.35 : 0 });
  m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
  return gbuffer(m);
}
