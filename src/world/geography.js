// The shape of the world: one analytic height function shared by the terrain mesh,
// the scatterers (rocks, trees, grass), the water and the player's feet.
//
// Layout (metres, -z = north):
//   Eilean Donan island at the origin in a shallow tidal bay; the bridge runs east to the mainland.
//   A forested ridge along the north shore, heather mountains to the north-east.
//   Edinburgh's crag-and-tail rises inland to the east (~x 620); its kirkyard lies at the west foot.
//   Dunvegan sits on a crag on the east shore of a sea-bay to the south-west (~x -330, z 560).
import { simplex, fbm, ridged, smoothstep, clamp, lerp } from '../util/noise.js';

export const WATER_LEVEL = 0;

// Polygon enclosing the open water (x, z). Everything outside is land.
const WATER = [
  [138, -430], [128, -250], [122, -120], [128, -40], [136, 0], [133, 40], [120, 92], [90, 132],
  [40, 152], [-20, 160], [-80, 150], [-140, 132], [-200, 152], [-252, 212], [-272, 300], [-287, 420],
  [-298, 515], [-352, 535], [-368, 580], [-336, 618], [-298, 652], [-312, 700], [-362, 762], [-432, 792],
  [-505, 760], [-545, 650], [-562, 500], [-582, 330], [-640, 205], [-800, 140], [-1200, 120], [-2800, 40],
  [-2800, -1500], [-1100, -1250], [-640, -720], [-440, -440], [-320, -345], [-190, -300], [-70, -282],
  [30, -310], [82, -390], [104, -520], [122, -760], [190, -760], [168, -430],
];

// Footpaths (worn turf / pebble), as polylines — they guide wandering between the castles.
export const PATHS = [
  // bridge landing -> east over the ridge -> kirkyard -> round the crag
  [[140, 0], [175, 6], [230, 18], [300, 22], [360, 12], [410, 2], [445, 0], [468, 30], [478, 80], [515, 118], [600, 128], [680, 112], [745, 86], [800, 60]],
  // bridge landing -> south shore -> Dunvegan
  [[140, 0], [150, 60], [140, 120], [110, 175], [40, 200], [-40, 205], [-120, 185], [-190, 185], [-235, 240], [-250, 330], [-262, 440], [-262, 540], [-280, 600], [-275, 640]],
  // up the crag tail to the castle gate
  [[800, 60], [762, 40], [732, 31], [712, 30]],
];

// Key sites (used for LOD, flattening and region weights)
export const SITES = {
  eileanDonan: { x: 0, z: 0 },
  bridgeEast: { x: 140, z: 0 },
  edinburgh: { x: 620, z: 30 },
  kirkyard: { x: 430, z: -120 },
  dunvegan: { x: -330, z: 562 },
};

// Extra small islets/skerries/capes, e.g. under photo viewpoints that stand in the shallows.
const EXTRA_LAND = [
  { x: -6, z: 60, r: 7, h: 0.9 },     // skerry under "Verdigris"
  { x: -14, z: 34, r: 9, h: 0.8 },    // rock spit south of the island
];

function sdPolygon(x, z, poly) {
  let d = Infinity, s = 1;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = poly[i][0], az = poly[i][1], bx = poly[j][0], bz = poly[j][1];
    const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
    const t = clamp((wx * ex + wz * ez) / (ex * ex + ez * ez), 0, 1);
    const dx = wx - ex * t, dz = wz - ez * t;
    d = Math.min(d, dx * dx + dz * dz);
    const c1 = z >= az, c2 = z < bz, c3 = ex * wz > ez * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d); // negative inside
}

function distToPolyline(x, z, pl) {
  let d = Infinity;
  for (let i = 0; i < pl.length - 1; i++) {
    const ax = pl[i][0], az = pl[i][1], bx = pl[i + 1][0], bz = pl[i + 1][1];
    const ex = bx - ax, ez = bz - az;
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
    const dx = x - ax - ex * t, dz = z - az - ez * t;
    d = Math.min(d, dx * dx + dz * dz);
  }
  return Math.sqrt(d);
}

export function pathDistance(x, z) {
  let d = Infinity;
  for (const p of PATHS) d = Math.min(d, distToPolyline(x, z, p));
  return d;
}

const gauss = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));

