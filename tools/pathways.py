"""Prerequisite links between classes, read from the catalog's own wording.

The home page's pathways map draws these, and every class in the catalog: one
the catalog links to no other class (all of English, for one: its prerequisites
say things like "a C or better", never a class) is a station with no lines. Every link must be traceable to a
class name (or the catalog's shorthand for one) inside a course's
"prerequisite" text; nothing is inferred. Each link keeps that sentence, and
the map shows it word for word.

Mentions that aren't a Wilcox class ("Marine Biology", "Math 8") or are
ambiguous ("Drawing and Painting") are consumed without producing a link.
To add a link, add the catalog's phrasing to ALIASES, never a guess.
"""

import re

# The catalog's shorthand → the class it means. ORDER MATTERS: a specific
# phrasing ("Honors Chemistry") must come before the general one ("Chemistry").
# Checked against the 2025–26
# catalog text. None = recognised, but not a single Wilcox class: no link.
ALIASES = {
    r"H\. Algebra (?:2|II) with Pre-?Calculus/Trig": "honors-algebra-2-with-precalculus-and-trigonometry",
    r"Algebra II Honors": "honors-algebra-2-with-precalculus-and-trigonometry",
    r"PreCalculus and Trig\b": "precalculus-and-trigonometry",
    r"\bTrigonometry\b": "precalculus-and-trigonometry",
    r"Algebra (?:2|II)\b": "algebra-2",
    r"Algebra 1\b": "algebra-1",
    r"\bGeometry\b": "geometry",
    r"AP Calculus AB": "ap-calculus-ab",
    r"Data Science": "data-science",
    r"Honors Chemistry": "honors-chemistry-in-the-earth-system",
    r"Marine Biology": None,
    r"\bBiology\b": "biology-of-the-living-earth",
    r"\bChemistry\b": "chemistry-in-the-earth-system",
    r"AP Physics 1": "ap-physics-1",
    r"Physical Education Core 9": "physical-education-core-9",
    r"Intro(?:duction)? to Art": "introduction-to-art",
    r"Ceramics 1": "ceramics-1",
    r"\bCeramics\b": "ceramics-1",
    r"\bSculpture\b": "sculpture",
    r"Painting 1": "painting-1",
    r"Drawing and Painting": None,
    r"Small Engines": "small-engines",
    r"Preventative Maintenance": "rop-preventative-maintenance",
    r"Engine Systems": "rop-engine-systems",
    r"C\.H\.A\.M\.P\. 1": "rop-c-h-a-m-p-1",
    r"Principles of Financial Literacy": "principles-of-financial-literacy",
    r"Fashion Design & Marketing I and II": ["fashion-design-and-marketing-i", "fashion-design-and-marketing-ii"],
    r"Fashion Design & Marketing I\b": "fashion-design-and-marketing-i",
    r"Digital Media 1": "digital-media-1",
    r"Exploring Computer Science": "exploring-computer-science",
    r"Computer Science Principles": "ap-computer-science-principles",
    r"ROP Video Production": "rop-video-production",
    r"Math 8": None,
    r"Spanish ([123])": lambda m: f"spanish-{m.group(1)}",
    r"AP Language": "ap-spanish-language-and-culture",
}

# The order Wilcox students take English in. The catalog names no class as a
# prerequisite for any English class, so this comes from Ethan (Wilkipedia's
# founder, a Wilcox student), September 2026: each year you can take any English
# class offered for that year, whatever you took the year before (Honors 9, then
# regular 10, British Literature in 11, ERWC in 12). So every class of one year
# links to every class of the next. The map draws these in gold as the order
# students take them in, never as a catalog prerequisite. The EL order follows the
# catalog's beginning / intermediate / advanced descriptions. Correct them only
# from Ethan.
ENGLISH_YEARS = [
    ["english-9", "honors-english-9"],
    ["english-10", "honors-english-10"],
    ["english-11", "ap-english-language-and-composition", "honors-british-literature"],
    ["ap-english-literature-and-composition", "csu-expository-reading-and-writing"],
]
SEQUENCES = [(a, b) for this, nxt in zip(ENGLISH_YEARS, ENGLISH_YEARS[1:]) for a in this for b in nxt] + [
    ("el-beginning", "el-intermediate"), ("el-beginning-grammar-vocabulary-reading", "el-intermediate"),
    ("el-intermediate", "el-advanced"),
]
# Left off the map (Ethan): the PRT classes and the BSC English classes
HIDDEN = lambda c: c["name"].startswith("PRT ") or c["name"].startswith("BSC English")

# "Completion of Level 2" in a language course means level 2 of that language
LEVEL = re.compile(r"Level ([1-4])")


def build(catalog_courses):
    catalog_courses = [c for c in catalog_courses if not HIDDEN(c)]
    slugs = {c["slug"] for c in catalog_courses}
    edges, seen = [], set()
    patterns = list(ALIASES.items())       # in order: specific phrasings come before general ones
    for c in catalog_courses:
        text = (c.get("prerequisite") or "").strip()
        if not text:
            continue
        rest, found = text, []
        for pat, target in patterns:
            for m in list(re.finditer(pat, rest, flags=re.I)):
                t = target(m) if callable(target) else target
                for s in (t if isinstance(t, list) else [t]):
                    if s:
                        found.append(s)
            rest = re.sub(pat, " ", rest, flags=re.I)                     # a phrase counts once
        lang = re.match(r"(japanese|spanish)-\d", c["slug"]) or (
            re.match(r"ap-(japanese|spanish)-", c["slug"]))
        if lang:
            for m in LEVEL.finditer(rest):
                found.append(f"{lang.group(1)}-{m.group(1)}")
        for src in found:
            if src == c["slug"]:
                continue
            if src not in slugs:
                raise SystemExit(f"pathways.py: {src!r} (from {c['name']}) is not a catalog slug")
            if (src, c["slug"]) in seen:
                continue
            seen.add((src, c["slug"]))
            edges.append({"from": src, "to": c["slug"]})
    for a, b in SEQUENCES:
        if a not in slugs or b not in slugs:
            raise SystemExit(f"pathways.py: sequence {a} -> {b} names a class that isn't on the map")
        if (a, b) not in seen:
            seen.add((a, b))
            edges.append({"from": a, "to": b, "kind": "sequence"})
    prereq = {c["slug"]: c["prerequisite"].strip() for c in catalog_courses if c.get("prerequisite")}

    # Columns: how many steps into a chain a class sits (0 = where a path starts)
    ins = {}
    for e in edges:
        ins.setdefault(e["to"], []).append(e["from"])
    level = {}

    def depth(s, stack=()):
        if s in level:
            return level[s]
        if s in stack:                                    # a cycle in the wording: stop
            return 0
        level[s] = 1 + max((depth(p, stack + (s,)) for p in ins.get(s, [])), default=-1)
        return level[s]

    linked = {e["from"] for e in edges} | {e["to"] for e in edges}
    by_slug = {c["slug"]: c for c in catalog_courses}
    nodes = [{"slug": s, "name": by_slug[s]["name"].rstrip("*").strip(), "dept": by_slug[s]["department"],
              "grades": by_slug[s].get("grades"), "level": depth(s) if s in linked else 0, "linked": s in linked,
              "prereq": prereq.get(s)}
             for s in sorted(by_slug)]
    return {"nodes": nodes, "edges": edges, "total": len(catalog_courses)}
