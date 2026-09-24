#!/usr/bin/env python3
"""Builds every page of Wilkipedia from the data files.

    python3 tools/build.py

Inputs (edit these, never the generated HTML):
    data/catalog.json         courses offered at Wilcox, from the SCUSD course catalog
    data/directory-raw.json   teachers and their course lists, from the Wilcox staff directory
    data/course-aliases.json  directory course abbreviation -> catalog slug
    data/seed-bounties.json   the starting bounty board

Outputs (all generated, safe to delete and rebuild):
    index.html, subjects/, courses/, teachers/, bounties/, submit/, review/, ...
    data/courses.json         what the browser loads (catalog + teacher links)
    data/search.json          search index
    supabase/seed.sql         the seed bounties, for the live database
    sitemap.xml, robots.txt   only when SITE_URL is set

Standard library only, so it runs on any Mac with no installs.
"""

import html
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Set once the domain exists, e.g. "https://wilkipedia.org". Used for the
# sitemap and canonical links; leave empty until then.
SITE_URL = "https://wilcoxwiki.org"

CATALOG_SOURCE = "SCUSD High School Course Catalog 2025–2026"
DIRECTORY_SOURCE = "Wilcox High School staff directory, September 2026"

GENERATED_DIRS = ["subjects", "courses", "teachers", "bounties", "submit", "review",
                  "leaderboard", "summer", "school", "account", "rules", "about", "search", "privacy"]

e = lambda s: html.escape(str(s if s is not None else ""), quote=True)


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


# ─────────────────────────── data ───────────────────────────

def load():
    catalog = json.loads((DATA / "catalog.json").read_text())
    directory = json.loads((DATA / "directory-raw.json").read_text())
    aliases = json.loads((DATA / "course-aliases.json").read_text())
    aliases.pop("_about", None)

    courses = {c["slug"]: {**c, "teachers": []} for c in catalog["courses"]}
    unknown = sorted({a for a, s in aliases.items() if s and s not in courses})
    if unknown:
        raise SystemExit(f"course-aliases.json points at slugs not in the catalog: {unknown}")

    # One teacher can appear in several departments, and the department pages and
    # the directory sometimes spell a name differently. The directory name is the
    # identity; the longer of the two spellings is shown.
    teachers = {}
    for dep in directory["departments"]:
        for t in dep["teachers"]:
            key = (t.get("directory_name") or t["name"]).lower()
            shown = max([t.get("directory_name") or "", t["name"]], key=len)  # ties go to the directory
            rec = teachers.setdefault(key, {"name": shown, "departments": [], "courses": [], "raw": []})
            if len(shown) > len(rec["name"]):
                rec["name"] = shown
            if dep["name"] not in rec["departments"]:
                rec["departments"].append(dep["name"])
            for raw in t["courses"]:
                if raw not in rec["raw"]:
                    rec["raw"].append(raw)
                slug = aliases.get(raw)
                if slug and slug not in rec["courses"]:
                    rec["courses"].append(slug)

    unmapped = sorted({r for t in teachers.values() for r in t["raw"] if r not in aliases})
    if unmapped:
        print("  note: directory courses with no alias entry:", ", ".join(unmapped))

    teacher_list = sorted(teachers.values(), key=lambda t: t["name"].split()[-1] + t["name"])
    for t in teacher_list:
        t["slug"] = slugify(t["name"])
        for c in t["courses"]:
            courses[c]["teachers"].append(t["name"])

    depts = catalog["departments"]
    for d in depts:
        d["courses"] = sorted((c for c in courses.values() if c["department"] == d["slug"]),
                              key=lambda c: c["name"])
    return depts, courses, teacher_list


# ─────────────────────────── layout ───────────────────────────

NAV = [("subjects/", "Classes"), ("bounties/", "Bounties"), ("summer/", "Summer HW"),
       ("school/", "School info"), ("leaderboard/", "Leaderboard")]


