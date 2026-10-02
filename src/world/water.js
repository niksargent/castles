// The loch: a glass-still mirror (planar reflection), barely breathing ripples, shallows that show
// the bed, and drifting weed cut from the "Heather & Glass" photograph.
import * as THREE from 'three';
import { PROJ, PROJ_PARS } from '../render/worldMaterial.js';

export function createWater({ heightTex, hmap, groundTex, seaweedTex, renderScale = 0.4 }) {
  const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 0 });
  const textureMatrix = new THREE.Matrix4();
  const uniforms = {
    ...PROJ,
    uProjTight: { value: 1 },
    tReflect: { value: rt.texture },
    textureMatrix: { value: textureMatrix },
    uHeight: { value: heightTex },
    uHmap: { value: new THREE.Vector4(hmap.x0, hmap.z0, hmap.size, 0) },
    uGround: { value: groundTex },
    uSeaweed: { value: seaweedTex },
    uDeep: { value: new THREE.Color(0.05, 0.08, 0.09) },
    uShallow: { value: new THREE.Color(0.25, 0.3, 0.25) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.001 },
    uCamPos: { value: new THREE.Vector3() },
    uMirror: { value: 0.85 },
    uWeed: { value: 1.0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vRefl;
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vRefl = textureMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tReflect;
      uniform sampler2D uHeight;
      uniform vec4 uHmap;
      uniform sampler2D uGround;
      uniform sampler2D uSeaweed;
      uniform vec3 uDeep, uShallow, uSunDir, uSunColor, uFogColor, uCamPos;
      uniform float uFogDensity, uMirror, uWeed;
      varying vec4 vRefl;
      varying vec3 vWPos;
      ${PROJ_PARS}

      float wHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float wNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
      }
      float waves(vec2 p, float t) {
        float h = 0.0;
        h += wNoise(p * 0.11 + vec2(t * 0.05, t * 0.03)) * 0.5;
        h += wNoise(p * 0.37 - vec2(t * 0.09, -t * 0.06)) * 0.25;
        h += wNoise(p * 1.3 + vec2(-t * 0.21, t * 0.17)) * 0.12;
        h += wNoise(p * 3.9 + vec2(t * 0.4, t * 0.33)) * 0.05;
        return h;
      }

      void main() {
        float t = uTime;
        vec2 p = vWPos.xz;
        float e = 0.15;
        float h0 = waves(p, t);
        vec3 n = normalize(vec3(-(waves(p + vec2(e, 0.0), t) - h0) / e * 0.06, 1.0, -(waves(p + vec2(0.0, e), t) - h0) / e * 0.06));

        vec3 V = normalize(uCamPos - vWPos);
        float dist = length(uCamPos - vWPos);
        // bed depth from the terrain heightmap
        vec2 huv = (p - uHmap.xy) / uHmap.z;
        float bed = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture(uHeight, huv).r : -8.0;
        float depth = max(0.0, -bed);

        vec2 ruv = vRefl.xy / vRefl.w + n.xz * 0.6 / (1.0 + dist * 0.02);
        vec3 refl = texture(tReflect, ruv).rgb;

        float cosT = clamp(dot(n, V), 0.0, 1.0);
        float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
        float mirror = clamp(uMirror + (1.0 - uMirror) * fres, 0.0, 1.0);

        // looking down into the shallows we see the bed (ground albedo map), tinted by water
        vec3 groundC = (huv.x > 0.0 && huv.x < 1.0 && huv.y > 0.0 && huv.y < 1.0) ? texture(uGround, huv + n.xz * 0.0006).rgb : uDeep;
        float clarity = exp(-depth * 1.4);
        vec3 body = mix(uDeep, mix(uShallow, groundC * 0.7, 0.6), clarity);
        float seeThrough = clarity * (1.0 - fres) * 0.3 * smoothstep(0.6, 0.0, depth);
        vec3 col = mix(refl, body, max(1.0 - mirror, seeThrough));

        // sun glint
        vec3 H = normalize(uSunDir + V);
        col += uSunColor * pow(max(dot(n, H), 0.0), 900.0) * 0.15;

        // floating weed (from the photograph), patchy, gathering in the shallows
        vec4 weed = texture(uSeaweed, p / 34.0 + vec2(wNoise(p * 0.02) * 0.2, 0.0));
        float patchy = smoothstep(0.45, 0.75, wNoise(p * 0.018) * 0.6 + wNoise(p * 0.07) * 0.4);
        float wa = weed.a * patchy * uWeed * (0.5 + 0.5 * smoothstep(3.0, 0.3, depth)) * smoothstep(1400.0, 200.0, dist);
        col = mix(col, weed.rgb * 0.9, clamp(wa, 0.0, 1.0));

        // shoreline: water thins to nothing at the edge
        float edge = smoothstep(0.0, 0.25, depth);
        col = mix(groundC * 0.55, col, edge);

        // fog
        float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
        col = mix(col, uFogColor, f);

        vec4 pj = projectPhotos(vWPos, vec3(0.0, 1.0, 0.0));
        gl_FragColor = vec4(mix(col, pj.rgb, pj.a), pj.a);
      }`,
  });
  const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.renderOrder = 1;

  const reflCam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane();
  const clip = new THREE.Vector4();
  const q = new THREE.Vector4();
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  function setSize(w, h) {
    rt.setSize(Math.max(16, Math.floor(w * renderScale)), Math.max(16, Math.floor(h * renderScale)));
  }

  function updateReflection(renderer, scene, camera) {
    if (camera.position.y < -0.5) return;
    // mirror the camera in the water plane (y = 0)
    reflCam.copy(camera);
    reflCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
    camera.getWorldDirection(look);
    look.y = -look.y;
    reflCam.up.set(0, -1, 0);
    // keep roll consistent: reflect camera up vector
    tmp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    reflCam.up.set(tmp.x, -tmp.y, tmp.z);
    reflCam.lookAt(reflCam.position.clone().add(look));
    reflCam.updateMatrixWorld();
    reflCam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    textureMatrix.multiply(reflCam.projectionMatrix).multiply(reflCam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // oblique near plane = water plane
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -0.05, 0));
    plane.applyMatrix4(reflCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = reflCam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + pm[8]) / pm[0];
    q.y = (Math.sign(clip.y) + pm[9]) / pm[5];
    q.z = -1;
    q.w = (1 + pm[10]) / pm[14];
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x; pm[6] = clip.y; pm[10] = clip.z + 1; pm[14] = clip.w;
    reflCam.projectionMatrixInverse.copy(reflCam.projectionMatrix).invert();
    reflCam.layers.set(0);
    reflCam.layers.enable(1);
    mesh.visible = false;
    const prev = renderer.getRenderTarget();
    const sa = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    const vp = PROJ.uViewPos.value.clone();
    PROJ.uViewPos.value.copy(reflCam.position);
    renderer.render(scene, reflCam);
    PROJ.uViewPos.value.copy(vp);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = sa;
    mesh.visible = true;
  }

  return { mesh, uniforms, updateReflection, setSize, rt };
}
