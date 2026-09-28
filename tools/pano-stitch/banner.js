// The painting tool rewrote the lamp-post banners (one reads "WILLOW HIGH"). The real banners say CHARGER STRONG,
// so lift the painted letters out of the yellow and letter it again. rect = the yellow text area in painting pixels.
window.fixBanner = (g, rect, lines = ['CHARGER', 'STRONG']) => {
  const [x0, y0, x1, y1] = rect, w = x1 - x0, h = y1 - y0, im = g.getImageData(x0, y0, w, h), d = im.data;
  const lum = (i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
  const ls = []; for (let i = 0; i < d.length; i += 4) ls.push(lum(i)); const sorted = [...ls].sort((a, b) => a - b);
  const hi = sorted[Math.floor(sorted.length * 0.7)], lo = sorted[Math.floor(sorted.length * 0.03)];
  let fr = 0, fg = 0, fb = 0, fn = 0, ir = 0, ig = 0, ib = 0, inn = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = ls[i / 4];
    if (l >= hi) { fr += d[i]; fg += d[i + 1]; fb += d[i + 2]; fn++; }
    if (l <= lo + 6) { ir += d[i]; ig += d[i + 1]; ib += d[i + 2]; inn++; }
  }
  const fill = [fr / fn, fg / fn, fb / fn], ink = [ir / inn, ig / inn, ib / inn], Ly = 0.3 * fill[0] + 0.59 * fill[1] + 0.11 * fill[2];
  for (let i = 0; i < d.length; i += 4) {
    const t = Math.min(1, Math.max(0, (Ly - ls[i / 4]) / (Ly - lo) * 1.4));
    for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - t) + fill[k] * t;
  }
  g.putImageData(im, x0, y0);
  const fs = Math.max(4, h / lines.length * 0.62);
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.fillStyle = `rgb(${ink.map(Math.round).join(',')})`; g.font = `bold ${fs}px "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((t, i) => g.fillText(t, x0 + w / 2, y0 + (i + 0.5) * h / lines.length, w * 0.9));
  g.restore();
  // soften to the painting's edge quality
  const c = document.createElement('canvas'); c.width = w + 4; c.height = h + 4; const cg = c.getContext('2d');
  cg.filter = 'blur(0.45px)'; cg.drawImage(g.canvas, x0 - 2, y0 - 2, w + 4, h + 4, 0, 0, w + 4, h + 4);
  g.drawImage(c, 2, 2, w, h, x0, y0, w, h);
  return { fill: fill.map(Math.round), ink: ink.map(Math.round) };
};
