#!/usr/bin/env python3
"""Parse the SCUSD course catalog into data/catalog.json (Wilcox courses only).

Run once a year when the district publishes a new catalog:
    1. Extract the PDF's text with pypdf in layout mode, one page per block
       separated by lines like "=====PAGE 44=====", into tools/catalog.txt:
         pip install pypdf
         python3 -c "from pypdf import PdfReader; r=PdfReader('catalog.pdf'); \
           open('tools/catalog.txt','w').write(''.join(f'\\n=====PAGE {i+1}=====\\n'+(p.extract_text(extraction_mode='layout') or '') for i,p in enumerate(r.pages)))"
    2. python3 tools/parse_catalog.py      -> writes data/catalog.json
    3. python3 tools/build.py
Then spot-check a dozen courses against the PDF: the catalog's layout shifts
between years and this parser was written against the 2025-26 edition.
"""
import json, re, sys, unicodedata
from pathlib import Path

HERE = Path(__file__).parent
raw = (HERE / "catalog.txt").read_text()

LIG = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
       "’": "’"}
def fix(s):
    for k, v in LIG.items():
        s = s.replace(k, v)
    return s

# ---- 1. flatten into (page, text) lines, dropping markers and footer numbers ----
lines = []  # list of [page, text]
page = 0
for ln in raw.split("\n"):
    m = re.match(r"=====PAGE (\d+)=====", ln)
    if m:
        page = int(m.group(1))
        continue
    lines.append([page, fix(ln.rstrip())])

# remove footer page numbers: a line that is just a number, and is the last non-blank line of its page
for i, (p, t) in enumerate(lines):
    if re.fullmatch(r"\s*\d{1,3}\s*", t):
        j = i + 1
        while j < len(lines) and lines[j][1].strip() == "" and lines[j][0] == p:
            j += 1
        if j >= len(lines) or lines[j][0] != p:
            lines[i][1] = ""

# restrict to course-description section
start = next(i for i, (p, t) in enumerate(lines) if t.strip() == "Course Descriptions" and p >= 40)
end = next(i for i, (p, t) in enumerate(lines) if t.strip().startswith("High School Credits Equivalency") and p > 100)

SECTIONS = {  # heading text -> display name
    "ENGLISH": "English", "MATH": "Math", "SOCIAL SCIENCE": "Social Science", "SCIENCE": "Science",
    "WORLD LANGUAGE": "World Language", "PHYSICAL EDUCATION": "Physical Education",
    "VISUAL / PERFORMING ARTS": "Visual / Performing Arts", "PRACTICAL ARTS": "Practical Arts",
    "ELECTIVES": "Electives",
}
def slugify(s):
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s

def segs(t):
    return [x.strip() for x in re.split(r"\s{3,}", t.strip()) if x.strip()]

LABEL = re.compile(r"^(Grades?\s*:|UC\s*/\s*CSU Requirement\s*:|Credits\s*:|CTE Pathway\s*:)", re.I)
FIELD_LINE = re.compile(r"^\s*(Grades?\s*:|UC\s*/\s*CSU Requirement\s*:|Credits\s*:)", re.I)

# ---- 2. mark section headings and course header starts ----
section_at = {}
for i in range(start, end):
    s = lines[i][1].strip()
    if s in SECTIONS:
        section_at[i] = SECTIONS[s]
    elif s.startswith("Silicon Valley Career Technical Education"):
        section_at[i] = "Silicon Valley Career Technical Education (SVCTE)"

issues = []
entries = []  # dicts with header_start, header_end(idx after header), fields...

def prev_nonblank(i):
    j = i - 1
    while j >= start and lines[j][1].strip() == "":
        j -= 1
    return j

