// Wilcox campus in 3D, drawn like an illustration (三渲二).
//
// Boot: renderer → textures and materials → ground → buildings → landmarks →
// quad → props → life → room plates → merge everything into a few hundred
// meshes → first frame. Each step updates the loading bar.
//
// For the wiki:
//   ?room=B107              lands you in front of room B107
//   ?view=aerial            starts in the air
//   window.WilcoxCampus.onRoomSelect = (id) => {…}   replaces the default room card
//   window.WilcoxCampus.goToRoom('R204')

import * as THREE from 'three';
import { World, distToLine, inPoly } from './geo.js';
import { makeTextures, makeMaterials, setAniso, setHardLight, SUN_VIEW, DAY as DAYLIGHT, PIXEL } from './toon.js';
import { buildGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildQuad } from './quad.js';
import { buildProps } from './props.js';
import { makeSky, makeClouds, makeBirds, makeFlags, makeLeaves, makeRain, makeRipples, makeLightPools, makeLightCones, SUN, HORIZON } from './life.js';
import { LIGHTS } from './lights.js';
import { Controls } from './controls.js';
import { loadRooms, rooms, byId, makeHighlight, placeHighlight, standFor } from './rooms.js';
import { Post } from './post.js';
import { Hud } from './hud.js';
import { FRONT, BUILDINGS, QUAD, TRACK, FIELDS, CREEK, ROADS, CAMPUS } from './layout.js';

const ROOT = document.body.dataset.root || '../';
const QKEY = 'wilcox-campus-quality';
const params = new URLSearchParams(location.search);
const hud = new Hud(document.body);

function autoQuality() {
  try { const q = localStorage.getItem(QKEY); if (q) return q; } catch { /* storage off */ }
  const phone = matchMedia('(pointer: coarse)').matches;
  if (phone) return (navigator.hardwareConcurrency || 4) >= 8 ? 'medium' : 'low';
  return 'high';
}
const DPR = { high: 2, medium: 1.5, low: 1 };
const SHADOW = { high: 2048, medium: 1024, low: 0 };

// Let the loading bar paint between steps (with a timer fallback: background tabs don't run rAF).
const tick = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 60); });

