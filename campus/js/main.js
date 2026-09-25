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
import { World } from './geo.js';
import { makeTextures, makeMaterials, setAniso } from './toon.js';
import { buildGround } from './ground.js';
import { buildBuildings } from './buildings.js';
import { buildLandmarks } from './landmarks.js';
import { buildQuad } from './quad.js';
import { buildProps } from './props.js';
import { makeSky, makeClouds, makeBirds, makeFlags, makeLeaves, SUN, HORIZON } from './life.js';
import { Controls } from './controls.js';
import { loadRooms, rooms, byId, makeHighlight, placeHighlight, standFor } from './rooms.js';
import { Post } from './post.js';
import { Hud } from './hud.js';
import { FRONT, BUILDINGS, QUAD, TRACK, FIELDS, CREEK } from './layout.js';

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
  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 3200);

  // light: sky + ground bounce, and one warm afternoon sun that follows you with its shadows
  // warm sun; the sky light is a lavender blue, which is the colour every shadow takes on
  const hemi = new THREE.HemisphereLight('#a9bdf0', '#d8c7a6', 1.85);
  const sun = new THREE.DirectionalLight('#fff0d4', 2.3);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
  const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
  scene.add(hemi, sun, sun.target);

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
  let sky, clouds, birds, flags, leaves;
  steps.push(['Letting the clouds in', () => {
    sky = makeSky(); scene.add(sky);
    clouds = makeClouds(quality === 'low' ? 9 : 16); scene.add(clouds);
    birds = makeBirds(); scene.add(birds);
    flags = makeFlags(); scene.add(flags);
    leaves = makeLeaves(quality === 'low' ? 50 : 110); scene.add(leaves);
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

  // start: the main entrance, under the flag, facing south toward the quad
  const [fx, fz] = FRONT.flag;
  controls.setWalk(fx + 1.5, fz - 2.2, 0.35 + Math.PI, 0);
  controls.yaw = Math.PI - 0.25;
  controls.onModeChange = (m) => { hud.setMode(m); if (m !== 'walk') hud.tip(null); };
  hud.setMode('walk');

  // ── rooms: hover, click, ?room= ──
  const roomHref = (id) => `${ROOT}map/#${encodeURIComponent(id)}`;
  const api = window.WilcoxCampus = window.WilcoxCampus || {};
  const selectRoom = (r) => {
    if (typeof api.onRoomSelect === 'function') { api.onRoomSelect(r.id, r); return; }
    hud.roomCard(r, roomHref(r.id));
  };
  const goToRoom = (id) => {
    const r = byId.get(String(id).toUpperCase());
    if (!r) { hud.toast(`Couldn’t find room ${id} on the campus map.`); return false; }
    const s = standFor(r);
    controls.setWalk(s.x, s.z, s.yaw, s.pitch);
    if (controls.mode !== 'walk') controls.landAt(controls.pos.x, controls.pos.z, s.yaw);
    placeHighlight(highlight, r);
    hud.toast(r.floor > 1
      ? `${r.label}: floor ${r.floor} of ${r.buildingName}. Its plate is up on the wall; the inside comes in a later update.`
      : `${r.label}, ${r.buildingName}. The inside comes in a later update; click the plate for its Wilkipedia page.`, 5200);
    return true;
  };
  api.goToRoom = goToRoom;
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
    else if (e.code === 'Space' && controls.mode === 'walk') controls.jump();
    else if (/^Digit[1-6]$/.test(e.code)) goToSpot(+e.code.slice(5) - 1);
    else if (e.code === 'KeyM') toggleMap();
    else if ((e.code === 'KeyE' || e.code === 'Enter') && hover) selectRoom(hover);
    else if (e.code === 'Escape') { hud.closeBig(); hud.roomCard(null); }
  });
  const toggleFly = () => {
    if (controls.mode === 'walk') controls.flyUp();
    else if (controls.mode === 'fly') controls.landAt(controls.orbit.tx, controls.orbit.tz);
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
  hud.bind({
    onFly: toggleFly, onMap: toggleMap, onQuality: (q) => applyQuality(q),
    onHelp: () => { document.getElementById('help').hidden = false; document.exitPointerLock?.(); },
  });

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
  document.getElementById('keys').innerHTML = [['WASD', 'Walk'], ['Shift', 'Run'], ['Space', 'Jump'], ['F', 'Fly'],
    ...SPOTS.map((s, i) => [String(i + 1), s[0]]), ['M', 'Map'], ['H', 'Hide UI']]
    .map(([k, v]) => `<span><kbd>${k}</kbd>${v}</span>`).join('');
  document.getElementById('keys').onclick = (e) => {
    const k = e.target.closest('span')?.querySelector('kbd')?.textContent;
    if (/^[1-6]$/.test(k || '')) goToSpot(+k - 1);
  };
  const where = (x, z) => {
    if (x > QUAD.x0 && x < QUAD.x1 && z > QUAD.z0 && z < QUAD.z1) return 'The quad';
    let best = null, bd = 7;   // the nearest building within 7 m
    for (const bb of BUILDINGS) {
      if (!bb.name) continue;
      const xs = bb.poly.map((q) => q[0]), zs = bb.poly.map((q) => q[1]);
      const d = Math.hypot(Math.max(Math.min(...xs) - x, 0, x - Math.max(...xs)), Math.max(Math.min(...zs) - z, 0, z - Math.max(...zs)));
      if (d < bd) { bd = d; best = bb; }
    }
    if (best) return best.name;
    if (Math.abs(x - CREEK.x) < 14) return 'Calabazas Creek';
    if (Math.abs(x - TRACK.x) < 50 && Math.abs(z - TRACK.z) < 92) return 'Stadium';
    if (z < -97) return 'Monroe Street';
    if (z > 84 && x > -12) return 'The fields';
    return 'Wilcox High School';
  };
  let placeName = '';

  // ── the loop ──
  const clock = new THREE.Clock();
  let t = 0, pickT = 0, mapT = 0, slow = 0, running = 0;
  const lightRight = new THREE.Vector3(), lightUp = new THREE.Vector3();
  function frame(dt) {
    t += dt;
    controls.update(dt);
    sky.userData.update(dt); clouds.userData.update(dt); birds.userData.update(dt, t); flags.userData.update(dt, t);
    leaves.userData.update(dt, t, camera.position, controls.mode === 'walk');
    scene.fog.density = controls.mode === 'walk' ? 0.0021 : 0.0008;
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
    const fade = controls.mode === 'fly' ? Math.max(420, controls.orbit.dist * 2.4) : 420;
    post.render(scene, camera, fade);
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
  if (params.get('view') === 'aerial') { controls.orbit.tx = 0; controls.orbit.tz = 20; controls.flyUp(); }
  frame(0.016);
  hud.progress(1, 'Ready');
  hud.loaded();
  document.addEventListener('pointerlockchange', () => { document.body.dataset.locked = document.pointerLockElement === canvas ? '1' : '0'; });
  if (controls.touch && !params.get('room')) hud.toast('Left thumb to walk, right thumb to look. Tap “Fly up” for the aerial view.', 6000);
  requestAnimationFrame(loop);
}

boot();
