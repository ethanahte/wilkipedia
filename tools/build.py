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
import pathways
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

GENERATED_DIRS = ["subjects", "courses", "teachers", "bounties", "submit", "review", "guides", "numbers",
                  "leaderboard", "summer", "school", "account", "rules", "about", "search", "privacy", "terms", "map",
                  "menu", "clubs", "sports", "feedback", "credits", "bell", "calendar", "inbox", "dashboard"]

e = lambda s: html.escape(str(s if s is not None else ""), quote=True)


# Teachers are listed by last name (Jonathan). The surname is the last word, skipping Jr/Sr/II/III/IV,
# except where the school's own pages show a two-part one: the AVID page lists "Velia Gandara".
# assets/js/ui.js (surname) has the same rule for the dropdowns.
SURNAMES = {"Velia Gandara Solis": "Gandara Solis"}
def surname(name):
    if name in SURNAMES:
        return SURNAMES[name]
    w = name.split()
    if len(w) > 1 and re.fullmatch(r"(jr|sr|ii|iii|iv)\.?", w[-1], re.I):
        w = w[:-1]
    return w[-1] if w else ""


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

    teacher_list = sorted(teachers.values(), key=lambda t: (surname(t["name"]).lower(), t["name"]))
    for t in teacher_list:
        t["slug"] = slugify(t["name"])
        for c in t["courses"]:
            courses[c]["teachers"].append(t["name"])

    # What students call a class (data/course-nicknames.json), checked so that
    # every name means exactly one class
    nick = json.loads((DATA / "course-nicknames.json").read_text())
    nick.pop("_about", None)
    # Typed names must each mean one class; a 'shared' call is shown only, so it
    # may repeat another class's call (never a catalog name)
    seen = {c["name"].lower(): slug for slug, c in courses.items()}
    for slug, v in sorted(nick.items(), key=lambda kv: bool(kv[1].get("shared"))):
        if slug not in courses:
            raise SystemExit(f"course-nicknames.json: no class with slug {slug!r}")
        typed = ([v["call"]] if v.get("call") and not v.get("shared") else []) + v.get("also", []) + v.get("sections", [])
        for n in typed:
            if seen.get(n.lower(), slug) != slug:
                raise SystemExit(f"course-nicknames.json: {n!r} already means {seen[n.lower()]}")
            seen[n.lower()] = slug
        if v.get("shared"):
            owner = seen.get(v.get("call", "").lower())
            if not owner or courses[owner]["name"].lower() == v["call"].lower():
                raise SystemExit(f"course-nicknames.json: shared {v.get('call')!r} on {slug} needs another class that is called that")
        courses[slug]["call"] = v.get("call")
        courses[slug]["also"] = v.get("also", [])
        courses[slug]["shared"] = bool(v.get("shared")) or None
        courses[slug]["sections"] = v.get("sections") or None

    depts = catalog["departments"]
    for d in depts:
        d["courses"] = sorted((c for c in courses.values() if c["department"] == d["slug"]),
                              key=lambda c: c["name"])
    return depts, courses, teacher_list


# ─────────────────────────── layout ───────────────────────────

