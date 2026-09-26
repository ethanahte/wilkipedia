// The submission templates. Each `kind` is one thing a student can contribute,
// and its fields ARE the definition of "complete": required fields must be
// filled before the form will submit. The course page renders the same keys,
// so adding a field here is the whole change.

export function schoolYear(offset = 0) {
  const d = new Date();
  const start = (d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1) + offset;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}
const YEARS = () => [schoolYear(0), schoolYear(-1), schoolYear(1)];

// Wilcox's class periods (data/bell.json: Monday runs all seven)
export const PERIODS = [1, 2, 3, 4, 5, 6, 7];

// Room schedules written before the Period grid existed are free text, e.g.
// "P1 Civics\nP3 Civics\nP4 AP Macro" or "P1 AP Chem · P2 Chemistry · P3 prep".
// Returns {1: 'Civics', …} when the whole text reads as periods, else null (shown as written).
export function parseSchedule(text) {
  const out = {};
  const rest = String(text || '').replace(/\b(?:P|Per\.?|Period)\s*([1-7])(?:st|nd|rd|th)?\s*[:.\-–]?\s*([^\n·,;|]*?)\s*(?=\b(?:P|Per\.?|Period)\s*[1-7]\b|[\n·,;|]|$)/gi,
    (_, n, what) => { if (what.trim()) out[n] = what.trim(); return ''; });
  return Object.keys(out).length && !/[a-z0-9]/i.test(rest) ? out : null;
}

