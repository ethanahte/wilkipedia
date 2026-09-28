// Where everything is. Metres; origin = the trunk of the big cedar in the quad;
// +x east, +z SOUTH (three.js looks down -z, so north is -z).
//
// Measured off the Apple Maps satellite view at 0.4675 m per screen pixel
// (250 ft scale bar = 163 px), then checked against the official campus map for
// which building is which and how its rooms are arranged. A few footprints are
// simplified to rectangles; heights come from the photos (one storey ≈ 4.3 m).
// If something here disagrees with the real campus, fix the number here: every
// wall, collider, minimap shape and room label is generated from this file.

import { OSM_ROADS } from './osm.js';

export const K = 0.4675;   // metres per satellite pixel (kept for re-measuring)

// ── buildings ──
// style: which facade kit to use (buildings.js). h: parapet height.
// The teachers' yard beside the cafeteria (see YARD-* below): the quad-side wall at zs from x0
// to the cafeteria's west wall, the parking-lot side at zn, the slanted side at 75°. Ethan: the
// quad-side wall is in line with the snack bar (it stands behind B's canopy posts, under the
// canopy's north wing), and the yard is 12.5 m deep.
export const YARD = (() => {
  const zs = -32.4, zn = -44.9, x0 = -28.8;
  return { zs, zn, x0, xn: x0 + (zs - zn) / Math.tan((75 * Math.PI) / 180) };
})();
// A straight wall of thickness t from (ax, az) to (bx, bz), standing on its left side (seen from a to b)
function wallPoly(ax, az, bx, bz, t) {
  const L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L * t, nz = (bx - ax) / L * t;
  return [[ax, az], [bx, bz], [bx + nx, bz + nz], [ax + nx, az + nz]];
}

