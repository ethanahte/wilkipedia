// Rooms. The list comes from the official campus map (data/map.json on the
// site), never typed in here. Each room's box on that map is carried into the
// 3D campus through its building's own map→world transform (layout.js), and a
// numbered plate goes on the nearest outside wall at that floor's height. The P
// building's classrooms (portables.js) have real doors, so theirs go beside the door.
//
// Plates are clickable (onRoomSelect), and ?room=B107 lands you in front of one.
// Real doors and interiors replace the plates building by building in later phases.

import * as THREE from 'three';
import { ROOM_XFORM, P_XFORM, PLACES, BUILDINGS } from './layout.js';
import { wallEdges } from './buildings.js';
import { portableDoors } from './portables.js';
import { gbuffer, TOON, maxAniso } from './toon.js';

const FLOOR_H = { B: 4.5, R: 4.4 };
const SLOT_W = 256, SLOT_H = 64, COLS = 8;

export const rooms = [];            // { id, label, building, buildingName, floor, kind, x, z, y, nx, nz, idx }
export const byId = new Map();

function mapToWorld(m, box, cx, cy) {
  const [mx0, my0, mx1, my1] = box.map, [wx0, wz0, wx1, wz1] = box.world;
  return [wx0 + ((cx - mx0) / (mx1 - mx0)) * (wx1 - wx0), wz0 + ((cy - my0) / (my1 - my0)) * (wz1 - wz0)];
}

function worldSpot(r) {
  if (PLACES[r.id]) return PLACES[r.id];
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (r.building === 'P') {
    const box = P_XFORM.find((b) => b.ids.includes(r.id));
    return box ? mapToWorld(null, box, cx, cy) : null;
  }
  const box = ROOM_XFORM[`${r.building}${r.floor || 1}`];
  return box ? mapToWorld(null, box, cx, cy) : null;
}

// The outside wall nearest a point, among the given building ids.
function nearestWall(x, z, pool) {
  let best = null;
  for (const b of pool) {
    for (const e of wallEdges(b.poly)) {
      const t = Math.max(0.6, Math.min(e.len - 0.6, (x - e.ax) * e.dx + (z - e.az) * e.dz));
      const px = e.ax + e.dx * t, pz = e.az + e.dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { d, px, pz, e, t };
    }
  }
  return best;
}

const OWNER = {
  B: ['B', 'B-south', 'B-south2', 'LIB', 'ADMIN'], R: ['R'], S: ['S-top', 'S-west', 'S-mid', 'S-inner', 'S-lecture'],
  M: ['M100', 'M'], N: ['N'], C: ['CAF', 'CAF-w', 'CAF-e'], T: ['T-lobby', 'T-nw', 'T-house'],
  G: ['GYM-n', 'MAINGYM', 'AUXGYM', 'GYM-girls', 'GYM-dance', 'GYM-boys', 'GYM-lobby'],
  P: ['P-w', 'P-e', 'P108', 'P115', 'P111', 'P117', 'P119'],
};

export async function loadRooms(url, group) {
  const data = await fetch(url).then((r) => r.json());
  const placed = [];
  const doors = portableDoors();
  for (const r of data.rooms) {
    if (r.kind === 'building') continue;
    // The P building's classrooms have real doors: the plate goes beside each one.
    const d = doors[r.id];
    if (d) {
      const room = { id: r.id, label: r.label, building: r.building, buildingName: r.buildingName, floor: 1, kind: r.kind,
        ...d, rot: Math.atan2(d.nx, d.nz), stand: 4.5, idx: rooms.length };
      rooms.push(room); byId.set(r.id, room);
      continue;
    }
    const spot = worldSpot(r);
    if (!spot) continue;
    const pool = BUILDINGS.filter((b) => (OWNER[r.building] || []).includes(b.id));
    const w = nearestWall(spot[0], spot[1], pool.length ? pool : BUILDINGS);
    if (!w) continue;
    const floor = r.floor || 1;
    const y = (floor - 1) * (FLOOR_H[r.building] || 4.4) + 3.45;   // just above the windows
    // don't stack two plates on the same spot: slide along the wall
    let t = w.t;
    for (const p of placed) if (p.e === w.e && Math.abs(p.y - y) < 0.3 && Math.abs(p.t - t) < 1.6) t = p.t + 1.6;
    t = Math.min(w.e.len - 0.8, t);
    const px = w.e.ax + w.e.dx * t, pz = w.e.az + w.e.dz * t;
    const room = {
      id: r.id, label: r.label, building: r.building, buildingName: r.buildingName, floor, kind: r.kind,
      // 14 cm off the wall: proud of the window frames and glass
      x: px + w.e.nx * 0.14, z: pz + w.e.nz * 0.14, y, nx: w.e.nx, nz: w.e.nz, rot: w.e.rot, idx: rooms.length,
    };
    placed.push({ e: w.e, t, y });
    rooms.push(room); byId.set(r.id, room);
  }
  group.add(plates());
  return rooms;
}

