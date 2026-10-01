// The bell schedule: a compact "what's happening now" strip for the home page,
// and the full tables for School info. Data: data/bell.json (from the school's
// official page). Times are the viewer's clock, which for Wilcox students is
// Pacific time.

import { dataUrl, esc, $, lessMotion, root } from './ui.js';
import { t, periodName, translating } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const clock = (t) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)}`; };
const dayName = (d) => t(d.toLocaleDateString('en-US', { weekday: 'long' }));

let bellData;
export const loadBell = () => (bellData ??= fetch(dataUrl('data/bell.json')).then((r) => r.json()));

// What kind of day `d` is: {off}, {adjusted}, or a schedule {key, label, periods}
export function dayPlan(bell, d) {
  const sp = bell.special.find((s) => s.dates.includes(iso(d)));
  if (sp?.off) return { off: sp.off };
  if (sp?.adjusted) return { adjusted: sp.adjusted };
  const key = sp?.schedule || bell.weekdays[d.getDay()];
  if (!key) return { off: 'Weekend' };
  return { key, ...bell.schedules[key] };
}

export function nextSchoolDay(bell, from) {
  const d = new Date(from);
  for (let i = 0; i < 21; i++) {
    d.setDate(d.getDate() + 1);
    const p = dayPlan(bell, d);
    if (p.periods || p.adjusted) return [new Date(d), p];
  }
  return [null, null];
}

// Where we are in the day right now
function where(plan, now) {
  const m = now.getHours() * 60 + now.getMinutes();
  const ps = plan.periods;
  if (m < mins(ps[0][1])) return { state: 'before', next: ps[0], left: mins(ps[0][1]) - m };
  for (let i = 0; i < ps.length; i++) {
    const [, a, b] = ps[i];
    if (m >= mins(a) && m < mins(b)) return { state: 'during', i, cur: ps[i], left: mins(b) - m, next: ps[i + 1] };
    if (ps[i + 1] && m >= mins(b) && m < mins(ps[i + 1][1])) return { state: 'passing', i: i + 1, next: ps[i + 1], left: mins(ps[i + 1][1]) - m };
  }
  return { state: 'after' };
}

const left = (n) => (n >= 60 ? `${Math.floor(n / 60)} ${t('hr')} ${n % 60} ${t('min')}` : `${n} ${t('min')}`);

function stripHtml(bell, now) {
  const plan = dayPlan(bell, now);
  let head, status, chips = '';
  if (plan.periods) {
    const w = where(plan, now);
    head = translating ? esc(dayName(now)) : `${esc(dayName(now))} · ${esc(plan.label.replace(/^\w+(\/\w+)? · /, ''))}`;
    status = w.state === 'during' ? `<b>${t('Now')}: ${esc(periodName(w.cur[0]))}</b> · ${t('ends {t}', { t: clock(w.cur[2]) })} <span class="bell-left">${t('{t} left', { t: left(w.left) })}</span>`
      : w.state === 'passing' ? `<b>${t('Passing period')}</b> · ${esc(periodName(w.next[0]))} ${t('starts {t}', { t: clock(w.next[1]) })} <span class="bell-left">${t('in {t}', { t: left(w.left) })}</span>`
      : w.state === 'before' ? `<b>${t('School starts')} ${clock(w.next[1])}</b> <span class="bell-left">${t('in {t}', { t: left(w.left) })}</span>`
      : null;
    if (w.state === 'after') {
      const [d, p] = nextSchoolDay(bell, now);
      status = `<b>${t('School’s out.')}</b>${d ? ` ${t('Next')}: ${esc(dayName(d))}${p.periods ? `, ${t('first bell {t}', { t: clock(p.periods[0][1]) })}` : ''}` : ''}`;
    }
    chips = plan.periods.map(([name, a, b], i) => `<li class="${w.i === i ? 'on' : ''}${w.state === 'after' || (w.i ?? 99) > i ? ' done' : ''}">
      <span>${esc(periodName(name.replace(/ \+ announcements/, '')))}${/announcements/.test(name) ? '+' : ''}</span><small>${clock(a)}–${clock(b)}</small></li>`).join('');
  } else {
    const [d, p] = nextSchoolDay(bell, now);
    head = `${esc(dayName(now))}`;
    status = plan.adjusted
      ? `<b>Adjusted schedule today:</b> ${esc(plan.adjusted)}. <a href="${esc(bell.source)}" target="_blank" rel="noopener">Official times ↗</a>`
      : `<b>${t('No school')}${plan.off === 'Weekend' ? '' : ` · ${esc(plan.off)}`}</b>${d ? ` · ${t('Next')}: ${esc(dayName(d))}${p.periods ? `, ${t('first bell {t}', { t: clock(p.periods[0][1]) })}` : ''}` : ''}`;
  }
  return `<div class="bell-top">
      <div class="bell-text"><span class="bell-day" translate="no">${t('Bell schedule')} · ${head}</span><span class="bell-status" translate="no">${status}</span></div>
      <a class="bell-more" href="${root}bell/" translate="no">${t('Full schedule')} →</a></div>
    ${chips ? `<ol class="bell-chips" translate="no">${chips}</ol>` : ''}`;
}

// The strip on the home page. Re-renders every 30 s so "now" stays true.
export async function mountBellStrip(el, { expandable = true } = {}) {
  const bell = await loadBell();
  const paint = () => {
    el.innerHTML = stripHtml(bell, new Date());
    if (!expandable) $('.bell-more', el).remove();
    // centre the current period in its own row, without moving the page
    const row = $('.bell-chips', el), on = row && $('.on', row);
    if (on) row.scrollLeft = on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2;
  };
  paint();
  setInterval(paint, 30000);
}

// ── the Bell schedule page (redesigned 2026-10-01, Ethan: "even better") ──
// The page answers "what time is it": Now (the current period big, a countdown in a ring that ticks
// every second, the day as a timeline with a needle, today's end, the weekend and the next day
// off), This week (Mon–Fri, each period a block at its real time) and every schedule. Dates (days
// off, breaks, the school year) live on the Calendar. All from data/bell.json.
const DAY0 = 8 * 60 + 30, DAY1 = 16 * 60;                 // the week view spans 8:30–4:00
const short = (n) => periodName(n.replace(/ \+ announcements/, ''));
const hms = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`; };

