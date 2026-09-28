// The home page's background: a slow 360° turn from the middle of the quad, like a game's title
// screen (Ethan). Six views (a cube) were rendered from the 3D campus, standing just west of the
// cedar, by day and by night (assets/img/pano/, see CLAUDE.md); here one full-screen triangle
// looks up each pixel's direction in them, so it is sharp at any size and costs almost nothing.
// The painted courtyard (body.home::before) shows until it loads, and stays if WebGL can't run.
import { lessMotion } from './ui.js';

const TURN = 150;                        // seconds for one full turn
const PITCH = 0.05;                      // looking a touch up
const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);

// Cube-map faces, in the order WebGL wants them. The lookup flips x (so the faces read the right
// way round from inside), which puts the east view on -X and the west on +X; up and down go in
// turned half round.
const FACES = [['w', 0], ['e', 0], ['u', 1], ['d', 1], ['s', 0], ['n', 0]];

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FS = `precision highp float;
uniform samplerCube cube; uniform vec2 res; uniform float yaw, pitch, th, dim;
void main(){
  vec2 q = gl_FragCoord.xy / res * 2.0 - 1.0;
  q.x *= res.x / res.y;
  vec3 d = normalize(vec3(q * th, -1.0));
  float cp = cos(pitch), sp = sin(pitch), cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp);
  d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  vec3 c = textureCube(cube, vec3(-d.x, d.y, d.z)).rgb;
  // by day the render is a bright peach haze: behind a page it glares (Ethan), so bring it down,
  // a little more contrast, and the pale sky most of all
  c = mix(c, pow(c, vec3(1.15)) * 0.86 * (1.0 - 0.12 * smoothstep(0.0, 0.5, d.y)), dim);
  gl_FragColor = vec4(c, 1.0);
}`;

export function mountPano(root) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pano-bg';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' });
  if (!gl) return;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U('res'), uYaw = U('yaw'), uPitch = U('pitch'), uTh = U('th'), uDim = U('dim');
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_CUBE_MAP, p, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // faces at 2048 px for big sharp screens, 1536 for most, 1024 for small ones or when saving data
  const dpr = devicePixelRatio || 1, big = Math.max(innerWidth, innerHeight);
  const tier = navigator.connection?.saveData || Math.min(innerWidth, innerHeight) * dpr < 700 ? '-sm' : dpr >= 1.5 && big >= 900 ? '-lg' : '';
  const base = `${root}assets/img/pano/`;
  let set = null, ready = false, raf = 0;
  const load = (which) => {
    set = which;
    const imgs = FACES.map(([f]) => new Promise((ok, bad) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = bad;
      i.src = `${base}${which}-${f}${tier}.webp`;
    }));
    Promise.all(imgs).then((list) => {
      if (set !== which) return;                               // the theme changed meanwhile
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
      list.forEach((img, k) => {
        let src = img;
        if (FACES[k][1]) {                                     // up and down: turned half round
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d'); g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(img, 0, 0);
          src = c;
        }
        gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + k, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
      });
      ready = true;
      draw(performance.now());
      canvas.classList.add('on');
    }).catch(() => {});
  };

  const resize = () => {
    const k = Math.min(devicePixelRatio || 1, 2);           // full sharpness on high-density screens
    canvas.width = Math.round(innerWidth * k); canvas.height = Math.round(innerHeight * k);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const t0 = performance.now();
  function draw(now) {
    raf = 0;
    if (!ready) return;
    const a = canvas.width / canvas.height;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTh, Math.max(0.5, 0.466 / a));             // ~78° across a wide screen, ~50° on a phone
    gl.uniform1f(uPitch, PITCH);
    gl.uniform1f(uDim, set === 'day' ? 1 : 0);
    // start facing the cedar and the quad (east), and turn slowly to the right
    gl.uniform1f(uYaw, -Math.PI / 2 - (lessMotion() ? 0 : ((now - t0) / 1000 / TURN) * Math.PI * 2));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!lessMotion()) raf = requestAnimationFrame(draw);
  }
  addEventListener('resize', () => { resize(); if (!raf) draw(performance.now()); });
  // day or night follows the site's theme
  const follow = () => { const want = isDark() ? 'night' : 'day'; if (want !== set) load(want); };
  new MutationObserver(follow).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', follow);

  resize();
  document.body.prepend(canvas);
  follow();
}
