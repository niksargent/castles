# Tapestry — Castles of Scotland

A walkable 3D world woven entirely from thirteen photographs of Eilean Donan, Edinburgh Castle
and Dunvegan. Every surface — ground, rock, stone, roof, foliage, water weed, cloud — is cut from
the photographs and re-woven; every photograph is also hung back into the world at the exact spot
it was taken, so you can step into it and walk out of it into three dimensions.

## Run it

```bash
python tools/serve.py 8777
```

Then open <http://localhost:8777>. Any static server works; `serve.py` just disables caching.
A desktop browser with WebGL2 is required (tested on an integrated Intel Iris Xe: resolution
adapts automatically to keep the frame rate up).

**Controls** — click and drag to look, `W A S D` walk, `Shift` run,
`Space` jump, `E` step into a nearby photograph, `[` / `]` (or the on-screen arrows) fly to the
previous / next photograph on the tour, `M` / `Tab` atlas of photographs, `F` fly, `N` sound on/off,
`Esc` pause. A compass at the top points to each castle and the nearest photograph; light-beams
mark every viewpoint in the world.

## What happens

* **The opening** is the photograph *Heather & Glass*, full screen. Click and you are standing where
  the photographer stood: the world is rendered from that exact camera, and the photograph is
  projected onto it, so the two are the same picture. Look around and the print extends beyond its
  own edges; take a step and it dissolves into a 3D world with real parallax.
* **Zones.** Each photograph owns the ground around where it was taken. Its sky (clouds cut from
  the photo), light, fog, water colour and photographic "look" (a gradient map derived from the
  photo, its grain or canvas texture, vignette, contrast) blend softly into the next zone as you
  walk — from the vivid HDR heather, into sepia shores, into a golden loch, a blue storm, a fiery
  Edinburgh dusk, a painted canvas sky over the rock.
* **Memories.** Every photograph hangs in the air at its viewpoint as a translucent pane sized to
  fill the camera's frustum. Walk up to one and press `E` to step into it. The atlas (`M`) lets you
  travel to any of them.
* **The world**: Eilean Donan on its island in a shallow tidal bay (you can wade the shallows and
  cross the arched bridge), Edinburgh on its crag-and-tail, Dunvegan on its crag above a sea-bay of
  bracken and pebbles. Footpaths link them. Edinburgh is laid out from the castle's real plan
  (building footprints from OpenStreetMap, `world/edinburgh_plan.json`, fetched by
  `tools/osm_edinburgh.py`): the Hospital and War Museum at the north-west corner, the Governor's
  House, the New Barracks running diagonally above the Western Defences' lime lawn, Crown Square, the
  curtain walls and the gateway, so the photographs taken from Princes Street Gardens and the
  kirkyard line up with the buildings as they really stand. Its five cameras were solved jointly
  with the Hospital's proportions from features matched across the photographs. A procedural soundscape (wind, water, footsteps, a drone
  that changes chord with each photograph) needs no audio files.

## The photographs

The source photographs live in `photos/` locally and are **not** in the repository. The site only
ships reduced copies (2400 px long edge — about the largest the world ever displays them) that are
tile-scrambled into `.dat` files: they are not viewable or downloadable as image files and are
reassembled in memory by `src/util/scrambled.js`. Photographs © Nik Sargent, all rights reserved.
Edinburgh Castle's plan is derived from OpenStreetMap data, © OpenStreetMap contributors (ODbL).
To rebuild assets you need the originals in `photos/`.

## How it is built