function ridgeLine(x, z, ax, az, bx, bz, w) {
  const d = distToPolyline(x, z, [[ax, az], [bx, bz]]);
  return Math.exp(-((d / w) ** 2));
}

// Every photograph's viewpoint gets a small pad of ground at the photographer's eye height
// minus 1.7 m, so a visitor can stand exactly where the picture was taken.
const PADS = [];
let _noPads = false;
let KIRK_Y = 9.0;
export function registerViewpoints(photos, eye = 1.7) {
  PADS.length = 0;
  // the kirkyard lies along its photographer's line of sight, at the photographer's feet
  const k = photos.find((p) => p.id === 'edin_kirkyard');
  if (k) {
    const yaw = k.camera.yaw * Math.PI / 180;
    SITES.kirkyard = { x: k.camera.pos[0] + Math.sin(yaw) * 30, z: k.camera.pos[2] - Math.cos(yaw) * 30 };
    KIRK_Y = k.camera.pos[1] - eye - 0.2;
  }
  for (const p of photos) {
    const [x, y, z] = p.camera.pos;
    PADS.push({ x, z, y: y - eye, r: 14 });
  }
  // a foothold far above or below the land becomes a gentle knoll or hollow, not a spike
  _noPads = true;
  for (const pad of PADS) pad.r = clamp(14 + 3.2 * Math.abs(pad.y - heightAt(pad.x, pad.z)), 14, 75);
  _noPads = false;
}

// Signed land distance in metres: > 0 on land, < 0 in water.
export function landDistance(x, z) {
  // coastline wobble, but kept calm near the island and photo viewpoints
  const calm = smoothstep(90, 220, Math.hypot(x - 10, z - 60));
  let d = sdPolygon(x, z, WATER) + (fbm(x / 160, z / 160, 3) * 22 + simplex(x / 40, z / 40) * 4) * calm;
  // Eilean Donan island
  const ix = (x - 2) / 44, iz = (z + 1) / 31;
  const island = (1 - Math.sqrt(ix * ix + iz * iz)) * 31 + simplex(x / 14, z / 14) * 2.5;
  d = Math.max(d, island);
  for (const e of EXTRA_LAND) d = Math.max(d, e.r - Math.hypot(x - e.x, z - e.z) + simplex(x / 5, z / 5) * 1.2);
  return d;
}

// ---------------------------------------------------------------- crags
// Edinburgh is laid out from the real castle plan (world/edinburgh_plan.json, from OpenStreetMap):
// plan metres (x east, z south) -> world by a uniform scale about the crag. The rock's top follows the
// castle's curtain wall; the Western Defences are a lower lawn terrace between the outer west wall and
// the Hospital / War Museum / New Barracks, as in the photographs taken from Princes Street Gardens.
export const EDIN_TOP = 44;
export const EDIN_PLATEAU = EDIN_TOP + 4;   // crag-top level the buildings stand on (48)
export const EDIN_LOWER_TOP = 32;
export const EDIN_LAWN_RISE = 5;
export const EDIN_S = 0.8;
export const EDIN_PLAN = await (await fetch(new URL('../../world/edinburgh_plan.json', import.meta.url))).json();
export const edinW = (x, z) => [610 + EDIN_S * (x - 20), 30 + EDIN_S * (z - 28)];
const EDIN_OUTLINE = EDIN_PLAN.outline.map(([x, z]) => edinW(x, z));
// the Western Defences terrace (plan metres): outer wall round the north-west, inner edge along the buildings
export const EDIN_TERRACE_PLAN = [
  [-15.2, -71.2], [-28.7, -77.2], [-46.5, -82.0], [-64.5, -90.1], [-70.0, -91.6], [-86.2, -78.3], [-90.5, -80.3],
  [-90.3, -71.6], [-108.9, -33.3], [-98.7, -18.0], [-87.7, -1.3], [-92.3, 2.8], [-84.0, 9.4], [-48.9, 48.5],
  [-42.5, 58.7], [-33.4, 63.7], [-24.0, 67.9], [-13.2, 73.5],
  // inner edge, back round: New Barracks' south-west face, War Museum, Hospital
  [-11.1, 67.8], [-51.5, 17.9], [-69.4, -4.7], [-73.4, -35.7], [-75.8, -52.5], [-54.3, -55.6], [-40.6, -57.3], [-20.0, -62.0],
];
const EDIN_TERRACE = EDIN_TERRACE_PLAN.map(([x, z]) => edinW(x, z));
export const EDIN_INNER_PLAN = EDIN_TERRACE_PLAN.slice(18);
const EDIN_INNER = EDIN_INNER_PLAN.map(([x, z]) => edinW(x, z));
const EDIN_BOX = (() => { const xs = EDIN_OUTLINE.map((p) => p[0]), zs = EDIN_OUTLINE.map((p) => p[1]);
  return [Math.min(...xs) - 70, Math.max(...xs) + 70, Math.min(...zs) - 70, Math.max(...zs) + 70]; })();
