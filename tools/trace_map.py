#!/usr/bin/env python3
"""Traces the school's campus map (assets/map/campus-map.png) into clean vector
lines for the map page, so it stays sharp at any zoom instead of blurring.

    python3 tools/trace_map.py

Output: data/map-plan.json, read by assets/js/map.js.

Nothing is redrawn by hand: every wall is a straight run of dark pixels found
in the official map, kept at its own thickness (thick = outside walls, thin =
room dividers), and every building fill is an area the official map encloses.
The map is almost all horizontal and vertical lines; the few slanted ones
(the theatre's corner, N100's end, the drive) are listed in SLANTS, read off
the same image. Room names come from data/map.json, and the other words on
the official map (parking, BRIDGE, STAGE...) are listed in LABELS with their
positions on it. Standard library only.
"""

import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "map" / "campus-map.png"
OUT = ROOT / "data" / "map-plan.json"

DARK = 185          # luminance below this is ink (thin lines are anti-aliased greys ~135-175)
MIN_RUN = 16        # shorter runs are lettering or icons, not walls
MIN_ROOM = 260      # enclosed areas smaller than this (px²) are the insides of letters

# The other words printed on the official map, where it prints them.
# (x, y, text, style) — style: area | small | street | title | sub | creek (vertical)
LABELS = [
    (141, 126, "STUDENT PARKING", "area"), (1452, 140, "STUDENT PARKING", "area"),
    (859, 45, "VISITOR PARKING", "area"), (1093, 111, "FACULTY PARKING", "area"),
    (172, 432, "FACULTY PARKING", "area"),
    (338, 203, "BRIDGE", "small"), (342, 636, "BRIDGE", "small"),
    (337, 430, "Calabazas Creek", "creek"), (339, 803, "Calabazas Creek", "creek"),
    (421, 591, "SECOND FLOOR", "small"), (847, 132, "MAIN ENTRANCE", "small"),
    (713, 259, "STUDENT ENTRANCE", "small"), (766, 495, "STAGE", "area"),
    (1283, 663, "Classroom Building R", "sub"), (1178, 685, "3rd Floor", "sub"),
    (1287, 685, "2nd Floor", "sub"), (1392, 685, "1st Floor", "sub"),
    (800, 238, "Staff", "tiny"), (800, 268, "Snack Bar", "tiny"), (480, 283, "Stairs & Elevator", "tiny"),
    (640, 297, "Stairs & Elevator", "tiny"), (601, 103, "Staff", "tiny"), (452, 309, "Staff", "tiny"),
    (608, 325, "Staff", "tiny"), (553, 600, "Copy", "tiny"),
    (817, 912, "WILCOX HIGH SCHOOL", "title"), (818, 932, "3250 MONROE ST · SANTA CLARA CA 95051", "addr"),
]
# Slanted and curved lines on the official map (SVG paths, image pixels).
SLANTS = [
    "M64 376L118 355",                            # theatre: the angled corner
    "M111 543L97 475L133 475",                    # N100's slanted end
    "M726 25L822 180",                            # the drive off Monroe
    "M746 198L714 244",                           # student entrance pointer
    "M988 25Q1178 41 1369 104",                   # the curved edge of the faculty lot
    "M1347 140Q1366 137 1369 123",
]
# The official map's symbols, redrawn as clean icons (centres, image pixels).
RESTROOMS = [(584, 103), (391, 233), (540, 240), (436, 308), (592, 324), (388, 551), (539, 550), (554, 646),
             (800, 217), (1003, 225), (1322, 303), (1322, 327), (1490, 457), (280, 732), (538, 750), (492, 797),
             (1202, 710), (1307, 710), (1412, 710)]
STAIRS = [(390, 156), (536, 153), (487, 307), (647, 322), (392, 442), (440, 462), (542, 447), (602, 463),
          (440, 539), (597, 540)]
