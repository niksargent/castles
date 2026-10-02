// Living surface: trees (leaf-card canopies coloured with foliage cut from the photos),
// boulders (rock textures from the photos), and GPU grass whose colour is sampled from the
// baked ground beneath it, so every blade carries the photograph's palette.
import * as THREE from 'three';
import { sample, normalAt, SITES } from './geography.js';
import { meshHeightAt as heightAt } from './terrain.js';
import { mulberry32, simplex, fbm, smoothstep, hash2 } from '../util/noise.js';
import { patchWorldMaterial, PROJ, PROJ_PARS } from '../render/worldMaterial.js';

// ------------------------------------------------------------------ leaf alpha texture
function leafAlphaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 900; i++) {
    const x = 128 + (r() - 0.5) * 236 * Math.sqrt(r()), y = 128 + (r() - 0.5) * 236 * Math.sqrt(r());
    const d = Math.hypot(x - 128, y - 128);
    if (d > 118) continue;
    const s = 2.5 + r() * 5;
    const v = 150 + r() * 105;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI);
    g.beginPath(); g.ellipse(0, 0, s, s * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function canopyGeometry(seed, cards = 70, flat = 1.0) {
  const r = mulberry32(seed);
  const pos = [], nor = [], uv0 = [], uv1 = [], idx = [];
  // a few blobs make an irregular crown
  const blobs = [];
  const nb = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) blobs.push([(r() - 0.5) * 0.9, 0.2 + r() * 0.8, (r() - 0.5) * 0.9, 0.55 + r() * 0.35]);
  for (let k = 0; k < cards; k++) {
    const b = blobs[k % nb];
    const th = r() * Math.PI * 2, ph = Math.acos(2 * r() - 1);
    const rr = Math.cbrt(r()) * b[3];
    const cx = b[0] + Math.sin(ph) * Math.cos(th) * rr;
    const cy = b[1] + Math.cos(ph) * rr * 0.8 * flat;
    const cz = b[2] + Math.sin(ph) * Math.sin(th) * rr;
    const n = new THREE.Vector3(cx, cy - 0.5, cz).normalize();
    // card orientation random
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * Math.PI, r() * Math.PI, r() * Math.PI));
    const s = 0.8 + r() * 0.45;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const base = pos.length / 3;
    const ox = r() * 0.75, oy = r() * 0.75;
    for (const [u, v] of corners) {
      const p = new THREE.Vector3(u * s * 0.5, v * s * 0.5, 0).applyQuaternion(q);
      pos.push(cx + p.x, cy + p.y, cz + p.z);
      nor.push(n.x, n.y, n.z);
      uv0.push((u + 1) / 2, (v + 1) / 2);
      uv1.push(ox + (u + 1) * 0.125, oy + (v + 1) * 0.125);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv0, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  g.setIndex(idx);
  return g;
}

// keep each photographer's spot and the near part of their view clear of trees
let VIEWS = [];
function blocksView(x, z) {
  for (const v of VIEWS) {
    const dx = x - v.x, dz = z - v.z;
    const d = Math.hypot(dx, dz);
    if (d < 10) return true;
    if (d < 55) {
      const a = Math.atan2(dx, -dz) - v.yaw;
      const da = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      if (da < v.half + 0.12) return true;
    }
  }
  return false;
}

function placeTrees(rand, count, region, test) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 40) {
    tries++;
    const x = region.x0 + rand() * (region.x1 - region.x0);
    const z = region.z0 + rand() * (region.z1 - region.z0);
    if (blocksView(x, z)) continue;
    const s = sample(x, z);
    if (s.h < 0.8) continue;
    const p = test(x, z, s);
    if (rand() > p) continue;
    out.push([x, heightAt(x, z), z]);
  }
  return out;
}