export const BUILDINGS = [
  // Building B: two storeys, the long classroom bar east of the creek.
  { id: 'B', name: 'Building B', style: 'b', h: 9.6, poly: rect(-81.8, -78.5, -54.7, 37.9), floors: 2 },
  { id: 'B-south', name: 'Building B', style: 'plain', h: 4.6, poly: rect(-87.9, 37.9, -54.7, 52.8) },
  { id: 'B-south2', name: 'Building B', style: 'plain', h: 4.6, poly: rect(-87.9, 52.8, -50.5, 68.3) },
  { id: 'LIB', name: 'Library', style: 'library', h: 7.2, poly: rect(-54.7, 37.9, -17.8, 52.8) },
  // the plain block between B and the library, standing out from B's quad face; the library's
  // entrance canopy hangs off its east face (the satellite; IMG_2380, IMG_2381, IMG_2382)
  { id: 'LIB-block', name: 'Library', style: 'libblock', h: 6.6, poly: rect(-54.7, 24.6, -51.4, 37.9) },
  // Front office: single storey at the north end, the sign wall faces Monroe Street.
  // One rectangle from B's wall to the east end (Ethan: the office and the part joining B are one
  // building). Its quad-side face is at -57.4 (Ethan: narrower; the Apple Maps view), with the
  // covered walk in front of it (COURT.porch) running all the way to B.
  // Ethan: not as long as first drawn; its east end (toward the flagpole) is at x -30.2, where its
  // entrance is (IMG_2400). The half toward the flag is narrower: its courtyard wall steps back 1.6 m
  // at x -41 (IMG_2395/2396/2397).
  { id: 'ADMIN', name: 'Front office', style: 'admin', h: 4.8,
    poly: [[-54.7, -74.3], [-30.2, -74.3], [-30.2, -59.0], [-41.0, -59.0], [-41.0, -57.4], [-54.7, -57.4]] },
  // Cafeteria: north side of the quad, covered walkway on its quad side. The tall
  // dining hall stands 2.4 m back behind a one-storey front that holds the glass
  // storefront (Ethan's photos IMG_2362–2371, the satellite); buildings.js cafFront().
  { id: 'CAF', name: 'Cafeteria', style: 'caf', h: 7.2, poly: rect(0, -52.8, 50, -32.8) },
  { id: 'CAF-front', name: 'Cafeteria', style: 'caf', h: 3.8, poly: rect(0, -32.8, 50, -30.4) },
  // The west wing's quad face (IMG_2367/2368/2371/2391, Ethan): the snack bar is a shallow room
  // whose glass front is set 2.0 m back (Ethan: 2.5 times the first 0.8 m), from x -15.6 to -4.95.
  // Between it and the yard wall a wide door sits in a niche set back further (x -17.8 to -15.6);
  // it opens into the yard, and the building behind the snack bar is narrower (Ethan): its west
  // wall, at x -15.6, is the yard's right-angle side, on your right as you go through the door.
  // It reaches back to z -52.8 (the Apple Maps view). buildings.js cafFront() and landmarks.js
  // (the walkway over the recess) must match.
  { id: 'CAF-w', name: 'Cafeteria', style: 'caf', h: 4.6,
    poly: [[-15.6, -52.8], [0, -52.8], [0, -30.4], [-4.95, -30.4], [-4.95, -32.4], [-15.6, -32.4]] },
  // The teachers' yard west of the snack bar (Ethan, IMG_2391): a right-angle trapezoid walled on
  // every side. The long side is the wall on the quad side, in line with the snack bar's glass;
  // the right-angle side is the cafeteria's west wall (x -15.6); the short side faces the parking
  // lot; the slanted side makes 75° with the long side (12.5 m deep).
  { id: 'YARD-s', name: 'Teachers’ yard', style: 'yard', h: 3.0, poly: rect(YARD.x0, YARD.zs - 0.25, -17.8, YARD.zs) },
  { id: 'YARD-n', name: 'Teachers’ yard', style: 'yard', h: 3.0, poly: rect(YARD.xn, YARD.zn, -15.6, YARD.zn + 0.25) },
  { id: 'YARD-w', name: 'Teachers’ yard', style: 'yard', h: 3.0, poly: wallPoly(YARD.x0, YARD.zs, YARD.xn, YARD.zn, 0.25) },
  { id: 'YARD-nook', name: 'Teachers’ yard', style: 'yard', h: 3.5, poly: rect(-18.05, -33.65, -17.8, YARD.zs - 0.25) },
  { id: 'YARD-door', name: 'Teachers’ yard', style: 'yard', h: 3.5, poly: rect(-17.8, -33.65, -15.6, -33.4) },   // the wide door's wall
  // B's entry block at the west end of its canopy (Ethan; photos IMG_2372/2374/2387/2390/2392/2394;
  // footprint off the Apple Maps view): as tall as the rest of B. Its east face (toward the V roof)
  // sits inside a frame that stands 0.5 m proud: a pier at each end (z -26.5..-27.3, -35.0..-35.8)
  // and a band across the top. The entrance is set 0.6 m further in, full height, from z -32.2 up
  // to the north pier. buildings.js bEntry() draws the rest.
  { id: 'B-entry', name: 'Building B', style: 'bentry', h: 9.6,
    poly: [[-54.7, -35.8], [-47.7, -35.8], [-47.7, -35.0], [-48.8, -35.0], [-48.8, -32.2], [-48.2, -32.2], [-48.2, -27.3], [-47.7, -27.3], [-47.7, -26.5], [-54.7, -26.5]] },
  { id: 'CAF-e', name: 'Cafeteria', style: 'caf', h: 4.6, poly: rect(50, -52.8, 62.6, -30.4) },
  // Classroom Building R: three storeys, solar roof, east side of the quad.
  // (Ethan, his photos IMG_2342–2361, the satellite): a 凸 in plan. The narrow block
  // faces the quad; the back block is 2.1 m wider at each end, stepping out 7.9 m
  // back. Each wide end has its entrance set 0.9 m into the wall beside the step.
  // The thick grey-and-cream blocks along the quad side stand out from this
  // outline (buildings.js buildR). Keep buildings.js's R_ numbers in step.
  { id: 'R', name: 'Classroom Building R', style: 'r', h: 13.6, floors: 3,
    poly: [[33.2, -21.6], [41.1, -21.6], [41.1, -23.75], [43.1, -23.75], [43.1, -22.85], [46.2, -22.85], [46.2, -23.75], [54.7, -23.75],
      [54.7, 27.3], [46.2, 27.3], [46.2, 26.4], [43.1, 26.4], [43.1, 27.3], [41.1, 27.3], [41.1, 25.2], [33.2, 25.2]] },
  // The P building (P100–P107): two rows of portable classrooms facing each other
  // across an open courtyard. Drawn by portables.js from photos, not by the kits here.
  { id: 'P-w', name: 'P building', style: 'portable', h: 3.6, poly: rect(-6.7, 41.1, 2.3, 70.3) },
  { id: 'P-e', name: 'P building', style: 'portable', h: 3.6, poly: rect(14, 41.1, 23, 70.3) },
  { id: 'AUXGYM', name: 'Small gym (Auxiliary Gym)', style: 'gym', h: 9, poly: rect(44.4, 36, 79.5, 61.2) },
  // Gym complex
  { id: 'GYM-n', name: 'Wrestling, weight and locker rooms', style: 'gym', h: 5.5, poly: rect(74.8, -47.7, 115.4, -31.4) },
  // the low bar in front of the main gym: boys' locker room (west half), lobby (east half)
  { id: 'GYM-boys', name: 'Boys’ locker room', style: 'gym', h: 5.5, poly: rect(74.8, -31.4, 102.9, -20.6) },
  { id: 'GYM-lobby', name: 'Main Gym lobby', style: 'gymlobby', h: 5.5, poly: rect(102.9, -31.4, 132.3, -20.6) },
  { id: 'MAINGYM', name: 'Main Gym', style: 'gym', h: 10.5, poly: rect(102.9, -20.6, 133.2, 16.8) },
  { id: 'GYM-girls', name: 'Girls’ locker room', style: 'gym', h: 5.2, poly: rect(88.8, 16.8, 113.9, 43.5) },
  { id: 'GYM-dance', name: 'Dance room', style: 'gym', h: 5.2, poly: rect(113.9, 16.8, 138.9, 43.5) },
  // East clusters
  { id: 'P108', name: 'P108–P110', style: 'p', h: 4, poly: rect(168.3, -40.7, 188.4, -25.2) },
  { id: 'P115', name: 'P115 Wellness Center and P116 Maker Space', style: 'p', h: 4.2, poly: rect(149.6, -17.3, 165, 13.6) },
  { id: 'P111', name: 'P111–P113', style: 'p', h: 4.2, poly: rect(170.6, -17.3, 188.4, 13.6) },
  { id: 'UTIL', name: '', style: 'plain', h: 3.6, poly: rect(191.7, -22, 205.7, -3.3) },
  { id: 'P117', name: 'P117–P118', style: 'p', h: 4, poly: rect(155.7, 20.6, 174.4, 38.8) },
  { id: 'P119', name: 'P119–P120', style: 'p', h: 4, poly: rect(174.4, 20.6, 193.1, 38.8) },
  // West of the creek
  // Theatre (Mission City Center for Performing Arts): outline from OpenStreetMap,
  // split into masses off the satellite view — the glass lobby on the Monroe
  // side, a wing angled along Calabazas, the metal-roofed house, the white fly
  // tower (three smoke hatches on its roof), and the low stage/shop blocks.
  { id: 'T-lobby', name: 'Mission City Center for Performing Arts', style: 'theatre-lobby', h: 7.5, poly: rect(-177, -50.2, -157.5, -36) },
  { id: 'T-nw', name: 'Theatre', style: 'theatre', h: 8, poly: [[-189.1, -49.6], [-177, -50.2], [-177, -31], [-181.5, -28]] },
  { id: 'T-wing', name: 'Theatre', style: 'theatre', h: 7, poly: [[-181.5, -28], [-170, -31.5], [-163.5, -11.6], [-176.1, -7.3]] },
  { id: 'T-svc', name: 'Theatre', style: 'plain', h: 6, poly: rect(-177, -36, -157.5, -27) },
  { id: 'T-svc2', name: 'Theatre', style: 'theatre', h: 6, poly: [[-170, -27], [-161, -27], [-161, -16.4], [-165.2, -16.4]] },
  { id: 'T-house', name: 'Theatre', style: 'theatre', h: 10, poly: rect(-157.5, -50.2, -133, -27), gable: 3.4 },
  { id: 'T-fly', name: 'Theatre stage house', style: 'theatre', h: 20, poly: rect(-161, -27, -131, -16.4) },
  { id: 'T-back', name: 'Theatre', style: 'theatre', h: 7, poly: rect(-161, -16.4, -131, -7.4) },
  { id: 'T-east', name: 'Theatre', style: 'theatre', h: 8, poly: rect(-133, -36.7, -121.2, -7.4) },
  { id: 'N', name: 'N building', style: 'mn', h: 4.2, poly: [[-153, 16.8], [-118, 16.8], [-118, 37], [-159, 37], [-159, 24]] },
  { id: 'M100', name: 'M building', style: 'mn', h: 4.4, poly: rect(-147.7, 45, -117, 57.4) },
  { id: 'M', name: 'M building', style: 'mn', h: 4.2, poly: rect(-131.8, 57.4, -117, 109.5) },
  { id: 'M-bump', name: 'M building', style: 'plain', h: 3.6, poly: rect(-137, 79.4, -131.8, 87.8) },
  // Science
  { id: 'S-top', name: 'Science building', style: 's', h: 5.2, poly: rect(-70, 87, -28, 96.3), barrel: 'x' },
  { id: 'S-west', name: 'Science building', style: 's', h: 5.2, poly: rect(-84, 87, -65.5, 133.7), barrel: 'z' },
  { id: 'S-mid', name: 'Science building', style: 's', h: 5.2, poly: rect(-65.5, 96.3, -28, 115), barrel: 'x' },
  { id: 'S-inner', name: 'Science building', style: 's', h: 5.2, poly: rect(-60, 115, -48, 133.7), barrel: 'z' },
  { id: 'S-lecture', name: 'Lecture Hall', style: 's', h: 7, poly: [[-28, 83.7], [-16, 83.7], [-11.5, 90], [-9.4, 101], [-11.5, 112], [-16, 118.3], [-28, 118.3]] },
];

