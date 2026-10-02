// A small architectural modelling kit: walls, gables, crow-stepped gables, crenellations,
// towers, chimney stacks, windows, arched bridges. Geometry is collected into bins (one per
// material) and merged; simple colliders are recorded for the walker.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

function clean(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  if (!ng.attributes.normal) ng.computeVertexNormals();
  return ng;
}

export class Builder {
  constructor(origin = { x: 0, y: 0, z: 0 }, rotY = 0) {
    this.bins = {};
    this.colliders = [];
    this.frame = new THREE.Matrix4().compose(new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1));
    this.rotY = rotY;
    this.origin = origin;
  }

  // local -> world point
  world(x, y, z) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.frame);
  }

  add(bin, geo, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    _e.set(rx, ry, rz, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    const g = clean(geo);
    g.applyMatrix4(_m);
    g.applyMatrix4(this.frame);
    (this.bins[bin] ||= []).push(g);
    return g;
  }

  collideBox(cx, cy, cz, w, h, d, ry = 0, walkable = false) {
    const c = this.world(cx, cy, cz);
    this.colliders.push({ type: 'box', x: c.x, y: c.y, z: c.z, hx: w / 2, hy: h / 2, hz: d / 2, rot: ry + this.rotY, walkable });
  }

  collideCyl(cx, cz, r, y0, y1) {
    const c = this.world(cx, 0, cz);
    this.colliders.push({ type: 'cyl', x: c.x, z: c.z, r, y0: y0 + this.origin.y, y1: y1 + this.origin.y });
  }

  // ---- primitives (positions are the centre of the base unless noted)
  box(bin, w, h, d, x, y, z, ry = 0, collide = true) {
    this.add(bin, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry);
    if (collide) this.collideBox(x, y + h / 2, z, w, h, d, ry);
  }

  cylinder(bin, r, h, x, y, z, seg = 20, collide = true, rTop = r) {
    this.add(bin, new THREE.CylinderGeometry(rTop, r, h, seg, 1), x, y + h / 2, z);
    if (collide) this.collideCyl(x, z, Math.max(r, rTop), y, y + h);
  }

  cone(bin, r, h, x, y, z, seg = 20) {
    this.add(bin, new THREE.ConeGeometry(r, h, seg, 1), x, y + h / 2, z);
  }

  // wall segment between two local points (x,z) at base y with height h & thickness t
  wall(bin, ax, az, bx, bz, y, h, t, collide = true) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(-(bz - az), bx - ax);
    this.box(bin, len + t * 0.5, h, t, (ax + bx) / 2, y, (az + bz) / 2, ry, collide);
  }

  // crenellations (merlons) along a segment on top of a wall at height y
  crenels(bin, ax, az, bx, bz, y, t, mw = 0.8, mh = 0.9, gap = 0.7) {
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(-(bz - az), bx - ax);
    const n = Math.max(1, Math.floor((len + gap) / (mw + gap)));
    const used = n * mw + (n - 1) * gap;
    const start = (len - used) / 2 + mw / 2;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let i = 0; i < n; i++) {
      const s = start + i * (mw + gap);
      this.add(bin, new THREE.BoxGeometry(mw, mh, t), ax + dx * s, y + mh / 2, az + dz * s, ry);
    }
  }

  // run crenels round a closed rectangle (centre x,z, size w x d)
  crenelRect(bin, x, z, w, d, y, t, mw, mh, gap) {
    const hw = w / 2, hd = d / 2;
    this.crenels(bin, x - hw, z - hd, x + hw, z - hd, y, t, mw, mh, gap);
    this.crenels(bin, x + hw, z - hd, x + hw, z + hd, y, t, mw, mh, gap);
    this.crenels(bin, x + hw, z + hd, x - hw, z + hd, y, t, mw, mh, gap);
    this.crenels(bin, x - hw, z + hd, x - hw, z - hd, y, t, mw, mh, gap);
  }

  // corbel course / string course band round a rectangle
  band(bin, x, z, w, d, y, h, out) {
    this.box(bin, w + out * 2, h, d + out * 2, x, y, z, 0, false);
  }

  // gabled roof: ridge along local x (length w), span d; base at y, rise h. Slopes go to `roofBin`,
  // gable triangles to `wallBin` (optionally crow-stepped).
  gableRoof(roofBin, wallBin, x, y, z, w, d, h, opts = {}) {
    const ry = opts.ry || 0;
    const over = opts.overhang ?? 0.3;
    const hw = w / 2 + over * 0.3, hd = d / 2 + over;
    const th = 0.25;
    // two slopes as thin boxes, from the eave (with overhang) up to the ridge
    const cx = x, cz = z;
    const local = (lx, lz) => [cx + lx * Math.cos(ry) + lz * Math.sin(ry), cz - lx * Math.sin(ry) + lz * Math.cos(ry)];
    const drop = over * h / (d / 2);
    const run = hd, rise = h + drop;
    const slopeLen = Math.hypot(run, rise);
    const ang = Math.atan2(rise, run);
    const cy = y - drop + rise / 2 + th / 2;
    for (const sgn of [-1, 1]) {
      const [px, pz] = local(0, sgn * run / 2);
      this.add(roofBin, new THREE.BoxGeometry(hw * 2, th, slopeLen), px, cy, pz, ry, sgn * ang);
    }
    // ridge
    this.add(roofBin, new THREE.BoxGeometry(hw * 2, 0.22, 0.35), cx, y + h + 0.05, cz, ry);
    // gable ends
    const gd = d / 2;
    for (const sgn of [-1, 1]) {
      const ex = sgn * w / 2;
      if (opts.crowstep) {
        const steps = opts.steps || 6;
        const sh = h / steps;
        for (let i = 0; i < steps; i++) {
          const halfW = gd * (1 - i / steps);
          const [px, pz] = local(ex - sgn * 0.3, 0);
          this.add(wallBin, new THREE.BoxGeometry(0.6, sh * (i === steps - 1 ? 1.6 : 1.15), halfW * 2 + 0.3), px, y + i * sh + sh * 0.5, pz, ry);
        }
      } else {
        const shape = new THREE.Shape();
        shape.moveTo(-gd, 0); shape.lineTo(gd, 0); shape.lineTo(0, h); shape.closePath();
        const tg = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false });
        tg.translate(0, 0, -0.25);
        const [px, pz] = local(ex - sgn * 0.25, 0);
        this.add(wallBin, tg, px, y, pz, ry + Math.PI / 2);
      }
    }
  }

  chimney(bin, x, y, z, w, d, h, potBin = bin) {
    this.box(bin, w, h, d, x, y, z, 0, false);
    this.box(bin, w + 0.2, 0.25, d + 0.2, x, y + h - 0.1, z, 0, false);
    const n = Math.max(1, Math.round(w / 0.6));
    for (let i = 0; i < n; i++) {
      const px = x - w / 2 + (i + 0.5) * (w / n);
      this.cylinder(potBin, 0.14, 0.55, px, y + h + 0.15, z, 8, false);
    }
  }

  // window grid on a facade. face: 'x+','x-','z+','z-' outward normal of the facade plane at `plane`
  windows(bin, frameBin, face, plane, u0, u1, rows, cols, y0, rowH, ww, wh, opts = {}) {
    const fr = opts.frame ?? 0.12;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (opts.skip && opts.skip(r, c)) continue;
      const u = cols === 1 ? (u0 + u1) / 2 : u0 + (u1 - u0) * (c / (cols - 1));
      const y = y0 + r * rowH;
      const out = 0.04;
      let x, z, ry;
      if (face === 'x+') { x = plane + out; z = u; ry = Math.PI / 2; }
      else if (face === 'x-') { x = plane - out; z = u; ry = -Math.PI / 2; }
      else if (face === 'z+') { x = u; z = plane + out; ry = 0; }
      else { x = u; z = plane - out; ry = Math.PI; }
      this.add(bin, new THREE.BoxGeometry(ww, wh, 0.08), x, y + wh / 2, z, ry);
      if (frameBin) {
        // frame: sill + lintel + jambs
        const g = new THREE.BoxGeometry(ww + fr * 2, fr, 0.16);
        this.add(frameBin, g, x, y - fr / 2, z, ry);
        this.add(frameBin, new THREE.BoxGeometry(ww + fr * 2, fr, 0.16), x, y + wh + fr / 2, z, ry);
        const side = (s) => {
          const ox = s * (ww / 2 + fr / 2);
          this.add(frameBin, new THREE.BoxGeometry(fr, wh, 0.16), x + Math.cos(ry) * ox, y + wh / 2, z - Math.sin(ry) * ox, ry);
        };
        side(-1); side(1);
        if (opts.mullion) this.add(frameBin, new THREE.BoxGeometry(ww, fr * 0.6, 0.12), x, y + wh * 0.55, z, ry);
      }
    }
  }

  // round tower with optional conical roof and crenellated top
  tower(bin, roofBin, x, y, z, r, h, opts = {}) {
    this.cylinder(bin, r, h, x, y, z, opts.seg || 20, opts.collide !== false);
    if (opts.corbel) this.cylinder(bin, r + 0.35, 0.6, x, y + h - 0.6, z, opts.seg || 20, false);
    if (opts.crenel) {
      const n = Math.max(6, Math.round(r * 4));
      for (let i = 0; i < n; i += 1) {
        if (i % 2) continue;
        const a = (i / n) * Math.PI * 2;
        this.add(bin, new THREE.BoxGeometry(0.7, 0.8, 0.45), x + Math.cos(a) * (r + 0.1), y + h + 0.4, z + Math.sin(a) * (r + 0.1), -a + Math.PI / 2);
      }
    }
    if (opts.cone) this.cone(roofBin, r + 0.35, opts.cone, x, y + h, z, opts.seg || 20);
  }

  build(materials, opts = {}) {
    const group = new THREE.Group();
    for (const [bin, geos] of Object.entries(this.bins)) {
      const g = mergeGeometries(geos, false);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[bin] || materials.default);
      mesh.castShadow = opts.castShadow !== false;
      mesh.receiveShadow = true;
      mesh.name = bin;
      group.add(mesh);
    }
    return group;
  }
}

