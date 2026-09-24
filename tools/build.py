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

import hashlib
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
                  "leaderboard", "summer", "school", "account", "rules", "about", "search", "privacy", "map",
                  "menu", "clubs", "sports", "feedback", "credits", "bell"]

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

# The header shows two ways in (the map and the class list); everything else
# lives in the "More" menu. The bounty board is not here: it is a side tab that
# only signed-in members see (see initHeader in assets/js/ui.js).
NAV = [("map/", "Map"), ("subjects/", "Classes")]
_I = lambda d: f'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
ICONS = {
    "menu": _I('<path d="M4 7h16M4 12h16M4 17h16"/>'),
    "chev": '<svg class="chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    "summer": _I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    "school": _I('<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>'),
    "leaderboard": _I('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    "teachers": _I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>'),
    "rules": _I('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    "about": _I('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
    "food": _I('<path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-2 1.5-3 4-3 7v2h3"/>'),
    "clubs": _I('<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4l-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/>'),
    "sports": _I('<circle cx="12" cy="12" r="9"/><path d="M3.5 9.5c5 1 12 1 17 0M3.5 14.5c5-1 12-1 17 0M12 3c-3 5-3 13 0 18M12 3c3 5 3 13 0 18"/>'),
    "feedback": _I('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4M12 14h.01"/>'),
    "bell": _I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
    "globe": _I('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    "heart": _I('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    "plus": '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    "search": _I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    "external": _I('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    "bounty": '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z"/></svg>',
}
# The "More" panel: grouped columns, each link with an icon and a short line
MORE_GROUPS = [
    ("School day", [("bell/", "Bell schedule", "bell", "Period times, block days, finals"),
                    ("menu/", "Cafeteria menu", "food", "Breakfast and lunch this week"),
                    ("school/", "School info", "school", "Counselors, passes, tech"),
                    ("summer/", "Summer homework", "summer", "What’s due before school starts")]),
    ("Get involved", [("clubs/", "Clubs", "clubs", "85 clubs and how to join"),
                      ("sports/", "Sports", "sports", "Chargers teams by season"),
                      ("leaderboard/", "Leaderboard", "leaderboard", "Top contributors"),
                      ("feedback/", "Send feedback", "feedback", "Ideas, bugs, feature requests")]),
    ("About Wilkipedia", [("teachers/", "Teachers", "teachers", "Every teacher and their classes"),
                          ("rules/", "Community rules", "rules", "What you can post"),
                          ("about/", "About", "about", "Who runs this and why"),
                          ("credits/", "Credits & thanks", "heart", "Everyone who helped")]),
]
MORE = [(href, label, icon) for _, items in MORE_GROUPS for href, label, icon, _ in items]
WILCOX_SITE = "https://wilcox.santaclarausd.org/"


def _version(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()[:10]


def asset_versions():
    """Content hashes for every CSS/JS/data file the pages load.

    GitHub Pages lets browsers cache files for 10 minutes, so right after a
    deploy a visitor could get new HTML with OLD CSS/JS: broken menus, missing
    buttons. Every URL therefore carries ?v=<hash of its contents>, and an import
    map applies the same to the JS modules' imports of each other."""
    v = {"style.css": _version(ROOT / "assets" / "style.css")}
    for f in sorted((ROOT / "assets" / "js").glob("*.js")):
        v["js/" + f.name] = _version(f)
    data = hashlib.sha1()
    for f in sorted(DATA.glob("*.json")):
        data.update(f.read_bytes())
    v["data"] = data.hexdigest()[:10]
    return v


VERSIONS = {}

# Applies a saved night-mode choice before first paint, so pages never flash.
THEME_BOOT = ("<script>try{var d=document.documentElement,t=localStorage.getItem('wilkipedia-theme'),"
              "c=localStorage.getItem('wilkipedia-class-applied');if(t)d.dataset.theme=t;if(c)d.dataset.class=c}catch(e){}</script>")


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
    cur = lambda href: " aria-current=page" if active == href else ""
    nav = "".join(f'<a href="{r}{href}"{cur(href)}>{label}</a>' for href, label in NAV)
    more_active = any(active == href for href, _, _ in MORE)
    nav += (f'<details class="more"><summary{" class=is-active" if more_active else ""} aria-label="More pages">'
            f'{ICONS["menu"]}<span>More</span>{ICONS["chev"]}</summary><div class="menu mega">'
            + "".join(f'<div class="mega-col"><div class="mega-h">{group}</div>'
                      + "".join(f'<a href="{r}{href}"{cur(href)}>{ICONS[icon]}<span class="mt"><span>{label}</span><small>{sub}</small></span></a>'
                                for href, label, icon, sub in items) + '</div>'
                      for group, items in MORE_GROUPS)
            + f'<a href="{WILCOX_SITE}" target="_blank" rel="noopener" class="ext">{ICONS["school"]}<span>Official Wilcox website</span>{ICONS["external"]}</a>'
            + '</div></details>')
    v = VERSIONS
    importmap = json.dumps({"imports": {f"{r}assets/{k}": f"{r}assets/{k}?v={h}"
                                        for k, h in v.items() if k.startswith("js/")}})
    entry = f"js/{script or 'pages.js'}"
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
<link rel="stylesheet" href="{r}assets/style.css?v={v["style.css"]}">
<meta name="data-version" content="{v["data"]}">
{THEME_BOOT}
<script type="importmap">{importmap}</script>
</head>
<body data-root="{r}">
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <div class="wrap bar">
    <a class="brand" href="{r}" translate="no"><span class="w">W</span>ilkipedia</a>
    <nav class="main-nav" aria-label="Main">{nav}</nav>
    <form class="hsearch" action="{r}search/" role="search"><input name="q" type="search" placeholder="Search anything…" aria-label="Search Wilkipedia" autocomplete="off"><div class="results-pop" role="listbox" hidden></div></form>
    <a class="icon-btn search-btn" href="{r}search/" aria-label="Search">{ICONS["search"]}</a>
    <div class="lang"><button type="button" class="icon-btn lang-btn" id="lang-btn" aria-label="Language" aria-haspopup="true" aria-expanded="false" title="Language / Idioma">{ICONS["globe"]}<span class="lang-code" translate="no"></span></button>
      <div class="lang-menu" id="lang-menu" role="menu" hidden></div></div>
    <button type="button" class="icon-btn" id="theme-toggle" aria-label="Switch to night mode"></button>
    <div id="auth" class="auth"></div>
  </div>
</header>
<a id="contribute-fab" class="fab contribute-fab" href="{r}submit/" aria-label="Contribute: add info, a tip or a study guide">{ICONS["plus"]}<span class="t">Contribute</span></a>
<a id="bounty-tab" class="bounty-fab" href="{r}bounties/" aria-label="Bounty board" hidden>{ICONS["bounty"]}<span class="t">Bounties</span><span class="n" aria-label="unclaimed bounties"></span></a>
<main id="main" class="wrap">
{body}
</main>
<footer class="site">
  <div class="wrap">
    <p><b>Wilkipedia</b> is written by Wilcox students, for Wilcox students. It is an independent student project, not an official Wilcox High School or SCUSD site.</p>
    <p><a href="{r}rules/">Community rules</a> · <a href="{r}privacy/">Privacy</a> · <a href="{r}about/">About</a> · <a href="{r}submit/">Contribute</a> · <a href="{r}feedback/">Feedback &amp; bug reports</a> · <a href="{r}credits/">Credits &amp; thanks</a> · <a href="{WILCOX_SITE}" target="_blank" rel="noopener">Official Wilcox High School website ↗</a></p>
    <p class="meta">Course descriptions: {e(CATALOG_SOURCE)}. Teacher lists: {e(DIRECTORY_SOURCE)}. Everything else is written by students and checked by reviewers. It may be out of date, so always confirm with your teacher.</p>
  </div>
</footer>
{data_tag}
<script type="module" src="{r}assets/{entry}?v={v[entry]}"></script>
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
    m = re.search(r"\d+", c.get("grades") or "")
    return f"""<li class="course-row is-empty" data-slug="{e(c['slug'])}" data-name="{e(c['name'])}" data-grade="{m.group() if m else ''}" data-kind="{'ap' if c['name'].startswith('AP ') else ''}{' honors' if 'Honors' in c['name'] else ''}">
  <a href="{r}courses/{e(c['slug'])}/"><span class="c-name">{e(c['name'])}</span>
  <span class="c-meta">{e(grades(c))}{' · ' + e(who) if who else ''}</span></a>
  <span class="c-badges">{course_badges(c)}<span class="status"></span></span></li>"""


# ─────────────────────────── pages ───────────────────────────

def build_home(depts):
    grid = "".join(f"""<a class="subject" href="subjects/{e(d['slug'])}/"><b>{e(short_dept(d['name']))}</b>
      <span>{len(d['courses'])} classes</span></a>""" for d in depts)
    page("", "Wilkipedia", f"""
<section id="bell" class="bell" aria-label="Bell schedule"><div class="meta">Loading today’s bell schedule…</div></section>
<section class="hero">
  <h1>Every class at Wilcox,<br>explained by students.</h1>
  <p class="lede">Test style, grading, homework load, study guides, tips and summer homework, for any class, even ones you’re not taking.</p>
  <form class="big-search" action="search/" role="search">
    <div class="big-search-field"><input name="q" id="home-q" type="search" placeholder="Search anything: “apush”, “robotics club”, “B204”, “lunch”…" aria-label="Search" autocomplete="off">
    <div id="home-results" class="results-pop" role="listbox" hidden></div></div>
    <button class="btn">Search</button>
  </form>
</section>

<section>
  <h2 class="label-h">Browse by subject</h2>
  <div class="subjects">{grid}</div>
</section>

<section class="three">
  <a class="panel" href="map/"><span class="label">Campus map</span><b>Find a classroom and who teaches there.</b><span class="meta">Browse by room instead of by class.</span></a>
  <a class="panel" href="summer/"><span class="label">Summer homework</span><b>Every class’s summer work in one place.</b><span class="meta">Collected each May and June.</span></a>
  <a class="panel members-only accent" href="bounties/"><span class="label">Help build it</span><b>Claim a bounty. Write a page.</b><span class="meta">Get credit on the leaderboard.</span></a>
  <button type="button" class="panel guests-only accent js-signin"><span class="label">Help build it</span><b>Sign in to write pages and earn credit.</b><span class="meta">Use your school account for the SCUSD ✓ badge.</span></button>
</section>

<section>
  <h2 class="label-h">Recently added</h2><div id="home-recent" class="mini-list"><div class="meta">Loading…</div></div>
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
<div class="sortbar"><span class="label">Sort</span><div class="chips" id="sort"><button class="chip" data-sort="subject" aria-pressed="true">By subject</button><button class="chip" data-sort="az">A–Z</button><button class="chip" data-sort="grade">By grade</button></div>
<span class="label">Show</span><div class="chips" id="filter"><button class="chip" data-f="all" aria-pressed="true">All</button><button class="chip" data-f="has">Has info</button><button class="chip" data-f="ap">AP</button><button class="chip" data-f="honors">Honors</button></div></div>
<div id="by-subject">{body}</div>
<div id="flat" hidden></div>""", active="subjects/", data={"page": "subject"})

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


SEC_ICONS = {
    "overview": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "catalog": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    "teachers": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
    "resources": '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    "tips": '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    "summer": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "comments": '<path d="M7 8h10M7 12h6"/><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/>',
}


def sec_head(key, title, sub=""):
    icon = f'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{SEC_ICONS[key]}</svg>'
    return f'<div class="sec-head"><span class="sec-icon">{icon}</span><div><h2>{title}</h2>{f"<p class=meta>{sub}</p>" if sub else ""}</div></div>'


def build_courses(depts, courses):
    dept_name = {d["slug"]: short_dept(d["name"]) for d in depts}
    for c in courses.values():
        stats = [(k, c.get(f)) for k, f in [("Grades", "grades"), ("UC/CSU a–g", "ucCsu"), ("Credits", "credits"),
                                             ("Course #", "courseNumber")]]
        stats_html = "".join(f'<div class="stat"><span class="label">{k}</span><b>{e(v)}</b></div>' for k, v in stats if v)
        prereq = c.get("prerequisite")
        desc_html = "".join(f"<p>{e(p)}</p>" for p in (c.get("description") or "").split("\n\n") if p.strip())
        is_ap = c["name"].startswith("AP ")
        where = "" if c.get("offeredAtListed", True) else '<p class="note">This program is taught off campus at SVCTE, not at Wilcox.</p>'
        page(f"courses/{c['slug']}/", c["name"], f"""
<nav class="crumbs"><a href="../../subjects/">All classes</a> / <a href="../../subjects/{e(c['department'])}/">{e(dept_name[c['department']])}</a></nav>
<header class="course-hero">
  <div class="hero-top">
    <div><div class="label">{e(dept_name[c['department']])}</div><h1>{e(c['name'])}</h1></div>
    <div class="c-badges">{course_badges(c)}</div>
  </div>
  <div class="stat-grid">{stats_html}</div>
  {f'<div class="prereq"><span class="label">Prerequisite</span>{e(prereq)}</div>' if prereq else ''}
  {f'<p class="meta">{e(c["note"])}</p>' if c.get("note") else ''}
</header>
{where}

<nav class="toc pills" aria-label="On this page"><a href="#s-overview">Overview</a><a href="#s-teachers">Teachers</a><a href="#s-resources">Resources</a><a href="#s-tips">Tips</a><a href="#s-summer">Summer HW</a><a href="#comments">Comments</a><a href="#s-catalog">Catalog</a></nav>

<section id="s-overview" class="sec">{sec_head("overview", "What students say")}<div id="overview" class="dyn"><div class="meta">Loading…</div></div></section>

<section id="s-teachers" class="sec">{sec_head("teachers", "Teachers", "Each teacher’s section is written by their students.")}
  <div id="teachers" class="teachers dyn"></div>
  <div id="compare" hidden><h3>Side by side</h3><div class="scroll-x"><table id="compare-table" class="compare"></table></div></div>
</section>

<div class="sec-row">
  <section id="s-resources" class="sec">{sec_head("resources", "Resources &amp; study guides")}<div id="resources" class="dyn"></div></section>
  <section id="s-tips" class="sec">{sec_head("tips", "Tips from past students")}<div id="tips" class="dyn"></div></section>
</div>
<section id="s-summer" class="sec">{sec_head("summer", "Summer homework")}<div id="summer" class="dyn"></div></section>

<section id="comments" class="sec">{sec_head("comments", "Comments", 'About the class, not the teacher as a person. New members’ comments appear after a reviewer approves them. <a href="../../rules/">Rules</a>')}
  <form id="comment-form" class="comment-form">
    <div id="replying" class="meta" hidden>Replying to a comment · <button type="button" class="linkish" id="cancel-reply">cancel</button></div>
    <label class="sr" for="comment-prompt">Topic</label><select id="comment-prompt"></select>
    <label class="sr" for="comment-body">Comment</label>
    <textarea id="comment-body" rows="3" maxlength="2000" placeholder="What was this class like?"></textarea>
    <button class="btn">Post</button>
  </form>
  <div id="comment-list"></div>
</section>

<section id="s-catalog" class="sec sec-quiet">{sec_head("catalog", "Catalog description", f"From the {e(CATALOG_SOURCE)}, page {e(c.get('page') - 1 if isinstance(c.get('page'), int) else '?')}.")}
  <div class="catalog-desc">{desc_html or '<p class="meta">The catalog has no description for this class.</p>'}</div></section>
""", desc=f"{c['name']} at Wilcox High School: what students say about tests, grading and homework, plus study guides and tips."
          + (" Includes AP exam info." if is_ap else ""),
             active="subjects/", script="course.js",
             data={"slug": c["slug"], "name": c["name"], "teachers": c["teachers"],
                   "teacherSlugs": {t: slugify(t) for t in c["teachers"]}})


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
<div id="gate" class="card gate" hidden>
  <h2>Sign in to see the bounty board</h2>
  <p>Bounties are jobs for Wilkipedia members: claim one, write a page, get credit on the leaderboard.</p>
  <p><button type="button" class="btn js-signin">Sign in</button> <span class="meta">Use your school account to get the SCUSD ✓ badge.</span></p>
</div>
<div id="members">
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
  <p><b>Points:</b> S (~30 min) = 10 · M (~2 hrs) = 30 · L (~5+ hrs) = 60 · anything outside a bounty = 5. After 3 approved submissions you become <b>Trusted</b>. If you signed in with your school account, your comments then post instantly.</p>
  <p><b>Sign in with your school account</b> (@scusd.net) to get the <span class="badge-school">SCUSD ✓</span> badge on everything you write. Personal Google accounts work too, but their comments always go to a reviewer first.</p>
  <p>Have an idea for a bounty? Suggest it in a comment on the class page, or tell a reviewer.</p>
</section>
</div>""", active="bounties/", script="bounties.js")

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
<div class="chips tabs"><button class="chip" data-tab="submissions">Submissions</button><button class="chip" data-tab="comments">Comments</button><button class="chip" data-tab="reports">Reports</button><button class="chip" data-tab="bounties">Bounties</button><button class="chip" data-tab="feedback">Feedback</button></div>
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
<a class="panel bell-link" href="../bell/"><span class="label"><span class="topic-ico small" aria-hidden="true">""" + ICONS["bell"] + """</span>Bell schedule</span><b>Period times, block days, finals and special days →</b></a>
<div id="school-list"><div class="meta">Loading…</div></div>
<p><a class="btn ghost" href="../submit/?kind=school_info">Add school info</a></p>""",
         active="school/", data={"page": "school"})

    page("account/", "Your account", """
<h1>Your account</h1>
<div id="account"><div class="meta">Loading…</div></div>""", data={"page": "account"})

    page("search/", "Search", """
<h1>Search</h1>
<form class="big-search" role="search"><input name="q" id="search-q" type="search" placeholder="Search classes, teachers, clubs, sports, rooms…" aria-label="Search" autocomplete="off" autofocus><button class="btn">Search</button></form>
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
<p>Started in 2026 by Ethan Liu and Jonathan Lee. Students write everything through <a href="../bounties/">bounties</a>, and reviewers check it before it’s published.</p>
<p><b>Where the facts come from.</b> Course names, grade levels, prerequisites and descriptions come from the SCUSD High School Course Catalog 2025–2026. Teacher lists come from the Wilcox staff directory. Everything else is written by students.</p>
<p><b>Not official.</b> Wilkipedia is an independent student project, not a Wilcox High School or Santa Clara Unified site. Always confirm policies and deadlines with your teacher or counselor. The official site is <a href="https://wilcox.santaclarausd.org/" target="_blank" rel="noopener">wilcox.santaclarausd.org ↗</a>.</p>
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
<p>If you sign in with a Santa Clara Unified school account (@scusd.net), your contributions show an <b>SCUSD ✓</b> badge. We work that out from your email's domain; the email itself stays private.</p>
<p>Your browser keeps a sign-in token so you stay signed in. Signing out removes it.</p>
<h2>Translation</h2>
<p>If you pick a language other than English (the 🌐 button), the page is translated by Google Translate: the page’s text is sent to Google to translate, and Google sets a cookie remembering your language. Choosing English turns this off.</p>
<h2>What you post</h2>
<p>Submissions are private until a reviewer approves them, and then they're public. Comments are public once they're visible. Reviewers can see pending submissions and held comments.</p>
<h2>Deleting your data</h2>
<p>Ask a Wilkipedia admin to delete your account. We'll remove your account and your email address. Pages you helped write stay on the site, credited to "Former student". If you'd rather your submissions and comments be removed too, say so and we'll delete them.</p>
<p>School accounts are usually closed after graduation. Your work stays on Wilkipedia afterwards.</p>
<h2>Who runs this</h2>
<p>Wilkipedia is an independent project run by Wilcox High School students. It is not operated by Wilcox High School or Santa Clara Unified School District.</p>
<p class="meta">Last updated September 2026.</p>""", data={"page": "static"})

    page("map/", "Campus map", """
<h1>Campus map</h1>
<p class="lede">Tap a room to zoom in and see who teaches there, what they teach and when.</p>
<div class="map-app" id="map-app">
  <div class="map-toolbar">
    <form id="room-find" class="room-find" role="search"><input id="room-q" list="room-ids" placeholder="Find a room, e.g. B204" aria-label="Find a room" autocomplete="off"><datalist id="room-ids"></datalist></form>
    <div class="zoom"><button type="button" id="z-in" aria-label="Zoom in">+</button><button type="button" id="z-out" aria-label="Zoom out">−</button><button type="button" id="z-reset">Whole campus</button></div>
  </div>
  <div class="map-stage" id="map-stage">
    <svg id="map-svg" role="group" aria-label="Wilcox High School campus map"><image id="map-img"/><g id="hotspots"></g></svg>
    <aside class="map-panel" id="map-panel" aria-live="polite" hidden></aside>
    <div class="map-hint" id="map-hint">Drag to move · scroll or pinch to zoom · tap a room</div>
  </div>
  <p class="meta credit" id="map-credit"></p>
</div>
<section><h2>Rooms with info</h2>
  <p class="meta">Built from the room numbers students add to teacher sections. <a href="../submit/?kind=teacher_section">Add a teacher’s room and schedule</a></p>
  <div id="room-list"><div class="meta">Loading…</div></div>
</section>""", active="map/", script="map.js", data={"page": "map"},
         desc="Interactive map of Wilcox High School: tap a classroom to see who teaches there, what they teach and when.")

    page("menu/", "Cafeteria menu", """
<h1>Cafeteria menu</h1>
<p class="lede">Breakfast and lunch at Wilcox this week, straight from the district’s menu.</p>
<div id="menu-app">
  <div class="menu-bar">
    <div class="seg" id="menu-which" role="radiogroup" aria-label="Meal">
      <button type="button" role="radio" data-which="breakfast">Breakfast</button>
      <button type="button" role="radio" data-which="lunch">Lunch</button>
    </div>
    <div class="week-nav"><button type="button" class="week-btn" id="prev-week" aria-label="Previous week">‹</button>
      <b id="week-label"></b><button type="button" class="week-btn" id="next-week" aria-label="Next week">›</button>
      <button type="button" class="chip" id="this-week">This week</button></div>
  </div>
  <div id="menu-days" class="menu-days"></div>
  <p class="meta">Menus can change. <b>(V)</b> vegetarian · <b>(VG)</b> vegan · <b>(GF)</b> gluten-free. For allergens and nutrition, see the
    <a id="official" href="#" target="_blank" rel="noopener">official menu ↗</a>. Menu data: Santa Clara Unified Nutrition Services.</p>
</div>""", active="menu/", script="menu.js", data={"page": "menu"},
         desc="This week’s breakfast and lunch menu at Wilcox High School.")

    page("clubs/", "Clubs", """
<h1>Clubs</h1>
<p class="lede">Every club at Wilcox: what it does, when it meets, and how to join.</p>
<div class="list-tools"><input id="act-q" type="search" placeholder="Search clubs" aria-label="Search clubs"><div class="chips" id="act-filter"></div></div>
<div id="act-list"><div class="meta">Loading…</div></div>
<p class="meta" id="act-source"></p>
<p><a class="btn ghost" href="../submit/?kind=club">Add info about a club</a></p>""", active="clubs/", data={"page": "clubs"},
         desc="Clubs at Wilcox High School: what they do, when they meet, and how to join.")

    page("sports/", "Sports", """
<h1>Sports</h1>
<p class="lede">Wilcox Chargers teams by season: tryouts, practice, and what it’s like to play.</p>
<div class="list-tools"><input id="act-q" type="search" placeholder="Search teams" aria-label="Search teams"><div class="chips" id="act-filter"></div></div>
<div id="act-list"><div class="meta">Loading…</div></div>
<p class="meta" id="act-source"></p>
<p><a class="btn ghost" href="../submit/?kind=sport">Add info about a team</a></p>""", active="sports/", data={"page": "sports"},
         desc="Wilcox High School sports teams by season: tryouts, practices and what it's like to play.")

    page("feedback/", "Feedback", """
<h1>Feedback</h1>
<p class="lede">Found a bug? Want a feature? Have an idea? Tell the Wilkipedia team. Every message is read.</p>
<form id="fb-form" class="card fb-form">
  <div class="field"><span class="flabel">What kind?</span>
    <div class="seg" id="fb-kind" role="radiogroup" aria-label="Kind of feedback">
      <button type="button" role="radio" aria-checked="true" data-kind="idea">💡 Idea</button>
      <button type="button" role="radio" aria-checked="false" data-kind="bug">🐞 Bug</button>
      <button type="button" role="radio" aria-checked="false" data-kind="feature">✨ Feature request</button>
      <button type="button" role="radio" aria-checked="false" data-kind="other">💬 Other</button>
    </div></div>
  <div class="field"><label for="fb-msg">Your message <span class="req">*</span></label>
    <div class="hint" id="fb-hint">What would make Wilkipedia better?</div>
    <textarea id="fb-msg" rows="6" maxlength="2000" required></textarea></div>
  <div class="field"><label for="fb-page">Which page? <span class="hint-inline">(optional)</span></label>
    <input id="fb-page" maxlength="300" placeholder="e.g. the campus map, or paste the link"></div>
  <div class="field"><label for="fb-name">Your name <span class="hint-inline">(optional, so we can thank you)</span></label>
    <input id="fb-name" maxlength="60"></div>
  <p id="fb-error" class="error" hidden></p>
  <button class="btn big">Send feedback</button>
</form>
<div id="fb-done" class="done" hidden><h2>Thanks! We got it.</h2><p>The team reads every message on the review desk.</p>
  <p><button type="button" class="btn ghost" id="fb-again">Send another</button></p></div>""", data={"page": "feedback"},
         desc="Send the Wilkipedia team an idea, a bug report or a feature request.")

    page("bell/", "Bell schedule", """
<h1>Bell schedule</h1>
<p class="lede">When every period starts and ends at Wilcox, 2026–27.</p>
<section id="bell" class="bell bell-page" aria-label="Today"><div class="meta">Loading today…</div></section>
<div id="bell-full" class="bell-full-page"><div class="meta">Loading…</div></div>""", active="bell/", data={"page": "bell"},
         desc="Wilcox High School bell schedule: period times for Monday, block days, finals and special days.")

    page("credits/", "Credits", """
<h1>Credits &amp; thanks</h1>
<p class="lede">Wilkipedia exists because students gave their time. Thank you to everyone below.</p>
<section class="sec credits-sec"><h2>Founders</h2>
  <div class="people">
    <div class="person"><span class="avatar av-md" style="--av:#111">E</span><div><b>Ethan Liu</b><span class="meta">Founder · builds the site, final approver</span></div></div>
    <div class="person"><span class="avatar av-md" style="--av:#111">J</span><div><b>Jonathan Lee</b><span class="meta">Co-founder · reviewer</span></div></div>
  </div></section>
<section class="sec credits-sec"><h2>Review team</h2><p class="meta">They check every submission before it goes live.</p><div class="people" id="cr-team"><div class="meta">Loading…</div></div></section>
<section class="sec credits-sec"><h2>Contributors</h2><p class="meta">Everyone whose writing is on the site: overviews, teacher sections, tips, study guides, club and team info.</p><div class="people" id="cr-contrib"><div class="meta">Loading…</div></div></section>
<section class="sec credits-sec"><h2>Ideas &amp; bug reports</h2><p class="meta">People whose feedback made it into the site. <a href="../feedback/">Send yours</a> and leave your name to be listed.</p><div class="people" id="cr-feedback"><div class="meta">Loading…</div></div></section>
<section class="sec credits-sec sec-quiet"><h2>Sources</h2><ul class="sources">
  <li>Courses: SCUSD High School Course Catalog 2025–2026</li>
  <li>Teachers, clubs, sports and bell schedule: <a href="https://wilcox.santaclarausd.org/" target="_blank" rel="noopener">Wilcox High School website ↗</a></li>
  <li>Campus map: Wilcox High School campus map</li>
  <li>Cafeteria menu: Santa Clara Unified Nutrition Services (live)</li>
  <li>Class colours: Wikipedia, “Adrian C. Wilcox High School”</li>
  <li>Typeface: Newsreader (SIL Open Font License)</li>
</ul></section>""", data={"page": "credits"}, desc="Everyone who helped build Wilkipedia: founders, reviewers, contributors and people who sent ideas.")

    page("404.html", "Page not found", """
<h1>Page not found</h1><p>Try <a href="./search/">searching</a> or <a href="./subjects/">browse all classes</a>.</p>""", data={"page": "static"})


def build_data(depts, courses, teachers):
    slim = [{k: c.get(k) for k in ("slug", "name", "department", "grades", "ucCsu", "teachers")} for c in courses.values()]
    (DATA / "courses.json").write_text(json.dumps(
        {"departments": [{"slug": d["slug"], "name": short_dept(d["name"])} for d in depts], "courses": slim},
        ensure_ascii=False, separators=(",", ":")))
    idx = build_search_index(depts, courses, teachers)
    (DATA / "search.json").write_text(json.dumps(idx, ensure_ascii=False, separators=(",", ":")))

    seed = json.loads((DATA / "seed-bounties.json").read_text())
    q = lambda v: "null" if v is None else ("'" + str(v).replace("'", "''") + "'" if isinstance(v, str) else str(v))
    cols = ["id", "title", "track", "course_slug", "teacher", "kind", "size", "priority", "you_get", "done_means"]
    rows = ",\n".join("(" + ", ".join(q(b.get(k)) for k in cols) + ")" for b in seed)
    (ROOT / "supabase" / "seed.sql").write_text(
        "-- Generated by tools/build.py from data/seed-bounties.json. Run after schema.sql.\n"
        f"insert into public.bounties ({', '.join(cols)}) values\n{rows}\non conflict (id) do nothing;\n")


# Pages the search box should find, with the words people use for them.
SEARCH_PAGES = [
    ("Campus map", "map/", "Find a classroom", "map rooms where building find classroom directions"),
    ("All classes", "subjects/", "Browse every class", "classes courses catalog subjects"),
    ("Cafeteria menu", "menu/", "Breakfast and lunch this week", "menu lunch breakfast food cafeteria eat today meal"),
    ("Clubs", "clubs/", "Every club at Wilcox", "clubs activities join"),
    ("Sports", "sports/", "Chargers teams by season", "sports athletics teams tryouts chargers"),
    ("Summer homework", "summer/", "Summer assignments", "summer homework assignments"),
    ("School info", "school/", "Bell schedule, counselors, passes", "bell schedule counselor appointment pass bathroom attendance tech"),
    ("Bounty board", "bounties/", "Help build Wilkipedia", "bounties bounty contribute help volunteer"),
    ("Contribute", "submit/", "Add info, a tip or a study guide", "submit add write contribute study guide tip"),
    ("Leaderboard", "leaderboard/", "Top contributors", "leaderboard points top"),
    ("Teachers", "teachers/", "Every teacher", "teachers staff"),
    ("Your account", "account/", "Profile, picture, settings", "account profile settings avatar picture sign out night mode"),
    ("Community rules", "rules/", "What you can post", "rules guidelines"),
    ("Privacy", "privacy/", "What we store", "privacy data delete account"),
    ("About Wilkipedia", "about/", "Who runs this", "about contact founders ethan liu jonathan lee"),
    ("Credits", "credits/", "Everyone who helped build Wilkipedia", "credits thanks thank you contributors helpers founders team"),
    ("Send feedback", "feedback/", "Ideas, bug reports, feature requests", "feedback bug report feature request idea suggestion contact problem broken"),
    ("Bell schedule", "bell/", "Period times, block days, finals", "bell schedule period times block day finals minimum day when does school start end"),
]


def build_search_index(depts, courses, teachers):
    """Everything the search box can find, one compact record each:
    t=type, n=name, u=url (relative to the site root), d=subtitle, k=extra words."""
    dept = {d["slug"]: short_dept(d["name"]) for d in depts}
    words = lambda text, n=70: " ".join((text or "").split()[:n])
    idx = []
    for c in courses.values():
        idx.append({"t": "c", "n": c["name"], "u": f"courses/{c['slug']}/",
                    "d": " · ".join(x for x in [dept[c["department"]], f"Grades {c['grades']}" if c.get("grades") else ""] if x),
                    "k": " ".join([dept[c["department"]], " ".join(c["teachers"]), c.get("courseNumber") or "",
                                   words(c.get("description"))])})
    for t in teachers:
        idx.append({"t": "t", "n": t["name"], "s": t["slug"], "u": f"teachers/{t['slug']}/",
                    "d": ", ".join(t["departments"]),
                    "k": " ".join(courses[x]["name"] for x in t["courses"]) + " teacher"})
    acts_file = DATA / "activities.json"
    acts = json.loads(acts_file.read_text()) if acts_file.exists() else {"clubs": [], "sports": []}
    for c in acts["clubs"]:
        idx.append({"t": "club", "n": c["name"], "u": f"clubs/#{slugify(c['name'])}", "d": f"Club · {c.get('category') or 'Other'}",
                    "k": " ".join(x for x in [c.get("advisor"), c.get("meets"), words(c.get("description"), 40), "club"] if x)})
    for t in acts["sports"]:
        idx.append({"t": "sport", "n": t["name"], "u": f"sports/#{slugify(t['name'])}",
                    "d": f"Sport · {t.get('season') or 'Season not listed'}",
                    "k": " ".join(t.get("coaches", []) + t.get("levels", []) + ["team sport athletics", t.get("season") or ""])})
    rooms = json.loads((DATA / "map.json").read_text())["rooms"]
    for r in rooms:
        if r["kind"] == "building":
            continue
        idx.append({"t": "room", "n": r["label"] if r["label"] != r["id"] else f"Room {r['id']}", "u": f"map/#{r['id']}",
                    "d": " · ".join(x for x in [r["buildingName"], f"Floor {r['floor']}" if r["building"] in ("B", "R") else ""] if x),
                    "k": f"{r['id']} room {r['kind']}"})
    for name, url, sub, kw in SEARCH_PAGES:
        idx.append({"t": "page", "n": name, "u": url, "d": sub, "k": kw})
    return idx


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
    build_data(depts, courses, teachers)       # first, so its output is in the data hash
    VERSIONS.update(asset_versions())
    build_home(depts)
    build_subjects(depts)
    build_courses(depts, courses)
    build_teachers(teachers, courses)
    build_static()
    build_seo(courses, teachers, depts)
    linked = sum(1 for c in courses.values() if c["teachers"])
    print(f"Built {len(courses)} course pages ({linked} with teachers), {len(teachers)} teacher pages, {len(depts)} subjects.")


if __name__ == "__main__":
    main()
