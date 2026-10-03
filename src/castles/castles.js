// The castles, modelled from the photographs.
//   Eilean Donan: square keep with corbelled parapet and crow-stepped roof, lower west hall,
//     middle range, east enceinte with a round tower, and the long arched bridge to the mainland.
//   Edinburgh: on the crag-top, the great gabled house with crow-stepped gables and dormers over
//     a massive retaining wall, the tall barrack block, a lime-green lawn terrace held by a lower
//     curtain wall with a round turret; perimeter walls round the rock, a courtyard and gatehouse.
//   Dunvegan: tall harled block with corner bartizans, parapet, chimneys and the clan flag.
//   The kirkyard: a wall of tomb bays, an obelisk and headstones at the foot of the rock.
import * as THREE from 'three';
import { Builder, arch } from './kit.js';
import { heightAt, DUN_TOP, EDIN_PLATEAU, EDIN_PLAN, EDIN_S, EDIN_INNER_PLAN, EDIN_GATE, edinW, edinLawnY, edinDist } from '../world/geography.js';

// ---------------------------------------------------------------- Eilean Donan
export function buildEileanDonan() {
  const Y = 3.6;
  const b = new Builder({ x: 2, y: Y, z: 0 }, 0);
  const S = 'ed_stone', H = 'ed_hall', R = 'slate', D = 'glass';

  // KEEP
  const kx = 7.8, kz = -2, kw = 10.4, kd = 10.6, kh = 13.0;
  b.box(S, kw, kh, kd, kx, -2, kz);
  b.band(S, kx, kz, kw, kd, kh - 2.2, 0.5, 0.25);             // string course
  b.band(S, kx, kz, kw, kd, kh - 1.6, 1.6, 0.55);             // corbelled parapet
  b.crenelRect(S, kx, kz, kw + 1.1, kd + 1.1, kh, 0.5, 0.9, 1.0, 0.75);
  b.gableRoof(R, S, kx, kh, kz, kd - 2.0, kw - 2.4, 6.2, { ry: Math.PI / 2, crowstep: true, steps: 7, overhang: 0.2 });
  b.chimney(S, kx, kh + 5.2, kz + kd / 2 - 1.6, 1.3, 1.1, 2.0);
  b.chimney(S, kx + 2.4, kh + 2.0, kz - kd / 2 + 2.0, 0.9, 0.9, 2.2);
  // corner bartizans
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    b.tower(S, R, kx + sx * (kw / 2), kh - 3.2, kz + sz * (kd / 2), 0.95, 3.6, { crenel: false, collide: false, cone: 0 });
    b.cylinder(S, 0.45, 1.6, kx + sx * (kw / 2), kh - 4.8, kz + sz * (kd / 2), 12, false, 0.95);
  }
  // keep windows (small, deep)
  b.windows(D, null, 'z+', kz + kd / 2, kx - 4, kx + 3.5, 3, 3, 2.5, 3.6, 0.7, 1.2);
  b.windows(D, null, 'x-', kx - kw / 2, kz - 3, kz + 3, 2, 2, 6.0, 4.6, 0.7, 1.3);
  b.windows(D, null, 'x+', kx + kw / 2, kz - 3, kz + 3, 2, 2, 6.5, 4.6, 0.7, 1.3);
  b.windows(D, null, 'z-', kz - kd / 2, kx - 3, kx + 3, 2, 3, 6.0, 4.6, 0.7, 1.3);

  // WEST HALL (lower gabled block on the left in the classic views)
  const hx = -11, hz = 1, hw = 10, hd = 9, hh = 6.4;
  b.box(H, hw, hh + 2, hd, hx, -2, hz);
  b.gableRoof(R, H, hx, hh, hz, hw, hd, 3.3, { crowstep: true, steps: 5, overhang: 0.25 });
  b.chimney(H, hx - hw / 2 + 0.4, hh + 2.6, hz, 1.2, 1.4, 1.6);
  b.chimney(H, hx + hw / 2 - 0.4, hh + 2.6, hz, 1.2, 1.4, 1.4);
  b.windows(D, null, 'z+', hz + hd / 2, hx - 3, hx + 3, 2, 3, 2.2, 3.6, 0.6, 1.2);
  b.windows(D, null, 'x-', hx - hw / 2, hz - 2, hz + 2, 2, 2, 2.5, 3.4, 0.6, 1.1);

  // MIDDLE RANGE between hall and keep, crenellated, with small turrets and stacks
  const mx = -2.5, mz = 1.5;
  b.box(S, 7, 7.0, 10, mx, -2, mz);
  b.crenelRect(S, mx, mz, 7, 10, 5.0, 0.45, 0.7, 0.8, 0.6);
  b.chimney(S, mx - 1.5, 5.0, mz - 2, 0.9, 0.8, 1.6);
  b.chimney(S, mx + 2.0, 5.0, mz + 3, 0.8, 0.8, 1.2);
  b.tower(S, R, mx + 3.2, 3.6, mz + 4.6, 0.9, 3.2, { collide: false, cone: 1.8, seg: 12 });
  b.windows(D, null, 'z+', mz + 5, mx - 2, mx + 2, 2, 2, 1.8, 3.0, 0.5, 0.9);

  // NORTH CURTAIN enclosing a courtyard
  b.wall(S, -16, -3.5, -9, -8.5, -2, 8.5, 1.4);
  b.wall(S, -9, -8.5, 0.5, -8.5, -2, 8.5, 1.4);
  b.crenels(S, -16, -3.5, -9, -8.5, 6.5, 1.4, 0.7, 0.8, 0.6);
  b.crenels(S, -9, -8.5, 0.5, -8.5, 6.5, 1.4, 0.7, 0.8, 0.6);

  // EAST ENCEINTE towards the bridge
  const E = [[13.5, 3.2], [20, 6.5], [26.5, 2.5], [26.5, -4.5], [20.5, -8.8], [13.5, -7.5]];
  for (let i = 0; i < E.length - 1; i++) {
    b.wall(S, E[i][0], E[i][1], E[i + 1][0], E[i + 1][1], -2.2, 5.8, 1.3);
    b.crenels(S, E[i][0], E[i][1], E[i + 1][0], E[i + 1][1], 3.6, 1.3, 0.7, 0.8, 0.6);
  }
  b.tower(S, R, 26.0, -2.2, -1.0, 2.6, 7.2, { crenel: true, corbel: true });
  b.box(S, 4.5, 5.2, 5, 19.5, -2.2, -1.5); // small inner building
  b.gableRoof(R, S, 19.5, 3.0, -1.5, 4.5, 5, 1.8, {});

  // rocky skirt — masonry base that meets the island rocks
  b.box(S, 46, 2.2, 15, 2, -3.2, -1, 0, false);

  return b;
}