export const EDIN_GATE = edinW(150, 28);   // the gatehouse at the head of the esplanade

// lawn level on the terrace: highest at the buildings' feet, falling towards the outer wall
export function edinLawnY(x, z) {
  const di = distToPolyline(x, z, EDIN_INNER);
  return EDIN_LOWER_TOP + EDIN_LAWN_RISE + 1 - Math.min(di, 22) * 0.27;
}
// signed distance to the curtain (negative inside) and to the terrace, for the terrain and the castle walls
export function edinDist(x, z) {
  if (x < EDIN_BOX[0] || x > EDIN_BOX[1] || z < EDIN_BOX[2] || z > EDIN_BOX[3]) return { out: 1e9, terrace: 1e9 };
  return { out: sdPolygon(x, z, EDIN_OUTLINE), terrace: sdPolygon(x, z, EDIN_TERRACE) };
}

function edinburgh(x, z, base) {
  const { out, terrace } = edinDist(x, z);
  if (out > 80) return null;
  const tw = 1 - smoothstep(-1, 6, terrace);                        // 1 on the terrace
  const lawn = edinLawnY(x, z);
  const top = lerp(EDIN_PLATEAU + simplex(x / 30, z / 30) * 0.4, lawn - 0.25, tw);
  if (out <= 0) return { h: top, core: 1 };
  // outside the curtain: the cliff, steep at first, with benches and buttresses of rock
  const edgeTop = lerp(EDIN_PLATEAU, EDIN_LOWER_TOP - 3, 1 - smoothstep(0, 16, terrace)) - 2.5;
  // near-sheer below the walls, easing out into scree and gardens at the foot
  const f = 1 - smoothstep(0, 60 + fbm(x / 60, z / 60, 2) * 14, out);
  const k = (1 - smoothstep(0, 16 + fbm(x / 40 + 3, z / 40, 2) * 6, out)) * 0.8 + Math.pow(f, 2.0) * 0.2;
  const bench = k * (1 - k) * 4 * simplex(x / 12, z / 12) * 2.6;
  const h = base + Math.max(0, edgeTop - base) * k + bench;
  return { h, core: f };
}

export const DUN_TOP = 15;
function dunvegan(x, z) {
  const cx = -330, cz = 562;
  const dx = x - cx, dz = z - cz;
  const ex = dx < 0 ? dx / 30 : dx / 44;
  const ez = dz < 0 ? dz / 34 : dz / 30;
  const r = Math.pow(Math.abs(ex) ** 3 + Math.abs(ez) ** 3, 1 / 3) + fbm(x / 20, z / 20, 3) * 0.08;
  const westness = smoothstep(10, -25, dx); // steeper to the sea side
  const core = 1 - smoothstep(lerp(0.7, 0.86, westness), 1.0 + (1 - westness) * 0.6, r);
  const bench = (1 - core) * core * 4 * simplex(x / 13, z / 13) * 1.6;
  return core * DUN_TOP + bench;
}

// ---------------------------------------------------------------- mountains & hills
function mountains(x, z) {
  let h = 0, g;
  // NE heather mountains (the purple slopes of "Heather & Glass")
  g = gauss(x, z, 900, -1050, 650, 380); if (g > 1e-3) h += 240 * g * (0.55 + 0.6 * ridged(x / 700, z / 700, 4));
  g = gauss(x, z, 560, -760, 340, 200); if (g > 1e-3) h += 90 * g * (0.6 + 0.5 * ridged(x / 600 + 3, z / 600, 4));
  // far north beyond the loch
  g = gauss(x, z, -150, -2000, 800, 300); if (g > 1e-3) h += 160 * g * (0.5 + 0.6 * ridged(x / 650, z / 650 + 7, 4));
  // north forested ridge along the shore
  g = ridgeLine(x, z, -560, -330, -260, -380, 130); if (g > 1e-3) h += 85 * g * (0.85 + 0.25 * fbm(x / 250, z / 250, 3));
  // low headland across the Dunvegan bay
  g = ridgeLine(x, z, -640, 820, -620, 330, 70); if (g > 1e-3) h += 26 * g * (0.8 + 0.3 * fbm(x / 120, z / 120));
  // far ring of mountains (keeps the horizon full in every direction)
  const r = Math.hypot((x - 100) / 1.15, z - 150);
  if (r > 1500) {
    const ring = smoothstep(1500, 2600, r);
    const rg = ridged(x / 820, z / 820, 5);
    h += ring * (150 + 380 * rg * rg) * (0.7 + 0.3 * Math.sin(Math.atan2(z, x) * 3.0));
  }
  return h;
}

