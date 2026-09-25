// The 三渲二 look, part 2: the picture is drawn into two buffers at once
// (colour, and each pixel's normal + distance), then one full-screen pass
// inks the outlines, adds a soft bloom, warms the colours a touch, darkens
// the corners and lays a faint paper grain over everything.
//
//   ink:     where neighbouring pixels jump in distance (silhouettes) or fold
//            sharply (a wall meeting a roof), darken toward a warm ink colour.
//            Lines fade out far away so the aerial view doesn't turn to noise.
//   rays:    Tyndall light shafts: open sky near the sun, smeared toward the
//            sun on the screen, so beams fall between clouds, through the
//            gaps in tree crowns and past the rooflines (a quarter-size pass).
//   haze:    the air on the sun's side glows warm with distance, and from
//            the air the diorama's base dissolves into the peach mist below it.
//   tilt:    from the air, the top and bottom of the picture go soft (a
//            tilt-shift lens), so the campus reads as a miniature.
//   quality: high = ink + bloom + rays + 4× MSAA; medium = ink + rays; low = colour only.

import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMPOSITE = `
precision highp float;
uniform sampler2D tColor, tND, tBloom, tRays, tSoft;
uniform vec2 texel;
uniform float ink, inkW, bloomK, useBloom, farFade, wet, night, raysK, hazeK, tiltK;
uniform vec3 fogCol;
uniform mat4 proj, projInv, viewInv;
uniform vec3 viewUp, sunDir;
varying vec2 vUv;
float h2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + 1.0), f.x), f.y); }
vec3 viewPos(vec2 uv, float d){ vec4 v = projInv * vec4(uv * 2.0 - 1.0, 0.5, 1.0); v.xyz /= v.w; return v.xyz * (d / -v.z); }
vec4 ND(vec2 o){ return texture2D(tND, vUv + o * texel * inkW); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
  // a pixel the GPU got wrong (NaN/inf) would print black: show the haze instead
  if (any(isnan(col)) || any(isinf(col))) col = fogCol;
  float edge = 0.0;
  if (ink > 0.0) {
    vec4 c = ND(vec2(0.0)), l = ND(vec2(-1.0, 0.0)), r = ND(vec2(1.0, 0.0)), u = ND(vec2(0.0, 1.0)), d = ND(vec2(0.0, -1.0));
    // foliage stores its depth negated: it only gets ink where it meets something far behind it
    float soft = c.a < 0.0 ? 1.0 : 0.0;
    float d0 = max(abs(c.a), 0.05);
    float i0 = 1.0 / d0;
    float lap = abs(1.0/max(abs(l.a),0.05) + 1.0/max(abs(r.a),0.05) + 1.0/max(abs(u.a),0.05) + 1.0/max(abs(d.a),0.05) - 4.0 * i0) / i0;
    float de = smoothstep(mix(0.05, 0.5, soft), mix(0.16, 0.9, soft), lap);
    vec3 n0 = c.rgb * 2.0 - 1.0;
    float nd = max(max(1.0 - dot(n0, l.rgb * 2.0 - 1.0), 1.0 - dot(n0, r.rgb * 2.0 - 1.0)),
                   max(1.0 - dot(n0, u.rgb * 2.0 - 1.0), 1.0 - dot(n0, d.rgb * 2.0 - 1.0)));
    float ne = smoothstep(0.24, 0.5, nd) * (1.0 - soft);
    edge = max(de, ne * (1.0 - smoothstep(farFade * 0.4, farFade, d0)));
    edge *= 1.0 - smoothstep(farFade, farFade * 2.2, d0);
    edge *= step(d0, 3000.0);                              // sky and clouds are never outlined
  }
  // warm air on the sun's side, thicker with distance (aerial perspective)
  if (hazeK > 0.0 && ink > 0.0) {
    float dz = abs(texture2D(tND, vUv).a);
    vec3 P = viewPos(vUv, min(dz, 3000.0));
    vec3 dirW = normalize(mat3(viewInv) * P);
    float toward = pow(max(dot(dirW, sunDir), 0.0), 5.0);
    float thick = dz > 3000.0 ? 0.0 : 1.0 - exp(-dz * 0.0035);
    col += vec3(1.0, 0.78, 0.5) * toward * thick * hazeK * 0.35;
  }
  // wet ground: march the mirrored ray through the depth buffer and borrow the
  // colour it hits (screen-space reflection). Strongest in puddles.
  if (wet > 0.0 && ink > 0.0) {
    vec4 c0 = ND(vec2(0.0));
    vec3 n = c0.rgb * 2.0 - 1.0;
    if (c0.a > 0.0 && c0.a < 220.0 && dot(n, viewUp) > 0.93) {
      vec3 P = viewPos(vUv, c0.a);
      vec3 V = normalize(P);
      vec3 world = (viewInv * vec4(P, 1.0)).xyz;
      float puddle = smoothstep(0.42, 0.62, vnoise(world.xz * 0.16) * 0.7 + vnoise(world.xz * 0.6) * 0.3);
      vec3 Rd = reflect(V, viewUp);
      float stepLen = max(0.25, c0.a * 0.02);
      vec3 Q = P; vec3 hitCol = vec3(0.0); float hit = 0.0;
      for (int i = 0; i < 48; i++) {
        Q += Rd * stepLen; stepLen *= 1.06;
        vec4 cl = proj * vec4(Q, 1.0); vec2 su = cl.xy / cl.w * 0.5 + 0.5;
        if (su.x < 0.0 || su.x > 1.0 || su.y < 0.0 || su.y > 1.0) break;
        float sd = abs(texture2D(tND, su).a), qd = -Q.z;
        if (qd > sd && qd - sd < stepLen * 3.0 + 0.3) {
          hitCol = texture2D(tColor, su).rgb;
          vec2 e2 = abs(su - 0.5) * 2.0;
          hit = 1.0 - smoothstep(0.75, 1.0, max(e2.x, e2.y));
          break;
        }
      }
      float fres = 0.3 + 0.7 * pow(1.0 - max(dot(-V, viewUp), 0.0), 4.0);
      float k = wet * mix(0.35, 1.0, puddle) * (1.0 - smoothstep(120.0, 220.0, c0.a));
      col *= 1.0 - 0.35 * k;                                // wet surfaces are darker
      col += hitCol * hit * fres * k * 0.85;
    }
  }
  // ink is a darker shade of whatever it outlines, never pure black; by day it's
  // barely there (a soft painted edge), at night it's crisper
  col = mix(col, col * mix(vec3(0.62, 0.52, 0.52), vec3(0.26, 0.24, 0.36), night), edge * ink * mix(0.55, 1.0, night));
  // tilt-shift: soften toward the top and bottom of the frame
  if (tiltK > 0.0) {
    float tb = smoothstep(0.16, 0.47, abs(vUv.y - 0.5)) * tiltK;
    col = mix(col, texture2D(tSoft, vUv).rgb, tb);
  }
  // the ground falls away into mist below the diorama's top (by day)
  if (ink > 0.0 && night < 0.5) {
    float dz = abs(texture2D(tND, vUv).a);
    if (dz < 3000.0) {
      float wy = (viewInv * vec4(viewPos(vUv, dz), 1.0)).y;
      col = mix(col, fogCol, smoothstep(0.5, -13.0, wy) * 0.92);
    }
  }
  if (useBloom > 0.5) col += texture2D(tBloom, vUv).rgb * bloomK;
  // the light shafts, golden where they're thick
  if (raysK > 0.0) { float r = texture2D(tRays, vUv).r; r = r / (1.0 + r); col += mix(vec3(1.0, 0.84, 0.6), vec3(1.0, 0.95, 0.85), r) * r * raysK; }
  // grade (the anime background look): richer colour, lavender-blue shadows, warm golden light
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, mix(0.92, 1.14, night));   // day: a little muted, pastel
  // day: pastel (shadows go warm mauve, blacks lift into the peach haze); night: cool blue shadows
  col *= mix(mix(vec3(0.96, 0.88, 0.9), vec3(1.03, 1.0, 0.95), smoothstep(0.08, 0.6, lum)),
             mix(vec3(0.86, 0.9, 1.14), vec3(1.04, 1.0, 0.94), smoothstep(0.08, 0.6, lum)), night);
  col = mix(col, fogCol, 0.08 * (1.0 - night));
  col = mix(col, col * vec3(0.92, 0.97, 1.12), night * (1.0 - smoothstep(0.1, 0.5, lum)));
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * mix(0.22, 0.42, night);
  if (any(isnan(col))) col = fogCol;
  col = toSRGB(col);
  col += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;

// Sunbeams, step 1: which pixels are open sky near the sun (clouds, trees and
// buildings block it; the gaps in leaf cards let it through).
const RAYMASK = `
uniform sampler2D tND, tColor; uniform vec2 sunUV; uniform float aspect; varying vec2 vUv;
void main(){
  float a = texture2D(tND, vUv).a;
  float open = step(4500.0, a);
  vec2 q = (vUv - sunUV) * vec2(aspect, 1.0);
  float near = 1.0 - smoothstep(0.0, 0.85, length(q));
  float lum = dot(texture2D(tColor, vUv).rgb, vec3(0.3, 0.59, 0.11));
  gl_FragColor = vec4(vec3(open * near * near * (0.5 + lum)), 1.0);
}`;
// Sunbeams, step 2: smear the mask toward the sun (run twice, second time finer).
const RAYBLUR = `
uniform sampler2D tSrc; uniform vec2 sunUV; uniform float span; varying vec2 vUv;
void main(){
  vec2 delta = (vUv - sunUV) * span / 40.0;
  vec2 uv = vUv; float acc = 0.0, w = 1.0;
  for (int i = 0; i < 40; i++) {
    uv -= delta;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    acc += texture2D(tSrc, uv).r * w; w *= 0.955;
  }
  gl_FragColor = vec4(vec3(acc / 24.0), 1.0);
}`;

const BRIGHT = `
uniform sampler2D tColor; uniform float thresh; varying vec2 vUv;
void main(){ vec3 c = texture2D(tColor, vUv).rgb;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);     // one bad pixel must not smear into a block
  c = min(c, vec3(64.0));
  float l = max(max(c.r, c.g), c.b); gl_FragColor = vec4(c * smoothstep(thresh, thresh + 0.5, l), 1.0); }`;

const BLUR = `
uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += (texture2D(tSrc, vUv + dir * 1.385).rgb + texture2D(tSrc, vUv - dir * 1.385).rgb) * 0.316;
  s += (texture2D(tSrc, vUv + dir * 3.231).rgb + texture2D(tSrc, vUv - dir * 3.231).rgb) * 0.070;
  if (any(isnan(s)) || any(isinf(s))) s = vec3(0.0);
  gl_FragColor = vec4(s, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.quality = 'high';
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.tri = new THREE.Mesh(new THREE.BufferGeometry(), null);
    this.tri.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.tri.geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.tri.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.tri);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.comp = mk(COMPOSITE, {
      tColor: { value: null }, tND: { value: null }, tBloom: { value: null }, texel: { value: new THREE.Vector2() },
      ink: { value: 1 }, inkW: { value: 1 }, bloomK: { value: 0.45 }, useBloom: { value: 1 }, farFade: { value: 420 },
      wet: { value: 0 }, night: { value: 0 }, proj: { value: new THREE.Matrix4() }, projInv: { value: new THREE.Matrix4() },
      viewInv: { value: new THREE.Matrix4() }, viewUp: { value: new THREE.Vector3() },
      tRays: { value: null }, raysK: { value: 0 }, hazeK: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
      tSoft: { value: null }, tiltK: { value: 0 }, fogCol: { value: new THREE.Color() },
    });
    this.rayMask = mk(RAYMASK, { tND: { value: null }, tColor: { value: null }, sunUV: { value: new THREE.Vector2() }, aspect: { value: 1 } });
    this.rayBlur = mk(RAYBLUR, { tSrc: { value: null }, sunUV: { value: new THREE.Vector2() }, span: { value: 1 } });
    this._sun = new THREE.Vector3(); this._fwd = new THREE.Vector3();
    this.bright = mk(BRIGHT, { tColor: { value: null }, thresh: { value: 0.85 } });
    this.blur = mk(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  }

  setQuality(q) { this.quality = q; this.dispose(); if (this.w) this.setSize(this.w, this.h, this.dpr); }

  dispose() {
    for (const k of ['gbuf', 'bA', 'bB', 'rA', 'rB', 'sA', 'sB']) { this[k]?.dispose(); this[k] = null; }
  }

  setSize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    const W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
    const ink = this.quality !== 'low' && this.floatOK;
    const type = this.floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.dispose();
    this.gbuf = new THREE.WebGLRenderTarget(W, H, {
      count: ink ? 2 : 1, type, depthBuffer: true,
      samples: this.quality === 'high' ? 4 : 0,
    });
    for (const t of this.gbuf.textures) { t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; }
    if (ink) this.gbuf.textures[1].minFilter = this.gbuf.textures[1].magFilter = THREE.NearestFilter;
    const bw = Math.max(1, W >> 2), bh = Math.max(1, H >> 2);
    this.bA = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.bB = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.rA = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.rB = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.sA = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.sB = new THREE.WebGLRenderTarget(bw, bh, { type, depthBuffer: false });
    this.rayMask.uniforms.aspect.value = W / H;
    this.inkOn = ink;
    const u = this.comp.uniforms;
    u.texel.value.set(1 / W, 1 / H);
    u.ink.value = ink ? 1 : 0;
    u.inkW.value = Math.max(1.15, dpr * 0.72);   // a clear, confident line
    u.useBloom.value = this.quality === 'high' ? 1 : 0;
    this.bloomTexel = new THREE.Vector2(1 / bw, 1 / bh);
  }

  pass(mat, target) {
    this.tri.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  // env: { wet, night, sun (world direction to the sun), day (0-1 sunlight) }
  render(scene, camera, farFade, env = {}) {
    const r = this.r;
    const u0 = this.comp.uniforms;
    u0.wet.value = this.quality === 'low' ? 0 : env.wet || 0;
    u0.night.value = env.night || 0;
    u0.bloomK.value = env.night ? 0.95 : 0.55;
    this.bright.uniforms.thresh.value = env.night ? 0.55 : 0.8;
    u0.proj.value.copy(camera.projectionMatrix); u0.projInv.value.copy(camera.projectionMatrixInverse);
    u0.viewInv.value.copy(camera.matrixWorld);
    u0.viewUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    r.setRenderTarget(this.gbuf);
    r.render(scene, camera);
    const u = this.comp.uniforms;
    u.tColor.value = this.gbuf.textures[0];
    u.tND.value = this.gbuf.textures[1] || this.gbuf.textures[0];
    u.farFade.value = farFade;
    // sunbeams: where the sun is on screen, and how much it faces us
    u.raysK.value = 0; u.hazeK.value = 0;
    if (this.inkOn && env.sun && env.day > 0) {
      u.sunDir.value.copy(env.sun);
      camera.getWorldDirection(this._fwd);
      const facing = this._fwd.dot(env.sun);
      u.hazeK.value = env.day;
      const k = env.day * THREE.MathUtils.smoothstep(facing, -0.15, 0.55);
      if (k > 0.01) {
        this._sun.copy(camera.position).addScaledVector(env.sun, 2000).project(camera);
        const su = this.rayMask.uniforms.sunUV.value.set(this._sun.x * 0.5 + 0.5, this._sun.y * 0.5 + 0.5);
        this.rayBlur.uniforms.sunUV.value.copy(su);
        this.rayMask.uniforms.tND.value = u.tND.value; this.rayMask.uniforms.tColor.value = u.tColor.value;
        this.pass(this.rayMask, this.rA);
        this.rayBlur.uniforms.tSrc.value = this.rA.texture; this.rayBlur.uniforms.span.value = 0.9; this.pass(this.rayBlur, this.rB);
        this.rayBlur.uniforms.tSrc.value = this.rB.texture; this.rayBlur.uniforms.span.value = 0.35; this.pass(this.rayBlur, this.rA);
        u.tRays.value = this.rA.texture;
        u.raysK.value = k * 0.32;
      }
    }
    u.fogCol.value.copy(env.fog || u.fogCol.value);
    // tilt-shift: a blurred quarter-size copy of the picture to fade into
    u.tiltK.value = this.inkOn ? (env.tilt || 0) * (env.night ? 0.6 : 1) : 0;
    if (u.tiltK.value > 0.01) {
      this.bright.uniforms.tColor.value = this.gbuf.textures[0];
      this.bright.uniforms.thresh.value = -2;           // everything passes: a plain copy
      this.pass(this.bright, this.sA);
      for (let i = 0; i < 3; i++) {
        this.blur.uniforms.tSrc.value = this.sA.texture; this.blur.uniforms.dir.value.set(this.bloomTexel.x * 1.5, 0); this.pass(this.blur, this.sB);
        this.blur.uniforms.tSrc.value = this.sB.texture; this.blur.uniforms.dir.value.set(0, this.bloomTexel.y * 1.5); this.pass(this.blur, this.sA);
      }
      u.tSoft.value = this.sA.texture;
      this.bright.uniforms.thresh.value = env.night ? 0.55 : 0.8;
    }
    if (u.useBloom.value > 0.5) {
      this.bright.uniforms.tColor.value = this.gbuf.textures[0];
      this.pass(this.bright, this.bA);
      for (let i = 0; i < 2; i++) {
        this.blur.uniforms.tSrc.value = this.bA.texture; this.blur.uniforms.dir.value.set(this.bloomTexel.x, 0); this.pass(this.blur, this.bB);
        this.blur.uniforms.tSrc.value = this.bB.texture; this.blur.uniforms.dir.value.set(0, this.bloomTexel.y); this.pass(this.blur, this.bA);
      }
      u.tBloom.value = this.bA.texture;
    }
    this.pass(this.comp, null);
  }
}