i = start
while i < end:
    s = lines[i][1].strip()
    if s.startswith("Course#"):
        # header begins at the contiguous non-blank block above (name lines)
        hs = i
        j = i - 1
        while j >= start and lines[j][1].strip() != "" and j not in section_at and len(entries) >= 0:
            # stop if the line above is a description line (no right-hand label and long)
            sg = segs(lines[j][1])
            if not sg:
                break
            if len(sg) == 1 and len(sg[0]) > 60:
                break
            hs = j
            j -= 1
            if i - j > 3:
                break
        entries.append({"hs": hs, "ci": i, "kind": "regular"})
    i += 1

# SVCTE: name | Grades line followed by "SVCTE | UC / CSU..." (or UC line then SVCTE)
svcte_start = next(k for k, v in section_at.items() if v.startswith("Silicon"))
for i in range(svcte_start, end):
    sg = segs(lines[i][1])
    if len(sg) == 2 and re.match(r"Grades?:", sg[1]) and "SVCTE" not in sg[0]:
        entries.append({"hs": i, "ci": None, "kind": "svcte"})
entries.sort(key=lambda e: e["hs"])

# ---- 3. parse each entry ----
def section_for(idx):
    best = None
    for k in sorted(section_at):
        if k <= idx:
            best = section_at[k]
    return best