def page(path, title, body, *, desc="", script=None, active=None, data=None):
    """Writes ROOT/path/index.html (or ROOT/path if it ends in .html)."""
    out = ROOT / path if path.endswith(".html") else ROOT / path / "index.html"
    depth = len(out.relative_to(ROOT).parts) - 1
    r = "../" * depth or "./"
    full_title = f"{title} · Wilkipedia" if title != "Wilkipedia" else "Wilkipedia: every class at Wilcox, explained by students"
    canon = ""
    if SITE_URL:
        rel = "" if path in ("", "index.html") else path.rstrip("/") + ("/" if not path.endswith(".html") else "")
        canon = f'<link rel="canonical" href="{e(SITE_URL.rstrip("/") + "/" + rel)}">'
    nav = "".join(f'<a href="{r}{href}"{" aria-current=page" if active == href else ""}>{label}</a>'
                  for href, label in NAV)
    data_tag = ""
    if data is not None:
        blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
        data_tag = f'<script type="application/json" id="page-data">{blob}</script>'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(full_title)}</title>
<meta name="description" content="{e(desc or 'Student-written guides to every class at Wilcox High School: test style, grading, homework, study guides, tips and summer homework.')}">
<meta property="og:title" content="{e(full_title)}">
<meta property="og:site_name" content="Wilkipedia">
{canon}
<link rel="icon" href="{r}assets/icon.svg" type="image/svg+xml">
<link rel="preload" href="{r}assets/fonts/Newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="{r}assets/style.css">
</head>
<body data-root="{r}">
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href="{r}">Wilkipedia</a>
    <nav class="main-nav" aria-label="Main">{nav}</nav>
    <form class="hsearch" action="{r}search/" role="search"><input name="q" type="search" placeholder="Search classes & teachers" aria-label="Search classes and teachers"></form>
    <div id="auth" class="auth"></div>
  </div>
</header>
<main id="main" class="wrap">
{body}
</main>
<footer class="site">
  <div class="wrap">
    <p><b>Wilkipedia</b> is written by Wilcox students, for Wilcox students. It is an independent student project, not an official Wilcox High School or SCUSD site.</p>
    <p><a href="{r}rules/">Community rules</a> · <a href="{r}privacy/">Privacy</a> · <a href="{r}about/">About</a> · <a href="{r}submit/">Contribute</a></p>
    <p class="meta">Course descriptions: {e(CATALOG_SOURCE)}. Teacher lists: {e(DIRECTORY_SOURCE)}. Everything else is written by students and checked by reviewers. It may be out of date, so always confirm with your teacher.</p>
  </div>
</footer>
{data_tag}
<script type="module" src="{r}assets/js/{script or 'pages.js'}"></script>
</body>
</html>
""")


def grades(c):
    return f"Grades {c['grades']}" if c.get("grades") else ""


def course_badges(c):
    b = []
    n = c["name"]
    if n.startswith("AP ") or " AP " in n:
        b.append('<span class="tag ap">AP</span>')
    if "Honors" in n or n.endswith(" H"):
        b.append('<span class="tag">Honors</span>')
    if c.get("ucCsu"):
        b.append(f'<span class="tag" title="UC/CSU a–g requirement">a–g: {e(c["ucCsu"])}</span>')
    return "".join(b)


def course_row(c, r):
    t = c["teachers"]
    who = ", ".join(t[:3]) + (f" +{len(t) - 3}" if len(t) > 3 else "") if t else ""
    return f"""<li class="course-row is-empty" data-slug="{e(c['slug'])}" data-kind="{'ap' if c['name'].startswith('AP ') else ''}{' honors' if 'Honors' in c['name'] else ''}">
  <a href="{r}courses/{e(c['slug'])}/"><span class="c-name">{e(c['name'])}</span>
  <span class="c-meta">{e(grades(c))}{' · ' + e(who) if who else ''}</span></a>
  <span class="c-badges">{course_badges(c)}<span class="status"></span></span></li>"""


# ─────────────────────────── pages ───────────────────────────

def build_home(depts):
    grid = "".join(f"""<a class="subject" href="subjects/{e(d['slug'])}/"><b>{e(short_dept(d['name']))}</b>
      <span>{len(d['courses'])} classes</span></a>""" for d in depts)
    page("", "Wilkipedia", f"""
<section class="hero">
  <h1>Every class at Wilcox,<br>explained by students.</h1>
  <p class="lede">Test style, grading, homework load, study guides, tips and summer homework, for any class, even ones you’re not taking.</p>
  <form class="big-search" action="search/" role="search">
    <input name="q" id="home-q" type="search" placeholder="Try “AP Chem” or a teacher’s name" aria-label="Search" autocomplete="off">
    <button class="btn">Search</button>
  </form>
  <div id="home-results" class="results"></div>