export function buildEDBridge() {
  // local frame: x runs east from the island gate
  const b = new Builder({ x: 0, y: 0, z: -1.0 }, 0);
  const x0 = 27.5, x1 = 141;
  const deckY = (x) => {
    const t = (x - x0) / (x1 - x0);
    return 5.0 + Math.sin(t * Math.PI) * 0.6 - t * 2.2; // gentle hump, lower at mainland end
  };
  const arches = [
    { x: 60, span: 7.5, spring: 0.6, rise: 3.0 },
    { x: 71, span: 7.5, spring: 0.6, rise: 3.1 },
    { x: 82, span: 7.5, spring: 0.6, rise: 3.0 },
    { x: 121, span: 6.5, spring: 0.2, rise: 2.6 },
  ];
  const W = 4.6;
  arch(b, 'ed_bridge', x0, x1, W, deckY, arches, -2.6);
  // parapets with rough coping, segmented to follow the deck
  const segs = 46;
  for (let i = 0; i < segs; i++) {
    const xa = x0 + ((x1 - x0) * i) / segs, xb = x0 + ((x1 - x0) * (i + 1)) / segs;
    const ya = deckY(xa), yb = deckY(xb);
    const ym = (ya + yb) / 2, len = xb - xa;
    const tilt = Math.atan2(yb - ya, len);
    for (const s of [-1, 1]) {
      b.add('ed_bridge', new THREE.BoxGeometry(len + 0.05, 0.8, 0.5), (xa + xb) / 2, ym + 0.4, s * (W / 2 - 0.25), 0, 0, tilt);
      b.add('ed_bridge', new THREE.BoxGeometry(len + 0.05, 0.2, 0.62), (xa + xb) / 2, ym + 0.88, s * (W / 2 - 0.25), 0, 0, tilt);
    }
    // walkable deck collider
    b.collideBox((xa + xb) / 2, ym - 1.0, 0, len + 0.1, 2.0, W, 0, true);
    // parapets block
    b.collideBox((xa + xb) / 2, ym + 0.6, -(W / 2 - 0.25), len, 1.2, 0.5, 0);
    b.collideBox((xa + xb) / 2, ym + 0.6, (W / 2 - 0.25), len, 1.2, 0.5, 0);
  }
  // cutwaters on the arch piers
  for (let i = 0; i < arches.length - 1; i++) {
    const px = (arches[i].x + arches[i + 1].x) / 2;
    if (Math.abs(arches[i + 1].x - arches[i].x) > 15) continue;
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.01, 1.7, 3.2, 4, 1);
      b.add('ed_bridge', g, px, -0.9, s * (W / 2 + 0.2), Math.PI / 4);
    }
  }
  // tall pole at the mainland end (seen in several photographs)
  b.cylinder('trim', 0.09, 9.0, 146, heightAt(146, -7) - 0.2, -7, 8, false);
  return b;
}