ELEVATORS = [(474, 308), (634, 321)]
# Where the official map has pictures or big lettering rather than walls: no strokes kept here.
NO_STROKES = [(212, 50, 252, 205),               # its north arrow (the page draws its own)
              (812, 895, 1112, 960)]             # the title block
NO_STROKES += [(x - 12, y - 12, x + 12, y + 12) for x, y in RESTROOMS + STAIRS + ELEVATORS]
CREEK_X = (293, 393)                             # anything traced between the creek's banks is water, not building
# The creek between its bank lines (x 297-388), in the three reaches the bridges split it into.
WATER = [(297, 25, 388, 190), (297, 213, 388, 625), (297, 648, 388, 960)]


def read_png(path):
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w = 8, b"", 0
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + n]
        if kind == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", chunk[:10])
            assert depth == 8 and ctype in (2, 6), "expects 8-bit RGB(A)"
            bpp = 3 if ctype == 2 else 4
        elif kind == b"IDAT":
            idat += chunk
        pos += 12 + n
    raw = zlib.decompress(idat)
    stride = w * bpp
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if f == 1: line[i] = (line[i] + a) & 255
            elif f == 2: line[i] = (line[i] + b) & 255
            elif f == 3: line[i] = (line[i] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        prev = line
    lum = [bytearray(w) for _ in range(h)]
    for y, line in enumerate(rows):
        L = lum[y]
        for x in range(w):
            i = x * bpp
            L[x] = (line[i] * 299 + line[i + 1] * 587 + line[i + 2] * 114) // 1000
    return w, h, lum


def runs(mask, w, h, horizontal):
    """Straight lines of ink along rows (or columns): (centre, start, end, thickness).

    Every ink pixel knows how long its run is along the line (must be MIN_RUN+,
    or it's lettering) and how thick the ink is across it (a wall is at most
    ~6 px). Each column of a line contributes its own centre, so a wall that
    steps, or meets another at a corner, still comes out as clean strokes."""
    if horizontal:
        get = lambda o, i: mask[o][i]
        outer, inner = h, w
    else:
        get = lambda o, i: mask[i][o]
        outer, inner = w, h
    # along[o][i]: length of the run along the line through (o, i)
    along = [[0] * inner for _ in range(outer)]
    for o in range(outer):
        i = 0
        while i < inner:
            if get(o, i):
                j = i
                while j < inner and get(o, j):
                    j += 1
                for k in range(i, j):
                    along[o][k] = j - i
                i = j
            else:
                i += 1
    # for each position along the line, walk across it: runs of qualifying pixels
    centres = {}                                   # (quantised centre) -> list of (i, thickness)
    for i in range(inner):
        o = 0
        while o < outer:
            if along[o][i] >= MIN_RUN:
                q = o
                while q < outer and along[q][i] >= MIN_RUN:
                    q += 1
                t = q - o
                if t <= 6:                             # thicker than a wall: a filled shape, not a line
                    c = round((o + t / 2) * 2) / 2
                    centres.setdefault(c, []).append((i, t))
                o = q
            else:
                o += 1
    out = []
    for c, cols in centres.items():
        cols.sort()
        start = prev = cols[0][0]
        ts = [cols[0][1]]
        for i, t in cols[1:] + [(None, None)]:
            if i is not None and i - prev <= 2:
                prev = i
                ts.append(t)
                continue
            if prev + 1 - start >= MIN_RUN:
                ts.sort()
                out.append((c, start, prev + 1, ts[len(ts) // 2]))
            if i is not None:
                start = prev = i
                ts = [t]
    return out


def enclosed(mask, w, h):
    """Pixels the drawing closes off from the page edge (building insides)."""
    seen = [bytearray(w) for _ in range(h)]
    stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x] or mask[y][x]:
            continue
        seen[y][x] = 1
        stack += ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1))
    inside = [bytearray(w) for _ in range(h)]
    for y in range(h):
        for x in range(w):
            inside[y][x] = 0 if seen[y][x] else 1       # ink counts as inside too
    # drop tiny islands (letter counters, icon holes)
    lab = [[0] * w for _ in range(h)]
    n = 0
    for y in range(h):
        for x in range(w):
            if inside[y][x] and not lab[y][x]:
                n += 1
                comp, st = [], [(x, y)]
                lab[y][x] = n
                while st:
                    cx, cy = st.pop()
                    comp.append((cx, cy))
                    for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                        if 0 <= nx < w and 0 <= ny < h and inside[ny][nx] and not lab[ny][nx]:
                            lab[ny][nx] = n
                            st.append((nx, ny))
                if len(comp) < MIN_ROOM:
                    for cx, cy in comp:
                        inside[cy][cx] = 0
    return inside


def rects(inside, w, h):
    """The inside mask as few rectangles: row runs stacked while they match."""
    out, open_ = [], {}
    for y in range(h + 1):
        cur = {}
        if y < h:
            row, x = inside[y], 0
            while x < w:
                if row[x]:
                    j = x
                    while j < w and row[j]:
                        j += 1
                    cur[(x, j)] = True
                    x = j
                else:
                    x += 1
        nxt = {}
        for span, y0 in open_.items():
            if span in cur:
                nxt[span] = y0
            else:
                out.append((span[0], y0, span[1], y))
        for span in cur:
            if span not in nxt:
                nxt[span] = y
        open_ = nxt
    return out


def main():
    w, h, lum = read_png(SRC)
    ink = [bytearray(1 if v < DARK else 0 for v in row) for row in lum]
    hs, vs = runs(ink, w, h, True), runs(ink, w, h, False)
    fills = rects(enclosed(ink, w, h), w, h)

    def seg(k):
        return round(k * 2) / 2

    def keep(s, horiz):
        c, a, b, _ = s
        x0, y0, x1, y1 = (a, c, b, c) if horiz else (c, a, c, b)
        return not any(x0 >= bx0 and x1 <= bx1 and y0 >= by0 and y1 <= by1 for bx0, by0, bx1, by1 in NO_STROKES)
    hs = [s for s in hs if keep(s, True)]
    vs = [s for s in vs if keep(s, False)]
    thick = [s for s in hs + vs if s[3] >= 3]
    thin = [s for s in hs + vs if s[3] < 3]
    # nothing between the banks is building (B's second-floor strip starts at x 368)
    fills = [(max(x0, 368) if x0 >= CREEK_X[0] and x0 < 368 else x0, y0, x1, y1) for x0, y0, x1, y1 in fills
             if not (x0 >= CREEK_X[0] and x1 <= 368)]
    water = WATER
    path = lambda ss, horiz: "".join(
        f"M{seg(a)} {seg(c)}H{seg(b)}" if horiz else f"M{seg(c)} {seg(a)}V{seg(b)}" for c, a, b, t in ss)
    out = {
        "_about": "GENERATED by tools/trace_map.py from assets/map/campus-map.png. Don't edit; re-run it.",
        "width": w, "height": h,
        "fill": "".join(f"M{x0} {y0}h{x1 - x0}v{y1 - y0}h{x0 - x1}z" for x0, y0, x1, y1 in fills),
        "water": "".join(f"M{x0} {y0}h{x1 - x0}v{y1 - y0}h{x0 - x1}z" for x0, y0, x1, y1 in water),
        "thick": path([s for s in thick if s in hs], True) + path([s for s in thick if s in vs], False),
        "thin": path([s for s in thin if s in hs], True) + path([s for s in thin if s in vs], False),
        "slants": "".join(SLANTS),
        "icons": {"restroom": RESTROOMS, "stairs": STAIRS, "elevator": ELEVATORS},
        "labels": [{"x": x, "y": y, "t": t, "s": s} for x, y, t, s in LABELS],
    }
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(fills)} fill rects, {len(thick)} thick + {len(thin)} thin strokes, "
          f"{OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