courses = []
for n, e in enumerate(entries):
    hs = e["hs"]
    nxt = entries[n + 1]["hs"] if n + 1 < len(entries) else end
    # section heading between -> ends description
    stops = [k for k in section_at if hs < k < nxt]
    stop = min(stops) if stops else nxt
    block = list(range(hs, stop))
    rec = {"name": None, "grades": None, "courseNumber": None, "ucCsu": None, "credits": None,
           "ctePathway": None, "offeredAt": None, "offeredAtListed": False, "prerequisite": None,
           "description": None, "page": lines[hs][0], "department": section_for(hs), "_notes": [],
           "_line": hs + 1}
    name_parts = []
    fields = {}
    cur = None
    k = hs
    header_done = False
    extra_header = []
    # --- header ---
    if e["kind"] == "regular":
        ci = e["ci"]
        for k in range(hs, ci):
            sg = segs(lines[k][1])
            name_parts.append(sg[0])
            for x in sg[1:]:
                if LABEL.match(x):
                    cur = LABEL.match(x).group(1)
                    fields[cur] = x[len(cur):].strip()
                elif cur:
                    fields[cur] += " " + x
        k = ci
        # after Course#: consume until Offered at / Prerequisite line
        while k < stop:
            t = lines[k][1].strip()
            if t == "":
                k += 1
                continue
            if re.match(r"Offered at", t, re.I) or re.match(r"Prerequisite", t):
                break
            sg = segs(lines[k][1])
            for x in sg:
                if x.startswith("Course#"):
                    fields["Course#"] = x[len("Course#"):].strip()
                elif LABEL.match(x):
                    cur = LABEL.match(x).group(1)
                    fields[cur] = x[len(cur):].strip()
                elif cur and (k == ci or x in ("Technology", "Technologies")):
                    fields[cur] += " " + x
                else:
                    extra_header.append(x)
            k += 1
            if k - ci > 12:
                issues.append(("header-runaway", " ".join(name_parts)))
                break
    else:
        # SVCTE: name | Grades ; SVCTE | UC ; description
        sg = segs(lines[hs][1])
        name_parts.append(sg[0])
        fields["Grades:"] = sg[1][len("Grades:"):].strip()
        k = hs + 1
        while k < stop:
            t = lines[k][1].strip()
            if t == "":
                k += 1
                continue
            sg = segs(lines[k][1])
            if all(x == "SVCTE" or LABEL.match(x) for x in sg):
                for x in sg:
                    if LABEL.match(x):
                        cur = LABEL.match(x).group(1)
                        fields[cur] = x[len(cur):].strip()
                k += 1
                continue
            break
    rec["name"] = re.sub(r"\s+", " ", " ".join(name_parts)).strip()
    for key, v in fields.items():
        v = re.sub(r"\s+", " ", v).strip() or None
        kl = key.lower()
        if kl.startswith("grade"):
            rec["grades"] = v
        elif kl.startswith("uc"):
            rec["ucCsu"] = v
        elif kl.startswith("credits"):
            rec["credits"] = v
        elif kl.startswith("cte"):
            rec["ctePathway"] = v
        elif key == "Course#":
            rec["courseNumber"] = v
    if extra_header:
        rec["headerNote"] = " ".join(extra_header)
    # --- Offered at / Prerequisite ---
    while k < stop:
        t = lines[k][1].strip()
        if t == "":
            k += 1
            continue
        m = re.match(r"Offered at\s*:?\s*(.*)$", t, re.I)
        if m:
            val = m.group(1).strip()
            rec["offeredAtRaw"] = val
            rec["offeredAt"] = [x.strip() for x in val.split(",") if x.strip()]
            rec["offeredAtListed"] = True
            k += 1
            continue
        m = re.match(r"(Prerequisites?|Corequisites?)\s*:?\s*(.*)$", t)
        if m:
            field = "prerequisite" if m.group(1).startswith("Pre") else "corequisite"
            parts = [m.group(2).strip()]
            k += 1
            while k < stop and lines[k][1].strip() != "":
                parts.append(lines[k][1].strip())
                k += 1
            # the catalog sometimes repeats the label ("Prerequisite  Prerequisite: IEP")
            cleaned = []
            for x in parts:
                x2 = re.sub(r"^Prerequisites?\s*:\s*", "", x)
                if x2 != x:
                    rec["_notes"].append(f"repeated Prerequisite label collapsed: {x!r}")
                if x2 and x2 not in cleaned:
                    cleaned.append(x2)
                elif x2:
                    rec["_notes"].append(f"duplicate prerequisite text dropped: {x!r}")
            v = re.sub(r"\s+", " ", " ".join(cleaned)).strip()
            rec[field] = v or None
            continue
        break
    # --- description ---
    paras, curp = [], []
    for kk in range(k, stop):
        t = lines[kk][1].strip()
        if t == "" :
            if curp:
                paras.append(curp); curp = []
            continue
        mp = re.match(r"Prerequisites?\s*:\s*(.*)$", t)
        if mp:
            val = mp.group(1).strip()
            have = (rec["prerequisite"] or "").rstrip(".")
            if not val or val.rstrip(".") == have:
                rec["_notes"].append(f"dropped redundant trailing line: {t!r}")
            elif not have:
                rec["prerequisite"] = val
                rec["_notes"].append(f"prerequisite taken from trailing line: {t!r}")
            else:
                rec["_notes"].append(f"CONFLICT trailing prerequisite line: {t!r}")
                rec["trailingNote"] = f'The catalog also prints "{t}" after the description.'
            continue
        if FIELD_LINE.match(t):
            rec["_notes"].append(f"stripped stray header line in description: {t!r}")
            continue
        if re.fullmatch(r"(English|Math|Social Science|Science|World Language|Physical Education) Pathways", t):
            continue
        t = re.sub(r"\s{2,}", " ", t)
        if t.startswith("●"):
            if curp:
                paras.append(curp)
            curp = ["• " + t.lstrip("● ").strip()]
            continue
        curp.append(t)
    if curp:
        paras.append(curp)
    # join lines within a paragraph; handle hyphenation
    out = []
    for p in paras:
        txt = ""
        for ln in p:
            if not txt:
                txt = ln
            elif re.search(r"[a-z]-$", txt) and re.match(r"[a-z]", ln):
                txt = txt + ln  # line-end hyphenation (none occur in this catalog)
            else:
                txt = txt + " " + ln
        out.append(txt)
    # merge paragraphs split only by a page break (paragraph not ending in terminal punctuation)
    merged = []
    for p in out:
        if merged and not merged[-1].startswith("• ") and not p.startswith(("• ", "*")) and not re.search(r"[.!?:)\"”]$", merged[-1]):
            merged[-1] = merged[-1] + " " + p
        else:
            merged.append(p)
    desc = "\n\n".join(merged)
    desc = desc.replace("\n\n• ", "\n• ")
    rec["description"] = desc or None
    courses.append(rec)