// ── ground ──
// The creek runs due south past campus, goes underground at the Georgetown
// Place corner (culvert: z range), and comes out bending south-east between
// Calabazas Boulevard's two carriageways (course from OpenStreetMap, checked
// on the satellite view). x is the straight reach.
// South of the culvert the channel is a narrow one (south: its size there).
export const CREEK = {
  x: -102.9, top: 8, bottom: 2.6, depth: 3.1, culvert: [175, 231],
  south: { top: 4, bottom: 1.4, depth: 2.4 },
  pts: [[-102.9, -400], [-102.9, 238], [-74.3, 313.7], [-40, 400]],
};
// The channel's size at z (the north reach's north of the culvert, else the south's).
export const creekAt = (z) => (z < CREEK.culvert[0] ? CREEK : CREEK.south);
export const BRIDGES = [{ z: -55.6, w: 4 }, { z: 54, w: 4 }];

// Streets are OpenStreetMap's centre lines (osm.js, made by tools/osm_campus.py).
// w: curb-to-curb width in metres; center: paint a yellow centre line.
const osmRoad = (name) => OSM_ROADS.filter((r) => r.name === name).map((r) => r.pts);
const longest = (lines) => lines.reduce((a, b) => (b.length > a.length ? b : a), []);
// Monroe runs westward and Calabazas southward, so the campus is always on the
// same side (left of travel: negative offsets in geo.js offsetLine).
const orient = (pts, key) => (key(pts[0]) > key(pts[pts.length - 1]) ? pts : pts.slice().reverse());
export const MONROE_PTS = orient(longest(osmRoad('Monroe Street')), (p) => p[0]);
export const CALABAZAS_PTS = orient(longest(osmRoad('Calabazas Boulevard')), (p) => -p[1]);
export const SANJUAN_PTS = longest(osmRoad('San Juan Avenue'));
export const ROADS = OSM_ROADS.map((r) => ({
  name: r.name, pts: r.pts,
  // Calabazas splits into two one-way carriageways south of the school; the
  // shorter OSM line is the east one
  w: r.kind === 'secondary' ? 18 : r.kind === 'tertiary' ? (r.pts === longest(osmRoad(r.name)) ? 15 : 9) : 10,
  center: r.kind === 'secondary' || (r.kind === 'tertiary' && r.pts === longest(osmRoad(r.name))),
}));

