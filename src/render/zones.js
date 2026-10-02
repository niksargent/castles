// Zones: every photograph owns the region around the place it was taken. Weights are a soft
// Voronoi (inverse-distance) of the visitor's position, eased over time, and drive the sky,
// light, fog, water colour and photographic grade — so walking from one photo's ground to the
// next, the whole world re-tones itself, like stepping between prints.
import * as THREE from 'three';

const srgb = (a, fallback = [0.5, 0.5, 0.5]) => {
  const v = a && a.length === 3 ? a : fallback;
  return new THREE.Color().setRGB(v[0], v[1], v[2], THREE.SRGBColorSpace);
};

const ZKEYS = ['fog', 'grade', 'contrast', 'saturation', 'exposure', 'vignette', 'grain', 'canvas', 'light', 'weed', 'mist', 'shaft'];

export class Zones {
  constructor(world) {
    this.photos = world.photos;
    this.N = this.photos.length;
    this.w = new Float32Array(this.N);
    this.target = new Float32Array(this.N);
    this.first = true;
    // pre-derived per-zone parameters
    this.z = this.photos.map((p) => {
      const L = p.light || {};
      const st = p.style || {};
      const sunCol = srgb(L.sunColor, [1, 1, 1]);
      // normalise sun colour to keep hue but a steady intensity
      const m = Math.max(sunCol.r, sunCol.g, sunCol.b, 1e-3);
      sunCol.multiplyScalar(1 / m);
      const az = THREE.MathUtils.degToRad(L.sunAz ?? 0), el = THREE.MathUtils.degToRad(L.sunEl ?? 30);
      // the glow (light shafts) comes from the photo's brightest sky; the key light, as in these
      // HDR prints, falls from behind and beside the photographer so the subject is lit
      const glowDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const kAz = THREE.MathUtils.degToRad(p.camera.yaw + 180 + 38), kEl = THREE.MathUtils.degToRad(34);
      const sunDir = new THREE.Vector3(Math.sin(kAz) * Math.cos(kEl), Math.sin(kEl), -Math.cos(kAz) * Math.cos(kEl));
      const horizon = srgb(L.skyHorizon);
      const top = srgb(L.skyTop);
      const ground = srgb(L.ground);
      const water = srgb(L.water || L.skyHorizon).multiplyScalar(0.55);
      const hill = srgb(L.hill || L.ground);
      const meanLum = L.mean ? 0.2126 * L.mean[0] + 0.7152 * L.mean[1] + 0.0722 * L.mean[2] : 0.35;
      return {
        sunCol, sunDir, glowDir, horizon, top, ground, water, hill,
        fog: (st.fog ?? 0.0011) * 0.36,
        grade: st.grade ?? 0.3,
        contrast: st.contrast ?? 1.1,
        saturation: (st.saturation ?? 1.1) * 1.12,
        exposure: Math.max(0.95, st.exposure ?? 1.0),
        vignette: st.vignette ?? 0.35,
        grain: st.grain ?? 0.03,
        canvas: st.canvas ?? 0,
        mist: st.mist ?? 0.0022,
        shaft: st.shaft ?? 0.45,
        // dark photos -> lower light, keeping their mood
        light: st.light ?? THREE.MathUtils.clamp(0.75 + meanLum * 1.1, 0.8, 1.25),
        weed: p.landmark === 'eilean_donan' ? 1 : 0,
        pos: p.camera.pos,
        radius: st.radius ?? 48,
        anchor: !!p.anchor,
      };
    });
    this.out = {
      sunCol: new THREE.Color(), sunDir: new THREE.Vector3(), glowDir: new THREE.Vector3(), horizon: new THREE.Color(), top: new THREE.Color(),
      ground: new THREE.Color(), water: new THREE.Color(), hill: new THREE.Color(), fog: 0, grade: 0, contrast: 1, saturation: 1, exposure: 1,
      vignette: 0, grain: 0, canvas: 0, light: 1, weed: 0, top3: [], dominant: 0,
    };
  }

  // Each photo's look is local: a gaussian of radius style.radius around its viewpoint.
  // Between viewpoints the landmark's anchor photo (its most characteristic print) carries the world.
  compute(pos, out) {
    let sum = 0;
    for (let i = 0; i < this.N; i++) {
      const z = this.z[i];
      const d2 = (pos.x - z.pos[0]) ** 2 + (pos.z - z.pos[2]) ** 2;
      let w = Math.exp(-d2 / (z.radius * z.radius));
      if (z.anchor) w += 0.06 * Math.exp(-d2 / (650 * 650)) + 1e-9;
      out[i] = w; sum += w;
    }
    for (let i = 0; i < this.N; i++) out[i] /= sum;
  }

  update(pos, dt) {
    this.compute(pos, this.target);
    const k = this.first ? 1 : 1 - Math.exp(-dt * 1.2);
    this.first = false;
    for (let i = 0; i < this.N; i++) this.w[i] += (this.target[i] - this.w[i]) * k;
    const o = this.out;
    o.sunCol.setRGB(0, 0, 0); o.sunDir.set(0, 0, 0); o.glowDir.set(0, 0, 0); o.horizon.setRGB(0, 0, 0); o.top.setRGB(0, 0, 0);
    o.ground.setRGB(0, 0, 0); o.water.setRGB(0, 0, 0); o.hill.setRGB(0, 0, 0);
    for (const key of ZKEYS) o[key] = 0;
    let best = 0;
    for (let i = 0; i < this.N; i++) {
      const w = this.w[i], z = this.z[i];
      if (w > this.w[best]) best = i;
      if (w < 1e-4) continue;
      o.sunCol.r += z.sunCol.r * w; o.sunCol.g += z.sunCol.g * w; o.sunCol.b += z.sunCol.b * w;
      o.sunDir.addScaledVector(z.sunDir, w);
      o.glowDir.addScaledVector(z.glowDir, w);
      o.horizon.r += z.horizon.r * w; o.horizon.g += z.horizon.g * w; o.horizon.b += z.horizon.b * w;
      o.top.r += z.top.r * w; o.top.g += z.top.g * w; o.top.b += z.top.b * w;
      o.ground.r += z.ground.r * w; o.ground.g += z.ground.g * w; o.ground.b += z.ground.b * w;
      o.water.r += z.water.r * w; o.water.g += z.water.g * w; o.water.b += z.water.b * w;
      o.hill.r += z.hill.r * w; o.hill.g += z.hill.g * w; o.hill.b += z.hill.b * w;
      for (const key of ZKEYS) o[key] += z[key] * w;
    }
    o.sunDir.normalize();
    o.glowDir.normalize();
    if (o.sunDir.y < 0.25) { o.sunDir.y = 0.25; o.sunDir.normalize(); }
    o.dominant = best;
    const idx = [...this.w.keys()].sort((a, b) => this.w[b] - this.w[a]);
    o.top3 = idx.slice(0, 3).map((i) => ({ i, w: this.w[i] }));
    return o;
  }
}