export async function mountBellPage() {
  const bell = await loadBell();
  const nowEl = $('#bp-now'), weekEl = $('#bp-week'), allEl = $('#bp-all');

  // the day as a bar: each period sized by its length, the needle at now
  const timeline = (plan, now, live) => {
    const ps = plan.periods, a0 = mins(ps[0][1]), a1 = mins(ps.at(-1)[2]), span = a1 - a0;
    const m = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const seg = ps.map(([n, a, b]) => {
      const l = ((mins(a) - a0) / span) * 100, w = ((mins(b) - mins(a)) / span) * 100;
      const st = live && m >= mins(b) ? 'past' : live && m >= mins(a) ? 'on' : '';
      return `<li class="${st}${/lunch|brunch/i.test(n) ? ' meal' : ''}" style="left:${l}%;width:${w}%"><b>${esc(short(n).replace(/(\d)(st|nd|rd|th) Period/, 'P$1').replace(/^Period (\d)/, 'P$1'))}</b><small>${clock(a)}</small></li>`;
    }).join('');
    const needle = live && m >= a0 && m <= a1 ? `<i class="bp-needle" style="left:${((m - a0) / span) * 100}%"></i>` : '';
    return `<div class="bp-line"><ol>${seg}</ol>${needle}</div><div class="bp-ends"><span>${clock(ps[0][1])}</span><span>${clock(ps.at(-1)[2])}</span></div>`;
  };
  // the next day off after you're back: on a holiday, tomorrow's holiday is the same break
  const nextOff = (from) => {
    const d = new Date(from); d.setHours(12);
    if (!dayPlan(bell, d).periods && !dayPlan(bell, d).adjusted) { const [back] = nextSchoolDay(bell, d); if (back) { d.setTime(back.getTime()); d.setHours(12); } }
    for (let i = 1; i < 200; i++) { d.setDate(d.getDate() + 1); const p = dayPlan(bell, d); if (p.off && p.off !== 'Weekend') return [new Date(d), p.off, i]; }
    return null;
  };

  // the countdown in a ring that fills as the period goes; digits that change roll in
  let lastCount = '';
  const ring = ([text, label], p) => {
    const C = 2 * Math.PI * 92, roll = !lessMotion();
    const digits = [...text].map((ch, i) => `<span class="${roll && lastCount && lastCount[i] !== ch && /\d/.test(ch) ? 'roll' : ''}">${ch}</span>`).join('');
    lastCount = text;
    const ticks = Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2, r0 = i % 5 ? 101 : 98;
      return `<line x1="${110 + Math.sin(a) * r0}" y1="${110 - Math.cos(a) * r0}" x2="${110 + Math.sin(a) * 105}" y2="${110 - Math.cos(a) * 105}"/>`; }).join('');
    return `<div class="bp-ring" role="timer" aria-label="${esc(text)} ${esc(label)}">
      <svg viewBox="0 0 220 220" aria-hidden="true"><g class="bp-ticks">${ticks}</g><circle class="bp-ring-bg" cx="110" cy="110" r="92"/>
        <circle class="bp-ring-fg" cx="110" cy="110" r="92" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.max(0, Math.min(1, p)))).toFixed(1)}"/>
        <circle class="bp-ring-dot" cx="${110 + Math.sin(p * Math.PI * 2) * 92}" cy="${110 - Math.cos(p * Math.PI * 2) * 92}" r="6"/></svg>
      <p class="bp-count"><span class="bp-digits">${digits}</span><small>${esc(label)}</small></p></div>`;
  };

  const paintNow = () => {
    const now = new Date(), plan = dayPlan(bell, now), secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    let kicker = esc(dayName(now)), big = '', sub = '', count = '', prog = null, line = '', ringP = 0;
    if (plan.periods) {
      kicker += ` · ${esc(plan.label.replace(/^\w+(\/\w+)? · /, ''))}`;
      const w = where(plan, now);
      const until = (t) => mins(t) * 60 - secs;
      if (w.state === 'during') {
        big = esc(short(w.cur[0])); sub = `${clock(w.cur[1])} – ${clock(w.cur[2])}${/announcements/.test(w.cur[0]) ? ' · with announcements' : ''}`;
        count = [hms(until(w.cur[2])), 'left'];
        prog = ringP = (secs - mins(w.cur[1]) * 60) / ((mins(w.cur[2]) - mins(w.cur[1])) * 60);
        if (w.next) sub += ` · then ${esc(short(w.next[0]))} at ${clock(w.next[1])}`;
      } else if (w.state === 'passing') {
        big = 'Passing period'; sub = `${esc(short(w.next[0]))} starts at ${clock(w.next[1])}`; count = [hms(until(w.next[1])), 'to the bell'];
        const gapA = mins(plan.periods[w.i - 1][2]) * 60, gapB = mins(w.next[1]) * 60; ringP = (secs - gapA) / Math.max(1, gapB - gapA);
      } else if (w.state === 'before') {
        big = 'Before school'; sub = `First bell at ${clock(w.next[1])}`; count = [hms(until(w.next[1])), 'to the first bell'];
        ringP = 1 - Math.min(1, until(w.next[1]) / 3600);                  // the ring fills over the last hour
      } else {
        big = 'School’s out';
        const [d, p] = nextSchoolDay(bell, now);
        sub = d ? `Next: ${esc(dayName(d))}${p.periods ? ` · ${esc(p.label.replace(/^\w+(\/\w+)? · /, ''))} · first bell ${clock(p.periods[0][1])}` : ''}` : '';
      }
      line = timeline(plan, now, true);
    } else {
      const [d, p] = nextSchoolDay(bell, now);
      big = plan.adjusted ? 'Adjusted schedule' : plan.off === 'Weekend' ? 'No school today' : esc(plan.off);
      sub = plan.adjusted ? `${esc(plan.adjusted)}. The school hasn’t posted times. <a href="${esc(bell.source)}" target="_blank" rel="noopener">Official page ↗</a>`
        : d ? `Back ${esc(dayName(d))}, ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${p.periods ? ` · first bell ${clock(p.periods[0][1])}` : ''}` : '';
      if (d && p.periods) line = `<p class="bp-line-h">${esc(dayName(d))} · ${esc(p.label.replace(/^\w+(\/\w+)? · /, ''))}</p>${timeline(p, d, false)}`;
    }
    const off = nextOff(now);
    // the weekend starts at Friday's last bell
    const fri = new Date(now); fri.setHours(12, 0, 0, 0); fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7));
    const fp = dayPlan(bell, fri), fEnd = new Date(fri);
    if (fp.periods) fEnd.setHours(Number(fp.periods.at(-1)[2].slice(0, 2)), Number(fp.periods.at(-1)[2].slice(3)), 0, 0);
    const toWk = fEnd - now, wk = now.getDay() === 0 || now.getDay() === 6 || toWk <= 0 ? 'Now'
      : `${Math.floor(toWk / 864e5) ? `${Math.floor(toWk / 864e5)} d ` : ''}${Math.floor((toWk % 864e5) / 36e5)} h ${Math.floor((toWk % 36e5) / 6e4)} min`;
    const facts = [plan.periods ? ['Today ends', clock(plan.periods.at(-1)[2])] : null, ['The weekend', wk === 'Now' ? 'It’s here' : `in ${wk}`],
      off ? ['Next day off', `<a href="${root}calendar/">${off[0].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${esc(off[1])}</a><small>in ${Math.round((off[0] - new Date(new Date(now).setHours(12, 0, 0, 0))) / 864e5)} days</small>`] : null].filter(Boolean);
    nowEl.innerHTML = `<div class="bp-now-main"><p class="c-kicker" translate="no">${kicker}</p><h2 class="bp-big">${big}</h2><p class="bp-sub">${sub}</p>
        ${prog !== null ? `<span class="bp-prog" role="img" aria-label="${Math.round(prog * 100)}% through"><i style="width:${(prog * 100).toFixed(1)}%"></i></span>` : ''}</div>
      ${count ? ring(count, ringP) : ''}
      <div class="bp-day">${line}</div>
      ${facts.length ? `<dl class="bp-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>` : ''}`;
  };

  // this week, Monday to Friday (next week from Saturday on)
  const paintWeek = () => {
    const now = new Date(), mon = new Date(now); mon.setHours(12, 0, 0, 0);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) + (now.getDay() === 6 || now.getDay() === 0 ? 7 : 0));
    const m = now.getHours() * 60 + now.getMinutes();
    const top = (t) => ((mins(t) - DAY0) / (DAY1 - DAY0)) * 100;
    const days = [0, 1, 2, 3, 4].map((i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      const p = dayPlan(bell, d), today = iso(d) === iso(now);
      const head = `<header><b>${d.toLocaleDateString(undefined, { weekday: 'short' })}</b><span>${d.getDate()}</span></header>`;
      const label = p.periods ? esc(p.label.replace(/^\w+(\/\w+)? · /, '')) : p.adjusted ? 'Adjusted' : esc(p.off);
      const body = p.periods ? p.periods.map(([n, a, b]) => `<li class="${/lunch|brunch/i.test(n) ? 'meal' : ''}${mins(b) - mins(a) < 45 ? ' tiny' : ''}${today && m >= mins(b) ? ' past' : ''}${today && m >= mins(a) && m < mins(b) ? ' on' : ''}"
          style="top:${top(a)}%;height:${top(b) - top(a)}%"><b>${esc(short(n))}</b><small>${clock(a)}</small></li>`).join('')
        : `<li class="bw-none">${p.adjusted ? `${esc(p.adjusted)}. No times posted.` : 'No school'}</li>`;
      const needle = today && p.periods && m >= DAY0 && m <= DAY1 ? `<i class="bw-now" style="top:${((m - DAY0) / (DAY1 - DAY0)) * 100}%"></i>` : '';
      return `<div class="bw-day${today ? ' today' : ''}${p.periods ? '' : ' off'}">${head}<p class="bw-label">${label}</p><ol class="bw-col">${body}${needle}</ol></div>`;
    }).join('');
    const hours = [9, 10, 11, 12, 13, 14, 15].map((h) => `<span style="top:${((h * 60 - DAY0) / (DAY1 - DAY0)) * 100}%">${h % 12 || 12}</span>`).join('');
    const keep = $('.bw', weekEl)?.scrollLeft;
    weekEl.innerHTML = `<div class="bw"><div class="bw-hours" aria-hidden="true"><header></header><p class="bw-label">&nbsp;</p><div class="bw-col">${hours}</div></div>${days}</div>`;
    if (keep) $('.bw', weekEl).scrollLeft = keep;                        // redraws keep the scroll
  };

  // every schedule
  const table = (key) => { const sc = bell.schedules[key];
    return `<div class="bp-table"><h3>${esc(sc.label.replace(/ · .*/, ''))}</h3><p class="c-kicker">${esc(sc.label.replace(/^[^·]*· /, ''))}</p><ol>${sc.periods.map(([n, a, b]) =>
      `<li class="${/lunch|brunch/i.test(n) ? 'meal' : ''}"><span>${esc(short(n))}${/announcements/.test(n) ? ' <em>+ announcements</em>' : ''}</span><span>${clock(a)}–${clock(b)}</span></li>`).join('')}</ol></div>`; };
  const len = (k) => mins(bell.schedules[k].periods[0][2]) - mins(bell.schedules[k].periods[0][1]);
  allEl.innerHTML = `<p class="bp-fact">Monday periods are <b>${len('monday')} minutes</b>, block-day periods <b>${len('odd')}</b>: either way each period meets about <b>${Math.round((len('monday') + 2 * len('odd')) / 10) * 10} minutes a week</b>.</p>
    <div class="bp-tables">${['monday', 'odd', 'even'].map(table).join('')}</div>
    <details class="bp-finals"><summary>Finals schedules</summary><div class="bp-tables">${['finals1', 'finals2', 'finals3'].map(table).join('')}</div></details>`;

  paintNow(); paintWeek();
  // phones: the week scrolls sideways, so start it at today (once; after that it's yours)
  const bw = $('.bw', weekEl), td = bw && $('.bw-day.today', bw);
  if (td && bw.scrollWidth > bw.clientWidth) bw.scrollLeft = td.offsetLeft - bw.offsetLeft - 40;
  setInterval(paintNow, 1000);
  setInterval(paintWeek, 30000);
}