// Asphalt lots: rect + which way the stall rows run ('x' = rows along x).
export const LOTS = [
  // the faculty lot stops short of the flagpole: its bed has a sidewalk round it, then a yellow curb
  // along the drive (Ethan, his photo of the front); the front drive runs on to meet it
  { r: [-75, -92, -11, -80], rows: 'x', name: 'Visitor parking', front: true },
  { r: [-11, -90, 108, -57.5], rows: 'x', name: 'Faculty parking' },
  { r: [112, -66, 190, -49], rows: 'x', name: 'Student parking' },
  { r: [-192, -92, -112, -56], rows: 'x', name: 'Student parking' },
  { r: [-159, -6.5, -112, 15.5], rows: 'x', name: 'Faculty parking' },
  { r: [30, 62, 196, 84], rows: 'x', name: 'Parking' },
  { r: [80, 44, 150, 62], rows: 'x', name: 'Parking' },
];
export const CARPORTS = [rect(-1.4, -81.8, 62.6, -67.8), rect(70, -81.8, 107.5, -67.8)];

// The quad, in detail.
export const QUAD = { x0: -46, z0: -30, x1: 36, z1: 38 };
// r: the platform, to the outside of its low wall; ring: the east ramp's outer
// edge; lip: the low wall along the ramp; plant: the planting's outer edge;
// walk: the paving round it all (Ethan, IMG_2324–2331)
export const STAGE = { x: -17.3, z: 14, r: 8.8, ring: 10.6, lip: 10.95, plant: 13.0, walk: 15.2, h: 0.5 };   // r and plant re-measured off the satellite
export const LAWN_W = { box: [-37.5, 17.5, -22, 32.3] };             // minus the walk ring round the stage
export const LAWN_E = [[-3.3, 14.5], [15.9, 11.2], [23.4, 23.8], [-11.2, 32.3]];
// Both lawns are mounded, highest in the middle and level with the walks at their edges (Ethan;
// IMG_2338): the one by the library a little, the one in front of R more. Metres above the paving.
export function lawnHeight(x, z) {
  const [a, b, c, d] = LAWN_W.box;
  if (x > a && x < c && z > b && z < d) {
    const r = Math.hypot(x - STAGE.x, z - STAGE.z) - STAGE.walk;
    if (r > 0) return mound(Math.min(x - a, c - x, z - b, d - z, r), 0.45, 4.5);
  }
  if (inside(LAWN_E, x, z)) return mound(edgeDist(LAWN_E, x, z), 1.0, 6.5);
  return 0;
}
const mound = (d, H, D) => { const t = Math.min(1, d / D); return H * t * t * (3 - 2 * t); };
function inside(P, x, z) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[i], [bx, bz] = P[j];
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) c = !c;
  }
  return c;
}
function edgeDist(P, x, z) {
  let m = Infinity;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length], dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    m = Math.min(m, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return m;
}
export const CEDAR = { x: 0, z: 0, bed: 4.2 };
// In front of Building R on the quad side (Ethan; IMG_2349–2352, the satellite): a
// bed shaped like a Toblerone bar seen from the side. A straight strip runs along
// the building with a paved walk between (its back at x 30.1; the blocks stand at
// 31.6), and identical, symmetric triangles stand side by side on its front,
// pointing at the quad. Umbrella tables sit in the notches between the triangles;
// the two benches back onto the last triangle's south slanted edge, by the ASB Office.
export const R_FRONT = {
  back: 30.1, front: 27.5, z0: -18.6, z1: 13.2, teeth: 3, tip: 23.8,
  trees: [[28.6, -2.7], [28.6, 7.9]],                                                    // the two big trees (IMG_2350)
  tables: [[26.0, -19.9], [23.6, -16.6], [24.3, -8.0], [24.3, 2.6]],
  longTable: [22.2, -2.7, Math.PI / 2, 2.8],                                              // x, z, rot, length: the one long green table
  cans: [[22.6, -9.4], [22.8, 4.0], [28.6, -19.9]],
  benches: [1.6, 3.9],                                                                   // metres along the last triangle's south edge from its tip
  pots: [[32.55, 15.6, 'white'], [32.55, 17.8, 'white'], [32.6, 19.7, 'clay']],          // IMG_2342
};
// Round the cedar (Ethan's photos IMG_2332–2335): a light-blue and a green picnic
// table at the bed's west edge with grey cans beside them, and black mesh tables
// with chairs under umbrellas round the rest, under the edge of the crown.
export const CEDAR_PICNIC = [[-5.4, -1.3, Math.PI / 2, 'blue'], [-5.0, 2.5, Math.PI / 2, 'green']];
export const CEDAR_CANS = [[-5.9, 0.6], [-4.3, 4.4]];
export const CEDAR_TABLES = [[6.3, -1.4], [6.6, 2.7], [2.6, -6.6], [-2.4, -6.9], [11.9, 3.0]];
export const CEDAR_TREES = [[3.6, 8.4], [14.0, 5.9], [11.0, -1.2]];   // young trees the satellite shows east and south of it

