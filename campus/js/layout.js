// Where everything is. Metres; origin = the trunk of the big cedar in the quad;
// +x east, +z SOUTH (three.js looks down -z, so north is -z).
//
// Measured off the Apple Maps satellite view at 0.4675 m per screen pixel
// (250 ft scale bar = 163 px), then checked against the official campus map for
// which building is which and how its rooms are arranged. A few footprints are
// simplified to rectangles; heights come from the photos (one storey ≈ 4.3 m).
// If something here disagrees with the real campus, fix the number here: every
// wall, collider, minimap shape and room label is generated from this file.

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
  { id: 'R', name: 'Classroom Building R', style: 'r', h: 13.6, poly: rect(33.2, -22.9, 54.7, 25.2), floors: 3 },
  // The P building: two wings of classrooms with a covered corridor between them.
  { id: 'P-w', name: 'P building', style: 'p', h: 4.2, poly: rect(-11.7, 41.1, 2.3, 77.6) },
  { id: 'P-e', name: 'P building', style: 'p', h: 4.2, poly: rect(14, 41.1, 28, 77.6) },
  { id: 'AUXGYM', name: 'Auxiliary Gym', style: 'gym', h: 9, poly: rect(44.4, 36, 79.5, 61.2) },
  // Gym complex
  { id: 'GYM-n', name: 'Wrestling, weight and locker rooms', style: 'gym', h: 5.5, poly: rect(74.8, -47.7, 115.4, -31.4) },
  { id: 'GYM-lobby', name: 'Main Gym lobby', style: 'gymlobby', h: 5.5, poly: rect(74.8, -31.4, 132.3, -20.6) },
  { id: 'MAINGYM', name: 'Main Gym', style: 'gym', h: 10.5, poly: rect(102.9, -20.6, 133.2, 16.8) },
  { id: 'GYM-s', name: 'Girls’ locker room and dance room', style: 'gym', h: 5.2, poly: rect(88.8, 16.8, 138.9, 43.5) },
  // East clusters
  { id: 'P108', name: 'P108–P110', style: 'p', h: 4, poly: rect(168.3, -40.7, 188.4, -25.2) },
  { id: 'P115', name: 'P115 Wellness Center and P116 Maker Space', style: 'p', h: 4.2, poly: rect(149.6, -17.3, 165, 13.6) },
  { id: 'P111', name: 'P111–P113', style: 'p', h: 4.2, poly: rect(170.6, -17.3, 188.4, 13.6) },
  { id: 'UTIL', name: '', style: 'plain', h: 3.6, poly: rect(191.7, -22, 205.7, -3.3) },
  { id: 'P117', name: 'P117–P118', style: 'p', h: 4, poly: rect(155.7, 20.6, 174.4, 38.8) },
  { id: 'P119', name: 'P119–P120', style: 'p', h: 4, poly: rect(174.4, 20.6, 193.1, 38.8) },
  // West of the creek
  { id: 'T-lobby', name: 'Mission City Center for Performing Arts', style: 'theatre-lobby', h: 7.5, poly: rect(-152, -53, -128, -45) },
  { id: 'T-gable', name: 'Theatre', style: 'theatre', h: 6, poly: rect(-159, -45, -140, -20), gable: 3.4 },
  { id: 'T-main', name: 'Theatre', style: 'theatre', h: 12, poly: rect(-140, -45, -113, -6.5) },
  { id: 'T-fly', name: 'Theatre stage house', style: 'theatre', h: 22, poly: rect(-131, -40, -113, -14) },
  { id: 'T-back', name: 'Theatre', style: 'theatre', h: 7, poly: rect(-159, -20, -140, -6.5) },
  { id: 'N', name: 'N building', style: 'mn', h: 4.2, poly: [[-153, 16.8], [-118, 16.8], [-118, 37], [-159, 37], [-159, 24]] },
  { id: 'M100', name: 'M building', style: 'mn', h: 4.4, poly: rect(-146, 45, -118, 57.5) },
  { id: 'M', name: 'M building', style: 'mn', h: 4.2, poly: rect(-132, 57.5, -118, 96.3) },
  // Science
  { id: 'S-top', name: 'Science building', style: 's', h: 5.2, poly: rect(-70, 87, -28, 96.3), barrel: 'x' },
  { id: 'S-west', name: 'Science building', style: 's', h: 5.2, poly: rect(-84, 87, -65.5, 133.7), barrel: 'z' },
  { id: 'S-mid', name: 'Science building', style: 's', h: 5.2, poly: rect(-65.5, 96.3, -28, 115), barrel: 'x' },
  { id: 'S-inner', name: 'Science building', style: 's', h: 5.2, poly: rect(-60, 115, -48, 133.7), barrel: 'z' },
  { id: 'S-lecture', name: 'Lecture Hall', style: 's', h: 7, poly: [[-28, 83.7], [-16, 83.7], [-11.5, 90], [-9.4, 101], [-11.5, 112], [-16, 118.3], [-28, 118.3]] },
];

// ── ground ──
export const CREEK = { x: -102.9, top: 8, bottom: 2.6, depth: 3.1, z0: -330, z1: 400 };
export const BRIDGES = [{ z: -55.6, w: 4 }, { z: 54, w: 4 }];

export const MONROE = { z: -108.5, w: 18, bendX: 150 };
// Monroe Street bends south-east past the track; these are its centre-line points.
export const MONROE_PTS = [[-420, -108.5], [150, -108.5], [215, -95], [262, -55], [300, 5], [345, 80], [440, 210], [520, 330]];
export const CALABAZAS_PTS = [[-196, -420], [-187, -108.5], [-160, 40], [-138, 160], [-112, 330], [-96, 420]];
export const SANJUAN_PTS = [[-160, 360], [23, 297], [220, 226], [402, 157], [560, 100]];

