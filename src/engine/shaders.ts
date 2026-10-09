// All WGSL. One scene instance = group 0 (frame, transforms, patterns, atlas) plus, for the
// main pass, group 1 (its shadow map and the inner scene seen through the portal).

export const FRAME_FLOATS = 164;
export const SLOTS = 512; // transform slots: scene instance A uses 0..255, B uses 256..511
export const MAX_PATTERNS = 128;

// Frame layout (vec4 index), written by src/engine/frame.ts. A few fields duplicate the post
// grade (`Post` below) and are not read here; they keep the layout stable.
export const F = {
  viewProj: 0,
  lightVP: 4,
  camPos: 8, // w = time
  lightDir: 9, // w = shadow softness (texels)
  lightCol: 10, // w = translucency
  ambTop: 11,
  ambBot: 12,
  fog: 13, // w = density
  bgA: 14,
  bgB: 15,
  bgC: 16,
  pointPos: 17, // 4 x (xyz, radius)
  pointCol: 21, // 4 x (rgb, unused)
  portal: 25, // x reveal, y glow, z fit -> screen mapping (0 miniature, 1 full screen)
  screen: 26, // w, h, 1/w, 1/h (pixels of the render target)
  params: 27, // x bgKind, y wind, z exposure, w paper fiber
  grade: 28, // x saturation, y grain, z vignette, w fade-to-black
  zoom: 29, // xy portal centre on screen (uv), z portal radius (uv of height), w bloom strength
  parts: 30, // x particle count, y kind, z pull into the portal, w particle size
  portalPos: 31, // xyz world centre, w radius
  tint: 32, // rgb grade multiplier
  camR: 33, // xyz right, w tan(fovX/2)
  camU: 34, // xyz up, w tan(fovY/2)
  camF: 35, // xyz forward, w shift x
  pBoxC: 36, // particle volume centre, w = shift y
  pBoxS: 37, // particle volume half size, w = flicker
  misc: 38, // x = particle fade-out (1 = gone), w = light pool radius
  sky: 39, // x moon size, y stars, z rays, w caustics
  portalN: 40, // xyz portal normal
} as const;

const COMMON = /* wgsl */ `
struct Frame {
  viewProj: mat4x4f,
  lightVP: mat4x4f,
  camPos: vec4f,
  lightDir: vec4f,
  lightCol: vec4f,
  ambTop: vec4f,
  ambBot: vec4f,
  fog: vec4f,
  bgA: vec4f,
  bgB: vec4f,
  bgC: vec4f,
  pointPos: array<vec4f, 4>,
  pointCol: array<vec4f, 4>,
  portal: vec4f,
  screen: vec4f,
  params: vec4f,
  grade: vec4f,
  zoom: vec4f,
  parts: vec4f,
  portalPos: vec4f,
  tint: vec4f,
  camR: vec4f,
  camU: vec4f,
  camF: vec4f,
  pBoxC: vec4f,
  pBoxS: vec4f,
  misc: vec4f,
  sky: vec4f,
  portalN: vec4f,
};

@group(0) @binding(0) var<uniform> FR: Frame;
@group(0) @binding(1) var<storage, read> XF: array<mat4x4f>;
@group(0) @binding(2) var<storage, read> SLOT: array<vec4f>;
@group(0) @binding(3) var<storage, read> PATS: array<vec4f>;
@group(0) @binding(4) var atlas: texture_2d<f32>;
@group(0) @binding(5) var atlasSamp: sampler;

const PI = 3.14159265;

fn hash31(p: vec3f) -> f32 {
  var q = fract(p * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(vec3f(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn hash11(n: f32) -> f32 {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3f(1, 0, 0)), u.x), mix(hash31(i + vec3f(0, 1, 0)), hash31(i + vec3f(1, 1, 0)), u.x), u.y),
    mix(mix(hash31(i + vec3f(0, 0, 1)), hash31(i + vec3f(1, 0, 1)), u.x), mix(hash31(i + vec3f(0, 1, 1)), hash31(i + vec3f(1, 1, 1)), u.x), u.y),
    u.z);
}

fn vnoise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1, 0)), u.x), mix(hash21(i + vec2f(0, 1)), hash21(i + vec2f(1, 1)), u.x), u.y);
}

fn srgb2lin(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

// Sways a vertex (in its part's rest space) with the wind: the higher above the
// hinge, the further it moves.
fn windOffset(p: vec3f, slot: u32) -> vec3f {
  let info = SLOT[slot];
  let amp = info.y * FR.params.y;
  if (amp <= 0.0) { return vec3f(0.0); }
  let h = max(p.y - info.x, 0.0);
  let t = FR.camPos.w;
  let ph = info.z;
  let s = sin(t * 1.6 + ph + p.x * 2.3) * 0.6 + sin(t * 0.73 + ph * 1.7 + p.z * 1.9) * 0.4;
  return vec3f(s * h * h * 0.06 * amp, 0.0, cos(t * 1.1 + ph + p.x) * h * h * 0.025 * amp);
}
`;