</section>

<section>
  <h2 class="label-h">Browse by subject</h2>
  <div class="subjects">{grid}</div>
</section>

<section class="three">
  <a class="panel" href="summer/"><span class="label">Summer homework</span><b>Every class’s summer work in one place.</b><span class="meta">Collected each May and June.</span></a>
  <a class="panel" href="school/"><span class="label">School info</span><b>Bell schedule, counselors, passes.</b><span class="meta">The stuff nobody tells freshmen.</span></a>
  <a class="panel accent" href="bounties/"><span class="label">Help build it</span><b>Claim a bounty. Write a page.</b><span class="meta">Get credit on the leaderboard.</span></a>
</section>

<section class="two">
  <div><h2 class="label-h">Open bounties</h2><div id="home-bounties" class="mini-list"><div class="meta">Loading…</div></div>
    <a href="bounties/">See the whole board →</a></div>
  <div><h2 class="label-h">Recently added</h2><div id="home-recent" class="mini-list"><div class="meta">Loading…</div></div></div>
</section>
""", desc="Student-written guides to every class at Wilcox High School in Santa Clara: test style, grading, homework, study guides, tips and summer homework.",
         data={"page": "home"})


def short_dept(name):
    return {"Silicon Valley Career Technical Education (SVCTE)": "SVCTE (off-campus)",
            "Visual / Performing Arts": "Visual & Performing Arts"}.get(name, name)


def build_subjects(depts):
    body = "".join(f"""<section class="dept-block"><h2><a href="{e(d['slug'])}/">{e(short_dept(d['name']))}</a> <span class="meta">{len(d['courses'])} classes</span></h2>
      <ul class="course-list">{''.join(course_row(c, '../') for c in d['courses'])}</ul></section>""" for d in depts)
    page("subjects/", "All classes", f"""
<h1>All classes</h1>
<p class="lede">Every class offered at Wilcox in the {e(CATALOG_SOURCE.split(' ')[-1])} catalog. <span class="legend"><span class="dot on"></span> has student info <span class="dot"></span> nobody has written it yet</span></p>
<div class="chips" id="filter"><button class="chip" data-f="all" aria-pressed="true">All</button><button class="chip" data-f="has">Has info</button><button class="chip" data-f="ap">AP</button><button class="chip" data-f="honors">Honors</button></div>
{body}""", active="subjects/", data={"page": "subject"})

    for d in depts:
        svcte = d["slug"] == "svcte"
        page(f"subjects/{d['slug']}/", short_dept(d["name"]), f"""
<nav class="crumbs"><a href="../">All classes</a></nav>
<h1>{e(short_dept(d['name']))}</h1>
{'<p class="note">SVCTE programs are taught at the Silicon Valley Career Technical Education campus, not at Wilcox. Ask your counselor about signing up.</p>' if svcte else ''}
<p class="lede">{len(d['courses'])} classes. <span class="legend"><span class="dot on"></span> has student info <span class="dot"></span> not written yet</span></p>
<div class="chips" id="filter"><button class="chip" data-f="all" aria-pressed="true">All</button><button class="chip" data-f="has">Has info</button><button class="chip" data-f="ap">AP</button><button class="chip" data-f="honors">Honors</button></div>
<ul class="course-list">{''.join(course_row(c, '../../') for c in d['courses'])}</ul>
""", desc=f"All {short_dept(d['name'])} classes at Wilcox High School, with student-written guides.",
             active="subjects/", data={"page": "subject"})


def build_courses(depts, courses):
    dept_name = {d["slug"]: short_dept(d["name"]) for d in depts}
    for c in courses.values():
        facts = [(k, c.get(f)) for k, f in [("Grades", "grades"), ("UC/CSU a–g", "ucCsu"), ("Credits", "credits"),
                                             ("Course #", "courseNumber"), ("Prerequisite", "prerequisite")]]
        facts_html = "".join(f'<div><span class="label">{k}</span>{e(v)}</div>' for k, v in facts if v)
        desc_html = "".join(f"<p>{e(p)}</p>" for p in (c.get("description") or "").split("\n\n") if p.strip())
        is_ap = c["name"].startswith("AP ")
        where = "" if c.get("offeredAtListed", True) else '<p class="note">This program is taught off campus at SVCTE, not at Wilcox.</p>'
        page(f"courses/{c['slug']}/", c["name"], f"""
