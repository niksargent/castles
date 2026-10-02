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
import { heightAt, EDIN_TOP, DUN_TOP, EDIN_LOWER_TOP, EDIN_LAWN_RISE } from '../world/geography.js';

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
export function buildEdinburgh() {
  const T = EDIN_TOP + 4; // crag-top level (48)
  const b = new Builder({ x: 0, y: 0, z: 0 }, 0);
  const G = 'edin_stone', P = 'edin_pink', W = 'edin_wall', R = 'slate', D = 'glass', F = 'trim', L = 'lawn';

  // the terraces face west, over the kirkyard
  // LOWER CURTAIN WALL along the crag face, following it down to the south turret
  const lowerTop = EDIN_LOWER_TOP;
  const lw = [[545, -24], [541.5, 6], [543, 38], [547, 66]];
  for (let i = 0; i < lw.length - 1; i++) {
    const [ax, az] = lw[i], [bx, bz] = lw[i + 1];
    const base = Math.min(heightAt(ax - 2, az), heightAt(bx - 2, bz)) - 2;
    b.wall(W, ax, az, bx, bz, base, lowerTop - base, 1.8);
    b.wall(W, ax, az, bx, bz, lowerTop, 1.0, 0.6, false);
    b.add(W, new THREE.BoxGeometry(Math.hypot(bx - ax, bz - az) + 1, 0.25, 2.2), (ax + bx) / 2, lowerTop + 0.1, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax));
  }
  // round turret with a conical cap at the south end, bartizan at the north end
  b.tower(W, R, 547.5, heightAt(547, 68) - 3, 68.5, 2.6, lowerTop - heightAt(547, 68) + 7, { corbel: true, cone: 3.2, seg: 20 });
  b.tower(W, R, 545, lowerTop - 1.5, -25, 1.1, 3.0, { cone: 1.6, seg: 12, collide: false });
  b.cylinder(W, 0.4, 1.6, 545, lowerTop - 3.0, -25, 10, false, 1.1);

  // LAWN TERRACE: sloping from the lower wall up to the foot of the upper wall
  {
    const g = new THREE.PlaneGeometry(1, 1, 24, 24);
    const pos = g.attributes.position;
    const z0 = -22, z1 = 64;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5;
      const z = z0 + (z1 - z0) * v;
      // inner edge follows the lower wall, outer edge the upper wall
      const xin = 543 + (z > 6 ? (z - 6) * 0.06 : (6 - z) * 0.11) + 1.2;
      const x = xin + u * (557.5 - xin);
      const y = lowerTop + 0.15 + u * EDIN_LAWN_RISE + Math.sin(v * 9.0) * 0.15;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    // fix winding to face up
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
    g.computeVertexNormals();
    b.add(L, g, 0, 0, 0);
    // fence along the lawn's edge
    for (let z = -20; z < 64; z += 2.2) {
      const xin = 543 + (z > 6 ? (z - 6) * 0.06 : (6 - z) * 0.11) + 1.6;
      b.add(F, new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), xin, lowerTop + 0.7, z);
    }
  }

  // UPPER RETAINING WALL (massive, buttressed) holding up the buildings
  const upX = 558;
  b.box(W, 3.0, T - 22 + 1, 92, upX, 22, 20);
  for (const z of [-18, 4, 30, 52]) b.box(W, 2.2, T - 34, 4, upX - 1.6, 33, z); // buttress-like projections
  b.box(W, 0.7, 1.1, 92, upX - 1.2, T, 20, 0, true);

  // GREAT GABLED HOUSE (the "Governor's House" range) — 3 storeys, steep roof, crow-stepped gables
  const gx = 566, gz = 4, gw = 12, gl = 32, gh = 12;
  b.box(G, gw, gh + 1, gl, gx, T - 1, gz);
  b.gableRoof(R, G, gx, T + gh, gz, gl, gw, 7.0, { ry: Math.PI / 2, crowstep: true, steps: 7, overhang: 0.25 });
  // projecting crow-stepped bay on the west facade
  b.box(G, 2.2, gh + 1, 7, gx - gw / 2 - 1.0, T - 1, gz + 6);
  b.gableRoof(R, G, gx - gw / 2 - 1.0, T + gh, gz + 6, 4.5, 7, 5.5, { ry: 0, crowstep: true, steps: 6, overhang: 0.2 });
  // dormers on the west slope
  for (const z of [gz - 11, gz - 5, gz + 12]) {
    b.box(G, 2.0, 2.2, 1.8, gx - gw / 2 + 2.2, T + gh, z, 0, false);
    b.gableRoof(R, G, gx - gw / 2 + 2.2, T + gh + 2.2, z, 2.0, 1.8, 1.1, { ry: Math.PI / 2, overhang: 0.15 });
    b.windows(D, F, 'x-', gx - gw / 2 + 1.15, z, z, 1, 1, T + gh + 0.4, 0, 0.8, 1.2, { frame: 0.12 });
  }
  // chimneys
  b.chimney(G, gx, T + gh + 6.6, gz - gl / 2 + 0.6, 2.0, 1.2, 3.0);
  b.chimney(G, gx, T + gh + 6.6, gz + gl / 2 - 0.6, 2.0, 1.2, 3.0);
  b.chimney(G, gx + 2.5, T + gh + 3.0, gz - 2, 1.2, 1.0, 5.5);
  b.chimney(G, gx - gw / 2 - 1.0, T + gh + 5.0, gz + 6, 1.0, 1.0, 2.6);
  // windows: three storeys, white frames
  b.windows(D, F, 'x-', gx - gw / 2, gz - 14, gz + 1.5, 3, 6, T + 1.2, 3.8, 0.95, 1.8, { mullion: true });
  b.windows(D, F, 'x-', gx - gw / 2 - 2.1, gz + 4.8, gz + 7.2, 3, 2, T + 1.2, 3.8, 0.9, 1.7, { mullion: true });
  b.windows(D, F, 'x-', gx - gw / 2, gz + 11, gz + 15, 3, 2, T + 1.2, 3.8, 0.95, 1.8, { mullion: true });
  b.windows(D, F, 'z+', gz + gl / 2, gx - 3.5, gx + 3.5, 3, 3, T + 1.2, 3.8, 0.95, 1.8, { mullion: true });
  b.windows(D, F, 'z-', gz - gl / 2, gx - 3.5, gx + 3.5, 3, 3, T + 1.2, 3.8, 0.95, 1.8, { mullion: true });

  // TALL BARRACK BLOCK to the south-east, five storeys
  const tx = 585, tz = 44, tw = 36, td = 14, th = 10.5;
  b.box(P, tw, th + 1, td, tx, T - 1, tz);
  b.gableRoof(R, P, tx, T + th, tz, tw, td, 4.0, { overhang: 0.3 });
  for (let i = 0; i < 6; i++) b.chimney(P, tx - tw / 2 + 3 + i * 6, T + th + 2.0, tz, 1.6, 1.0, 3.2);
  b.chimney(P, tx - tw / 2 + 0.5, T + th + 2.5, tz - 4, 1.4, 1.0, 2.6);
  b.windows(D, F, 'z+', tz + td / 2, tx - tw / 2 + 2.5, tx + tw / 2 - 2.5, 3, 10, T + 1.0, 3.2, 0.9, 1.75);
  b.windows(D, F, 'z-', tz - td / 2, tx - tw / 2 + 2.5, tx + tw / 2 - 2.5, 3, 10, T + 1.0, 3.2, 0.9, 1.75);
  b.windows(D, F, 'x-', tx - tw / 2, tz - 4, tz + 4, 3, 3, T + 1.0, 3.2, 0.9, 1.75);
  // its own retaining wall down the crag
  b.box(W, tw, T - 30, 3, tx, 30, tz + td / 2 + 1.5);

  // NORTH RANGE (lower, dormered)
  const nx = 586, nz = -12;
  b.box(G, 18, 8, 9, nx, T - 1, nz);
  b.gableRoof(R, G, nx, T + 7, nz, 18, 9, 4.2, { crowstep: false, overhang: 0.3 });
  for (const x of [nx - 6, nx, nx + 6]) {
    b.box(G, 1.8, 2.0, 1.6, x, T + 7, nz + 3.6, 0, false);
    b.gableRoof(R, G, x, T + 9, nz + 3.6, 1.8, 1.6, 1.0, { overhang: 0.12 });
  }
  b.windows(D, F, 'z-', nz - 4.5, nx - 7, nx + 7, 2, 5, T + 1.0, 3.2, 0.9, 1.6);
  b.windows(D, F, 'x-', nx - 9, nz - 2, nz + 2, 2, 2, T + 1.0, 3.2, 0.9, 1.6);

  // CROWN SQUARE: palace, great hall, chapel
  b.box(G, 24, 14, 16, 612, T - 1, -6);
  b.gableRoof(R, G, 612, T + 13, -6, 24, 16, 6, { crowstep: true, steps: 6 });
  b.tower(G, R, 600, T - 1, -14, 3.2, 19, { corbel: true, crenel: true, seg: 16 });
  b.windows(D, F, 'z+', 2, 602, 622, 3, 5, T + 1.5, 3.8, 0.9, 1.7);
  b.box(G, 30, 10, 11, 614, T - 1, 22);
  b.gableRoof(R, G, 614, T + 9, 22, 30, 11, 5, {});
  b.windows(D, F, 'z+', 27.5, 601, 627, 1, 6, T + 3, 0, 1.2, 3.2, { mullion: true });
  b.box(G, 9, 6, 6, 636, T - 1, -10);
  b.gableRoof(R, G, 636, T + 5, -10, 9, 6, 3, {});

  // PERIMETER CURTAIN round the crag top
  const ring = [];
  const N = 40;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ex = Math.cos(a) < 0 ? 61 : 82;
    ring.push([610 + Math.cos(a) * ex, 30 + Math.sin(a) * 50]);
  }
  for (let i = 0; i < N; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % N];
    if (ax < 562 && bx < 562) continue; // the west side is the buildings
    if (az > 36 && bz > 36 && ax < 606) continue; // barrack block
    if (az > 55 && bz > 55 && ax < 660) continue; // open south-west skyline (as photographed)
    const base = Math.min(heightAt(ax, az), heightAt(bx, bz)) - 2.5;
    const top = Math.max(T + 1.2, Math.max(heightAt(ax, az), heightAt(bx, bz)) + 1.2);
    b.wall(W, ax, az, bx, bz, base, top - base, 1.5);
    b.crenels(W, ax, az, bx, bz, top, 1.5, 0.8, 0.8, 0.8);
  }
  // GATEHOUSE where the path arrives along the tail
  const gyx = 684, gyz = 30, gy = heightAt(684, 30);
  b.box(W, 7, 13, 6, gyx, gy - 1, gyz - 9);
  b.box(W, 7, 13, 6, gyx, gy - 1, gyz + 9);
  b.box(W, 7, 5, 12, gyx, gy + 6.5, gyz, 0, false);
  b.crenelRect(W, gyx, gyz, 7, 24, gy + 12, 0.6, 0.8, 0.9, 0.7);

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
export function buildKirkyard(cam) {
  // laid out along the photographer's line of sight: tomb wall on the left, lawn ahead,
  // obelisk to the right, castle on the rock beyond.
  const yaw = THREE.MathUtils.degToRad(cam.yaw);
  const fwd = [Math.sin(yaw), -Math.cos(yaw)];
  const left = [-Math.cos(yaw), -Math.sin(yaw)];
  const P = (f, l) => [cam.pos[0] + fwd[0] * f + left[0] * l, cam.pos[2] + fwd[1] * f + left[1] * l];
  const b = new Builder({ x: 0, y: 0, z: 0 }, 0);
  const T = 'tomb', S = 'edin_stone';
  const bays = 12;
  const a = P(3, 8.5), c = P(62, 4.0);
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
    const hgt = 4.0 + ((i * 37) % 5) * 0.25;
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
  const ob = P(42, -11);
  const oy = heightAt(ob[0], ob[1]);
  b.box(T, 1.6, 1.0, 1.6, ob[0], oy - 0.3, ob[1]);
  b.box(T, 1.1, 1.4, 1.1, ob[0], oy + 0.7, ob[1]);
  b.add(T, new THREE.CylinderGeometry(0.25, 0.55, 6.0, 4, 1), ob[0], oy + 2.1 + 3.0, ob[1], Math.PI / 4);
  b.add(T, new THREE.ConeGeometry(0.3, 0.6, 4), ob[0], oy + 8.4, ob[1], Math.PI / 4);
  b.collideBox(ob[0], oy + 1, ob[1], 1.6, 3, 1.6);
  // headstones
  const stones = [[6, -2, 0.3], [30, -14, -0.2], [48, -13, 0.1], [55, -15, 0.05], [24, -18, 0.25], [64, -9, -0.1], [3, 3.5, 0.6]];
  for (const [f, l, tilt] of stones) {
    const [x, z] = P(f, l);
    const y = heightAt(x, z) - 0.25;
    b.add(T, new THREE.BoxGeometry(0.9, 1.5, 0.22), x, y + 0.75, z, ry + 0.2, tilt * 0.3, tilt);
  }
  // low back wall on the far side of the lawn
  const w0 = P(5, -22), w1 = P(70, -18);
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