# ---- 4. report ----
# (all 233 parsed courses, before the Wilcox filter, are in `courses` here)
print("entries:", len(courses))
for c in courses:
    flags = []
    if not c["offeredAtListed"]: flags.append("NO-OFFERED")
    if c.get("headerNote"): flags.append("NOTE:" + c["headerNote"])
    if c["_notes"]: flags.append("STRAY")
    if not c["description"]: flags.append("NO-DESC")
    print(f'{c["page"]:>3} {c["department"][:12]:12} {c["name"][:45]:45} | {c["grades"]} | {c["courseNumber"]} | {c["ucCsu"]} | {c["credits"]} | {c.get("offeredAtRaw")} | P:{(c["prerequisite"] or "")[:30]} {" ".join(flags)}')

# ---- 5. Wilcox filter, dedupe, slugs, write courses.json ----
DEPT_ORDER = []
for k in sorted(section_at):
    if section_at[k] not in DEPT_ORDER:
        DEPT_ORDER.append(section_at[k])
def dslug(name):
    return "svcte" if name.startswith("Silicon") else slugify(name)

def at_wilcox(c):
    if not c["offeredAtListed"]:
        return True
    return any("wilcox" in x.lower() for x in c["offeredAt"])

kept, byname, dupes = [], {}, []
for c in courses:
    if not at_wilcox(c):
        continue
    key = c["name"].lower()
    if key in byname and byname[key]["department"] != c["department"]:
        first = byname[key]
        first.setdefault("_also", []).append(c)
        dupes.append((c["name"], first["department"], c["department"], first["courseNumber"], c["courseNumber"]))
        continue
    byname.setdefault(key, c)
    kept.append(c)

out_courses, used = [], set()
for c in kept:
    base = slugify(c["name"].replace("*", "")) or "course"
    slug, n = base, 2
    while slug in used:
        slug = f"{base}-{n}"; n += 1
    used.add(slug)
    o = {"slug": slug, "name": c["name"], "department": dslug(c["department"]),
         "grades": c["grades"], "courseNumber": c["courseNumber"], "ucCsu": c["ucCsu"],
         "credits": c["credits"], "ctePathway": c["ctePathway"],
         "offeredAt": c["offeredAt"], "offeredAtListed": c["offeredAtListed"],
         "prerequisite": c["prerequisite"]}
    if c.get("corequisite"):
        o["corequisite"] = c["corequisite"]
    notes = [x for x in (c.get("headerNote"), c.get("trailingNote")) if x]
    if notes:
        o["note"] = " ".join(notes)
    o["description"] = c["description"]
    o["page"] = c["page"]
    if c.get("_also"):
        o["alsoIn"] = [dslug(a["department"]) for a in c["_also"]]
        o["alsoInDetail"] = [{"department": dslug(a["department"]), "courseNumber": a["courseNumber"],
                              "page": a["page"], "sameDescription": a["description"] == c["description"]}
                             for a in c["_also"]]
    out_courses.append(o)

used_depts = [d for d in DEPT_ORDER if any(o["department"] == dslug(d) for o in out_courses)]
result = {"source": "SCUSD High School Course Catalog 2025-2026",
          "pageNumbering": "page = PDF page index (the printed page number is one less)",
          "departments": [{"name": d, "slug": dslug(d)} for d in used_depts],
          "courses": out_courses}
json.dump(result, open(HERE.parent / "data" / "catalog.json", "w"), indent=2, ensure_ascii=False)
print("\nWILCOX:", len(out_courses))
from collections import Counter
print(Counter(o["department"] for o in out_courses))
print("dupes:", dupes)
print("notes:")
for c in courses:
    if c["_notes"] and at_wilcox(c):
        print(" ", c["name"], c["_notes"])