// ---------------------------------------------------------------- meshes

const MESH_IO = /* wgsl */ `
struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec4f,
  @location(2) col: vec4f,
  @location(3) uv: vec2f,
  @location(4) attr: vec4u,
};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) col: vec4f,
  @location(3) uv: vec2f,
  @location(4) @interpolate(flat) attr: vec4u,
};

fn place(v: VIn, inst: u32) -> VOut {
  let slot = inst + v.attr.x;
  let M = XF[slot];
  let local = v.pos + windOffset(v.pos, slot);
  let wp = M * vec4f(local, 1.0);
  var o: VOut;
  o.wpos = wp.xyz;
  o.nrm = normalize((M * vec4f(v.nrm.xyz, 0.0)).xyz);
  o.col = v.col;
  o.uv = v.uv;
  o.attr = v.attr;
  o.pos = FR.viewProj * wp;
  return o;
}

// Pattern lookup: rect (u0, v0, du, dv) and info (x: 1 = tile, y: 1 = alpha-cut).
// Pattern 0 is a plain white texel block. Gradients come from the caller so this can
// run after non-uniform branches.
fn patternSample(pid: u32, uv: vec2f, ddx: vec2f, ddy: vec2f) -> vec4f {
  let r = PATS[pid];
  let info = PATS[${MAX_PATTERNS}u + pid];
  let local = select(clamp(uv, vec2f(0.0), vec2f(1.0)), fract(uv), info.x > 0.5);
  // Inset by half a texel so bilinear taps stay inside the region.
  let inset = vec2f(1.0 / 4096.0);
  let a = r.xy + inset;
  let sz = r.zw - inset * 2.0;
  return textureSampleGrad(atlas, atlasSamp, a + local * sz, ddx * r.zw, ddy * r.zw);
}

fn patternInfo(pid: u32) -> vec4f {
  return PATS[${MAX_PATTERNS}u + pid];
}
`;

export const SHADOW_SIZE = 2048;

