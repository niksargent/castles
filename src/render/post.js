// Post-processing: soft bloom, a gentle filmic shoulder, then each zone's photographic "look":
// a gradient map derived from the photo (luminance -> the photo's own colour at that tone),
// contrast/saturation, vignette and the photo's surface (grain, canvas, grunge).
// Pixels where the photograph itself is being shown (alpha from the scene) bypass all of it.
import * as THREE from 'three';

const FS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function createPost(renderer, world, textures) {
  const N = world.photos.length;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const sceneRT = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  sceneRT.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
  const blurs = [];
  for (let i = 0; i < 4; i++) blurs.push(new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false }));
  const mips = [];
  for (let i = 0; i < 6; i++) mips.push(new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, depthBuffer: false }));

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene();
  qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const downMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0 }, uFirst: { value: 0 } },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uFirst;
      varying vec2 vUv;
      vec3 tap(vec2 uv, float karis) {
        vec3 c = texture(tSrc, uv).rgb;
        c = clamp(c, 0.0, 16.0);
        if (karis > 0.5) c /= 1.0 + max(c.r, max(c.g, c.b)); // firefly suppression
        return c;
      }
      void main() {
        float k = uFirst;
        vec3 c = tap(vUv, k) * 4.0;
        c += tap(vUv + uTexel * vec2(-1.0, -1.0), k);
        c += tap(vUv + uTexel * vec2(1.0, -1.0), k);
        c += tap(vUv + uTexel * vec2(-1.0, 1.0), k);
        c += tap(vUv + uTexel * vec2(1.0, 1.0), k);
        c /= 8.0;
        if (uFirst > 0.5) {
          c /= max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); // undo the Karis weighting
          c = min(c, vec3(6.0));
          float a = texture(tSrc, vUv).a;
          float l = max(c.r, max(c.g, c.b));
          c *= smoothstep(uThreshold, uThreshold + 0.6, l) * (1.0 - a);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const upMat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tSrc; uniform vec2 uTexel;
      varying vec2 vUv;
      void main() {
        vec3 c = vec3(0.0);
        c += texture(tSrc, vUv + uTexel * vec2(-1.0, 0.0)).rgb * 2.0;
        c += texture(tSrc, vUv + uTexel * vec2(1.0, 0.0)).rgb * 2.0;
        c += texture(tSrc, vUv + uTexel * vec2(0.0, 1.0)).rgb * 2.0;
        c += texture(tSrc, vUv + uTexel * vec2(0.0, -1.0)).rgb * 2.0;
        c += texture(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
        c += texture(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
        c += texture(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
        c += texture(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
        gl_FragColor = vec4(c / 12.0, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
  });

  const zoneW = new Float32Array(16);
  const uniforms = {
    tScene: { value: sceneRT.texture },
    tBloom: { value: mips[0].texture },
    tGrades: { value: textures.grades },
    tGrainA: { value: null }, tGrainB: { value: null },
    uGrainW: { value: new THREE.Vector2(1, 0) },
    tOverlay: { value: null },
    uOverlay: { value: 0 },
    uOverlayDim: { value: 1 },
    uOverlayRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    uZoneW: { value: zoneW },
    uZoneCount: { value: N },
    uGrade: { value: 0.3 },
    uExposure: { value: 1 },
    uContrast: { value: 1.1 },
    uSaturation: { value: 1.1 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.03 },
    uCanvas: { value: 0 },
    uBloom: { value: 0.35 },
    uFade: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(size.x, size.y) },
    uGrainScale: { value: 1 },
    uPhotoPass: { value: 1 },
    tDepth: { value: sceneRT.depthTexture },
    tBlur: { value: blurs[2].texture },
    uInvProj: { value: new THREE.Matrix4() },
    uInvView: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uClarity: { value: 0.35 },
    uMistColor: { value: new THREE.Color(0.6, 0.6, 0.6) },
    uHFog: { value: new THREE.Vector2(0.0025, 9) },
    uSun: { value: new THREE.Vector3(0.5, 0.5, 0) },
    uShaftColor: { value: new THREE.Color(1, 1, 1) },
    uShaft: { value: 0.5 },
    uKeepLum: { value: 0.45 },
  };
  const finalMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene, tBloom, tGrades, tGrainA, tGrainB, tOverlay, tDepth, tBlur;
      uniform mat4 uInvProj, uInvView;
      uniform vec3 uCamPos, uMistColor, uSun, uShaftColor;
      uniform vec2 uHFog;
      uniform float uClarity, uShaft, uKeepLum;
      uniform vec2 uGrainW;
      uniform float uOverlay;
      uniform float uOverlayDim;
      uniform vec4 uOverlayRect;
      uniform float uZoneW[16];
      uniform int uZoneCount;
      uniform float uGrade, uExposure, uContrast, uSaturation, uVignette, uGrain, uCanvas, uBloom, uFade, uTime, uGrainScale, uPhotoPass;
      uniform vec2 uRes;
      varying vec2 vUv;

      vec3 toSRGB(vec3 c) {
        c = max(c, 0.0);
        return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      // near-identity below 0.8, smooth shoulder above: textures woven from the photos keep their colour
      vec3 shoulder(vec3 c) {
        vec3 k = 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2));
        return mix(c, k, step(0.8, c));
      }
      float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

      void main() {
        vec4 s = texture(tScene, vUv);
        float pw = clamp(s.a, 0.0, 1.0) * uPhotoPass;
        vec3 hdr = s.rgb;
        if (any(isnan(hdr)) || any(isinf(hdr))) hdr = vec3(0.0);
        hdr = min(hdr, vec3(12.0));
        float depth = texture(tDepth, vUv).r;
        bool isSky = depth > 0.99999;
        vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vp /= vp.w;
        vec3 wp = (uInvView * vec4(vp.xyz, 1.0)).xyz;
        float dist = length(wp - uCamPos);
        float np = 1.0 - pw;

        // clarity: the local contrast of the HDR photographs
        vec3 blur = texture(tBlur, vUv).rgb;
        float detail = log(luma(hdr) + 0.03) - log(luma(blur) + 0.03);
        hdr *= exp(clamp(detail, -1.5, 1.5) * uClarity * np);

        // low mist that pools over the loch and the valleys
        if (!isSky) {
          float H = uHFog.y;
          float y0 = max(uCamPos.y, 0.0), y1 = max(wp.y, 0.0);
          float e0 = exp(-y0 / H), e1 = exp(-y1 / H);
          float avg = abs(y1 - y0) > 0.05 ? H * (e0 - e1) / (y1 - y0) : e0;
          float f = 1.0 - exp(-uHFog.x * avg * dist);
          hdr = mix(hdr, uMistColor, clamp(f, 0.0, 0.85) * np);
        }

        // light shafts from the photograph's brightest patch of sky
        if (uSun.z > 0.01) {
          vec2 dlt = (uSun.xy - vUv);
          float acc = 0.0, wsum = 0.0;
          for (int i = 0; i < 28; i++) {
            float t = (float(i) + fract(sin(dot(vUv, vec2(12.9, 78.2))) * 437.5)) / 28.0;
            vec2 uv = vUv + dlt * t * 0.92;
            float sk = step(0.99999, texture(tDepth, uv).r);
            float w = 1.0 - t * 0.6;
            acc += sk * smoothstep(0.15, 1.2, luma(texture(tScene, uv).rgb)) * w;
            wsum += w;
          }
          float fall = exp(-length(dlt * vec2(uRes.x / uRes.y, 1.0)) * 1.6);
          hdr += uShaftColor * (acc / wsum) * fall * uShaft * uSun.z * np;
        }

        vec3 bl = texture(tBloom, vUv).rgb;
        if (any(isnan(bl))) bl = vec3(0.0);
        hdr += min(bl, vec3(2.0)) * uBloom * np;
        vec3 c = toSRGB(shoulder(hdr * uExposure));

        // the photographs' own tonality: gradient map blended from nearby zones
        float l = clamp(luma(c), 0.0, 1.0);
        vec3 g = vec3(0.0); float gw = 0.0;
        for (int i = 0; i < 16; i++) {
          if (i >= uZoneCount) break;
          float w = uZoneW[i];
          if (w < 0.002) continue;
          g += texture(tGrades, vec2(l * 0.996 + 0.002, (float(i) + 0.5) / float(uZoneCount))).rgb * w;
          gw += w;
        }
        g /= max(gw, 1e-4);
        // keep a little of the rendered hue variation inside the map
        vec3 chroma = c - vec3(l);
        vec3 graded = g + chroma * 0.35;
        float gl = luma(graded);
        graded *= mix(1.0, (l + 0.03) / (gl + 0.03), uKeepLum);
        c = mix(c, graded, uGrade);
        // contrast & saturation
        c = (c - 0.45) * uContrast + 0.45;
        float L = luma(c);
        c = mix(vec3(L), c, uSaturation);

        // where the photograph is showing, show it exactly
        vec3 photo = toSRGB(s.rgb);
        c = mix(c, photo, pw);

        // vignette
        vec2 q = vUv - 0.5;
        q.x *= uRes.x / uRes.y * 0.75;
        float v = 1.0 - smoothstep(0.35, 0.95, length(q)) * uVignette;
        c *= v;

        // surface: grain / canvas taken from the photos themselves
        vec2 guv = gl_FragCoord.xy / 512.0 * uGrainScale;
        vec2 jit = vec2(fract(sin(floor(uTime * 24.0) * 12.9898) * 43758.5), fract(sin(floor(uTime * 24.0) * 78.233) * 12345.6));
        vec2 animUv = guv + jit * (1.0 - min(uCanvas * 2.0, 1.0));
        float gr = texture(tGrainA, animUv).r * uGrainW.x + texture(tGrainB, animUv).r * uGrainW.y;
        float amt = uGrain * 2.2 + uCanvas * 0.5;
        c *= 1.0 + (gr - 0.5) * amt * (1.0 - 0.6 * pw);

        // photograph overlay (memories, travel)
        if (uOverlay > 0.001) {
          vec2 ov = (vUv - uOverlayRect.xy) / (uOverlayRect.zw - uOverlayRect.xy);
          if (ov.x >= 0.0 && ov.x <= 1.0 && ov.y >= 0.0 && ov.y <= 1.0) {
            vec2 e = smoothstep(vec2(0.0), vec2(0.01), ov) * smoothstep(vec2(0.0), vec2(0.01), 1.0 - ov);
            vec3 oc = toSRGB(texture(tOverlay, ov).rgb);
            c = mix(c, oc, uOverlay * e.x * e.y);
          } else {
            // around the print: a soft, darkened blur of the world (aspect mismatch reads as a mount)
            vec3 bl = toSRGB(shoulder(texture(tBlur, vUv).rgb * uExposure));
            bl = mix(vec3(luma(bl)), bl, 0.7) * 0.55;
            c = mix(c, bl, uOverlay * (1.0 - uOverlayDim));
            c = mix(c, vec3(0.0), uOverlay * 0.92 * uOverlayDim);
          }
        }
        c = mix(c, vec3(0.0), uFade);
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });

  function setSize(w, h) {
    sceneRT.setSize(w, h);
    for (let i = 0; i < blurs.length; i++) blurs[i].setSize(Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)));
    let mw = w, mh = h;
    for (let i = 0; i < mips.length; i++) {
      mw = Math.max(2, Math.floor(mw / 2)); mh = Math.max(2, Math.floor(mh / 2));
      mips[i].setSize(mw, mh);
    }
    uniforms.uRes.value.set(w, h);
  }

  function render() {
    quad.material = downMat;
    // un-thresholded blur chain (local mean for clarity)
    {
      let src = sceneRT.texture, sw = sceneRT.width, sh = sceneRT.height;
      for (let i = 0; i < blurs.length; i++) {
        downMat.uniforms.tSrc.value = src;
        downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        downMat.uniforms.uFirst.value = 0;
        renderer.setRenderTarget(blurs[i]);
        renderer.render(qScene, qCam);
        src = blurs[i].texture; sw = blurs[i].width; sh = blurs[i].height;
      }
    }
    // bloom chain
    let src = sceneRT.texture, sw = sceneRT.width, sh = sceneRT.height;
    for (let i = 0; i < mips.length; i++) {
      downMat.uniforms.tSrc.value = src;
      downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
      downMat.uniforms.uThreshold.value = 0.85;
      renderer.setRenderTarget(mips[i]);
      renderer.render(qScene, qCam);
      src = mips[i].texture; sw = mips[i].width; sh = mips[i].height;
    }
    quad.material = upMat;
    for (let i = mips.length - 1; i > 0; i--) {
      upMat.uniforms.tSrc.value = mips[i].texture;
      upMat.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
      renderer.setRenderTarget(mips[i - 1]);
      renderer.autoClear = false;
      renderer.render(qScene, qCam);
      renderer.autoClear = true;
    }
    quad.material = finalMat;
    renderer.setRenderTarget(null);
    renderer.render(qScene, qCam);
  }

  return { sceneRT, uniforms, setSize, render, zoneW };
}
