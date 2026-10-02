// Photo projectors: each photograph is a camera placed where it was taken. Its image is cast
// back onto the world (see worldMaterial.js). Depth maps from each projector are rendered once
// so the photo only lands on surfaces the photographer could actually see.
import * as THREE from 'three';
import { PROJ } from './worldMaterial.js';
import { smoothstep } from '../util/noise.js';

export function projectorCamera(p, near = 0.5, far = 6000) {
  const c = p.camera;
  const cam = new THREE.PerspectiveCamera(c.vfov, p.aspect, near, far);
  cam.position.set(...c.pos);
  const yaw = THREE.MathUtils.degToRad(c.yaw), pitch = THREE.MathUtils.degToRad(c.pitch);
  cam.rotation.order = 'YXZ';
  cam.rotation.set(pitch, -yaw, THREE.MathUtils.degToRad(c.roll || 0));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

export class Projectors {
  constructor(world, textures) {
    this.world = world;
    this.items = world.photos.map((p, i) => ({
      p, i,
      cam: projectorCamera(p),
      tex: textures.photos[p.id],
      mask: textures.masks[p.id],
      depthRT: null,
      mat: new THREE.Matrix4(),
      w: 0,
      skyW: 0,
    }));
    this.force = null;     // { index, w } forces a projector (memory mode)
    this.range = 110;
    this.enabled = true;
  }

  renderDepths(renderer, scene, hideList = []) {
    const override = new THREE.MeshBasicMaterial({ colorWrite: false });
    const prevOverride = scene.overrideMaterial;
    const vis = hideList.map((o) => o.visible);
    hideList.forEach((o) => (o.visible = false));
    scene.overrideMaterial = override;
    for (const it of this.items) this.renderOne(renderer, scene, it);
    scene.overrideMaterial = prevOverride;
    hideList.forEach((o, k) => (o.visible = vis[k]));
  }

  renderOne(renderer, scene, it) {
    const W = 1024, H = Math.round(1024 / it.p.aspect);
    if (!it.depthRT) {
      it.depthRT = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
      it.depthRT.depthTexture = new THREE.DepthTexture(W, H, THREE.UnsignedIntType);
      it.depthRT.depthTexture.minFilter = it.depthRT.depthTexture.magFilter = THREE.NearestFilter;
    }
    const cam = it.cam;
    cam.layers.set(0); cam.layers.enable(1);
    renderer.setRenderTarget(it.depthRT);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(null);
    it.mat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  }

  // re-pose a projector (calibration)
  repose(i, renderer, scene, hideList) {
    const it = this.items[i];
    it.cam = projectorCamera(it.p);
    const prev = scene.overrideMaterial;
    const vis = hideList.map((o) => o.visible);
    hideList.forEach((o) => (o.visible = false));
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.renderOne(renderer, scene, it);
    scene.overrideMaterial = prev;
    hideList.forEach((o, k) => (o.visible = vis[k]));
  }

  weightFor(it, camPos) {
    const c = it.cam.position;
    const d = Math.hypot(camPos.x - c.x, (camPos.y - c.y) * 1.5, camPos.z - c.z);
    const range = Math.max(55, ((it.p.style && it.p.style.radius) || 48) * 1.6);
    const w = 1 - smoothstep(0, range, d);
    return Math.pow(w, 1.4);
  }

  update(camPos, dt) {
    for (const it of this.items) {
      let target = this.enabled ? this.weightFor(it, camPos) : 0;
      if (this.force) target = this.force.index === it.i ? this.force.w : target * (1 - this.force.w);
      // ease, faster when rising toward a forced memory
      const k = 1 - Math.exp(-dt * (this.force ? 6 : 3));
      it.w += (target - it.w) * k;
      // the photo's own sky only right at the viewpoint (its mask holes would show elsewhere)
      const d = it.cam.position.distanceTo(camPos);
      let st = this.enabled ? 1 - smoothstep(0.5, 7, d) : 0;
      if (this.force) st = this.force.index === it.i ? this.force.w : 0;
      it.skyW += (st - it.skyW) * k;
    }
    const sorted = [...this.items].sort((a, b) => b.w - a.w);
    for (let s = 0; s < 2; s++) {
      const it = sorted[s];
      PROJ.uProjTex.value[s] = it.tex;
      PROJ.uProjMask.value[s] = it.mask;
      PROJ.uProjDepth.value[s] = it.depthRT ? it.depthRT.depthTexture : null;
      PROJ.uProjMat.value[s].copy(it.mat);
      PROJ.uProjPos.value[s].copy(it.cam.position);
      PROJ.uProjNF.value[s].set(it.cam.near, it.cam.far);
      PROJ.uProjW.value[s] = it.depthRT && it.w > 0.002 ? it.w : 0;
      PROJ.uProjSkyW.value[s] = it.depthRT ? it.skyW : 0;
    }
    return sorted[0];
  }
}