// ---------------------------------------------------------------- Edinburgh
// Laid out from the real plan (world/edinburgh_plan.json, OpenStreetMap): every building stands where
// and faces how it really does, so the photographs taken from Princes Street Gardens line up with it.
// Plan coordinates are metres (x east, z south); heights are world metres.
function absorb(b, sb) {
  for (const [k, v] of Object.entries(sb.bins)) (b.bins[k] ||= []).push(...v);
  b.colliders.push(...sb.colliders);
}
// a sub-builder whose local x runs along the plan direction a->c, origin at plan point o, base height y
function frameAt(o, a, c, y) {
  const [ox, oz] = edinW(o[0], o[1]);
  return new Builder({ x: ox, y, z: oz }, Math.atan2(-(c[1] - a[1]), c[0] - a[0]));
}
// oriented box of a plan polygon (axis = its longest edge), in world units
function obb(poly) {
  let best = 0, ax = 1, az = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length];
    const l = Math.hypot(x1 - x0, z1 - z0);
    if (l > best) { best = l; ax = (x1 - x0) / l; az = (z1 - z0) / l; }
  }
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (const [x, z] of poly) { const u = x * ax + z * az, v = -x * az + z * ax; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const c = [cu * ax - cv * az, cu * az + cv * ax];
  let len = (u1 - u0) * EDIN_S, wid = (v1 - v0) * EDIN_S, dir = [ax, az];
  if (wid > len) { [len, wid] = [wid, len]; dir = [-az, ax]; }
  return { c, len, wid, dir };
}
// a building extruded from its plan footprint, with a gabled or flat roof over its oriented box
function footprint(b, poly, y0, h, roof, bins) {
  const sh = new THREE.Shape(poly.map(([x, z]) => { const [wx, wz] = edinW(x, z); return new THREE.Vector2(wx, -wz); }));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  b.add(bins.wall, g, 0, y0, 0);
  const o = obb(poly);
  const sb = frameAt(o.c, [0, 0], o.dir, y0);
  sb.collideBox(0, h / 2, 0, o.len, h, o.wid);
  if (roof > 0) sb.gableRoof(bins.roof, bins.wall, 0, h, 0, o.len, o.wid, roof, { overhang: 0.2, crowstep: !!bins.crow, steps: 6 });
  else sb.add(bins.wall, new THREE.BoxGeometry(o.len * 0.7, 0.6, o.wid * 0.7), 0, h + 0.3, 0);
  absorb(b, sb);
}

