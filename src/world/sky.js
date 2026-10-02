// Sky dome: up to three zone panoramas (each woven from one photograph's clouds) blended by
// where the visitor stands, plus the live photo projected along its own view direction.
import * as THREE from 'three';
import { PROJ } from '../render/worldMaterial.js';

export function createSky() {
  const uniforms = {
    uPano: { value: [null, null, null] },
    uPanoW: { value: [1, 0, 0] },
    uPanoAspect: { value: [3, 3, 3] },
    uZenith: { value: new THREE.Color(0.4, 0.5, 0.7) },
    uFogColor: { value: new THREE.Color(0.6, 0.6, 0.65) },
    uGroundColor: { value: new THREE.Color(0.2, 0.2, 0.2) },
    uExposure: { value: 1.0 },
    uProjTex: PROJ.uProjTex,
    uProjMask: PROJ.uProjMask,
    uProjMat: PROJ.uProjMat,
    uProjPos: PROJ.uProjPos,
    uProjW: PROJ.uProjW,
    uProjSkyW: PROJ.uProjSkyW,
    uTime: PROJ.uTime,
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // at the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uPano[3];
      uniform float uPanoW[3];
      uniform float uPanoAspect[3];
      uniform vec3 uZenith;
      uniform vec3 uFogColor;
      uniform vec3 uGroundColor;
      uniform float uExposure;
      uniform sampler2D uProjTex[2];
      uniform sampler2D uProjMask[2];
      uniform mat4 uProjMat[2];
      uniform vec3 uProjPos[2];
      uniform float uProjW[2];
      uniform float uProjSkyW[2];
      uniform float uTime;
      varying vec3 vDir;
      const float PI = 3.14159265359;

      void main() {
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0));
        // clouds on a plane overhead: they recede and compress toward the horizon
        float up = max(d.y, 0.0);
        vec2 pl = d.xz / (up * 0.6 + 0.32) * 0.9 + vec2(uTime * 0.0012, uTime * 0.0005);
        vec3 c = vec3(0.0);
        float wsum = 0.0;
        if (uPanoW[0] > 0.001) { c += texture(uPano[0], vec2(pl.x / uPanoAspect[0], pl.y)).rgb * uPanoW[0]; wsum += uPanoW[0]; }
        if (uPanoW[1] > 0.001) { c += texture(uPano[1], vec2(pl.x / uPanoAspect[1], pl.y) + 0.37).rgb * uPanoW[1]; wsum += uPanoW[1]; }
        if (uPanoW[2] > 0.001) { c += texture(uPano[2], vec2(pl.x / uPanoAspect[2], pl.y) + 0.71).rgb * uPanoW[2]; wsum += uPanoW[2]; }
        c /= max(wsum, 1e-4);
        // the prints' skies are dramatic: restore contrast around the mean
        float cl = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = max(vec3(0.0), mix(vec3(cl), c, 1.15) + (c - vec3(0.35)) * 0.35);
        // toward the zenith a touch of the photo's high-sky colour, at the horizon its haze
        c = mix(c, uZenith, smoothstep(0.55, 1.0, up) * 0.35);
        float hz = 1.0 - smoothstep(-0.03, 0.42, el);
        c = mix(c, uFogColor, hz * hz * 0.7);
        if (el < 0.0) c = mix(uFogColor, uGroundColor, smoothstep(0.0, -0.4, el));
        c *= uExposure;

        // the photographs themselves, along their own lines of sight
        vec3 pc = vec3(0.0); float pw = 0.0;
        for (int i = 0; i < 2; i++) {
          float W = i == 0 ? uProjSkyW[0] : uProjSkyW[1];
          if (W < 0.001) continue;
          mat4 M = i == 0 ? uProjMat[0] : uProjMat[1];
          vec3 P = i == 0 ? uProjPos[0] : uProjPos[1];
          vec4 clip = M * vec4(P + d * 5000.0, 1.0);
          if (clip.w <= 0.0) continue;
          vec2 puv = clip.xy / clip.w * 0.5 + 0.5;
          vec2 e = smoothstep(vec2(0.0), vec2(0.12), puv) * smoothstep(vec2(0.0), vec2(0.12), 1.0 - puv);
          float inside = e.x * e.y;
          if (inside <= 0.0) continue;
          float sky = i == 0 ? texture(uProjMask[0], puv).r : texture(uProjMask[1], puv).r;
          vec3 col = i == 0 ? texture(uProjTex[0], puv).rgb : texture(uProjTex[1], puv).rgb;
          float w = W * inside * sky;
          pc = mix(pc, col, w / max(pw + w, 1e-4));
          pw = pw + w * (1.0 - pw);
        }
        gl_FragColor = vec4(mix(c, pc, pw), pw);
      }`,
  });
  const geo = new THREE.SphereGeometry(1, 64, 32);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.scale.setScalar(9000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return { mesh, uniforms };
}