// Asphalt lots: rect + which way the stall rows run ('x' = rows along x).
export const LOTS = [
  { r: [-75, -92, -18, -80], rows: 'x', name: 'Visitor parking', front: true },
  { r: [-18, -92, 108, -56], rows: 'x', name: 'Faculty parking' },
  { r: [108, -92, 205, -49], rows: 'x', name: 'Student parking' },
  { r: [-192, -92, -112, -56], rows: 'x', name: 'Student parking' },
  { r: [-159, -6.5, -112, 15.5], rows: 'x', name: 'Faculty parking' },
  { r: [30, 62, 196, 84], rows: 'x', name: 'Parking' },
  { r: [80, 44, 150, 62], rows: 'x', name: 'Parking' },
];
export const CARPORTS = [rect(-1.4, -81.8, 62.6, -67.8), rect(70, -81.8, 107.5, -67.8)];

// The quad, in detail.
export const QUAD = { x0: -46, z0: -30, x1: 36, z1: 38 };
export const STAGE = { x: -17.3, z: 14, r: 8.4, wall: 8.9, plant: 12.2, walk: 15.2, h: 0.8 };
export const LAWN_W = { box: [-37.5, 17.5, -22, 32.3] };             // minus the walk ring round the stage
export const LAWN_E = [[-3.3, 14.5], [15.9, 11.2], [23.4, 23.8], [-11.2, 32.3]];
export const CEDAR = { x: 0, z: 0, bed: 4.6 };

// Dark spots on the plaza in the satellite view: young trees in mulch beds and
// umbrella tables. Pulled out of the image automatically, then thinned by hand.
export const QUAD_SPOTS = [[-39.8, -23.1], [-39.2, 25.2], [-38.6, -13.9], [-36.9, -2.1], [-36.6, -11.9], [-36.1, 3.2],
  [-35.4, -5.4], [-35.3, -20.9], [-33.9, -1.2], [-33.7, 12.8], [-32.5, -14.9], [-32.1, -8.2], [-31.7, -11.4], [-30.2, 14.5],
  [-29.5, -17.5], [-28.8, -9.4], [-27.6, -19.6], [-23.7, -20.2], [-23.7, -17.3], [-17.3, -17.1], [-11.9, 28.8],
  [-11.2, -17.6], [-5.0, -18.9], [-4.7, -21.9], [0.7, -21.0], [2.4, -18.8], [3.7, -21.7], [6.5, -15.0], [8.1, 32.4],
  [9.9, -16.8], [13.3, -17.8], [15.3, 30.9], [16.5, -20.3], [20.9, -16.2], [26.9, -22.1], [27.3, 25.2],
  // the ring of umbrella tables just south of the cedar
  [-0.4, 8.6], [3.6, 8.4], [7.6, 8.6], [11.4, 8.3], [15, 8.8], [19, 8.4]];
export const LAWN_TREES = [[2, 20], [9, 16.5], [15, 23.5], [4.5, 27], [-30, 25], [-26, 29.5]];
export const LAMPS = [[-12, 1.3], [-27, 11.5], [-2, -13], [22, -8], [-38, -18], [26, 20], [-4, 30.8], [-30.5, 32], [-8, 18.6], [30, -24]];
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
export const CAMPUS = [[-176, -97], [160, -97], [240, -64], [292, -8], [332, 60], [372, 150], [230, 205], [30, 272],
  [-60, 296], [-118, 296], [-146, 120], [-168, 20]];
export const WORLD = { x0: -380, z0: -290, x1: 480, z1: 420 };

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
  'M1': { map: [184, 571, 286, 788], world: [-146, 45, -118, 96.3] },
  'N1': { map: [135, 476, 277, 541], world: [-159, 16.8, -118, 37] },
  'C1': { map: [777, 208, 1070, 287], world: [-17.8, -52.8, 62.6, -30.4] },
};
// P rooms sit in four separate clusters, so each cluster has its own box.
export const P_XFORM = [
  { ids: ['P100', 'P101', 'P102', 'P103', 'P104', 'P105', 'P106', 'P107'], map: [808, 550, 940, 715], world: [-11.7, 41.1, 28, 77.6] },
  { ids: ['P108', 'P109', 'P110'], map: [1420, 262, 1515, 312], world: [168.3, -40.7, 188.4, -25.2] },
  { ids: ['P116', 'P115'], map: [1385, 352, 1440, 462], world: [149.6, -17.3, 165, 13.6] },
  { ids: ['P111', 'P112', 'P113'], map: [1463, 352, 1515, 472], world: [170.6, -17.3, 188.4, 13.6] },
  { ids: ['P117', 'P118', 'P119', 'P120'], map: [1390, 527, 1515, 587], world: [155.7, 20.6, 193.1, 38.8] },
];
// Places that are a whole building, not a box on the plan.
export const PLACES = {
  POOL: [77.9, 0], MAINGYM: [118, -1.9], AUXGYM: [62, 48.6], WRESTLING: [88, -39.5], WEIGHT: [104, -39.5],
  BOYSLOCKER: [95, -26], GIRLSLOCKER: [104, 30], DANCE: [130, 30], THEATRE: [-140, -49], 'BLDG-R': [44, 1.1],
};

export function rect(x0, z0, x1, z1) { return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; }
