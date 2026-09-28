// Preview: the same cube lookup pano.js does, drawn over the page.
window.makeViewer = () => {
  const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:5'; document.body.appendChild(cv);
  const gl = cv.getContext('webgl', { preserveDrawingBuffer: true });
  const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
  const FS = `precision highp float; uniform samplerCube cube; uniform vec2 res; uniform float yaw, pitch, th, dim;
  void main(){ vec2 q = gl_FragCoord.xy / res * 2.0 - 1.0; q.x *= res.x / res.y; vec3 d = normalize(vec3(q * th, -1.0));
  float cp = cos(pitch), sp = sin(pitch), cy = cos(yaw), sy = sin(yaw);
  d = vec3(d.x, d.y * cp - d.z * sp, d.y * sp + d.z * cp); d = vec3(d.x * cy + d.z * sy, d.y, -d.x * sy + d.z * cy);
  vec3 c = textureCube(cube, vec3(-d.x, d.y, d.z)).rgb;
  c = mix(c, pow(c, vec3(1.15)) * 0.86 * (1.0 - 0.12 * smoothstep(0.0, 0.5, d.y)), dim);
  gl_FragColor = vec4(c, 1.0); }`;
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_CUBE_MAP, p, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  window.upload = (F) => [['w', 0], ['e', 0], ['u', 1], ['d', 1], ['s', 0], ['n', 0]].forEach(([f, r], k) => {
    let c = F[f]; if (r) { const t = document.createElement('canvas'); t.width = t.height = c.width; const g = t.getContext('2d'); g.translate(c.width, c.height); g.rotate(Math.PI); g.drawImage(c, 0, 0); c = t; }
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + k, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, c); });
  window.look = (deg, pitch = 0.05, dim = 0) => { cv.width = innerWidth * 2; cv.height = innerHeight * 2; gl.viewport(0, 0, cv.width, cv.height);
    const U = (n) => gl.getUniformLocation(pr, n); gl.uniform2f(U('res'), cv.width, cv.height); gl.uniform1f(U('th'), Math.max(0.5, 0.466 / (cv.width / cv.height)));
    gl.uniform1f(U('pitch'), pitch); gl.uniform1f(U('yaw'), -deg * Math.PI / 180); gl.uniform1f(U('dim'), dim); gl.drawArrays(gl.TRIANGLES, 0, 3); return deg; };
};
// Line up every view, find the seams, stitch the six faces at size S, and show them turning in the preview.
// set: [name, heading, pitch, painting, render, patch?] rows, as in index.html.
window.build = async (set, S = 2048) => {
  const views = [];
  for (const [name, h, p, src, orig, patch] of set) views.push(await prepView({ name, h0: h, p0: p, src, orig, patch, sharpA: 0.8 }));
  window.VIEWS = views; window.SEAMS = computeSeams(views);
  const out = {}; for (const f of ['n', 'e', 's', 'w', 'u', 'd']) out[f] = stitchFace(views, f, S);
  window.OUT = out;
  if (!window.upload) makeViewer();
  upload(OUT); look(90, 0.05, 1); return VIEWS.map((v) => [v.name, v.fit ? +v.fit.corr.toFixed(2) : null]);
};
// The three sizes pano.js picks from, sent to recv.py (which writes them to ./out).
window.exportFaces = async (prefix = 'day') => {
  const size = (src, n) => { const o = document.createElement('canvas'); o.width = o.height = n; const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, n, n); return o; };
  const res = [];
  for (const f of ['n', 'e', 's', 'w', 'u', 'd']) {
    res.push(await saveCanvas(OUT[f], `${prefix}-${f}-lg.webp`, 'image/webp', 0.86));
    res.push(await saveCanvas(size(OUT[f], 1536), `${prefix}-${f}.webp`, 'image/webp', 0.86));
    res.push(await saveCanvas(size(OUT[f], 1024), `${prefix}-${f}-sm.webp`, 'image/webp', 0.82));
  }
  return res.join(' ');
};
