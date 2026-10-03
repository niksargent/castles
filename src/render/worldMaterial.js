// Shared shader plumbing for every surface in the world.
//
// 1. Photo projection: the two nearest photographs are cast back onto the geometry from
//    the exact spot they were taken (projective texturing with a shadow-map style occlusion
//    test and the photo's own sky mask). The projected weight is also written to alpha so the
//    post pass can leave those pixels untouched — standing at a viewpoint you see the
//    photograph itself, stepping away the world takes over.
// 2. Optional triplanar texturing for buildings and rocks (textures woven from photo crops).
import * as THREE from 'three';

export const PROJ = {
  uProjTex: { value: [null, null] },
  uProjMask: { value: [null, null] },
  uProjDepth: { value: [null, null] },
  uProjMat: { value: [new THREE.Matrix4(), new THREE.Matrix4()] },
  uProjPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uProjW: { value: [0, 0] },
  uProjSkyW: { value: [0, 0] },
  uProjNF: { value: [new THREE.Vector2(1, 4000), new THREE.Vector2(1, 4000)] },
  uProjGeoW: { value: 1.0 },  // global multiplier for geometry (vs sky)
  uTime: { value: 0 },
  uViewPos: { value: new THREE.Vector3() },
};

export const PROJ_PARS = /* glsl */`
uniform sampler2D uProjTex[2];
uniform sampler2D uProjMask[2];
uniform sampler2D uProjDepth[2];
uniform mat4 uProjMat[2];
uniform vec3 uProjPos[2];
uniform float uProjW[2];
uniform float uProjSkyW[2];
uniform float uProjTight;
uniform vec2 uProjNF[2];
uniform float uProjGeoW;
uniform float uTime;
uniform vec3 uViewPos;

float projLinDepth(float d, vec2 nf) {
  float z = d * 2.0 - 1.0;
  return (2.0 * nf.x * nf.y) / (nf.y + nf.x - z * (nf.y - nf.x));
}

// returns rgb = linear photo colour, a = weight
#define PROJ_SAMPLE(I, OC, OW, OA) {                                                        \\
  if (uProjW[I] > 0.001) {                                                      \\
    vec4 clip = uProjMat[I] * vec4(wp, 1.0);                                    \\
    if (clip.w > 0.0) {                                                         \\
      vec3 ndc = clip.xyz / clip.w;                                             \\
      vec2 uv = ndc.xy * 0.5 + 0.5;                                             \\
      vec2 e = smoothstep(vec2(0.0), vec2(0.06), uv) * smoothstep(vec2(0.0), vec2(0.06), 1.0 - uv); \\
      float inside = e.x * e.y;                                                 \\
      if (inside > 0.0) {                                                       \\
        float dist = length(wp - uProjPos[I]);                                  \\
        float stored = projLinDepth(texture(uProjDepth[I], uv).r, uProjNF[I]);  \\
        float occl = 1.0 - smoothstep(0.6 + dist * 0.012, 2.0 + dist * 0.03, projLinDepth(ndc.z * 0.5 + 0.5, uProjNF[I]) - stored); \\
        vec3 toP = normalize(uProjPos[I] - wp);                                 \\
        float facing = smoothstep(-0.05, 0.25, dot(nrm, toP));                  \\
        float sky = texture(uProjMask[I], uv).r;                                \\
        float agree = dot(normalize(wp - uProjPos[I]), normalize(wp - uViewPos));      \
        float consist = smoothstep(0.9903, 0.9990, agree);                      \
        float farF = smoothstep(220.0, 520.0, dist);                           \
        vec2 ew = smoothstep(vec2(0.0), vec2(0.22), uv) * smoothstep(vec2(0.0), vec2(0.22), 1.0 - uv); \\
        float inF = mix(inside, ew.x * ew.y, max(sky, farF) * (1.0 - uProjTight)); \\
        float w = inF * mix(occl * facing, 1.0, farF) * consist * mix(uProjW[I], uProjSkyW[I], max(max(sky, farF), uProjTight)) * uProjGeoW; \\
        if (w > 0.0) {                                                          \\
          OC = texture(uProjTex[I], uv).rgb;                                  \
          OW = w;                                                           \
          OA = agree;                                                       \\
        }                                                                       \\
      }                                                                         \\
    }                                                                           \\
  }                                                                             \\
}

// Two photos never blend 50/50 (misregistered copies would ghost): the one whose line of sight
// agrees best with the viewer's wins, with a narrow soft hand-over between them.
vec4 projectPhotos(vec3 wp, vec3 nrm) {
  vec3 C0 = vec3(0.0), C1 = vec3(0.0);
  float W0 = 0.0, W1 = 0.0, A0 = -1.0, A1 = -1.0;
  PROJ_SAMPLE(0, C0, W0, A0)
  PROJ_SAMPLE(1, C1, W1, A1)
  if (W0 <= 0.0 && W1 <= 0.0) return vec4(0.0);
  // score: weight times angular agreement (in units of ~0.25 degree)
  float s0 = W0 > 0.0 ? log(W0) + (A0 - 1.0) * 6000.0 : -1e9;
  float s1 = W1 > 0.0 ? log(W1) + (A1 - 1.0) * 6000.0 : -1e9;
  float t = clamp(0.5 + (s1 - s0) * 0.5, 0.0, 1.0);
  vec3 c = mix(C0, C1, t);
  float w = mix(W0, W1, t);
  return vec4(c, clamp(w, 0.0, 1.0));
}
`;

