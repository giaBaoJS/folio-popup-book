# Folio scene guide

Folio is a pop-up storybook for the iPhone Duo (unfolded screen 951 x 669 pt, landscape).
Each chapter is a **paper-craft diorama** rendered by our own WebGPU engine. The camera dives
through a glowing **portal** in each scene into the next one. This guide covers how a chapter is
built, so you can change one or add your own.

## Look and feel

- Everything is made of paper: cut sheets with real thickness and a pale cut edge, layered
  in depth like a diorama/pop-up book; lace cut-outs (alpha patterns) that throw lace shadows;
  thin vellum that glows when light passes through it; gold foil accents; warm lamp light against
  cool night. Reference: `media/woods.jpg` (chapter I).
- Aim for a handcrafted diorama: many small hand-made touches, layered depth, silhouettes that
  read instantly, a clear focal point (the portal) and a cohesive palette. Each chapter should
  hold up as a still.
- Composition is for a 1.42 (951 x 669) landscape aspect ratio. Keep the portal near the visual
  centre or on a third, clearly lit, never hidden.

## Files of a scene

- `tools/blender/<scene>.py`: `build_scene()` returns `kit.Scene('<scene>')`; `CAMS` for Blender previews.
  Build with `blender -b -P tools/blender/build.py -- --only <scene> [--no-preview]` →
  writes `src/assets/scenes/<scene>.ts` (do not edit that file by hand).
- `src/story/scene_<scene>.ts`: the `SceneDef` (look, point lights, cameras, chapter text, `animate`).
- `src/art/paint_<scene>.ts`: Skia painters for your patterns (`<SCENE>_PAINTERS`).
- Register the scene in `src/story/registry.ts` and `tools/blender/build.py`, and its painters in
  `src/art/atlas.ts`.
- Shared code the scenes build on: `tools/blender/{kit,props,book,export}.py`,
  `src/art/{brush,atlas}.ts`, `src/engine/*`, `src/story/{anim,types,rig,looks}.ts`,
  `src/director/world.ts`. Changes there affect every chapter, so re-check all of them.

## Geometry (tools/blender/kit.py, props.py)

- App space: Y up, the viewer looks down -Z, units are "book units" (a page is 1.0 wide). Make your
  scene roughly 2-3 units across so the default near/far planes and shadow box work.
- `kit.slab(loops, thick, col, pat_name, mat, uv_scale|uv_fn, edge_col)`: a cut sheet (outer loop +
  holes), front +Z, pale edges. Then `.xf(R=kit.rot(x,y,z), t=(...), s=...)` to place it.
