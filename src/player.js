// First-person walker: mouse look, WASD, sprint, jump, wade through the shallows, fly mode.
// Collides with castle walls, towers, trees and boulders; can walk on the bridge deck and rocks.
import * as THREE from 'three';
import { meshHeightAt as heightAt } from './world/terrain.js';

const EYE = 1.7;
const RADIUS = 0.35;
const STEP = 0.55;
const SWIM = 1.3; // swimming depth of the feet below the water surface

class ColliderGrid {
  constructor(colliders, cell = 16) {
    this.cell = cell;
    this.map = new Map();
    for (const c of colliders) {
      const r = c.type === 'box' ? Math.hypot(c.hx, c.hz) : c.r;
      const x0 = Math.floor((c.x - r) / cell), x1 = Math.floor((c.x + r) / cell);
      const z0 = Math.floor((c.z - r) / cell), z1 = Math.floor((c.z + r) / cell);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const k = i * 100003 + j;
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(c);
      }
    }
  }
  near(x, z) {
    const out = new Set();
    const i0 = Math.floor((x - 2) / this.cell), i1 = Math.floor((x + 2) / this.cell);
    const j0 = Math.floor((z - 2) / this.cell), j1 = Math.floor((z + 2) / this.cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const l = this.map.get(i * 100003 + j);
      if (l) for (const c of l) out.add(c);
    }
    return out;
  }
}

// top surface of a collider under (x,z), or -Infinity
function topAt(c, x, z) {
  if (c.type === 'box') {
    const dx = x - c.x, dz = z - c.z;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) <= c.hx + 0.05 && Math.abs(lz) <= c.hz + 0.05) return c.y + c.hy;
    return -Infinity;
  }
  const d = Math.hypot(x - c.x, z - c.z);
  if (d <= c.r * (c.walkable ? 0.85 : 1)) {
    if (!c.walkable) return c.y1;
    const t = d / c.r;
    return c.y1 - (c.y1 - c.y0) * 0.15 * t * t;
  }
  return -Infinity;
}

// push a circle out of a collider (horizontal), only if the collider spans the body height
function pushOut(c, p, feet) {
  if (c.type === 'box') {
    if (feet >= c.y + c.hy - STEP || feet + EYE < c.y - c.hy) return false;
    const dx = p.x - c.x, dz = p.z - c.z;
    const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    let lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let ex = lx - qx, ez = lz - qz;
    const d = Math.hypot(ex, ez);
    if (d >= RADIUS) return false;
    if (d < 1e-5) {
      // inside: push out along the shallowest axis
      const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
      if (px < pz) lx = Math.sign(lx || 1) * (c.hx + RADIUS); else lz = Math.sign(lz || 1) * (c.hz + RADIUS);
    } else {
      lx = qx + (ex / d) * RADIUS; lz = qz + (ez / d) * RADIUS;
    }
    // back to world (inverse rotation)
    p.x = c.x + lx * cs + lz * sn;
    p.z = c.z - lx * sn + lz * cs;
    return true;
  }
  if (feet >= c.y1 - STEP || feet + EYE < c.y0) return false;
  const dx = p.x - c.x, dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  const R = c.r + RADIUS;
  if (d >= R) return false;
  const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
  p.x = c.x + nx * R; p.z = c.z + nz * R;
  return true;
}