export function buildEdinburgh() {
  const T = EDIN_PLATEAU;                   // the crag top the buildings stand on (48)
  const b = new Builder({ x: 0, y: 0, z: 0 }, 0);
  const G = 'edin_stone', P = 'edin_pink', W = 'edin_wall', R = 'slate', D = 'glass', F = 'trim', L = 'lawn';
  const s = EDIN_S;

  // ---- the Hospital / National War Museum block at the north-west corner (the gabled range above
  // the lawn in the photographs). Plan frame: origin at its north-west corner, u east along the north
  // face, v south down the west face.
  {
    const O = [-75.8, -52.5], U = [-54.3, -55.6];
    const hb = frameAt(O, O, U, T - 0.5);
    const at = (u, v) => [u * s, v * s];           // plan (u, v) -> local (x, z)
    const box = (bin, u0, u1, v0, v1, y, h) => { const [x0, z0] = at(u0, v0), [x1, z1] = at(u1, v1); hb.box(bin, x1 - x0, h, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2); };
    // proportions solved jointly with the four garden-side cameras (eave, rise, gable width)
    const eave = 8.1, rise = 4.8;
    // north range (ridge east-west): its great crow-stepped west gable over the corner faces the gardens
    box(G, 0, 35.5, 0, 11.1, 0, eave);
    { const [x0] = at(0, 0), [x1, z1] = at(35.5, 11.1); hb.gableRoof(R, G, (x0 + x1) / 2, eave, z1 / 2, x1 - x0, z1, rise, { crowstep: true, steps: 8, overhang: 0.25 }); }
    // the lower west wing running south (ridge north-south), crow-stepped at its north end
    box(G, 0, 6, 11.1, 17, 0, eave - 0.8);
    { const [x1] = at(6, 0), [, z0] = at(0, 10.1), [, z1] = at(0, 17); hb.gableRoof(R, G, x1 / 2, eave - 0.8, (z0 + z1) / 2, z1 - z0, x1, 3.4, { ry: Math.PI / 2, crowstep: true, steps: 5, overhang: 0.2 }); }
    // east wing (back), lower
    box(G, 29, 35.5, 11.1, 29.5, 0, eave - 1.5);
    { const [x0, z0] = at(29, 11.1), [x1, z1] = at(35.5, 29.5); hb.gableRoof(R, G, (x0 + x1) / 2, eave - 1.5, (z0 + z1) / 2, z1 - z0, x1 - x0, 3, { ry: Math.PI / 2, overhang: 0.2 }); }
    // round stair turret at the north-east corner
    { const [x, z] = at(36.5, 2.5); hb.tower(G, R, x, 0, z, 1.4, eave, { cone: 2.2, seg: 16 }); }
    // dormers on the north slope, chimneys on the gables
    for (const u of [9, 15, 21, 27]) {
      const [x, z] = at(u, 0);
      hb.box(G, 1.5, 1.9, 1.4, x, eave, z + 1.2, 0, false);
      hb.gableRoof(R, G, x, eave + 1.9, z + 1.2, 1.4, 1.5, 1.0, { ry: Math.PI / 2, crowstep: true, steps: 3, overhang: 0.1 });
      hb.windows(D, F, 'z-', z + 0.5, x, x, 1, 1, eave + 0.3, 0, 0.7, 1.1, { frame: 0.1 });
    }
    { const [x, z] = at(0.6, 5.55); hb.chimney(G, x, eave + rise - 0.3, z, 0.9, 1.6, 2.2); }
    { const [x, z] = at(35, 5.55); hb.chimney(G, x, eave + rise - 0.3, z, 0.9, 1.6, 2.2); }
    // windows: north face, west face (three storeys)
    { const [, z0] = at(0, 0); const [x1] = at(33, 0); hb.windows(D, F, 'z-', z0, 2.2, x1, 3, 9, 0.9, 2.5, 0.8, 1.45, { mullion: true }); }
    { const [x0] = at(0, 0); const [, z1] = at(0, 16); hb.windows(D, F, 'x-', x0, 1.6, z1, 3, 4, 0.9, 2.5, 0.8, 1.45, { mullion: true }); hb.windows(D, F, 'x-', x0, 3.2, 5.6, 1, 2, eave + 0.8, 0, 0.7, 1.1, { frame: 0.1 }); }
    // War Museum: west range and south range, lower Georgian blocks with dormers
    const me = 6.6;
    box(G, 0, 5.8, 17, 48.2, 0, me);
    { const [x1] = at(5.8, 0), [, z0] = at(0, 17), [, z1] = at(0, 48.2); hb.gableRoof(R, G, x1 / 2, me, (z0 + z1) / 2, z1 - z0, x1, 2.8, { ry: Math.PI / 2, overhang: 0.25 }); }
    box(G, 5.8, 35, 38, 48.6, 0, me);
    { const [x0, z0] = at(5.8, 38), [x1, z1] = at(35, 48.6); hb.gableRoof(R, G, (x0 + x1) / 2, me, (z0 + z1) / 2, x1 - x0, z1 - z0, 3, { overhang: 0.25 }); }
    { const [x0] = at(0, 0); const [, z0] = at(0, 18.5), [, z1] = at(0, 46.5); hb.windows(D, F, 'x-', x0, z0, z1, 2, 8, 0.9, 2.6, 0.75, 1.4); }
    for (const v of [22, 28, 34, 40]) {
      const [x, z] = at(0, v);
      hb.box(G, 1.2, 1.6, 1.3, x + 1.0, me, z, 0, false);
      hb.gableRoof(R, G, x + 1.0, me + 1.6, z, 1.2, 1.3, 0.8, { overhang: 0.1 });
    }
    absorb(b, hb);
  }

  // ---- the Governor's House: crow-stepped, three storeys, standing diagonally behind the Hospital
  {
    const a = [-25.5, -17.4], c = [-11.2, 13.9];
    const gb = frameAt([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], a, c, T - 1);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) * s, wid = 11.3 * s, eh = 8.5;
    gb.box(G, len, eh, wid, 0, 0, 0);
    gb.gableRoof(R, G, 0, eh, 0, len, wid, 4.4, { crowstep: true, steps: 6, overhang: 0.2 });
    gb.windows(D, F, 'z+', wid / 2, -len / 2 + 2, len / 2 - 2, 3, 7, 1.0, 2.5, 0.75, 1.4);
    gb.windows(D, F, 'z-', -wid / 2, -len / 2 + 2, len / 2 - 2, 3, 7, 1.0, 2.5, 0.75, 1.4);
    gb.chimney(G, -len / 2 + 0.6, eh + 3.8, 0, 1.0, 1.5, 2.0);
    gb.chimney(G, len / 2 - 0.6, eh + 3.8, 0, 1.0, 1.5, 2.0);
    absorb(b, gb);
  }

  // ---- the New Barracks: a long plain block of six storeys rising from the lawn on the south-west
  {
    const a = [-44.0, 11.8], c = [-3.5, 61.6];
    const base = edinLawnY(...edinW(-48, 20)) - 1.5;
    const bb = frameAt([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], a, c, base);
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]) * s, wid = 15 * s, eh = 53.5 - base;
    bb.box(P, len, eh, wid, 0, 0, 0);
    bb.gableRoof(R, P, 0, eh, 0, len, wid, 2.4, { overhang: 0.3 });
    for (let i = 0; i < 8; i++) bb.chimney(P, -len / 2 + 3 + i * (len - 6) / 7, eh + 1.0, 0, 1.5, 0.9, 2.4);
    // the south-west front (local +z faces the lawn) and the north-west end towards the gardens
    bb.windows(D, F, 'z+', wid / 2, -len / 2 + 2, len / 2 - 2, 6, 16, 1.6, 2.6, 0.75, 1.4);
    bb.windows(D, F, 'z-', -wid / 2, -len / 2 + 2, len / 2 - 2, 2, 16, 11.0, 2.6, 0.75, 1.4);
    bb.windows(D, F, 'x-', -len / 2, -wid / 2 + 2, wid / 2 - 2, 6, 3, 1.6, 2.6, 0.75, 1.4);
    absorb(b, bb);
  }

  // ---- everything else on the rock, extruded from its footprint
  const DETAILED = new Set([41299976, 41299975, 41299983, 41294347]);
  const SPEC = { // name -> [wall height, roof rise, crow-stepped] in real metres (scaled with the plan)
    'Royal Palace': [14, 5, true], 'The Great Hall': [11, 6, false], 'Queen Ann Building': [11, 4, false],
    'Scottish National War Memorial': [10, 5.5, true], 'Military Prison': [7, 3, false], "St Margaret's Chapel": [5, 3, false],
    'Portcullis Gate and Argyle Tower': [13, 0], 'Gatehouse': [10, 0], "David's Tower": [6, 0], 'Cartsheds': [5, 2.5, false],
    'The Royal Scots Regimental Museum': [8, 3, false],
  };
  for (const bl of EDIN_PLAN.buildings) {
    if (DETAILED.has(bl.id)) continue;
    // keep the road through the gateway clear of the booths that crowd it
    const wp = bl.poly.map((q) => edinW(q[0], q[1]));
    if (bl.name !== 'Gatehouse' && wp.some(([x, z]) => Math.abs(x - EDIN_GATE[0] + 8) < 22 && Math.abs(z - EDIN_GATE[1]) < 7)) continue;
    const [h, roof, crow] = SPEC[bl.name] || [bl.kind === 'chapel' ? 8 : 4.5, bl.kind === 'chapel' ? 4 : 2, false];
    const cx = bl.poly.reduce((a, p) => a + p[0], 0) / bl.poly.length, cz = bl.poly.reduce((a, p) => a + p[1], 0) / bl.poly.length;
    const [wx, wz] = edinW(cx, cz);
    const y0 = Math.min(heightAt(wx, wz), T) - 1;
    footprint(b, bl.poly, y0, h * s + (T - 1 - y0), roof * s, { wall: bl.name === 'Royal Palace' || bl.name === 'Military Prison' ? P : G, roof: R, crow });
  }

  // ---- curtain walls round the rock, following the castle outline
  const out = EDIN_PLAN.outline;
  for (let i = 0; i < out.length; i++) {
    const [ax, az] = edinW(...out[i]), [bx, bz] = edinW(...out[(i + 1) % out.length]);
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.6) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, nx = -(bz - az) / len, nz = (bx - ax) / len;
    if (Math.abs(mx - EDIN_GATE[0]) < 14 && Math.abs(mz - EDIN_GATE[1]) < 6) continue; // the gateway
    const sgn = edinDist(mx + nx * 2, mz + nz * 2).out < 0 ? 1 : -1;   // which side is inside
    const inY = heightAt(mx + nx * sgn * 2.5, mz + nz * sgn * 2.5), outY = heightAt(mx - nx * sgn * 3, mz - nz * sgn * 3);
    const top = inY + 1.3, base = Math.min(outY, inY) - 2.5;
    b.wall(W, ax, az, bx, bz, base, top - base, 1.6);
    b.add(W, new THREE.BoxGeometry(len + 0.4, 0.22, 1.9), mx, top + 0.11, mz, Math.atan2(-(bz - az), bx - ax));
  }
  // the gateway at the head of the esplanade: two piers and a crenellated lintel over the road
  {
    const gx = EDIN_GATE[0] - 2, gz = EDIN_GATE[1], gy = heightAt(gx, gz) - 1;
    for (const sz of [-1, 1]) b.box(W, 4.5, 9.5, 3.2, gx, gy, gz + sz * 5.4);
    b.box(W, 4.5, 3.2, 7.6, gx, gy + 6.3, gz, 0, false);
    b.crenelRect(W, gx, gz, 4.5, 14, gy + 9.5, 0.5, 0.8, 0.8, 0.7);
  }
  // round bartizans and the turret at the corners of the Western Defences
  for (const [px, pz, r, hgt] of [[-85.7, 8.2, 2.0, 6.5], [-69.5, -92.5, 1.5, 4.5], [-108.9, -33.3, 1.5, 4.5], [-90.4, -78.5, 1.3, 4], [-6.6, -67.4, 1.4, 4.5]]) {
    const [x, z] = edinW(px, pz);
    const y = heightAt(x, z);
    b.tower(W, R, x, y - 4, z, r, hgt + 4, { corbel: true, cone: r * 1.5, seg: 16 });
  }

  // ---- the massive substructure under the Hospital and War Museum, down to the lawn
  for (let i = 1; i < EDIN_INNER_PLAN.length - 1; i++) {
    const [ax, az] = edinW(...EDIN_INNER_PLAN[i]), [bx, bz] = edinW(...EDIN_INNER_PLAN[i + 1]);
    const len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len; // outward (left of travel)
    const o = 0.9;
    const base = Math.min(edinLawnY(ax, az), edinLawnY(bx, bz)) - 2;
    b.wall(W, ax + nx * o, az + nz * o, bx + nx * o, bz + nz * o, base, T + 0.6 - base, 2.4);
  }

  // ---- the lime-green lawn draped over the terrace
  {
    const pos = [], step = 1.6;
    const pts = EDIN_PLAN.outline.map((p) => edinW(...p));
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const z0 = Math.min(...pts.map((p) => p[1])), z1 = Math.max(...pts.map((p) => p[1]));
    const on = (x, z) => { const d = edinDist(x, z); return d.terrace < -0.6 && d.out < -1.2; };
    const P3 = (x, z) => [x, heightAt(x, z) + 0.1, z];
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      if (!(on(x, z) && on(x + step, z) && on(x, z + step) && on(x + step, z + step))) continue;
      const a = P3(x, z), bq = P3(x + step, z), c = P3(x, z + step), d = P3(x + step, z + step);
      pos.push(...a, ...c, ...bq, ...bq, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(L, g, 0, 0, 0);
  }
  return b;
}

