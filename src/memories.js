// Memories: each photograph hangs in the air at the exact place it was taken, a translucent
// pane sized to fill the camera's frustum a few metres ahead — so seen from the photographer's
// spot it lines up with the world, and from anywhere else it's a window floating in the land.
import * as THREE from 'three';

export function createMemories(world, textures) {
  const group = new THREE.Group();
  const items = [];
  const D = 3.2;
  for (const p of world.photos) {
    const c = p.camera;
    const h = 2 * D * Math.tan(THREE.MathUtils.degToRad(c.vfov / 2));
    const w = h * p.aspect;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tPhoto: { value: textures.photos[p.id] },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: p.aspect },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tPhoto;
        uniform float uOpacity, uTime, uAspect;
        varying vec2 vUv;
        void main() {
          vec3 c = texture(tPhoto, vUv).rgb;
          vec2 e = min(vUv, 1.0 - vUv) * vec2(uAspect, 1.0);
          float edge = min(e.x, e.y);
          float border = smoothstep(0.0, 0.006, edge) * (1.0 - smoothstep(0.006, 0.03, edge));
          float body = smoothstep(0.0, 0.08, edge);
          float shimmer = 0.85 + 0.15 * sin(uTime * 1.5 + vUv.y * 6.0 + vUv.x * 3.0);
          vec3 col = c * body * 0.95 + vec3(1.0, 0.92, 0.75) * border * 1.6 * shimmer;
          float a = (body * 0.55 + border) * uOpacity;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const yaw = THREE.MathUtils.degToRad(c.yaw), pitch = THREE.MathUtils.degToRad(c.pitch);
    const fwd = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    mesh.position.set(c.pos[0], c.pos[1], c.pos[2]).addScaledVector(fwd, D);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(pitch, -yaw, 0);
    mesh.layers.set(2);
    mesh.renderOrder = 5;
    group.add(mesh);
    items.push({ p, mesh, mat, pos: new THREE.Vector3(...c.pos) });
  }

  // pins: a tall soft beam and a turning diamond over every viewpoint, readable from afar
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 60, 12, 1, true).translate(0, 30, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */`
      attribute float aOpacity;
      varying float vY; varying float vO;
      void main() { vY = position.y / 60.0; vO = aOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying float vY; varying float vO;
      void main() {
        float a = (1.0 - vY) * (1.0 - vY) * (0.55 + 0.45 * sin(uTime * 1.3 - vY * 9.0));
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * a * vO * 0.28, 1.0);
      }`,
  });
  const N = items.length;
  const beams = new THREE.InstancedMesh(beamGeo, beamMat, N);
  const opac = new Float32Array(N);
  beamGeo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(opac, 1));
  const gemMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const gems = items.map((it) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), gemMat.clone());
    m.scale.set(1, 1.6, 1);
    group.add(m);
    return m;
  });
  beams.frustumCulled = false;
  beams.layers.set(2);
  gems.forEach((g) => g.layers.set(2));
  group.add(beams);
  const M = new THREE.Matrix4();

  function update(camPos, t, activeIndex, hidden) {
    beamMat.uniforms.uTime.value = t;
    items.forEach((it, k) => {
      const d = it.pos.distanceTo(camPos);
      // visible from afar, fading as you arrive (the floating print takes over), gone inside a photo
      let o = THREE.MathUtils.smoothstep(d, 10, 40) * (1 - THREE.MathUtils.smoothstep(d, 1400, 2200));
      if (hidden) o = 0;
      opac[k] += (o - opac[k]) * 0.1;
      const ground = it.pos.y - 1.7;
      const scale = 0.5 + Math.min(d / 450, 2.0); // stay legible far away
      M.makeScale(scale, 1, scale).setPosition(it.pos.x, ground, it.pos.z);
      beams.setMatrixAt(k, M);
      const g = gems[k];
      g.position.set(it.pos.x, it.pos.y + 3.2 + Math.sin(t * 1.4 + k) * 0.25, it.pos.z);
      g.rotation.y = t * 0.8 + k;
      g.scale.set(scale, scale * 1.6, scale);
      g.material.opacity = opac[k] * 0.9;
      g.visible = opac[k] > 0.01;
    });
    beams.instanceMatrix.needsUpdate = true;
    beamGeo.attributes.aOpacity.needsUpdate = true;
    for (const it of items) {
      const d = it.pos.distanceTo(camPos);
      // only near, and only from in front: seen from far away or behind, a pane reads as a stray tile
      // (the light-beam pins do the long-distance finding)
      const toCam = new THREE.Vector3().subVectors(camPos, it.mesh.position).normalize();
      const front = new THREE.Vector3(0, 0, 1).applyQuaternion(it.mesh.quaternion);
      const facing = THREE.MathUtils.smoothstep(toCam.dot(front), 0.25, 0.6);
      let o = THREE.MathUtils.smoothstep(d, 4, 12) * (1 - THREE.MathUtils.smoothstep(d, 45, 80)) * facing * 0.85;
      if (hidden || it.p.index === activeIndex) o = 0;
      it.mat.uniforms.uOpacity.value += (o - it.mat.uniforms.uOpacity.value) * 0.08;
      it.mat.uniforms.uTime.value = t;
      it.mesh.visible = it.mat.uniforms.uOpacity.value > 0.003;
    }
  }

  // nearest memory the visitor could step into
  function nearest(camPos, maxD = 9) {
    let best = null, bd = maxD;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - camPos.x, it.pos.z - camPos.z, (it.pos.y - camPos.y) * 0.5);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  return { group, items, update, nearest };
}