export class Player {
  constructor(camera, dom, colliders) {
    this.camera = camera;
    this.dom = dom;
    this.grid = new ColliderGrid(colliders);
    this.pos = new THREE.Vector3(0, 10, 0); // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.keys = {};
    this.fly = false;
    this.onGround = false;
    this.enabled = false;
    this.bob = 0;
    this.stepDist = 0;
    this.onStep = null;
    this.surface = 'grass';
    this.wading = 0;
    this.lookDelta = 0;
    this.moveIntent = 0;
    this.touchMove = { x: 0, y: 0 }; // virtual joystick (-1..1); y < 0 = forward
    this.sensitivity = 0.0021;
    addEventListener('keydown', (e) => { this.keys[e.code] = true; if (e.code === 'KeyF' && this.enabled) this.fly = !this.fly; });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    // click-and-drag (or touch-drag) to look; deltas from pointer positions, which every browser reports
    this.dragging = false;
    this.lastX = 0; this.lastY = 0;
    dom.addEventListener('pointerdown', (e) => {
      this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
      try { dom.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    });
    const end = (e) => { this.dragging = false; try { dom.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ } };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      if (!this.enabled) return;
      this.yaw += dx * this.sensitivity * 1.4;
      this.pitch -= dy * this.sensitivity * 1.4;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
      this.lookDelta += Math.abs(dx) + Math.abs(dy);
    });
    dom.style.touchAction = 'none';
    addEventListener('blur', () => { this.keys = {}; });
  }

  wantsToMove() {
    const k = this.keys;
    if (this.enabled && Math.hypot(this.touchMove.x, this.touchMove.y) > 0.15) return true;
    return this.enabled && !!(k.KeyW || k.KeyA || k.KeyS || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight || k.Space);
  }

  setPose(x, y, z, yaw, pitch) {
    this.pos.set(x, y - EYE, z);
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0, 0);
  }

  groundAt(x, z, feet) {
    // the water surface supports a swimmer: feet never sink deeper than SWIM below it
    let g = Math.max(heightAt(x, z), -SWIM);
    let surf = 'grass';
    const near = this.grid.near(x, z);
    for (const c of near) {
      const t = topAt(c, x, z);
      if (t > g && t <= feet + STEP + 0.05) { g = t; surf = 'stone'; }
    }
    return { g, surf };
  }

  update(dt) {
    const k = this.keys;
    let fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    let str = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    // touch joystick: analog; pushed to the rim it runs
    const tm = Math.hypot(this.touchMove.x, this.touchMove.y);
    let analog = 1;
    if (tm > 0.12 && !fwd && !str) {
      fwd = -this.touchMove.y / tm; str = this.touchMove.x / tm;
      analog = Math.min(1, (tm - 0.12) / 0.7);
    }
    this.moveIntent = this.enabled ? Math.abs(fwd) + Math.abs(str) : 0;
    const sprint = k.ShiftLeft || k.ShiftRight || tm > 0.92;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let speed = this.fly ? (sprint ? 90 : 26) : (sprint ? 18 : 6.2);
    if (!this.enabled) speed = 0;
    if (!sprint) speed *= analog;
    if (this.fly) {
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const dir = new THREE.Vector3(sy * cp * fwd + cy * str, sp * fwd + ((k.Space ? 1 : 0) - (k.KeyC || k.ControlLeft ? 1 : 0)), -cy * cp * fwd + sy * str);
      if (dir.lengthSq() > 0) dir.normalize();
      this.vel.lerp(dir.multiplyScalar(speed), 1 - Math.exp(-dt * 6));
      this.pos.addScaledVector(this.vel, dt);
      const g = heightAt(this.pos.x, this.pos.z);
      if (this.pos.y < g + 0.3) this.pos.y = g + 0.3;
      if (this.pos.y < 0.2) this.pos.y = 0.2;
    } else {
      // wading slows you; in deep water you swim at the surface (never a wall, so nothing traps you)
      const hHere = heightAt(this.pos.x, this.pos.z);
      this.wading = Math.max(0, -hHere);
      if (this.wading > 0) speed *= 1 - Math.min(0.6, this.wading * 0.6);
      const tx = (sy * fwd + cy * str), tz = (-cy * fwd + sy * str);
      const l = Math.hypot(tx, tz) || 1;
      const tvx = (tx / l) * speed * (fwd || str ? 1 : 0), tvz = (tz / l) * speed * (fwd || str ? 1 : 0);
      const acc = this.onGround ? 10 : 2;
      this.vel.x += (tvx - this.vel.x) * (1 - Math.exp(-dt * acc));
      this.vel.z += (tvz - this.vel.z) * (1 - Math.exp(-dt * acc));
      this.vel.y -= 22 * dt;
      if (k.Space && this.onGround) { this.vel.y = 6.2; this.onGround = false; }
      const prev = this.pos.clone();
      const np = this.pos.clone();
      np.x += this.vel.x * dt; np.z += this.vel.z * dt;
      // collide
      for (let it = 0; it < 2; it++) for (const c of this.grid.near(np.x, np.z)) pushOut(c, np, this.pos.y);
      // steepness: stop walking up near-vertical terrain
      const gA = this.groundAt(np.x, np.z, this.pos.y);
      if (gA.g - this.pos.y > STEP && this.onGround) {
        const slopeRise = gA.g - Math.max(this.pos.y, heightAt(prev.x, prev.z));
        if (slopeRise > 0.35 * Math.hypot(np.x - prev.x, np.z - prev.z) + STEP) { np.x = prev.x; np.z = prev.z; }
      }
      this.pos.x = np.x; this.pos.z = np.z;
      this.pos.y += this.vel.y * dt;
      const { g, surf } = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
      this.surface = this.wading > 0.05 ? 'water' : surf;
      if (this.pos.y <= g) {
        // smooth step-up
        if (g - this.pos.y < 1.2) this.pos.y += (g - this.pos.y) * Math.min(1, dt * 18);
        if (this.pos.y < g - 0.3) this.pos.y = g - 0.3;
        if (this.pos.y <= g + 0.01) this.pos.y = Math.max(this.pos.y, g - 0.02);
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
      } else if (this.pos.y > g + 0.08) {
        this.onGround = this.pos.y - g < 0.15 && this.vel.y <= 0;
      }
      const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
      if (this.onGround) {
        this.bob += moved * 1.9;
        this.stepDist += moved;
        const stride = sprint ? 1.6 : 1.15;
        if (this.stepDist > stride) { this.stepDist = 0; this.onStep && this.onStep(this.surface, sprint); }
      }
    }
    // camera
    const bobY = this.fly ? 0 : Math.sin(this.bob) * 0.035 * Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4);
    this.camera.position.set(this.pos.x, this.pos.y + EYE + bobY, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, -this.yaw, 0);
  }
}

export { EYE };
