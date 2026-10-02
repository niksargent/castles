// Alignment inspector: renders the world's silhouette from a photograph's camera and compares it
// with the photograph's own skyline mask.
//   red   = the photo shows something solid here, the model shows sky   (model too small / missing)
//   cyan  = the model is solid here, the photo shows sky                (model too big / misplaced)
// Usage (console):  await T.align('ed_heather')   ->  returns { iou, missing, extra } and shows the overlay.
import * as THREE from 'three';
import { projectorCamera } from '../render/projection.js';

export function installAlign(T) {
  let overlay = null;
  function renderMask(it, W, H, layersMask) {
    const rt = new THREE.WebGLRenderTarget(W, H);
    const scene = T.scene;
    const hide = [T.sky.mesh, T.grass.mesh];
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const prevOverride = scene.overrideMaterial, prevFog = scene.fog;
    scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    scene.fog = null;
    const cam = projectorCamera(it.p);
    cam.layers.mask = layersMask;
    T.renderer.setRenderTarget(rt);
    T.renderer.setClearColor(0x000000, 1);
    T.renderer.clear();
    T.renderer.render(scene, cam);
    const geo = new Uint8Array(W * H * 4);
    T.renderer.readRenderTargetPixels(rt, 0, 0, W, H, geo);
    T.renderer.setRenderTarget(null);
    scene.overrideMaterial = prevOverride; scene.fog = prevFog;
    hide.forEach((o, k) => (o.visible = vis[k]));
    rt.dispose();
    return geo;
  }

  T.align = async (id, opts = {}) => {
    const it = T.projectors.items.find((q) => q.p.id === id);
    if (!it) throw new Error('no photo ' + id);
    const W = opts.width || 1280, H = Math.round(W / it.p.aspect);
    const vegetation = [T.trees.group, T.rocks];
    vegetation.forEach((o) => (o.visible = false));
    const geo = renderMask(it, W, H, 0b11);
    vegetation.forEach((o) => (o.visible = true));
    // castle-only render (castles live on layer 1 together with trees & rocks; isolate the castle group)
    const hidden = [];
    const which = { eilean_donan: 0, edinburgh: 2, dunvegan: 3 }[it.p.landmark] ?? 0;
    const groups = it.p.alignGroups || [which];
    const others = [T.trees.group, T.rocks, ...T.castles.children.filter((c, k) => !groups.includes(k))];
    others.forEach((o) => (o.visible = false));
    const cas = renderMask(it, W, H, 0b10);
    others.forEach((o) => (o.visible = true));
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cas[((H - 1 - y) * W + x) * 4] > 127) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = W - 1; y1 = H - 1; }
    const padX = (x1 - x0) * 0.06 + 6, padY = (y1 - y0) * 0.06 + 6;
    x0 = Math.max(0, Math.floor(x0 - padX)); x1 = Math.min(W - 1, Math.ceil(x1 + padX));
    y0 = Math.max(0, Math.floor(y0 - padY)); y1 = Math.min(H - 1, Math.ceil(y1 + padY));

    // photo + mask
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(it.mask.image, 0, 0, W, H);
    const mask = g.getImageData(0, 0, W, H).data;
    g.drawImage(it.tex.image, 0, 0, W, H);
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    let inter = 0, uni = 0, missing = 0, extra = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      const gi = ((H - 1 - y) * W + x) * 4; // render target rows are bottom-up
      const solidModel = geo[gi] > 127;
      const solidPhoto = mask[i] < 127;
      if (solidModel && solidPhoto) inter++;
      if (solidModel || solidPhoto) uni++;
      const k = 0.45;
      d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      if (solidPhoto && !solidModel) { d[i] = 255; d[i + 1] = 40; d[i + 2] = 40; missing++; }
      else if (!solidPhoto && solidModel) { d[i] = 40; d[i + 1] = 230; d[i + 2] = 255; extra++; }
      // castle outline in yellow
      const ci = ((H - 1 - y) * W + x) * 4;
      const cIn = cas[ci] > 127;
      const cR = x + 1 < W && cas[ci + 4] > 127, cU = y + 1 < H && cas[ci - W * 4] > 127;
      if (cIn !== cR || cIn !== cU) { d[i] = 255; d[i + 1] = 230; d[i + 2] = 0; }
    }
    g.putImageData(img, 0, 0);
    if (!overlay) {
      overlay = document.createElement('canvas');
      overlay.style.cssText = 'position:fixed;inset:0;margin:auto;max-width:100vw;max-height:100vh;z-index:60;background:#000';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', () => (overlay.style.display = 'none'));
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    overlay.width = cw; overlay.height = ch;
    overlay.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
    overlay.style.display = 'block';
    const area = (x1 - x0 + 1) * (y1 - y0 + 1);
    const res = { id, iou: +(inter / uni).toFixed(3), missing: +(missing / area).toFixed(3), extra: +(extra / area).toFixed(3), box: [x0 / W, y0 / H, x1 / W, y1 / H].map((v) => +v.toFixed(3)) };
    return res;
  };
  T.alignHide = () => overlay && (overlay.style.display = 'none');

  // ---------------------------------------------------------------- automatic camera fit
  // Maximise silhouette agreement inside the photo's castle columns. Distant terrain is clipped
  // (it is invented, so it must not steer the fit); for loch photos the water horizon pins pitch.
  const photoMaskCache = {};
  function photoMask(it, W, H) {
    const key = it.p.id + W;
    if (photoMaskCache[key]) return photoMaskCache[key];
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(it.mask.image, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = d[i * 4] < 127 ? 1 : 0;
    return (photoMaskCache[key] = m);
  }
  let fitRT = null;
  function modelMask(it, pose, W, H, far, castleOnly = false) {
    if (!fitRT || fitRT.width !== W || fitRT.height !== H) { fitRT && fitRT.dispose(); fitRT = new THREE.WebGLRenderTarget(W, H); }
    const cam = new THREE.PerspectiveCamera(pose.vfov, it.p.aspect, 0.5, far);
    cam.position.set(pose.x, pose.y, pose.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(THREE.MathUtils.degToRad(pose.pitch), -THREE.MathUtils.degToRad(pose.yaw), 0);
    cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    cam.layers.set(0); cam.layers.enable(1);
    const scene = T.scene;
    const hide = [T.sky.mesh, T.grass.mesh, T.water.mesh, T.trees.group, T.rocks];
    if (castleOnly) {
      const which = { eilean_donan: 0, edinburgh: 2, dunvegan: 3 }[it.p.landmark] ?? 0;
      const groups = it.p.alignGroups || [which];
      hide.push(T.terrain, ...T.castles.children.filter((c, k) => !groups.includes(k)));
    }
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    const po = scene.overrideMaterial, pf = scene.fog;
    scene.overrideMaterial = fitMat; scene.fog = null;
    T.renderer.setRenderTarget(fitRT);
    T.renderer.setClearColor(0x000000, 1);
    T.renderer.clear();
    T.renderer.render(scene, cam);
    T.renderer.readRenderTargetPixels(fitRT, 0, 0, W, H, fitBuf.length === W * H * 4 ? fitBuf : (fitBuf = new Uint8Array(W * H * 4)));
    T.renderer.setRenderTarget(null);
    scene.overrideMaterial = po; scene.fog = pf;
    hide.forEach((o, k) => (o.visible = vis[k]));
    return fitBuf;
  }
  const fitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  let fitBuf = new Uint8Array(4);

  function score(it, pose, W, H, opts) {
    const pm = photoMask(it, W, H);
    const mm = modelMask(it, pose, W, H, opts.far);
    const cx = it.p.castleX || [0, 100];
    const x0 = Math.floor(cx[0] / 100 * W), x1 = Math.ceil(cx[1] / 100 * W);
    const water = it.p.landmark !== 'edinburgh';
    const yMax = water ? Math.floor((it.p.horizon / 100) * H) : H;
    let bad = 0, n = 0;
    for (let y = 0; y < yMax; y++) for (let x = x0; x < x1; x++) {
      const a = pm[y * W + x];
      const b = mm[((H - 1 - y) * W + x) * 4] > 127 ? 1 : 0;
      bad += a ^ b; n++;
    }
    let cost = bad / Math.max(1, n);
    // the castle itself must sit in the photo's castle columns (stops the fit matching hills instead)
    const cm = modelMask(it, pose, W, H, opts.far, true);
    let inside = 0, total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (cm[((H - 1 - y) * W + x) * 4] > 127) { total++; if (x >= x0 && x < x1) inside++; }
    }
    cost += total < 20 ? 1 : 0.5 * (1 - inside / total);
    if (water) {
      // horizon row predicted by this pose vs the photo's water horizon
      const t = Math.tan(THREE.MathUtils.degToRad(pose.pitch)) / Math.tan(THREE.MathUtils.degToRad(pose.vfov / 2));
      const hRow = 0.5 + t / 2;
      cost += 4 * (hRow - it.p.horizon / 100) ** 2;
    }
    return cost;
  }

  function nelderMead(f, x0, steps, iters) {
    const n = x0.length;
    let pts = [x0.slice()];
    for (let i = 0; i < n; i++) { const p = x0.slice(); p[i] += steps[i]; pts.push(p); }
    let vals = pts.map(f);
    for (let k = 0; k < iters; k++) {
      const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      pts = idx.map((i) => pts[i]); vals = idx.map((i) => vals[i]);
      const c = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
      const wst = pts[n];
      const refl = c.map((v, j) => v + (v - wst[j]));
      const fr = f(refl);
      if (fr < vals[0]) {
        const exp = c.map((v, j) => v + 2 * (v - wst[j]));
        const fe = f(exp);
        if (fe < fr) { pts[n] = exp; vals[n] = fe; } else { pts[n] = refl; vals[n] = fr; }
      } else if (fr < vals[n - 1]) { pts[n] = refl; vals[n] = fr; }
      else {
        const con = c.map((v, j) => v + 0.5 * (wst[j] - v));
        const fc = f(con);
        if (fc < vals[n]) { pts[n] = con; vals[n] = fc; }
        else {
          for (let i = 1; i <= n; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
        }
      }
    }
    const best = vals.indexOf(Math.min(...vals));
    return { x: pts[best], v: vals[best] };
  }

  T.fit = async (id, opts = {}) => {
    const it = T.projectors.items.find((q) => q.p.id === id);
    const W = opts.width || 360, H = Math.round(W / it.p.aspect);
    opts.far = opts.far || 450;
    const c0 = it.p.camera;
    const base = { x: c0.pos[0], y: c0.pos[1], z: c0.pos[2], yaw: c0.yaw, pitch: c0.pitch, vfov: c0.vfov };
    const lock = it.p.fitLock || opts.lock || [];
    const toPose = (v) => ({ x: v[0], y: base.y, z: v[1], yaw: v[2], pitch: lock.includes('pitch') ? base.pitch : v[3], vfov: lock.includes('vfov') ? base.vfov : Math.min(85, Math.max(20, v[4])) });
    const f = (v) => score(it, toPose(v), W, H, opts);
    const before = f([base.x, base.z, base.yaw, base.pitch, base.vfov]);
    let start = [base.x, base.z, base.yaw, base.pitch, base.vfov];
    if (before > 0.12 || opts.global) {
      // coarse global search: step back / forward along the line of sight, sweep pitch and yaw
      const yr = THREE.MathUtils.degToRad(base.yaw);
      const fx = Math.sin(yr), fz = -Math.cos(yr);
      let best = before;
      for (const back of [-40, 0, 40, 80, 130, 190, 260]) for (const dp of [-8, -4, 0, 4, 8, 14]) for (const dy of [-20, -14, -8, -3, 0, 3, 8, 14, 20]) {
        const v = [base.x - fx * back, base.z - fz * back, base.yaw + dy, base.pitch + dp, base.vfov];
        const c = f(v);
        if (c < best) { best = c; start = v; }
      }
    }
    let r = nelderMead(f, start, [6, 6, 2.5, 1.5, 4], opts.iters || 160);
    // restart once from the result with smaller steps
    r = nelderMead(f, r.x, [2, 2, 0.8, 0.5, 1.5], opts.iters || 120);
    const pose = toPose(r.x);
    const out = { id, before: +before.toFixed(4), after: +r.v.toFixed(4), camera: { pos: [+pose.x.toFixed(1), +pose.y.toFixed(2), +pose.z.toFixed(1)], yaw: +pose.yaw.toFixed(2), pitch: +pose.pitch.toFixed(2), vfov: +pose.vfov.toFixed(1) } };
    if (opts.apply !== false) { Object.assign(it.p.camera, out.camera); }
    return out;
  };
}