export const MESH = COMMON + MESH_IO + /* wgsl */ `
@group(1) @binding(0) var shadowMap: texture_depth_2d;
@group(1) @binding(1) var innerTex: texture_2d<f32>;
@group(1) @binding(2) var linSamp: sampler;

@vertex fn vs(v: VIn, @builtin(instance_index) inst: u32) -> VOut {
  return place(v, inst);
}

const POISSON = array<vec2f, 12>(
  vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696, 0.457), vec2f(-0.203, 0.621),
  vec2f(0.962, -0.195), vec2f(0.473, -0.480), vec2f(0.519, 0.767), vec2f(0.185, -0.893),
  vec2f(0.507, 0.064), vec2f(0.896, 0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598)
);

// Shadow lookup without comparison samplers (the iOS simulator's Metal family has none):
// bilinear-weighted depth tests on four loaded texels per tap, rotated Poisson taps.
fn shadowTap(uv: vec2f, z: f32) -> f32 {
  let size = vec2f(${SHADOW_SIZE}.0);
  let p = uv * size - 0.5;
  let i = vec2i(floor(p));
  let f = fract(p);
  let mx = i32(size.x) - 1;
  let a = select(0.0, 1.0, z <= textureLoad(shadowMap, clamp(i, vec2i(0), vec2i(mx)), 0));
  let b = select(0.0, 1.0, z <= textureLoad(shadowMap, clamp(i + vec2i(1, 0), vec2i(0), vec2i(mx)), 0));
  let c = select(0.0, 1.0, z <= textureLoad(shadowMap, clamp(i + vec2i(0, 1), vec2i(0), vec2i(mx)), 0));
  let d = select(0.0, 1.0, z <= textureLoad(shadowMap, clamp(i + vec2i(1, 1), vec2i(0), vec2i(mx)), 0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn shadowAt(wpos: vec3f, n: vec3f, ndl: f32) -> f32 {
  let p = FR.lightVP * vec4f(wpos + n * 0.004, 1.0);
  let ndc = p.xyz / p.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || ndc.z > 1.0) { return 1.0; }
  let texel = 1.0 / ${SHADOW_SIZE}.0;
  let soft = FR.lightDir.w * texel;
  let bias = 0.0008 + 0.002 * (1.0 - clamp(abs(ndl), 0.0, 1.0));
  let rot = hash21(floor(wpos.xz * 900.0)) * 6.2831;
  let cs = vec2f(cos(rot), sin(rot));
  var s = 0.0;
  for (var i = 0; i < 8; i++) {
    let o = POISSON[i];
    let r = vec2f(o.x * cs.x - o.y * cs.y, o.x * cs.y + o.y * cs.x);
    s += shadowTap(uv + r * soft, ndc.z - bias);
  }
  return s / 8.0;
}

fn paperFiber(p: vec3f) -> f32 {
  let a = vnoise3(p * 260.0);
  let b = vnoise3(p * vec3f(900.0, 140.0, 900.0));
  let c = vnoise3(p * 40.0);
  return a * 0.45 + b * 0.35 + c * 0.2;
}

struct FOut {
  @location(0) color: vec4f,
};

@fragment fn fs(in: VOut, @builtin(front_facing) front: bool) -> FOut {
  let pid = in.attr.y;
  let mat = in.attr.z;
  let emis = f32(in.attr.w) / 32.0;
  // Derivatives first: everything after the alpha discard is non-uniform control flow.
  let ddx = dpdx(in.uv);
  let ddy = dpdy(in.uv);
  let tex = patternSample(pid, in.uv, ddx, ddy);
  let aw = max(fwidth(tex.a), 1e-3);
  let info = patternInfo(pid);
  var albedo = srgb2lin(in.col.rgb);
  var alpha = 1.0;
  let ao = in.col.a;
  if (info.y > 0.5) {
    // Alpha-cut paper: sharpen the edge so alpha-to-coverage gives a clean cut.
    alpha = clamp((tex.a - 0.5) / aw + 0.5, 0.0, 1.0);
    if (alpha <= 0.01) { discard; }
  }
  let rgb = select(vec3f(1.0), tex.rgb / max(tex.a, 1e-3), tex.a > 0.002);
  albedo *= srgb2lin(rgb);
  if (mat == 10u) { discard; }
  var N = normalize(in.nrm);
  if (!front) { N = -N; }
  let V = normalize(FR.camPos.xyz - in.wpos);
  let fiber = paperFiber(in.wpos);
  let fiberAmt = FR.params.w;
  let t = FR.camPos.w;

  if (mat == 2u || mat == 9u) {
    // Glow: lantern light breathing slightly.
    let fl = 0.92 + 0.08 * sin(t * 7.0 + in.wpos.x * 40.0) * sin(t * 3.1 + in.wpos.z * 31.0);
    let c = albedo * emis * fl * (0.85 + 0.15 * fiber);
    // Glowing cut-outs use a hard threshold: thin strands seen edge-on get fractional
    // alpha, and the iOS simulator's alpha-to-coverage rounds those to nothing.
    if (info.y > 0.5 && tex.a < 0.35) { discard; }
    return FOut(vec4f(c, 1.0));
  }
  if (mat == 3u) {
    // Portal: the next scene, seen through the window, with a warm breathing glow on top.
    // At rest the whole next frame is shrunk into the portal (a little world in a window);
    // during the dive the mapping opens up to the plain screen mapping (portal.z = 1).
    let suv = in.pos.xy * FR.screen.zw;
    let aspect = FR.screen.x * FR.screen.w;
    let d = (suv - FR.zoom.xy) / max(FR.zoom.z, 1e-4);
    let fit = vec2f(0.5) + d * vec2f(aspect, 1.0) * vec2f(0.5 / aspect, 0.5) * 0.92;
    let uvIn = mix(fit, suv, FR.portal.z);
    let inner = textureSampleLevel(innerTex, linSamp, uvIn, 0.0).rgb;
    let r = length(in.uv - vec2f(0.5)) * 2.0;
    let pulse = 0.5 + 0.5 * sin(t * 2.2);
    let glowCol = albedo * emis * (0.75 + 0.25 * pulse) * (1.0 - 0.35 * r * r);
    // At rest the glow gathers at the rim and the middle stays clear (a lit window).
    let reveal = mix(FR.portal.x * (1.0 - 0.6 * smoothstep(0.5, 1.0, r)), FR.portal.x, FR.portal.z);
    // At reveal = 1 the portal is exactly the inner frame, so the swap is seamless.
    var c = mix(glowCol, inner * (1.0 + 0.35 * (1.0 - FR.portal.z)), reveal);
    c += albedo * FR.portal.y * smoothstep(0.65, 1.0, r) * 1.5 * (1.0 - reveal);
    return FOut(vec4f(c, 1.0));
  }

  albedo *= mix(1.0, 0.9 + 0.2 * fiber, fiberAmt);
  if (mat == 1u) {
    // The cut edge of a sheet shows the paper's pale core.
    albedo = mix(albedo, srgb2lin(vec3f(0.97, 0.94, 0.86)), 0.25);
  }
  if (mat == 7u) {
    return FOut(vec4f(albedo * FR.ambTop.rgb * 2.0, alpha));
  }

  let L = normalize(FR.lightDir.xyz);
  let ndl = dot(N, L);
  let sh = shadowAt(in.wpos, N, ndl);
  let wrapped = max((ndl + 0.3) / 1.3, 0.0);
  var direct = FR.lightCol.rgb * wrapped * sh;
  let hemi = mix(FR.ambBot.rgb, FR.ambTop.rgb, N.y * 0.5 + 0.5);
  var amb = hemi * mix(ao, 1.0, 0.15);
  var pts = vec3f(0.0);
  var back = vec3f(0.0);
  var spec = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let lp = FR.pointPos[i];
    if (lp.w <= 0.0) { continue; }
    let d = lp.xyz - in.wpos;
    let dist = length(d);
    let dir = d / max(dist, 1e-4);
    let fall = 1.0 / (1.0 + dist * dist / (lp.w * lp.w));
    let edge = 1.0 - smoothstep(lp.w * 2.0, lp.w * 4.0, dist);
    let nd = dot(N, dir);
    let col = FR.pointCol[i].rgb * fall * edge;
    pts += col * max((nd + 0.4) / 1.4, 0.0) * mix(ao, 1.0, 0.4);
    back += col * max(-nd, 0.0);
    if (mat == 5u) {
      let H = normalize(dir + V);
      spec += col * (pow(max(dot(N, H), 0.0), 40.0) * 2.0 + pow(max(dot(N, H), 0.0), 400.0) * 6.0);
    }
  }
  var c = albedo * (direct + amb + pts);
  if (mat == 4u) {
    // Vellum: light passing through thin paper.
    let tr = FR.lightCol.w;
    c += albedo * (FR.lightCol.rgb * max(-ndl, 0.0) * sh * tr + back * 0.9);
  }
  if (mat == 5u) {
    let H = normalize(L + V);
    spec += FR.lightCol.rgb * pow(max(dot(N, H), 0.0), 60.0) * 3.0 * sh;
    let fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    c = c * 0.7 + albedo * (spec + hemi * fres * 1.5) + albedo * 0.08;
  }
  if (mat == 6u) {
    // Cloth: soft sheen at grazing angles.
    let rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
    c += albedo * (FR.lightCol.rgb * 0.25 + hemi) * rim * 0.8;
  }
  if (mat == 8u) {
    let w = sin(in.wpos.x * 30.0 + t * 1.3) * sin(in.wpos.z * 24.0 - t * 0.9);
    c += FR.lightCol.rgb * smoothstep(0.75, 1.0, w) * 0.15 * sh;
  }
  if (emis > 0.0) {
    c += albedo * emis * 0.6;
  }
  // The book sits in a pool of lamp light; the table fades into the dark room.
  if (FR.misc.w > 0.0) {
    let pool = 1.0 - smoothstep(FR.misc.w, FR.misc.w * 2.6, length(in.wpos.xz - vec2f(0.0, 0.1)));
    c *= mix(0.03, 1.0, pool);
  }
  // Fog towards the background colour.
  let dist = length(FR.camPos.xyz - in.wpos);
  let fogAmt = 1.0 - exp(-FR.fog.w * max(dist - 1.0, 0.0));
  c = mix(c, FR.fog.rgb, clamp(fogAmt, 0.0, 1.0));
  return FOut(vec4f(c, alpha));
}
`;