# The header shows two ways in (the map and the class list); everything else
# lives in the "More" menu. The bounty board is not here: it is a side tab that
# only signed-in members see (see initHeader in assets/js/ui.js).
NAV = [("map/", "Map"), ("subjects/", "Classes"), ("guides/", "Study guides")]
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
    "settings": _I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    "chart": _I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    "cube": _I('<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'),
    "search": _I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    "external": _I('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    "calendar": _I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14h2M11 14h2M14.5 14h2M7.5 17.5h2M11 17.5h2"/>'),
    "book": _I('<path d="M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 0 2 2h14"/><path d="M9 7h7"/>'),
    "notes": _I('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    "pin": _I('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
    "bounty": '<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z"/></svg>',
}
# The "More" panel: grouped columns, each link with an icon and a short line
MORE_GROUPS = [
    ("School day", [("calendar/", "Calendar", "calendar", "Breaks, finals and events, all year"),
                    ("campus/", "3D campus", "cube", "Walk the whole school, drawn like an anime"),
                    ("bell/", "Bell schedule", "bell", "Period times, block days, finals"),
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
                          ("credits/", "Credits & thanks", "heart", "Everyone who helped"),
                          ("settings/", "Settings", "settings", "Theme, text size, language")]),
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


def check_css(path):
    """A stray or missing brace silently drops every rule after it (it once hid the
    calendar's badges and admin dialog), so the build stops instead."""
    import re
    text = re.sub(r"/\*.*?\*/", "", path.read_text(), flags=re.S)
    text = re.sub(r"\"[^\"\n]*\"|'[^'\n]*'", "", text)
    depth = 0
    for n, line in enumerate(text.split("\n"), 1):
        depth += line.count("{") - line.count("}")
        if depth < 0:
            raise SystemExit(f"{path.name}: an extra '}}' around line {n}")
    if depth:
        raise SystemExit(f"{path.name}: {depth} unclosed '{{'")

# Cookie settings (Settings → Cookies & storage). Runs first on every page,
# the 3D campus included. It sorts each localStorage key into a group and quietly
# drops writes to a group the reader has switched off, so no feature needs its
# own check. "need" (sign-in token, these choices, demo data, anything not ours)
# can't be switched off; "history" is recent classes and drafts; every other
# wilkipedia-*/wilcox-* key is a remembered setting ("prefs").
STORAGE_GATE = ("<script>try{(function(){var L=localStorage,S=Storage.prototype,set=S.setItem,get=S.getItem,"
                "cat=function(k){k=String(k);if(/^(sb-|wilkipedia-(cookies|demo-))/.test(k))return'need';"
                "if(/^wilkipedia-(recent-|draft:)/.test(k))return'history';"
                "return/^(wilkipedia|wilcox)-/.test(k)?'prefs':'need'};window.wkStoreCat=cat;"
                "S.setItem=function(k,v){if(this===L&&cat(k)!=='need'){var c;try{c=JSON.parse(get.call(L,'wilkipedia-cookies'))||{}}"
                "catch(e){c={}}if(c[cat(k)]===false)return}return set.call(this,k,v)}})()}catch(e){}</script>")

# Applies a saved night-mode choice before first paint, so pages never flash.
THEME_BOOT = ("<script>try{var d=document.documentElement,t=localStorage.getItem('wilkipedia-theme'),"
              "c=localStorage.getItem('wilkipedia-class-applied');if(t)d.dataset.theme=t;if(c)d.dataset.class=c;"
              "['text','motion','bell','fab','avatars','homebg'].forEach(function(k){var v=localStorage.getItem('wilkipedia-'+k);if(v)d.dataset[k]=v})"
              "}catch(e){}</script>")


def crumbs(trail, here, here_path):
    """The breadcrumb above a page's heading: [(label, relative href), …]. The page itself isn't
    repeated (its <h1> sits right under it), but it's in the search engines' copy (BreadcrumbList)."""
    nav = '<nav class="crumbs" aria-label="Breadcrumb">' + " / ".join(f'<a href="{h}">{e(l)}</a>' for l, h in trail) + "</nav>"
    if not SITE_URL:
        return nav
    base = SITE_URL.rstrip("/") + "/"
    items = [("Wilkipedia", "")] + [(label, path) for (label, _href), path in trail_paths(trail, here_path)] + [(here, here_path)]
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": l, "item": base + p} for i, (l, p) in enumerate(items)]}
    return nav + f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>'


def trail_paths(trail, here_path):
    """Turns each crumb's relative href into a path from the site root."""
    depth = here_path.rstrip("/").count("/") + 1
    out = []
    for item in trail:
        up, rest = item[1].count("../"), item[1].replace("../", "")
        parts = here_path.rstrip("/").split("/")[: max(0, depth - up)]
        out.append((item, "/".join(parts + ([rest.rstrip("/")] if rest else [])).strip("/") + "/"))
    return out


def page(path, title, body, *, desc="", script=None, active=None, data=None):
    """Writes ROOT/path/index.html (or ROOT/path if it ends in .html)."""
    out = ROOT / path if path.endswith(".html") else ROOT / path / "index.html"
    depth = len(out.relative_to(ROOT).parts) - 1
    r = "../" * depth or "./"
    full_title = f"{title} · Wilkipedia" if title != "Wilkipedia" else "Wilkipedia: everything about Wilcox High School"
    canon = ""
    if SITE_URL:
        rel = "" if path in ("", "index.html") else path.rstrip("/") + ("/" if not path.endswith(".html") else "")
        canon = f'<link rel="canonical" href="{e(SITE_URL.rstrip("/") + "/" + rel)}">'
    cur = lambda href: " aria-current=page" if active == href else ""
    nav = "".join(f'<a href="{r}{href}"{cur(href)}>{label}</a>' for href, label in NAV)
    more_active = any(active == href for href, _, _ in MORE)
    nav += (f'<details class="more"><summary{" class=is-active" if more_active else ""} aria-label="More pages">'
            f'{ICONS["menu"]}<span>More</span>{ICONS["chev"]}</summary><div class="menu mega">'
            # a featured page on the left, over Ethan's painting of the courtyard (not an invented picture)
            + f'<a class="mega-feature" href="{r}campus/"{cur("campus/")}><span class="mf-img" aria-hidden="true"></span>'
              f'<span class="mf-k">Explore</span><b>3D campus</b><span class="mf-sub">Walk the whole school, drawn like an anime.</span>'
              f'<span class="mf-go">Step inside <span aria-hidden="true">→</span></span></a>'
            + "".join(f'<div class="mega-col"><div class="mega-h">{group}</div>'
                      # the featured page keeps a plain entry for when the panel is too narrow for the card
                      + "".join(f'<a href="{r}{href}"{cur(href)}{" class=mega-alt" if href == "campus/" else ""}><span class="mi">{ICONS[icon]}</span><span class="mt"><span>{label}</span><small>{sub}</small></span></a>'
                                for href, label, icon, sub in items) + '</div>'
                      for group, items in MORE_GROUPS)
            + f'<div class="mega-foot"><a href="{WILCOX_SITE}" target="_blank" rel="noopener" class="ext">{ICONS["school"]}<span>Official Wilcox website</span>{ICONS["external"]}</a>'
            + f'<div class="mega-acts"><button type="button" data-act="lang">{ICONS["globe"]}<span>Language</span></button></div></div>'
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
{STORAGE_GATE}
{THEME_BOOT}
<script type="importmap">{importmap}</script>
</head>
<body data-root="{r}"{' class="home"' if path == "" else ""}>
<a class="skip" href="#main">Skip to content</a>
<header class="site" id="site-header">
  <div class="wrap bar">
    <a class="brand" href="{r}" translate="no"><span class="w">W</span>ilkipedia</a>
    <nav class="main-nav" aria-label="Main">{nav}</nav>
    <div class="bar-tools">
      <a class="hsearch" href="{r}search/" role="button" aria-label="Search Wilkipedia">{ICONS["search"]}<span class="hs-t">Search classes, teachers, clubs…</span><kbd class="hs-k"></kbd></a>
      <a class="icon-btn search-btn" href="{r}search/" aria-label="Search">{ICONS["search"]}</a>
      <!-- night mode: both icons ship, CSS shows the one for the mode it switches to (right from the first paint) -->
      <button type="button" class="icon-btn theme-btn" id="theme-toggle" aria-label="Switch night mode"><svg class="tb-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg><svg class="tb-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
      <button type="button" class="lang-btn" id="lang-btn" hidden aria-label="Language" aria-haspopup="true" aria-expanded="false"><span class="lang-code" translate="no"></span></button>
      <div id="auth" class="auth"></div>
      <button type="button" class="icon-btn menu-btn" id="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="drawer">{ICONS["menu"]}</button>
    </div>
  </div>
</header>
<div class="lang-menu" id="lang-menu" role="menu" hidden></div>
<div class="drawer" id="drawer" hidden>
  <div class="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
    <div class="drawer-top"><a class="brand" href="{r}" translate="no"><span class="w">W</span>ilkipedia</a>
      <button type="button" class="icon-btn drawer-x" aria-label="Close menu">✕</button></div>
    <nav class="drawer-nav" aria-label="All pages">
      <div class="dr-group">{"".join(f'<a href="{r}{href}"{cur(href)}>{label}</a>' for href, label in NAV)}</div>
      {"".join(f'<div class="dr-group"><div class="dr-h">{group}</div>' + "".join(f'<a href="{r}{href}"{cur(href)}>{ICONS[icon]}<span>{label}</span></a>' for href, label, icon, _sub in items) + '</div>' for group, items in MORE_GROUPS)}
      <div class="dr-group"><a href="{WILCOX_SITE}" target="_blank" rel="noopener">{ICONS["school"]}<span>Official Wilcox website</span>{ICONS["external"]}</a></div>
    </nav>
    <div class="drawer-foot"><button type="button" class="btn ghost small" data-act="lang">{ICONS["globe"]}<span>Language</span></button><a class="btn ghost small" href="{r}settings/">Settings</a></div>
  </div>
</div>
<div id="announce" class="announce" aria-label="Announcements" role="region" hidden></div>
<a id="contribute-fab" class="fab contribute-fab" href="{r}submit/" aria-label="Contribute: add info, a tip or a study guide">{ICONS["plus"]}<span class="t">Contribute</span></a>
<a id="bounty-tab" class="bounty-fab" href="{r}bounties/" aria-label="Bounty board" hidden>{ICONS["bounty"]}<span class="t">Bounties</span><span class="n" aria-label="unclaimed bounties"></span></a>
<main id="main" class="wrap">
{body}
</main>
<footer class="site">
  <div class="wrap">
    <p><b>Wilkipedia</b> is written by Wilcox students, for Wilcox students. It is an independent student project, not an official Wilcox High School or SCUSD site.</p>
    <p><a href="{r}rules/">Community rules</a> · <a href="{r}terms/">Terms</a> · <a href="{r}privacy/">Privacy</a> · <a href="{r}settings/#cookies">Cookie settings</a> · <a href="{r}about/">About</a> · <a href="{r}submit/">Contribute</a> · <a href="{r}feedback/">Feedback &amp; bug reports</a> · <a href="{r}credits/">Credits &amp; thanks</a> · <a href="{WILCOX_SITE}" target="_blank" rel="noopener">Official Wilcox High School website ↗</a></p>
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
    hay = " ".join([c["name"], c.get("call") or "", *t]).lower()
    return f"""<li class="course-row is-empty" data-slug="{e(c['slug'])}" data-name="{e(c['name'])}" data-hay="{e(hay)}" data-grade="{m.group() if m else ''}" data-kind="{'ap' if c['name'].startswith('AP ') else ''}{' honors' if 'Honors' in c['name'] else ''}">
  <a href="{r}courses/{e(c['slug'])}/"><span class="c-name">{e(c['name'])}</span>
  <span class="c-meta">{e(grades(c))}{' · ' + e(who) if who else ''}</span></a>
  <span class="c-badges">{course_badges(c)}<span class="status"></span></span></li>"""


# ─────────────────────────── pages ───────────────────────────

def build_home(depts, courses, teachers):
    page("", "Wilkipedia", f"""
<section class="hero hero-split" aria-labelledby="hero-h">
  <div class="hero-main">
    <p class="hero-kicker">Wilcox High School · Santa Clara</p>
    <h1 id="hero-h">Everything Wilcox, in one place.</h1>
    <form class="big-search" action="search/" role="search">
      <div class="big-search-field">{ICONS["search"]}<input name="q" id="home-q" type="search" placeholder="Search anything…" aria-label="Search classes, teachers, clubs and teams" autocomplete="off">
      <div id="home-results" class="results-pop" role="listbox" hidden></div></div>
      <button class="btn">Search</button>
    </form>
    <p class="hero-trust">Written by Wilcox students and checked by student reviewers. Not an official Wilcox or SCUSD site.</p>
  </div>
  <aside class="hero-side" aria-label="Right now at Wilcox">
    <p class="hero-side-h">Right now</p>
    <section id="bell" class="bell" aria-label="Bell schedule"><div class="meta">Loading today’s bell schedule…</div></section>
  </aside>
</section>
<section id="next-meal" class="bell next-meal" aria-label="Cafeteria menu"><div class="meta">Loading the cafeteria menu…</div></section>

<section class="home-sec guides-sec" aria-labelledby="hg-h">
  <div class="hg-intro">
    <h2 id="hg-h">Study guides</h2>
    <p class="hg-sub">Made by Wilcox students for classes they took, and checked by reviewers before they go up.</p>
    <p class="hg-count" id="hg-count"></p>
    <form class="hg-find" id="hg-find" role="search"><label class="sr" for="hg-class">Find study guides for a class</label>
      <input id="hg-class" list="hg-classes" placeholder="Your class, e.g. AP Biology" autocomplete="off"><datalist id="hg-classes"></datalist>
      <button class="btn">Find</button></form>
    <p class="hg-links"><a href="guides/">All study guides</a><a href="submit/?kind=resource">Share one you made</a></p>
  </div>
  <ol class="hg-list" id="home-guides" aria-label="Newest study guides"><li class="meta">Loading…</li></ol>
</section>

<section class="home-sec">
  <h2>Recently added</h2><div id="home-recent" class="mini-list"><div class="meta">Loading…</div></div>
</section>
""", desc="Everything about Wilcox High School in Santa Clara in one place: classes and teachers, the campus map, bell schedule, clubs and sports, written by Wilcox students.",
         data={"page": "home"})


def short_dept(name):
    return {"Silicon Valley Career Technical Education (SVCTE)": "SVCTE (off-campus)",
            "Visual / Performing Arts": "Visual & Performing Arts"}.get(name, name)


def build_subjects(depts):
    # The class lists (Ethan, 2026-10-01: like the class page, "more 高级, efficient, fascinating").
    # A short head with the live numbers, a find box that filters as you type, an index of the
    # subjects (each with how much is written, filled in by pages.js), then each subject's classes
    # in two dense columns, where a dot says what has student info instead of "Not written yet"
    # on every row. The a–g chart and the pathways map sit in an "Explore" pair of folds.
    year = e(CATALOG_SOURCE.split(' ')[-1])
    total = sum(len(d["courses"]) for d in depts)
    SORT_HTML = '<label class="cl-sort">Sort <select id="sort" data-native><option value="subject">By subject</option><option value="az">A–Z</option><option value="grade">By grade</option></select></label>'
    tools = lambda sort: f'''<div class="cl-tools">
  <label class="cl-find">{ICONS["search"]}<span class="sr">Find a class</span><input id="cl-q" type="search" placeholder="Find a class or a teacher" autocomplete="off"></label>
  <div class="vtabs" id="filter" role="group" aria-label="Show"><button type="button" class="vtab" data-f="all" aria-pressed="true">All</button><button type="button" class="vtab" data-f="has">Has student info</button><button type="button" class="vtab" data-f="ap">AP</button><button type="button" class="vtab" data-f="honors">Honors</button></div>
  {SORT_HTML if sort else ''}
</div>
<p class="cl-none" id="cl-none" hidden>No classes match. <button type="button" class="linkish" id="cl-clear">Clear the search</button></p>'''
    index = "".join(f'''<a class="cl-subj" href="#d-{e(d['slug'])}" data-dept="{e(d['slug'])}"><b>{e(short_dept(d['name']))}</b>
      <span class="cl-subj-n">{len(d['courses'])} classes<span class="w"></span></span><span class="c-bar"><i></i></span></a>''' for d in depts)
    body = "".join(f"""<section class="dept-block" id="d-{e(d['slug'])}"><header class="cl-dh"><h2><a href="{e(d['slug'])}/">{e(short_dept(d['name']))}</a></h2><span class="cl-dn">{len(d['courses'])}</span><a class="cl-dlink" href="{e(d['slug'])}/">Subject page →</a></header>
      <ul class="course-list">{''.join(course_row(c, '../') for c in d['courses'])}</ul></section>""" for d in depts)
    page("subjects/", "All classes", f"""
<div class="classes-page">
<header class="cl-head">
  <p class="c-kicker">Course catalog {year}</p>
  <h1>All classes</h1>
  <p class="cl-lede"><b>{total}</b> classes in <b>{len(depts)}</b> subjects, from the SCUSD catalog. <span id="cl-written"></span></p>
</header>
<nav class="cl-index" aria-label="Subjects">{index}</nav>
<div class="cl-explore">
<details class="nb-card nb-fold" id="ag"><summary><h2>Where each UC/CSU a–g requirement can be met</h2>
  <span class="nb-sub">Bubble size = number of classes · rows = subjects · columns = a–g letters, plus classes that don’t count toward a–g. Point at a bubble for the classes.</span></summary>
  <svg id="arcmatrix" viewBox="0 0 430 360" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Number of classes in each subject that meet each a–g requirement"></svg>
  <p class="nb-src">SCUSD COURSE CATALOG {year} · A FEW CLASSES LIST A–G LOOSELY (“D/G”); THEY COUNT UNDER EACH LETTER · CHECK WITH YOUR COUNSELOR</p></details>
<details class="nb-card nb-fold pw-fold" id="pw-fold"><summary><h2 id="pw-h">How classes connect</h2>
  <span class="nb-sub">Every class in the {e(CATALOG_SOURCE)}, joined by the prerequisites it lists. Point at a class to see what it needs. <span class="pw-legend"><i class="has"></i> students have written about it</span> <span class="pw-legend"><i class="seq"></i> next grade or level, not a prerequisite</span> <span class="pw-legend"><i class="solo"></i> linked to no other class</span></span></summary>
  <div id="pathways" class="pathways"><div class="meta">Loading the map…</div></div></details>
</div>
{tools(True)}
<div id="by-subject">{body}</div>
<div id="flat" hidden></div>
</div>""", active="subjects/", data={"page": "subject"})

    for d in depts:
        svcte = d["slug"] == "svcte"
        others = "".join(f'<a href="../{e(o["slug"])}/">{e(short_dept(o["name"]))}</a>' for o in depts if o is not d)
        page(f"subjects/{d['slug']}/", short_dept(d["name"]), f"""
<div class="classes-page">
{crumbs([("All classes", "../")], short_dept(d["name"]), f"subjects/{d['slug']}/")}
<header class="cl-head">
  <p class="c-kicker">Subject · course catalog {year}</p>
  <h1>{e(short_dept(d['name']))}</h1>
  <p class="cl-lede"><b>{len(d['courses'])}</b> classes. <span id="cl-written"></span></p>
</header>
{'<p class="note">SVCTE programs are taught at the Silicon Valley Career Technical Education campus, not at Wilcox. Ask your counselor about signing up.</p>' if svcte else ''}
{tools(False)}
<ul class="course-list">{''.join(course_row(c, '../../') for c in d['courses'])}</ul>
<nav class="cl-others" aria-label="Other subjects"><span>Other subjects</span>{others}</nav>
</div>
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
    # A plain serif heading with an optional line under it. (Section icons were
    # dropped in the de-templating pass: every section wore the same badge.)
    return f'<h2>{title}</h2>{f"<p class=sec-sub>{sub}</p>" if sub else ""}'


def build_courses(depts, courses):
    # The class page (Ethan, 2026-10-01: "more 高级, more efficient, more fascinating"). The official
    # facts lead: the catalog's own description is the opening text, the numbers sit in a small grid,
    # and "Where it fits" draws the catalog's prerequisite links in and out of this class (the same
    # links as the pathways map, so nothing is invented). Student-written sections fill in below;
    # the empty ones fold into one "Help finish this page" block (course.js), and a side index shows
    # what's written so far.
    dept_name = {d["slug"]: short_dept(d["name"]) for d in depts}
    pw = pathways.build(list(courses.values()))
    pw_name = {n["slug"]: n["name"] for n in pw["nodes"]}
    before_of, after_of = {}, {}
    for ed in pw["edges"]:
        before_of.setdefault(ed["to"], []).append(ed["from"])
        after_of.setdefault(ed["from"], []).append(ed["to"])
    for c in courses.values():
        stats = [(k, c.get(f)) for k, f in [("Grades", "grades"), ("Credits", "credits"), ("UC/CSU a–g", "ucCsu"),
                                             ("Course #", "courseNumber")]]
        stats_html = "".join(f'<div><dt>{k}</dt><dd>{e(v)}</dd></div>' for k, v in stats if v)
        prereq = c.get("prerequisite")
        paras = [p for p in (c.get("description") or "").split("\n\n") if p.strip()]
        is_ap = c["name"].startswith("AP ")
        where = "" if c.get("offeredAtListed", True) else '<p class="note">This program is taught off campus at SVCTE, not at Wilcox.</p>'
        page_no = c.get("page") - 1 if isinstance(c.get("page"), int) else "?"
        src = f'<p class="c-src">From the {e(CATALOG_SOURCE)}, page {e(page_no)}.</p>'
        lead = (f'<p class="c-lead">{e(paras[0])}</p>' + (f'<details class="c-more"><summary>Read the rest of the catalog description</summary>'
                + "".join(f"<p>{e(p)}</p>" for p in paras[1:]) + '</details>' if len(paras) > 1 else '') + src
                if paras else '<p class="c-lead quiet">The course catalog has no description for this class.</p>')
        kicker = " · ".join([e(dept_name[c["department"]])] + (["AP"] if is_ap else []) + (["Honors"] if "Honors" in c["name"] else []))
        link = lambda s_: f'<a href="../{e(s_)}/">{e(pw_name.get(s_) or courses.get(s_, {}).get("name", s_))}</a>'
        bef, aft = sorted(set(before_of.get(c["slug"], []))), sorted(set(after_of.get(c["slug"], [])))
        path = (f'''<div class="c-path" aria-label="Where it fits">
    <p class="c-path-h">Where it fits</p>
    <ol class="c-path-row">
      <li class="cp-side">{"".join(f"<span>{link(x)}</span>" for x in bef) or '<span class="cp-none">Nothing required first</span>'}<small>Comes before</small></li>
      <li class="cp-now"><b>{e(c["name"])}</b></li>
      <li class="cp-side">{"".join(f"<span>{link(x)}</span>" for x in aft) or '<span class="cp-none">Not a prerequisite for another class</span>'}<small>Leads to</small></li>
    </ol>
    <p class="c-src">From the catalog’s prerequisites. <a href="../../subjects/#pw-fold">See every class’s path</a></p>
  </div>''' if bef or aft else "")
        page(f"courses/{c['slug']}/", c["name"], f"""
{crumbs([("All classes", "../../subjects/"), (dept_name[c['department']], f"../../subjects/{c['department']}/")], c["name"], f"courses/{c['slug']}/")}
<header class="c-hero">
  <p class="c-kicker">{kicker}</p>
  <h1>{e(c['name'])}</h1>
  {f'<p class="aka">Students call it <b>{e(c["call"])}</b></p>' if c.get("call") else ''}
  {f'<p class="aka">Wilcox also runs {" and ".join(f"<b>{e(n)}</b>" for n in c["sections"])} as a separate class under this course</p>' if c.get("sections") else ''}
  <div class="c-hero-grid">
    <div class="c-about" id="s-catalog">
      {lead}
      {f'<p class="c-prereq"><span>Prerequisite</span>{e(prereq)}</p>' if prereq else ''}
      {f'<p class="meta">{e(c["note"])}</p>' if c.get("note") else ''}
    </div>
    <dl class="c-facts">{stats_html}</dl>
  </div>
  {path}
</header>
{where}

<div class="c-layout">
<aside class="c-rail" aria-label="On this page">
  <nav class="c-toc" id="c-toc">
    <a href="#s-overview" data-sec="overview">What students say<span class="n"></span></a>
    <a href="#s-teachers" data-sec="teachers">Teachers<span class="n"></span></a>
    <a href="#s-resources" data-sec="resources">Study guides<span class="n"></span></a>
    <a href="#s-tips" data-sec="tips">Tips<span class="n"></span></a>
    <a href="#s-summer" data-sec="summer">Summer homework<span class="n"></span></a>
    <a href="#comments" data-sec="comments">Comments<span class="n"></span></a>
  </nav>
  <div class="c-progress" id="c-progress" hidden></div>
</aside>
<div class="c-main">
<section id="s-overview" class="c-sec">{sec_head("overview", "What students say")}<div id="overview" class="dyn"><div class="meta">Loading…</div></div></section>

<section id="s-teachers" class="c-sec">{sec_head("teachers", "Teachers", "Each teacher’s version of the class, written by their students.")}
  <div id="teachers" class="teachers dyn"></div>
</section>

<section id="s-resources" class="c-sec">{sec_head("resources", "Study guides &amp; resources")}<div id="resources" class="dyn"></div></section>
<section id="s-tips" class="c-sec">{sec_head("tips", "Tips from past students")}<div id="tips" class="dyn"></div></section>
<section id="s-summer" class="c-sec">{sec_head("summer", "Summer homework")}<div id="summer" class="dyn"></div></section>
<section id="s-todo" class="c-sec c-todo" hidden><h2>Help finish this page</h2><p class="sec-sub">Took this class? These parts aren’t written yet. Each one takes a few minutes, and a reviewer checks it before it goes up.</p><div id="todo" class="c-todo-grid"></div></section>

<section id="comments" class="c-sec">{sec_head("comments", "Comments", 'About the class, not the teacher as a person. New members’ comments appear after a reviewer approves them. <a href="../../rules/">Rules</a>')}
  <form id="comment-form" class="comment-form">
    <div id="replying" class="meta" hidden>Replying to a comment · <button type="button" class="linkish" id="cancel-reply">cancel</button></div>
    <label class="sr" for="comment-prompt">Topic</label><select id="comment-prompt"></select>
    <label class="sr" for="comment-body">Comment</label>
    <textarea id="comment-body" rows="3" maxlength="2000" placeholder="What was this class like?"></textarea>
    <button class="btn">Post</button>
  </form>
  <div id="comment-list"></div>
</section>
</div>
</div>
""", desc=f"{c['name']} at Wilcox High School: what students say about tests, grading and homework, plus study guides and tips."
          + (" Includes AP exam info." if is_ap else ""),
             active="subjects/", script="course.js",
             data={"slug": c["slug"], "name": c["name"], "teachers": c["teachers"],
                   "teacherSlugs": {t: slugify(t) for t in c["teachers"]}})


def build_teachers(teachers, courses):
    # Teacher pages (redesigned 2026-10-01, Ethan: "impressive"). Everything on them is official
    # or student-written: the staff directory gives the subjects and classes, the school's club and
    # sports list gives what they advise or coach, and pages.js adds what students wrote, their
    # room schedule, and "Today" (the schedule laid over today's bell schedule).
    acts = json.loads((DATA / "activities.json").read_text()) if (DATA / "activities.json").exists() else {"clubs": [], "sports": []}
    split = lambda v: [x.strip().lower() for x in re.split(r",|&|/|\band\b", v or "") if x.strip()]
    by_dept = {}
    for t in teachers:
        for d in t["departments"] or ["Other"]:
            by_dept.setdefault(d, []).append(t)
    groups = "".join(f"""<section class="tl-group"><p class="c-kicker">{e(d)}</p><ul>{''.join(f'<li data-hay="{e((x["name"] + " " + " ".join(courses[s_]["name"] for s_ in x["courses"])).lower())}"><a href="{e(x["slug"])}/"><b>{e(x["name"])}</b><span>{e(", ".join(courses[s_]["name"] for s_ in x["courses"][:3]))}{" +" + str(len(x["courses"]) - 3) if len(x["courses"]) > 3 else ""}</span></a></li>' for x in sorted(ts, key=lambda x: surname(x["name"])))}</ul></section>"""
                     for d, ts in sorted(by_dept.items()))
    page("teachers/", "Teachers", f"""
<div class="classes-page">
<header class="cl-head"><p class="c-kicker">Staff directory · {e(DIRECTORY_SOURCE.split(", ")[-1])}</p><h1>Teachers</h1>
  <p class="cl-lede"><b>{len(teachers)}</b> teachers, by subject. From the {e(DIRECTORY_SOURCE)}.</p></header>
<div class="cl-tools"><label class="cl-find">{ICONS["search"]}<span class="sr">Find a teacher</span><input id="tl-q" type="search" placeholder="Find a teacher or a class" autocomplete="off"></label></div>
<div class="tl-groups" id="tl-groups">{groups}</div>
<p class="cl-none" id="cl-none" hidden>No teacher matches.</p>
</div>""", active="subjects/", data={"page": "teachers"})
    for t in teachers:
        me = t["name"].lower()
        clubs = [c for c in acts.get("clubs", []) if me in split(c.get("advisor"))]
        teams = [x for x in acts.get("sports", []) if me in [c.lower() for c in x.get("coaches", [])]]
        parts = t["name"].replace(" Iii", "").split()
        mono = (parts[0][0] + (parts[-1][0] if len(parts) > 1 else "")).upper()
        cards = "".join(f'''<li class="tc-card" data-slug="{e(s_)}"><a href="../../courses/{e(s_)}/#s-teachers">
          <span class="tc-badges">{course_badges(courses[s_])}</span><b>{e(courses[s_]["name"])}</b>
          <span class="tc-meta">{e(grades(courses[s_]))}</span>
          <span class="tc-state" data-state>…</span></a></li>''' for s_ in t["courses"])
        stat = lambda n, l: f'<div><dt>{l}</dt><dd>{n}</dd></div>'
        act_html = "".join(f'<li><a href="../../clubs/#{e(slugify(c["name"]))}"><b>{e(c["name"])}</b><span>Club advisor{(" · meets " + e(c["meets"])) if c.get("meets") else ""}</span></a></li>' for c in clubs) + \
                   "".join(f'<li><a href="../../sports/#{e(slugify(x["name"]))}"><b>{e(x["name"])}</b><span>Coach{(" · " + e(x["season"])) if x.get("season") else ""}</span></a></li>' for x in teams)
        others = [r for r in t["raw"] if r]
        page(f"teachers/{t['slug']}/", t["name"], f"""
{crumbs([("Teachers", "../")], t["name"], f"teachers/{t['slug']}/")}
<header class="t-hero">
  <span class="t-mono" aria-hidden="true">{e(mono)}</span>
  <div class="t-id"><p class="c-kicker">Teacher · {e(" · ".join(t["departments"]))}</p><h1>{e(t['name'])}</h1>
    <p class="t-where" id="t-where"></p></div>
</header>
<dl class="t-stats">{stat(len(t["courses"]), "Classes" if len(t["courses"]) != 1 else "Class")}{stat(len(t["departments"]), "Subjects" if len(t["departments"]) != 1 else "Subject")}{stat(len(clubs) + len(teams), "Clubs &amp; teams") if clubs or teams else ""}<div><dt>Written by students</dt><dd id="t-written">…</dd></div></dl>
<div id="t-app" data-teacher="{e(t['name'])}" data-courses="{e(",".join(t["courses"]))}">
<section class="t-sec t-today" id="t-today" hidden></section>
<section class="t-sec"><h2>Classes</h2><p class="sec-sub">From the staff directory. Each one opens on this teacher’s version of the class.</p>
  {f'<ul class="tc-grid">{cards}</ul>' if cards else '<p class="empty-line">No classes matched in the catalog.</p>'}</section>
<section class="t-sec" id="t-sched-sec"><h2>Room and schedule</h2><div id="t-sched"><p class="meta">Loading…</p></div></section>
{f'<section class="t-sec"><h2>Clubs &amp; teams</h2><p class="sec-sub">From the Wilcox club and athletics lists.</p><ul class="t-acts">{act_html}</ul></section>' if act_html else ''}
<section class="t-sec" id="t-students" hidden><h2>From students</h2><div id="t-students-list"></div></section>
</div>
<p class="c-src t-foot">Listed in the {e(DIRECTORY_SOURCE)} as teaching {e(", ".join(others)) or "—"}.</p>
""", desc=f"{t['name']} at Wilcox High School: classes, room and schedule, and what students say about each class.", data={"page": "teacher"})


def build_static():
    page("bounties/", "Bounty board", """
<h1>Bounty board</h1>
<div id="gate" class="card gate" hidden>
  <h2 id="gate-text">Sign in to see the bounty board.</h2>
  <p>Bounties are jobs the admins post for the review team. Everyone can still help: add class info, tips or a study guide.</p>
  <p><a class="btn" href="../submit/">Contribute</a> <button type="button" class="btn ghost js-signin" id="gate-signin">Sign in</button></p>
</div>
<div id="members">
<div id="admin-bar" class="admin-bar" hidden><span class="meta">You’re an admin: you post, edit, complete and withdraw bounties. In the Orrery you can drag a bounty to another ring to re-rank it.</span><button type="button" class="btn" id="post-bounty">+ Post a bounty</button></div>
<p class="lede">Every bounty is one job that makes Wilkipedia better, with a clear finish line. Pick one that fits the time you have, claim it, do it, and a reviewer publishes it with your name on it.</p>
<div class="bb-top">
  <nav class="bb-views" role="tablist" aria-label="Views">
    <button type="button" role="tab" data-view="board" aria-selected="true" title="Every bounty as a card (key 1)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="4.2" width="7" height="15.6" rx="1.6"/><rect x="13.8" y="4.2" width="7" height="9.4" rx="1.6"/></svg><span>Board</span></button>
    <button type="button" role="tab" data-view="agenda" aria-selected="false" title="What is due, day by day (key 2)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 6.9V12l3.5 2.1"/></svg><span>Agenda</span></button>
    <button type="button" role="tab" data-view="ledger" aria-selected="false" title="Everything the team has finished (key 3)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 6.6h9.6M3.6 12h9.6M3.6 17.4h6.4"/><path d="M15.4 15.9l2.3 2.3 4.1-4.4"/></svg><span>Ledger</span></button>
    <button type="button" role="tab" data-view="orrery" aria-selected="false" title="The board as a solar system (key 4)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><ellipse cx="12" cy="12" rx="10.2" ry="4.3" transform="rotate(-24 12 12)"/></svg><span>Orrery</span></button>
  </nav>
  <label class="bb-search"><span class="sr-only">Search bounties</span><input id="bb-q" type="search" placeholder="Search bounties" autocomplete="off" data-slash><kbd>/</kbd></label>
</div>
<div class="bb-tools">
  <div class="chips" id="track-filter"></div>
  <div class="bb-row">
    <div class="chips" id="state-filter"><button type="button" class="chip" data-state="all" aria-pressed="true">Any status</button><button type="button" class="chip" data-state="open">Unclaimed</button><button type="button" class="chip" data-state="claimed">Claimed</button><button type="button" class="chip" data-state="mine">Mine</button></div>
    <label class="bb-fits">Time I have <select id="fits"><option value="any">Any</option><option value="30">30 min</option><option value="120">2 hours</option></select></label>
  </div>
  <p class="meta" id="count"></p>
</div>
<section id="view-board"></section>
<section id="view-agenda" hidden></section>
<section id="view-ledger" hidden></section>
<section id="view-orrery" hidden>
  <div class="orr-wrap" translate="no">
    <canvas class="orr-canvas" aria-label="The open bounties drawn as a solar system. The Board view lists the same bounties as text."></canvas>
    <div class="orr-bar">
      <span class="orr-fill"></span>
      <button type="button" class="orr-toggle" data-orr="out" aria-label="Zoom out">−</button>
      <button type="button" class="orr-toggle" data-orr="in" aria-label="Zoom in">+</button>
      <div class="orr-menu-wrap">
        <button type="button" class="orr-toggle" data-orr="menu" aria-expanded="false">Display ▾</button>
        <div class="orr-menu" hidden>
          <div class="om-row" data-t="motion"><span class="om-k hud-l">Motion</span><span class="om-sw"><i></i></span></div>
          <div class="om-row" data-t="labels"><span class="om-k hud-l">Labels</span><span class="om-sw"><i></i></span></div>
          <div class="om-row" data-t="belt"><span class="om-k hud-l">Completed belt</span><span class="om-sw"><i></i></span></div>
          <div class="om-row" data-t="photo" hidden><span class="om-k hud-l">Photo sky</span><span class="om-sw"><i></i></span></div>
          <div class="om-sep"></div>
          <div class="om-row om-static"><span class="om-k hud-l">Track links</span>
            <span class="om-seg"><button type="button" data-l="off" title="Draw no lines">Off</button><button type="button" data-l="linked" title="Point at a bounty to see the others in its track">Related</button><button type="button" data-l="all" title="Join every bounty in the same track">All</button></span></div>
        </div>
      </div>
      <button type="button" class="orr-toggle" data-orr="home">⟲ Reset</button>
    </div>
    <div class="orr-hint" id="orr-hint"></div>
    <div class="orr-credit" hidden>Sky: ESO/S. Brunier</div>
    <div class="orr-tip" hidden></div>
    <aside class="orr-detail" hidden></aside>
  </div>
  <dl class="orr-key">
    <div><dt>Ring</dt><dd>Rank. S is the innermost ring, D the outermost.</dd></div>
    <div><dt>Size</dt><dd>Effort. Bigger planets take longer.</dd></div>
    <div><dt>Ring around a planet</dt><dd>Someone has claimed it. Each moon is one person on it; yours is gold.</dd></div>
    <div><dt>Red trail</dt><dd>Overdue. A pulsing outline means due today.</dd></div>
    <div><dt>Rocks between B and C</dt><dd>Completed bounties.</dd></div>
    <div><dt>The sun</dt><dd>How many bounties are open.</dd></div>
  </dl>
</section>
<section class="how">
  <h2>How a bounty runs</h2>
  <ol>
    <li><b>Claim</b> it. Several people can claim the same bounty; reviewers merge the best parts. Claims expire after 14 days.</li>
    <li><b>Build</b> it with the form. Required fields must be filled.</li>
    <li><b>Submit.</b> It goes to the review queue, not straight onto the site.</li>
    <li><b>Review.</b> A reviewer approves it or sends it back with a note saying what to fix.</li>
    <li><b>Credit.</b> Approved work goes live with your name, and the points go on the leaderboard. When the job is fully done, an admin marks the bounty complete and it moves to the Ledger.</li>
  </ol>
  <p><b>Rank</b> is how urgent a bounty is: <b>S</b> critical · <b>A</b> high · <b>B</b> normal · <b>C</b> low · <b>D</b> whenever.</p>
  <p><b>Effort and points:</b> S (~30 min) = 10 · M (~2 hrs) = 30 · L (~5+ hrs) = 60 · anything outside a bounty = 5. After 3 approved submissions you become <b>Trusted</b>. If you signed in with your school account, your comments then post instantly.</p>
  <p><b>Keys:</b> 1 Board · 2 Agenda · 3 Ledger · 4 Orrery · / search.</p>
  <p>Have an idea for a bounty? Tell an admin.</p>
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
    <fieldset><legend>3 · The details</legend>
      <p class="draft-note" id="draft-note" hidden>✓ We restored your unsaved draft. <button type="button" class="linkish" id="discard-draft">Start over</button></p>
      <div id="fields"></div></fieldset>
    <p class="meta">Your writing is saved in this browser as you type, so you can switch tabs or come back later.</p>
    <label class="check"><input type="checkbox" id="rules-ok"> I didn’t include real test or quiz questions or answer keys, and nothing here is about a teacher as a person. <a href="../rules/" target="_blank">Rules</a></label>
    <p id="form-error" class="error" role="alert" hidden></p>
    <button class="btn big">Submit for review</button>
  </div>
</form>
<div id="done" class="done" hidden aria-live="polite"></div>
<article class="nb-card dark nb-contrib">
  <h2 id="h-cascade">How much of Wilcox is written</h2>
  <p class="nb-sub">One dot = one class · <span class="nb-gold">gold</span> = students have written about it · columns = subjects. Click a grey dot to see a class nobody has written up yet.</p>
  <svg id="cascade" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Classes per subject, with the ones students have written about highlighted"></svg>
</article>""", script="submit.js")

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

    page("dashboard/", "Dashboard", """
<h1>Dashboard</h1>
<p class="lede">Your updates, your work and your conversations with the review team, in one place.</p>
<div id="dash-app" class="inbox-app"><div class="meta">Loading…</div></div>""", script="dashboard.js")

    # The Inbox and the review desk became the Dashboard. Old addresses (including links
    # stored in notifications) forward there, keeping the part after # where it still means something.
    for old, js in (("inbox", "location.hash"), ("review", "({submissions: '#review', '': '#review'})[location.hash.slice(1)] ?? location.hash")):
        (ROOT / old).mkdir(exist_ok=True)
        (ROOT / old / "index.html").write_text('<!doctype html><meta charset="utf-8"><title>Moved to the Dashboard</title>'
            '<meta name="robots" content="noindex"><link rel="canonical" href="../dashboard/">'
            f'<script>location.replace("../dashboard/" + ({js}))</script>'
            '<noscript><meta http-equiv="refresh" content="0; url=../dashboard/"></noscript>'
            '<p>This page moved to your <a href="../dashboard/">Dashboard</a>.</p>\n')

    page("account/", "Your profile", """
<h1>Your profile</h1>
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
  <li><b>No shortcuts around the work.</b> No tips on getting credit without doing the work, like which assignments nobody checks or how to get around a teacher’s rules, even when they’re true. Tips on doing the work well are what we want: what to start early, what counts most, how to study.</li>
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

    page("terms/", "Terms of Service", """
<h1>Terms of Service</h1>
<p class="lede">The deal for using Wilkipedia, in plain words. You agree to it when you first sign in. Reading the site needs no account and no agreement.</p>
<nav class="terms-toc" aria-label="On this page"><a href="#who">Who we are</a><a href="#account">Your account</a><a href="#posting">What you post</a><a href="#yours">Who owns it</a><a href="#moderation">Reviewers</a><a href="#accuracy">Accuracy</a><a href="#changes">Changes</a></nav>

<h2 id="who">1. Who we are</h2>
<p>Wilkipedia is an independent student project started by Ethan Liu and Jonathan Lee. It is <b>not</b> run by Wilcox High School or Santa Clara Unified School District, and nothing here speaks for them.</p>

<h2 id="account">2. Your account</h2>
<ul>
  <li>You need to be at least 13 to make an account.</li>
  <li>You sign in with Google. One account per person. Don't share it or use anyone else's.</li>
  <li>Use your real first name or a name people know you by. Don't pretend to be someone else.</li>
  <li>You're responsible for what you post from your account.</li>
  <li>You can ask an admin to delete your account at any time. The <a href="../privacy/">Privacy page</a> says what happens to your data.</li>
</ul>

<h2 id="posting">3. What you post</h2>
<p>Everything you post follows the <a href="../rules/">Community rules</a>. In short:</p>
<ul>
  <li><b>No real tests, quizzes or answer keys</b>, and no helping anyone cheat or skip the work. Describing the test style is fine.</li>
  <li><b>About the class, not the person.</b> Nothing insulting, personal or private about any teacher or student. No teacher ratings.</li>
  <li><b>Only what's true.</b> Facts need a source, and opinions are labelled as student experience. If you don't know, leave it blank.</li>
  <li><b>Only what's yours to share.</b> Don't upload textbooks, teacher packets or anything else you didn't make. Link to it instead.</li>
  <li><b>No personal information</b> about anyone else: phone numbers, addresses, photos, schedules or accounts.</li>
  <li><b>No spam, ads or harmful links.</b> Don't try to break, overload or get around how the site works.</li>
</ul>
<p>Your school's own rules still apply to you. Following these Terms doesn't replace them.</p>

<h2 id="yours">4. Who owns what you post</h2>
<p>What you write is still yours. By posting it, you let Wilkipedia show it on the site, and let reviewers fix mistakes, formatting or wording, translate it, and combine it with what other students wrote. You also agree it can stay on the site after you leave. If your account is deleted, your pages stay up, credited to “Former student”, unless you ask us to remove them.</p>
<p>You promise you have the right to post it: you wrote it, or it's a fact anyone can share.</p>

<h2 id="moderation">5. Reviewers and moderation</h2>
<ul>
  <li>Reviewers check submissions before they're published, and can edit, hold, unpublish or delete anything that breaks these Terms or the Community rules.</li>
  <li>Breaking the rules, especially more than once, can mean losing the ability to post or losing your account.</li>
  <li>Leaderboard points and roles like Trusted or Reviewer are a thank-you, not a prize. They have no money value, and admins can correct or remove them.</li>
  <li>See something wrong? Use “Report outdated” or report a comment, or tell us through <a href="../feedback/">Feedback</a>.</li>
</ul>

<h2 id="accuracy">6. Accuracy and availability</h2>
<p>Wilkipedia is written by students and may be wrong or out of date. Always confirm grading, deadlines and policies with your teacher or counselor. Don't rely on Wilkipedia alone for decisions like which classes to take. The official site is <a href="https://wilcox.santaclarausd.org/" target="_blank" rel="noopener">wilcox.santaclarausd.org ↗</a>.</p>
<p>We run Wilkipedia for free and as well as we can, but we can't promise it will always be online or that nothing will ever be lost. Keep your own copy of anything important.</p>

<h2 id="privacy">7. Privacy and cookies</h2>
<p>How we handle your name and email is on the <a href="../privacy/">Privacy page</a>. What your browser saves, and how to turn it off, is in <a href="../settings/#cookies">Cookie settings</a>. There are no ads and no tracking.</p>

<h2 id="changes">8. Changes to these Terms</h2>
<p>If we change these Terms in a way that matters, you'll be asked to agree again the next time you visit while signed in. Until you do, you can still read everything, but you can't post.</p>
<p class="meta">Version 1 · September 2026</p>""", data={"page": "static"},
         desc="The Terms of Service for Wilkipedia, the student-built guide to Wilcox High School, in plain words.")

    page("privacy/", "Privacy", """
<h1>Privacy</h1>
<p class="lede">Short version: reading needs no account. If you sign in, we store only what's needed to credit your work, and we never sell or share it.</p>
<h2>Reading</h2>
<p>You can read every page without signing in. We don't use ads, analytics or tracking cookies.</p>
<h2>Cookies and saved settings</h2>
<p>Wilkipedia has no ads, no analytics and no tracking cookies. Your browser keeps a few things so the site works the way you left it:</p>
<ul>
  <li><b>Always:</b> your sign-in token (only if you sign in) and your cookie choices.</li>
  <li><b>Your settings:</b> night mode, text size, class colour, closed announcements, the 3D campus view and the like.</li>
  <li><b>Recent classes and drafts:</b> classes you opened recently, and forms or comments you started but haven't sent.</li>
</ul>
<p>All of it stays in your browser and is never sent to us. You can switch the last two off, see exactly what's saved, or delete it all in <a href="../settings/#cookies">Cookie settings</a>.</p>
<h2>Signing in</h2>
<p>Signing in means agreeing to the <a href="../terms/">Terms of Service</a>. Sign-in uses Google. When you sign in, Google tells us your name and email address. We store them in our database (hosted by Supabase) so that your claims, submissions and comments belong to you.</p>
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
<p>Conversations in your Dashboard (about something you sent in: a post, feedback or a report) are private between you and the review team. Every reviewer and admin can read them, so the team can answer together and keep them safe. There are no private messages between students.</p>
<h2>Deleting your data</h2>
<p>Ask a Wilkipedia admin to delete your account. We'll remove your account and your email address. Pages you helped write stay on the site, credited to "Former student". If you'd rather your submissions and comments be removed too, say so and we'll delete them.</p>
<p>School accounts are usually closed after graduation. Your work stays on Wilkipedia afterwards.</p>
<h2>Who runs this</h2>
<p>Wilkipedia is an independent project run by Wilcox High School students. It is not operated by Wilcox High School or Santa Clara Unified School District.</p>
<p class="meta">Last updated September 2026.</p>""", data={"page": "static"})

    # The campus map (redesigned 2026-10-01 with the class pages): the map is the page. A slim head,
    # then the map with a floating dock (find a room, a teacher or a class; jump to a building),
    # floating zoom and a small key; the room panel slides in on the right. map.js draws it all.
    page("map/", "Campus map", f"""
<header class="mp-top">
  <div><p class="c-kicker">Wilcox High School · campus</p><h1>Campus map</h1></div>
  <p class="mp-top-r">Tap a room to see who teaches there, what and when. <a href="../campus/">Walk it in 3D →</a></p>
</header>
<div class="map-app" id="map-app">
  <div class="map-stage" id="map-stage">
    <svg id="map-svg" role="group" aria-label="Wilcox High School campus map"><g id="plan" aria-hidden="true"></g><g id="hotspots"></g><g id="map-labels" aria-hidden="true"></g></svg>
    <div class="map-dock">
      <form id="room-find" class="mp-find" role="search" autocomplete="off">{ICONS["search"]}<label class="sr" for="room-q">Find a room, a teacher or a class</label>
        <input id="room-q" type="search" placeholder="Find a room, teacher or class" role="combobox" aria-expanded="false" aria-controls="map-results" aria-autocomplete="list" autocomplete="off"></form>
      <ul class="mp-results" id="map-results" role="listbox" hidden></ul>
      <div class="mp-bldgs" id="map-bldgs" role="group" aria-label="Jump to a building"></div>
    </div>
    <div class="map-zoom" role="group" aria-label="Zoom"><button type="button" id="z-in" aria-label="Zoom in">+</button><button type="button" id="z-out" aria-label="Zoom out">−</button><button type="button" id="z-reset" class="wide">Whole campus</button></div>
    <p class="map-key" aria-hidden="true"><i class="k-has"></i>Has info<i class="k-room"></i>Tap any room</p>
    <aside class="map-panel" id="map-panel" aria-live="polite" hidden></aside>
    <div class="map-hint" id="map-hint">Drag to move · scroll or pinch to zoom</div>
  </div>
  <p class="meta credit" id="map-credit"></p>
</div>
<section class="mp-index"><header class="cl-dh"><h2>Rooms with info</h2><span class="cl-dn" id="room-n"></span><a class="cl-dlink" href="../submit/?kind=room_schedule">Add a room schedule →</a></header>
  <p class="sec-sub">From the room schedules and teacher sections students add. Each school year gets its own schedule, and past years stay viewable.</p>
  <div id="room-list"><div class="meta">Loading…</div></div>
</section>""", active="map/", script="map.js", data={"page": "map"},
         desc="Interactive map of Wilcox High School: tap a classroom to see who teaches there, what they teach and when.")

    page("menu/", "Cafeteria menu", """
<h1>Cafeteria menu</h1>
<p class="lede">Breakfast and lunch at Wilcox, with photos, nutrition and allergens, straight from the district’s menu.</p>
<div id="menu-app">
  <p class="mn-src"><a class="official-link" href="https://www.schoolnutritionandfitness.com/webmenus2/#/view?id=6a7f7a63fe03f3701a08feef&amp;siteCode=2714" target="_blank" rel="noopener">View the original on the district’s menu site ↗</a></p>
  <div class="menu-bar">
    <div class="seg" id="menu-which" role="radiogroup" aria-label="Meal">
      <button type="button" role="radio" data-which="breakfast">Breakfast</button>
      <button type="button" role="radio" data-which="lunch">Lunch</button>
    </div>
    <div class="week-nav"><button type="button" class="week-btn" id="prev-week" aria-label="Previous week">‹</button>
      <b id="week-label" translate="no"></b><button type="button" class="week-btn" id="next-week" aria-label="Next week">›</button>
      <button type="button" class="chip" id="this-week">This week</button></div>
  </div>
  <div id="mn-week" class="mn-week" role="tablist" aria-label="Day"></div>
  <div id="mn-filters" class="mn-filters" role="group" aria-label="Filter dishes"></div>
  <p id="mn-fnote" class="mn-fnote" aria-live="polite"></p>
  <div id="mn-view" class="mn-view" role="tabpanel"></div>
  <p class="meta mn-foot">Tap or click any dish for its nutrition and allergens. Menus can change. <b>V</b> vegetarian · <b>VG</b> vegan ·
    <b>GF</b> gluten-free, as the district marks them. Allergen marks are the district’s: if you have a food allergy, check with
    the cafeteria staff. Menu, photos and nutrition: Santa Clara Unified Nutrition Services ·
    <a id="official" class="official-link" href="https://www.schoolnutritionandfitness.com/webmenus2/#/view?id=6a7f7a63fe03f3701a08feef&amp;siteCode=2714" target="_blank" rel="noopener">official menu ↗</a></p>
</div>""", active="menu/", script="menu.js", data={"page": "menu"},
         desc="This week’s breakfast and lunch at Wilcox High School, with photos, nutrition and allergens for each dish.")

    page("clubs/", "Clubs", """
<h1>Clubs</h1>
<p class="lede">Every club at Wilcox: what it does, when it meets, and how to join.</p>
<div id="act-viz" class="cf"></div>
<div class="list-tools"><input id="act-q" type="search" placeholder="Search clubs" aria-label="Search clubs"><div class="chips" id="act-filter"></div></div>
<div class="chips act-days" id="act-days"></div>
<div id="act-list"><div class="meta">Loading…</div></div>
<p class="meta" id="act-source"></p>
<p><a class="btn ghost" href="../submit/?kind=club">Add info about a club</a></p>""", active="clubs/", data={"page": "clubs"},
         desc="Clubs at Wilcox High School: what they do, when they meet, and how to join.")

    page("sports/", "Sports", """
<h1>Sports</h1>
<p class="lede">Wilcox Chargers teams by season: tryouts, practice, and what it’s like to play.</p>
<div class="list-tools"><input id="act-q" type="search" placeholder="Search teams" aria-label="Search teams"><div class="chips" id="act-filter"></div></div>
<p class="meta sp-key">Levels: <b>V</b> varsity · <b>JV</b> junior varsity · <b>FS</b> frosh-soph · <b>F</b> frosh. Tap a team for its coaches and what students say.</p>
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
<div id="fb-done" class="done" hidden aria-live="polite"></div>""", data={"page": "feedback"},
         desc="Send the Wilkipedia team an idea, a bug report or a feature request.")

    page("bell/", "Bell schedule", """
<h1>Bell schedule</h1>
<p class="lede">When every period starts and ends at Wilcox, 2026–27.</p>
<section id="bell" class="bell bell-page" aria-label="Today"><div class="meta">Loading today…</div></section>
<div id="bell-full" class="bell-full-page"><div class="meta">Loading…</div></div>""", active="bell/", data={"page": "bell"},
         desc="Wilcox High School bell schedule: period times for Monday, block days, finals and special days.")

    # "By the numbers" was retired (its a–g chart moved to All classes, its coverage
    # chart to Contribute); the old address forwards to the a–g chart.
    (ROOT / "numbers").mkdir(exist_ok=True)
    (ROOT / "numbers" / "index.html").write_text('<!doctype html><meta charset="utf-8"><title>Moved</title>'
        '<meta http-equiv="refresh" content="0; url=../subjects/#ag"><link rel="canonical" href="../subjects/">'
        '<p>This page moved to <a href="../subjects/#ag">All classes</a>.</p>\n')

    page("guides/", "Study guides", f"""
<h1>Study guides</h1>
<p class="lede">Every study guide and resource students have shared, as a graph. The big dots are subjects, each class hangs off its subject, and each guide hangs off every class it’s for.</p>
<div class="gv" id="gv-graph" translate="no">
  <div class="gv-bar">
    <label class="gv-search"><span class="sr-only">Filter the graph</span><input id="gv-q" type="search" placeholder="Search files…" autocomplete="off"></label>
    <span class="gv-count" id="gv-count"></span>
    <button type="button" class="gv-gear" id="gv-gear" aria-expanded="false" aria-label="Graph settings" title="Graph settings">{ICONS["settings"]}</button>
  </div>
  <div id="gv-chart" class="gv-chart" role="img" aria-label="Graph of subjects, classes and study guides. The list below has every guide."></div>
  <div class="gv-panel" id="gv-panel" hidden></div>
  <aside class="gv-info" id="gv-info" hidden></aside>
  <div class="gv-foot">
    <p class="gv-hint">Scroll to zoom · drag to move · drag a dot and the rest follows · click for details · double-click to open</p>
    <div class="gv-legend" id="gv-legend" role="group" aria-label="What the dots are. Click a kind of resource to hide or show it."></div>
  </div>
</div>
<section class="entry-sec"><h2>All study guides</h2><p class="sec-sub">The same guides as a list, by subject and class.</p><div id="gv-list"><div class="meta">Loading…</div></div>
  <p><a class="add-link" href="../submit/?kind=resource">Share a study guide →</a></p></section>""", active="guides/", script="guides.js",
         desc="Every study guide Wilcox students have shared, shown as a connected graph by class and topic.")

    page("settings/", "Settings", """
<header class="set-head">
  <p class="set-kicker">Preferences</p>
  <h1>Settings</h1>
  <p class="lede">Make Wilkipedia work the way you like. Everything here is saved in this browser, so set it once on each device you use.</p>
</header>
<div class="set-layout">
  <nav class="set-toc" aria-label="Settings sections" id="set-toc"></nav>
  <div id="settings" class="settings"><div class="meta">Loading…</div></div>
</div>""", data={"page": "settings"},
         desc="Theme, text size, motion, language and other Wilkipedia settings.")

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
  <li>Orrery sky: Milky Way panorama, <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener">ESO/S. Brunier ↗</a></li>
</ul></section>""", data={"page": "credits"}, desc="Everyone who helped build Wilkipedia: founders, reviewers, contributors and people who sent ideas.")

    page("404.html", "Page not found", """
<h1>Page not found</h1><p>Try <a href="./search/">searching</a> or <a href="./subjects/">browse all classes</a>.</p>""", data={"page": "static"})


def build_data(depts, courses, teachers):
    slim = [{k: c.get(k) for k in ("slug", "name", "department", "grades", "ucCsu", "teachers", "call", "also", "shared", "sections") if c.get(k) is not None}
            for c in courses.values()]
    (DATA / "courses.json").write_text(json.dumps(
        {"departments": [{"slug": d["slug"], "name": short_dept(d["name"])} for d in depts], "courses": slim},
        ensure_ascii=False, separators=(",", ":")))
    # Prerequisite links for the home page's pathways map (tools/pathways.py)
    (DATA / "pathways.json").write_text(json.dumps(pathways.build(list(courses.values())), ensure_ascii=False, separators=(",", ":")))
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
    ("Calendar", "calendar/", "Important dates, 2026–27", "calendar dates events breaks holidays no school finals exams psat sat ap caaspp homecoming prom graduation rally dance concert winter spring break first day last day"),
    ("Campus map", "map/", "Find a classroom", "map rooms where building find classroom directions"),
    ("3D campus", "campus/", "Walk the school in 3D", "3d campus walk tour virtual quad cedar building gym stadium three.js anime"),
    ("Study guides", "guides/", "Every shared study guide, as a graph", "study guides guide notes resources graph obsidian review"),
    ("Settings", "settings/", "Theme, text size, language", "settings preferences dark mode night mode theme text size font bigger language motion cookies cookie storage"),
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
    ("Your profile", "account/", "Name, picture, class year, sign out", "account profile avatar picture name class year leaderboard sign out"),
    ("Dashboard", "dashboard/", "Notifications, your work, conversations, reviewing", "dashboard inbox notifications messages my work posts submissions status review reviewer reply conversation"),
    ("Community rules", "rules/", "What you can post", "rules guidelines"),
    ("Privacy", "privacy/", "What we store", "privacy data delete account cookies tracking"),
    ("Terms of Service", "terms/", "The deal for using Wilkipedia", "terms of service tos agreement conditions legal sign up rules"),
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
                    "k": " ".join([c.get("call") or "", " ".join(c.get("also") or []), " ".join(c.get("sections") or []), dept[c["department"]], " ".join(c["teachers"]), c.get("courseNumber") or "",
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
    urls = ["", "subjects/", "bounties/", "summer/", "school/", "teachers/", "about/", "rules/", "terms/", "privacy/", "map/", "campus/", "calendar/"]
    urls += [f"subjects/{d['slug']}/" for d in depts] + [f"courses/{s}/" for s in courses] + [f"teachers/{t['slug']}/" for t in teachers]
    (ROOT / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{e(base + '/' + u)}</loc></url>\n" for u in urls) + "</urlset>\n")
    (ROOT / "robots.txt").write_text(f"User-agent: *\nDisallow: /review/\nDisallow: /account/\nDisallow: /inbox/\nDisallow: /dashboard/\nDisallow: /submit/\nSitemap: {base}/sitemap.xml\n")


CAMPUS = ROOT / "campus"


def build_campus():
    """campus/ is a hand-written three.js app (campus/js, campus/vendor). Only its
    index.html is generated, so every module URL carries ?v=<hash> like the rest
    of the site and a deploy never mixes old and new files."""
    if not (CAMPUS / "js" / "main.js").exists():
        return
    mods = {f"./js/{f.name}": f"./js/{f.name}?v={_version(f)}" for f in sorted((CAMPUS / "js").glob("*.js"))}
    mods["three"] = f"./vendor/three.module.min.js?v={_version(CAMPUS / 'vendor' / 'three.module.min.js')}"
    css = _version(CAMPUS / "campus.css")
    canon = f'<link rel="canonical" href="{e(SITE_URL.rstrip("/") + "/campus/")}">' if SITE_URL else ""
    (CAMPUS / "index.html").write_text("""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Wilcox campus in 3D · Wilkipedia</title>
<meta name="description" content="Walk around Wilcox High School in 3D, drawn like an anime: the quad and its cedar, Building B, Building R, the gyms, the stadium. Every room links to its Wilkipedia page.">
<meta property="og:title" content="Wilcox campus in 3D · Wilkipedia">
<meta property="og:site_name" content="Wilkipedia">
""" + canon + """
<link rel="icon" href="../assets/icon.svg" type="image/svg+xml">
""" + STORAGE_GATE + """
<link rel="preload" href="../assets/fonts/Newsreader.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="campus.css?v=""" + css + """">
<script type="importmap">""" + json.dumps({"imports": mods}) + """</script>
</head>
<body data-root="../" data-mode="walk">
<canvas id="view" tabindex="0" aria-label="3D view of the Wilcox campus"></canvas>

<div id="loader" role="status">
  <div class="load-in">
    <p class="kicker">WILKIPEDIA · 3D CAMPUS</p>
    <h1>Wilcox, drawn by hand</h1>
    <p>The whole school to walk around: the quad and its cedar, Building B, Building R, the gyms and the stadium. Every room on the official map is labelled.</p>
    <div class="track"><div id="load-bar"></div></div>
    <div id="load-msg">Starting…</div>
  </div>
</div>

<header class="bar">
  <a class="back" href="../" aria-label="Back to Wilkipedia">←<span class="long">&nbsp;Wilkipedia</span></a>
  <div class="title"><span class="w">W</span>Wilcox campus</div>
  <div class="tools">
    <button type="button" id="btn-fly" class="primary"><span>Fly up</span></button>
    <button type="button" id="btn-map"><span>Map</span> <kbd>M</kbd></button>
    <button type="button" id="btn-view" aria-haspopup="true" aria-expanded="false" title="Style, time, weather, quality">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg><span>View</span></button>
    <button type="button" id="btn-help" aria-label="Controls">?</button>
    <div id="vmenu" role="dialog" aria-label="View settings" hidden>
      <div class="vrow"><span class="vk">Style <kbd>P</kbd></span><div class="seg" data-set="style"><button type="button" data-v="diorama">Diorama</button><button type="button" data-v="pixel">Pixel</button></div></div>
      <div class="vrow"><span class="vk">Time <kbd>N</kbd></span><div class="seg" data-set="time"><button type="button" data-v="day">Day</button><button type="button" data-v="night">Night</button></div></div>
      <div class="vrow"><span class="vk">Weather <kbd>R</kbd></span><div class="seg" data-set="rain"><button type="button" data-v="clear">Clear</button><button type="button" data-v="rain">Rain</button></div></div>
      <div class="vrow"><span class="vk">Sound</span><div class="seg" data-set="sfx"><button type="button" data-v="off">Off</button><button type="button" data-v="on" title="Rain and the sounds around you">On</button></div></div>
      <div class="vrow"><span class="vk">Music</span><div class="seg" data-set="music"><button type="button" data-v="off">Off</button><button type="button" data-v="on" title="Soft piano, made in the browser">On</button></div></div>
      <div class="vrow"><span class="vk">Quality</span><div class="seg" data-set="q"><button type="button" data-q="high" title="Outlines, soft shadows, bloom">High</button><button type="button" data-q="medium" title="Outlines and shadows">Medium</button><button type="button" data-q="low" title="No outlines or shadows: for older phones">Low</button></div></div>
      <div class="vrow go"><span class="vk">Go to</span><div class="vgo" id="vgo"></div></div>
    </div>
  </div>
</header>

<div id="minimap" title="Open the map (M)"><canvas></canvas><span class="n">N</span></div>
<div id="crosshair"></div>
<div id="place" aria-live="polite"></div>
<div id="keys" aria-label="Keyboard controls"></div>
<a id="credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Streets and houses © OpenStreetMap contributors</a>
<div id="tip" hidden></div>
<div id="toast" role="status"></div>
<aside id="room-card" hidden aria-live="polite"></aside>

<div id="bigmap" hidden>
  <div class="sheet">
    <button type="button" class="x" aria-label="Close">×</button>
    <h2>Campus map</h2>
    <p class="meta">Click anywhere to go there, or type a room number.</p>
    <form id="room-form"><input id="room-q" placeholder="Room, e.g. B107" aria-label="Room number" autocomplete="off"><button>Go</button></form>
    <canvas></canvas>
  </div>
</div>

<div id="help" hidden>
  <div class="sheet">
    <button type="button" class="x" aria-label="Close">×</button>
    <h2>Getting around</h2>
    <dl>
      <dt><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></dt><dd>Walk (arrow keys work too). Hold <kbd>Shift</kbd> to run.</dd>
      <dt>Mouse</dt><dd>Click the view, then move the mouse to look. <kbd>Esc</kbd> gives the cursor back.</dd>
      <dt><kbd>Space</kbd></dt><dd>Jump.</dd>
      <dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>Jump to a viewpoint: the quad, the front, Building B, the gym, the stadium, the creek.</dd>
      <dt><kbd>P</kbd></dt><dd>Switch style: the soft peach diorama, or pixel art.</dd>
      <dt><kbd>N</kbd> <kbd>R</kbd></dt><dd>Day or night, rain or dry.</dd>
      <dt><kbd>H</kbd></dt><dd>Hide everything but the view (for screenshots).</dd>
      <dt><kbd>F</kbd></dt><dd>Fly up for the aerial view, and back down. Up there: drag to turn, right-drag to slide, scroll to zoom, double-click the ground to land.</dd>
      <dt><kbd>M</kbd></dt><dd>The map: click anywhere to jump there, or type a room number.</dd>
      <dt>Room plates</dt><dd>Point at a room number on a wall and click (or press <kbd>E</kbd>) to open that room on Wilkipedia.</dd>
      <dt>On a phone</dt><dd>Left thumb walks, right thumb looks. Double-tap the ground from the air to land.</dd>
    </dl>
    <p class="meta">Built from the official campus map and satellite measurements. The streets, houses and creek around the school come from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> (© OpenStreetMap contributors, ODbL). Room interiors come building by building.</p>
  </div>
</div>

<noscript><p style="position:fixed;inset:0;display:grid;place-items:center;background:#faf8f2;font:18px Georgia,serif;margin:0">The 3D campus needs JavaScript. The <a href="../map/">campus map</a> works without it.</p></noscript>
<script type="module" src=\"""" + mods["./js/main.js"] + """\"></script>
</body>
</html>
""")


# ─────────────────────────── calendar ───────────────────────────

def ics_text(s):
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def build_calendar():
    """The Calendar page: data/calendar.json (from the school's official
    activities calendar, via tools/school_calendar.py), shown as a month view by
    assets/js/calendar.js, with the whole list in the HTML (works without JS)
    and a .ics file for adding it all to a phone or Google Calendar."""
    from datetime import date, timedelta
    cal = json.loads((DATA / "calendar.json").read_text())
    extra = json.loads((DATA / "calendar-extra.json").read_text())      # other groups' own calendars
    labels, sources = cal["labels"], extra["sources"]
    events = sorted(cal["events"] + extra["events"], key=lambda ev: (ev["start"], ev["cat"] != "off"))
    months, cur = [], None
    for ev in events:
        d0 = date.fromisoformat(ev["start"])
        key = d0.strftime("%B %Y")
        if key != cur:
            months.append((key, []))
            cur = key
        d1 = date.fromisoformat(ev["end"])
        when = d0.strftime("%a %b ") + str(d0.day) + (f" – {d1.strftime('%a %b ')}{d1.day}" if d1 != d0 else "")
        detail = " · ".join(x for x in (ev["time"], ev["where"]) if x)
        src = sources.get(ev.get("src", ""))
        badge = f' <span class="cal-src-tag">{e(src["label"])}</span>' if src else ""
        months[-1][1].append(f'<li class="cal-row c-{e(ev["cat"])}"><span class="cal-when">{e(when)}</span>'
                             f'<span class="cal-what">{e(ev["title"])}{badge}{f"<small>{e(detail)}</small>" if detail else ""}</span></li>')
    listing = "".join(f'<section class="cal-month-list"><h2>{e(m)}</h2><ul class="cal-rows">{"".join(rows)}</ul></section>'
                      for m, rows in months)
    ics_name = "wilcox-" + cal["year"].replace("–", "-") + ".ics"
    page("calendar/", "Calendar", f"""
<h1>Calendar</h1>
<p class="lede">Important dates for the {e(cal["year"])} school year: breaks and no-school days, finals and testing, rallies, dances, shows and family nights.</p>
<p class="cal-src meta">From Wilcox’s <a href="{e(cal["source"])}" target="_blank" rel="noopener">official activities calendar</a>, linked from the <a href="{e(cal["sourcePage"])}" target="_blank" rel="noopener">bell schedule page</a>. Events tagged with a group (like “Class of 2027”) are from that group’s own posts. Dates can change: the school’s calendar is the final word.
  <a class="btn ghost small cal-ics" href="{ics_name}" download="{ics_name}">Add to my calendar (.ics)</a></p>
<div id="cal-app" class="cal-app"></div>
<div id="cal-list">{listing}</div>""", active="calendar/", script="calendar.js", data={"page": "calendar"},
         desc=f"Wilcox High School calendar {cal['year']}: no-school days, breaks, finals, PSAT/SAT/AP testing, rallies, dances, concerts and family nights.")
    # the .ics: all-day events (the sheet's times are free text), times and places in the notes
    stamp = "20260101T000000Z"
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wilkipedia//Wilcox calendar//EN", "CALSCALE:GREGORIAN",
             f"X-WR-CALNAME:Wilcox {cal['year']} (Wilkipedia)"]
    for i, ev in enumerate(events):
        d0 = date.fromisoformat(ev["start"]); d1 = date.fromisoformat(ev["end"]) + timedelta(days=1)
        src = sources.get(ev.get("src", ""), {}).get("from", "Wilcox’s official activities calendar")
        note = " · ".join(x for x in (ev["time"], ev["where"], labels.get(ev["cat"], ""), src) if x)
        lines += ["BEGIN:VEVENT", f"UID:{ev['id']}@wilcoxwiki.org", f"DTSTAMP:{stamp}",
                  f"DTSTART;VALUE=DATE:{d0.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{d1.strftime('%Y%m%d')}",
                  f"SUMMARY:{ics_text(ev['title'])}", f"DESCRIPTION:{ics_text(note)}",
                  "END:VEVENT"]
    lines.append("END:VCALENDAR")
    (ROOT / "calendar" / ics_name).write_text("\r\n".join(lines) + "\r\n")


def main():
    for css in (ROOT / "assets" / "style.css", CAMPUS / "campus.css"):
        check_css(css)                          # before anything is deleted
    for d in GENERATED_DIRS:
        shutil.rmtree(ROOT / d, ignore_errors=True)
    depts, courses, teachers = load()
    build_data(depts, courses, teachers)       # first, so its output is in the data hash
    VERSIONS.update(asset_versions())
    build_home(depts, courses, teachers)
    build_subjects(depts)
    build_courses(depts, courses)
    build_teachers(teachers, courses)
    build_static()
    build_seo(courses, teachers, depts)
    build_campus()
    build_calendar()
    linked = sum(1 for c in courses.values() if c["teachers"])
    print(f"Built {len(courses)} course pages ({linked} with teachers), {len(teachers)} teacher pages, {len(depts)} subjects.")


if __name__ == "__main__":
    main()
