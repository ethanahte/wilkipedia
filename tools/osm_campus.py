#!/usr/bin/env python3
"""Pulls the streets, houses and creek around Wilcox from OpenStreetMap and
writes them into the 3D campus's own coordinates.

    python3 tools/osm_campus.py [--cache FILE]

--cache keeps the raw Overpass answer in FILE (read if present, written if not),
so re-running after a tweak doesn't hit the server again.
Output: campus/js/osm.js (generated; don't edit it by hand, re-run this).

The campus is laid out in metres with the origin at the cedar in the quad, +x
east and +z south. OSM is lat/lon. The two are tied together by FIT below,
which was found by sliding OSM's outlines of the school buildings (B, R, S,
the cafeteria, the gyms...) over the hand-measured ones in layout.js until
they matched best (mean gap ~1.5 m). If layout.js is ever re-measured, re-fit.

Map data © OpenStreetMap contributors, available under the Open Database
License (ODbL). The campus page credits it; keep that credit if this data is
used anywhere else.

Standard library only.
"""

import json
import math
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "campus" / "js" / "osm.js"

# local = SC * enu(lat, lon) + (TX, TZ), with enu measured from (LAT0, LON0)
LAT0, LON0 = 37.3660, -121.9860
FIT = {"tx": 4.75, "tz": -4.75, "sc": 1.015}

# Keep in step with WORLD in campus/js/layout.js.
WORLD = {"x0": -215, "z0": -150, "x1": 365, "z1": 305}
BBOX = (37.3595, -121.9940, 37.3720, -121.9780)   # S, W, N, E: WORLD plus a margin

SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
ROAD_KINDS = {"primary", "secondary", "tertiary", "unclassified", "residential", "living_street"}


def local(lat, lon):
    ex = (lon - LON0) * 111320 * math.cos(math.radians(LAT0))
    ez = -(lat - LAT0) * 110574
    return (FIT["sc"] * ex + FIT["tx"], FIT["sc"] * ez + FIT["tz"])


def fetch(cache=None):
    if cache and Path(cache).exists():
        return json.loads(Path(cache).read_text())["elements"]
    s, w, n, e = BBOX
    q = f"""[out:json][timeout:90];
(
  way["building"]({s},{w},{n},{e});
  way["highway"]({s},{w},{n},{e});
  way["waterway"="river"]["name"="Calabazas Creek"]({s},{w},{n},{e});
  way["amenity"="school"]["name"="Wilcox High School"]({s},{w},{n},{e});
);
out body geom;"""
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in SERVERS:
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "wilkipedia-campus/1.0 (wilcoxwiki.org)"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.load(r)
            if cache:
                Path(cache).write_text(json.dumps(data))
            return data["elements"]
        except Exception as err:   # try the next mirror
            last = err
    raise SystemExit(f"Overpass unreachable: {last}")


def inside(x, z, poly):
    c = False
    for i in range(len(poly)):
        (ax, az), (bx, bz) = poly[i], poly[i - 1]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax:
            c = not c
    return c


def area(poly):
    return abs(sum(poly[i][0] * poly[i - 1][1] - poly[i - 1][0] * poly[i][1] for i in range(len(poly)))) / 2


def simplify(pts, tol):
    """Douglas-Peucker on an open polyline."""
    if len(pts) < 3:
        return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]
    dx, dz = bx - ax, bz - az
    l = math.hypot(dx, dz) or 1e-9
    i, dmax = 0, 0
    for k in range(1, len(pts) - 1):
        d = abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / l
        if d > dmax:
            i, dmax = k, d
    if dmax <= tol:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], tol)[:-1] + simplify(pts[i:], tol)


def simplify_ring(ring, tol):
    """Douglas-Peucker on a closed ring (no repeated end point)."""
    far = max(range(len(ring)), key=lambda k: math.dist(ring[0], ring[k]))
    a = simplify(ring[: far + 1], tol)
    b = simplify(ring[far:] + [ring[0]], tol)
    return a[:-1] + b[:-1]


def campus_outline():
    """CAMPUS from layout.js, so buildings the campus draws itself are skipped."""
    src = (ROOT / "campus" / "js" / "layout.js").read_text()
    m = re.search(r"export const CAMPUS = (\[\[.*?\]\]);", src, re.S)
    return json.loads(re.sub(r"\s+", "", m.group(1)))


def in_world(x, z, pad=0):
    return WORLD["x0"] + pad <= x <= WORLD["x1"] - pad and WORLD["z0"] + pad <= z <= WORLD["z1"] - pad


