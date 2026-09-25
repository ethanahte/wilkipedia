// The 三渲二 look, part 2: the picture is drawn into two buffers at once
// (colour, and each pixel's normal + distance), then one full-screen pass
// inks the outlines, adds a soft bloom, warms the colours a touch, darkens
// the corners and lays a faint paper grain over everything.
//
//   ink:     where neighbouring pixels jump in distance (silhouettes) or fold
//            sharply (a wall meeting a roof), darken toward a warm ink colour.
//            Lines fade out far away so the aerial view doesn't turn to noise.
//   quality: high = ink + bloom + 4× MSAA; medium = ink; low = colour only.

import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMPOSITE = `
precision highp float;
uniform sampler2D tColor, tND, tBloom;
uniform vec2 texel;
uniform float ink, inkW, bloomK, useBloom, farFade;
varying vec2 vUv;
vec4 ND(vec2 o){ return texture2D(tND, vUv + o * texel * inkW); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  vec3 col = texture2D(tColor, vUv).rgb;
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
  }
  // ink is a darker, cooler shade of whatever it outlines, never pure black
  col = mix(col, col * vec3(0.34, 0.32, 0.42), edge * ink * 0.9);
  if (useBloom > 0.5) col += texture2D(tBloom, vUv).rgb * bloomK;
  // grade: warm light, cool lavender-blue shadows, a touch more colour
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.14);
  col *= mix(vec3(0.9, 0.93, 1.1), vec3(1.02, 1.0, 0.97), smoothstep(0.08, 0.6, lum));
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * 0.42;
  col = toSRGB(col);
  col += (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;

const BRIGHT = `
uniform sampler2D tColor; varying vec2 vUv;
void main(){ vec3 c = texture2D(tColor, vUv).rgb; float l = max(max(c.r, c.g), c.b); gl_FragColor = vec4(c * smoothstep(0.85, 1.35, l), 1.0); }`;

const BLUR = `
uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;
  s += (texture2D(tSrc, vUv + dir * 1.385).rgb + texture2D(tSrc, vUv - dir * 1.385).rgb) * 0.316;
  s += (texture2D(tSrc, vUv + dir * 3.231).rgb + texture2D(tSrc, vUv - dir * 3.231).rgb) * 0.070;
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
    });
    this.bright = mk(BRIGHT, { tColor: { value: null } });
    this.blur = mk(BLUR, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  }

  setQuality(q) { this.quality = q; this.dispose(); if (this.w) this.setSize(this.w, this.h, this.dpr); }

  dispose() {
    for (const k of ['gbuf', 'bA', 'bB']) { this[k]?.dispose(); this[k] = null; }
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
    const u = this.comp.uniforms;
    u.texel.value.set(1 / W, 1 / H);
    u.ink.value = ink ? 1 : 0;
    u.inkW.value = Math.max(1, dpr * 0.6);
    u.useBloom.value = this.quality === 'high' ? 1 : 0;
    this.bloomTexel = new THREE.Vector2(1 / bw, 1 / bh);
  }

  pass(mat, target) {
    this.tri.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, farFade) {
    const r = this.r;
    r.setRenderTarget(this.gbuf);
    r.render(scene, camera);
    const u = this.comp.uniforms;
    u.tColor.value = this.gbuf.textures[0];
    u.tND.value = this.gbuf.textures[1] || this.gbuf.textures[0];
    u.farFade.value = farFade;
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
