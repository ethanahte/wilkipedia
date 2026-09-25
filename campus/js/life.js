// What moves: the sky and its drifting cumulus, a few birds, the flags on the
// front flagpole, and students walking across the quad.

import * as THREE from 'three';
import { World, color, rng } from './geo.js';
import { gbuffer, SOFT, TOON, canvasTex } from './toon.js';
import { FRONT, QUAD } from './layout.js';
import { resolve, heightAt } from './collide.js';

export const SUN = new THREE.Vector3(-0.62, 0.52, 0.58).normalize();   // afternoon sun, low in the south-west
export const HORIZON = new THREE.Color('#cfe2ef');

// ── sky dome ──
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: SUN } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `layout(location = 1) out highp vec4 gNormalDepth;
      uniform vec3 sun; varying vec3 vDir;
      vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
      void main(){
        float h = clamp(vDir.y, -0.1, 1.0);
        vec3 zen = toLin(vec3(0.20,0.50,0.86)), mid = toLin(vec3(0.45,0.70,0.93)), hor = toLin(vec3(0.83,0.90,0.95));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, zen, smoothstep(0.22, 0.85, h));
        float s = max(dot(normalize(vDir), sun), 0.0);
        c += toLin(vec3(1.0,0.93,0.78)) * (pow(s, 12.0) * 0.35 + pow(s, 600.0) * 3.0);
        gl_FragColor = vec4(c, 1.0);
        gNormalDepth = vec4(0.5, 0.5, 1.0, 5000.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2500, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ── clouds: flat-shaded cumulus, drifting east ──
export function makeClouds(n = 16) {
  const R = rng(5);
  const group = new THREE.Group();
  const mat = gbuffer(new THREE.MeshToonMaterial({ gradientMap: SOFT, vertexColors: true }));
  const white = color('#ffffff'), shade = color('#dfe8f3');
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

// ── students walking round the quad ──
export function makeStudents(n = 18) {
  const R = rng(31);
  const group = new THREE.Group();
  const mat = gbuffer(new THREE.MeshToonMaterial({ gradientMap: TOON }));
  const parts = {
    legs: new THREE.BoxGeometry(0.15, 0.82, 0.17).translate(0, -0.41, 0),
    torso: new THREE.BoxGeometry(0.44, 0.6, 0.26).translate(0, 0.3, 0),
    head: new THREE.SphereGeometry(0.13, 10, 8),
    hair: new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.8),
    pack: new THREE.BoxGeometry(0.34, 0.42, 0.16),
  };
  const counts = { legs: n * 2, torso: n, head: n, hair: n, pack: n };
  const im = {};
  for (const k of Object.keys(parts)) {
    im[k] = new THREE.InstancedMesh(parts[k], mat, counts[k]);
    im[k].castShadow = true; im[k].frustumCulled = false;
    group.add(im[k]);
  }
  const shirts = ['#e3b23c', '#2f3b52', '#f4f4f0', '#c9473d', '#3f7fb5', '#4f8a5b', '#8c5aa6', '#141414', '#e87f3a'].map(color);
  const skins = ['#f1c9a5', '#d9a47a', '#a8744f', '#7a5236', '#e8b890'].map(color);
  const hairs = ['#1c1a18', '#3b2a1d', '#5a3b24', '#111'].map(color);
  const pants = ['#2c3446', '#4a4f57', '#1d2230', '#6d5c47', '#2f4c6e'].map(color);
  const packs = ['#222', '#6b2f3a', '#2f5d8a', '#3f6d44', '#d2a236'].map(color);
  const walkers = [];
  const spot = () => {
    for (let k = 0; k < 40; k++) {
      const x = QUAD.x0 + 4 + R() * (QUAD.x1 - QUAD.x0 - 8), z = QUAD.z0 + 3 + R() * (QUAD.z1 - QUAD.z0 - 6);
      const p = { x, z };
      resolve(p, 0.4);
      if (Math.hypot(p.x - x, p.z - z) < 0.01 && heightAt(x, z) < 0.1) return [x, z];
    }
    return [0, -12];
  };
  for (let i = 0; i < n; i++) {
    const [x, z] = spot(), [tx, tz] = spot();
    walkers.push({ x, z, tx, tz, speed: 1.1 + R() * 0.5, phase: R() * 6, pause: 0, h: 0.92 + R() * 0.14 });
    im.torso.setColorAt(i, shirts[i % shirts.length]);
    im.head.setColorAt(i, skins[(i * 3) % skins.length]);
    im.hair.setColorAt(i, hairs[i % hairs.length]);
    im.pack.setColorAt(i, packs[(i * 2) % packs.length]);
    im.legs.setColorAt(i * 2, pants[i % pants.length]); im.legs.setColorAt(i * 2 + 1, pants[i % pants.length]);
  }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const put = (mesh, idx, x, y, z, yaw, pitch = 0, s = 1) => {
    E.set(pitch, yaw, 0, 'YXZ'); Q.setFromEuler(E); S.setScalar(s); P.set(x, y, z);
    mesh.setMatrixAt(idx, M.compose(P, Q, S));
  };
  group.userData.update = (dt, t) => {
    walkers.forEach((w, i) => {
      let moving = false;
      if (w.pause > 0) w.pause -= dt;
      else {
        const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
        if (d < 0.6) { [w.tx, w.tz] = spot(); w.pause = R() < 0.4 ? 1 + R() * 4 : 0; }
        else {
          const ox = w.x, oz = w.z;
          w.x += (dx / d) * w.speed * dt; w.z += (dz / d) * w.speed * dt;
          resolve(w, 0.35);
          // stuck against something: pick somewhere else
          if (Math.hypot(w.x - ox, w.z - oz) < w.speed * dt * 0.3) [w.tx, w.tz] = spot();
          w.yaw = Math.atan2(dx, dz);
          moving = true;
        }
      }
      const s = w.h, swing = moving ? Math.sin(t * 7.5 + w.phase) * 0.55 : 0, bob = moving ? Math.abs(Math.sin(t * 7.5 + w.phase)) * 0.04 : 0;
      const yaw = w.yaw || 0, hip = 0.86 * s + bob;
      const sx = Math.cos(yaw) * 0.1, sz = -Math.sin(yaw) * 0.1;
      put(im.legs, i * 2, w.x + sx, hip, w.z + sz, yaw, swing, s);
      put(im.legs, i * 2 + 1, w.x - sx, hip, w.z - sz, yaw, -swing, s);
      put(im.torso, i, w.x, hip, w.z, yaw, 0, s);
      put(im.head, i, w.x, hip + 0.78 * s, w.z, yaw, 0, s);
      put(im.hair, i, w.x - Math.sin(yaw) * 0.02, hip + 0.8 * s, w.z - Math.cos(yaw) * 0.02, yaw, -0.2, s);
      put(im.pack, i, w.x - Math.sin(yaw) * 0.22 * s, hip + 0.33 * s, w.z - Math.cos(yaw) * 0.22 * s, yaw, 0, s);
    });
    for (const k of Object.keys(im)) im[k].instanceMatrix.needsUpdate = true;
  };
  return group;
}