def chain(ways):
    """Join ways that share end nodes into as few polylines as possible."""
    ways = [list(w) for w in ways]
    out = []
    while ways:
        cur = ways.pop()
        grown = True
        while grown:
            grown = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]:
                    cur += w[1:]
                elif w[-1] == cur[-1]:
                    cur += w[::-1][1:]
                elif w[-1] == cur[0]:
                    cur = w[:-1] + cur
                elif w[0] == cur[0]:
                    cur = w[::-1][:-1] + cur
                else:
                    continue
                ways.pop(i)
                grown = True
                break
        out.append(cur)
    return out


def clip_line(pts, margin=40):
    """Keep the runs of a polyline that come within `margin` of the world."""
    keep = lambda p: in_world(p[0], p[1], -margin)
    runs, cur = [], []
    for i, p in enumerate(pts):
        if keep(p) or (i and keep(pts[i - 1])) or (i + 1 < len(pts) and keep(pts[i + 1])):
            cur.append(p)
        elif cur:
            runs.append(cur)
            cur = []
    if cur:
        runs.append(cur)
    return [r for r in runs if len(r) > 1]


def r1(v):
    return round(v, 1)


def main():
    cache = sys.argv[sys.argv.index("--cache") + 1] if "--cache" in sys.argv else None
    els = fetch(cache)
    school = next(e for e in els if e.get("tags", {}).get("name") == "Wilcox High School" and "building" not in e["tags"])
    grounds = [local(g["lat"], g["lon"]) for g in school["geometry"]]
    campus = campus_outline()

    # ── houses: every building outside the school grounds, wholly inside the world ──
    houses = []
    for e in els:
        t = e.get("tags", {})
        if "building" not in t or t["building"] in ("roof", "carport") or e["type"] != "way":
            continue
        P = [local(g["lat"], g["lon"]) for g in e["geometry"]][:-1]
        if len(P) < 3 or area(P) < 12:
            continue
        cx, cz = sum(p[0] for p in P) / len(P), sum(p[1] for p in P) / len(P)
        if inside(cx, cz, grounds) or inside(cx, cz, campus) or not all(in_world(x, z, 1.5) for x, z in P):
            continue
        ring = simplify_ring(P, 0.25)
        if len(ring) < 3:
            continue
        try:
            levels = max(1, min(6, int(float(t.get("building:levels", "1")))))
        except ValueError:
            levels = 1
        houses.append([levels, [r1(v) for p in ring for v in p]])
    houses.sort(key=lambda h: (h[1][1], h[1][0]))

    # ── streets, joined by name ──
    by_name = {}
    for e in els:
        t = e.get("tags", {})
        if e["type"] != "way" or t.get("highway") not in ROAD_KINDS:
            continue
        key = (t.get("name", ""), t["highway"])
        by_name.setdefault(key, []).append([(g["lat"], g["lon"]) for g in e["geometry"]])
    roads = []
    for (name, kind), ways in sorted(by_name.items()):
        for line in chain(ways):
            pts = [local(a, b) for a, b in line]
            for run in clip_line(pts):
                run = simplify(run, 0.4)
                roads.append({"name": name, "kind": kind, "pts": [[r1(x), r1(z)] for x, z in run]})

    # ── the creek's centre line ──
    creek_ways = [[(g["lat"], g["lon"]) for g in e["geometry"]] for e in els if e.get("tags", {}).get("waterway") == "river"]
    lines = sorted(chain(creek_ways), key=len, reverse=True)
    creek = [local(a, b) for a, b in lines[0]] if lines else []
    if creek and creek[0][1] > creek[-1][1]:
        creek = creek[::-1]                       # run north → south
    creek = [[r1(x), r1(z)] for x, z in simplify(creek, 0.4) if WORLD["z0"] - 60 < z < WORLD["z1"] + 60]

    js = [
        "// GENERATED by tools/osm_campus.py — do not edit; re-run the script instead.",
        "// Map data © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright",
        "// Coordinates are campus metres (origin at the cedar, +x east, +z south).",
        "",
        "// [levels, [x0, z0, x1, z1, ...]] — every building off campus, as OSM traced it.",
        "export const OSM_HOUSES = " + json.dumps(houses, separators=(",", ":")) + ";",
        "",
        "// { name, kind, pts } — OSM highway class in kind.",
        "export const OSM_ROADS = [\n" + ",\n".join("  " + json.dumps(r, separators=(",", ":")) for r in roads) + "\n];",
        "",
        "// Calabazas Creek's centre line, north to south.",
        "export const OSM_CREEK = " + json.dumps(creek, separators=(",", ":")) + ";",
        "",
    ]
    OUT.write_text("\n".join(js))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(houses)} buildings, {len(roads)} road lines, creek {len(creek)} pts")


if __name__ == "__main__":
    main()