<nav class="crumbs"><a href="../../subjects/">All classes</a> / <a href="../../subjects/{e(c['department'])}/">{e(dept_name[c['department']])}</a></nav>
<header class="course-head">
  <h1>{e(c['name'])}</h1>
  <div class="c-badges">{course_badges(c)}</div>
</header>
{where}
<div class="facts">{facts_html}</div>
{f'<p class="meta">{e(c["note"])}</p>' if c.get("note") else ''}

<nav class="toc" aria-label="On this page"><a href="#s-overview">Overview</a><a href="#s-teachers">Teachers</a><a href="#s-resources">Resources</a><a href="#s-tips">Tips</a><a href="#s-summer">Summer HW</a><a href="#comments">Comments</a></nav>

<section id="s-overview"><h2>What students say</h2><div id="overview" class="dyn"><div class="meta">Loading…</div></div></section>

<section id="s-catalog"><details {'open' if not desc_html else ''}><summary><h2>Catalog description</h2></summary>
  <div class="catalog-desc">{desc_html or '<p class="meta">The catalog has no description for this class.</p>'}
  <p class="meta">From the {e(CATALOG_SOURCE)}, page {e(c.get('page', '?') - 1 if isinstance(c.get('page'), int) else '?')}.</p></div></details></section>

<section id="s-teachers"><h2>Teachers</h2>
  <p class="meta">From the {e(DIRECTORY_SOURCE)}. Each teacher’s section is written by their students.</p>
  <div id="teachers" class="teachers dyn"></div>
  <div id="compare" hidden><h3>Side by side</h3><div class="scroll-x"><table id="compare-table" class="compare"></table></div></div>
</section>

<section id="s-resources"><h2>Resources & study guides</h2><div id="resources" class="dyn"></div></section>
<section id="s-tips"><h2>Tips from past students</h2><div id="tips" class="dyn"></div></section>
<section id="s-summer"><h2>Summer homework</h2><div id="summer" class="dyn"></div></section>

<section id="comments"><h2>Comments</h2>
  <p class="meta">About the class, not the teacher as a person. New members’ comments appear after a reviewer approves them. <a href="../../rules/">Rules</a></p>
  <form id="comment-form" class="comment-form">
    <div id="replying" class="meta" hidden>Replying to a comment · <button type="button" class="linkish" id="cancel-reply">cancel</button></div>
    <label class="sr" for="comment-prompt">Topic</label><select id="comment-prompt"></select>
    <label class="sr" for="comment-body">Comment</label>
    <textarea id="comment-body" rows="3" maxlength="2000" placeholder="What was this class like?"></textarea>
    <button class="btn">Post</button>
  </form>
  <div id="comment-list"></div>
</section>
""", desc=f"{c['name']} at Wilcox High School: what students say about tests, grading and homework, plus study guides and tips."
          + (" Includes AP exam info." if is_ap else ""),
             active="subjects/", script="course.js",
             data={"slug": c["slug"], "name": c["name"], "teachers": c["teachers"]})


def build_teachers(teachers, courses):
    rows = "".join(f"""<li><a href="{e(t['slug'])}/"><b>{e(t['name'])}</b></a> <span class="meta">{e(', '.join(t['departments']))}</span></li>"""
                   for t in teachers)
    page("teachers/", "Teachers", f"""<h1>Teachers</h1>
<p class="meta">From the {e(DIRECTORY_SOURCE)}.</p><ul class="plain-list">{rows}</ul>""", active="subjects/", data={"page": "static"})
    for t in teachers:
        cs = "".join(f'<li><a href="../../courses/{e(s)}/">{e(courses[s]["name"])}</a></li>' for s in t["courses"])
        others = [r for r in t["raw"] if r not in [None]]
        page(f"teachers/{t['slug']}/", t["name"], f"""
