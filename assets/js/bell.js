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

  // ── the countdown stage (2026-10-23, Ethan: "a very cool countdown … like bell.plus") ──
  // The top of the page is a dark stage the height of the screen: how long is left in big digits that
  // roll as they change, what's on now and what's next, and behind them a clock hand sweeping round as
  // the period passes, the elapsed part shaded. The browser tab shows the countdown too, so it can sit
  // in a tab all day. Full screen (button or F) turns it into a classroom display and keeps the screen
  // awake. The last minute turns the digits gold; the bell itself flashes the stage.
  // Everything runs off the device clock against data/bell.json.
  const secsOf = (t) => mins(t) * 60;
  const nowSecs = (d) => d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
  const atTime = (d, t) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Number(t.slice(0, 2)), Number(t.slice(3)), 0, 0);
  const tidy = (label) => label.replace(/^\w+(\/\w+)? · /, '');
  // what's happening at `now`, to the second
  const phase = (now) => {
    const plan = dayPlan(bell, now), s = nowSecs(now);
    if (plan.periods) {
      const ps = plan.periods;
      if (s < secsOf(ps[0][1])) return { plan, kind: 'before', name: 'Before school', start: secsOf(ps[0][1]) - 3600, end: secsOf(ps[0][1]), next: ps[0], s };
      for (let i = 0; i < ps.length; i++) {
        const a = secsOf(ps[i][1]), b = secsOf(ps[i][2]);
        if (s >= a && s < b) return { plan, kind: /lunch|brunch/i.test(ps[i][0]) ? 'meal' : 'period', name: short(ps[i][0]), cur: ps[i], i, start: a, end: b, next: ps[i + 1], s };
        if (ps[i + 1] && s >= b && s < secsOf(ps[i + 1][1])) return { plan, kind: 'passing', name: 'Passing period', i, start: b, end: secsOf(ps[i + 1][1]), next: ps[i + 1], s };
      }
    }
    // after the last bell, or a day off: count down to the next first bell
    const [d, p] = nextSchoolDay(bell, now);
    const to = d && p.periods ? atTime(d, p.periods[0][1]) : null;
    return { plan, kind: 'off', name: plan.periods ? 'School’s out' : plan.adjusted ? 'Adjusted schedule' : plan.off === 'Weekend' ? 'Weekend' : plan.off,
             nextDay: d, nextPlan: p, to, s };
  };
  const remaining = (ph, now) => (ph.kind === 'off' ? (ph.to ? (ph.to - now) / 1000 : null) : ph.end - ph.s);
  const fmt = (sec) => {
    const n = Math.max(0, Math.ceil(sec)), dd = Math.floor(n / 86400), h = Math.floor((n % 86400) / 3600), m = Math.floor((n % 3600) / 60), x = n % 60;
    return dd ? `${dd}d ${h}:${pad(m)}` : h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
  };
  // digits that change slide down out of their window while the new one drops in, blurred in motion
  const setDigits = (box, str) => {
    const pat = str.replace(/\d/g, '0');
    if (box.dataset.pat !== pat) {
      box.dataset.pat = pat;
      box.innerHTML = [...str].map((c) => (/\d/.test(c) ? `<span class="cd-d"><span>${c}</span></span>` : /[a-z]/.test(c) ? `<span class="cd-u">${c}</span>` : `<span class="cd-sep">${c === ' ' ? '&nbsp;' : c}</span>`)).join('');
      return;
    }
    const cells = box.querySelectorAll('.cd-d');
    let k = 0;
    for (const c of str) {
      if (!/\d/.test(c)) continue;
      const cell = cells[k++], cur = cell.lastElementChild;
      if (cur.textContent === c) continue;
      if (lessMotion()) { cur.textContent = c; continue; }
      const n = document.createElement('span');
      n.textContent = c; n.className = 'in'; cur.className = 'out';
      cell.append(n);
      setTimeout(() => { if (cur.isConnected) cur.remove(); }, 460);
    }
  };
  const factsHtml = (now, plan) => {
    const off = nextOff(now);
    const fri = new Date(now); fri.setHours(12, 0, 0, 0); fri.setDate(fri.getDate() + ((5 - fri.getDay() + 7) % 7));
    const fp = dayPlan(bell, fri), fEnd = new Date(fri);
    if (fp.periods) fEnd.setHours(Number(fp.periods.at(-1)[2].slice(0, 2)), Number(fp.periods.at(-1)[2].slice(3)), 0, 0);
    const toWk = fEnd - now, wk = now.getDay() === 0 || now.getDay() === 6 || toWk <= 0 ? 'Now'
      : `${Math.floor(toWk / 864e5) ? `${Math.floor(toWk / 864e5)} d ` : ''}${Math.floor((toWk % 864e5) / 36e5)} h ${Math.floor((toWk % 36e5) / 6e4)} min`;
    const facts = [plan.periods ? ['Today ends', clock(plan.periods.at(-1)[2])] : null, ['The weekend', wk === 'Now' ? 'It’s here' : `in ${wk}`],
      off ? ['Next day off', `<a href="${root}calendar/">${off[0].toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${esc(off[1])}</a><small>in ${Math.round((off[0] - new Date(new Date(now).setHours(12, 0, 0, 0))) / 864e5)} days</small>`] : null].filter(Boolean);
    return `<dl class="cd-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  };
  const subOf = (ph) => {
    if (ph.kind === 'period' || ph.kind === 'meal') return `${clock(ph.cur[1])} – ${clock(ph.cur[2])}${/announcements/.test(ph.cur[0]) ? ' · with announcements' : ''}${ph.next ? ` · then <b>${esc(short(ph.next[0]))}</b> at ${clock(ph.next[1])}` : ' · the last bell'}`;
    if (ph.kind === 'passing') return `<b>${esc(short(ph.next[0]))}</b> starts at ${clock(ph.next[1])}`;
    if (ph.kind === 'before') return `First bell at ${clock(ph.next[1])} · ${esc(short(ph.next[0]))}`;
    if (ph.plan.adjusted) return `${esc(ph.plan.adjusted)}. The school hasn’t posted times. <a href="${esc(bell.source)}" target="_blank" rel="noopener">Official page ↗</a>`;
    return ph.nextDay ? `Back ${esc(dayName(ph.nextDay))}, ${ph.nextDay.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${ph.nextPlan.periods ? ` · first bell ${clock(ph.nextPlan.periods[0][1])}` : ''}` : '';
  };
  const unitOf = (ph) => (ph.kind === 'period' || ph.kind === 'meal' ? 'left' : ph.kind === 'passing' ? 'to the bell' : ph.kind === 'before' ? 'to the first bell' : ph.to ? 'to the first bell' : '');

  const baseTitle = document.title;
  let key = '', lastSec = -1, lastKind = '', wake = null;
  nowEl.classList.add('cd-host');
  const build = (ph, now) => {
    const kicker = `${esc(dayName(now))}${ph.plan.periods ? ` · ${esc(tidy(ph.plan.label))}` : ''}`;
    nowEl.innerHTML = `<div class="cd" data-kind="${ph.kind}">
      <div class="cd-sky" aria-hidden="true"><div class="cd-sweep"></div><div class="cd-hand"></div><div class="cd-face"></div></div>
      <div class="cd-top"><p class="cd-kicker" translate="no">Bell schedule · ${kicker}</p>
        <button type="button" class="cd-fs" aria-label="Full screen" title="Full screen (F)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Full screen</span></button></div>
      <div class="cd-mid">
        <p class="cd-digits" role="timer" aria-live="off"></p>
        <p class="cd-unit"></p>
        <h2 class="cd-name">${esc(ph.name)}</h2>
        <p class="cd-sub">${subOf(ph)}</p>
      </div>
      <div class="cd-bot"><div class="cd-day"></div><div class="cd-factsbox"></div></div>
      <a class="cd-down" href="#bp-week-h" aria-label="The week and every schedule"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></a>
    </div>`;
    $('.cd-fs', nowEl).onclick = toggleFull;
  };
  const toggleFull = async () => {
    const st = $('.cd-host');
    if (document.fullscreenElement) { await document.exitFullscreen?.(); return; }
    try { await st.requestFullscreen?.(); } catch { return; }
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }   // keep a classroom screen on
  };
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) { wake?.release?.(); wake = null; } });
  document.addEventListener('visibilitychange', async () => { if (document.fullscreenElement && document.visibilityState === 'visible' && !wake) { try { wake = await navigator.wakeLock?.request('screen'); } catch { /* fine */ } } });
  addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(e.target.tagName) && !e.target.isContentEditable) toggleFull();
  });

  // every frame: the hand and the shaded sweep (smooth, not once a second); every second: the rest
  const frame = () => {
    const now = new Date(), ph = phase(now), k = `${ph.kind}|${ph.name}|${ph.plan.key || ph.plan.off || ''}|${iso(now)}`;
    if (k !== key) {
      if (key && lastKind && !lessMotion()) nowEl.classList.add('cd-flash');           // the bell
      setTimeout(() => nowEl.classList.remove('cd-flash'), 1200);
      key = k; build(ph, now); lastSec = -1;
    }
    lastKind = ph.kind;
    const cd = $('.cd', nowEl), rem = remaining(ph, now);
    const p = ph.kind === 'off' ? 0 : Math.max(0, Math.min(1, (ph.s - ph.start) / (ph.end - ph.start)));
    cd.style.setProperty('--p', p.toFixed(5));
    const sec = Math.floor(ph.s);
    if (sec !== lastSec) {
      lastSec = sec;
      const str = rem == null ? '—' : fmt(rem);
      setDigits($('.cd-digits', cd), str);
      $('.cd-unit', cd).textContent = unitOf(ph);
      $('.cd-digits', cd).setAttribute('aria-label', `${str} ${unitOf(ph)}`);
      cd.classList.toggle('final', rem != null && rem <= 60 && ph.kind !== 'off');
      cd.classList.toggle('last10', rem != null && rem <= 10 && ph.kind !== 'off');
      if (rem != null && rem <= 10 && ph.kind !== 'off') { cd.classList.remove('beat'); void cd.offsetWidth; cd.classList.add('beat'); }
      document.title = rem == null ? baseTitle : `${str} · ${ph.name} | Wilkipedia`;
      if (sec % 5 === 0 || !$('.cd-day', cd).innerHTML) {             // the timeline's needle and the facts move slowly
        const plan = ph.plan.periods ? ph.plan : ph.nextPlan?.periods ? ph.nextPlan : null;
        $('.cd-day', cd).innerHTML = plan ? `${plan === ph.plan ? '' : `<p class="bp-line-h">${esc(dayName(ph.nextDay))} · ${esc(tidy(plan.label))}</p>`}${timeline(plan, plan === ph.plan ? now : ph.nextDay, plan === ph.plan)}` : '';
        $('.cd-factsbox', cd).innerHTML = factsHtml(now, ph.plan);
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

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

  paintWeek();
  // phones: the week scrolls sideways, so start it at today (once; after that it's yours)
  const bw = $('.bw', weekEl), td = bw && $('.bw-day.today', bw);
  if (td && bw.scrollWidth > bw.clientWidth) bw.scrollLeft = td.offsetLeft - bw.offsetLeft - 40;
  setInterval(paintWeek, 30000);
}
