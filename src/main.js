// Tapestry — a walkable world woven from photographs.
import * as THREE from 'three';
import { registerViewpoints, heightAt, landDistance } from './world/geography.js';
import { buildTerrainGeometries, loadLayerArray, createTerrainMaterial, buildHeightTexture, HMAP, meshHeightAt } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createTrees, createRocks, createGrass } from './world/vegetation.js';
import { buildEileanDonan, buildEDBridge, buildEdinburgh, buildDunvegan, buildKirkyard, buildCottage } from './castles/castles.js';
import { patchWorldMaterial, PROJ } from './render/worldMaterial.js';
import { createPost } from './render/post.js';
import { Projectors } from './render/projection.js';
import { Zones } from './render/zones.js';
import { Player, EYE } from './player.js';
import { Soundscape, MOODS } from './audio.js';
import { createMemories } from './memories.js';
import { installAlign } from './debug/align.js';
import { loadScrambled } from './util/scrambled.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const CALIB = params.get('calib');
const DEBUG = params.has('debug');
const WALK_FOV = 68;
const tick = () => new Promise((r) => setTimeout(r, 0));
// Looking is click-and-drag everywhere (pointer lock felt heavy-handed, and browsers handle it
// inconsistently on a hosted page), so this is intentionally a no-op.
function lockPointer() {}

function status(text, frac) {
  $('status').textContent = text;
  if (frac !== undefined) $('bar').firstElementChild.style.width = `${Math.round(frac * 100)}%`;
}

function fail(e) {
  console.error(e);
  const el = $('err');
  el.style.display = 'flex';
  el.textContent = 'The tapestry could not be woven on this device: ' + (e && e.message ? e.message : e);
}

// ------------------------------------------------------------------------- textures
const texLoader = new THREE.TextureLoader();
function loadTex(url, { srgb = true, repeat = false, flipY = true } = {}) {
  return new Promise((res, rej) => texLoader.load(url, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.flipY = flipY;
    t.anisotropy = 8;
    res(t);
  }, undefined, rej));
}