// ---------------------------------------------------------------- Dunvegan
export function buildDunvegan() {
  const Y = DUN_TOP;
  // the long facade faces south-east, towards the photographer on the beach
  const rot = THREE.MathUtils.degToRad(35);
  const b = new Builder({ x: -332, y: Y, z: 560 }, rot);
  const S = 'dun_render', R = 'slate', D = 'glass', F = 'trim';
  const w = 30, d = 12, h = 17.5;
  b.box(S, w, h + 2, d, 0, -2, 0);
  b.band(S, 0, 0, w, d, h - 0.9, 0.9, 0.3);
  b.crenelRect(S, 0, 0, w + 0.6, d + 0.6, h, 0.5, 0.9, 1.0, 0.9);
  // corner bartizans
  for (const [sx, sz] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
    const x = sx * (w / 2 + 0.3), z = sz * (d / 2 + 0.3);
    b.cylinder(S, 0.5, 1.4, x, h - 3.0, z, 12, false, 1.15);
    b.tower(S, R, x, h - 1.6, z, 1.15, 2.8, { crenel: true, collide: false, seg: 14 });
  }
  // left tower slightly taller with the flagpole
  b.box(S, 4.5, 3.0, 4.5, -w / 2 + 2.4, h, d / 2 - 2.4, 0, false);
  b.crenelRect(S, -w / 2 + 2.4, d / 2 - 2.4, 4.6, 4.6, h + 3.0, 0.4, 0.7, 0.8, 0.6);
  b.cylinder(F, 0.06, 6.5, -w / 2 + 2.4, h + 3.0, d / 2 - 2.4, 6, false);
  // roofs inside the parapet: a hipped slate roof to the right
  b.gableRoof(R, S, w / 2 - 6, h - 0.5, 0, 9, d - 2, 3.0, { overhang: 0 });
  b.gableRoof(R, S, -3, h - 0.5, 0, 9, d - 2, 2.2, { overhang: 0 });
  // chimneys
  b.chimney(S, w / 2 - 2.2, h, d / 2 - 2.6, 1.2, 1.0, 3.6);
  b.chimney(S, w / 2 - 0.9, h, -d / 2 + 2.5, 1.0, 1.0, 3.0);
  b.chimney(S, 1.5, h, -1, 1.4, 1.0, 2.8);
  // windows on the facade (4 rows) and sides
  b.windows(D, F, 'z+', d / 2, -w / 2 + 4.5, w / 2 - 3.5, 4, 6, 1.6, 3.6, 0.95, 1.9, { skip: (r, c) => r === 0 && c === 2 });
  b.windows(D, F, 'x+', w / 2, -d / 2 + 3, d / 2 - 3, 4, 3, 1.6, 3.6, 0.95, 1.9);
  b.windows(D, F, 'x-', -w / 2, -d / 2 + 3, d / 2 - 3, 3, 3, 4.0, 3.6, 0.9, 1.7);
  b.windows(D, F, 'z-', -d / 2, -w / 2 + 4.5, w / 2 - 3.5, 3, 5, 3.0, 3.6, 0.9, 1.8);
  // a lower bay on the right of the facade
  b.box(S, 7, 7.5, 3, w / 2 - 5, -2, d / 2 + 1.4);
  b.crenels(S, w / 2 - 8.5, d / 2 + 2.9, w / 2 - 1.5, d / 2 + 2.9, 5.5, 0.4, 0.6, 0.6, 0.5);
  // parapet wall running along the crag edge to the west, with little turrets
  b.wall(S, -w / 2 - 1, d / 2 - 1, -w / 2 - 15, d / 2 + 3, -3, 4.4, 0.8);
  b.tower(S, R, -w / 2 - 15.3, -1.5, d / 2 + 3.2, 0.9, 3.4, { crenel: true, collide: false, seg: 12 });
  b.tower(S, R, -w / 2 - 8, -1.5, d / 2 + 1.0, 0.7, 3.0, { crenel: false, collide: false, seg: 10 });
  return b;
}

