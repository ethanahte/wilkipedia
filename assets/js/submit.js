// The contribution form. Arrives pre-filled from links elsewhere:
//   ?course=<slug>&kind=<kind>&teacher=<name>   (from a course page)
//   ?bounty=<id>                                 (from a claimed bounty)

import { initHeader, requireUser, renderFields, suggestions, drafts, courses, dataUrl, $, $$, esc, guard, courseUrl, root } from './ui.js';
import { KINDS, schoolYear } from './forms.js';

const s = await initHeader();
const q = new URLSearchParams(location.search);
const data = await courses();
// Club and team names, so club/sport submissions land on the right card
const acts = await fetch(dataUrl('data/activities.json')).then((r) => (r.ok ? r.json() : null)).catch(() => null);
suggestions.clubs = acts?.clubs?.map((c) => c.name) ?? [];
suggestions.sports = acts?.sports?.map((c) => c.name) ?? [];
// 'staff' (a room schedule) names a teacher but no course: a schedule spans several
const noCourse = (scope) => scope === 'school' || scope === 'activity' || scope === 'staff';
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
const allTeachers = [...new Set(data.courses.flatMap((c) => c.teachers || []))].sort((a, b) => a.localeCompare(b));
// The Period grid suggests the chosen teacher's classes first, then every class
function periodSuggestions() {
  const mine = data.courses.filter((c) => state.teacher && (c.teachers || []).includes(state.teacher)).map((c) => c.name);
  suggestions.periods = [...mine, ...data.courses.map((c) => c.name).filter((n) => !mine.includes(n))];
  const dl = $('#dl-periods');
  if (dl) dl.innerHTML = ['Prep', ...suggestions.periods].map((o) => `<option value="${esc(o)}">`).join('');
}
let bounties = [];
let form = null;

const state = {
  kind: q.get('kind') in KINDS ? q.get('kind') : null,
  course: bySlug[q.get('course')] ? q.get('course') : '',
  teacher: q.get('teacher') || '',
  bounty: q.get('bounty') || '',
};

// Kind picker
$('#kinds').innerHTML = Object.entries(KINDS).map(([k, d]) => `
  <label class="kind-card"><input type="radio" name="kind" value="${k}" ${state.kind === k ? 'checked' : ''}>
    <b>${esc(d.label)}</b><span>${esc(d.blurb)}</span></label>`).join('');

// Course picker: a <datalist> over the whole catalog
$('#course-list').innerHTML = data.courses.map((c) => `<option value="${esc(c.name)}">`).join('');
if (state.course) $('#course').value = bySlug[state.course].name;

function courseFromInput() {
  const v = $('#course').value.trim().toLowerCase();
  return data.courses.find((c) => c.name.toLowerCase() === v)?.slug || '';
}

function paintTeacher() {
  const scope = state.kind && KINDS[state.kind].scope;
  const wants = scope === 'teacher' || scope === 'course-or-teacher' || scope === 'staff';
  $('#teacher-row').hidden = !wants;
  if (!wants) return;
  const list = scope === 'staff' ? allTeachers : bySlug[state.course]?.teachers || [];
  $('#teacher-label').innerHTML = scope === 'teacher' || scope === 'staff'
    ? 'Teacher <span class="req">*</span>' : 'Teacher <span class="hint-inline">(optional)</span>';
  $('#teacher').innerHTML = `<option value="">${scope === 'teacher' || scope === 'staff' ? 'Choose…' : 'All teachers / not specific'}</option>`
    + list.map((t) => `<option ${t === state.teacher ? 'selected' : ''}>${esc(t)}</option>`).join('')
    + `<option value="__other" ${state.teacher && !list.includes(state.teacher) ? 'selected' : ''}>Someone not listed…</option>`;
  $('#teacher-other').hidden = $('#teacher').value !== '__other';
  if (!$('#teacher-other').hidden) $('#teacher-other').value = state.teacher;
}

// The draft is keyed by what's being written, so two different forms don't mix
const draftKey = () => `submit:${state.kind}:${courseFromInput() || '-'}:${state.bounty || '-'}`;
function saveDraft() {
  if (!state.kind || !form) return;
  const v = form.values();
  const teacher = $('#teacher-row').hidden ? '' : ($('#teacher').value === '__other' ? $('#teacher-other').value : $('#teacher').value);
  if (Object.keys(v).some((k) => k !== 'school_year')) drafts.set(draftKey(), { values: v, teacher });
}