<nav class="crumbs"><a href="../">Teachers</a></nav>
<h1>{e(t['name'])}</h1>
<p class="meta">{e(', '.join(t['departments']))}</p>
<h2>Classes</h2>
{f'<ul class="plain-list">{cs}</ul>' if cs else '<p class="meta">No classes matched in the catalog.</p>'}
<p class="meta">Listed in the staff directory as: {e(', '.join(others)) or '—'}. Each class page has a section on how this teacher runs it.</p>
""", desc=f"Classes taught by {t['name']} at Wilcox High School.", data={"page": "static"})


def build_static():
    page("bounties/", "Bounty board", """
<h1>Bounty board</h1>
<p class="lede">Wilkipedia is written by volunteers. Each bounty is one clear job with a finish line. Claim one, do it, submit it, and a reviewer publishes it with your name on it.</p>
<div id="stats" class="stats"></div>
<div class="filters">
  <div class="chips" id="track-filter"></div>
  <div class="chips"><button class="chip" data-state="all" aria-pressed="true">Any status</button><button class="chip" data-state="open">Unclaimed</button><button class="chip" data-state="claimed">Claimed</button></div>
</div>
<p class="meta" id="count"></p>
<div id="board" class="board"></div>
<section class="how">
  <h2>How a bounty runs</h2>
  <ol>
    <li><b>Claim</b> it. Several people can claim the same bounty; reviewers merge the best parts. Claims expire after 14 days.</li>
    <li><b>Build</b> it with the form. Required fields must be filled.</li>
    <li><b>Submit.</b> It goes to the review queue, not straight onto the site.</li>
    <li><b>Review.</b> A reviewer approves it or sends it back with a note saying what to fix.</li>
    <li><b>Credit.</b> Approved work goes live with your name, and the points go on the leaderboard.</li>
  </ol>
  <p><b>Points:</b> S (~30 min) = 10 · M (~2 hrs) = 30 · L (~5+ hrs) = 60 · anything outside a bounty = 5. After 3 approved submissions you become <b>Trusted</b>: your comments post instantly.</p>
  <p>Have an idea for a bounty? Suggest it in a comment on the class page, or tell a reviewer.</p>
</section>""", active="bounties/", script="bounties.js")

    page("submit/", "Contribute", """
<h1>Contribute</h1>
<p class="lede">Everything goes to a reviewer before it’s published. Write in your own words.</p>
<div id="bounty-brief" class="note" hidden></div>
<form id="submit-form" novalidate>
  <fieldset><legend>1 · What are you adding?</legend><div id="kinds" class="kinds"></div></fieldset>
  <div id="step2" hidden>
    <fieldset><legend>2 · Where does it go?</legend>
      <div class="field" id="course-row"><label for="course">Class <span class="req">*</span></label>
        <input id="course" list="course-list" placeholder="Start typing a class name…" autocomplete="off"><datalist id="course-list"></datalist></div>
      <div class="field" id="teacher-row" hidden><label for="teacher" id="teacher-label">Teacher</label>
        <select id="teacher"></select><input id="teacher-other" placeholder="Teacher’s name" hidden></div>
      <div class="field" id="bounty-row" hidden><label for="bounty">Bounty</label><select id="bounty"></select></div>
    </fieldset>
    <fieldset><legend>3 · The details</legend><div id="fields"></div></fieldset>
    <label class="check"><input type="checkbox" id="rules-ok"> I didn’t include real test or quiz questions or answer keys, and nothing here is about a teacher as a person. <a href="../rules/" target="_blank">Rules</a></label>
    <p id="form-error" class="error" role="alert" hidden></p>
    <button class="btn big">Submit for review</button>
  </div>
</form>
<div id="done" class="done" hidden>
  <h2>Submitted. Thank you!</h2>
  <p>A reviewer will look at it soon. You can track it on <a href="../account/">your account page</a>. If they ask for changes, their note shows up there.</p>
  <p><button class="btn" id="again">Add something else</button> <span id="done-course"></span></p>
</div>""", script="submit.js")

    page("review/", "Review", """
<h1>Review</h1>
<div class="chips tabs"><button class="chip" data-tab="submissions">Submissions</button><button class="chip" data-tab="comments">Comments</button><button class="chip" data-tab="reports">Reports</button><button class="chip" data-tab="bounties">Bounties</button></div>
<div id="panel"></div>""", script="review.js")

    page("leaderboard/", "Leaderboard", """