// Volumetric light: only MAT.LIGHT triangles survive the vertex stage; additive, depth-tested.
export const LIGHT = COMMON + MESH_IO + /* wgsl */ `
@vertex fn vs(v: VIn, @builtin(instance_index) inst: u32) -> VOut {
  var o = place(v, inst);
  if (v.attr.z != 10u) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); }
  return o;
}

@fragment fn fs(in: VOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let emis = f32(in.attr.w) / 32.0;
  var N = normalize(in.nrm);
  if (!front) { N = -N; }
  let V = normalize(FR.camPos.xyz - in.wpos);
  let along = clamp(in.uv.y, 0.0, 1.0);
  // Brighter where we look through the beam, fading along it and near the source.
  let through = pow(abs(dot(N, V)), 1.4);
  // uv.x >= 1 marks shafts that fade in softly (sunlight from far above), uv.x < 1 beams
  // that are brightest at their lamp.
  let soft = in.uv.x >= 1.0;
  let fall = select(pow(1.0 - along, 1.6) * smoothstep(0.0, 0.08, along), pow(1.0 - along, 1.2) * smoothstep(0.0, 0.45, along), soft);
  let shimmer = 0.85 + 0.15 * sin(FR.camPos.w * 1.7 + along * 9.0 + in.uv.x * 6.0);
  let c = srgb2lin(in.col.rgb) * emis * through * fall * shimmer;
  return vec4f(c, 0.0);
}
`;