function moor(x, z) {
  // gentle rolling ground; low knolls
  return fbm(x / 220, z / 220, 4) * 7 + fbm(x / 60, z / 60, 3) * 1.6 + simplex(x / 18, z / 18) * 0.35;
}

// ---------------------------------------------------------------- the height function
export function heightAt(x, z, landOut) {
  const land = landDistance(x, z);
  if (landOut) landOut.land = land;
  let h;
  // shallow tidal bay round the island (wadeable)
  const shallow = 1 - smoothstep(110, 210, Math.hypot(x - 10, z - 55));
  if (land < 0) {
    const maxDepth = lerp(7.5, 0.62, shallow);
    h = -Math.min(maxDepth, -land * lerp(0.06, 0.03, shallow)) + simplex(x / 30, z / 30) * 0.12;
  } else {
    const rise = Math.min(land, 30) * 0.055 + Math.max(0, land - 30) * 0.03;
    const m = smoothstep(5, 90, land);
    h = 0.2 + rise + (m > 0 ? moor(x, z) * m : 0);
  }
  const mk = smoothstep(0, 40, land);
  if (mk > 0) h += mountains(x, z) * mk;

  // east mainland rises toward Edinburgh
  if (x > 160) h += smoothstep(160, 460, x) * smoothstep(-500, -250, z) * (1 - smoothstep(600, 900, z)) * 8;

  // the gardens valley below the west face of the rock (Princes Street Gardens)
  const gv = Math.hypot((x - 470) / 95, (z - 30) / 120);
  if (gv < 1.3 && x < 530) h = lerp(h, 8.6 + simplex(x / 35, z / 35) * 0.8, (1 - smoothstep(0.7, 1.3, gv)) * (1 - smoothstep(495, 528, x)));

  // ...and its northern arm along the foot of the rock
  const gn = Math.hypot((x - 575) / 175, (z + 118) / 72);
  if (gn < 1.4 && z < -30) h = lerp(h, 9.4 + simplex(x / 40, z / 40) * 0.8, (1 - smoothstep(0.75, 1.4, gn)) * (1 - smoothstep(-58, -32, z)));

  // Edinburgh crag and its tail running east from the gatehouse
  const ed = edinburgh(x, z, h);
  if (ed) {
    if (landOut) landOut.core = ed.core;
    h = ed.core >= 1 ? ed.h : Math.max(h, ed.h);
  } else if (landOut) landOut.core = 0;
  if (x > EDIN_GATE[0] - 30 && x < EDIN_GATE[0] + 380 && Math.abs(z - EDIN_GATE[1]) < 140) {
    const t = clamp((x - EDIN_GATE[0]) / 330, 0, 1);
    const tailW = lerp(46, 26, t), dz = z - EDIN_GATE[1];
    const tail = Math.exp(-((dz / tailW) ** 4)) * lerp(EDIN_PLATEAU - 1.5, 12, Math.pow(t, 0.8)) * smoothstep(EDIN_GATE[0] - 30, EDIN_GATE[0] - 5, x);
    h = Math.max(h, tail + (1 - Math.abs(dz) / 140) * 0);
    // the approach: a steady ramp up the esplanade and through the gatehouse onto the crag top
    if (Math.abs(dz) < 12) {
      const ramp = lerp(EDIN_PLATEAU + 1.2, 41.5, clamp((x - EDIN_GATE[0]) / 100, 0, 1));
      const m = (1 - smoothstep(4, 11, Math.abs(dz))) * smoothstep(EDIN_GATE[0] - 25, EDIN_GATE[0] - 12, x) * (1 - smoothstep(EDIN_GATE[0] + 95, EDIN_GATE[0] + 110, x));
      h = lerp(h, ramp, m);
    }
  }

  // Dunvegan crag
  if (Math.abs(x + 330) < 120 && Math.abs(z - 562) < 120) {
    const dv = dunvegan(x, z);
    if (dv > 0.01) h = Math.max(h, dv + Math.max(0, h) * 0.2);
  }

  // flatten castle platforms
  const isl = Math.hypot((x - 2) / 26, z / 18);
  if (isl < 1.2) h = lerp(h, 3.6, 1 - smoothstep(0.8, 1.15, isl));
  const ky = Math.hypot(x - SITES.kirkyard.x, z - SITES.kirkyard.z);
  if (ky < 60) h = lerp(h, KIRK_Y + simplex(x / 40, z / 40) * 0.4, 1 - smoothstep(30, 60, ky));
  const bl = Math.hypot(x - 142, z - 0);
  if (bl < 22) h = lerp(h, 2.6, 1 - smoothstep(6, 22, bl));

  // photographers' footholds
  for (let i = 0; i < PADS.length && !_noPads; i++) {
    const p = PADS[i];
    const dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz < p.r * p.r) {
      const d = Math.sqrt(dx * dx + dz * dz);
      // in the loch the foothold stays just under the surface (no stray islets poking out)
      const target = p.y < 0.4 ? Math.min(p.y, -0.3) : p.y + simplex(x / 2.5, z / 2.5) * 0.15;
      h = lerp(h, target, 1 - smoothstep(2.5, p.r, d));
    }
  }

  // paths are slightly sunken & smoothed
  if (x > -330 && x < 830 && z > -30 && z < 680) {
    const pd = pathDistance(x, z);
    if (landOut) landOut.path = pd;
    h -= 0.12 * (1 - smoothstep(0.5, 2.5, pd));
  } else if (landOut) landOut.path = 1e9;
  return h;
}

