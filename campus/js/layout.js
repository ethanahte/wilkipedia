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
export const BUILDINGS = [
  // Building B: two storeys, the long classroom bar east of the creek.
  { id: 'B', name: 'Building B', style: 'b', h: 9.6, poly: rect(-81.8, -78.5, -54.7, 37.9), floors: 2 },
  { id: 'B-south', name: 'Building B', style: 'plain', h: 4.6, poly: rect(-87.9, 37.9, -54.7, 52.8) },
  { id: 'B-south2', name: 'Building B', style: 'plain', h: 4.6, poly: rect(-87.9, 52.8, -50.5, 68.3) },
  { id: 'LIB', name: 'Library', style: 'library', h: 7.2, poly: rect(-54.7, 37.9, -17.8, 52.8) },
  // Front office: single storey at the north end, the sign wall faces Monroe Street.
  { id: 'ADMIN', name: 'Front office', style: 'admin', h: 4.8, poly: rect(-46.8, -74.3, -26.2, -55.6) },
  { id: 'ADMIN-link', name: 'Front office', style: 'plain', h: 4.4, poly: rect(-54.7, -78.5, -46.8, -62) },
  // Cafeteria: north side of the quad, covered walkway on its quad side.
  { id: 'CAF', name: 'Cafeteria', style: 'caf', h: 7.0, poly: rect(0, -52.8, 50, -30.4) },
  { id: 'CAF-w', name: 'Cafeteria', style: 'caf', h: 4.6, poly: rect(-17.8, -51, 0, -30.4) },
  { id: 'CAF-e', name: 'Cafeteria', style: 'caf', h: 4.6, poly: rect(50, -52.8, 62.6, -30.4) },
  // Classroom Building R: three storeys, solar roof, east side of the quad.
  // (Ethan, his photos IMG_2342–2361, the satellite): a 凸 in plan. The narrow block
  // faces the quad; the back block is 2.1 m wider at each end, stepping out 7.9 m
  // back. Each wide end has its entrance set 0.9 m into the wall beside the step.
  // The thick grey-and-cream blocks along the quad side stand out from this
  // outline (buildings.js buildR). Keep buildings.js's R_ numbers in step.
  { id: 'R', name: 'Classroom Building R', style: 'r', h: 13.6, floors: 3,
    poly: [[33.2, -21.6], [41.1, -21.6], [41.1, -23.75], [43.1, -23.75], [43.1, -22.85], [46.9, -22.85], [46.9, -23.75], [54.7, -23.75],
      [54.7, 27.3], [46.9, 27.3], [46.9, 26.4], [43.1, 26.4], [43.1, 27.3], [41.1, 27.3], [41.1, 25.2], [33.2, 25.2]] },
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
  { r: [-75, -92, -18, -80], rows: 'x', name: 'Visitor parking', front: true },
  { r: [-18, -90, 108, -56], rows: 'x', name: 'Faculty parking' },
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
export const CEDAR = { x: 0, z: 0, bed: 4.2 };
// In front of Building R on the quad side (IMG_2349–2352): planting beds along its
// base, two big leafy trees, black mesh benches along the beds, a few tables.
export const R_FRONT = {
  // beds as [x0, z0, x1, z1]: in the window bays between the thick blocks, and a
  // strip in front of some of the blocks (the blocks stand out to x 31.6)
  beds: [[30.4, -16.8, 33.2, -9.9], [30.4, -6.7, 33.2, 0.2], [30.4, 3.4, 33.2, 10.3],
    [30.4, -19.0, 31.6, -16.8], [30.4, -9.9, 31.6, -6.7], [30.4, 0.2, 31.6, 3.4]],
  trees: [[28.6, -3.2], [28.6, 6.9]],
  benches: [-12.4, -4.6, 1.8, 7.8],                              // z, facing the quad
  tables: [[27.0, -15.5], [26.8, 11.4]],
  picnic: [[27.2, -8.8, 0]],
  pots: [[32.6, 15.2], [32.6, 18.6]],                            // the white planters by the ASB Office door
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
  [-29.5, -17.5], [-28.8, -9.4], [-27.6, -19.6], [-23.7, -20.2], [-23.7, -17.3], [-17.3, -17.1], [-11.9, 28.8],
  [-11.2, -17.6], [-5.0, -18.9], [-4.7, -21.9], [0.7, -21.0], [2.4, -18.8], [3.7, -21.7], [6.5, -15.0], [8.1, 32.4],
  [9.9, -16.8], [13.3, -17.8], [15.3, 30.9], [16.5, -20.3], [20.9, -16.2], [26.9, -22.1], [27.3, 25.2],
  // the ring of umbrella tables just south of the cedar
  [-0.4, 8.6], [7.6, 8.6], [11.4, 8.3], [15, 8.8], [19, 8.4]];
export const LAWN_TREES = [[2, 20], [9, 16.5], [15, 23.5], [4.5, 27], [-30, 25], [-26, 29.5]];
export const LAMPS = [[-12, 1.3], [-27, 11.5], [-2, -13], [22, -8], [-38, -18], [26, 20], [-4, 30.8], [-30.5, 32], [-18.3, 3.3], [30, -24], [3.3, -3.6]];   // [-18.3, 3.3]: the one with the flag, due north of the stage (IMG_2324, satellite); [3.3, -3.6]: at the cedar's bed (IMG_2335)
export const PICNIC = [[-31, 21, 0.3], [-34.5, 17.6, 0.3], [20, 30, -0.2], [26.5, 14, 1.3], [-8, -6, 0], [-26, 4, 1.57]];
export const PICNIC_COLOR = [[-20.5, -3.5, 0.2]];     // red top, yellow and blue benches

// Front of the school: the sign wall, planter, palms and flag.
export const FRONT = {
  wallZ: -74.3,
  sign: { x: -40.2, y: 2.3, w: 10.5 },
  planter: { x0: -47.6, x1: -32.6, z0: -78.1, z1: -75.4, h: 0.6 },
  palms: [[-35.6, -76.8, 15.5], [-37.9, -76.2, 14.2], [-40.2, -77.0, 16.2]],
  flag: [-23.8, -78.8],
  entry: { x0: -32, x1: -26.2 },
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
