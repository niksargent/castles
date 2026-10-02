// Terrain: chunked heightfield with static level of detail (fine at the castles, coarse on the
// far mountains), skirts to hide LOD cracks, and a splat shader that weaves material tiles cut
// from the photographs. Each vertex carries 8 material-class weights and 3 region weights;
// the shader looks up which photo swatch plays each class in each region.
import * as THREE from 'three';
import { sample, heightAt, SITES, WATER_LEVEL } from './geography.js';
import { simplex, fbm, smoothstep, clamp } from '../util/noise.js';
import { patchWorldMaterial } from '../render/worldMaterial.js';

export const CLASSES = ['grass', 'heather', 'rock', 'shore', 'forest', 'wrack', 'path', 'cliff'];
// class x region (ed, edin, dun) -> swatch name
const TABLE = {
  grass: ['ed_grass', 'edin_lawn', 'dun_grass'],
  heather: ['ed_heather', 'edin_lawn', 'dun_shore'],
  rock: ['ed_rock', 'edin_crag', 'dun_cliff'],
  shore: ['ed_shingle', 'ed_shingle', 'dun_pebble'],
  forest: ['ed_forest', 'edin_foliage', 'dun_trees'],
  wrack: ['ed_wrack', 'ed_wrack', 'dun_shore'],
  path: ['ed_turf', 'edin_lawn', 'dun_pebble'],
  cliff: ['ed_lichen', 'edin_crag', 'dun_cliff'],
};
// metres per texture tile (near scale); far scale is multiplied
const CLASS_SCALE = [7, 12, 9, 5, 26, 6, 4, 10];

export const LAYER_NAMES = [...new Set(Object.values(TABLE).flat())];

const CHUNK = 128;
const EXTENT = 4096;

function spacingFor(cx, cz) {
  const d = (x, z) => Math.hypot(cx - x, cz - z);
  if (d(SITES.edinburgh.x, SITES.edinburgh.z) < 150) return 2.0;
  if (d(SITES.dunvegan.x, SITES.dunvegan.z) < 100) return 2.0;
  if (d(0, 0) < 120) return 2.5;
  if (d(SITES.kirkyard.x, SITES.kirkyard.z) < 80) return 2.5;
  const inCore = cx > -760 && cx < 1050 && cz > -560 && cz < 920;
  if (inCore) {
    const h = heightAt(cx, cz);
    return h < -3 ? 16 : 6.4;
  }
  const ex = Math.max(-760 - cx, cx - 1050, 0);
  const ez = Math.max(-560 - cz, cz - 920, 0);
  const dd = Math.hypot(ex, ez);
  return Math.min(42.7, 12.8 * Math.pow(2, dd / 650));
}

// Height of the rendered (piecewise-linear) terrain mesh at (x, z): exactly what you see,
// so feet, rocks and trees sit on the drawn surface rather than the analytic one between vertices.
const _spCache = new Map();
export function meshHeightAt(x, z) {
  const ci = Math.floor((x + EXTENT) / CHUNK), cj = Math.floor((z + EXTENT) / CHUNK);
  const key = ci * 4096 + cj;
  let step = _spCache.get(key);
  const x0 = -EXTENT + ci * CHUNK, z0 = -EXTENT + cj * CHUNK;
  if (step === undefined) {
    const n = Math.max(2, Math.round(CHUNK / spacingFor(x0 + CHUNK / 2, z0 + CHUNK / 2)));
    step = CHUNK / n;
    _spCache.set(key, step);
  }
  const fx = (x - x0) / step, fz = (z - z0) / step;
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const X = x0 + i * step, Z = z0 + j * step;
  const ha = heightAt(X, Z), hb = heightAt(X + step, Z), hc = heightAt(X, Z + step), hd = heightAt(X + step, Z + step);
  if ((i + j) & 1) {
    // diagonal b-c
    return u + v <= 1 ? ha + (hb - ha) * u + (hc - ha) * v : hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }
  // diagonal a-d
  return u >= v ? ha + (hb - ha) * u + (hd - hb) * v : ha + (hc - ha) * v + (hd - hc) * u;
}

