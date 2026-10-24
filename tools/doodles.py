#!/usr/bin/env python3
"""The site's ink drawings and its Morandi palette (Ethan 2026-10-23: a drawing of its own for every page and
subject, "be more creative", then "use more 莫兰迪色").

Writes one CSS block into assets/style.css between the markers below: every drawing as an inline SVG
custom property (--dd-<name>), each with its colour spot in the Morandi tone of the page or subject it
belongs to, plus the per-page and per-subject colour sets (--m-*: highlighter, panel tint, deep accent).
All drawings are original line art made for Wilkipedia.

    python3 tools/doodles.py        # then python3 tools/build.py as usual
"""
import math
import random
import re
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = ROOT / "assets" / "style.css"
START, END = "/* doodles:start (tools/doodles.py writes this block; edit there) */", "/* doodles:end */"
INK = "#2f2c28"
INK_NIGHT, PAPER_NIGHT = "#e9e3d8", "#1d1b18"   # night: the same drawings in chalk-cream ink, spots unchanged

# Morandi tones: soft colours greyed toward each other, so none shouts. Each: (tone, tint, deep).
# tone = the highlighter and drawing spot, tint = a faint panel wash, deep = marks and small text.
M = {
    "sage":     ("#b3c8b9", "#ecf1ed", "#5f7867"),
    "rose":     ("#d4b3ad", "#f5ecea", "#8e6a63"),
    "blue":     ("#a8b6c3", "#ebeff2", "#5f7080"),
    "oat":      ("#d5c7ac", "#f4f0e8", "#857559"),
    "clay":     ("#cf8f7c", "#f6ebe6", "#8f5a4a"),
    "lilac":    ("#b8afc6", "#efedf3", "#6e6581"),
    "mustard":  ("#d8b862", "#f6f0dc", "#86702f"),
    "teal":     ("#9fb6b2", "#e9f0ef", "#5b7672"),
    "mauve":    ("#c3a8b5", "#f2ebee", "#7d6270"),
    "stone":    ("#b9b3a8", "#f0eeea", "#726c61"),
}
SUBJECT = {"english": "rose", "math": "blue", "science": "sage", "social-science": "clay", "world-language": "lilac",
           "physical-education": "teal", "visual-performing-arts": "mauve", "practical-arts": "oat", "electives": "mustard", "svcte": "stone"}
# page → (drawing, tone)
PAGE = {"subjects": ("backpack", "oat"), "teachers": ("apple", "clay"), "bounties": ("target", "mustard"), "submit": ("pencil", "mustard"),
        "leaderboard": ("trophy", "mustard"), "requests": ("ask", "lilac"), "summer": ("sun", "mustard"), "school": ("school", "blue"),
        "dashboard": ("envelope", "rose"), "account": ("sliders", "teal"), "search": ("lens", "blue"), "rules": ("clipboard", "sage"),
        "about": ("bulb", "mustard"), "terms": ("clipboard", "stone"), "privacy": ("shield", "sage"), "map": ("map", "sage"), "menu": ("tray", "clay"),
        "clubs": ("pennant", "rose"), "sports": ("ball", "teal"), "feedback": ("talk", "lilac"), "bell": ("clock", "blue"), "guides": ("notes", "mustard"),
        "settings": ("sliders", "teal"), "credits": ("heart", "rose"), "404": ("crumple", "stone"), "sat": ("bubbles", "blue"), "calendar": ("calendar", "rose"),
        "inbox": ("envelope", "rose"), "review": ("clipboard", "sage"), "home": (None, "mustard"), "courses": (None, "mustard")}
# drawings used outside page heads (empty states, the footer) and their tones
EXTRA = {"talk": "lilac", "sun": "mustard", "notes": "mustard", "ask": "lilac", "pencil": "oat"}

random.seed(7)