<h1>Leaderboard</h1>
<p class="lede">The people building Wilkipedia. Points come from approved work.</p>
<div class="chips"><button class="chip" data-lb="points" aria-pressed="true">All time</button><button class="chip" data-lb="semester_points">This semester</button></div>
<ol id="board" class="leaders"></ol>
<p class="meta">S bounty 10 · M 30 · L 60 · anything outside a bounty 5. Everyone who contributes in the first year is a <b>Founding Contributor</b>.</p>""",
         active="leaderboard/", data={"page": "leaderboard"})

    page("summer/", "Summer homework", """
<h1>Summer homework</h1>
<p class="lede">Summer assignments for every class, in one place, so nobody finds out on the first day.</p>
<div id="summer-list"><div class="meta">Loading…</div></div>
<div class="note">Summer work is usually posted in <b>May and June</b>. That’s when we run the summer homework bounty drive. Know of one now? <a href="../submit/?kind=summer_hw">Report it</a>.</div>""",
         active="summer/", data={"page": "summer"})

    page("school/", "School info", """
<h1>School info</h1>
<p class="lede">Things every Wilcox student should know, written by students.</p>
<div id="school-list"><div class="meta">Loading…</div></div>
<p><a class="btn ghost" href="../submit/?kind=school_info">Add school info</a></p>""",
         active="school/", data={"page": "school"})

    page("account/", "Your account", """
<h1>Your account</h1>
<div id="account"><div class="meta">Loading…</div></div>""", data={"page": "account"})

    page("search/", "Search", """
<h1>Search</h1>
<form class="big-search" role="search"><input name="q" id="search-q" type="search" placeholder="Class or teacher" aria-label="Search" autocomplete="off"><button class="btn">Search</button></form>
<div id="search-results" class="results page"></div>""", data={"page": "search"})

    page("rules/", "Community rules", """
<h1>Community rules</h1>
<p class="lede">These keep Wilkipedia useful, and keep it online.</p>
<ol class="rules">
  <li><b>No real tests, quizzes or answer keys.</b> Describe the test style (“30 multiple choice + 2 free response, curved”). Never post the questions.</li>
  <li><b>About the class, not the person.</b> Nothing insulting or personal about any teacher or student. Teacher sections are facts about how the class runs.</li>
  <li><b>Link, don’t upload, copyrighted material.</b> Say where to find textbooks and teacher packets. Study guides you made yourself are welcome.</li>
  <li><b>Facts need a source.</b> Grading weights and policies should come from the syllabus or the teacher. Opinions are fine, but they’re labelled as student experience.</li>
  <li><b>Say when.</b> Everything shows the school year it applies to. Policies change, so hit “Report outdated” when something’s wrong.</li>
  <li><b>Don’t make things up.</b> If you don’t know, leave it blank. An empty page is better than a wrong one.</li>
  <li><b>Use your real first name</b> or a name people know you by. No impersonating anyone.</li>
</ol>
<p>Reviewers remove anything that breaks these rules. Repeated problems mean losing the ability to post.</p>""", data={"page": "static"})

    page("about/", "About", """
<h1>About Wilkipedia</h1>
<p class="lede">A student-built guide to every class at Wilcox High School in Santa Clara.</p>
<p>Started in 2026 by Ethan Liu and Jonathan. Students write everything through <a href="../bounties/">bounties</a>, and reviewers check it before it’s published.</p>
<p><b>Where the facts come from.</b> Course names, grade levels, prerequisites and descriptions come from the SCUSD High School Course Catalog 2025–2026. Teacher lists come from the Wilcox staff directory. Everything else is written by students.</p>
<p><b>Not official.</b> Wilkipedia is an independent student project, not a Wilcox High School or Santa Clara Unified site. Always confirm policies and deadlines with your teacher or counselor.</p>
<p><b>Something wrong?</b> Every section has a “Report outdated” button. To reach the team, comment on any class page or tell a reviewer.</p>""", data={"page": "static"})

    page("privacy/", "Privacy", """