// An arched masonry bridge: deck height function, arch list [{x, span, rise}], width.
// Built as an extruded elevation profile along local x with arch openings; parapets on top.
export function arch(b, bin, x0, x1, width, deckY, arches, baseY = -2.5) {
  const shape = new THREE.Shape();
  const N = Math.ceil((x1 - x0) / 1.0);
  shape.moveTo(x0, baseY);
  shape.lineTo(x1, baseY);
  for (let i = N; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / N;
    shape.lineTo(x, deckY(x));
  }
  shape.closePath();
  for (const a of arches) {
    const hole = new THREE.Path();
    const l = a.x - a.span / 2, r = a.x + a.span / 2;
    hole.moveTo(l, baseY + 0.01);
    hole.lineTo(l, a.spring);
    const seg = 24;
    for (let i = 0; i <= seg; i++) {
      const t = Math.PI - (i / seg) * Math.PI;
      hole.lineTo(a.x + Math.cos(t) * a.span / 2, a.spring + Math.sin(t) * a.rise);
    }
    hole.lineTo(r, baseY + 0.01);
    hole.closePath();
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
  g.translate(0, 0, -width / 2);
  b.add(bin, g, 0, 0, 0);
  // voussoir rings round each arch (slightly proud)
  for (const a of arches) {
    const ring = new THREE.Shape();
    const seg = 24, R0 = 1, th = 0.55;
    for (let i = 0; i <= seg; i++) {
      const t = Math.PI - (i / seg) * Math.PI;
      ring.lineTo(Math.cos(t) * (a.span / 2 + th), Math.sin(t) * (a.rise + th));
    }
    for (let i = seg; i >= 0; i--) {
      const t = Math.PI - (i / seg) * Math.PI;
      ring.lineTo(Math.cos(t) * a.span / 2, Math.sin(t) * a.rise);
    }
    const rg = new THREE.ExtrudeGeometry(ring, { depth: width + 0.2, bevelEnabled: false, curveSegments: 24 });
    rg.translate(a.x, a.spring, -width / 2 - 0.1);
    b.add(bin, rg, 0, 0, 0);
  }
}