function paint() {
  const scope = state.kind && KINDS[state.kind].scope;
  $('#step2').hidden = !state.kind;
  if (!state.kind) return;
  const keep = form && $('#fields').dataset.kind === state.kind ? form.values() : null;   // never wipe typing
  $('#course-row').hidden = noCourse(scope);
  paintTeacher();
  const preset = {};
  if (q.get('room')) preset.room = q.get('room').toUpperCase();
  if (q.get('name')) preset.name = q.get('name');
  if (state.kind === 'room_schedule') preset.school_year = schoolYear(0);   // this year's, unless they change it
  const draft = drafts.get(draftKey());
  if (draft?.teacher && !state.teacher) state.teacher = draft.teacher;
  periodSuggestions();
  form = renderFields($('#fields'), state.kind, { ...preset, ...(draft?.values || {}), ...(keep || {}) });
  $('#fields').dataset.kind = state.kind;
  $('#draft-note').hidden = !draft;
  const mine = bounties.filter((b) => b.status === 'open' && (b.claims.some((c) => c.user_id === s.user()?.id) || b.id === state.bounty));
  $('#bounty').innerHTML = '<option value="">Not part of a bounty</option>'
    + mine.map((b) => `<option value="${esc(b.id)}" ${b.id === state.bounty ? 'selected' : ''}>${esc(b.id)} · ${esc(b.title)}</option>`).join('');
  $('#bounty-row').hidden = !mine.length;
}

$('#kinds').addEventListener('change', (e) => { state.kind = e.target.value; paint(); });
$('#course').addEventListener('change', () => { state.course = courseFromInput(); state.teacher = ''; paintTeacher(); });
$('#teacher').addEventListener('change', () => {
  $('#teacher-other').hidden = $('#teacher').value !== '__other';
  state.teacher = $('#teacher').value === '__other' ? '' : $('#teacher').value;
  periodSuggestions();
});

$('#submit-form').addEventListener('input', saveDraft);
$('#submit-form').addEventListener('change', saveDraft);
$('#discard-draft').addEventListener('click', () => {
  drafts.clear(draftKey());
  form = null;
  $('#fields').dataset.kind = '';
  paint();
});

$('#submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const scope = KINDS[state.kind].scope;
  const err = (m) => { $('#form-error').textContent = m; $('#form-error').hidden = false; };
  $('#form-error').hidden = true;

  state.course = courseFromInput();
  if (!noCourse(scope) && !state.course) return err('Pick a course from the list.');
  const teacher = $('#teacher-row').hidden ? null
    : ($('#teacher').value === '__other' ? $('#teacher-other').value.trim() : $('#teacher').value) || null;
  if ((scope === 'teacher' || scope === 'staff') && !teacher) return err('Pick which teacher this is about.');
  const missing = form.check();
  if (missing) return err(missing);
  if (!$('#rules-ok').checked) return err('Please confirm the two rules at the bottom.');
  if (!(await requireUser(s, 'to submit'))) return;

  const ok = await guard(() => s.submit({
    kind: state.kind,
    course_slug: noCourse(scope) ? null : state.course,
    teacher,
    bounty_id: $('#bounty').value || null,
    payload: form.values(),
  }));
  if (!ok) return;
  drafts.clear(draftKey());
  $('#submit-form').hidden = true;
  $('#done').hidden = false;
  const back = { club: [`${root}clubs/`, 'clubs'], sport: [`${root}sports/`, 'sports'], room_schedule: [`${root}map/`, 'the map'] }[state.kind];
  $('#done-course').innerHTML = back ? `<a class="btn ghost" href="${back[0]}">Back to ${back[1]}</a>`
    : !noCourse(scope) && state.course
      ? `<a class="btn ghost" href="${courseUrl(state.course)}">Back to ${esc(bySlug[state.course].name)}</a>` : '';
  scrollTo(0, 0);
});

$('#again').addEventListener('click', () => {
  $('#submit-form').reset();
  if (state.course) $('#course').value = bySlug[state.course].name;
  $('#submit-form').hidden = false;
  $('#done').hidden = true;
  paint();
});

bounties = await s.bounties();
if (state.bounty) {
  const b = bounties.find((x) => x.id === state.bounty);
  if (b) {
    state.kind ??= b.kind in KINDS ? b.kind : null;
    if (b.course_slug && bySlug[b.course_slug]) { state.course = b.course_slug; $('#course').value = bySlug[b.course_slug].name; }
    state.teacher ||= b.teacher || '';
    $('#bounty-brief').hidden = false;
    $('#bounty-brief').innerHTML = `<b>${esc(b.id)} · ${esc(b.title)}</b>
      ${b.done_means ? `<p><b>Done means:</b> ${esc(b.done_means)}</p>` : ''}
      <p class="meta">A big bounty can take several submissions (an overview, a teacher section, tips…). Tag each one with this bounty.</p>`;
    $$('#kinds input').forEach((i) => (i.checked = i.value === state.kind));
  }
}
s.onAuth(() => { saveDraft(); paint(); });
paint();
