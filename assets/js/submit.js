// The contribution form. Arrives pre-filled from links elsewhere:
//   ?course=<slug>&kind=<kind>&teacher=<name>   (from a course page)
//   ?bounty=<id>                                 (from a claimed bounty)

import { initHeader, requireUser, renderFields, courses, $, $$, esc, guard, courseUrl } from './ui.js';
import { KINDS } from './forms.js';

const s = await initHeader();
const q = new URLSearchParams(location.search);
const data = await courses();
const bySlug = Object.fromEntries(data.courses.map((c) => [c.slug, c]));
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
  const wants = scope === 'teacher' || scope === 'course-or-teacher';
  $('#teacher-row').hidden = !wants;
  if (!wants) return;
  const list = bySlug[state.course]?.teachers || [];
  $('#teacher-label').innerHTML = scope === 'teacher'
    ? 'Teacher <span class="req">*</span>' : 'Teacher <span class="hint-inline">(optional)</span>';
  $('#teacher').innerHTML = `<option value="">${scope === 'teacher' ? 'Choose…' : 'All teachers / not specific'}</option>`
    + list.map((t) => `<option ${t === state.teacher ? 'selected' : ''}>${esc(t)}</option>`).join('')
    + `<option value="__other" ${state.teacher && !list.includes(state.teacher) ? 'selected' : ''}>Someone not listed…</option>`;
  $('#teacher-other').hidden = $('#teacher').value !== '__other';
  if (!$('#teacher-other').hidden) $('#teacher-other').value = state.teacher;
}

function paint() {
  const scope = state.kind && KINDS[state.kind].scope;
  $('#step2').hidden = !state.kind;
  if (!state.kind) return;
  $('#course-row').hidden = scope === 'school';
  paintTeacher();
  form = renderFields($('#fields'), state.kind);
  const mine = bounties.filter((b) => b.claims.some((c) => c.user_id === s.user()?.id) || b.id === state.bounty);
  $('#bounty').innerHTML = '<option value="">Not part of a bounty</option>'
    + mine.map((b) => `<option value="${esc(b.id)}" ${b.id === state.bounty ? 'selected' : ''}>${esc(b.id)} · ${esc(b.title)}</option>`).join('');
  $('#bounty-row').hidden = !mine.length;
}

$('#kinds').addEventListener('change', (e) => { state.kind = e.target.value; paint(); });
$('#course').addEventListener('change', () => { state.course = courseFromInput(); state.teacher = ''; paintTeacher(); });
$('#teacher').addEventListener('change', () => {
  $('#teacher-other').hidden = $('#teacher').value !== '__other';
  state.teacher = $('#teacher').value === '__other' ? '' : $('#teacher').value;
});

$('#submit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const scope = KINDS[state.kind].scope;
  const err = (m) => { $('#form-error').textContent = m; $('#form-error').hidden = false; };
  $('#form-error').hidden = true;

  state.course = courseFromInput();
  if (scope !== 'school' && !state.course) return err('Pick a course from the list.');
  const teacher = $('#teacher-row').hidden ? null
    : ($('#teacher').value === '__other' ? $('#teacher-other').value.trim() : $('#teacher').value) || null;
  if (scope === 'teacher' && !teacher) return err('Pick which teacher this is about.');
  const missing = form.check();
  if (missing) return err(missing);
  if (!$('#rules-ok').checked) return err('Please confirm the two rules at the bottom.');
  if (!(await requireUser(s, 'to submit'))) return;

  const ok = await guard(() => s.submit({
    kind: state.kind,
    course_slug: scope === 'school' ? null : state.course,
    teacher,
    bounty_id: $('#bounty').value || null,
    payload: form.values(),
  }));
  if (!ok) return;
  $('#submit-form').hidden = true;
  $('#done').hidden = false;
  $('#done-course').innerHTML = state.course
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
s.onAuth(paint);
paint();