async function main() {
  const canvas = $('view');
  // the photographs are the artist's: no save-image menu on the world or the atlas
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) throw new Error('WebGL2 is required');
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  if (IS_TOUCH) {
    document.body.classList.add('touch');
    document.querySelector('#intro .keys').textContent = 'Drag to look · left thumb-stick to walk · ‹ › to travel between photographs';
    document.querySelector('#intro .enter').textContent = 'Tap to step into the photograph';
  }
  let pixelScale = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.0 : 1.25);
  renderer.setPixelRatio(pixelScale);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  status('Reading the photographs', 0.02);
  const world = await (await fetch('world/generated/world.json')).json();
  registerViewpoints(world.photos, EYE);

  // ---- textures
  const textures = { photos: {}, thumbs: {}, masks: {}, panos: {}, grains: {} };
  const jobs = [];
  for (const p of world.photos) {
    jobs.push(loadScrambled(`world/generated/photos/${p.id}.dat`).then((c) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      textures.photos[p.id] = t;
    }));
    jobs.push(loadScrambled(`world/generated/thumbs/${p.id}.dat`).then((c) => { textures.thumbs[p.id] = c; }));
    jobs.push(loadTex(`world/generated/masks/${p.id}.png`, { srgb: false }).then((t) => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; textures.masks[p.id] = t; }));
    jobs.push(loadTex(`world/generated/sky/${p.id}.jpg`).then((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; textures.panos[p.id] = t; }));
    jobs.push(loadTex(`world/generated/grain/${p.id}.jpg`, { srgb: false, repeat: true }).then((t) => { textures.grains[p.id] = t; }));
  }
  jobs.push(loadTex('world/generated/grades.png', { srgb: false }).then((t) => {
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.flipY = false; textures.grades = t;
  }));
  jobs.push(loadTex('world/generated/swatches/seaweed.png', { repeat: true }).then((t) => { textures.seaweed = t; }));
  const swatchCache = {};
  const swatchNames = ['ed_shingle', 'ed_stone', 'ed_stone_b', 'ed_bridge_stone', 'slate', 'edin_stone', 'edin_stone_pink', 'edin_wall', 'edin_neon', 'dun_render', 'tomb',
    'ed_forest', 'edin_foliage', 'dun_trees', 'edin_rowan', 'ed_lichen', 'ed_wrack', 'ed_rock', 'dun_cliff', 'edin_crag'];
  for (const n of swatchNames) jobs.push(loadTex(`world/generated/swatches/${n}.jpg`, { repeat: true }).then((t) => { swatchCache[n] = t; }));
  let done = 0;
  jobs.forEach((j) => j.then(() => status('Reading the photographs', 0.02 + 0.25 * (++done / jobs.length))));
  await Promise.all(jobs);
  // grades texture must not be flipped (row i = photo i)
  textures.grades.flipY = false; textures.grades.needsUpdate = true;
  const swatchTex = (n) => { const t = swatchCache[n].clone(); t.needsUpdate = true; return t; };

  status('Weaving the ground', 0.3);
  await tick();
  const layers = await loadLayerArray(world);

  // ---- scene
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x888888, 0.001);
  const camera = new THREE.PerspectiveCamera(WALK_FOV, innerWidth / innerHeight, 0.2, 14000);
  camera.layers.enable(1); camera.layers.enable(2);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 1; sc.far = 900;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  sun.layers.enableAll();
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbbccdd, 0x334422, 1.4);
  scene.add(hemi);

  const sky = createSky();
  scene.add(sky.mesh);

  // terrain
  const terrainMat = createTerrainMaterial(layers);
  const terrainGeos = await buildTerrainGeometries(async (f) => { status('Weaving the ground', 0.3 + f * 0.25); await tick(); });
  const terrain = new THREE.Group();
  for (const g of terrainGeos) {
    const m = new THREE.Mesh(g, terrainMat);
    m.receiveShadow = true; m.castShadow = false;
    m.layers.enable(3);
    terrain.add(m);
  }
  scene.add(terrain);

  status('Raising the castles', 0.58);
  await tick();
  const triMat = (name, scale, opts = {}) => patchWorldMaterial(new THREE.MeshStandardMaterial({ roughness: opts.rough ?? 0.92, color: 0xffffff }), {
    key: 'tri-' + name + (opts.key || ''), triMap: swatchTex(name), triScale: 1 / scale, grime: opts.grime ?? 0.3, grimeHeight: opts.grimeHeight ?? 5, baseY: opts.baseY ?? 0,
    tint: opts.tint ? new THREE.Color(...opts.tint) : undefined,
  });
  const plain = (color, rough = 0.85, metal = 0) => patchWorldMaterial(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }), { key: 'plain' });
  const mats = {
    ed_stone: triMat('ed_stone', 3.2, { baseY: 2, grime: 0.35 }),
    ed_hall: triMat('ed_stone_b', 3.0, { baseY: 2 }),
    ed_bridge: triMat('ed_bridge_stone', 3.5, { baseY: -1, grime: 0.4 }),
    slate: triMat('ed_shingle', 1.6, { grime: 0, tint: [0.9, 0.92, 1.05], rough: 0.65, key: 's' }),
    glass: plain(0x0b0d10, 0.55, 0.15),
    trim: plain(0xd8d0c2, 0.8),
    edin_stone: triMat('edin_stone', 4.0, { baseY: 46, grime: 0.25 }),
    edin_pink: triMat('edin_stone_pink', 4.0, { baseY: 46, grime: 0.25 }),
    edin_wall: triMat('edin_stone', 5.0, { baseY: 30, grime: 0.3, grimeHeight: 12, tint: [0.85, 0.8, 0.78], key: 'w' }),
    lawn: triMat('edin_neon', 5.0, { grime: 0 }),
    dun_render: triMat('dun_render', 4.0, { baseY: 14, grime: 0.25 }),
    tomb: triMat('tomb', 2.6, { baseY: 8, grime: 0.3 }),
    tombdark: plain(0x4a2414, 0.9),
    harl: plain(0xd9d5cc, 0.9),
    default: plain(0x888888),
  };
  const colliders = [];
  const builders = [buildEileanDonan(), buildEDBridge(), buildEdinburgh(), buildDunvegan(), buildCottage(),
    buildKirkyard(world.photos.find((p) => p.id === 'edin_kirkyard'))];
  const castles = new THREE.Group();
  for (const b of builders) {
    castles.add(b.build(mats));
    colliders.push(...b.colliders);
  }
  castles.traverse((o) => o.isMesh && o.layers.set(1));
  scene.add(castles);

  status('Growing the woods', 0.66);
  await tick();
  const trees = createTrees(swatchTex, colliders, world.swatchMeans, world.photos);
  scene.add(trees.group);
  const rocks = createRocks(swatchTex, world.photos, colliders);
  scene.add(rocks);

  status('Filling the loch', 0.72);
  await tick();
  const hmap = buildHeightTexture();
  const groundRT = new THREE.WebGLRenderTarget(2048, 2048, { type: THREE.HalfFloatType, depthBuffer: true });
  groundRT.texture.generateMipmaps = true;
  groundRT.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const water = createWater({ heightTex: hmap.tex, hmap, groundTex: groundRT.texture, seaweedTex: textures.seaweed });
  scene.add(water.mesh);
  const grass = createGrass({ heightTex: hmap.tex, groundTex: groundRT.texture, hmap, count: IS_TOUCH ? 110 : 170 });
  scene.add(grass.mesh);

  // memories (floating photographs)
  const memories = createMemories(world, textures);
  scene.add(memories.group);

  // ---- bake the ground albedo (for grass colour & the loch bed)
  status('Dyeing the threads', 0.78);
  await tick();
  {
    const bakeCam = new THREE.OrthographicCamera(-HMAP.size / 2, HMAP.size / 2, HMAP.size / 2, -HMAP.size / 2, 1, 3000);
    bakeCam.position.set(HMAP.x0 + HMAP.size / 2, 1500, HMAP.z0 + HMAP.size / 2);
    bakeCam.up.set(0, 0, -1);
    bakeCam.lookAt(HMAP.x0 + HMAP.size / 2, 0, HMAP.z0 + HMAP.size / 2);
    bakeCam.layers.set(3);
    terrainMat.userData.uniforms.uBake.value = 1;
    terrainMat.userData.uniforms.uCamPos.value.set(0, 100000, 0); // far mix off
    const fog = scene.fog; scene.fog = null;
    const bg = scene.background;
    renderer.setRenderTarget(groundRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, bakeCam);
    renderer.setRenderTarget(null);
    scene.fog = fog;
    terrainMat.userData.uniforms.uBake.value = 0;
  }

  // ---- projectors: depth from each photograph's camera
  status('Hanging the photographs', 0.86);
  await tick();
  const projectors = new Projectors(world, textures);
  const hideForDepth = [sky.mesh, water.mesh, grass.mesh, memories.group];
  projectors.renderDepths(renderer, scene, hideForDepth);

  const zones = new Zones(world);
  const post = createPost(renderer, world, textures);
  const player = new Player(camera, canvas, colliders);
  const audio = new Soundscape();
  player.onStep = (s, sp) => audio.step(s, sp);

  const resize = () => {
    renderer.setPixelRatio(pixelScale);
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    const v = new THREE.Vector2();
    renderer.getDrawingBufferSize(v);
    post.setSize(v.x, v.y);
    water.setSize(v.x, v.y);
  };
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------------- experience state
  const S = {
    mode: 'loading',          // loading | intro | memory | walk | travel
    memory: -1,
    anim: null,               // camera animation
    overlay: 0, overlayTarget: 0, overlayDim: 0, overlayPhoto: null,
    fade: 0,
    captionTimer: 0,
    lastZone: -1,
    fovTarget: WALK_FOV,
    stillTime: 0,
    time: 0,
  };
  const photoById = Object.fromEntries(world.photos.map((p) => [p.id, p]));

  function showCopyright(on) { $('copyright').classList.toggle('dim', !on); }

  function showCaption(p, secs = 7) {
    $('caption').querySelector('.t').textContent = p.title;
    $('caption').querySelector('.c').textContent = p.caption;
    $('caption').classList.remove('hidden');
    S.captionTimer = secs;
  }

  function overlayRect(p) {
    const sa = innerWidth / innerHeight;
    const wFrac = p.aspect / sa;
    post.uniforms.uOverlayRect.value.set(0.5 - wFrac / 2, 0, 0.5 + wFrac / 2, 1);
  }

  function poseOf(p) {
    const c = p.camera;
    return { x: c.pos[0], y: c.pos[1], z: c.pos[2], yaw: THREE.MathUtils.degToRad(c.yaw), pitch: THREE.MathUtils.degToRad(c.pitch), fov: c.vfov };
  }

  function enterMemory(i, { instant = false, dur = 2.4 } = {}) {
    const p = world.photos[i];
    S.mode = 'memory';
    S.memory = i;
    const to = poseOf(p);
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: player.yaw, pitch: player.pitch, fov: camera.fov };
    // unwrap yaw so we turn the short way
    while (to.yaw - from.yaw > Math.PI) to.yaw -= Math.PI * 2;
    while (to.yaw - from.yaw < -Math.PI) to.yaw += Math.PI * 2;
    S.anim = instant ? null : { from, to, t: 0, dur };
    if (instant) applyPose(to);
    projectors.force = { index: i, w: 1 };
    S.overlayPhoto = textures.photos[p.id];
    post.uniforms.tOverlay.value = S.overlayPhoto;
    overlayRect(p);
    S.overlayDim = 0;
    S.stillTime = 0;
    player.lookDelta = 0;
    showCaption(p, 1e9);
    $('prompt').classList.add('hidden');
  }

  function applyPose(o) {
    player.setPose(o.x, o.y, o.z, o.yaw, o.pitch);
    camera.position.set(o.x, o.y, o.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(o.pitch, -o.yaw, 0);
    camera.fov = o.fov; camera.updateProjectionMatrix();
  }

  function leaveMemory() {
    if (S.mode !== 'memory') return;
    S.mode = 'walk';
    projectors.force = null;
    S.overlayTarget = 0;
    S.fovTarget = WALK_FOV;
    S.captionTimer = 5;
  }

  // Travel: a flight over the land, rising out of where you are and descending into the photograph.
  function travelTo(i) {
    const p = world.photos[i];
    hideAtlas();
    projectors.force = null;
    S.overlayTarget = 0;
    S.overlayDim = 0;
    $('prompt').classList.add('hidden');
    const to = poseOf(p);
    const from = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: player.yaw, pitch: player.pitch, fov: camera.fov };
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    S.mode = 'travel';
    S.flight = { i, from, to, t: 0, dur: THREE.MathUtils.clamp(2.2 + dist / 260, 2.4, 6.5), arc: THREE.MathUtils.clamp(dist * 0.22, 25, 150), dist };
    showCaption(p, 1e9);
    lockPointer();
  }

  function flightStep(dt) {
    const F = S.flight;
    F.t += dt;
    const k = Math.min(1, F.t / F.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const x = F.from.x + (F.to.x - F.from.x) * e, z = F.from.z + (F.to.z - F.from.z) * e;
    let y = F.from.y + (F.to.y - F.from.y) * e + F.arc * Math.sin(Math.PI * e);
    const clear = Math.max(0, heightAt(x, z)) + 6 * Math.sin(Math.PI * k);
    if (y < clear) y = clear;
    // heading: along the flight, turning to the photograph's own view for the last stretch
    const pathYaw = F.dist > 1 ? Math.atan2(F.to.x - F.from.x, -(F.to.z - F.from.z)) : F.to.yaw;
    const fade = THREE.MathUtils.smoothstep(k, 0.55, 0.95);
    const lerpAng = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
    const startBlend = THREE.MathUtils.smoothstep(k, 0, 0.25);
    let yaw = lerpAng(F.from.yaw, pathYaw, startBlend);
    yaw = lerpAng(yaw, F.to.yaw, fade);
    const pitch = THREE.MathUtils.lerp(THREE.MathUtils.lerp(F.from.pitch, -0.18, startBlend), F.to.pitch, fade);
    const fov = THREE.MathUtils.lerp(WALK_FOV, F.to.fov, fade);
    applyPose({ x, y, z, yaw, pitch, fov });
    if (k >= 1) {
      S.flight = null;
      enterMemory(F.i, { instant: true });
    }
  }

  const TOUR = ['ed_heather', 'ed_silver', 'ed_gold', 'ed_storm', 'ed_verdigris', 'ed_bridge', 'ed_lichen',
    'edin_kirkyard', 'edin_summer', 'edin_canvas', 'edin_ember', 'edin_night', 'dunvegan']
    .map((id) => world.photos.findIndex((p) => p.id === id)).filter((i) => i >= 0);
  for (const p of world.photos) if (!TOUR.includes(p.index)) TOUR.push(p.index);
  // ---- HUD: compass of castles and the nearest photograph
  const LANDMARKS = [
    { name: 'Eilean Donan', x: 2, z: 0 },
    { name: 'Edinburgh', x: 610, z: 30 },
    { name: 'Dunvegan', x: -332, z: 560 },
  ];
  const compass = $('compass');
  const SPAN = 150; // degrees visible across the strip
  for (const [deg, label] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']]) {
    const c = document.createElement('div'); c.className = 'card'; c.textContent = label; c.dataset.deg = deg; compass.appendChild(c);
  }
  for (let d = 0; d < 360; d += 15) { const t = document.createElement('div'); t.className = 'tick'; t.dataset.deg = d; compass.appendChild(t); }
  const mks = LANDMARKS.map((l) => {
    const m = document.createElement('div'); m.className = 'mk'; m.innerHTML = `<i></i>${l.name}<span></span>`; compass.appendChild(m); return m;
  });
  const photoMk = document.createElement('div'); photoMk.className = 'mk photo'; photoMk.innerHTML = '<i></i><b></b><span></span>'; compass.appendChild(photoMk);
  const fmtD = (d) => (d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`);
  function updateCompass() {
    const show = S.mode === 'walk';
    compass.classList.toggle('hidden', !show);
    $('tour').classList.toggle('hidden', !(S.mode === 'walk' || S.mode === 'memory'));
    if (!show) return;
    const W = compass.clientWidth;
    const head = THREE.MathUtils.radToDeg(player.yaw);
    const rel = (deg) => { let r = deg - head; while (r > 180) r -= 360; while (r < -180) r += 360; return r; };
    const place = (el, deg, clamp) => {
      let r = rel(deg);
      const edge = Math.abs(r) > SPAN / 2 - 8;
      if (clamp) r = THREE.MathUtils.clamp(r, -SPAN / 2 + 8, SPAN / 2 - 8);
      el.style.display = !clamp && Math.abs(r) > SPAN / 2 ? 'none' : 'block';
      el.style.left = `${(0.5 + r / SPAN) * W}px`;
      return edge;
    };
    compass.querySelectorAll('.card,.tick').forEach((el) => place(el, +el.dataset.deg, false));
    const cp = camera.position;
    LANDMARKS.forEach((l, k) => {
      const d = Math.hypot(l.x - cp.x, l.z - cp.z);
      const deg = THREE.MathUtils.radToDeg(Math.atan2(l.x - cp.x, -(l.z - cp.z)));
      const edge = place(mks[k], deg, true);
      mks[k].classList.toggle('edge', edge);
      mks[k].querySelector('span').textContent = (edge ? (rel(deg) < 0 ? '‹ ' : '') : '') + fmtD(d) + (edge && rel(deg) > 0 ? ' ›' : '');
      mks[k].style.opacity = d < 60 ? 0.35 : 1;
    });
    // nearest photograph you are not standing in
    let best = null, bd = 1e9;
    for (const it of memories.items) {
      const d = Math.hypot(it.pos.x - cp.x, it.pos.z - cp.z);
      if (d > 12 && d < bd) { bd = d; best = it; }
    }
    if (best) {
      const deg = THREE.MathUtils.radToDeg(Math.atan2(best.pos.x - cp.x, -(best.pos.z - cp.z)));
      place(photoMk, deg, true);
      photoMk.querySelector('b').textContent = best.p.title.split('—')[1]?.trim() || best.p.title;
      photoMk.querySelector('span').textContent = fmtD(bd);
    }
  }
  $('tourPrev').addEventListener('click', (e) => { e.stopPropagation(); if (S.mode !== 'travel') tourStep(-1); });
  $('tourNext').addEventListener('click', (e) => { e.stopPropagation(); if (S.mode !== 'travel') tourStep(1); });

  function tourStep(dir) {
    // from the current photograph (or the nearest one) to the next in the tour
    let cur = S.mode === 'memory' ? S.memory : zones.out.dominant;
    let k = TOUR.indexOf(cur);
    if (k < 0) k = 0;
    travelTo(TOUR[(k + dir + TOUR.length) % TOUR.length]);
  }

  // ---- UI wiring
  function buildAtlas() {
    const groups = [['eilean_donan', 'Eilean Donan'], ['edinburgh', 'Edinburgh Castle'], ['dunvegan', 'Dunvegan Castle']];
    const body = $('atlasBody');
    body.innerHTML = '';
    for (const [key, name] of groups) {
      const h = document.createElement('h3'); h.textContent = name; body.appendChild(h);
      const grid = document.createElement('div'); grid.className = 'grid';
      for (const p of world.photos.filter((q) => q.landmark === key)) {
        const f = document.createElement('figure');
        f.dataset.index = p.index;
        f.innerHTML = `<figcaption>${p.title.split('—')[1]?.trim() || p.title}<span>${p.caption}</span></figcaption>`;
        const th = document.createElement('canvas');
        th.className = 'thumb';
        const src = textures.thumbs[p.id];
        th.width = src.width; th.height = src.height;
        th.getContext('2d').drawImage(src, 0, 0);
        f.prepend(th);
        f.addEventListener('click', (e) => { e.stopPropagation(); travelTo(p.index); });
        grid.appendChild(f);
      }
      body.appendChild(grid);
    }
  }
  buildAtlas();
  function showAtlas() {
    document.querySelectorAll('#atlas figure').forEach((f) => f.classList.toggle('here', +f.dataset.index === zones.out.dominant));
    $('atlas').classList.remove('hidden');
    $('pause').classList.add('hidden');
    document.exitPointerLock?.();
    S.atlasOpen = true;
  }
  function hideAtlas() {
    $('atlas').classList.add('hidden');
    S.atlasOpen = false;
  }
  $('openAtlas').addEventListener('click', (e) => { e.stopPropagation(); showAtlas(); });
  $('closeAtlas').addEventListener('click', (e) => { e.stopPropagation(); hideAtlas(); lockPointer(); });
  $('pause').addEventListener('click', () => { S.paused = false; $('pause').classList.add('hidden'); lockPointer(); });
  canvas.addEventListener('click', () => { if (S.mode !== 'intro' && !S.atlasOpen) lockPointer(); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    $('reticle').classList.toggle('hidden', !locked);
    if (locked) { S.wasLocked = true; S.paused = false; $('pause').classList.add('hidden'); }
    else if (S.wasLocked && (S.mode === 'walk' || S.mode === 'memory') && !S.atlasOpen) { S.paused = true; $('pause').classList.remove('hidden'); }
  });
  addEventListener('keydown', (e) => {
    if (S.mode === 'intro' || S.mode === 'loading') return;
    if (e.code === 'KeyM' || e.code === 'Tab') { e.preventDefault(); S.atlasOpen ? (hideAtlas(), lockPointer()) : showAtlas(); }
    if (e.code === 'KeyN') audio.muted = !audio.muted;
    if ((e.code === 'BracketRight' || e.code === 'Period') && S.mode !== 'travel') tourStep(1);
    if ((e.code === 'BracketLeft' || e.code === 'Comma') && S.mode !== 'travel') tourStep(-1);
    if (e.code === 'KeyE' && S.mode === 'walk') {
      const m = memories.nearest(camera.position);
      if (m) enterMemory(m.p.index);
    }
  });

  // ---- help card, tappable prompt, atlas button, touch joystick
  function setHelp(on) { $('help').classList.toggle('hidden', !on); S.helpOpen = on; }
  $('helpBtn').addEventListener('click', (e) => { e.stopPropagation(); setHelp(!S.helpOpen); });
  $('help').addEventListener('click', () => setHelp(false));
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' || e.key === '?') setHelp(!S.helpOpen);
    else if (e.code === 'Escape' && S.helpOpen) setHelp(false);
  });
  $('prompt').addEventListener('click', (e) => {
    e.stopPropagation();
    if (S.mode !== 'walk') return;
    const m = memories.nearest(camera.position);
    if (m) enterMemory(m.p.index);
  });
  $('tourAtlas').addEventListener('click', (e) => { e.stopPropagation(); showAtlas(); });

  const joy = $('joystick'), knob = joy.querySelector('.knob');
  let joyId = null, joyCx = 0, joyCy = 0;
  const JOY_R = 50;
  const joyMove = (e) => {
    let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.touchMove.x = dx / JOY_R; player.touchMove.y = dy / JOY_R;
  };
  joy.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    const r = joy.getBoundingClientRect(); joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2;
    joyMove(e);
  });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
  const joyEnd = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null; knob.style.transform = ''; player.touchMove.x = player.touchMove.y = 0;
  };
  joy.addEventListener('pointerup', joyEnd);
  joy.addEventListener('pointercancel', joyEnd);
  const updateTouchUI = () => joy.classList.toggle('hidden', !(IS_TOUCH && (S.mode === 'walk' || S.mode === 'memory') && !S.atlasOpen));

  // debugging / calibration API
  window.T = { meshHeightAt, THREE, scene, camera, player, projectors, zones, world, renderer, post, heightAt, landDistance, S, enterMemory, travelTo, terrain, castles, water, grass, trees, rocks, sun, sky, terrainMat, setPixelScale: (v) => { pixelScale = v; resize(); }, noAdapt: false };

  installAlign(window.T);

  // ------------------------------------------------------------------- start
  status('Ready', 1);
  const startIndex = Math.max(0, world.photos.findIndex((p) => p.id === (params.get('start') || 'ed_heather')));
  const p0 = world.photos[startIndex];
  enterMemory(startIndex, { instant: true });
  S.mode = 'intro';
  S.overlay = 1; S.overlayTarget = 1; S.overlayDim = 1;
  for (const it of projectors.items) it.w = it.i === startIndex ? 1 : 0;
  zones.update(camera.position, 1);

  if (CALIB) setupCalibration();
  // debug: ?pose=x,z,yaw,pitch starts walking there (eye height above ground)
  if (params.get('pose')) {
    const [x, z, yaw, pitch] = params.get('pose').split(',').map(Number);
    $('intro').classList.add('hidden');
    projectors.force = null;
    S.mode = 'walk'; S.overlay = S.overlayTarget = 0;
    player.setPose(x, Math.max(0, heightAt(x, z)) + EYE, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch || 0));
    camera.fov = WALK_FOV; camera.updateProjectionMatrix();
    zones.first = true;
    window.go = (x, z, yaw, pitch = 0, fly = 0) => { player.fly = !!fly; player.setPose(x, Math.max(0, heightAt(x, z)) + EYE + fly, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch)); };
  }

  $('loading').classList.add('hidden');
  if (!CALIB && !params.get('pose')) {
    $('intro').classList.remove('hidden');
    $('caption').classList.add('hidden');
    $('intro').addEventListener('click', () => {
      $('intro').classList.add('hidden');
      lockPointer();
      audio.start();
      S.mode = 'memory';
      S.overlayDim = 0;
      setTimeout(() => showCaption(p0, 1e9), 600);
      let seen = false;
      try { seen = localStorage.getItem('tapestry-help-seen') === '1'; localStorage.setItem('tapestry-help-seen', '1'); } catch (e) { /* private mode */ }
      if (!seen) setTimeout(() => setHelp(true), 1800);
    }, { once: true });
  }

  // ------------------------------------------------------------------- calibration tool
  function setupCalibration() {
    const i = world.photos.findIndex((p) => p.id === CALIB);
    const p = world.photos[i];
    S.mode = 'calib';
    $('intro').classList.add('hidden');
    projectors.enabled = !params.has('noproj');
    projectors.force = params.has('noproj') ? null : { index: i, w: 1 };
    const info = document.createElement('pre');
    info.style.cssText = 'position:fixed;left:8px;top:8px;z-index:50;color:#ff0;font:12px monospace;background:rgba(0,0,0,.5);padding:6px;margin:0';
    document.body.appendChild(info);
    S.calibOverlay = 0.5;
    const sync = () => {
      const c = p.camera;
      applyPose(poseOf(p));
      overlayRect(p);
      post.uniforms.tOverlay.value = textures.photos[p.id];
      S.overlay = S.overlayTarget = S.calibOverlay;
      S.overlayDim = 0;
      info.textContent = JSON.stringify(c);
    };
    window.calib = {
      p, sync,
      set(o) { Object.assign(p.camera, o); sync(); projectors.items[i].p = p; projectors.repose(i, renderer, scene, hideForDepth); },
      overlay(v) { S.calibOverlay = v; sync(); },
    };
    sync();
    addEventListener('keydown', (e) => {
      const c = p.camera, st = e.shiftKey ? 5 : 1;
      const yaw = THREE.MathUtils.degToRad(c.yaw);
      const map = {
        ArrowLeft: () => (c.yaw -= 0.25 * st), ArrowRight: () => (c.yaw += 0.25 * st),
        ArrowUp: () => (c.pitch += 0.25 * st), ArrowDown: () => (c.pitch -= 0.25 * st),
        BracketLeft: () => (c.vfov -= 0.5 * st), BracketRight: () => (c.vfov += 0.5 * st),
        KeyW: () => { c.pos[0] += Math.sin(yaw) * st; c.pos[2] -= Math.cos(yaw) * st; },
        KeyS: () => { c.pos[0] -= Math.sin(yaw) * st; c.pos[2] += Math.cos(yaw) * st; },
        KeyA: () => { c.pos[0] -= Math.cos(yaw) * st; c.pos[2] -= Math.sin(yaw) * st; },
        KeyD: () => { c.pos[0] += Math.cos(yaw) * st; c.pos[2] += Math.sin(yaw) * st; },
        KeyQ: () => (c.pos[1] -= 0.25 * st), KeyE: () => (c.pos[1] += 0.25 * st),
        KeyO: () => (S.calibOverlay = S.calibOverlay > 0.25 ? 0 : 0.5),
      };
      if (map[e.code]) { map[e.code](); window.calib.set({}); }
    });
  }

  // ------------------------------------------------------------------- loop
  let lastT = performance.now();
  let frameAvg = 16;
  const tmpV = new THREE.Vector3();
  const tmpD = new THREE.Vector3();

  function frame() {
    requestAnimationFrame(frame);
    const nowT = performance.now();
    const dt = Math.min((nowT - lastT) / 1000, 0.1);
    lastT = nowT;
    S.time += dt;
    PROJ.uTime.value = S.time;
    frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;

    player.enabled = (S.mode === 'walk' || S.mode === 'memory') && !S.atlasOpen && !S.paused;
    // --- experience state
    if (S.mode === 'travel' && S.flight) flightStep(dt);
    if (S.mode === 'memory' || S.mode === 'intro') {
      if (S.anim) {
        const a = S.anim;
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        const L = (u, v) => u + (v - u) * e;
        applyPose({ x: L(a.from.x, a.to.x), y: L(a.from.y, a.to.y), z: L(a.from.z, a.to.z), yaw: L(a.from.yaw, a.to.yaw), pitch: L(a.from.pitch, a.to.pitch), fov: L(a.from.fov, a.to.fov) });
        if (k >= 1) { S.anim = null; S.stillTime = 0; player.lookDelta = 0; }
      } else if (S.mode === 'memory') {
        // still in the photograph: let the real print settle in; any movement dissolves it into the world
        S.stillTime += dt;
        if (player.wantsToMove() || player.lookDelta > 40) {
          leaveMemory();
        } else {
          S.overlayTarget = S.stillTime > 0.4 ? 1 : 0;
          // allow looking around gently without leaving
          camera.rotation.set(player.pitch, -player.yaw, 0);
        }
      }
    }
    if (S.mode === 'walk' || S.mode === 'memory') {
      if (S.mode === 'walk') player.update(dt);
      if (S.mode === 'walk') {
        camera.fov += (S.fovTarget - camera.fov) * (1 - Math.exp(-dt * 1.6));
        camera.updateProjectionMatrix();
      }
    }

    // overlay easing
    const ok = 1 - Math.exp(-dt * (S.overlayTarget > S.overlay ? 2.5 : 1.8));
    S.overlay += (S.overlayTarget - S.overlay) * ok;
    post.uniforms.uOverlay.value = S.overlay;
    showCopyright(S.overlay > 0.3 || S.mode === 'intro');
    post.uniforms.uOverlayDim && (post.uniforms.uOverlayDim.value = S.overlayDim);

    // --- zones -> light, fog, sky, water, grade
    const z = zones.update(camera.position, dt);
    if (z.dominant !== S.lastZone) {
      S.lastZone = z.dominant;
      if (S.mode === 'walk') showCaption(world.photos[z.dominant], 6);
      audio.mood = audio.mood; // keep
    }
    {
      // haze takes the sky's colour (a touch richer), never a flat grey
      const fc = scene.fog.color.copy(z.horizon).lerp(z.top, 0.3);
      const hsl = {}; fc.getHSL(hsl); fc.setHSL(hsl.h, Math.min(1, hsl.s * 1.35 + 0.05), hsl.l);
    }
    terrainMat.userData.uniforms.uHillTint.value.copy(z.hill);
    scene.fog.density = z.fog;
    sun.color.copy(z.sunCol);
    sun.intensity = 2.4 * z.light;
    hemi.color.copy(z.top).lerp(new THREE.Color(1, 1, 1), 0.25);
    hemi.groundColor.copy(z.ground);
    hemi.intensity = 2.7 * z.light;
    {
      // shadow window follows the camera in whole shadow-map texels (no shimmer)
      const texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
      const fwdS = tmpV.set(z.sunDir.x, z.sunDir.y, z.sunDir.z).normalize();
      const upS = Math.abs(fwdS.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(upS, fwdS).normalize();
      const up2 = new THREE.Vector3().crossVectors(fwdS, right);
      const c = camera.position;
      const px = Math.round(c.dot(right) / texel) * texel, py = Math.round(c.dot(up2) / texel) * texel, pz = c.dot(fwdS);
      const center = new THREE.Vector3().addScaledVector(right, px).addScaledVector(up2, py).addScaledVector(fwdS, pz);
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(fwdS, 400);
      sun.target.updateMatrixWorld();
    }
    // shadow camera snapping to texels to avoid shimmer
    sky.uniforms.uFogColor.value.copy(z.horizon);
    sky.uniforms.uGroundColor.value.copy(z.ground);
    sky.uniforms.uZenith.value.copy(z.top);
    let ws = 0;
    for (let k = 0; k < 3; k++) ws += z.top3[k].w;
    for (let k = 0; k < 3; k++) {
      sky.uniforms.uPano.value[k] = textures.panos[world.photos[z.top3[k].i].id];
      sky.uniforms.uPanoW.value[k] = z.top3[k].w / ws;
      const img = sky.uniforms.uPano.value[k].image;
      sky.uniforms.uPanoAspect.value[k] = img ? img.width / img.height : 3;
    }
    water.uniforms.uDeep.value.copy(z.water);
    water.uniforms.uShallow.value.copy(z.water).lerp(z.ground, 0.5);
    water.uniforms.uFogColor.value.copy(z.horizon);
    water.uniforms.uFogDensity.value = z.fog;
    water.uniforms.uSunDir.value.copy(z.sunDir);
    water.uniforms.uSunColor.value.copy(z.sunCol).multiplyScalar(z.light);
    water.uniforms.uCamPos.value.copy(camera.position);
    water.uniforms.uWeed.value = z.weed;
    grass.uniforms.uCam.value.copy(camera.position);
    grass.uniforms.uSunDir.value.copy(z.sunDir);
    grass.uniforms.uSunColor.value.copy(z.sunCol).multiplyScalar(z.light * 0.9);
    grass.uniforms.uAmbient.value.copy(z.top).lerp(z.ground, 0.5).multiplyScalar(0.9 * z.light);
    grass.uniforms.uFogColor.value.copy(z.horizon);
    grass.uniforms.uFogDensity.value = z.fog;
    terrainMat.userData.uniforms.uCamPos.value.copy(camera.position);
    const pu = post.uniforms;
    post.zoneW.set(zones.w);
    pu.uGrade.value = z.grade;
    pu.uContrast.value = z.contrast;
    pu.uSaturation.value = z.saturation;
    pu.uExposure.value = z.exposure;
    pu.uVignette.value = z.vignette;
    pu.uGrain.value = z.grain;
    pu.uCanvas.value = z.canvas;
    pu.tGrainA.value = textures.grains[world.photos[z.top3[0].i].id];
    pu.tGrainB.value = textures.grains[world.photos[z.top3[1].i].id];
    const g2 = z.top3[0].w + z.top3[1].w;
    pu.uGrainW.value.set(z.top3[0].w / g2, z.top3[1].w / g2);
    pu.uTime.value = S.time;
    pu.uInvProj.value.copy(camera.projectionMatrixInverse);
    pu.uInvView.value.copy(camera.matrixWorld);
    pu.uCamPos.value.copy(camera.position);
    pu.uMistColor.value.copy(z.horizon).lerp(z.top, 0.25);
    pu.uHFog.value.set(z.mist, 8);
    {
      tmpV.copy(camera.position).addScaledVector(z.glowDir, 1000).project(camera);
      camera.getWorldDirection(tmpD);
      const front = tmpD.dot(z.glowDir);
      const vis = front > 0 ? (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(tmpV.x), Math.abs(tmpV.y)), 0.6, 1.6)) * front : 0;
      pu.uSun.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5, vis);
      pu.uShaftColor.value.copy(z.sunCol).lerp(z.horizon, 0.3);
      pu.uShaft.value = z.shaft;
    }

    // --- projection
    projectors.update(camera.position, dt);

    // --- memories & prompt
    memories.update(camera.position, S.time, S.mode === 'memory' ? S.memory : -1, S.mode === 'intro' || S.mode === 'calib' || S.mode === 'memory' || S.mode === 'travel');
    if (S.mode === 'walk') {
      const m = memories.nearest(camera.position);
      if (m) {
        $('prompt').querySelector('span').textContent = `Step into “${m.p.title.split('—')[1]?.trim() || m.p.title}”`;
        $('prompt').classList.remove('hidden');
      } else $('prompt').classList.add('hidden');
    }
    if (S.captionTimer > 0 && S.captionTimer < 1e8) {
      S.captionTimer -= dt;
      if (S.captionTimer <= 0) $('caption').classList.add('hidden');
    }

    updateCompass();
    updateTouchUI();

    // --- audio
    if (audio.ctx) {
      const land = landDistance(camera.position.x, camera.position.z);
      audio.update(dt, {
        height: camera.position.y - Math.max(0, heightAt(camera.position.x, camera.position.z)) + camera.position.y * 0.3,
        shore: Math.exp(-Math.abs(land) / 18),
        zoneMood: MOODS[world.photos[z.dominant].id],
      });
    }

    // --- render
    PROJ.uViewPos.value.copy(camera.position);
    water.updateReflection(renderer, scene, camera);
    renderer.setRenderTarget(post.sceneRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    post.render();

    // adaptive resolution
    S.adaptT = (S.adaptT || 0) + dt;
    if (!CALIB && !window.T.noAdapt && S.time > 5 && S.adaptT > 4) {
      if (frameAvg > 42 && pixelScale > 0.7) { pixelScale = Math.max(0.7, pixelScale - 0.1); resize(); frameAvg = 30; S.adaptT = 0; }
      else if (frameAvg < 15 && pixelScale < Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 1.0 : 1.5)) { pixelScale = Math.min(IS_TOUCH ? 1.0 : 1.5, pixelScale + 0.05); resize(); frameAvg = 16; S.adaptT = 0; }
    }
  }
  frame();
}

main().catch(fail);