export const KINDS = {
  course_overview: {
    label: 'Course overview',
    blurb: 'What the class is like no matter who teaches it.',
    scope: 'course',
    fields: [
      { key: 'summary', label: 'What is this class actually like?', type: 'textarea', required: true,
        hint: '2–4 sentences in your own words. Not the catalog description.' },
      { key: 'workload', label: 'Time outside class', type: 'select', required: true,
        options: ['Under 1 hr/week', '1–2 hrs/week', '2–4 hrs/week', '4–6 hrs/week', '6+ hrs/week'] },
      { key: 'difficulty', label: 'Difficulty compared to your other classes', type: 'select',
        options: ['Easier than most', 'About average', 'Harder than most', 'One of the hardest'] },
      { key: 'good_for', label: 'Who should take it', type: 'textarea',
        hint: 'e.g. "Anyone thinking about nursing or pre-med."' },
      { key: 'prep', label: 'How to prepare', type: 'textarea',
        hint: 'What to review or know before day one.' },
      { key: 'ap_exam', label: 'AP exam date (AP classes only)', type: 'text',
        hint: 'From the College Board AP calendar, e.g. "Mon, May 3 · 8 AM".' },
      { key: 'school_year', label: 'School year this is about', type: 'select', required: true, options: YEARS },
    ],
  },

  teacher_section: {
    label: "A teacher's version of the class",
    blurb: "Test style, grading and homework for one teacher. Facts only: nothing personal.",
    scope: 'teacher',
    fields: [
      { key: 'test_style', label: 'Test style', type: 'textarea', required: true,
        hint: 'Format, length, how often, curves. e.g. "Unit test every ~3 weeks: 30 MC + 2 FRQ."' },
      { key: 'grading', label: 'Grading policy', type: 'textarea', required: true,
        hint: 'Category weights exactly as the syllabus states them.' },
      { key: 'homework', label: 'Homework style and load', type: 'textarea', required: true },
      { key: 'late_policy', label: 'Late work policy', type: 'textarea' },
      { key: 'retakes', label: 'Retakes / test corrections', type: 'textarea' },
      { key: 'routine', label: 'Class routine', type: 'textarea',
        hint: 'e.g. "Warm-up quiz every Monday." Describe the class, not the person.' },
      { key: 'syllabus_url', label: 'Link to the syllabus', type: 'url' },
      { key: 'room', label: 'Room number', type: 'text',
        hint: 'As it appears on the campus map, e.g. B204 or P116. This puts the class on the map. The period-by-period schedule is its own form: Room schedule.' },
      // Replaced by the room_schedule kind. Old sections keep and show theirs; new forms don't ask.
      { key: 'schedule', label: 'Schedule', type: 'textarea', legacy: true },
      { key: 'source', label: 'Source for the facts above', type: 'text', required: true,
        hint: 'e.g. "Syllabus handed out Aug 2026" or a link. Reviewers check this.' },
      { key: 'school_year', label: 'School year this is about', type: 'select', required: true, options: YEARS },
    ],
  },

  // One teacher's schedule for one school year. Kept per year: next year's is a
  // new submission, and the old one stays under "Past years" on the map and the
  // teacher's page. Not tied to a course, since a schedule spans several.
  room_schedule: {
    label: 'Room schedule',
    blurb: 'Which class a teacher has each period, and in which room. One school year at a time.',
    scope: 'staff',
    fields: [
      { key: 'school_year', label: 'School year', type: 'select', required: true, options: YEARS,
        hint: 'Schedules change every year, so each year’s is kept separately. Older years stay viewable.' },
      { key: 'room', label: 'Room', type: 'text', required: true, max: 12,
        hint: 'As it appears on the campus map, e.g. B106 or S112.' },
      { key: 'periods', label: 'Class each period', type: 'periods', required: true,
        hint: 'Pick a class from the list, or type “Prep” for a free period. Leave a period blank if you don’t know it.' },
      { key: 'source', label: 'How do you know?', type: 'text', max: 120,
        hint: 'e.g. "I’m in their 3rd period" or "Posted on the classroom door".' },
    ],
  },

  resource: {
    label: 'Resource or study guide',
    blurb: 'A study guide you made, or a useful link. Never actual tests or answer keys.',
    scope: 'course-or-teacher',   // optional teacher: guides often follow one teacher's units
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', required: true,
        options: ['Study guide (student-made)', 'Textbook (link)', 'Practice problems', 'Video', 'Website', 'Other'] },
      { key: 'url', label: 'Link', type: 'url', required: true,
        hint: 'For a study guide, share it from Google Drive as "Anyone with the link can view".' },
      { key: 'author', label: 'Who made it?', type: 'text',
        hint: 'Leave blank if you made it yourself. If someone else made it, put their name so they get the credit, and check they’re OK with it being shared.' },
      { key: 'note', label: 'What it is good for', type: 'textarea' },
    ],
  },

  tip: {
    label: 'Tip',
    blurb: 'One piece of advice for next year’s students.',
    scope: 'course-or-teacher',
    fields: [
      { key: 'text', label: 'Your tip', type: 'textarea', required: true, max: 500 },
    ],
  },

  summer_hw: {
    label: 'Summer homework',
    blurb: 'What’s assigned over the summer, where to get it, and when it’s due.',
    scope: 'course-or-teacher',
    fields: [
      { key: 'what', label: 'What is assigned', type: 'textarea', required: true },
      { key: 'where', label: 'Where to get it', type: 'text', required: true,
        hint: 'e.g. "Google Classroom code posted on the Wilcox site" or a link.' },
      { key: 'due', label: 'When it’s due', type: 'text', required: true },
      { key: 'school_year', label: 'For the school year', type: 'select', required: true, options: YEARS },
    ],
  },

  school_info: {
    label: 'School info',
    blurb: 'Something every Wilcox student should know.',
    scope: 'school',
    fields: [
      { key: 'topic', label: 'Topic', type: 'select', required: true,
        options: ['Counselor appointments', 'Passes & attendance', 'Tech & accounts',
                  'Clubs & activities', 'Getting around', 'Other'] },
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'text', label: 'Details', type: 'textarea', required: true },
      { key: 'source', label: 'Where this comes from', type: 'text',
        hint: 'e.g. the student handbook, the counseling office page, or "from experience".' },
    ],
  },

  club: {
    label: 'Club',
    blurb: 'When and where a club meets, what it does, and how to join.',
    scope: 'activity',
    fields: [
      { key: 'name', label: 'Club name', type: 'text', required: true, suggest: 'clubs',
        hint: 'Pick it from the list if it’s there, so your info lands on the right club.' },
      { key: 'what', label: 'What the club does', type: 'textarea', required: true },
      { key: 'meets', label: 'When it meets', type: 'text', hint: 'e.g. "Tuesdays at lunch" or "Every other Friday after school".' },
      { key: 'room', label: 'Room', type: 'text', hint: 'As it appears on the campus map, e.g. B204. This puts the club on the map.' },
      { key: 'advisor', label: 'Advisor', type: 'text' },
      { key: 'join', label: 'How to join', type: 'textarea', hint: 'Sign-up form, Club Rush, just show up…' },
      { key: 'link', label: 'Club link', type: 'url', hint: 'Its official page, Google Classroom, or public account. Optional.' },
      { key: 'school_year', label: 'School year this is about', type: 'select', required: true, options: YEARS },
    ],
  },

  sport: {
    label: 'Sports team',
    blurb: 'Tryouts, practice, and what being on the team is like.',
    scope: 'activity',
    fields: [
      { key: 'name', label: 'Team', type: 'text', required: true, suggest: 'sports',
        hint: 'Pick it from the list if it’s there, e.g. "Girls Volleyball".' },
      { key: 'tryouts', label: 'Tryouts', type: 'textarea', hint: 'When, what they test, whether there are cuts.' },
      { key: 'practice', label: 'Practice schedule', type: 'textarea', hint: 'e.g. "Mon–Fri 3:30–5:30, games Tue/Thu".' },
      { key: 'experience', label: 'What it’s like', type: 'textarea', required: true,
        hint: 'Time commitment, vibe, whether beginners can join. About the team, not individual people.' },
      { key: 'tips', label: 'Tips for new players', type: 'textarea' },
      { key: 'school_year', label: 'School year this is about', type: 'select', required: true, options: YEARS },
    ],
  },
};

// Kinds that belong to no class: they live on their own pages
export const ACTIVITY_KINDS = ['club', 'sport'];

export const optionsOf = (f) => (typeof f.options === 'function' ? f.options() : f.options);

// A section is stale once it is more than about a semester old, or when it
// describes an earlier school year than the current one.
export function staleness(sub) {
  const age = (Date.now() - new Date(sub.reviewed_at || sub.created_at)) / 864e5;
  const yr = sub.payload?.school_year;
  if (yr && yr < schoolYear(0)) return `This describes ${yr}. It may have changed.`;
  if (age > 150) return 'Last checked over a semester ago. It may be outdated.';
  return null;
}