// All the plates: one mesh, one texture atlas.
function plates() {
  const rows = Math.ceil(rooms.length / COLS);
  const c = document.createElement('canvas');
  c.width = SLOT_W * COLS; c.height = SLOT_H * Math.max(1, rows);
  const g = c.getContext('2d');
  rooms.forEach((r, i) => {
    const x = (i % COLS) * SLOT_W, y = Math.floor(i / COLS) * SLOT_H;
    g.fillStyle = '#23262b'; g.fillRect(x + 2, y + 2, SLOT_W - 4, SLOT_H - 4);
    g.fillStyle = '#f5c400'; g.fillRect(x + 2, y + 2, SLOT_W - 4, 6);
    g.fillStyle = '#f4f2ea'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = r.kind === 'classroom' ? r.label : r.label.replace(/’/g, "'");
    let size = r.kind === 'classroom' ? 40 : 28;
    g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`;
    while (g.measureText(text).width > SLOT_W - 20 && size > 12) { size -= 2; g.font = `700 ${size}px "Helvetica Neue", Arial, sans-serif`; }
    g.fillText(text, x + SLOT_W / 2, y + SLOT_H / 2 + 4);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = maxAniso;
  const pos = [], nor = [], uv = [];
  rooms.forEach((r, i) => {
    // Ethan: no room numbers for now, except the P building's plates by its doors.
    // Hidden plates collapse to nothing but keep their slot, so a hit's face index
    // still finds its room (main.js).
    if (!r.stand) { for (let k = 0; k < 6; k++) { pos.push(r.x, -50, r.z); nor.push(0, 1, 0); uv.push(0, 0); } return; }
    const w = r.kind === 'classroom' ? 1.3 : 1.9, h = w * (SLOT_H / SLOT_W);
    const tx = Math.cos(r.rot), tz = -Math.sin(r.rot);      // along the wall
    const u0 = (i % COLS) / COLS, u1 = u0 + 1 / COLS, v1 = 1 - Math.floor(i / COLS) / Math.max(1, rows), v0 = v1 - 1 / Math.max(1, rows);
    const P = (a, b) => [r.x + tx * a, r.y + b, r.z + tz * a];
    const A = P(-w / 2, -h / 2), B = P(w / 2, -h / 2), C = P(w / 2, h / 2), D = P(-w / 2, h / 2);
    pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    for (let k = 0; k < 6; k++) nor.push(r.nx, 0, r.nz);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, gbuffer(new THREE.MeshToonMaterial({ map: tex, gradientMap: TOON, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  mesh.name = 'room-plates';
  mesh.receiveShadow = true;
  return mesh;
}

// A gold frame round the plate under the cursor: a bigger gold card just behind it.
export function makeHighlight() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gbuffer(new THREE.MeshBasicMaterial({ color: '#f5c400' })));
  m.visible = false;
    return m;
}
export function placeHighlight(h, r) {
  if (!r) { h.visible = false; return; }
  const w = r.kind === 'classroom' ? 1.3 : 1.9;
  h.scale.set(w + 0.18, w * (SLOT_H / SLOT_W) + 0.14, 1);
  h.position.set(r.x - r.nx * 0.02, r.y, r.z - r.nz * 0.02);
  h.rotation.set(0, Math.atan2(r.nx, r.nz), 0);
  h.visible = true;
}

// Where to stand to read a room's plate: a few metres out, facing it.
export function standFor(r) {
  const d = r.stand || (r.floor > 1 ? 8 + r.floor * 2.5 : 7);
  return { x: r.x + r.nx * d, z: r.z + r.nz * d, yaw: Math.atan2(r.nx, r.nz), pitch: r.floor > 1 ? Math.atan2(r.y - 1.6, d) * 0.9 : r.stand ? 0 : 0.08 };
}
