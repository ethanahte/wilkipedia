// Hover previews: rest the pointer on any link to a class page (lists, teacher
// pages, search results, "Recently added"…) and a small card shows what the
// class is before you click. Mouse/trackpad only; touch screens never see it.
// The pathways map and the search palette have their own previews, so links
// inside them are skipped.

import { esc, courses, dataUrl } from './ui.js';

let card, timer, data, pw, has = new Set(), current = null;
const SKIP = '.pw-svg, .palette, .peek, .entry-toc, nav.crumbs';

async function prime(store) {
  if (data) return;
  const [c, p] = await Promise.all([courses(), fetch(dataUrl('data/pathways.json')).then((r) => r.json()).catch(() => null)]);
  data = { by: Object.fromEntries(c.courses.map((x) => [x.slug, x])), dept: Object.fromEntries(c.departments.map((d) => [d.slug, d.name])) };
  if (p) {
    pw = { out: {}, prereq: {} };
    for (const e of p.edges) (pw.out[e.from] ||= []).push(e.to);
    for (const n of p.nodes) if (n.prereq && !/^none\.?$/i.test(n.prereq.trim())) pw.prereq[n.slug] = n.prereq;   // the catalog sometimes just says "None"
  }
  store?.contentIndex?.().then((h) => { has = h; }).catch(() => {});
}

function slugOf(a) {
  const m = a.getAttribute('href')?.match(/courses\/([a-z0-9-]+)\/?(?:#.*)?$/);
  return m ? m[1] : null;
}

function show(a, slug) {
  const c = data?.by[slug];
  if (!c) return;
  if (!card) { card = document.createElement('div'); card.className = 'peek'; card.setAttribute('role', 'tooltip'); document.body.append(card); }
  const leads = (pw?.out[slug] || []).map((s) => data.by[s]?.name).filter(Boolean);
  card.innerHTML = `<div class="meta">${esc(data.dept[c.department] || '')}${c.grades ? ` · grades ${esc(c.grades)}` : ''}${c.ucCsu ? ` · a–g ${esc(c.ucCsu)}` : ''}</div>
    <b>${esc(c.name)}</b>
    ${c.teachers?.length ? `<p>${c.teachers.slice(0, 3).map(esc).join(', ')}${c.teachers.length > 3 ? ` and ${c.teachers.length - 3} more` : ''}</p>` : ''}
    ${pw?.prereq[slug] ? `<p class="peek-k">Needs: “${esc(pw.prereq[slug])}”</p>` : ''}
    ${leads.length ? `<p class="peek-k">Leads to: ${leads.map(esc).join(', ')}</p>` : ''}
    <p class="peek-status ${has.has(slug) ? 'yes' : ''}">${has.has(slug) ? 'Students have written about it' : 'Not written yet'}</p>`;
  const r = a.getBoundingClientRect();
  card.style.visibility = 'hidden';
  card.classList.add('on');
  const w = card.offsetWidth, h = card.offsetHeight;
  const left = Math.min(Math.max(12, r.left), innerWidth - w - 12);
  const below = r.bottom + 10 + h < innerHeight;
  card.style.left = `${left}px`;
  card.style.top = `${below ? r.bottom + 8 : r.top - h - 8}px`;
  card.style.visibility = '';
  current = a;
}
function hide() { clearTimeout(timer); card?.classList.remove('on'); current = null; }

export function init(store) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || a === current) return;
    if (a.closest(SKIP)) return;
    const slug = slugOf(a);
    if (!slug || location.pathname.endsWith(`/courses/${slug}/`)) return;   // not a link to the page you're on
    clearTimeout(timer);
    timer = setTimeout(async () => { await prime(store); if (a.matches(':hover')) show(a, slug); }, 380);
  });
  document.addEventListener('pointerout', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && !a.contains(e.relatedTarget)) hide();
  });
  addEventListener('scroll', hide, { passive: true });
  document.addEventListener('click', hide, true);
}