export const SHADOW = COMMON + MESH_IO + /* wgsl */ `
@vertex fn vs(v: VIn, @builtin(instance_index) inst: u32) -> VOut {
  var o = place(v, inst);
  o.pos = FR.lightVP * vec4f(o.wpos, 1.0);
  return o;
}

@fragment fn fs(in: VOut) {
  let a = patternSample(in.attr.y, in.uv, dpdx(in.uv), dpdy(in.uv)).a;
  // Glow panes and portals do not cast shadows (they sit inside lit rooms).
  if (in.attr.z == 2u || in.attr.z == 3u || in.attr.z == 9u || in.attr.z == 10u) { discard; }
  if (patternInfo(in.attr.y).y > 0.5 && a < 0.5) { discard; }
}
`;

// ---------------------------------------------------------------- background

export const BACKGROUND = COMMON + /* wgsl */ `
struct BOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> BOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: BOut;
  o.pos = vec4f(p[i], 1.0, 1.0);
  o.ndc = p[i];
  return o;
}

fn rayDir(ndc: vec2f) -> vec3f {
  let sx = ndc.x - FR.camF.w;
  let sy = ndc.y - FR.pBoxC.w;
  return normalize(FR.camF.xyz + FR.camR.xyz * sx * FR.camR.w + FR.camU.xyz * sy * FR.camU.w);
}

fn stars(d: vec3f, density: f32) -> vec3f {
  var c = vec3f(0.0);
  let t = FR.camPos.w;
  for (var k = 0; k < 3; k++) {
    let sc = 90.0 + f32(k) * 70.0;
    let q = vec2f(atan2(d.x, -d.z), d.y) * sc;
    let cell = floor(q);
    let f = fract(q) - 0.5;
    let h = hash21(cell + f32(k) * 17.0);
    if (h > 1.0 - density * 0.08) {
      let o = vec2f(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
      let r = length(f - o * 0.6);
      let tw = 0.6 + 0.4 * sin(t * (1.0 + h * 3.0) + h * 50.0);
      let s = smoothstep(0.08, 0.0, r) * tw;
      c += mix(vec3f(1.0, 0.85, 0.6), vec3f(0.7, 0.85, 1.0), hash21(cell + 1.3)) * s * (1.5 + f32(k));
    }
  }
  return c;
}

@fragment fn fs(in: BOut) -> @location(0) vec4f {
  let d = rayDir(in.ndc);
  let kind = i32(FR.params.x + 0.5);
  let t = FR.camPos.w;
  var c = mix(srgb2lin(FR.bgB.rgb), srgb2lin(FR.bgA.rgb), smoothstep(-0.25, 0.6, d.y));
  if (kind == 0) {
    // The study: warm bokeh from far lamps and a shelf glow.
    let uv = in.ndc;
    for (var i = 0; i < 9; i++) {
      let fi = f32(i);
      let p = vec2f(hash11(fi * 3.1) * 2.4 - 1.2, hash11(fi * 7.3) * 1.2 - 0.05);
      let r = 0.06 + hash11(fi * 1.7) * 0.12;
      let par = vec2f(FR.camPos.x * 0.05, 0.0);
      let dd = length((uv - p - par) * vec2f(FR.screen.x * FR.screen.w, 1.0));
      let ring = smoothstep(r, r * 0.55, dd) * (0.6 + 0.4 * smoothstep(r * 0.3, r, dd));
      let col = mix(srgb2lin(FR.bgC.rgb), vec3f(0.55, 0.35, 0.9), hash11(fi * 5.9));
      c += col * ring * (0.05 + 0.03 * sin(t * 0.5 + fi));
    }
  } else if (kind == 1) {
    // Night sky inside the lantern: stars, a soft aurora of lantern light.
    c += stars(d, FR.sky.y);
    let band = exp(-pow((d.y - 0.18 - 0.05 * sin(d.x * 3.0 + t * 0.1)) * 6.0, 2.0));
    c += srgb2lin(FR.bgC.rgb) * band * 0.35;
  } else if (kind == 3) {
    // Deep sea: light shafts from the surface and drifting caustics.
    let a = atan2(d.x, -d.z);
    var rays = 0.0;
    for (var k = 0; k < 4; k++) {
      let fk = f32(k);
      rays += pow(max(sin(a * (5.0 + fk * 3.0) + t * (0.1 + fk * 0.05) + fk), 0.0), 8.0);
    }
    c += srgb2lin(FR.bgC.rgb) * rays * smoothstep(-0.1, 0.8, d.y) * FR.sky.z * 0.25;
  }
  return vec4f(c, 1.0);
}
`;