// Dark spots on the plaza in the satellite view: young trees in mulch beds and
// umbrella tables. Pulled out of the image automatically, then thinned by hand.
export const QUAD_SPOTS = [[-39.8, -23.1], [-39.2, 25.2], [-38.6, -13.9], [-36.9, -2.1], [-36.6, -11.9], [-36.1, 3.2],
  [-35.4, -5.4], [-35.3, -20.9], [-33.9, -1.2], [-33.7, 12.8], [-32.5, -14.9], [-32.1, -8.2], [-31.7, -11.4], [-30.2, 14.5],
  [-29.5, -17.5], [-28.8, -9.4], [-27.6, -19.6], [-23.7, -20.2], [-23.7, -17.3], [-17.3, -17.1], [-7.9, 27.4],   // (that tree stood in the walk between the stage and the lawn: Ethan)
  [-11.2, -17.6], [-5.0, -18.9], [-4.7, -21.9], [0.7, -21.0], [2.4, -18.8], [3.7, -21.7], [6.5, -15.0], [8.1, 32.4],
  [9.9, -16.8], [13.3, -17.8], [15.3, 30.9], [16.5, -20.3], [20.9, -16.2], [26.9, -22.1], [27.3, 25.2],
  // the ring of umbrella tables just south of the cedar
  [-0.4, 8.6], [7.6, 8.6], [11.4, 8.3], [15, 8.8], [19, 8.4]];