def blob(cx, cy, rx, ry, c):
    """A soft, slightly uneven highlighter swatch."""
    pts = []
    for i in range(8):
        t, j = 2 * math.pi * i / 8, 1 + random.uniform(-.12, .12)
        pts.append((cx + rx * j * math.cos(t), cy + ry * j * math.sin(t)))
    d = f"M{(pts[0][0] + pts[-1][0]) / 2:.1f} {(pts[0][1] + pts[-1][1]) / 2:.1f}"
    for i in range(8):
        a, b = pts[i], pts[(i + 1) % 8]
        d += f" Q{a[0]:.1f} {a[1]:.1f} {(a[0] + b[0]) / 2:.1f} {(a[1] + b[1]) / 2:.1f}"
    return f'<path d="{d}Z" fill="{c}" stroke="none"/>'


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100" fill="none" stroke="{INK}" stroke-width="2.4" '
            f'stroke-linecap="round" stroke-linejoin="round">{body}</svg>')


def drawings(c):
    """Every drawing with its spot colour c."""
    G = lambda d: f'<path d="{d}" fill="{c}" stroke="none"/>'
    dot = lambda x, y, r: f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/><circle cx="{x}" cy="{y}" r="{r}"/>'
    star = '<path d="M98 12l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/>'
    apple = 'M60 36c-10-8-32-6-32 19 0 23 15 37 25 37 4 0 5-2 7-2s3 2 7 2c10 0 25-14 25-37 0-25-22-27-32-19z'
    heart = 'M60 86S22 64 22 40c0-12 9-20 19-20 8 0 15 5 19 12 4-7 11-12 19-12 10 0 19 8 19 20 0 24-38 46-38 46z'
    bubble2 = 'M64 52h40a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-6v10L88 84H64a8 8 0 0 1-8-8V60a8 8 0 0 1 8-8z'
    puzzle = 'M30 30h18c0-8 12-8 12 0h18v18c8 0 8 12 0 12v18H60c0 8-12 8-12 0H30V60c8 0 8-12 0-12z'
    sat = '<rect x="26" y="12" width="68" height="78" rx="5"/>'
    for r, yy in enumerate([28, 44, 60, 76]):
        for col, xx in enumerate([44, 60, 76]):
            sat += dot(xx, yy, 5.5) if col == [1, 0, 2, 1][r] else f'<circle cx="{xx}" cy="{yy}" r="5.5"/>'
    return {
        "clock": blob(60, 58, 32, 28, c) + '<circle cx="60" cy="58" r="27"/><path d="M60 58V40M60 58l13 8"/><path d="M33 33a11 11 0 0 1 15-11M87 33a11 11 0 0 0-15-11"/><path d="M42 82l-7 9M78 82l7 9"/><path d="M22 22l-7-5M98 22l7-5M18 40H9M102 40h9"/>',
        "calendar": '<rect x="20" y="22" width="80" height="66" rx="7"/><path d="M20 40h80M40 14v14M80 14v14"/><path d="M33 54h8M50 54h8M67 54h8M84 54h6M33 68h8M50 68h8M84 68h6M33 80h8M50 80h8"/>' + blob(71, 68, 11, 9, c) + '<path d="M62 62c4-8 18-8 19 2 1 9-14 12-19 5"/>',
        "tray": blob(60, 66, 36, 13, c) + '<path d="M14 78h92l-9 11H23z"/><path d="M32 56h56c0 13-12 22-28 22S32 69 32 56z"/><path d="M48 44c-5-6 5-8 0-15M60 44c-5-6 5-8 0-15M72 44c-5-6 5-8 0-15"/><path d="M94 52l12-16"/>',
        "pennant": G('M30 20l58 18-58 18z') + '<path d="M30 12v78M30 20l58 18-58 18"/><path d="M18 90h24"/><path d="M48 33l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/>',
        "ball": blob(64, 54, 30, 28, c) + '<circle cx="64" cy="54" r="26"/><path d="M40 42c16 7 32 7 48 0M40 66c16-7 32-7 48 0M64 28c-9 16-9 36 0 52"/><path d="M14 40h12M10 54h14M14 68h12"/>',
        "map": blob(86, 38, 15, 13, c) + '<path d="M14 26l30-9 32 9 30-9v62l-30 9-32-9-30 9z"/><path d="M44 17v62M76 26v62"/><path d="M24 72c10-12 18-2 26-15s20-14 30-22" stroke-dasharray="2 6"/><path d="M81 31l9 9M90 31l-9 9"/>',
        "notes": '<path d="M34 14h50v66"/><rect x="24" y="22" width="52" height="66" rx="4"/>' + G('M32 50h38v8H32z') + '<path d="M33 40h34M33 54h34M33 68h22"/><path d="M84 86l18-32 10 6-18 32-12 3z"/><path d="M102 54l4-7 10 6-4 7"/>',
        "apple": G(apple) + f'<path d="{apple}"/><path d="M60 36c0-8 2-13 7-17"/><path d="M66 22c8-6 17-4 21 0-6 6-15 6-21 0z"/><path d="M40 52c0-6 3-10 7-12"/>',
        "ask": blob(60, 50, 34, 24, c) + '<path d="M24 22h72a9 9 0 0 1 9 9v34a9 9 0 0 1-9 9H52L36 88V74H24a9 9 0 0 1-9-9V31a9 9 0 0 1 9-9z"/><path d="M51 40c0-9 18-9 18 0 0 7-9 7-9 14M60 62v1"/>',
        "pencil": G('M12 82c10-6 20 6 30 0s20 6 30 0 20 6 30 0v6c-10 6-20-6-30 0s-20-6-30 0-20-6-30 0z') + '<path d="M72 14l18 18-46 46-23 5 5-23z"/><path d="M66 20l18 18M26 60l18 18"/><path d="M12 84c10-6 20 6 30 0s20 6 30 0 20 6 30 0"/>',
        "trophy": G('M42 18h36v20c0 12-8 20-18 20s-18-8-18-20z') + '<path d="M40 16h40v22c0 14-9 22-20 22s-20-8-20-22z"/><path d="M40 24H27c0 13 6 19 15 19M80 24h13c0 13-6 19-15 19"/><path d="M60 60v14M44 74h32v12H44z"/>' + star,
        "bubbles": sat,
        "school": blob(60, 78, 42, 9, c) + '<path d="M18 86V50l42-26 42 26v36"/><path d="M12 86h96M52 86V66h16v20M30 58h10v10H30zM80 58h10v10H80z"/><path d="M60 24V8"/>' + G('M60 8l15 4-15 4z') + '<path d="M60 8l15 4-15 4"/>',
        "sliders": '<path d="M18 28h84M18 50h84M18 72h84"/><circle cx="40" cy="28" r="7" fill="#fff"/>' + dot(78, 50, 8) + '<circle cx="52" cy="72" r="7" fill="#fff"/>',
        "bulb": blob(60, 42, 24, 22, c) + '<path d="M60 16c-14 0-24 10-24 23 0 9 5 14 10 19v10h28V58c5-5 10-10 10-19 0-13-10-23-24-23z"/><path d="M48 76h24M51 84h18"/><path d="M24 20l-8-6M96 20l8-6M20 42H9M100 42h11"/><path d="M54 40c0-5 3-8 7-9"/>',
        "backpack": G('M42 60h36v20H42z') + '<path d="M34 40c0-14 12-22 26-22s26 8 26 22v42c0 5-4 8-8 8H42c-4 0-8-3-8-8z"/><path d="M50 18c0-9 20-9 20 0"/><rect x="42" y="58" width="36" height="22" rx="3"/><path d="M42 66h36"/>',
        "talk": blob(78, 62, 20, 15, c) + '<path d="M16 18h56a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H40L28 70V58H16a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8z"/><path d="M62 54h40a8 8 0 0 1 8 8v16a8 8 0 0 1-8 8h-6v10L86 86H62a8 8 0 0 1-8-8"/><path d="M44 30v10M44 46v1"/>',
        "shield": blob(60, 50, 24, 24, c) + '<path d="M60 12l34 12v24c0 22-15 35-34 42-19-7-34-20-34-42V24z"/><path d="M45 50l10 10 21-21"/>',
        "clipboard": '<rect x="26" y="18" width="68" height="74" rx="6"/><path d="M46 12h28v12H46z"/><path d="M38 44l5 5 9-9M38 64l5 5 9-9"/>' + G('M58 41h26v7H58z') + '<path d="M58 45h26M58 65h26M38 82h46"/>',
        "envelope": '<rect x="16" y="28" width="88" height="58" rx="7"/><path d="M16 34l44 30 44-30"/>' + dot(60, 64, 8) + '<path d="M56 64l3 3 5-6"/>',
        "sun": dot(46, 40, 16) + '<path d="M46 12v-6M46 74v-6M18 40h-6M80 40h-6M26 20l-4-4M70 64l-4-4M26 60l-4 4M70 16l-4 4"/><path d="M10 86c10-7 20 7 30 0s20 7 30 0 20 7 30 0 10 7 14 2"/><path d="M84 64l18-6v26"/>',
        "target": '<circle cx="54" cy="54" r="32"/><circle cx="54" cy="54" r="20"/>' + dot(54, 54, 8) + '<path d="M54 54l42-40M88 12h10v10"/>',
        "heart": G(heart) + f'<path d="{heart}"/><path d="M34 40c0-6 4-10 9-10"/>',
        "lens": f'<circle cx="50" cy="46" r="26" fill="{c}"/><circle cx="50" cy="46" r="26"/><path d="M69 65l26 26"/><path d="M38 38c2-5 6-8 12-9"/>',
        "crumple": G('M30 40l18-16 26 4 18 20-6 26-24 12-24-8-10-20z') + '<path d="M30 40l18-16 26 4 18 20-6 26-24 12-24-8-10-20z"/><path d="M48 24l6 22-24-6M74 28l-20 18 28 28M92 48L54 46 58 86"/><path d="M100 20l8-6M104 34h10M98 8l2-8"/>',
        # subjects
        "math": '<path d="M18 86h88M22 90V14"/><path d="M22 80c20-4 30-52 54-54s24 20 28 30"/>' + blob(76, 26, 9, 8, c) + f'<circle cx="76" cy="26" r="4" fill="{INK}"/><path d="M36 86v-4M50 86v-4M64 86v-4M78 86v-4M92 86v-4"/><path d="M76 26V86" stroke-dasharray="2 6"/>',
        "science": G('M37 64h46l8 17c1 3-1 7-5 7H34c-4 0-6-4-5-7z') + '<path d="M48 14h24M53 14v26L30 82c-2 4 1 8 6 8h48c5 0 8-4 6-8L67 40V14"/><circle cx="52" cy="72" r="3"/><circle cx="64" cy="78" r="2"/><circle cx="70" cy="68" r="2.5"/>' + star,
        "english": '<path d="M12 84c16-10 32-12 48-4 16-8 32-6 48 4V26c-16-10-32-12-48-4-16-8-32-6-48 4z"/><path d="M60 22v62"/>' + G('M80 18v30l7-7 7 7V18z') + '<path d="M80 18v30l7-7 7 7V18"/><path d="M24 40c8-3 18-4 26-2M24 52c8-3 18-4 26-2M24 64c8-3 18-4 26-2"/>',
        "social-science": '<circle cx="60" cy="44" r="27"/>' + G('M44 32c6-6 14-4 16 2s-4 10 2 14 6 12-2 14c-8 2-10-8-16-10s-8-14 0-20z') + '<path d="M33 44h54M60 17c-10 10-10 44 0 54M60 17c10 10 10 44 0 54"/><path d="M28 44a32 32 0 0 0 64 0"/><path d="M60 76v10M44 90h32"/>',
        "world-language": G(bubble2) + f'<path d="M14 16h56a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H38L26 66V54H14a8 8 0 0 1-8-8V24a8 8 0 0 1 8-8z"/><path d="{bubble2}"/><path d="M22 30h40M22 40h26M68 64h32M68 72h18"/>',
        "physical-education": G('M30 62h70v6H30z') + '<path d="M16 72c0-10 8-26 22-28l10 9c7 5 17 5 23 0l12 9c10 6 22 6 22 15v7H16z"/><path d="M16 78h89"/><path d="M44 56l6-6M52 61l6-6M60 64l5-6"/><path d="M12 40h12M8 52h10"/>',
        "visual-performing-arts": '<path d="M58 16c-24 0-42 16-42 34s14 32 30 32c8 0 8-8 6-12-2-6 2-10 8-10h10c12 0 18-8 18-16 0-15-14-28-30-28z"/><circle cx="36" cy="46" r="5"/>' + dot(50, 30, 5) + '<circle cx="70" cy="30" r="5"/><path d="M82 90l24-36"/>' + G('M100 50l8 4-4 8-8-4z') + '<path d="M100 50l8 4-4 8-8-4z"/>',
        "practical-arts": '<circle cx="76" cy="40" r="14"/>' + blob(76, 40, 8, 8, c) + '<path d="M76 18v8M76 54v8M54 40h8M90 40h8M60 24l6 6M86 50l6 6M60 56l6-6M86 30l6-6"/><path d="M18 86l36-36"/><path d="M50 46c-4-10 4-20 14-18l-8 8 2 6 6 2 8-8c2 10-8 18-18 14"/>',
        "electives": G(puzzle) + f'<path d="{puzzle}"/>' + star,
        "svcte": '<rect x="16" y="42" width="88" height="44" rx="6"/><path d="M44 42V32h32v10"/>' + G('M16 56h88v8H16z') + '<path d="M16 60h88M54 56v8h12v-8"/>',
    }