// ---------------------------------------------------------------- particles (fireflies, dust, bubbles)

export const PARTICLES = COMMON + /* wgsl */ `
struct POut {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f,
  @location(1) col: vec3f,
  @location(2) a: f32,
};

fn particlePos(i: u32, t: f32) -> vec3f {
  let fi = f32(i);
  let h = vec3f(hash11(fi * 1.37), hash11(fi * 2.91), hash11(fi * 4.53)) * 2.0 - 1.0;
  let home = FR.pBoxC.xyz + h * FR.pBoxS.xyz;
  let kind = i32(FR.parts.y + 0.5);
  var p = home;
  if (kind == 2) {
    // Bubbles rise and wrap.
    let speed = 0.05 + hash11(fi * 9.1) * 0.08;
    let y = fract(h.y * 0.5 + 0.5 + t * speed) * 2.0 - 1.0;
    p = FR.pBoxC.xyz + vec3f(h.x * FR.pBoxS.x + 0.02 * sin(t * 2.0 + fi), y * FR.pBoxS.y, h.z * FR.pBoxS.z);
  } else {
    let w = t * (0.15 + hash11(fi * 5.7) * 0.25);
    p += vec3f(sin(w * 1.3 + fi), sin(w * 1.7 + fi * 2.0) * 0.6, cos(w * 1.1 + fi * 3.0)) * 0.05;
  }
  // Pulled into the portal while the camera dives in.
  let pull = clamp(FR.parts.z * (1.3 - hash11(fi * 3.3) * 0.6), 0.0, 1.0);
  if (pull > 0.0) {
    let c = FR.portalPos.xyz;
    let n = normalize(FR.portalN.xyz + vec3f(0.0, 0.0, 1e-4));
    let rv = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(n.y) > 0.9);
    let u = normalize(cross(rv, n));
    let v = cross(n, u);
    let ang = fi * 2.4 + t * 3.0;
    let rad = FR.portalPos.w * (0.4 + 1.6 * (1.0 - pull)) * hash11(fi * 8.8);
    let spiral = c + (u * cos(ang) + v * sin(ang)) * rad + n * (0.02 * (1.0 - pull));
    p = mix(p, spiral, pull * pull);
  }
  return p;
}

@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> POut {
  var corners = array<vec2f, 6>(vec2f(-1, -1), vec2f(1, -1), vec2f(1, 1), vec2f(-1, -1), vec2f(1, 1), vec2f(-1, 1));
  let q = corners[vi];
  let t = FR.camPos.w;
  let p = particlePos(ii, t);
  let fi = f32(ii);
  let kind = i32(FR.parts.y + 0.5);
  var size = FR.parts.w * (0.5 + hash11(fi * 6.1));
  let wp = p + (FR.camR.xyz * q.x + FR.camU.xyz * q.y) * size;
  var o: POut;
  o.pos = FR.viewProj * vec4f(wp, 1.0);
  o.q = q;
  var a = 1.0;
  var col = vec3f(1.0, 0.75, 0.35);
  if (kind == 0) {
    a = pow(max(sin(t * (0.8 + hash11(fi) * 1.5) + fi * 4.0), 0.0), 3.0) * FR.pBoxS.w;
    col = mix(vec3f(1.0, 0.72, 0.3), vec3f(0.85, 1.0, 0.5), hash11(fi * 1.9));
  } else if (kind == 1) {
    a = 0.25 + 0.2 * sin(t + fi);
    col = vec3f(1.0, 0.9, 0.75);
  } else {
    a = 0.5;
    col = vec3f(0.6, 0.85, 1.0);
  }
  a *= 1.0 + FR.parts.z * 2.0;
  a *= smoothstep(0.02, 0.15, length(p - FR.camPos.xyz)) * (1.0 - FR.misc.x);
  o.col = col;
  o.a = a;
  return o;
}

@fragment fn fs(in: POut) -> @location(0) vec4f {
  let r = length(in.q);
  let kind = i32(FR.parts.y + 0.5);
  var s = exp(-r * r * 6.0);
  if (kind == 2) {
    s = smoothstep(1.0, 0.85, r) * (0.15 + smoothstep(0.6, 0.95, r) * 0.6);
  }
  if (r > 1.0) { discard; }
  return vec4f(in.col * s * in.a * 2.5, 0.0);
}
`;

