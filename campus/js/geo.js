// Geometry toolkit. Everything static in the campus is written straight into
// flat arrays ("buckets"), one per material per 80 m chunk of ground, and each
// bucket becomes ONE mesh at the end. That keeps a 600 m campus at a few
// hundred draw calls, and chunking still lets the camera (and the shadow pass)
// skip whatever is off screen.
//
// Every vertex carries a colour, so one toon material can paint a thousand
// differently-coloured things. Textured buckets (stucco, glass, roofs…) take
// UVs in METRES, and the texture's repeat sets how many metres one tile covers.

import * as THREE from 'three';

export const CHUNK = 80;
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

// Seeded random numbers, so props land in the same place on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const color = (hex) => new THREE.Color(hex);

class Bucket {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; }
  vert(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(col.r, col.g, col.b);
  }
}

export class World {
  constructor() {
    this.buckets = new Map();   // "material|cx|cz" -> Bucket
    this.matrix = null;         // optional transform applied to every vertex written
  }
  bucket(mat, x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const key = `${mat}|${cx}|${cz}`;
    let b = this.buckets.get(key);
    if (!b) { b = new Bucket(); this.buckets.set(key, b); }
    return b;
  }

  // Run fn with every vertex it writes moved by a transform (position, rotation Y, scale).
  with(x, y, z, rotY, fn, s = 1) {
    const prev = this.matrix;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0), new THREE.Vector3(s, s, s));
    this.matrix = prev ? prev.clone().multiply(m) : m;
    fn();
    this.matrix = prev;
  }

  // Same, with any Matrix4 (tilted fronds, leaning blades…).
  withM(m, fn) {
    const prev = this.matrix;
    this.matrix = prev ? prev.clone().multiply(m) : m;
    fn();
    this.matrix = prev;
  }

  // One triangle list, positions/normals/uvs as arrays of [x,y,z]/[u,v].
  tris(mat, pos, nor, uv, col) {
    const cl = col.isColor ? col : _c.set(col);
    const M = this.matrix;
    // chunk by the first vertex (after transform)
    _v.set(...pos[0]); if (M) _v.applyMatrix4(M);
    const b = this.bucket(mat, _v.x, _v.z);
    if (M) _m3.getNormalMatrix(M);
    for (let i = 0; i < pos.length; i++) {
      _v.set(...pos[i]); _n.set(...nor[i]);
      if (M) { _v.applyMatrix4(M); _n.applyMatrix3(_m3).normalize(); }
      b.vert(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, uv ? uv[i][0] : 0, uv ? uv[i][1] : 0, cl);
    }
  }

  // Quad a-b-c-d (counter-clockwise seen from the front). uv: [[u,v]x4] or 'auto'
  // (metres across the quad's own width and height).
  quad(mat, a, b, c, d, col, uv) {
    const e1 = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a));
    const e2 = new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a));
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize().toArray();
    if (!uv || uv === 'auto') {
      const w = e1.length(), h = e2.length();
      uv = [[0, 0], [w, 0], [w, h], [0, h]];
    }
    this.tris(mat, [a, b, c, a, c, d], [n, n, n, n, n, n], [uv[0], uv[1], uv[2], uv[0], uv[2], uv[3]], col);
  }

  // Axis-aligned (before rotY) box from its centre and size. UVs in metres.
  // skip: set of faces to leave out ('top','bottom','n','s','e','w').
  box(mat, cx, cy, cz, sx, sy, sz, col, rotY = 0, skip = null) {
    const x0 = -sx / 2, x1 = sx / 2, y0 = -sy / 2, y1 = sy / 2, z0 = -sz / 2, z1 = sz / 2;
    const f = (name, a, b, c, d, w, h) => {
      if (skip && skip.has(name)) return;
      this.quad(mat, a, b, c, d, col, [[0, 0], [w, 0], [w, h], [0, h]]);
    };
    const go = () => {
      f('s', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sx, sy);   // +z
      f('n', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], sx, sy);   // -z
      f('e', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], sz, sy);   // +x
      f('w', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sz, sy);   // -x
      f('top', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], sx, sz);
      f('bottom', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sx, sz);
    };
    this.with(cx, cy, cz, rotY, go);
  }

  // Box between two corners on the ground plan, from y0 to y1.
  slab(mat, x0, z0, x1, z1, y0, y1, col, skip) {
    this.box(mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), col, 0, skip);
  }

  // A thin box standing along a line on the plan (walls, beams, rails).
  beam(mat, xa, za, xb, zb, y0, y1, thick, col) {
    const dx = xb - xa, dz = zb - za, len = Math.hypot(dx, dz);
    this.box(mat, (xa + xb) / 2, (y0 + y1) / 2, (za + zb) / 2, len, y1 - y0, thick, col, -Math.atan2(dz, dx));
  }

  // A thin square rod between two 3D points (handrails, struts, stakes).
  rod(mat, a, b, t, col) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
    const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    this.withM(m, () => this.box(mat, 0, 0, 0, L, t, t, col));
  }

  // Vertical prism from a plan polygon [[x,z]...] (counter-clockwise seen from above,
  // i.e. clockwise in x/z because z points south). Walls get metre UVs.
  prism(mat, pts, y0, y1, col, { top = true, bottom = false, walls = true, topMat = null, topCol = null } = {}) {
    const P = ensureCCW(pts);
    if (walls) {
      let run = 0;
      for (let i = 0; i < P.length; i++) {
        const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
        const len = Math.hypot(bx - ax, bz - az);
        this.quad(mat, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], col,
          [[run, y0], [run + len, y0], [run + len, y1], [run, y1]]);
        run += len;
      }
    }
    if (top) this.cap(topMat || mat, P, y1, topCol || col, true);
    if (bottom) this.cap(mat, P, y0, col, false);
  }

  cap(mat, P, y, col, up) {
    const tri = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, -z)), []);
    const pos = [], nor = [], uv = [];
    for (const t of tri) {
      const ids = up ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]];
      // triangulateShape winds CCW in (x, -z); flip as needed so the face points up/down
      for (const i of ids) { pos.push([P[i][0], y, P[i][1]]); nor.push([0, up ? 1 : -1, 0]); uv.push([P[i][0], P[i][1]]); }
    }
    // make sure the winding matches the normal
    fixWinding(pos, up ? 1 : -1);
    this.tris(mat, pos, nor, uv, col);
  }

  // Cylinder / cone / frustum along Y. seg sides; caps optional. Smooth normals.
  cyl(mat, cx, y0, cz, r0, r1, h, seg, col, { top = true, bottom = false, flat = false } = {}) {
    const pos = [], nor = [], uv = [];
    const slope = (r0 - r1) / h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = flat ? norm([Math.cos((a0 + a1) / 2), slope, Math.sin((a0 + a1) / 2)]) : norm([c0, slope, s0]);
      const n1 = flat ? n0 : norm([c1, slope, s1]);
      const A = [cx + c0 * r0, y0, cz + s0 * r0], B = [cx + c1 * r0, y0, cz + s1 * r0];
      const C = [cx + c1 * r1, y0 + h, cz + s1 * r1], D = [cx + c0 * r1, y0 + h, cz + s0 * r1];
      const u0 = (i / seg) * 2 * Math.PI * r0, u1 = ((i + 1) / seg) * 2 * Math.PI * r0;
      pos.push(A, C, B, A, D, C); nor.push(n0, n1, n1, n0, n0, n1); uv.push([u0, 0], [u1, h], [u1, 0], [u0, 0], [u0, h], [u1, h]);
      if (top && r1 > 0) { pos.push([cx, y0 + h, cz], C, D); nor.push([0, 1, 0], [0, 1, 0], [0, 1, 0]); uv.push([0, 0], [0, 0], [0, 0]); }
      if (bottom) { pos.push([cx, y0, cz], A, B); nor.push([0, -1, 0], [0, -1, 0], [0, -1, 0]); uv.push([0, 0], [0, 0], [0, 0]); }
    }
    this.tris(mat, pos, nor, uv, col);
  }

  // Squashed icosphere "blob": the building block of every tree canopy and cloud.
  blob(mat, cx, cy, cz, rx, ry, rz, col, detail = 1) {
    const g = blobGeo(detail);
    const p = g.attributes.position.array;
    const pos = [], nor = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      pos.push([cx + x * rx, cy + y * ry, cz + z * rz]);
      nor.push(norm([x / rx, y / ry, z / rz]));
    }
    this.tris(mat, pos, nor, null, col);
  }

  // A torus-ish ring on the ground (curbs, planter rims): n segments between radii.
  ring(mat, cx, cz, r0, r1, y0, y1, col, seg = 32, a0 = 0, a1 = Math.PI * 2) {
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
      const P = (r, t, y) => [cx + Math.cos(t) * r, y, cz + Math.sin(t) * r];
      // top
      this.quad(mat, P(r0, t0, y1), P(r0, t1, y1), P(r1, t1, y1), P(r1, t0, y1), col);
      // outer wall and inner wall
      this.quad(mat, P(r1, t0, y0), P(r1, t0, y1), P(r1, t1, y1), P(r1, t1, y0), col);
      this.quad(mat, P(r0, t0, y0), P(r0, t1, y0), P(r0, t1, y1), P(r0, t0, y1), col);
    }
  }

  // Turn every bucket into meshes. mats: name -> material.
  build(mats, parent, { shadows = true } = {}) {
    for (const [key, b] of this.buckets) {
      const [name] = key.split('|');
      const mat = mats[name];
      if (!mat || !b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      g.computeBoundingSphere(); g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = shadows && !mat.userData.noCast;
      if (mat.userData.depthMat) mesh.customDepthMaterial = mat.userData.depthMat;
      mesh.receiveShadow = shadows;
      mesh.name = key;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export function ensureCCW(pts) {
  // positive area in (x, -z) = counter-clockwise seen from above
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * -z1 - x1 * -z0;
  }
  return a > 0 ? pts : pts.slice().reverse();
}

function fixWinding(pos, wantY) {
  for (let i = 0; i < pos.length; i += 3) {
    const a = pos[i], b = pos[i + 1], c = pos[i + 2];
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (Math.sign(ny) !== Math.sign(wantY) && ny !== 0) { pos[i + 1] = c; pos[i + 2] = b; }
  }
}

const blobCache = {};
function blobGeo(detail) {
  if (!blobCache[detail]) blobCache[detail] = new THREE.IcosahedronGeometry(1, detail);
  return blobCache[detail];
}

// Point in polygon ([[x,z]...]).
export function inPoly(x, z, P) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, zi] = P[i], [xj, zj] = P[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const rectPoly = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
