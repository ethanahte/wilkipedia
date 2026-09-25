// What moves, and the sky: a painted sky with streaks of cirrus and the real
// mountains on the horizon, drifting cumulus, a few birds, the flags on the
// front flagpole, and leaves and crape-myrtle petals drifting down near you.

import * as THREE from 'three';
import { World, color, rng } from './geo.js';
import { gbuffer, SOFT, TOON, canvasTex } from './toon.js';
import { FRONT, STAGE } from './layout.js';

export const SUN = new THREE.Vector3(-0.62, 0.55, 0.56).normalize();   // afternoon sun, low in the south-west
export const HORIZON = new THREE.Color('#dde8f3');

// ── sky dome ──
// A vertical gradient painted like an anime background: deep blue overhead,
// pale and hazy at the horizon, with streaks of cirrus drawn by noise, and
// the ranges you really see from Wilcox: the Santa Cruz Mountains to the
// south-west, the Diablo Range (Mt Hamilton) to the east, almost nothing
// north over the bay. They sit in the haze as flat blue-violet shapes.
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: SUN }, time: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `layout(location = 1) out highp vec4 gNormalDepth;
      uniform vec3 sun; uniform float time; varying vec3 vDir;
      vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + 1.0), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      float bump(float a, float c, float w){ float d = abs(mod(a - c + 3.14159, 6.28318) - 3.14159); return exp(-d * d / (w * w)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 zen = toLin(vec3(0.22, 0.49, 0.88)), mid = toLin(vec3(0.53, 0.73, 0.95)), hor = toLin(vec3(0.87, 0.91, 0.95));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
        c = mix(c, zen, smoothstep(0.2, 0.9, h));
        // cirrus: long wisps, projected onto a high flat layer and stretched
        vec2 uv = d.xz / max(d.y, 0.04);
        uv = mat2(0.87, -0.5, 0.5, 0.87) * uv;
        float w = fbm(vec2(uv.x * 0.9, uv.y * 3.6) + vec2(time * 0.004, 0.0));
        w = smoothstep(0.52, 0.86, w) * smoothstep(0.02, 0.22, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
        c = mix(c, toLin(vec3(0.98, 0.99, 1.0)), w * 0.8);
        // the sun: a soft warm glow and a small bright disc
        float s = max(dot(d, sun), 0.0);
        c += toLin(vec3(1.0, 0.94, 0.8)) * (pow(s, 10.0) * 0.28 + pow(s, 900.0) * 3.0);
        // mountains
        float az = atan(d.z, d.x);
        float ridge = 0.042 * bump(az, 2.35, 0.75) + 0.028 * bump(az, 0.45, 0.8) + 0.018 * bump(az, -0.5, 0.5) + 0.004;
        ridge *= 0.7 + fbm(vec2(az * 7.0, 1.3)) * 0.6;
        ridge += (fbm(vec2(az * 28.0, 4.0)) - 0.5) * 0.004;
        float e = asin(clamp(d.y, -1.0, 1.0));
        if (e < ridge && e > -0.02) {
          float t = clamp(e / max(ridge, 1e-3), 0.0, 1.0);
          vec3 far = toLin(vec3(0.62, 0.69, 0.84)), near = toLin(vec3(0.78, 0.83, 0.91));
          c = mix(near, far, t * 0.8 + 0.1);
        }
        gl_FragColor = vec4(c, 1.0);
        gNormalDepth = vec4(0.5, 0.5, 1.0, 5000.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  m.userData.update = (dt) => { mat.uniforms.time.value += dt; };
  return m;
}

// ── clouds: flat-shaded cumulus, drifting east ──
export function makeClouds(n = 16) {
  const R = rng(5);
  const group = new THREE.Group();
  const mat = gbuffer(new THREE.MeshToonMaterial({ gradientMap: SOFT, vertexColors: true, fog: false }), { ink: 'sky', paint: false });
  const white = color('#ffffff'), shade = color('#d9e1f2');
  for (let i = 0; i < n; i++) {
    const W = new World();
    const k = 14 + R() * 26;
    const parts = 6 + Math.floor(R() * 7);
    for (let j = 0; j < parts; j++) {
      const t = j / parts, x = (t - 0.5) * k * 2.4 + (R() - 0.5) * k * 0.4, r = k * (0.55 + Math.sin(t * Math.PI) * 0.6 + R() * 0.2);
      W.blob('c', x, r * 0.35, (R() - 0.5) * k * 0.6, r, r * 0.72, r * 0.8, j % 3 ? white : shade, 2);
    }
    // flat base
    W.blob('c', 0, 0, 0, k * 1.8, k * 0.25, k * 0.9, shade, 1);
    const g = new THREE.Group();
    W.build({ c: mat }, g, { shadows: false });
    const a = R() * Math.PI * 2, d = 350 + R() * 900;
    g.position.set(Math.cos(a) * d, 170 + R() * 160, Math.sin(a) * d);
    g.userData.speed = 1.2 + R() * 1.6;
    group.add(g);
  }
  group.userData.update = (dt) => {
    for (const c of group.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1300) c.position.x = -1300;
    }
  };
  return group;
}

// ── birds ──
export function makeBirds(n = 7) {
  const R = rng(8);
  const group = new THREE.Group();
  const mat = gbuffer(new THREE.MeshToonMaterial({ color: '#3a3d45', gradientMap: TOON, side: THREE.DoubleSide }));
  const wingGeo = new THREE.BufferGeometry();
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.18, 0.95, 0, 0.05], 3));
  wingGeo.computeVertexNormals();
  const bodyGeo = new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.8, 2.2);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bodyGeo, mat));
    const l = new THREE.Mesh(wingGeo, mat), r = new THREE.Mesh(wingGeo, mat);
    r.scale.x = -1;
    b.add(l, r);
    b.userData = { l, r, phase: R() * 6, speed: 9 + R() * 5, dir: R() * Math.PI * 2 };
    reset(b, R, true);
    group.add(b);
  }
  function reset(b, R, first) {
    const a = R() * Math.PI * 2;
    b.userData.dir = a + Math.PI + (R() - 0.5) * 0.8;
    const d = first ? R() * 250 : 320;
    b.position.set(Math.cos(a) * d, 35 + R() * 45, Math.sin(a) * d);
    b.rotation.y = -b.userData.dir + Math.PI / 2;
    b.scale.setScalar(1.6);
  }
  group.userData.update = (dt, t) => {
    for (const b of group.children) {
      const u = b.userData;
      b.position.x += Math.cos(u.dir) * u.speed * dt;
      b.position.z += Math.sin(u.dir) * u.speed * dt;
      b.position.y += Math.sin(t * 0.7 + u.phase) * 0.02;
      const f = Math.sin(t * 9 + u.phase) * 0.6;
      u.l.rotation.z = f; u.r.rotation.z = -f;
      if (b.position.length() > 420) reset(b, R, false);
    }
  };
  return group;
}

// ── flags on the front flagpole ──
function usFlag() {
  return canvasTex(512, 270, (g, w, h) => {
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#b3202f'; g.fillRect(0, (i * h) / 13, w, h / 13 + 1); }
    g.fillStyle = '#2b3a6b'; g.fillRect(0, 0, w * 0.4, (h * 7) / 13);
    g.fillStyle = '#fff';
    for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) {
      g.beginPath(); g.arc(12 + c * 34 + (r % 2 ? 17 : 0), 10 + r * 15.5, 3.4, 0, 7); g.fill();
    }
  });
}
function caFlag() {
  return canvasTex(512, 300, (g, w, h) => {
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b3202f'; g.fillRect(0, h * 0.82, w, h * 0.18);
    // star
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 26; g.lineTo(52 + Math.cos(a) * r, 46 + Math.sin(a) * r); }
    g.fill();
    // the bear, as a simple silhouette
    g.fillStyle = '#6b4a2e';
    g.beginPath(); g.ellipse(w / 2, h * 0.47, 120, 52, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(w / 2 + 128, h * 0.42, 38, 30, 0, 0, 7); g.fill();
    for (const x of [-80, -40, 50, 95]) g.fillRect(w / 2 + x, h * 0.55, 22, 42);
    g.fillStyle = '#5d8a3a'; g.fillRect(w / 2 - 170, h * 0.68, 340, 8);
    g.fillStyle = '#6b4a2e'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center';
    g.fillText('CALIFORNIA REPUBLIC', w / 2, h * 0.78);
  });
}

export function makeFlags() {
  const group = new THREE.Group();
  const [fx, fz] = FRONT.flag;
  const flags = [];
  for (const [tex, top, w, h] of [[usFlag(), 11.85, 2.6, 1.37], [caFlag(), 10.2, 2.3, 1.35]]) {
    const geo = new THREE.PlaneGeometry(w, h, 16, 6).translate(w / 2, -h / 2, 0);
    const mat = gbuffer(new THREE.MeshToonMaterial({ map: tex, gradientMap: SOFT, side: THREE.DoubleSide }));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(fx + 0.1, top, fz);
    m.rotation.y = -0.9;       // blowing roughly east-south-east
    m.castShadow = true;
    m.userData.base = geo.attributes.position.array.slice();
    flags.push(m); group.add(m);
  }
  group.userData.update = (dt, t) => {
    for (const m of flags) {
      const p = m.geometry.attributes.position, b = m.userData.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1];
        const k = x / 2.5;
        p.array[i * 3 + 2] = Math.sin(x * 2.4 - t * 5.5 + y * 0.6) * 0.22 * k + Math.sin(x * 5 - t * 8) * 0.05 * k;
        p.array[i * 3 + 1] = y - k * k * 0.12;
      }
      p.needsUpdate = true;
      m.geometry.computeVertexNormals();
    }
  };
  return group;
}


// ── drifting leaves (and pink crape-myrtle petals near the stage) ──
export function makeLeaves(n = 80) {
  let seed = 19; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // a small leaf shape (a pointed oval), not a square
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.045, 0, 0, 0, 0.022, 0, 0.045, 0, 0, -0.045, 0, 0, 0.045, 0, 0, 0, -0.022, 0], 3));
  geo.computeVertexNormals();
  const mat = gbuffer(new THREE.MeshToonMaterial({ gradientMap: SOFT, side: THREE.DoubleSide }), { ink: 'none', paint: false });
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.frustumCulled = false;
  const leafCols = ['#8db84f', '#a9c35a', '#c9b562', '#6f9f45'].map(color), pinks = ['#f0a7c3', '#e889ae', '#f6c2d6'].map(color);
  const P = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
  const spawn = (p, cam, first) => {
    const a = R() * Math.PI * 2, d = 2 + R() * 22;
    p.x = cam.x + Math.cos(a) * d; p.z = cam.z + Math.sin(a) * d;
    p.y = first ? cam.y - 1 + R() * 9 : cam.y + 4 + R() * 7;
    p.vy = 0.5 + R() * 0.5; p.ph = R() * 6; p.spin = 1 + R() * 3;
    const nearStage = Math.hypot(p.x - STAGE.x, p.z - STAGE.z) < 22;
    im.setColorAt(p.i, nearStage && R() < 0.75 ? pinks[Math.floor(R() * 3)] : leafCols[Math.floor(R() * 4)]);
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  };
  for (let i = 0; i < n; i++) P.push({ i });
  let started = false;
  im.userData.update = (dt, t, cam, show) => {
    im.visible = show;
    if (!show) return;
    if (!started) { P.forEach((p) => spawn(p, cam, true)); started = true; }
    for (const p of P) {
      p.y -= p.vy * dt;
      p.x += Math.sin(t * 1.3 + p.ph) * 0.35 * dt + 0.25 * dt;
      p.z += Math.cos(t * 0.9 + p.ph) * 0.3 * dt;
      if (p.y < 0.02 || Math.hypot(p.x - cam.x, p.z - cam.z) > 26) spawn(p, cam, false);
      E.set(t * p.spin + p.ph, t * p.spin * 0.7, p.ph);
      M.compose(V.set(p.x, p.y, p.z), Q.setFromEuler(E), S);
      im.setMatrixAt(p.i, M);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  return im;
}
