// The welcome tour: speech bubbles that point at the header's buttons and say
// what each one is for. It starts right after a member agrees to the Terms,
// which happens once per person on their first sign-in (termsGate in ui.js),
// and Settings → Pages can replay it. It stores nothing.
//
// Steps whose button isn't on screen (a phone layout, a hidden Contribute
// button, review-team links for everyone else) are skipped, so one list serves
// every visitor. A step's `sel` is a list: the first visible match wins.

import { $, esc, lessMotion } from './ui.js';

const STEPS = (name) => [
  { title: `Welcome, ${name}!`, text: 'Here’s a 30-second look at where everything is. You can leave any time.', next: 'Show me' },
  { sel: ['.main-nav a[href$="map/"]'], title: 'Campus map',
    text: 'Find any room, who teaches there and when. There’s a 3D campus you can walk around, too.' },
  { sel: ['.main-nav a[href$="subjects/"]'], title: 'Classes',
    text: 'Every class at Wilcox, by subject: test style, grading, homework and tips from students who took it.' },
  { sel: ['.main-nav a[href$="guides/"]'], title: 'Study guides', text: 'Study guides students made, connected by class and topic.' },
  { sel: ['.main-nav .more summary'], title: 'More',
    text: 'The bell schedule, calendar, cafeteria menu, clubs, sports, teachers and Settings.' },
  { sel: ['.hsearch', '.search-btn', '.hero .big-search'], title: 'Search',
    text: navigator.platform?.startsWith('Mac') ? 'Classes, teachers, rooms, clubs and more. Press ⌘K from any page.'
      : 'Classes, teachers, rooms, clubs and more. Press Ctrl K from any page.' },
  { sel: ['#lang-btn'], title: 'Language', text: 'Read Wilkipedia in 15 languages.' },
  { sel: ['#theme-toggle'], title: 'Night mode', text: 'Switch between day and night. Bigger text and other options are in Settings.' },
  { sel: ['#contribute-fab'], title: 'Contribute',
    text: 'Know something about a class? Add info, a tip or a study guide. Reviewers check it, and you earn points on the Leaderboard.' },
  { sel: ['#bounty-tab'], title: 'Bounties', text: 'Pages that still need writing. Claim one and write it up.' },
  { sel: ['.nav-review'], title: 'Review desk', text: 'Check what students send in before it’s published.' },
  { sel: ['.auth .who'], title: 'Your account', text: 'Change your name, pick a picture, set your class year and see your notifications.' },
  { title: 'That’s it!', text: 'You can take this tour again any time from Settings. Thanks for helping build Wilkipedia.', next: 'Done' },
];

const visible = (el) => {
  if (!el || el.closest('[hidden]')) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const find = (sel) => sel?.map((s) => $(s)).find(visible) || null;

let active = null;

export function startTour(name = 'there') {
  active?.end();
  const steps = STEPS(name).filter((s) => !s.sel || find(s.sel));
  let i = 0;
  let target = null;

  const root = document.createElement('div');
  root.className = 'tour' + (lessMotion() ? ' still' : '');
  root.innerHTML = `<div class="tour-spot"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-x">
      <span class="tour-arrow" aria-hidden="true"></span>
      <p class="tour-n"></p><h2 id="tour-t"></h2><p id="tour-x"></p>
      <div class="tour-acts"><button type="button" class="tour-skip">Skip tour</button><span></span>
        <button type="button" class="btn ghost small tour-back">Back</button><button type="button" class="btn small tour-next">Next</button></div>
    </div>`;
  const spot = $('.tour-spot', root), bubble = $('.tour-bubble', root), arrow = $('.tour-arrow', root);

  function place() {
    const pad = 6, gap = 14, m = 12;
    root.classList.toggle('free', !target);          // before measuring: it changes the width
    const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    if (!target) {
      bubble.style.left = `${Math.max(m, (innerWidth - bw) / 2)}px`;
      bubble.style.top = `${Math.max(m, (innerHeight - bh) / 2)}px`;
      return;
    }
    const r = target.getBoundingClientRect();
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    // Below the button if it fits, otherwise above (the corner buttons)
    const below = r.bottom + pad + gap + bh <= innerHeight - m || r.top < innerHeight / 2;
    const top = below ? r.bottom + pad + gap : r.top - pad - gap - bh;
    const cx = r.left + r.width / 2;
    const left = Math.min(Math.max(m, cx - bw / 2), innerWidth - bw - m);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(m, top)}px`;
    arrow.className = 'tour-arrow ' + (below ? 'up' : 'down');
    arrow.style.left = `${Math.min(Math.max(18, cx - left), bw - 18)}px`;
  }

  function show(n) {
    i = n;
    const s = steps[i];
    target = s.sel ? find(s.sel) : null;
    if (target && !target.closest('header, .fab, .bounty-fab, .contribute-fab')) target.scrollIntoView({ block: 'center' });
    $('.tour-n', root).textContent = s.sel ? `${steps.filter((x) => x.sel).indexOf(s) + 1} of ${steps.filter((x) => x.sel).length}` : '';
    $('#tour-t', root).textContent = s.title;
    $('#tour-x', root).innerHTML = esc(s.text);
    $('.tour-back', root).hidden = i <= 1;       // nothing to go back to before the first button
    $('.tour-skip', root).hidden = i === steps.length - 1;
    $('.tour-next', root).textContent = s.next || (i === steps.length - 2 ? 'Finish' : 'Next');
    place();
    $('.tour-next', root).focus({ preventScroll: true });
  }

  const onKey = (e) => {
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft' && i > 1) show(i - 1);
    else if (e.key === 'Tab') {                 // keep focus inside the bubble
      const f = [...bubble.querySelectorAll('button:not([hidden])')];
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  };
  const next = () => (i < steps.length - 1 ? show(i + 1) : end());
  function end() {
    root.remove();
    removeEventListener('resize', place);
    removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey, true);
    active = null;
  }

  $('.tour-next', root).onclick = next;
  $('.tour-back', root).onclick = () => show(i - 1);
  $('.tour-skip', root).onclick = end;
  // A click on the dimmed page moves on, like most tours; the page itself is
  // blocked until the tour ends so nobody navigates away mid-sentence.
  root.addEventListener('click', (e) => { if (e.target === root || e.target === spot) next(); });
  addEventListener('resize', place);
  addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey, true);
  document.body.append(root);
  active = { end };
  show(0);
}