export const LAWN_TREES = [[2, 20], [9, 16.5], [15, 23.5], [4.5, 27], [-30, 25], [-26, 29.5]];
export const LAMPS = [[-12, 1.3], [-27, 11.5], [-2, -13], [22, -8], [-38, -18], [26, 20], [-4, 30.8], [-30.5, 32], [-18.3, 3.3], [30, -24], [3.3, -3.6]];   // [-18.3, 3.3]: the one with the flag, due north of the stage (IMG_2324, satellite); [3.3, -3.6]: at the cedar's bed (IMG_2335)
// (no table stands on a lawn or at a lamp: Ethan)
export const PICNIC = [[20, 30, -0.2], [-8, -6, 0], [-26, 4, 1.57]];
// two long green tables with benches right against the library's quad wall, one by its entrance
// and one at the far (east) end (Ethan)
export const PICNIC_LIB = [[-40.2, 36.8, 0], [-20.4, 36.8, 0]];
export const PICNIC_COLOR = [[-20.5, -3.5, 0.2]];     // red top, yellow and blue benches

// Front of the school: the sign wall, planter, palms and flag.
// The courtyard between the front office and B's canopy (Apple Maps view, September 2026): a
// raised zig-zag planter, a big shade tree by B with a small reddish one north of it and a small
// orange one east of it, an umbrella table, and the covered walk along the office's south face,
// which runs all the way to B (Ethan).
export const COURT = {
  planter: [[-29.2, -52.8], [-33.7, -52.8], [-36.9, -49.6], [-33.7, -43.9], [-36.9, -40.4], [-33.4, -37.8], [-29.4, -43.5]],
  // the umbrella table sits by the B-side bed, clear of the way through (Ethan)
  // (the red and small trees and the maple stand clear of B's wall, the block, the walk's roof and
  // the umbrella, so no leaves cut through them)
  bigTree: [-49.2, -43.9], redTree: [-50.8, -50.8], smallTree: [-46.0, -41.4], table: [-42.8, -44.3],
  porch: { x0: -54.7, x1: -22.0, z0: -57.4, z1: -53.0 },          // from B's wall, past the office, over the gate (IMG_2396/2399)
  // the bed under the big trees north of B's entry block: ferns and feather grass, with a small
  // maple by the block (IMG_2392, IMG_2394)
  bed: [[-54.7, -36.0], [-46.5, -36.0], [-44.2, -39.5], [-44.2, -47.5], [-47.0, -52.5], [-54.7, -52.5]],
  maple: [-50.8, -39.6],
  // the office's courtyard side, behind the covered walk (IMG_2395/2396/2397), by x; the doors and
  // box are on the wider west half, the filler and the WHS entrance on the set-back east half
  yellowDoors: [-49.5, -43.5], box: -41.8, filler: -39.6, entry: [-37.2, -31.2],
  // the two benches stand along the bed's slanting edge north of the table, backs to the bed,
  // short of the covered walk (Ethan, IMG_2395): [x, z, rot]
  benches: [[-44.3, -49.1, -2.63], [-45.4, -51.1, -2.63]],
  // the black steel fence, an L (Ethan): south from the office's courtyard wall, just east of the
  // WHS entrance, through the zig-zag flower bed, then east in line with the teachers' yard's short
  // side to meet it. A pedestrian gate by the office, a double gate in the east leg (IMG_2396/2398/2399).
  // Where it meets the office a cream wall stands out from the office's corner first, up to the
  // walk's roof, and the fence and its gate start where that ends (Ethan, IMG_2396).
  // the scooter/bike rack stands right by the flower bed on the passage side of the fence (Ethan)
  fence: [[-31.0, -57.0], [-31.0, YARD.zn], [YARD.xn, YARD.zn]], bikeRack: [-28.4, -50.4],
  gateWall: { x0: -31.2, x1: -30.2, z0: -59.0, z1: -57.0, h: 3.2 },
  step: { x: -41.0, z: -59.0 },      // where the office's courtyard wall steps back (layout ADMIN)
};
// The flower bed on the quad side of B's entry block, along B's wall (Apple Maps view for its shape;
// IMG_2372, IMG_2374, IMG_2387 for what's in it): a wedge, widest against the block, narrowing south.
// A strip of paving runs between it and B. Ceramic totem poles stand in its north end.
export const B_BED = {
  // its quad edge has two points and a notch between (Ethan, the satellite): the point by the
  // block and the canopy is the bigger; then the notch, a smaller point, and the tip
  poly: [[-53.8, -26.5], [-45.5, -26.5], [-50.8, -17.0], [-48.6, -13.2], [-53.9, -4.3]],
  totems: [[-53.0, -26.1], [-51.6, -25.3], [-50.2, -26.0], [-48.8, -25.2], [-47.3, -26.2], [-52.4, -23.4], [-50.1, -22.7], [-48.5, -23.8]],
};