// ---------------------------------------------------------------- post

const POST_HEAD = /* wgsl */ `
struct Pass { srcTexel: vec4f };
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var texA: texture_2d<f32>;
@group(0) @binding(2) var texB: texture_2d<f32>;
@group(0) @binding(3) var<uniform> PP: Pass;
@group(0) @binding(4) var<uniform> P: Post;

struct Post {
  a: vec4f, // x exposure, y bloom, z saturation, w fade
  b: vec4f, // x vignette, y grain, z time, w radial blur
  c: vec4f, // xy blur centre
  d: vec4f, // rgb tint
};

struct FullOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> FullOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: FullOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(vec3f(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
`;

export const POST = POST_HEAD + /* wgsl */ `
@fragment fn prefilter(in: FullOut) -> @location(0) vec4f {
  let h = PP.srcTexel.xy;
  var c = textureSample(texA, samp, in.uv + vec2f(-h.x, -h.y)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(h.x, -h.y)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(-h.x, h.y)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(h.x, h.y)).rgb;
  c *= 0.25;
  let b = max(c.r, max(c.g, c.b));
  let th = 0.85;
  let knee = 0.5;
  var rq = clamp(b - th + knee, 0.0, 2.0 * knee);
  rq = rq * rq / (4.0 * knee + 1e-4);
  let w = max(rq, b - th) / max(b, 1e-4);
  return vec4f(min(c * w, vec3f(30.0)), 1.0);
}

@fragment fn down(in: FullOut) -> @location(0) vec4f {
  let h = PP.srcTexel.xy * 0.5;
  var c = textureSample(texA, samp, in.uv).rgb * 4.0;
  c += textureSample(texA, samp, in.uv - h).rgb;
  c += textureSample(texA, samp, in.uv + h).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(h.x, -h.y)).rgb;
  c += textureSample(texA, samp, in.uv - vec2f(h.x, -h.y)).rgb;
  return vec4f(c / 8.0, 1.0);
}

@fragment fn up(in: FullOut) -> @location(0) vec4f {
  let h = PP.srcTexel.xy * 0.5;
  var c = textureSample(texA, samp, in.uv + vec2f(-h.x * 2.0, 0.0)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(-h.x, h.y)).rgb * 2.0;
  c += textureSample(texA, samp, in.uv + vec2f(0.0, h.y * 2.0)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(h.x, h.y)).rgb * 2.0;
  c += textureSample(texA, samp, in.uv + vec2f(h.x * 2.0, 0.0)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(h.x, -h.y)).rgb * 2.0;
  c += textureSample(texA, samp, in.uv + vec2f(0.0, -h.y * 2.0)).rgb;
  c += textureSample(texA, samp, in.uv + vec2f(-h.x, -h.y)).rgb * 2.0;
  return vec4f(c / 12.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment fn composite(in: FullOut) -> @location(0) vec4f {
  // Radial zoom blur while diving through a portal.
  let blur = P.b.w;
  var hdr = vec3f(0.0);
  if (blur > 0.001) {
    let dir = in.uv - P.c.xy;
    var wsum = 0.0;
    for (var i = 0; i < 10; i++) {
      let k = f32(i) / 9.0;
      let w = 1.0 - k * 0.7;
      hdr += textureSampleLevel(texA, samp, in.uv - dir * k * blur, 0.0).rgb * w;
      wsum += w;
    }
    hdr /= wsum;
  } else {
    hdr = textureSampleLevel(texA, samp, in.uv, 0.0).rgb;
  }
  let bloom = textureSampleLevel(texB, samp, in.uv, 0.0).rgb;
  var c = hdr + bloom * P.a.y;
  c *= P.a.x;
  c *= P.d.rgb;
  c = aces(c);
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = mix(vec3f(lum), c, P.a.z);
  let q = (in.uv - vec2f(0.5)) * vec2f(1.0, 0.85);
  c *= mix(1.0, 1.0 - P.b.x, smoothstep(0.3, 0.85, length(q)));
  c = pow(c, vec3f(1.0 / 2.2));
  let g = hash21(in.uv * vec2f(1931.0, 1373.0) + fract(P.b.z * 7.31) * 100.0) - 0.5;
  c += g * P.b.y;
  c *= 1.0 - P.a.w;
  return vec4f(c, 1.0);
}
`;
