// The home page's motion (Ethan, 2026-09-30).
//
//   Reveal   past the last card there is room to keep scrolling. The page stops moving and the
//            cards slide out to the sides, one after another, until only the background is left
//            (the turning quad or the painting) with a way back to the top. Not with the plain
//            background: there'd be nothing to show.
//   Bounce   pulling past the top or the bottom stretches like a rubber band and springs back.
//            At the top the cards come down off the header; at the bottom the end caption lifts.
//            The background swells a little either way. The header never moves: that's why the
//            browser's own bounce is off site-wide (it dragged the header and looked like a refresh).
//
// Reduce motion: the cards fade instead of sliding, and nothing bounces.
import { $, $$, lessMotion, getPref } from './ui.js';

const MAX = 140;                                      // the furthest a pull can stretch, in px
const rubber = (d) => MAX * (1 - 1 / ((d / MAX) * 0.55 + 1));
const clamp = (x) => Math.max(0, Math.min(1, x));

export function mountHomeMotion() {
  const main = $('#main'), foot = $('footer.site');
  if (!main || !foot) return;
  // main and the footer go in one layer, so they can stop together and be pulled together
  const layer = document.createElement('div');
  layer.className = 'home-layer';
  main.before(layer);
  layer.append(main, foot);

  const reveal = getPref('homebg') !== 'plain';
  let end = null, cards = [], dirs = [];
  if (reveal) {
    end = document.createElement('div');
    end.className = 'home-reveal';
    end.innerHTML = `<p class="hr-cap"><span>Wilcox High School</span>
      <button type="button" class="hr-top">Back to the top <span aria-hidden="true">↑</span></button></p>`;
    layer.after(end);
    $('.hr-top', end).addEventListener('click', () => scrollTo({ top: 0, behavior: lessMotion() ? 'auto' : 'smooth' }));
    document.body.classList.add('has-reveal');
  }

  // ── reveal ──
  // The layer is sticky with top = (screen − its height), so once its bottom reaches the bottom of
  // the screen it stays there while the reveal space scrolls underneath. The screen height is
  // checked on every scroll too: phones change it as the address bar comes and goes.
  let vh = 0;
  const stick = () => { vh = innerHeight; layer.style.setProperty('--stick', `${Math.min(0, vh - layer.offsetHeight)}px`); };
  const fit = () => {
    stick();
    if (!reveal) return;
    cards.forEach((c) => { c.style.transform = ''; });                    // measure where they really sit
    cards = [...$$('.hero-main, .hero-side, #next-meal, .home-sec', layer), foot].filter((c) => c.offsetParent);
    // a card on the left half leaves to the left, on the right half to the right; full-width ones take turns
    const mid = innerWidth / 2;
    let turn = 1;
    dirs = cards.map((c) => {
      const r = c.getBoundingClientRect();
      if (r.width > innerWidth * 0.7) return (turn = -turn);
      return r.left + r.width / 2 < mid ? -1 : 1;
    });
    shown = -1;
    paint();
  };
  let ticking = false, shown = -1;
  const paint = () => {
    ticking = false;
    if (innerHeight !== vh) stick();
    if (!reveal) return;
    const start = Math.max(0, end.offsetTop - innerHeight);            // (the stuck layer's own offsetTop moves with it)
    const p = clamp((scrollY - start) / Math.max(1, end.offsetHeight * 0.8));
    if (p === shown) return;
    shown = p;
    document.body.style.setProperty('--reveal', p.toFixed(3));
    document.body.classList.toggle('revealed', p > 0.98);
    const still = lessMotion(), n = cards.length;
    cards.forEach((c, i) => {
      // each card starts a little after the one above it
      const k = clamp((p - (i / n) * 0.45) / 0.55);
      if (!k) { c.style.transform = c.style.opacity = ''; return; }
      const e = k * k * (3 - 2 * k);                                       // ease in and out
      c.style.transform = still ? '' : `translateX(${dirs[i] * e * (innerWidth * 0.55 + 160)}px) rotate(${dirs[i] * e * 2}deg)`;
      c.style.opacity = String(1 - e);
    });
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', fit);
  new ResizeObserver(fit).observe(layer);
  fit();

  // ── bounce ──
  let y = 0, v = 0, raw = 0, edge = null, raf = 0, idle = 0, last = 0;
  const target = () => (edge === 'bottom' && end ? $('.hr-cap', end) : layer);
  const apply = () => {
    const t = target();
    t.style.transform = Math.abs(y) < 0.05 ? '' : `translateY(${y}px)`;
    document.body.style.setProperty('--ob', (Math.min(1, Math.abs(y) / MAX)).toFixed(3));
    if (!y) { layer.style.transform = ''; if (end) $('.hr-cap', end).style.transform = ''; }
  };
  const pull = (d) => {                                // d: how far past the edge, before resistance
    cancelAnimationFrame(raf); raf = 0; v = 0;
    y = (edge === 'top' ? 1 : -1) * rubber(Math.max(0, d));
    apply();
  };
  // let go: a spring that overshoots a little before it settles (that's the bounce)
  const release = () => {
    raw = 0;
    if (!edge || raf) return;
    last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      v += (-260 * y - 20 * v) * dt;
      y += v * dt;
      if (Math.abs(y) < 0.3 && Math.abs(v) < 6) { y = 0; v = 0; raf = 0; apply(); edge = null; return; }
      apply();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const atTop = () => scrollY <= 0;
  const atBottom = () => scrollY + innerHeight >= document.documentElement.scrollHeight - 1;

  // trackpads and mouse wheels: at an edge, keep counting the scroll the page can't do
  addEventListener('wheel', (e) => {
    if (lessMotion() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || document.documentElement.classList.contains('drawer-open')) return;
    if (e.target.closest?.('.results-pop, .menu, .acct-menu, dialog, [role="dialog"], .lang-menu')) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    const want = dy < 0 && atTop() ? 'top' : dy > 0 && atBottom() ? 'bottom' : null;
    if (!edge || raf) {
      if (!want) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; raw = MAX * 0.4 * Math.min(1, Math.abs(y) / MAX); }
      edge = want;
    }
    raw += edge === 'top' ? -dy : dy;                   // scrolling back the other way undoes the pull
    if (raw <= 0) { raw = 0; y = 0; apply(); edge = null; return; }
    pull(raw);
    clearTimeout(idle);
    idle = setTimeout(release, 140);
  }, { passive: true });

  // touch: pulling down at the top or up at the bottom
  let from = null, anchor = null;
  addEventListener('touchstart', (e) => { if (e.touches.length === 1) { from = e.touches[0].clientY; anchor = null; } }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (from === null || lessMotion() || e.touches.length !== 1) return;
    const ty = e.touches[0].clientY, down = ty > from;
    if (anchor === null) {
      const want = down && atTop() ? 'top' : !down && atBottom() ? 'bottom' : null;
      from = ty;
      if (!want) return;
      cancelAnimationFrame(raf); raf = 0;
      edge = want; anchor = ty;
      return;
    }
    const d = edge === 'top' ? ty - anchor : anchor - ty;
    if (d <= 0) { anchor = null; y = 0; apply(); edge = null; from = ty; return; }
    pull(d * 1.4);
  }, { passive: true });
  const up = () => { if (anchor !== null) release(); from = anchor = null; };
  addEventListener('touchend', up, { passive: true });
  addEventListener('touchcancel', up, { passive: true });
}
