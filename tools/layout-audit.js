// Layout audit (2026-10-23, Ethan: "check for icon overlapping and all the spacings"). Paste into the
// browser console on any page, or evaluate it headlessly at several widths, and it returns
// {doodle, text, gaps}: page-head drawings touching text or controls, glyphs of different elements that
// overlap (clipped by overflow and ignoring closed <details>), and stacked blocks whose text is < 6px apart.
// An empty result on every page at 1280 / 1024 / 820 / 390 is the bar.
(() => {
  const out = { page: location.pathname, w: innerWidth, doodle: [], text: [], gaps: [] };
  const R = (r) => ({ x0: r.left, y0: r.top + scrollY, x1: r.right, y1: r.bottom + scrollY });
  const hit = (a, b, pad = 0) => a.x0 < b.x1 - pad && a.x1 > b.x0 + pad && a.y0 < b.y1 - pad && a.y1 > b.y0 + pad;
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60);
  const textRects = (root) => {
    const list = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const n = w.currentNode; if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!el || el.closest('[hidden], .sr, .sr-only, svg, canvas, .odo, [aria-hidden="true"]')) continue;
      { let closed = false; for (let a = el; a; a = a.parentElement) { const d = a.parentElement; if (d && d.tagName === 'DETAILS' && !d.open && a.tagName !== 'SUMMARY') { closed = true; break; } } if (closed) continue; }
      const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.opacity === '0' || st.display === 'none') continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      // clip each glyph box by every ancestor that clips its overflow (line clamps, ellipses, scrollers)
      const clips = []; for (let a = el; a && a !== document.body; a = a.parentElement) { const s2 = getComputedStyle(a); if (s2.overflow !== 'visible' || s2.overflowX !== 'visible' || s2.overflowY !== 'visible') clips.push(R(a.getBoundingClientRect())); }
      for (const r0 of rg.getClientRects()) {
        if (r0.width <= 1 || r0.height <= 1) continue;
        let r = R(r0);
        for (const c of clips) r = { x0: Math.max(r.x0, c.x0), y0: Math.max(r.y0, c.y0), x1: Math.min(r.x1, c.x1), y1: Math.min(r.y1, c.y1) };
        if (r.x1 - r.x0 > 1 && r.y1 - r.y0 > 1) list.push({ r, el, t: n.textContent.trim().slice(0, 30) });
      }
    }
    return list;
  };
  // 1. the head drawings (::after on .cl-head/.c-hero, ::before on #main) and their discs
  const heads = [...document.querySelectorAll('.cl-head, .c-hero')];
  const main = document.querySelector('#main');
  const pseudo = (el, which) => {
    const cs = getComputedStyle(el, which); if (!cs || cs.content === 'none' || cs.display === 'none') return null;
    if (cs.backgroundImage === 'none' && cs.backgroundColor === 'rgba(0, 0, 0, 0)') return null;
    const b = el.getBoundingClientRect(), w = parseFloat(cs.width), h = parseFloat(cs.height);
    if (!w || !h) return null;
    if (cs.float === 'right') {                      // a float at the top right of the content box
      const es = getComputedStyle(el), x1 = b.right - parseFloat(es.paddingRight) - parseFloat(es.borderRightWidth), y0 = b.top + scrollY + parseFloat(es.paddingTop) + parseFloat(cs.marginTop);
      return { x0: x1 - w, y0, x1, y1: y0 + h };
    }
    const right = parseFloat(cs.right), top = parseFloat(cs.top);
    const x1 = b.right - (isNaN(right) ? 0 : right), y0 = b.top + scrollY + (isNaN(top) ? 0 : top);
    return { x0: x1 - w, y0, x1, y1: y0 + h };
  };
  const boxes = [];
  for (const h of heads) { for (const p of ['::before']) { const r = pseudo(h, p); if (r) boxes.push({ r, owner: label(h) + p, scope: h }); } }
  if (main && !heads.length) for (const p of ['::before']) { const r = pseudo(main, p); if (r) boxes.push({ r, owner: '#main' + p, scope: main }); }
  const things = (scope) => [...textRects(scope), ...[...scope.querySelectorAll('a, button, input, select, .c-facts, .t-stats, img, .bp-cdlink, .mn-day, .gv')].filter((e) => e.offsetParent).map((e) => ({ r: R(e.getBoundingClientRect()), el: e, t: label(e) }))];
  for (const b of boxes) {
    const scope = b.owner.startsWith('#main') ? main : b.scope;
    for (const t of things(scope)) if (hit(b.r, t.r, 6)) out.doodle.push(`${b.owner} × ${label(t.el)} “${t.t}”`);
  }
  // also anything fixed (the floating buttons) that sits on top of the head drawing
  // 2. text over text: glyph boxes of different elements that overlap
  const tr = textRects(document.body).filter((x) => !x.el.closest('header.site .menu, .mega, .drawer, .combo-list, .popc, #gv-chart, .gv, .bp-line, .bw, .cal-grid, .orrery, .map'));
  for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) {
    const a = tr[i], b = tr[j]; if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (hit(a.r, b.r, 2)) out.text.push(`“${a.t}” (${label(a.el)}) × “${b.t}” (${label(b.el)})`);
  }
  // 3. text of one block crowding the text of the next (< 6px between the last line and the first)
  const blocks = main ? [...main.querySelectorAll('h1, h2, h3, h4, p, li, dt, dd, figcaption, .meta, .sec-sub, .c-kicker, label, legend')] : [];
  const lines = new Map(blocks.map((b) => [b, textRects(b)]));
  for (let i = 0; i < blocks.length - 1; i++) {
    const a = blocks[i], b2 = blocks[i + 1]; if (a.contains(b2) || b2.contains(a)) continue;
    const la = lines.get(a), lb = lines.get(b2); if (!la.length || !lb.length) continue;
    const aBot = Math.max(...la.map((x) => x.r.y1)), bTop = Math.min(...lb.map((x) => x.r.y0));
    const ax0 = Math.min(...la.map((x) => x.r.x0)), ax1 = Math.max(...la.map((x) => x.r.x1)), bx0 = Math.min(...lb.map((x) => x.r.x0)), bx1 = Math.max(...lb.map((x) => x.r.x1));
    if (ax0 >= bx1 || bx0 >= ax1) continue;                 // side by side, not stacked
    const gap = bTop - aBot;
    if (gap > -1 && gap < 6) out.gaps.push(`${label(a)} “${a.textContent.trim().slice(0, 24)}” → ${label(b2)} “${b2.textContent.trim().slice(0, 24)}”: ${gap.toFixed(1)}px`);
  }
  out.doodle = [...new Set(out.doodle)].slice(0, 12); out.text = [...new Set(out.text)].slice(0, 12); out.gaps = [...new Set(out.gaps)].slice(0, 12);
  return out;
})()