function classWeights(x, z, s, n, out) {
  const h = s.h;
  const slope = 1 - n[1];
  const N1 = fbm(x / 35, z / 35, 3), N2 = simplex(x / 12, z / 12), N3 = fbm(x / 140 + 9, z / 140, 3);
  const w = out; w.fill(0);
  const reg = s.region;
  // cliffs and rock outcrops
  // on the big mountains slopes are steep at mesh scale but read as heather & grass from afar
  const mtn = smoothstep(25, 70, h) * (1 - (reg[1] > 0.5 ? 1 : 0));
  const cliff = smoothstep(0.42 + mtn * 0.25, 0.62 + mtn * 0.3, slope + N2 * 0.05);
  const rock = smoothstep(0.2 + mtn * 0.25, 0.4 + mtn * 0.3, slope + N1 * 0.18) * (1 - cliff);
  // shore band
  const shore = (1 - smoothstep(0.6, 1.8 + N1 * 0.6, h)) * (1 - cliff);
  // wrack: weed-covered rocks right at the waterline (Eilean Donan especially)
  const wrack = shore * (1 - smoothstep(0.2, 0.9, Math.abs(h - 0.15 + N2 * 0.25))) * smoothstep(-0.2, 0.25, N1 + 0.15) * (reg[0] + reg[2] * 0.5);
  const forest = s.forest * (1 - cliff) * (1 - shore);
  const path = (1 - smoothstep(1.0, 2.6, s.path + N2 * 0.4)) * (1 - shore) * smoothstep(0.5, 2, h) * (1 - cliff);
  // heather on higher ground and mountains, patchy
  const heather = Math.min(1, smoothstep(0.0, 0.35, N3 + (h - 8) / 40) + mtn * 0.5) * (1 - cliff) * (1 - forest);
  w[7] = cliff;
  w[2] = rock * (1 - shore * 0.5);
  w[5] = wrack;
  w[3] = Math.max(0, shore - wrack);
  w[4] = forest;
  w[6] = path;
  let rem = Math.max(0, 1 - (w[7] + w[2] + w[5] + w[3] + w[4] + w[6]));
  w[1] = rem * heather;
  w[0] = rem * (1 - heather);
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += w[i];
  for (let i = 0; i < 8; i++) w[i] /= sum;
  return w;
}

function buildChunk(cx0, cz0, size, sp) {
  const n = Math.max(2, Math.round(size / sp));
  const step = size / n;
  const vcount = (n + 1) * (n + 1) + 4 * (n + 1);
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const sa = new Float32Array(vcount * 4);
  const sb = new Float32Array(vcount * 4);
  const rg = new Float32Array(vcount * 3);
  const cw = new Float32Array(8);
  const H = new Float32Array((n + 3) * (n + 3)); // heights incl. 1-cell border for normals
  const hid = (i, j) => (j + 1) * (n + 3) + (i + 1);
  for (let j = -1; j <= n + 1; j++) for (let i = -1; i <= n + 1; i++) {
    H[hid(i, j)] = heightAt(cx0 + i * step, cz0 + j * step);
  }
  let v = 0;
  const writeVert = (i, j, drop) => {
    const x = cx0 + i * step, z = cz0 + j * step;
    const s = sample(x, z);
    const h = H[hid(i, j)];
    const hx = H[hid(i + 1, j)] - H[hid(i - 1, j)];
    const hz = H[hid(i, j + 1)] - H[hid(i, j - 1)];
    let nx = -hx, ny = 2 * step, nz = -hz;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    pos[v * 3] = x; pos[v * 3 + 1] = h - drop; pos[v * 3 + 2] = z;
    nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
    classWeights(x, z, s, [nx, ny, nz], cw);
    sa.set([cw[0], cw[1], cw[2], cw[3]], v * 4);
    sb.set([cw[4], cw[5], cw[6], cw[7]], v * 4);
    rg.set(s.region, v * 3);
    return v++;
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) writeVert(i, j, 0);
  const idx = [];
  const at = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    // alternate diagonal to reduce directional artefacts
    if ((i + j) & 1) { idx.push(a, c, b, b, c, d); } else { idx.push(a, c, d, a, d, b); }
  }
  // skirts
  const drop = step * 1.5 + 1.0;
  const edges = [
    { list: [...Array(n + 1).keys()].map((i) => [i, 0]), flip: false },
    { list: [...Array(n + 1).keys()].map((i) => [i, n]), flip: true },
    { list: [...Array(n + 1).keys()].map((j) => [0, j]), flip: true },
    { list: [...Array(n + 1).keys()].map((j) => [n, j]), flip: false },
  ];
  for (const e of edges) {
    const base = v;
    for (const [i, j] of e.list) writeVert(i, j, drop);
    for (let k = 0; k < n; k++) {
      const t0 = at(e.list[k][0], e.list[k][1]), t1 = at(e.list[k + 1][0], e.list[k + 1][1]);
      const b0 = base + k, b1 = base + k + 1;
      if (e.flip) idx.push(t0, b0, t1, t1, b0, b1); else idx.push(t0, t1, b0, t1, b1, b0);
    }
  }
  return { pos, nor, sa, sb, rg, idx, vcount: v };
}

