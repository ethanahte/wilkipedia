// What moves, and the sky: a painted anime sky with streaks of cirrus and a
// warm glow toward the sun, drifting two-tone cumulus, a few birds, the flags on
// the front flagpole, leaves and crape-myrtle petals drifting down near you,
// and at night the lamps' light cones hanging in the air.

import * as THREE from 'three';
import { World, color, rng } from './geo.js';
import { gbuffer, SOFT, TOON, canvasTex } from './toon.js';
import { FRONT, STAGE } from './layout.js';

export const SUN = new THREE.Vector3(-0.66, 0.37, 0.66).normalize();   // golden-afternoon sun, ~22° up in the south-west
export const HORIZON = new THREE.Color('#dde8f3');

// ── sky dome ──
// A vertical gradient painted like an anime background: deep saturated blue
// overhead, pale at the horizon and warm gold on the sun's side, with streaks
// of cirrus drawn by noise and a big soft halo round the sun. (No mountains:
// the owner asked for an open horizon.)
export function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sun: { value: SUN }, time: { value: 0 }, night: { value: 0 }, overcast: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `layout(location = 1) out highp vec4 gNormalDepth;
      uniform vec3 sun; uniform float time, night, overcast; varying vec3 vDir;
      vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + 1.0), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 zen = toLin(vec3(0.13, 0.40, 0.86)), mid = toLin(vec3(0.40, 0.67, 0.97)), hor = toLin(vec3(0.84, 0.91, 0.98));
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.24, h));
        c = mix(c, zen, smoothstep(0.24, 0.95, h));
        // the sun's side of the sky is warmer and brighter low down
        float s = max(dot(d, sun), 0.0);
        vec2 dh = normalize(d.xz + 1e-4), sh = normalize(sun.xz);
        float side = pow(max(dot(dh, sh), 0.0), 2.5) * (1.0 - smoothstep(0.0, 0.45, h));
        c = mix(c, toLin(vec3(1.0, 0.86, 0.64)), side * 0.6);
        // cirrus: long wisps, projected onto a high flat layer and stretched
        vec2 uv = d.xz / max(d.y, 0.04);
        uv = mat2(0.87, -0.5, 0.5, 0.87) * uv;
        float w = fbm(vec2(uv.x * 0.9, uv.y * 3.6) + vec2(time * 0.004, 0.0));
        w = smoothstep(0.52, 0.86, w) * smoothstep(0.02, 0.22, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
        c = mix(c, mix(toLin(vec3(0.98, 0.99, 1.0)), toLin(vec3(1.0, 0.9, 0.74)), side), w * 0.8);
        // the sun: a wide warm halo, a tighter glow and a small white disc
        c += toLin(vec3(1.0, 0.9, 0.72)) * (pow(s, 6.0) * 0.2 + pow(s, 60.0) * 0.45 + pow(s, 1400.0) * 6.0);
        float e = asin(clamp(d.y, -1.0, 1.0));
        // rain by day: a flat grey overcast
        c = mix(c, mix(toLin(vec3(0.72, 0.76, 0.8)), toLin(vec3(0.55, 0.6, 0.66)), smoothstep(0.0, 0.8, h)), overcast * (1.0 - night) * 0.85);
        // night: deep navy, stars, a moon glow
        if (night > 0.0) {
          vec3 nz = toLin(vec3(0.02, 0.035, 0.09)), nh = toLin(vec3(0.09, 0.12, 0.2));
          vec3 nc = mix(nh, nz, smoothstep(0.0, 0.5, h));
          vec2 sg = floor(vec2(atan(d.z, d.x) * 160.0, d.y * 160.0));
          float st = step(0.9965, hash(sg)) * smoothstep(0.05, 0.3, d.y) * (1.0 - overcast);
          nc += vec3(0.9, 0.92, 1.0) * st * (0.5 + 0.5 * sin(time * 2.0 + hash(sg + 3.0) * 30.0));
          nc += toLin(vec3(0.55, 0.62, 0.8)) * pow(max(dot(d, normalize(vec3(0.5, 0.6, -0.4))), 0.0), 60.0) * 0.5 * (1.0 - overcast);
          nc = mix(nc, toLin(vec3(0.07, 0.08, 0.12)), overcast * 0.85);
          c = mix(c, nc, night);
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

// ── clouds: anime cumulus, drifting east ──
// Two tones only, like cel animation: bright white where the sun hits and a
// lavender shade underneath (a stepped ramp that never goes dark). Every few
// clouds is a tall towering one. They count as far-away sky for the outlines,
// but NOT as open sky for the sunbeams, so light shafts fall between them.
const CLOUD_RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([150, 150, 150, 170, 255, 255, 255, 255]), 8, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
export function makeClouds(n = 16) {
  const R = rng(5);
  const group = new THREE.Group();
  const mat = gbuffer(new THREE.MeshToonMaterial({ gradientMap: CLOUD_RAMP, vertexColors: true, fog: false }), { ink: 'cloud', paint: false });
  // a touch cool, so the warm afternoon sun lights them white rather than yellow
  const white = color('#eef2ff'), shade = color('#d4dbf5'), base = color('#bcc5e8');
  for (let i = 0; i < n; i++) {
    const W = new World();
    const k = 38 + R() * 46;               // big: they sit a kilometre out
    const tall = i % 4 === 0;
    // a cauliflower: puffs heaped on a dome, biggest in the middle, on a flat base
    const puffs = 16 + Math.floor(R() * 10);
    for (let j = 0; j < puffs; j++) {
      const u = R() * 2 - 1, v = R() * 2 - 1;
      const dome = Math.max(0, 1 - u * u);
      const x = u * k * 1.7, z = v * k * 0.75;
      const r = k * (0.32 + dome * 0.38 + R() * 0.12);
      const y = dome * k * (tall ? 1.4 : 0.75) + R() * k * 0.2;
      W.blob('c', x, y, z, r, r * 0.86, r * 0.92, j % 4 ? white : shade, 2);
    }
    if (tall) {                            // a towering one: puffs stacked up the middle
      for (let j = 0; j < 6; j++) {
        const r = k * (0.85 - j * 0.09);
        W.blob('c', (R() - 0.5) * k * 0.5, k * (1.3 + j * 0.55), (R() - 0.5) * k * 0.4, r, r * 0.82, r * 0.88, white, 2);
      }
    }
    // flat base
    W.blob('c', 0, 0, 0, k * 1.9, k * 0.22, k * 0.95, base, 1);
    const g = new THREE.Group();
    W.build({ c: mat }, g, { shadows: false });
    const a = R() * Math.PI * 2, d = 760 + R() * 700;    // out by the horizon, clear of the aerial view
    g.position.set(Math.cos(a) * d, 150 + R() * 150, Math.sin(a) * d);
    g.userData.speed = 1.2 + R() * 1.6;
    group.add(g);
  }
  group.userData.update = (dt) => {
    for (const c of group.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1500) c.position.x = -1500;
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

// ── rain ──
// Streaks falling in a box that follows the camera, animated entirely on the
// GPU. They write nothing to the normal/depth target (additive), so the ink
// pass never outlines raindrops.
const ADD_OUT = 'layout(location = 1) out highp vec4 gNormalDepth;\n';
export function makeRain(n = 9000) {
  const pos = new Float32Array(n * 2 * 3), seed = new Float32Array(n * 2);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = r(), y = r(), z = r();
    for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); seed[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('tip', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, size: { value: new THREE.Vector3(70, 40, 70) }, bright: { value: 0.35 } },
    vertexShader: `attribute float tip; uniform float time; uniform vec3 center, size; varying float vA;
      void main(){
        vec3 p = position;
        float fall = time * 0.55 + p.x * 3.1;              // 22 m/s at size.y = 40
        p.y = fract(p.y - fall);
        // each drop keeps its place in the world; the box just shows the ones near you
        vec3 w;
        w.xz = center.xz + mod(p.xz * size.xz - center.xz, size.xz) - size.xz * 0.5;
        w.y = center.y + (p.y - 0.5) * size.y;
        w += tip * vec3(0.08, 0.9, 0.03);                  // streak length, slanted by the wind
        vA = 1.0 - tip * 0.7;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: ADD_OUT + `uniform float bright; varying float vA;
      void main(){ gl_FragColor = vec4(vec3(0.62, 0.7, 0.85) * bright * vA, 1.0); gNormalDepth = vec4(0.0); }`,
  });
  const m = new THREE.LineSegments(g, mat);
  m.frustumCulled = false;
  m.userData.update = (dt, cam, show, fly) => {
    m.visible = show;
    if (!show) return;
    mat.uniforms.time.value += dt;
    const sz = fly ? [260, 160, 260] : [70, 40, 70];
    mat.uniforms.size.value.set(...sz);
    mat.uniforms.center.value.set(cam.x, fly ? cam.y * 0.5 : cam.y + 6, cam.z);
    mat.uniforms.bright.value = fly ? 0.2 : 0.28;
  };
  return m;
}