// ---------------------------------------------------------------- the kirkyard
// Laid out from the photograph itself: points marked in the image (percent) are cast from the
// photographer's camera onto the kirkyard ground, so the tomb wall, obelisk and stones stand
// exactly where the picture shows them.
export function buildKirkyard(photo) {
  const cam = photo.camera;
  const pc = new THREE.PerspectiveCamera(cam.vfov, photo.aspect, 0.5, 2000);
  pc.position.set(...cam.pos); pc.rotation.order = 'YXZ';
  pc.rotation.set(THREE.MathUtils.degToRad(cam.pitch), -THREE.MathUtils.degToRad(cam.yaw), 0);
  pc.updateMatrixWorld(); pc.updateProjectionMatrix();
  const gy = cam.pos[1] - 1.9;
  const ray = (u, v) => new THREE.Vector3(u / 50 - 1, 1 - v / 50, 0.5).unproject(pc).sub(pc.position).normalize();
  const onGround = (u, v) => { const d = ray(u, v); const t = (gy - cam.pos[1]) / d.y; return [cam.pos[0] + d.x * t, cam.pos[2] + d.z * t]; };
  const heightAbove = (u, v, base) => { // height of image point (u, v) on the vertical through ground point base
    const d = ray(u, v); const t = Math.hypot(base[0] - cam.pos[0], base[1] - cam.pos[2]) / Math.hypot(d.x, d.z);
    return cam.pos[1] + d.y * t - gy;
  };
  const yaw = THREE.MathUtils.degToRad(cam.yaw);
  const fwd = [Math.sin(yaw), -Math.cos(yaw)];
  const b = new Builder({ x: 0, y: 0, z: 0 }, 0);
  const T = 'tomb', S = 'edin_stone';
  const bays = 14;
  const a = onGround(4, 81.5), c = onGround(70, 62.2);
  const wallH = heightAbove(10, 45.8, onGround(10, 78.8));
  const ry = Math.atan2(-(c[1] - a[1]), c[0] - a[0]);
  const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const dir = [(c[0] - a[0]) / len, (c[1] - a[1]) / len];
  const nrm = [-dir[1], dir[0]]; // facing the lawn side
  const side = (nrm[0] * fwd[0] + nrm[1] * fwd[1]) < 0 ? 1 : -1;
  const bw = len / bays;
  for (let i = 0; i < bays; i++) {
    const t = (i + 0.5) * bw;
    const x = a[0] + dir[0] * t, z = a[1] + dir[1] * t;
    const y = heightAt(x, z) - 0.3;
    const hgt = wallH * (0.92 + ((i * 37) % 5) * 0.03);
    b.box(T, bw - 0.25, hgt, 1.6, x, y, z, ry);
    // pilasters & cornice
    b.box(T, 0.5, hgt + 0.35, 2.0, x + dir[0] * (bw / 2 - 0.15), y, z + dir[1] * (bw / 2 - 0.15), ry);
    b.add(T, new THREE.BoxGeometry(bw + 0.1, 0.45, 2.1), x, y + hgt + 0.2, z, ry);
    // pediment on alternate bays
    if (i % 2 === 0) {
      const sh = new THREE.Shape();
      sh.moveTo(-bw / 2 + 0.2, 0); sh.lineTo(bw / 2 - 0.2, 0); sh.lineTo(0, 0.9); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: false });
      g.translate(0, 0, -0.7);
      b.add(T, g, x, y + hgt + 0.4, z, ry);
    }
    // recessed arched panel (dark) facing the lawn
    const pz = 0.82 * side;
    const px = x + nrm[0] * pz, pzz = z + nrm[1] * pz;
    b.add('tombdark', new THREE.BoxGeometry(bw * 0.3, hgt * 0.42, 0.06), px, y + hgt * 0.45, pzz, ry);
  }
  // obelisk
  const ob = onGround(82, 66);
  const oy = heightAt(ob[0], ob[1]);
  const k = Math.min(1.2, heightAbove(82, 52.3, ob) / 8.7);   // as tall as it stands in the photograph
  b.box(T, 1.6 * k, 1.0 * k, 1.6 * k, ob[0], oy - 0.3, ob[1]);
  b.box(T, 1.1 * k, 1.4 * k, 1.1 * k, ob[0], oy + 0.7 * k, ob[1]);
  b.add(T, new THREE.CylinderGeometry(0.25 * k, 0.55 * k, 6.0 * k, 4, 1), ob[0], oy + 5.1 * k, ob[1], Math.PI / 4);
  b.add(T, new THREE.ConeGeometry(0.3 * k, 0.6 * k, 4), ob[0], oy + 8.4 * k, ob[1], Math.PI / 4);
  b.collideBox(ob[0], oy + 1, ob[1], 1.6, 3, 1.6);
  // headstones
  const stones = [[17, 92.5, 0.6], [86, 64.5, -0.1], [95, 63.5, 0.05], [90, 63, 0.1], [99, 64.5, -0.2]];
  for (const [u, v, tilt] of stones) {
    const [x, z] = onGround(u, v);
    const y = heightAt(x, z) - 0.25;
    b.add(T, new THREE.BoxGeometry(0.9, 1.5, 0.22), x, y + 0.75, z, ry + 0.2, tilt * 0.3, tilt);
  }
  // low back wall on the far side of the lawn
  const w0 = onGround(78, 66.5), w1 = onGround(99, 66);
  b.wall(S, w0[0], w0[1], w1[0], w1[1], heightAt((w0[0] + w1[0]) / 2, (w0[1] + w1[1]) / 2) - 0.6, 1.6, 0.6);
  return b;
}

// a white cottage on the mainland (far right of "Silver Hour")
export function buildCottage() {
  const x = 268, z = -8;
  const y = heightAt(x, z);
  const b = new Builder({ x, y: y - 0.4, z }, 0.3);
  b.box('harl', 9, 4.5, 5.5, 0, 0, 0);
  b.gableRoof('slate', 'harl', 0, 4.5, 0, 9, 5.5, 2.6, { overhang: 0.3 });
  b.chimney('harl', -4.2, 6.0, 0, 0.8, 0.9, 1.6);
  b.chimney('harl', 4.2, 6.0, 0, 0.8, 0.9, 1.6);
  b.windows('glass', 'trim', 'z+', 2.75, -2.5, 2.5, 1, 3, 1.0, 0, 0.8, 1.1);
  return b;
}