function mergeChunks(chunks) {
  let vc = 0, ic = 0;
  for (const c of chunks) { vc += c.vcount; ic += c.idx.length; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3);
  const sa = new Float32Array(vc * 4), sb = new Float32Array(vc * 4), rg = new Float32Array(vc * 3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const c of chunks) {
    pos.set(c.pos.subarray(0, c.vcount * 3), vo * 3);
    nor.set(c.nor.subarray(0, c.vcount * 3), vo * 3);
    sa.set(c.sa.subarray(0, c.vcount * 4), vo * 4);
    sb.set(c.sb.subarray(0, c.vcount * 4), vo * 4);
    rg.set(c.rg.subarray(0, c.vcount * 3), vo * 3);
    for (let k = 0; k < c.idx.length; k++) idx[io + k] = c.idx[k] + vo;
    vo += c.vcount; io += c.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSplatA', new THREE.BufferAttribute(sa, 4));
  g.setAttribute('aSplatB', new THREE.BufferAttribute(sb, 4));
  g.setAttribute('aRegion', new THREE.BufferAttribute(rg, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export async function buildTerrainGeometries(onProgress) {
  const SUPER = 4; // chunks per super-chunk side
  const n = (2 * EXTENT) / CHUNK;
  const geos = [];
  let tris = 0;
  for (let sj = 0; sj < n; sj += SUPER) for (let si = 0; si < n; si += SUPER) {
    const chunks = [];
    for (let j = sj; j < sj + SUPER; j++) for (let i = si; i < si + SUPER; i++) {
      const x0 = -EXTENT + i * CHUNK, z0 = -EXTENT + j * CHUNK;
      const sp = spacingFor(x0 + CHUNK / 2, z0 + CHUNK / 2);
      const c = buildChunk(x0, z0, CHUNK, sp);
      tris += c.idx.length / 3;
      chunks.push(c);
    }
    geos.push(mergeChunks(chunks));
    if (onProgress && (geos.length % 8 === 0)) await onProgress(geos.length / ((n / SUPER) * (n / SUPER)));
  }
  console.log('terrain triangles', tris);
  return geos;
}

// --------------------------------------------------------------------- textures
export async function loadLayerArray(world, size = 1024) {
  const imgs = await Promise.all(LAYER_NAMES.map((name) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = `world/generated/swatches/${name}.jpg`;
  })));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const data = new Uint8Array(size * size * 4 * imgs.length);
  imgs.forEach((im, i) => {
    ctx.drawImage(im, 0, 0, size, size);
    data.set(ctx.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const tex = new THREE.DataArrayTexture(data, size, size, imgs.length);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  // brightness normalisation so dark HDR crops and bright ones sit together
  const gains = LAYER_NAMES.map((name) => {
    const m = world.swatchMeans[name] || [0.3, 0.3, 0.3];
    const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
    return clamp(Math.pow(0.42 / Math.max(lum, 0.02), 0.65), 0.7, 3.5);
  });
  return { tex, gains };
}

export function createTerrainMaterial(layers) {
  const table = [];
  for (const c of CLASSES) for (let r = 0; r < 3; r++) table.push(LAYER_NAMES.indexOf(TABLE[c][r]));
  const uniforms = {
    uLayers: { value: layers.tex },
    uTable: { value: table },
    uGain: { value: layers.gains },
    uClassScale: { value: CLASS_SCALE.map((s) => 1 / s) },
    uCamPos: { value: new THREE.Vector3() },
    uBake: { value: 0 },
    uHillTint: { value: new THREE.Color(1, 1, 1) },
    uMtnLayers: { value: new THREE.Vector4(LAYER_NAMES.indexOf('ed_heather'), LAYER_NAMES.indexOf('ed_grass'), LAYER_NAMES.indexOf('dun_shore'), LAYER_NAMES.indexOf('ed_lichen')) },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0 });
  patchWorldMaterial(mat, {
    key: 'terrain',
    uniforms,
    vertexPars: `attribute vec4 aSplatA; attribute vec4 aSplatB; attribute vec3 aRegion;
varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vRegion;`,
    vertexMain: `vSplatA = aSplatA; vSplatB = aSplatB; vRegion = aRegion;`,
    pars: `
precision highp sampler2DArray;
uniform sampler2DArray uLayers;
uniform float uTable[24];
uniform float uGain[${LAYER_NAMES.length}];
uniform float uClassScale[8];
uniform vec3 uCamPos;
uniform float uBake;
uniform vec3 uHillTint;
uniform vec4 uMtnLayers;
float gGrass = 0.0;
float gHill = 0.0;
vec3 gN = vec3(0.0, 1.0, 0.0);

varying vec4 vSplatA; varying vec4 vSplatB; varying vec3 vRegion;

float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
}
// explicit gradients: samples happen inside per-pixel branches, so implicit derivatives
// (and with them mip selection) would be undefined there
vec3 gDx, gDy;
// ridged fractal for mountain relief detail (gullies, spurs, crags)
float mRidge(vec2 p) {
  float a = 0.5, s = 0.0, w = 1.0;
  for (int i = 0; i < 4; i++) {
    float v = 1.0 - abs(tNoise(p) * 2.0 - 1.0);
    v *= v * w; w = clamp(v * 1.6, 0.0, 1.0);
    s += v * a; a *= 0.5; p = mat2(1.6, -1.2, 1.2, 1.6) * p;
  }
  return s;
}
vec3 layerAt(float L, vec2 uv, vec2 dx, vec2 dy) {
  return textureGrad(uLayers, vec3(uv, L), dx, dy).rgb * uGain[int(L)];
}
// planar sample with a second rotated scale blended by noise to break up tiling
vec3 layerPlanar(float L, vec2 p, vec2 dpx, vec2 dpy, float s, float farMix) {
  vec3 farC = layerAt(L, p * s * 0.125, dpx * s * 0.125, dpy * s * 0.125);
  if (farMix > 0.99) return farC;
  vec3 a = layerAt(L, p * s, dpx * s, dpy * s);
  mat2 R = mat2(0.8, -0.6, 0.6, 0.8);
  vec3 b = layerAt(L, R * p * s * 0.43 + 0.37, R * dpx * s * 0.43, R * dpy * s * 0.43);
  float m = smoothstep(0.3, 0.7, tNoise(p * 0.05));
  vec3 nearC = mix(a, b, m * 0.6);
  return mix(nearC, farC, farMix);
}
vec3 layerTri(float L, vec3 p, vec3 n, float s, float farMix) {
  vec3 b = pow(abs(n), vec3(3.0)); b /= b.x + b.y + b.z;
  vec3 c = vec3(0.0);
  if (b.y > 0.02) c += layerPlanar(L, p.xz, gDx.xz, gDy.xz, s, farMix) * b.y;
  if (b.x > 0.02) c += layerPlanar(L, p.zy, gDx.zy, gDy.zy, s, farMix) * b.x;
  if (b.z > 0.02) c += layerPlanar(L, p.xy, gDx.xy, gDy.xy, s, farMix) * b.z;
  return c;
}
vec3 classColor(int c, float w, vec3 p, vec3 n, float farMix) {
  vec3 col = vec3(0.0);
  float s = uClassScale[c];
  for (int r = 0; r < 3; r++) {
    float rw = vRegion[r];
    if (rw < 0.01) continue;
    float L = uTable[c * 3 + r];
    if (c == 2 || c == 7 || n.y < 0.8) col += layerTri(L, p, n, s, farMix) * rw;
    else col += layerPlanar(L, p.xz, gDx.xz, gDy.xz, s, farMix) * rw;
  }
  return col * w;
}
`,
    mapFragment: `
  {
    gDx = dFdx(vWPos); gDy = dFdy(vWPos);
    vec3 n = normalize(vWNrm);
    float camD = length(vWPos - uCamPos);
    float farMix = smoothstep(60.0, 420.0, camD);
    float ws[8];
    ws[0] = vSplatA.x; ws[1] = vSplatA.y; ws[2] = vSplatA.z; ws[3] = vSplatA.w;
    ws[4] = vSplatB.x; ws[5] = vSplatB.y; ws[6] = vSplatB.z; ws[7] = vSplatB.w;
    // sharpen transitions with noise so classes meet in ragged, natural edges
    float nz = tNoise(vWPos.xz * 0.35) * 0.6 + tNoise(vWPos.xz * 1.7) * 0.4;
    float tot = 0.0;
    for (int i = 0; i < 8; i++) { ws[i] = pow(max(ws[i], 0.0) * (0.6 + nz * 0.8), 1.6); tot += ws[i]; }
    gGrass = clamp((vSplatA.x + vSplatA.y * 0.85 + vSplatB.z * 0.25) * 1.15, 0.0, 1.0);
    vec3 col = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float w = ws[i] / max(tot, 1e-4);
      if (w > 0.02) col += classColor(i, w, vWPos, n, farMix);
    }
    // macro variation
    float macro = tNoise(vWPos.xz * 0.004) * 0.5 + tNoise(vWPos.xz * 0.017) * 0.5;
    col *= 0.82 + macro * 0.36;
    // wet darkening just above the water line
    col *= mix(0.62, 1.0, smoothstep(${WATER_LEVEL.toFixed(1)} - 0.4, ${WATER_LEVEL.toFixed(1)} + 0.5, vWPos.y));
    // ---- the mountains: their own palette, woven from the photos' heather, grass, bracken and
    // lichen; relief from a ridged fractal (bump-lit), rock on spurs and crests, the nearest photo's
    // hill hue over everything
    float hill = smoothstep(18.0, 75.0, vWPos.y) * smoothstep(120.0, 420.0, camD);
    gHill = hill;
    if (hill > 0.01) {
      vec2 q = vWPos.xz * 0.011;
      float e = 0.35;
      float r0 = mRidge(q), rx = mRidge(q + vec2(e, 0.0)), rz = mRidge(q + vec2(0.0, e));
      vec3 bumpN = normalize(n + vec3(-(rx - r0), 0.0, -(rz - r0)) * 2.4);
      gN = bumpN;
      float slope = 1.0 - bumpN.y;
      vec2 P = vWPos.xz;
      vec2 dx = gDx.xz, dy = gDy.xz;
      vec3 heather = layerAt(uMtnLayers.x, P / 60.0, dx / 60.0, dy / 60.0);
      vec3 grass   = layerAt(uMtnLayers.y, P / 70.0, dx / 70.0, dy / 70.0);
      vec3 bracken = layerAt(uMtnLayers.z, P / 55.0, dx / 55.0, dy / 55.0);
      vec3 rock    = layerAt(uMtnLayers.w, P / 40.0, dx / 40.0, dy / 40.0);
      float nA = tNoise(P * 0.0021 + 7.3) * 0.65 + tNoise(P * 0.0083) * 0.35;
      float nB = tNoise(P * 0.0031 - 2.1) * 0.6 + tNoise(P * 0.012) * 0.4;
      vec3 m = mix(grass, heather, smoothstep(0.38, 0.58, nA));
      m = mix(m, bracken, smoothstep(0.6, 0.78, nB) * (1.0 - smoothstep(170.0, 260.0, vWPos.y)));
      // lower slopes greener, high ground heather and stone
      m = mix(m, grass * 1.1, (1.0 - smoothstep(25.0, 70.0, vWPos.y)) * 0.5);
      float crest = smoothstep(0.55, 0.85, r0) * smoothstep(90.0, 220.0, vWPos.y);
      float crag = smoothstep(0.32, 0.55, slope);
      m = mix(m, rock * vec3(0.95, 0.93, 1.02), clamp(max(crest, crag) * 0.85, 0.0, 1.0));
      // gullies hold shadow and moisture; spurs catch light
      m *= 0.78 + 0.45 * r0;
      // the nearest photograph's hill hue
      float tl = dot(uHillTint, vec3(0.2126, 0.7152, 0.0722));
      vec3 hue = clamp(uHillTint / max(tl, 0.02), vec3(0.4), vec3(1.9));
      m *= mix(vec3(1.0), hue, 0.38);
      col = mix(col, m * 1.15, hill);
    }
    float cl = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = max(vec3(0.0), mix(vec3(cl), col, 1.18 + farMix * 0.3));
    diffuseColor.rgb = col;
  }`,
    postFragment: `if (uBake > 0.5) gl_FragColor = vec4(diffuseColor.rgb, gGrass);`,
    onShader: (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gHill > 0.01) normal = normalize(mix(normal, normalize(mat3(viewMatrix) * gN), gHill));`);
    },
  });
  return mat;
}

// A float heightmap texture of the core area for GPU users (grass, water depth)
export const HMAP = { x0: -1000, z0: -800, size: 2200, res: 1100 };
export function buildHeightTexture() {
  const { x0, z0, size, res } = HMAP;
  const data = new Float32Array(res * res);
  const st = size / (res - 1);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) data[j * res + i] = heightAt(x0 + i * st, z0 + j * st);
  const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, data, ...HMAP };
}