// ── ripples where the drops land, near you ──
export function makeRipples(n = 160) {
  const g = new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2);
  const off = new Float32Array(n * 3);
  let s = 5; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) off.set([r(), r(), r()], i * 3);
  const ig = new THREE.InstancedBufferGeometry().copy(g);
  ig.instanceCount = n;
  ig.setAttribute('seed', new THREE.InstancedBufferAttribute(off, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() } },
    vertexShader: `attribute vec3 seed; uniform float time; uniform vec3 center; varying float vA;
      void main(){
        float t = fract(time * 0.9 + seed.z);
        float cyc = floor(time * 0.9 + seed.z);
        vec2 j = fract(vec2(sin(cyc * 12.9 + seed.x * 78.2), sin(cyc * 4.1 + seed.y * 31.7)) * 43758.5);
        vec2 p = center.xz + (j - 0.5) * 36.0;
        vec3 w = vec3(p.x, 0.035, p.y) + vec3(position.x, 0.0, position.z) * (0.05 + t * 0.35);
        vA = (1.0 - t) * 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: ADD_OUT + `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.6, 0.66, 0.78) * vA, 1.0); gNormalDepth = vec4(0.0); }`,
  });
  const m = new THREE.Mesh(ig, mat);
  m.frustumCulled = false;
  m.userData.update = (dt, cam, show) => {
    m.visible = show; if (!show) return;
    mat.uniforms.time.value += dt;
    mat.uniforms.center.value.copy(cam);
  };
  return m;
}

// ── warm pools of light on the ground under every lamp, at night ──
export function makeLightPools(lights) {
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const ig = new THREE.InstancedBufferGeometry().copy(g);
  ig.instanceCount = lights.length;
  const data = new Float32Array(lights.length * 4);
  lights.forEach(([x, z, h, r], i) => data.set([x, z, r, h], i * 4));
  ig.setAttribute('light', new THREE.InstancedBufferAttribute(data, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { strength: { value: 0 } },
    vertexShader: `attribute vec4 light; varying vec2 vUv; varying float vH;
      void main(){ vUv = position.xz; vH = light.w; vec3 w = vec3(light.x, 0.04, light.y) + vec3(position.x, 0.0, position.z) * light.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
    fragmentShader: ADD_OUT + `uniform float strength; varying vec2 vUv; varying float vH;
      void main(){ float d = length(vUv); float a = pow(max(0.0, 1.0 - d), 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * a * strength * (0.6 + vH * 0.05), 1.0); gNormalDepth = vec4(0.0); }`,
  });
  const m = new THREE.Mesh(ig, mat);
  m.frustumCulled = false;
  m.userData.set = (k) => { mat.uniforms.strength.value = k; m.visible = k > 0; };
  m.userData.set(0);
  return m;
}