<h1>Privacy</h1>
<p class="lede">Short version: reading needs no account. If you sign in, we store only what's needed to credit your work, and we never sell or share it.</p>
<h2>Reading</h2>
<p>You can read every page without signing in. We don't use ads, analytics or tracking cookies.</p>
<h2>Signing in</h2>
<p>Sign-in uses Google. When you sign in, Google tells us your name and email address. We store them in our database (hosted by Supabase) so that your claims, submissions and comments belong to you.</p>
<ul>
  <li><b>Public:</b> your display name, which is your first name unless you change it on your account page. It appears next to your approved work, your comments and your leaderboard points.</li>
  <li><b>Never public:</b> your email address. Only the site's admins can see it, and only to run the site.</li>
</ul>
<p>Your browser keeps a sign-in token so you stay signed in. Signing out removes it.</p>
<h2>What you post</h2>
<p>Submissions are private until a reviewer approves them, and then they're public. Comments are public once they're visible. Reviewers can see pending submissions and held comments.</p>
<h2>Deleting your data</h2>
<p>Ask a Wilkipedia admin to delete your account. We'll remove your account, submissions and comments.</p>
<h2>Who runs this</h2>
<p>Wilkipedia is an independent project run by Wilcox High School students. It is not operated by Wilcox High School or Santa Clara Unified School District.</p>
<p class="meta">Last updated September 2026.</p>""", data={"page": "static"})

    page("404.html", "Page not found", """
<h1>Page not found</h1><p>Try <a href="./search/">searching</a> or <a href="./subjects/">browse all classes</a>.</p>""", data={"page": "static"})


def build_data(depts, courses, teachers):
    slim = [{k: c.get(k) for k in ("slug", "name", "department", "grades", "ucCsu", "teachers")} for c in courses.values()]
    (DATA / "courses.json").write_text(json.dumps(
        {"departments": [{"slug": d["slug"], "name": short_dept(d["name"])} for d in depts], "courses": slim},
        ensure_ascii=False, separators=(",", ":")))
    idx = [{"t": "c", "n": c["name"], "s": c["slug"], "d": short_dept(next(d["name"] for d in depts if d["slug"] == c["department"])),
            "x": " ".join(c["teachers"])} for c in courses.values()]
    idx += [{"t": "t", "n": t["name"], "s": t["slug"], "d": ", ".join(t["departments"]),
             "x": " ".join(courses[s]["name"] for s in t["courses"])} for t in teachers]
    (DATA / "search.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")))

    seed = json.loads((DATA / "seed-bounties.json").read_text())
    q = lambda v: "null" if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
    cols = ["id", "title", "track", "course_slug", "teacher", "kind", "size", "priority", "you_get", "done_means"]
    rows = ",\n".join("(" + ", ".join(q(b.get(k)) for k in cols) + ")" for b in seed)
    (ROOT / "supabase" / "seed.sql").write_text(
        "-- Generated by tools/build.py from data/seed-bounties.json. Run after schema.sql.\n"
        f"insert into public.bounties ({', '.join(cols)}) values\n{rows}\non conflict (id) do nothing;\n")


def build_seo(courses, teachers, depts):
    if not SITE_URL:
        for f in ("sitemap.xml", "robots.txt"):
            (ROOT / f).unlink(missing_ok=True)
        return
    base = SITE_URL.rstrip("/")
    urls = ["", "subjects/", "bounties/", "summer/", "school/", "teachers/", "about/", "rules/"]
    urls += [f"subjects/{d['slug']}/" for d in depts] + [f"courses/{s}/" for s in courses] + [f"teachers/{t['slug']}/" for t in teachers]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{e(base + '/' + u)}</loc></url>\n" for u in urls) + "</urlset>\n")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nDisallow: /review/\nDisallow: /account/\nDisallow: /submit/\nSitemap: {base}/sitemap.xml\n")


def main():
    for d in GENERATED_DIRS:
        shutil.rmtree(ROOT / d, ignore_errors=True)
    depts, courses, teachers = load()
    build_home(depts)
    build_subjects(depts)
    build_courses(depts, courses)
    build_teachers(teachers, courses)
    build_static()
    build_data(depts, courses, teachers)
    build_seo(courses, teachers, depts)
    linked = sum(1 for c in courses.values() if c["teachers"])
    print(f"Built {len(courses)} course pages ({linked} with teachers), {len(teachers)} teacher pages, {len(depts)} subjects.")


if __name__ == "__main__":
    main()