```
photos/                 the source photographs (local only, git-ignored)
world/photos.json       the manifest: one entry per photograph (camera pose, skyline, style) + swatches
tools/build_assets.py   the weaver: turns photos + manifest into world/generated/*
tools/osm_edinburgh.py  fetches Edinburgh Castle's plan from OpenStreetMap -> world/edinburgh_plan.json
world/edinburgh_plan.json  the castle's building footprints and curtain wall (metres), which the model is laid out from
world/generated/        projector images, sky masks, cloud tiles, seamless swatches, grades, grain, world.json
src/
  main.js               bootstrap, experience state (intro / memory / walk / travel), frame loop
  world/geography.js    the analytic height function: shoreline, island, crags, hills, paths, viewpoint pads
  world/terrain.js      chunked LOD heightfield + splat shader (8 material classes x 3 regions of photo swatches)
  world/sky.js          cloud plane from the zones' photo cloud tiles + the live photo sky near a viewpoint
  world/water.js        planar mirror reflection, shallows showing the bed, floating weed from the photo
  world/vegetation.js   trees (leaf-card canopies coloured with photo foliage), boulders, GPU grass
  castles/kit.js        a small architecture kit (walls, gables, crow-steps, crenels, towers, windows, arches)
  castles/castles.js    Eilean Donan + bridge, Edinburgh (from the plan), Dunvegan, the kirkyard (cast from its photo), the cottage
  render/worldMaterial.js  photo projection injected into every material (+ triplanar texturing)
  render/projection.js  projector cameras & their depth maps (occlusion)
  render/zones.js       soft-Voronoi zone weights -> light, fog, sky, grade
  render/post.js        clarity, low mist, light shafts, bloom, per-zone photographic grade, grain/canvas
  player.js, audio.js, memories.js
```

**Photo projection.** Each photograph is a camera. Its image is projected onto the geometry with a
shadow-map-style occlusion test, the photo's own sky mask, and a *view-consistency* weight (how well
the photographer's line of sight to a point agrees with yours), so distant hills keep the photo's
pixels while nearby surfaces hand over to 3D as soon as parallax would distort them. The projected
weight is written to alpha so the post pass leaves those pixels exactly as the photograph has them.

**Swatches.** Material crops are re-woven with image quilting (Efros–Freeman, min-error cuts) into
seamless 1024² tiles. Ground seen at a grazing angle is de-foreshortened first (`vstretch`), rock can
be woven from rotated patches (`rotate`).

## Adding or removing photographs

The world is driven by `world/photos.json`; nothing about a photo is hard-coded in the runtime.

1. Put the image in `photos/`.
2. Add an entry to `photos` in the manifest: `id`, `file`, `landmark`, `title`, `caption`, a first
   guess at `camera` (`pos` [x, y, z] metres, `yaw` degrees from north, `pitch`, `vfov`), `style`
   (grade strength, contrast, saturation, exposure, grain, vignette, fog, optional `canvas`, `mist`,
   `shaft`), `horizon`, `sky` rectangles of clean sky (percent of the image), and a `skyline`
   polyline (percent) separating sky from everything else.
3. Run `python tools/build_assets.py` (or `--only photos,grades,light,sky,grain,world --photos <id>`).
4. Calibrate: open `index.html?calib=<id>` — the photo is overlaid at 50% on the 3D view.
   Arrow keys turn, `W A S D Q E` move, `[` `]` change the field of view, `O` toggles the overlay,
   `?calib=<id>&noproj` shows raw geometry. Copy the pose shown top-left back into the manifest.
   (From the console: `calib.set({ pos: [...], yaw, pitch, vfov })`, `calib.overlay(0.5)`.)
   **Automatic fit & accuracy check** (console, any page): `await T.align('<id>')` overlays the
   photo's own skyline against the model's silhouette from that camera — red = photo is solid but
   the model shows sky, cyan = model too big/misplaced, yellow = castle outline — and returns an
   IoU score. `await T.fit('<id>')` searches camera position/yaw/pitch/FOV to minimise that
   mismatch within the photo's `castleX` columns (percent range of the image containing the castle;
   `alignGroups` adds e.g. the bridge), pinning pitch to the water horizon for loch photos; add
   `{ global: true }` for a coarse sweep first. It returns the pose to paste into the manifest.
5. Reload. The photo is now a zone (sky, light, grade, sound), a projector, a memory in the world
   and a card in the atlas. Remove a photo by deleting its entry and re-running the build.

New *swatches* (material tiles) are added under `swatches` in the manifest with a source photo and
rectangle; the terrain's class/region table lives at the top of `src/world/terrain.js`, castle
materials in `src/main.js`. A photograph of a castle that is not yet in the world needs a model in
`src/castles/castles.js` (built with the kit) and a site in `src/world/geography.js`.

Debug helpers: `?pose=x,z,yaw,pitch` starts walking at a spot; `window.T` exposes the scene.
