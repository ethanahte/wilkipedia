// The home page's motion (Ethan, 2026-09-30).
//
//   Reveal   past the last card there is room to keep scrolling. The page stops moving and the
//            cards slide out to the sides, one after another, until only the background is left
//            (the turning quad or the painting) with a way back to the top. Not with the plain
//            background: there'd be nothing to show.
//   Bounce   pulling past the top or the bottom stretches like a rubber band and springs back,
//            and a fling that runs into either edge bounces off it.
//            At the top the cards come down off the header; at the bottom the end caption lifts.
//            The background swells a little either way. The header never moves: that's why the
//            browser's own bounce is off site-wide (it dragged the header and looked like a refresh).
//
// Reduce motion: the cards fade instead of sliding, and nothing bounces.
import { $, $$, lessMotion, getPref } from './ui.js';

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
  // Like iOS and macOS (Ethan: "like the popular websites"). Two cases:
  //   a fling that runs into the edge bounces at once, further the faster it was going;
  //   a pull that starts AT the edge stretches with resistance, and snaps back on letting go.
  // The return is a near-critically damped spring: quick (about 0.3 s), no wobble.
  let y = 0, v = 0, edge = null, raf = 0, last = 0;
  const target = () => (edge === 'bottom' && end ? $('.hr-cap', end) : layer);
  const clear = () => { layer.style.transform = ''; if (end) $('.hr-cap', end).style.transform = ''; };
  const apply = () => {
    if (Math.abs(y) < 0.05) clear(); else target().style.transform = `translateY(${y}px)`;
    document.body.style.setProperty('--ob', Math.min(1, Math.abs(y) / 120).toFixed(3));
  };
  const sign = () => (edge === 'top' ? 1 : -1);
  // iOS's rubber band: the further you pull, the less it follows
  const rubber = (d) => { const h = innerHeight; return (1 - 1 / ((d * 0.55) / h + 1)) * h; };
  const spring = () => {
    if (raf) return;
    last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      for (let i = 0; i < 4; i++) { v += (-640 * y - 48 * v) * (dt / 4); y += v * (dt / 4); }   // small steps: stiff springs need them
      if (Math.abs(y) < 0.3 && Math.abs(v) < 8) { y = v = 0; raf = 0; apply(); edge = null; return; }
      apply();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const pullTo = (d) => { stop(); v = 0; y = sign() * rubber(Math.max(0, d)); apply(); };
  // hit the edge moving at `speed` px/s: start the spring with that speed outward
  const impact = (which, speed) => {
    if (lessMotion()) return;
    stop(); edge = which; y = 0;
    v = sign() * Math.max(500, Math.min(3200, Math.abs(speed) * 0.7));
    spring();
  };
  const maxY = () => document.documentElement.scrollHeight - innerHeight;
  const atTop = () => scrollY <= 0;
  const atBottom = () => scrollY >= maxY() - 1;

  // Flings, from any input (trackpad coasting, a flicked phone, the mouse wheel): watch the scroll
  // speed, and when it arrives at an edge still moving, bounce.
  let py = scrollY, pt = performance.now(), speed = 0, quietUntil = 0, programmatic = false;
  addEventListener('scroll', () => {
    const now = performance.now(), dt = Math.max(1, now - pt);
    const sp = ((scrollY - py) / dt) * 1000;
    speed = speed * 0.4 + sp * 0.6;
    const arrivedTop = scrollY <= 0 && py > 0, arrivedBottom = scrollY >= maxY() - 1 && py < maxY() - 1;
    if (!programmatic && touching === null && (arrivedTop || arrivedBottom)) {
      impact(arrivedTop ? 'top' : 'bottom', speed);       // even a slow arrival gets a small bounce
      quietUntil = now + 160;                             // the coasting that follows is the same fling
    }
    if (arrivedTop || arrivedBottom) programmatic = false;
    py = scrollY; pt = now;
  }, { passive: true });
  if (end) $('.hr-top', end).addEventListener('click', () => { programmatic = true; }, true);   // "Back to the top" just arrives

  // Trackpad and wheel at an edge. Coasting after a fling keeps sending wheel events: those are
  // swallowed (quietUntil, kept alive while they keep coming), so it doesn't hang stretched.
  let pulled = 0, peak = 0, weak = 0, idle = 0;
  const letGo = () => { clearTimeout(idle); pulled = peak = weak = 0; if (edge && !raf) spring(); };
  addEventListener('wheel', (e) => {
    if (lessMotion() || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || document.documentElement.classList.contains('drawer-open')) return;
    if (e.target.closest?.('.results-pop, .menu, .acct-menu, dialog, [role="dialog"], .lang-menu')) return;
    const now = performance.now();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    if (now < quietUntil) { quietUntil = now + 160; return; }
    const want = dy < 0 && atTop() ? 'top' : dy > 0 && atBottom() ? 'bottom' : null;
    if (!pulled) {
      if (!want) return;
      if (raf && edge !== want) return;
      edge = want;
      pulled = raf ? Math.abs(y) * 2 : 0;                  // catch it mid-spring and keep pulling
    }
    const d = edge === 'top' ? -dy : dy;
    // once the pull is over its peak and the deltas fade, the fingers have lifted: let go now
    peak = Math.max(peak, Math.abs(d));
    weak = d > 0 && peak > 6 && d < peak * 0.5 ? weak + 1 : 0;
    if (weak >= 2) { letGo(); quietUntil = now + 160; return; }
    pulled = Math.max(0, pulled + d);
    if (!pulled) { stop(); y = 0; apply(); edge = null; return; }
    pullTo(pulled);
    clearTimeout(idle);
    idle = setTimeout(letGo, 70);
  }, { passive: true });

  // Touch: a pull that starts at an edge (flicks into an edge are caught by the scroll watcher)
  let touching = null, anchor = null;
  addEventListener('touchstart', (e) => { if (e.touches.length === 1) { touching = e.touches[0].clientY; anchor = null; } }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (touching === null || lessMotion() || e.touches.length !== 1) return;
    const ty = e.touches[0].clientY, down = ty > touching;
    if (anchor === null) {
      const want = down && atTop() ? 'top' : !down && atBottom() ? 'bottom' : null;
      touching = ty;
      if (!want) return;
      edge = want; anchor = ty - (raf ? sign() * Math.abs(y) * 2 : 0);
      stop();
      return;
    }
    const d = edge === 'top' ? ty - anchor : anchor - ty;
    if (d <= 0) { anchor = null; y = 0; apply(); edge = null; touching = ty; return; }
    pullTo(d);
  }, { passive: true });
  const up = () => { if (anchor !== null) spring(); touching = anchor = null; };
  addEventListener('touchend', up, { passive: true });
  addEventListener('touchcancel', up, { passive: true });
}