async function boot() {
  const canvas = document.getElementById('view');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (e) { hud.fail(e); return; }
  renderer.setClearColor(HORIZON);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  setAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  let quality = autoQuality();

  const scene = new THREE.Scene();
  // haze: distance melts into the pale horizon, as in a painted background
  scene.fog = new THREE.FogExp2(HORIZON, 0.0021);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 7000);   // far: the aerial long lens sits ~2 km out

  // light: sky + ground bounce, and one warm afternoon sun that follows you with its shadows
  // warm sun; the sky light is a lavender blue, which is the colour every shadow takes on
  const hemi = new THREE.HemisphereLight('#a9bdf0', '#d8c7a6', 1.85);
  const sun = new THREE.DirectionalLight('#fff0d4', 2.3);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
  scene.add(hemi, sun, sun.target);
  // at night, the eight lamps nearest to where you're looking light up what's around them
  const lamps = Array.from({ length: 8 }, () => { const l = new THREE.PointLight('#ffc98a', 0, 16, 2); scene.add(l); return l; });

  const post = new Post(renderer);
  const applyQuality = (q, { save = true } = {}) => {
    quality = q;
    if (save) { try { localStorage.setItem(QKEY, q); } catch { /* ok */ } }
    const dpr = Math.min(DPR[q], devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = SHADOW[q] > 0;
    sun.castShadow = SHADOW[q] > 0;
    if (SHADOW[q]) { sun.shadow.mapSize.set(SHADOW[q], SHADOW[q]); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    post.quality = q;
    post.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight), dpr);
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    hud.setQuality(q);
  };

  // ── build the world, step by step ──
  const steps = [];
  const W = new World();
  let T, M;
  const fontFamily = 'Newsreader';
  steps.push(['Mixing the paint', async () => {
    try { await document.fonts.load('600 64px Newsreader'); } catch { /* fall back to Georgia */ }
    T = makeTextures(); M = makeMaterials(T);
  }]);
  let groundMeshes = [];
  steps.push(['Pouring the concrete', () => {
    const before = scene.children.length;
    buildGround(scene, quality === 'low' ? 0.6 : 1);
    groundMeshes = scene.children.slice(before);
  }]);
  steps.push(['Raising the buildings', () => buildBuildings(W)]);
  const decals = new THREE.Group(); scene.add(decals);
  steps.push(['Hanging the signs', () => buildLandmarks(W, decals, fontFamily)]);
  steps.push(['Planting the cedar', () => buildQuad(W)]);
  steps.push(['Filling in the neighbourhood', () => buildProps(W, scene, quality, M)]);
  let sky, clouds, birds, flags, leaves, rain, ripples, pools, cones;
  steps.push(['Letting the clouds in', () => {
    sky = makeSky(); scene.add(sky);
    clouds = makeClouds(quality === 'low' ? 9 : 16); scene.add(clouds);
    birds = makeBirds(); scene.add(birds);
    flags = makeFlags(); scene.add(flags);
    leaves = makeLeaves(quality === 'low' ? 50 : 110); scene.add(leaves);
    rain = makeRain(quality === 'low' ? 4000 : 9000); scene.add(rain);
    ripples = makeRipples(); scene.add(ripples);
    pools = makeLightPools(LIGHTS); scene.add(pools);
    cones = makeLightCones(LIGHTS); scene.add(cones);
  }]);
  const roomsGroup = new THREE.Group(); scene.add(roomsGroup);
  steps.push(['Numbering the rooms', async () => { try { await loadRooms(`${ROOT}data/map.json`, roomsGroup); } catch (e) { console.warn('rooms', e); } }]);
  steps.push(['Merging it all', () => { const g = new THREE.Group(); W.build(M, g); scene.add(g); }]);

  try {
    for (let i = 0; i < steps.length; i++) {
      hud.progress(i / steps.length, steps[i][0] + '…');
      await tick();
      await steps[i][1]();
    }
  } catch (e) { console.error(e); hud.fail(e); return; }

  applyQuality(quality);
  const controls = new Controls(camera, canvas, groundMeshes);
  const highlight = makeHighlight(); scene.add(highlight);
  hud.drawMap();

  // ── time of day and weather ──
  // A golden after-school afternoon is the showcase (the anime slice-of-life
  // look, with sunbeams); night and rain are one key away. Only a choice the
  // viewer makes is saved (key v2: the old key saved every boot's default).
  const TKEY = 'wilcox-campus-sky2';
  let env = { night: false, rain: false };
  try { Object.assign(env, JSON.parse(localStorage.getItem(TKEY)) || {}); } catch { /* defaults */ }
  // soft pastel daylight: a peachy-pink sky fill (every shadow goes warm mauve) and a gentle sun
  const DAY = { hemi: ['#f0cfc4', '#e3cdb0', 2.35], sun: ['#fff0dc', 2.05], fog: '#f6dccb', density: 0.0022 };
  const NIGHT = { hemi: ['#34457a', '#0f121b', 0.95], sun: ['#aebfff', 0.6], fog: '#0a0f1c', density: 0.0034 };
  // the pixel style's daylight: a clear blue summer day, bright sun, hard shadows
  const PIXEL_DAY = { hemi: ['#d4ddef', '#dccfae', 1.75], sun: ['#fff4dc', 2.7], fog: '#86b1ea', density: 0.0015 };
  // Two looks: 'diorama' (the soft peach miniature) and 'pixel' (pixel art, like
  // Summerhouse). Remembered once the viewer picks one.
  const SKEY = 'wilcox-campus-style';
  let style = 'diorama';
  try { if (localStorage.getItem(SKEY) === 'pixel') style = 'pixel'; } catch { /* default */ }
  const CLOUD_TONES = {
    diorama: ['#fff4ec', '#f0d0c8', '#dcb0b0'],
    pixel: ['#ffffff', '#d9e5f8', '#a8bde4'],
  };
  const applyStyle = () => {
    const px = style === 'pixel';
    post.setPixel(px);
    PIXEL.value = px ? 1 : 0;
    setHardLight(px);
    sky.material.uniforms.pixel.value = px ? 1 : 0;
    const [l, m, d] = CLOUD_TONES[style];
    const cu = clouds.children[0]?.material.uniforms;
    if (cu) { cu.lit.value.set(l); cu.mid.value.set(m); cu.deep.value.set(d); }
    document.body.dataset.style = style;
    hud.setStyle(style);
  };
  const applyEnv = () => {
    const E = env.night ? NIGHT : style === 'pixel' ? PIXEL_DAY : DAY;
    hemi.color.set(E.hemi[0]); hemi.groundColor.set(E.hemi[1]); hemi.intensity = E.hemi[2];
    sun.color.set(E.sun[0]); sun.intensity = E.sun[1] * (env.rain ? 0.55 : 1);
    if (env.rain && !env.night) { hemi.intensity *= 0.8; }
    scene.fog.color.set(env.rain && !env.night ? '#c3ccd6' : E.fog);
    renderer.setClearColor(scene.fog.color);
    sky.material.uniforms.night.value = env.night ? 1 : 0;
    sky.material.uniforms.overcast.value = env.rain ? 1 : 0;
    clouds.visible = !env.rain;
    M.glass.emissiveIntensity = env.night ? 2.2 : 0;
    M.glow.color.setScalar(env.night ? 3 : 1);
    pools.userData.set(env.night ? 1 : 0);
    cones.userData.set(env.night ? (env.rain ? 0.26 : 0.12) : 0);
    DAYLIGHT.value = env.night ? 0 : env.rain ? 0.25 : 1;
    for (const g of groundMeshes) if (g.material.color) g.material.color.setScalar(env.rain ? 0.82 : 1);
    document.body.dataset.night = env.night ? '1' : '0';
    document.body.dataset.rain = env.rain ? '1' : '0';
    hud.setEnv(env);
  };
  const saveEnv = () => { try { localStorage.setItem(TKEY, JSON.stringify(env)); } catch { /* ok */ } };
  const toggleNight = () => { env.night = !env.night; applyEnv(); saveEnv(); };
  const toggleRain = () => { env.rain = !env.rain; applyEnv(); saveEnv(); };
  const toggleStyle = () => {
    style = style === 'pixel' ? 'diorama' : 'pixel';
    try { localStorage.setItem(SKEY, style); } catch { /* ok */ }
    applyStyle(); applyEnv();
  };

  // start: the campus as a diorama, turning slowly; ?room= or Walk takes you in
  const [fx, fz] = FRONT.flag;
  controls.setWalk(fx + 1.5, fz - 2.2, 0.35 + Math.PI, 0);
  controls.yaw = Math.PI - 0.25;
  controls.mode = 'fly';
  Object.assign(controls.orbit, { tx: 75, tz: 78, dist: 440, el: 0.6, az: 0.75 });
  controls.autoRotate = true;
  controls.onModeChange = (m) => { hud.setMode(m); if (m !== 'walk') hud.tip(null); };
  hud.setMode('fly');

  // ── rooms: hover, click, ?room= ──
  const roomHref = (id) => `${ROOT}map/#${encodeURIComponent(id)}`;
  const api = window.WilcoxCampus = window.WilcoxCampus || {};
  let booted = false;
  const selectRoom = (r) => {
    if (typeof api.onRoomSelect === 'function') { api.onRoomSelect(r.id, r); return; }
    hud.roomCard(r, roomHref(r.id));
  };
  const goToRoom = (id) => {
    const r = byId.get(String(id).toUpperCase());
    if (!r) { hud.toast(`Couldn’t find room ${id} on the campus map.`); return false; }
    const s = standFor(r);
    controls.setWalk(s.x, s.z, s.yaw, s.pitch);
    if (controls.mode === 'fly' && !booted) { controls.mode = 'walk'; controls.autoRotate = false; }
    else if (controls.mode !== 'walk') controls.landAt(controls.pos.x, controls.pos.z, s.yaw);
    placeHighlight(highlight, r);
    hud.toast(r.floor > 1
      ? `${r.label}: floor ${r.floor} of ${r.buildingName}. Its plate is up on the wall; the inside comes in a later update.`
      : `${r.label}, ${r.buildingName}. The inside comes in a later update; click the plate for its Wilkipedia page.`, 5200);
    return true;
  };
  api.goToRoom = goToRoom;
  api.setTime = (t) => { env.night = t === 'night'; applyEnv(); saveEnv(); };
  api.setRain = (on) => { env.rain = !!on; applyEnv(); saveEnv(); };
  api.setStyle = (s) => { if ((s === 'pixel') !== (style === 'pixel')) toggleStyle(); };
  api.setQuality = applyQuality;
  api.rooms = () => rooms.map((r) => r.id);

  const ray = new THREE.Raycaster(); ray.far = 60;
  const plates = () => roomsGroup.children[0];
  let hover = null, mouse = new THREE.Vector2(0, 0), mouseSeen = false;
  addEventListener('pointermove', (e) => { mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); mouseSeen = true; });
  const pick = () => {
    if (controls.mode !== 'walk' || !plates()) return null;
    ray.setFromCamera(controls.locked || !mouseSeen ? new THREE.Vector2(0, 0) : mouse, camera);
    const hit = ray.intersectObject(plates(), false)[0];
    return hit ? rooms[Math.floor(hit.faceIndex / 2)] : null;
  };
  canvas.addEventListener('click', () => {
    if (controls.mode !== 'walk') return;
    const r = pick();
    if (r) { selectRoom(r); document.exitPointerLock?.(); return; }
    if (!controls.locked && !controls.touch && !hud.big) controls.requestLock();
  });
  addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) { if (e.key === 'Escape') hud.closeBig(); return; }
    if (e.code === 'KeyF') toggleFly();
    else if (e.code === 'KeyH') document.body.classList.toggle('hide-ui');
    else if (e.code === 'KeyN') toggleNight();
    else if (e.code === 'KeyR') toggleRain();
    else if (e.code === 'KeyP') toggleStyle();
    else if (e.code === 'Space' && controls.mode === 'walk') controls.jump();
    else if (/^Digit[1-6]$/.test(e.code)) goToSpot(+e.code.slice(5) - 1);
    else if (e.code === 'KeyM') toggleMap();
    else if ((e.code === 'KeyE' || e.code === 'Enter') && hover) selectRoom(hover);
    else if (e.code === 'Escape') { hud.closeBig(); hud.roomCard(null); }
  });
  const toggleFly = () => {
    if (controls.mode === 'walk') controls.flyUp();
    else if (controls.mode === 'fly') {
      const far = controls.orbit.dist > 450;
      far ? controls.landAt(-24, -12, Math.atan2(24, 14)) : controls.landAt(controls.orbit.tx, controls.orbit.tz);
    }
  };
  const toggleMap = () => {
    if (hud.big) { hud.closeBig(); return; }
    document.exitPointerLock?.();
    const p = controls.mode === 'fly' ? { x: controls.orbit.tx, z: controls.orbit.tz } : controls.pos;
    hud.openBig(p.x, p.z, controls.yaw);
  };
  hud.onJump = (x, z) => {
    if (controls.mode === 'fly') { controls.orbit.tx = x; controls.orbit.tz = z; }
    else controls.landAt(x, z);
  };
  hud.onRoomSearch = (id) => { if (goToRoom(id)) hud.closeBig(); };

  // Size everything from the window; a tab that opened in the background can
  // report 0×0 at first, so never divide by zero.
  const onResize = () => {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    post.setSize(w, h, renderer.getPixelRatio());
  };
  addEventListener('resize', onResize);
  onResize();

  // ── numbered viewpoints (keys 1–6), and the name of where you are ──
  const SPOTS = [
    ['The quad', -24, -12, 0, 2],
    ['Front of school', -30, -92, -40, -74],
    ['Building B', -40, 20, -56, 8],
    ['Main gym', 146, -60, 122, -30],
    ['Stadium', 204, 88, 240, 88],
    ['Calabazas Creek', CREEK.x, -55.6, CREEK.x, 20],
  ];
  const goToSpot = (i) => {
    const s = SPOTS[i]; if (!s) return;
    if (controls.mode === 'walk') { controls.setWalk(s[1], s[2], Math.atan2(-(s[3] - s[1]), -(s[4] - s[2])), 0.04); }
    else controls.landAt(s[1], s[2], Math.atan2(-(s[3] - s[1]), -(s[4] - s[2])));
  };
  // the key bar: just the essentials (everything else is in View and the ? sheet)
  document.getElementById('keys').innerHTML = [['WASD', 'Walk'], ['Shift', 'Run'], ['F', 'Fly'], ['M', 'Map'], ['1–6', 'Places'], ['H', 'Hide UI']]
    .map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('');
  hud.bind({
    onFly: toggleFly, onMap: toggleMap, onQuality: (q) => applyQuality(q),
    onStyle: (s) => api.setStyle(s), onTime: (t) => api.setTime(t), onRain: (on) => api.setRain(on),
    spots: SPOTS.map((s) => s[0]), onGo: (i) => goToSpot(i),
    onHelp: () => { document.getElementById('help').hidden = false; document.exitPointerLock?.(); },
  });

  const where = (x, z) => {
    if (x > QUAD.x0 && x < QUAD.x1 && z > QUAD.z0 && z < QUAD.z1) return 'The quad';
    let best = null, bd = 8;   // the nearest building within 8 m
    for (const bb of BUILDINGS) {
      if (!bb.name) continue;
      const xs = bb.poly.map((q) => q[0]), zs = bb.poly.map((q) => q[1]);
      const d = Math.hypot(Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs)), Math.max(Math.min(...zs) - z, 0, z - Math.max(...zs)));
      if (d < bd) { bd = d; best = bb; }
    }
    if (best) return best.name;
    if (distToLine(x, z, CREEK.pts) < 14 && !(z > CREEK.culvert[0] && z < CREEK.culvert[1])) return 'Calabazas Creek';
    if (Math.abs(x - TRACK.x) < 50 && Math.abs(z - TRACK.z) < 92) return 'Stadium';
    for (const r of ROADS) if (r.name && distToLine(x, z, r.pts) < r.w / 2 + 3) return r.name;
    if (!inPoly(x, z, CAMPUS)) return 'Santa Clara';
    if (z > 84 && x > -12) return 'The fields';
    return 'Wilcox High School';
  };
  let placeName = '';

  // ── the loop ──
  const clock = new THREE.Clock();
  let t = 0, pickT = 0, mapT = 0, slow = 0, running = 0, tilt = 1;
  const _focus = new THREE.Vector3();
  const lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3();
  function frame(dt) {
    t += dt;
    controls.update(dt);
    sky.position.copy(camera.position);                   // the sky dome travels with you
    sky.userData.update(dt); clouds.userData.update(dt); birds.userData.update(dt, t); flags.userData.update(dt, t);
    const walking = controls.mode === 'walk';
    if (env.night) {
      const f = walking ? controls.pos : { x: controls.orbit.tx, z: controls.orbit.tz };
      const near = LIGHTS.map((L) => [L, (L[0] - f.x) ** 2 + (L[1] - f.z) ** 2]).sort((a, b) => a[1] - b[1]);
      lamps.forEach((l, i) => { const L = near[i]?.[0]; if (!L) { l.intensity = 0; return; } l.position.set(L[0], L[2] - 0.4, L[1]); l.intensity = 22; l.distance = L[3] * 2; });
    } else lamps.forEach((l) => { l.intensity = 0; });
    leaves.userData.update(dt, t, camera.position, walking && !env.rain);
    rain.userData.update(dt, camera.position, env.rain, !walking);
    ripples.userData.update(dt, walking ? controls.pos : camera.position, env.rain && walking);
    const dens = (env.night ? NIGHT : DAY).density * (env.rain ? 1.3 : 1);
    scene.fog.density = walking ? dens : dens * 0.11;
    // the sun's shadow box follows what you're looking at, snapped to its texels so edges don't crawl
    const focus = controls.mode === 'fly' ? new THREE.Vector3(controls.orbit.tx, 0, controls.orbit.tz) : controls.pos.clone();
    if (controls.mode !== 'fly') focus.addScaledVector(new THREE.Vector3(-Math.sin(controls.yaw), 0, -Math.cos(controls.yaw)), 30);
    const span = controls.mode === 'fly' ? Math.min(260, controls.orbit.dist * 0.9) : 75;
    if (sc.right !== span) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
    lightRight.crossVectors(SUN, new THREE.Vector3(0, 1, 0)).normalize(); lightUp.crossVectors(lightRight, SUN).normalize();
    const texel = (span * 2) / (sun.shadow.mapSize.x || 1024);
    const a = Math.round(focus.dot(lightRight) / texel) * texel, b = Math.round(focus.dot(lightUp) / texel) * texel, c = focus.dot(SUN);
    focus.copy(lightRight).multiplyScalar(a).addScaledVector(lightUp, b).addScaledVector(SUN, c);
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN, 200);
    sun.target.updateMatrixWorld();

    pickT -= dt;
    if (pickT <= 0) {
      pickT = 0.07;
      const r = pick();
      if (r !== hover) { hover = r; hud.tip(r); placeHighlight(highlight, r); canvas.style.cursor = r ? 'pointer' : ''; }
    }
    mapT -= dt;
    if (mapT <= 0) {
      mapT = 0.1;
      const p = controls.mode === 'fly' ? { x: controls.orbit.tx, z: controls.orbit.tz } : controls.mode === 'walk' ? controls.pos : camera.position;
      hud.minimap(p.x, p.z, controls.mode === 'walk' ? controls.yaw : controls.orbit.az);
      const nm = controls.mode === 'walk' ? where(p.x, p.z) : 'Wilcox from above';
      if (nm !== placeName) { placeName = nm; hud.place(nm); }
    }
    // Depth precision: push the near plane out as the camera climbs. With it
    // stuck at 0.15 m, the aerial view (~640 m away) can only tell surfaces
    // ~16 cm apart, so the field's detail layer (2 cm up) and window panes
    // flicker against what's under them. Nothing stands taller than ~35 m, so
    // everything is at least (height - 35) away.
    const nearWant = Math.min(40, Math.max(0.15, (camera.position.y - 35) * 0.5));
    if (Math.abs(camera.near - nearWant) > 0.05) { camera.near = nearWant; camera.updateProjectionMatrix(); }
    const fade = controls.mode === 'fly' ? Math.max(420, controls.orbit.dist * controls.lensK * 1.5) : 420;
    // tilt-shift (the miniature look) only from the air
    tilt += ((controls.mode === 'fly' ? 1 : 0) - tilt) * Math.min(1, dt * 3);
    camera.updateMatrixWorld();                            // (this frame's view, not last frame's)
    SUN_VIEW.value.copy(SUN).transformDirection(camera.matrixWorldInverse);
    const focusZ = camera.position.distanceTo(_focus.set(controls.orbit.tx, 0, controls.orbit.tz));   // where the lens is sharp
    post.render(scene, camera, fade, { night: env.night ? 1 : 0, wet: env.rain ? 1 : 0, sun: SUN, day: DAYLIGHT.value,
      fog: scene.fog.color, tilt, focus: focusZ });
  }
  function loop() {
    const dt = Math.min(0.05, clock.getDelta());
    if (post.w !== Math.max(1, innerWidth) || post.h !== Math.max(1, innerHeight)) onResize();
    frame(dt);
    // if frames are slow for a few seconds, step the quality down once
    // (only after the first few seconds, while shaders finish compiling, and never saved as your choice)
    running += dt;
    if (running > 6 && document.visibilityState === 'visible' && dt > 0.034 && quality !== 'low') {
      slow += dt;
      if (slow > 4) { slow = 0; const next = quality === 'high' ? 'medium' : 'low'; applyQuality(next, { save: false }); hud.toast(`Switched to ${next} quality to keep things smooth. You can change it with the quality button.`); }
    } else slow = Math.max(0, slow - dt * 0.5);
    requestAnimationFrame(loop);
  }

  // for testing in a hidden browser tab, where requestAnimationFrame may not run
  window.__campus = { THREE, renderer, scene, camera, controls, post, frame, rooms, applyQuality };

  if (params.get('room')) goToRoom(params.get('room'));
  if (params.get('view') === 'walk' && !params.get('room')) { controls.mode = 'walk'; controls.autoRotate = false; hud.setMode('walk'); }
  if (params.get('room')) { controls.autoRotate = false; hud.setMode('walk'); }
  applyStyle();
  applyEnv();
  frame(0.016);
  booted = true;
  hud.progress(1, 'Ready');
  hud.loaded();
  document.addEventListener('pointerlockchange', () => { document.body.dataset.locked = document.pointerLockElement === canvas ? '1' : '0'; });
  if (controls.touch && !params.get('room')) hud.toast('Left thumb to walk, right thumb to look. Tap “Fly up” for the aerial view.', 6000);
  requestAnimationFrame(loop);
}

boot();