export function createTrees(swatchTex, colliders, swatchMeans = {}, photos = []) {
  VIEWS = photos.map((p) => {
    const vf = THREE.MathUtils.degToRad(p.camera.vfov);
    return { x: p.camera.pos[0], z: p.camera.pos[2], yaw: THREE.MathUtils.degToRad(p.camera.yaw), half: Math.atan(Math.tan(vf / 2) * p.aspect) };
  });
  const alpha = leafAlphaTexture();
  const group = new THREE.Group();
  const rand = mulberry32(99);
  const canopyGeos = [canopyGeometry(1, 34), canopyGeometry(2, 40, 1.2), canopyGeometry(3, 30, 0.8)];
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.14, 1, 6, 1).translate(0, 0.5, 0);
  const trunkMat = patchWorldMaterial(new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }), { key: 'trunk' });

  const sets = [
    // forested north ridge & headland (Eilean Donan backdrop)
    { name: 'ed_forest', tex: 'ed_forest', count: 2600, scale: [9, 15], region: { x0: -760, x1: -100, z0: -620, z1: -200 }, test: (x, z, s) => s.forest * 1.0 },
    // Edinburgh gardens round the crag foot
    { name: 'edin_foliage', tex: 'edin_foliage', count: 1000, scale: [7, 13], region: { x0: 400, x1: 820, z0: -170, z1: 230 }, test: (x, z, s) => s.forest * 1.2 },
    // Dunvegan woods
    { name: 'dun_trees', tex: 'dun_trees', count: 260, scale: [6, 11], region: { x0: -312, x1: -220, z0: 500, z1: 600 }, test: (x, z, s) => s.forest * 1.5 * (z < 590 - (x + 312) * 0.3 ? 1 : 0) },
    // rowans burning red below the walls ("Ember") — a small grove on the north-east foot
    { name: 'edin_rowan', tex: 'edin_rowan', count: 40, scale: [5, 8], region: { x0: 600, x1: 700, z0: -110, z1: -40 }, test: (x, z, s) => s.forest * 1.5 },
  ];
  const trees = [];
  for (const set of sets) {
    const pts = placeTrees(rand, set.count, set.region, set.test);
    const map = swatchTex(set.tex);
    map.channel = 1;
    const mean = swatchMeans[set.tex] || [0.3, 0.3, 0.3];
    const lum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    const gain = Math.min(4, Math.max(1, Math.pow(0.32 / Math.max(lum, 0.02), 0.8)));
    const m = new THREE.MeshLambertMaterial({ map, alphaMap: alpha, alphaTest: 0.42, side: THREE.DoubleSide, color: new THREE.Color(gain, gain, gain), emissive: new THREE.Color(gain * 0.32, gain * 0.34, gain * 0.28), emissiveMap: map });
    alpha.channel = 0;
    patchWorldMaterial(m, {
      key: 'canopy-' + set.name,
      vertexMain: `
        // wind sway grows with height in the crown
        float sw = sin(uTime * 1.3 + vWPos.x * 0.07 + vWPos.z * 0.05) * 0.5 + sin(uTime * 2.7 + vWPos.x * 0.3) * 0.2;
      `,
      vertexPars: 'uniform float uTime;',
      onShader: (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.x += sin(uTime * 1.3 + position.y * 0.8 + float(gl_InstanceID) * 0.37) * 0.06 * position.y;
          transformed.z += cos(uTime * 1.1 + position.x * 0.6 + float(gl_InstanceID) * 0.21) * 0.05 * position.y;`);
      },
    });
    m.userData.uniforms.uTime = PROJ.uTime;
    const per = Math.ceil(pts.length / canopyGeos.length);
    canopyGeos.forEach((cg, gi) => {
      const sub = pts.slice(gi * per, (gi + 1) * per);
      if (!sub.length) return;
      const im = new THREE.InstancedMesh(cg, m, sub.length);
      const tm = new THREE.InstancedMesh(trunkGeo, trunkMat, sub.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
      const col = new THREE.Color();
      sub.forEach((p, i) => {
        const s = set.scale[0] + rand() * (set.scale[1] - set.scale[0]);
        const crownBase = s * 0.32;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
        M.compose(P.set(p[0], p[1] + crownBase, p[2]), q, S.set(s * 0.55, s * 0.62, s * 0.55));
        im.setMatrixAt(i, M);
        const v = 0.75 + rand() * 0.5;
        im.setColorAt(i, col.setRGB(v, v * (0.92 + rand() * 0.16), v));
        M.compose(P.set(p[0], p[1] - 0.3, p[2]), q, S.set(s * 0.12 + 0.2, crownBase + 1.2, s * 0.12 + 0.2));
        tm.setMatrixAt(i, M);
        trees.push({ x: p[0], z: p[2], y: p[1], s });
        if (s > 7) colliders.push({ type: 'cyl', x: p[0], z: p[2], r: 0.25 + s * 0.02, y0: p[1] - 1, y1: p[1] + crownBase + 2 });
      });
      im.castShadow = true; im.receiveShadow = true;
      tm.castShadow = true;
      im.layers.set(1); tm.layers.set(1);
      im.computeBoundingSphere(); tm.computeBoundingSphere();
      group.add(im, tm);
    });
  }
  return { group, trees };
}

// ------------------------------------------------------------------ boulders
function rockGeometry(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const r = mulberry32(seed);
  const o = [r() * 100, r() * 100, r() * 100];
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = simplex(v.x * 1.3 + o[0], v.y * 1.3 + v.z * 0.7 + o[1]) * 0.22 + simplex(v.x * 3.1 + o[2], v.z * 3.1 - v.y) * 0.08;
    const flatten = v.y < -0.2 ? 0.5 : 1.0;
    v.multiplyScalar(1 + n);
    v.y *= flatten;
    // facets
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createRocks(swatchTex, viewpoints, colliders) {
  const group = new THREE.Group();
  const rand = mulberry32(2024);
  const geos = [rockGeometry(1), rockGeometry(2), rockGeometry(3), rockGeometry(4, 2)];
  const mats = {};
  const matFor = (name, tint = 1) => {
    if (!mats[name]) {
      mats[name] = patchWorldMaterial(new THREE.MeshStandardMaterial({ roughness: 0.92, color: 0xffffff }), {
        key: 'rock-' + name, triMap: swatchTex(name), triScale: 0.33, grime: 0.0,
        tint: new THREE.Color(tint, tint, tint),
      });
    }
    return mats[name];
  };
  const lists = {};
  const add = (name, x, z, s, sy = 0.6, sink = 0.35, tint = 1) => {
    const h = heightAt(x, z);
    (lists[name] ||= []).push({ x, y: h - s * sy * sink, z, s, sy, rot: rand() * Math.PI * 2, tint });
    if (s > 0.9) colliders.push({ type: 'cyl', x, z, r: s * 0.8, y0: h - 2, y1: h + s * sy * (1 - sink) * 0.9, walkable: true });
  };
  const vp = Object.fromEntries(viewpoints.map((p) => [p.id, p]));
  const fwd = (p, f, l) => {
    const y = THREE.MathUtils.degToRad(p.camera.yaw);
    const cp = p.camera.pos;
    return [cp[0] + Math.sin(y) * f - Math.cos(y) * l, cp[2] - Math.cos(y) * f - Math.sin(y) * l];
  };
  // shoreline scatter across the Eilean Donan region
  for (let i = 0; i < 2600; i++) {
    const x = -720 + rand() * 1000, z = -330 + rand() * 1100;
    const s0 = sample(x, z);
    if (s0.h < -0.5 || s0.h > 2.6 || s0.region[0] < 0.5) continue;
    if (Math.hypot(x - 2, z) < 30) continue;
    const cl = fbm(x / 40, z / 40, 2);
    if (cl < 0.05) continue;
    const name = s0.h < 0.5 ? 'ed_wrack' : (rand() < 0.5 ? 'ed_lichen' : 'ed_rock');
    add(name, x, z, 0.3 + Math.pow(rand(), 2.5) * 2.2);
  }
  // foreground boulder fields at the photographers' feet
  const field = (id, name, n, fRange, lRange, sRange, opts = {}) => {
    const p = vp[id];
    if (!p) return;
    for (let i = 0; i < n; i++) {
      const f = fRange[0] + rand() * (fRange[1] - fRange[0]);
      const l = lRange[0] + rand() * (lRange[1] - lRange[0]);
      const [x, z] = fwd(p, f, l);
      if (Math.hypot(x - p.camera.pos[0], z - p.camera.pos[2]) < (opts.clear ?? 1.5)) continue;
      add(name, x, z, sRange[0] + Math.pow(rand(), 1.6) * (sRange[1] - sRange[0]), opts.sy ?? 0.65, opts.sink ?? 0.3);
    }
  };
  field('ed_silver', 'ed_lichen', 70, [-4, 18], [-26, -2], [0.6, 2.8]);          // the dark stones spilling in from the right
  field('ed_lichen', 'ed_lichen', 120, [0, 22], [-14, 16], [0.5, 2.6], { clear: 2.2 });
  field('ed_storm', 'ed_wrack', 90, [1, 12], [-12, 12], [0.25, 0.9], { sink: 0.45 }); // red weed on the stones at the water's edge
  field('ed_verdigris', 'ed_wrack', 40, [6, 14], [-8, 8], [0.3, 1.0], { sink: 0.5 });
  field('ed_heather', 'ed_lichen', 10, [3, 9], [-9, -5], [0.6, 1.4]);
  field('dunvegan', 'dun_cliff', 40, [2, 30], [-6, 25], [0.15, 0.5], { sink: 0.5 });
  // the great lichened slab south of the keep ("Verdigris")
  add('ed_rock', -12, 26, 6.5, 0.25, 0.25);
  add('ed_rock', 10, 22, 4.0, 0.3, 0.3);
  add('ed_rock', -26, 12, 3.4, 0.35, 0.3);
  // Edinburgh crag foot debris and Dunvegan crag boulders
  for (let i = 0; i < 260; i++) {
    const a = rand() * Math.PI * 2, r = 70 + rand() * 30;
    const x = 610 + Math.cos(a) * r * (Math.cos(a) < 0 ? 1 : 1.3), z = 30 + Math.sin(a) * r * 0.85;
    const s = sample(x, z);
    if (s.h > 30 || s.h < 1) continue;
    add('edin_crag', x, z, 0.3 + Math.pow(rand(), 3) * 1.4);
  }
  for (const [name, list] of Object.entries(lists)) {
    const per = Math.ceil(list.length / geos.length);
    geos.forEach((g, gi) => {
      const sub = list.slice(gi * per, (gi + 1) * per);
      if (!sub.length) return;
      const im = new THREE.InstancedMesh(g, matFor(name), sub.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
      sub.forEach((r, i) => {
        q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.4, r.rot, (rand() - 0.5) * 0.4));
        M.compose(P.set(r.x, r.y, r.z), q, S.set(r.s * (0.9 + rand() * 0.5), r.s * r.sy, r.s * (0.8 + rand() * 0.4)));
        im.setMatrixAt(i, M);
      });
      im.castShadow = true; im.receiveShadow = true;
      im.layers.set(1);
      im.computeBoundingSphere();
      group.add(im);
    });
  }
  return group;
}

// ------------------------------------------------------------------ GPU grass
export function createGrass({ heightTex, groundTex, hmap, count = 170 }) {
  // a tuft of 5 curved blades
  const blades = 6, segs = 2;
  const pos = [], uvs = [], idx = [];
  const r = mulberry32(7);
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, off = [Math.cos(a) * 0.12 * r(), Math.sin(a) * 0.12 * r()];
    const lean = [Math.cos(a + 1.5) * 0.25, Math.sin(a + 1.5) * 0.25];
    const w = 0.018 + r() * 0.012, h = 0.26 + r() * 0.32;
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ww = w * (1 - t * 0.85);
      const cx = off[0] + lean[0] * t * t, cz = off[1] + lean[1] * t * t;
      const px = Math.cos(a) * ww, pz = Math.sin(a) * ww;
      pos.push(cx - px, h * t, cz - pz, cx + px, h * t, cz + pz);
      uvs.push(0, t, 1, t);
    }
    for (let s = 0; s < segs; s++) {
      const i0 = base + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  const N = count * count;
  const offs = new Float32Array(N * 2);
  for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) {
    offs[(j * count + i) * 2] = i - count / 2;
    offs[(j * count + i) * 2 + 1] = j - count / 2;
  }
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 2));
  g.instanceCount = N;
  const cell = 0.45;
  const uniforms = {
    ...PROJ,
    uProjTight: { value: 0 },
    uHeight: { value: heightTex },
    uGround: { value: groundTex },
    uHmap: { value: new THREE.Vector4(hmap.x0, hmap.z0, hmap.size, 0) },
    uCam: { value: new THREE.Vector3() },
    uCell: { value: cell },
    uRadius: { value: count * cell * 0.5 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.001 },
    uWind: { value: 1.0 },
    uGain: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aOff;
      uniform sampler2D uHeight, uGround;
      uniform vec4 uHmap;
      uniform vec3 uCam;
      uniform float uCell, uRadius, uTime, uWind;
      varying vec3 vCol;
      varying float vT;
      varying vec3 vWPos;
      varying float vFade;
      float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec2 camCell = floor(uCam.xz / uCell);
        vec2 cellId = camCell + aOff;
        vec2 jit = vec2(h1(cellId), h1(cellId + 17.1));
        vec2 wp = (cellId + jit) * uCell;
        vec2 huv = (wp - uHmap.xy) / uHmap.z;
        float hgt = texture(uHeight, huv).r;
        vec4 gnd = texture(uGround, vec2(huv.x, 1.0 - huv.y));
        float density = gnd.a;
        float d = length(wp - uCam.xz);
        float fade = 1.0 - smoothstep(uRadius * 0.55, uRadius * 0.98, d);
        float rnd = h1(cellId + 3.3);
        float keep = step(rnd, density * 1.15) * step(0.25, hgt);
        float sc = (0.6 + h1(cellId + 9.7) * 0.7) * fade * keep;
        float rot = h1(cellId + 5.1) * 6.2831;
        vec3 p = position * sc;
        float c = cos(rot), s = sin(rot);
        p.xz = mat2(c, -s, s, c) * p.xz;
        // wind: slow swells plus flutter, bending the tips
        float t = uv.y;
        float gust = sin(uTime * 0.8 + wp.x * 0.05 + wp.y * 0.03) * 0.5 + 0.5;
        float sway = (sin(uTime * 2.1 + wp.x * 0.35 + wp.y * 0.2) * 0.12 + gust * 0.22) * uWind;
        p.x += sway * t * t * sc;
        p.z += sway * 0.6 * t * t * sc;
        vec3 world = vec3(wp.x, hgt - 0.03, wp.y) + p;
        vWPos = world;
        vT = t;
        vFade = fade;
        vCol = gnd.rgb * (0.8 + h1(cellId + 1.3) * 0.4);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunColor, uAmbient, uFogColor, uCam;
      uniform float uFogDensity, uGain;
      varying vec3 vCol;
      varying float vT;
      varying vec3 vWPos;
      varying float vFade;
      ${PROJ_PARS}
      void main() {
        vec3 base = vCol * uGain;
        vec3 col = base * mix(0.45, 1.25, vT);              // darker at the root, lit tips
        float lit = 0.55 + 0.45 * clamp(uSunDir.y, 0.0, 1.0);
        col = col * (uAmbient + uSunColor * lit * 0.8);
        col += uSunColor * base * pow(vT, 3.0) * 0.25;      // translucency at the tips
        float dist = length(vWPos - uCam);
        float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
        col = mix(col, uFogColor, f);
        vec4 pj = projectPhotos(vWPos, vec3(0.0, 1.0, 0.0));
        gl_FragColor = vec4(mix(col, pj.rgb, pj.a), pj.a);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(2);
  return { mesh, uniforms };
}