- `kit.card(w, h, pattern, col, nu, nv, bend)`: alpha-cut card (the pattern's alpha is the cut).
- `kit.grid(fn, nu, nv)` + `kit.two_sided()` for curved sheets; `kit.lathe(profile, seg, sides, flat)`
  for turned shapes; `kit.tube(points, radii)` for stems/branches/strings; `kit.box`, `kit.sphere`.
- `props.py` has trees, umbrellas, grass strips, mushrooms, fences, lanterns, storeys, roofs.
- `chunk.paint(col, pat_name, mat, emis)`; materials in `kit.MAT`: PAPER, EDGE (auto on slab edges),
  GLOW (emissive, flickers), PORTAL, VELLUM (translucent), GOLD (foil spec), CLOTH, INK (flat), WATER
  (paper with a moving sheen), GLASS (emissive tint).
- Alpha cards and glow panes should have `chunk.occluder = False` (cards already do) so they do not
  darken AO.
- Parts: `scene.part(name, pivot, axis, role='static'|'actor', sway=<0..1.5>, **meta)` then
  `.add(chunk, ...)`. Up to 255 parts, ideally < 120. Keep the whole scene under ~70k vertices
  (check the build log) and the generated .ts under ~4 MB.
- `sway` > 0 makes the vertex shader wave the part in the wind: displacement grows with the square
  of the height above `pivot.y` (good for kelp, grass, hanging things, cloth).
- AO is baked automatically (`Scene(ao_dist=...)`).

## The portal (the way into the next scene)

- One part (name it, e.g. `portal`, and set `SceneDef.portalPart`) carries
  `portal=dict(center=[x,y,z], normal=[nx,ny,nz], radius=r)` in its meta, in rest space.
- Draw it as a round disc slab with `mat=MAT.PORTAL`, `emis≈2`, `edges=False`, `occluder=False`,
  and `uv_fn` mapping the disc to 0..1 (centre = 0.5,0.5). It glows warm at rest; during the dive it
  shows the next scene. Its colour (vertex col) tints the glow.
- `normal` points towards the camera's approach. The camera flies along it and ends at distance
  `r * 0.82 / (tan(fov/2) * sqrt(1 + aspect²))` from the centre, so **nothing may sit between the
  portal and that end point** (keep frames/bars outside the disc radius or behind it).
- If the portal part is an actor, the runtime follows its animated matrix.

## SceneDef (src/story/types.ts)

- `look`: lighting/grade (see `src/engine/frame.ts` `Look` and `src/story/looks.ts` WOODS_LOOK).
  `lightDir` points *towards* the key light; `lightCol` is linear and pre-multiplied (≈0.3..1.2);
  `shadowCenter/shadowHalf` = orthographic shadow box (cover your scene tightly for sharp shadows);
  `bgKind`: 0 study bokeh, 1 night sky with stars (`sky[1]` density) + `bgC` aurora band, 2 plain
  gradient, 3 deep sea rays (`sky[2]` strength, `bgC` ray colour). `bgA` top, `bgB` bottom (sRGB hex).
  `fog` rgb + density; `pool` = 0 (only the book table uses it). `particleKind`: 0 fireflies,
  1 dust motes, 2 bubbles; `particleCount` ≤ 1024; centre/half extents; size ≈ 0.006-0.012.
- `points`: up to 4 point lights `{pos, radius, col}` (linear colour, ≈0.5..2.5). Use them for lamps,
  windows, glowing things; they are what makes the scene feel warm.
- `cam`: rest camera for aspect 1.42 (`fov` vertical radians ≈ 30-38°). `entry`: where the camera
  starts when arriving through the previous portal; it eases to `cam` over ~1.6 s. During the previous
  scene's dive, your scene is shown through its portal with the camera between `entry` and 60% towards `cam`.
- `chapter`: numeral, title, body (2 short sentences, storybook voice), hint (e.g. "Pinch into the lantern").
- `animate(ctx)`: optional **worklet** (`'worklet';` first line) that poses `actor` parts every frame
  with `src/story/anim.ts` (`rotate`, `translate`, `scale`, `attach`, `follow`). Matrices start as identity.
  `ctx.t` is seconds; `ctx.points` is a mutable copy of `points` (flicker a flame, move a light).
  Worklet rules: declare helpers above callers, every helper needs `'worklet'`, no RN imports,
  no captured objects that are not plain data. Keep it cheap (no big allocations per frame).

## Painters (src/art/paint_<scene>.ts)

- Use the helpers in `src/art/brush.ts` (`paint`, `path`, `linear`, `radial`, `grain`, `wrapped` for tiles,
  `text`, `paragraph`, `lcg`). Look at `src/art/atlas.ts` for many examples (cover, pages, lace canopy,
  grass, wood, shingles, windows).
- A painter is `{ w, h, tile?, alpha?, paint(ctx) }` keyed by a pattern name from
  `src/art/patterns.json`. Ids are 1-based positions in that list (0 = plain paper), so only append new names (never
  reorder or delete). Sizes: 256-1024 px (one 4096² atlas is shared by every scene).
- Tinted patterns (vertex colour multiplies) should be painted light/neutral; unique art meant to show
  its own colours is painted in full colour and used with vertex colour `#ffffff`.
- `alpha: true` patterns are cut paper: alpha < 0.5 is a hole (also in shadows).
- `tile: true` repeats with `fract(uv)`; draw with `wrapped()` so edges match.

## Checking your work (do this many times)

Render stills without the simulator (macOS; use a separate `--out` folder per scene):

```sh
bun run headless -- --out .headless/<scene> --shot "<scene>,<scene>@1.5,<scene>@4,<scene>:p=0.5,<scene>:p=0.9,<scene>:p=0.995,<prev>:p=0.7,<scene>:yaw=0.3"
python3 tools/sheet.py .headless/<scene>.sheet.png .headless/<scene>/*.png
```

- `<scene>@t` = time t (animation), `:p=x` = diving into *your* portal (x from 0 to 1), `<prev>:p=0.7`
  = how your scene looks through the previous scene's portal, `:yaw=0.3` = orbit check (users can drag
  the view ±0.3 rad, so the diorama must hold up from the sides — no visible gaps or unfinished backs).
- Open the PNGs and look hard at them. Compare against `media/woods.jpg`. Iterate on composition,
  palette, lighting, and detail at least 3-4 times. `p=0.995` must be fully covered by the portal.
- The atlas is repainted on CanvasKit when painters change (a few seconds); geometry needs a Blender rebuild.
- `bun run typecheck` must be clean, and worklet code needs the checks in `AGENTS.md` (Traps).