const _out = { h: 0, land: 0, core: 0, forest: 0, path: 0, footNW: 0, region: [1, 0, 0] };

export function sample(x, z) {
  const h = heightAt(x, z, _out);
  const pd = _out.path;
  // regions
  const rEdin = 1 - smoothstep(260, 420, Math.hypot(x - 560, z - 20));
  const rDun = 1 - smoothstep(170, 300, Math.hypot(x + 330, z - 600));
  const rEd = Math.max(0, 1 - rEdin - rDun);
  const rs = rEd + rEdin + rDun;

  // forests: north ridge & headland, Edinburgh gardens round the crag foot, Dunvegan woods east of crag
  let forest = 0;
  const rl = ridgeLine(x, z, -560, -330, -260, -380, 130);
  if (rl > 0.05) forest = smoothstep(0.35, 0.65, rl + fbm(x / 90, z / 90, 3) * 0.3) * smoothstep(2, 10, h);
  const eo = edinDist(x, z).out;   // gardens woodland round the foot of the rock
  _out.footNW = eo > 14 && eo < 70 ? (smoothstep(14, 22, eo) - smoothstep(45, 70, eo)) * smoothstep(-10, 20, Math.max(560 - x, -20 - z)) : 0;
  if (eo > 18 && eo < 110) forest = Math.max(forest, (smoothstep(22, 38, eo) - smoothstep(70, 105, eo)) * smoothstep(-0.1, 0.25, fbm(x / 50, z / 50, 3)) * (1 - smoothstep(30, 40, h)));
  const dvF = Math.hypot((x + 290) / 50, (z - 560) / 55);
  if (dvF < 1.2) forest = Math.max(forest, (1 - smoothstep(0.6, 1.2, dvF)) * smoothstep(-330, -305, x) * (1 - smoothstep(575, 600, z)) * smoothstep(0.5, 3, h));
  forest *= 1 - smoothstep(1.0, 4.0, 4 - pd); // keep paths clear

  _out.h = h; _out.forest = forest;
  _out.region[0] = rEd / rs; _out.region[1] = rEdin / rs; _out.region[2] = rDun / rs;
  return _out;
}

export function normalAt(x, z, e = 1.0) {
  const hx = heightAt(x + e, z) - heightAt(x - e, z);
  const hz = heightAt(x, z + e) - heightAt(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return [nx / l, ny / l, nz / l];
}
