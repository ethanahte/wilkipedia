// Moving around.
//   walk  — first person. WASD / arrows, Shift to run, mouse to look (the
//           pointer locks on click; if it can't, drag to look). On a phone:
//           the left thumb steers, the right thumb looks.
//   fly   — an aerial camera orbiting a point on the ground: drag to turn,
//           right-drag or two fingers to slide, wheel or pinch to zoom.
//           Double-click / double-tap the ground to fly down and walk there.
// Switching between the two is a smooth camera flight, never a cut.

import * as THREE from 'three';
import { resolve, heightAt, STEP } from './collide.js';

const EYE = 1.62, RADIUS = 0.34;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Controls {
  constructor(camera, dom, ground) {
    this.cam = camera; this.dom = dom; this.ground = ground;   // ground: meshes to raycast for fly-mode picks
    this.mode = 'walk';
    this.pos = new THREE.Vector3(0, 0, 0);   // feet
    this.yaw = 0; this.pitch = 0;
    this.vy = 0;
    this.keys = new Set();
    this.orbit = { tx: 0, tz: 0, dist: 260, az: 0.6, el: 0.95 };
    this.trans = null;
    this.locked = false;
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.drag = null;
    this.onModeChange = () => {};
    this.onPick = null;            // (x, z) in fly mode
    this.enabled = true;
    this.autoRotate = false;       // the slow diorama turn, until you touch anything
    this.touch = matchMedia('(pointer: coarse)').matches;
    this._bind();
  }

  _bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea')) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === d; });
    d.addEventListener('mousemove', (e) => {
      if (this.mode === 'walk' && this.locked) this._turn(e.movementX, e.movementY, 0.0022);
    });
    d.addEventListener('pointerdown', (e) => this._down(e));
    addEventListener('pointermove', (e) => this._move(e));
    addEventListener('pointerup', (e) => this._up(e));
    addEventListener('pointercancel', (e) => this._up(e));
    d.addEventListener('contextmenu', (e) => e.preventDefault());
    d.addEventListener('wheel', (e) => {
      if (this.mode !== 'fly') return;
      e.preventDefault();
      this.autoRotate = false;
      this.orbit.dist = THREE.MathUtils.clamp(this.orbit.dist * Math.exp(e.deltaY * 0.0012), 25, 1100);
    }, { passive: false });
    d.addEventListener('dblclick', (e) => { if (this.mode === 'fly') this._pickLand(e.clientX, e.clientY); });
    this.pointers = new Map();
  }

  requestLock() {
    if (this.touch || this.mode !== 'walk') return;
    try { const p = this.dom.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* not allowed here */ }
  }

  _turn(dx, dy, k) {
    this.yaw -= dx * k;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k, -1.35, 1.35);
  }

  _down(e) {
    this.autoRotate = false;
    if (!this.enabled) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.mode === 'walk') {
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && this.stick.id == null) {
        this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      } else if (!this.locked) {
        this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    } else if (this.mode === 'fly') {
      this.drag = { button: e.button, x: e.clientX, y: e.clientY };
      if (this.pointers.size === 2) this.pinch = this._pinchState();
    }
    this.dom.setPointerCapture?.(e.pointerId);
  }

  _pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: this.orbit.dist };
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (this.mode === 'walk') {
      if (e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy, l = Math.hypot(dx, dy), m = 60;
        const k = 1 / Math.max(l, m);           // full speed at 60 px from where the thumb landed
        this.stick.x = dx * k; this.stick.y = dy * k;
      } else if (e.pointerId === this.look.id) {
        this._turn(e.clientX - this.look.x, e.clientY - this.look.y, this.touch ? 0.006 : 0.004);
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    } else if (this.mode === 'fly' && this.drag && p) {
      if (this.pointers.size >= 2 && this.pinch) {
        const s = this._pinchState();
        this.orbit.dist = THREE.MathUtils.clamp(this.pinch.dist * (this.pinch.d / Math.max(20, s.d)), 25, 1100);
        this._pan(s.cx - this.pinch.cx, s.cy - this.pinch.cy);
        this.pinch.cx = s.cx; this.pinch.cy = s.cy;
        return;
      }
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (this.drag.button === 2 || e.shiftKey) this._pan(dx, dy);
      else {
        this.orbit.az -= dx * 0.005;
        this.orbit.el = THREE.MathUtils.clamp(this.orbit.el + dy * 0.004, 0.18, 1.45);
      }
    }
  }

  _pan(dx, dy) {
    const k = this.orbit.dist * 0.0016, a = this.orbit.az;
    // screen right = (cos az, -sin az) … on the ground, move opposite to the drag
    this.orbit.tx -= (Math.cos(a) * dx + Math.sin(a) * dy) * k;
    this.orbit.tz -= (-Math.sin(a) * dx + Math.cos(a) * dy) * k;
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (e.pointerId === this.stick.id) this.stick = { x: 0, y: 0, id: null };
    if (e.pointerId === this.look.id) this.look = { id: null };
    if (this.pointers.size < 2) this.pinch = null;
    if (!this.pointers.size) this.drag = null;
    // a double-tap in fly mode lands you there
    if (this.mode === 'fly' && p && e.pointerType === 'touch' && Math.hypot(p.x - p.sx, p.y - p.sy) < 8) {
      const now = performance.now();
      if (this._lastTap && now - this._lastTap < 320) this._pickLand(e.clientX, e.clientY);
      this._lastTap = now;
    }
  }

  _pickLand(cx, cy) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1), this.cam);
    const hit = ray.intersectObjects(this.ground, false)[0];
    if (hit) this.onPick ? this.onPick(hit.point.x, hit.point.z) : this.landAt(hit.point.x, hit.point.z);
  }

  // ── teleports and flights ──
  setWalk(x, z, yaw = this.yaw, pitch = 0) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const p = { x, z }; resolve(p, RADIUS);
    this.pos.set(p.x, heightAt(p.x, p.z), p.z);
    this.yaw = yaw; this.pitch = pitch;
  }

  jump() {
    if (this.pos.y - heightAt(this.pos.x, this.pos.z) < 0.05) this.vy = 4.6;
  }

  flyUp() {
    if (this.mode !== 'walk') return;
    document.exitPointerLock?.();
    this.orbit.tx = this.pos.x; this.orbit.tz = this.pos.z;
    this.orbit.az = this.yaw; this.orbit.el = 0.92; this.orbit.dist = 230;
    this._flight('fly');
  }

  landAt(x, z, yaw) {
    const from = this.cam.clone();
    const p = { x, z }; resolve(p, RADIUS);
    this.pos.set(p.x, heightAt(p.x, p.z), p.z);
    if (yaw == null) {
      const dx = p.x - this.cam.position.x, dz = p.z - this.cam.position.z;
      yaw = Math.atan2(-dx, -dz);
    }
    this.yaw = yaw; this.pitch = 0;
    this.trans = { t: 0, dur: 1.6, from, to: 'walk' };
    this.mode = 'transition';
    this.onModeChange('transition');
  }

  _flight(to) {
    this.trans = { t: 0, dur: 1.5, from: this.cam.clone(), to };
    this.mode = 'transition';
    this.onModeChange('transition');
  }

  _walkPose(cam) {
    cam.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  _flyPose(cam) {
    const o = this.orbit;
    const h = o.dist * Math.sin(o.el), r = o.dist * Math.cos(o.el);
    cam.position.set(o.tx + Math.sin(o.az) * r, h, o.tz + Math.cos(o.az) * r);
    cam.lookAt(o.tx, 0, o.tz);
  }

  update(dt) {
    const cam = this.cam;
    if (this.mode === 'transition') {
      const T = this.trans;
      T.t += dt / T.dur;
      const k = ease(Math.min(1, T.t));
      const target = cam.clone();
      if (T.to === 'walk') this._walkPose(target); else this._flyPose(target);
      // arc up a little on the way so the camera never skims through roofs
      const lift = Math.sin(k * Math.PI) * Math.min(80, T.from.position.distanceTo(target.position) * 0.25);
      cam.position.lerpVectors(T.from.position, target.position, k);
      cam.position.y += lift;
      cam.quaternion.slerpQuaternions(T.from.quaternion, target.quaternion, k);
      if (T.t >= 1) {
        this.mode = T.to; this.trans = null;
        this.onModeChange(this.mode);
      }
      return;
    }
    if (this.mode === 'fly') {
      const k = this.keys, sp = this.orbit.dist * 0.9 * dt;
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const a = this.orbit.az;
      this.orbit.tx += (-Math.sin(a) * f + Math.cos(a) * s) * sp;
      this.orbit.tz += (-Math.cos(a) * f - Math.sin(a) * s) * sp;
      if (k.size) this.autoRotate = false;
      if (this.autoRotate) this.orbit.az += dt * 0.06;
      if (k.has('KeyQ')) this.orbit.az += dt * 1.2;
      if (k.has('KeyE')) this.orbit.az -= dt * 1.2;
      this.orbit.tx = THREE.MathUtils.clamp(this.orbit.tx, -215, 365);
      this.orbit.tz = THREE.MathUtils.clamp(this.orbit.tz, -150, 305);
      this._flyPose(cam);
      return;
    }
    // walk
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (this.stick.id != null) { f = -this.stick.y; s = this.stick.x; }
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(f, s) > 0.95 && this.stick.id != null;
    const speed = (run ? 8.5 : 4.4) * dt;
    const len = Math.hypot(f, s);
    if (len > 0.01 && this.enabled) {
      const n = Math.min(1, len);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const mx = ((fx * f + rx * s) / len) * speed * n, mz = ((fz * f + rz * s) / len) * speed * n;
      this._step(mx, mz);
    }
    // settle onto the ground (steps up instantly-ish, falls smoothly)
    const g = heightAt(this.pos.x, this.pos.z);
    if (g > this.pos.y && this.vy <= 0) this.pos.y = Math.min(g, this.pos.y + dt * 6);
    else { this.vy -= 14 * dt; this.pos.y = Math.max(g, this.pos.y + this.vy * dt); if (this.pos.y === g) this.vy = 0; }
    this._walkPose(cam);
  }

  _step(mx, mz) {
    const try1 = (dx, dz) => {
      const p = { x: this.pos.x + dx, z: this.pos.z + dz };
      resolve(p, RADIUS);
      if (heightAt(p.x, p.z) - this.pos.y > STEP + Math.max(0, this.vy) * 0.05) return false;
      this.pos.x = p.x; this.pos.z = p.z;
      return true;
    };
    if (!try1(mx, mz)) { if (!try1(mx, 0)) try1(0, mz); }
  }
}