// ── the lamps' light cones at night (the Tyndall effect in misty, rainy air) ──
// One soft cone of light under every lamp in lights.js, brightest along its
// axis and near the lamp, fading to nothing at the ground and at its edges.
export function makeLightCones(lights) {
  const g = new THREE.CylinderGeometry(0.18, 1, 1, 24, 1, true).translate(0, -0.5, 0);   // top at the lamp, unit height and radius
  const ig = new THREE.InstancedBufferGeometry().copy(g);
  ig.instanceCount = lights.length;
  const data = new Float32Array(lights.length * 4);
  lights.forEach(([x, z, h, r], i) => data.set([x, z, h - 0.35, r * 0.42], i * 4));
  ig.setAttribute('light', new THREE.InstancedBufferAttribute(data, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { strength: { value: 0 } },
    vertexShader: `attribute vec4 light; varying float vT; varying vec3 vN, vV;
      void main(){
        vec3 w = vec3(light.x, light.z, light.y) + vec3(position.x * light.w, position.y * light.z, position.z * light.w);
        vT = -position.y;                                   // 0 at the lamp, 1 at the ground
        vN = normalize(mat3(viewMatrix) * normalize(vec3(position.x, 0.35, position.z)));
        vec4 mv = viewMatrix * vec4(w, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: ADD_OUT + `uniform float strength; varying float vT; varying vec3 vN, vV;
      void main(){
        float face = pow(abs(dot(normalize(vN), normalize(vV))), 3.0);   // thicker through the middle, soft at the edges
        float a = face * pow(1.0 - vT, 2.2) * smoothstep(0.0, 0.08, vT);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * strength, 1.0);
        gNormalDepth = vec4(0.0);
      }`,
  });
  const m = new THREE.Mesh(ig, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  m.userData.set = (k) => { mat.uniforms.strength.value = k; m.visible = k > 0; };
  m.userData.set(0);
  return m;
}
