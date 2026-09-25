// Walking rules. The player is a circle on the ground plan: it slides along
// convex polygons (buildings, planters, table footprints) and circles (trunks,
// poles). Height is a separate question answered by heightAt(): 0 almost
// everywhere, the stage and its steps where they are, and a big number for
// things you can't step onto (planting beds, the creek). A move is refused if
// it would step up more than STEP.

const CELL = 10;
const grid = new Map();
const heights = [];          // functions (x, z) => height | null
export const STEP = 0.42;
export const bounds = { x0: -300, z0: -250, x1: 420, z1: 360 };

function cells(x0, z0, x1, z1, fn) {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
    for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) fn(`${i},${j}`);
}
function insert(c, x0, z0, x1, z1) {
  cells(x0, z0, x1, z1, (k) => { let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(c); });
}

export function addCircle(x, z, r) { insert({ t: 'c', x, z, r }, x - r, z - r, x + r, z + r); }
export function addPoly(pts) {
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  insert({ t: 'p', pts }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
}
export function addBox(x0, z0, x1, z1) { addPoly([[x0, z0], [x1, z0], [x1, z1], [x0, z1]]); }
// A rotated box from its centre.
export function addOBB(cx, cz, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  addPoly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]));
}
// A thin wall/fence between two points.
export function addSegment(x0, z0, x1, z1, t = 0.2) {
  const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * t / 2, nz = (dx / l) * t / 2;
  addPoly([[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]]);
}
export function addHeight(fn) { heights.push(fn); }

export function heightAt(x, z) {
  let h = 0;
  for (const f of heights) { const v = f(x, z); if (v != null) h = Math.max(h, v); }
  return h;
}

function closestOnSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [ax + dx * t, az + dz * t];
}

function inside(px, pz, P) {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
    const c = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
    if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
}

// Push a circle (pos.x, pos.z, radius r) out of everything it overlaps.
export function resolve(pos, r) {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const seen = new Set();
    cells(pos.x - r, pos.z - r, pos.x + r, pos.z + r, (k) => {
      for (const c of grid.get(k) || []) {
        if (seen.has(c)) continue;
        seen.add(c);
        if (c.t === 'c') {
          const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d < m) { const k2 = d > 1e-6 ? (m - d) / d : 1; pos.x += dx * k2; pos.z += dz * k2; moved = true; }
        } else {
          const P = c.pts;
          let best = null, bd = Infinity;
          for (let i = 0; i < P.length; i++) {
            const [qx, qz] = closestOnSeg(pos.x, pos.z, ...P[i], ...P[(i + 1) % P.length]);
            const d = Math.hypot(pos.x - qx, pos.z - qz);
            if (d < bd) { bd = d; best = [qx, qz]; }
          }
          const isIn = inside(pos.x, pos.z, P);
          if (isIn || bd < r) {
            let nx = pos.x - best[0], nz = pos.z - best[1];
            const l = Math.hypot(nx, nz) || 1;
            nx /= l; nz /= l;
            if (isIn) { nx = -nx; nz = -nz; }
            const push = isIn ? bd + r : r - bd;
            pos.x += nx * push; pos.z += nz * push; moved = true;
          }
        }
      }
    });
    if (!moved) break;
  }
  pos.x = Math.min(bounds.x1, Math.max(bounds.x0, pos.x));
  pos.z = Math.min(bounds.z1, Math.max(bounds.z0, pos.z));
}

// Is the ground at (x, z) something the player can stand on, coming from height h?
export function canStand(x, z, h) {
  return heightAt(x, z) - h <= STEP;
}