// B's quad side south of the entry block's bed, to the library (IMG_2376–2386, the satellite):
// paving right up to B, then a bed along B with two crape myrtles, flax, grasses and yellow
// daisies, and one east of the library's block, north of its canopy, with a crape myrtle and
// grasses. Two benches stand along the entry block's bed, facing it (IMG_2386): [x, z, rot].
export const B_QUAD = {
  beds: [
    { poly: [[-54.7, 11.9], [-51.3, 11.9], [-51.3, 17.0], [-48.6, 19.9], [-51.2, 22.8], [-54.7, 22.8]], trees: [[-51.8, 14.2], [-50.6, 19.9]] },
    { poly: [[-50.4, 25.6], [-46.3, 29.2], [-46.3, 32.9], [-50.4, 32.9]], trees: [[-48.2, 30.0]] },
  ],
  benches: [[-49.24, -10.57, -0.538], [-50.83, -7.89, -0.538]],
  table: [-51.4, 6.4],             // an umbrella table south of (left of) B's quad-side doors (Ethan, IMG_2377)
};

export const FRONT = {
  wallZ: -74.3,
  // The school's name faces north, across the office's north-east corner: on its north face and
  // the free-standing wall that carries that face on east (Ethan's photo of the front)
  sign: { x: -30.6, y: 2.3, w: 9.0 },
  // The front, as in Ethan's photo of it from the parking lot and IMG_2400/2401/2403/2404: the
  // entrance is on the office's EAST face, facing the flagpole, recessed under a deep overhang that
  // runs the whole face (entry, from z0 north to z1 south). A free-standing wall runs EAST from
  // the office's north-east corner (screenWall, flush with the north face) and closes the entrance
  // court on the north.
  entry: { x: -30.2, z0: -74.3, z1: -57.4, depth: 4.0 },
  screenWall: { x1: -22.0, z0: -74.3, z1: -74.0, h: 3.4 },
  // ONE raised concrete bed wraps round that wall (Ethan): a south leg along it (x0 is its west
  // end, clear of the north door), a big rounded east end past the wall's end (centred on cx), and
  // a north leg along the wall and the office's north face to xw; zs and zn are its south and north
  // edges (IMG_2401, the satellite view).
  bed: { x0: -28.8, xw: -36.0, zs: -71.3, zn: -77.7, cx: -21.8, h: 0.55 },
  // the three palms, where IMG_2401 puts them: one in the south leg by the overhang, one at the
  // wall's east end, one in the round end north of the wall's line
  palms: [[-25.8, -73.0, 11.8], [-22.1, -72.6, 9.6], [-20.2, -76.3, 10.5]],
  flag: [-18.4, -61.7],
  flagBed: { r: 4.3, inner: 2.9 },
  ada: [-48.2, -79.3],
};