export const TRIPLANAR_PARS = /* glsl */`
vec3 triSample(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 b = pow(abs(n), vec3(4.0));
  b /= (b.x + b.y + b.z);
  vec3 dx = dFdx(p) * s, dy = dFdy(p) * s;
  vec3 c = vec3(0.0);
  if (b.x > 0.01) c += textureGrad(t, p.zy * s, dx.zy, dy.zy).rgb * b.x;
  if (b.y > 0.01) c += textureGrad(t, p.xz * s, dx.xz, dy.xz).rgb * b.y;
  if (b.z > 0.01) c += textureGrad(t, p.xy * s, dx.xy, dy.xy).rgb * b.z;
  return c;
}
// two scales to hide repetition
vec3 triSample2(sampler2D t, vec3 p, vec3 n, float s) {
  vec3 a = triSample(t, p, n, s);
  vec3 b = triSample(t, p + vec3(17.3, 5.1, 31.7), n, s * 0.37);
  return mix(a, b, 0.35);
}
`;

/**
 * Patch a MeshStandardMaterial (or Lambert) so it takes part in photo projection.
 * opts.triMap: texture to apply triplanar instead of uv map; opts.triScale: repeats per metre
 * opts.tint: multiplier; opts.grime: darkening toward the base (world y), opts.baseY
 * opts.mapFragment: custom GLSL replacing <map_fragment> (has access to vWPos, vWNrm)
 * opts.uniforms / opts.pars: extra uniforms & declarations for custom fragments
 * opts.vertexPars / opts.vertexMain: extra vertex code
 */
export function patchWorldMaterial(mat, opts = {}) {
  const extraUniforms = {
    ...PROJ,
    uProjTight: { value: opts.tight ?? 0 },
    ...(opts.uniforms || {}),
  };
  if (opts.triMap) {
    extraUniforms.uTriMap = { value: opts.triMap };
    extraUniforms.uTriScale = { value: opts.triScale ?? 0.25 };
    extraUniforms.uTint = { value: opts.tint ?? new THREE.Color(1, 1, 1) };
    extraUniforms.uGrime = { value: new THREE.Vector3(opts.baseY ?? 0, opts.grimeHeight ?? 6, opts.grime ?? 0.35) };
  }
  mat.userData.uniforms = extraUniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, extraUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
${opts.vertexPars || ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{
  vec4 wpp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wpp = instanceMatrix * wpp;
  #endif
  wpp = modelMatrix * wpp;
  vWPos = wpp.xyz;
  vec3 on = objectNormal;
  #ifdef USE_INSTANCING
    on = mat3(instanceMatrix) * on;
  #endif
  vWNrm = normalize(mat3(modelMatrix) * on);
}
${opts.vertexMain || ''}`);
    let frag = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
${PROJ_PARS}
${TRIPLANAR_PARS}
${opts.triMap ? 'uniform sampler2D uTriMap; uniform float uTriScale; uniform vec3 uTint; uniform vec3 uGrime;' : ''}
${opts.pars || ''}`);
    if (opts.mapFragment) {
      frag = frag.replace('#include <map_fragment>', opts.mapFragment);
    } else if (opts.triMap) {
      frag = frag.replace('#include <map_fragment>', `
  {
    vec3 n = normalize(vWNrm);
    vec3 tc = triSample2(uTriMap, vWPos, n, uTriScale);
    float grime = 1.0 - uGrime.z * (1.0 - smoothstep(uGrime.x, uGrime.x + uGrime.y, vWPos.y));
    diffuseColor.rgb *= tc * uTint * grime;
  }`);
    }
    frag = frag.replace('#include <dithering_fragment>', `#include <dithering_fragment>
  {
    vec4 pj = projectPhotos(vWPos, normalize(vWNrm));
    gl_FragColor = vec4(mix(gl_FragColor.rgb, pj.rgb, pj.a), pj.a);
  }
  ${opts.postFragment || ''}`);
    shader.fragmentShader = frag;
    if (opts.onShader) opts.onShader(shader);
  };
  // make each patched variant compile separately
  const key = (opts.key || '') + (opts.triMap ? 'tri' : '') + (opts.mapFragment ? 'custom' : '');
  mat.customProgramCacheKey = () => 'world-' + key + (mat.vertexColors ? 'vc' : '');
  return mat;
}