def uri(x):
    return 'url("data:image/svg+xml,' + urllib.parse.quote(x) + '")'


def rgba(h, a):
    return f"rgba({int(h[1:3], 16)}, {int(h[3:5], 16)}, {int(h[5:7], 16)}, {a})"


def block():
    want = {}                                            # drawing name → tone
    for d, tone in SUBJECT.items():
        want[d] = tone
    for _, (d, tone) in PAGE.items():
        if d:
            want.setdefault(d, tone)
    for d, tone in EXTRA.items():
        want.setdefault(d, tone)
    out = [START, "body:has(.look-fresh) {"]
    night = []
    for name, tone in want.items():
        day = svg(drawings(M[tone][0])[name])
        out.append(f"  --dd-{name}: {uri(day)};")
        # night mode gets its own copy (cream ink, the spot in its Morandi tone) instead of a CSS invert,
        # so the colours stay true and nothing turns muddy
        dark = day.replace(INK, INK_NIGHT).replace('fill="#fff"', 'fill="' + PAPER_NIGHT + '"')
        night.append("  --dd-" + name + ": " + uri(dark) + ";")
    out.append("}")
    nb = "\n".join(night)
    out.append(f':root[data-theme="dark"] body:has(.look-fresh) {{\n{nb}\n}}')
    out.append(f'@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) body:has(.look-fresh) {{\n{nb}\n}} }}')

    # a highlighter swipe in every tone (a band with slightly ragged, rounded ends)
    for tone, (t, _, _) in M.items():
        mk = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" preserveAspectRatio="none"><path d="M5 12 C40 6 120 8 196 5 '
              f'C199 14 198 26 195 33 C130 37 60 35 4 37 C1 28 2 19 5 12 Z" fill="{rgba(t, .7)}"/></svg>')
        out.insert(out.index("}"), f"  --mk-{tone}: {uri(mk)};")      # into the first (day) block, which every mode reads

    def tone_vars(tone):
        t, tint, deep = M[tone]
        return f"--m-tone: {t}; --m-hl: {rgba(t, .62)}; --m-tint: {tint}; --m-deep: {deep}; --m-marker: var(--mk-{tone});"
    for p, (d, tone) in PAGE.items():
        dd = f" --doodle: var(--dd-{d});" if d else ""
        out.append(f'body:has(.look-fresh[data-p="{p}"]) {{ {tone_vars(tone)}{dd} }}')
    for d, tone in SUBJECT.items():
        out.append(f'body:has(.look-fresh) .c-hero[data-d="{d}"] {{ --doodle: var(--dd-{d}); }}')
        out.append(f'body:has(.look-fresh[data-d="{d}"]), body:has(.c-hero[data-d="{d}"]) {{ {tone_vars(tone)} }}')
    # each subject's tone, by name, for lists that show several subjects at once
    out.append("body:has(.look-fresh) { " + " ".join(f"--m-{d}: {M[tone][0]}; --m-{d}-tint: {M[tone][1]};" for d, tone in SUBJECT.items()) + " }")
    out.append(END)
    return "\n".join(out)


def main():
    css = CSS.read_text()
    new = block()
    if START in css:
        css = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: new, css, flags=re.S)
    else:
        css = css.rstrip() + "\n\n" + new + "\n"
    CSS.write_text(css)
    print(f"doodles: {new.count('--dd-')} drawings, {len(new) // 1024} KB")


if __name__ == "__main__":
    main()