// Athletics
export const TRACK = { x: 239.6, z: 87, r: 36.5, straight: 84.39, lanes: 6 };
export const FIELDS = {
  soccer: rect(70, 86, 182, 147.7),
  practice: rect(65.5, 147.7, 177.7, 199.2),
  softball: { home: [1.5, 93], dir: Math.PI / 4, fence: 64 },
  baseball: { home: [-46.8, 206], dir: 0.12, fence: 110 },
  tennis: { x: 326, z: 112, w: 34, l: 70, rot: -0.55 },
  homeStands: rect(185.5, 47, 196, 124.4),
  awayStands: rect(284.5, 54, 295, 120),
  pool: { deck: rect(62, -15, 95, 15), water: rect(66.5, -10, 89.4, 10) },
};

// Everything inside this outline is campus; houses fill the rest of the world.
// OpenStreetMap's school grounds, plus the theatre corner west of the creek.
export const CAMPUS = [[-219, -96], [39.4, -95.8], [60.3, -94.5], [100.8, -88.6], [114.2, -85.5], [185.6, -61.2],
  [192.7, -57.4], [213.1, -46.3], [237.3, -31], [305.9, 27.9], [340.6, 76.2], [367.6, 131.3], [-54.2, 305.2], [-173.1, 17.6]];
// The model's base: the campus plus a ring of the neighbourhood, like a diorama.
export const WORLD = { x0: -215, z0: -150, x1: 365, z1: 305 };

// Official-map room boxes → world, one transform per building (floor). The
// campus map is not to scale (floors are drawn side by side as insets), so each
// building gets its own box-to-box mapping. [map box] → [world box].
export const ROOM_XFORM = {
  'B1': { map: [500, 94, 761, 669], world: [-87.9, -78.5, -17.8, 68.3] },
  'B2': { map: [372, 116, 466, 570], world: [-81.8, -78.5, -54.7, 37.9] },
  'R1': { map: [1349, 724, 1425, 852], world: [33.2, -22.9, 54.7, 25.2] },
  'R2': { map: [1244, 724, 1320, 852], world: [33.2, -22.9, 54.7, 25.2] },
  'R3': { map: [1140, 723, 1216, 852], world: [33.2, -22.9, 54.7, 25.2] },
  'S1': { map: [483, 745, 749, 955], world: [-84, 83.7, -9.4, 133.7] },
  'M1': { map: [184, 571, 286, 788], world: [-147.7, 45, -117, 109.5] },
  'N1': { map: [135, 476, 277, 541], world: [-159, 16.8, -118, 37] },
  'C1': { map: [777, 208, 1070, 287], world: [-17.8, -52.8, 62.6, -30.4] },
};
// P rooms sit in four separate clusters, so each cluster has its own box.
export const P_XFORM = [
  { ids: ['P100', 'P101', 'P102', 'P103', 'P104', 'P105', 'P106', 'P107'], map: [808, 550, 940, 715], world: [-6.7, 41.1, 23, 70.3] },
  { ids: ['P108', 'P109', 'P110'], map: [1420, 262, 1515, 312], world: [168.3, -40.7, 188.4, -25.2] },
  { ids: ['P116', 'P115'], map: [1385, 352, 1440, 462], world: [149.6, -17.3, 165, 13.6] },
  { ids: ['P111', 'P112', 'P113'], map: [1463, 352, 1515, 472], world: [170.6, -17.3, 188.4, 13.6] },
  { ids: ['P117', 'P118', 'P119', 'P120'], map: [1390, 527, 1515, 587], world: [155.7, 20.6, 193.1, 38.8] },
];
// Places that are a whole building, not a box on the plan.
export const PLACES = {
  POOL: [77.9, 0], MAINGYM: [118, -1.9], AUXGYM: [62, 48.6], WRESTLING: [88, -39.5], WEIGHT: [104, -39.5],
  BOYSLOCKER: [95, -26], GIRLSLOCKER: [104, 30], DANCE: [130, 30], THEATRE: [-167, -52], 'BLDG-R': [44, 1.1],
};

export function rect(x0, z0, x1, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
