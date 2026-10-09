// Camera, look and per-frame uniform packing. Worklets: the director calls these on the UI
// runtime every frame. The float layout is `F` in shaders.ts.
import type { V3 } from './math';
import { lookAt, mul, ortho, perspective, v3add, v3cross, v3norm, v3scale } from './math';
import { F, FRAME_FLOATS } from './shaders';

export type Cam = {
  pos: V3;
  target: V3;
  up: V3;
  fov: number; // vertical, radians
  shiftX: number; // principal point shift in NDC
  shiftY: number;
  near: number;
  far: number;
};

export type Look = {
  lightDir: V3; // towards the light
  lightCol: V3; // linear, premultiplied by intensity
  translucency: number;
  shadowSoft: number; // texels
  shadowCenter: V3;
  shadowHalf: [number, number, number]; // half width, half height, half depth of the light box
  ambTop: V3;
  ambBot: V3;
  fog: [number, number, number, number];
  bgKind: number;
  bgA: string;
  bgB: string;
  bgC: string;
  exposure: number;
  saturation: number;
  vignette: number;
  grain: number;
  fiber: number;
  wind: number;
  bloom: number;
  tint: V3;
  particleKind: number;
  particleCount: number;
  particleCenter: V3;
  particleHalf: V3;
  particleSize: number;
  sky: [number, number, number, number];
  pool: number; // radius of the lamp-light pool on the table (0 = off)
};

export type PointLight = { pos: V3; radius: number; col: V3 };

function hexToRgb(h: string): V3 {
  'worklet';
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}

function put(f: Float32Array, vec: number, a: number, b: number, c: number, d: number) {
  'worklet';
  const o = vec * 4;
  f[o] = a;
  f[o + 1] = b;
  f[o + 2] = c;
  f[o + 3] = d;
}

export function newFrame() {
  'worklet';
  return new Float32Array(FRAME_FLOATS);
}

export function cameraMatrix(cam: Cam, aspect: number) {
  'worklet';
  const view = lookAt(cam.pos, cam.target, cam.up);
  const proj = perspective(cam.fov, aspect, cam.near, cam.far, cam.shiftX, cam.shiftY);
  const vp = new Array(16).fill(0);
  mul(vp, proj, view);
  return vp;
}

export function writeFrame(
  f: Float32Array,
  cam: Cam,
  look: Look,
  W: number,
  H: number,
  time: number,
  points: PointLight[],
  portal: { reveal: number; glow: number; pull: number; pos: V3; radius: number; normal?: V3; screen?: [number, number, number]; open?: number },
  particleFade: number,
) {
  'worklet';
  const aspect = W / H;
  const vp = cameraMatrix(cam, aspect);
  for (let i = 0; i < 16; i++) f[F.viewProj * 4 + i] = vp[i];
  // Light: orthographic box around the scene, looking along -lightDir.
  const ld = v3norm(look.lightDir);
  const sc = look.shadowCenter;
  const eye = v3add(sc, v3scale(ld, look.shadowHalf[2]));
  const lup = Math.abs(ld[1]) > 0.95 ? [0, 0, -1] : [0, 1, 0];
  const lview = lookAt(eye, sc, lup);
  const lproj = ortho(-look.shadowHalf[0], look.shadowHalf[0], -look.shadowHalf[1], look.shadowHalf[1], 0.01, look.shadowHalf[2] * 2);
  const lvp = new Array(16).fill(0);
  mul(lvp, lproj, lview);
  for (let i = 0; i < 16; i++) f[F.lightVP * 4 + i] = lvp[i];
  put(f, F.camPos, cam.pos[0], cam.pos[1], cam.pos[2], time);
  put(f, F.lightDir, ld[0], ld[1], ld[2], look.shadowSoft);
  put(f, F.lightCol, look.lightCol[0], look.lightCol[1], look.lightCol[2], look.translucency);
  put(f, F.ambTop, look.ambTop[0], look.ambTop[1], look.ambTop[2], 0);
  put(f, F.ambBot, look.ambBot[0], look.ambBot[1], look.ambBot[2], 0);
  put(f, F.fog, look.fog[0], look.fog[1], look.fog[2], look.fog[3]);
  const a = hexToRgb(look.bgA);
  const b = hexToRgb(look.bgB);
  const c = hexToRgb(look.bgC);
  put(f, F.bgA, a[0], a[1], a[2], 1);
  put(f, F.bgB, b[0], b[1], b[2], 1);
  put(f, F.bgC, c[0], c[1], c[2], 1);
  for (let i = 0; i < 4; i++) {
    const p = points[i];
    if (p) {
      put(f, F.pointPos + i, p.pos[0], p.pos[1], p.pos[2], p.radius);
      put(f, F.pointCol + i, p.col[0], p.col[1], p.col[2], 0);
    } else {
      put(f, F.pointPos + i, 0, 0, 0, 0);
      put(f, F.pointCol + i, 0, 0, 0, 0);
    }
  }
  put(f, F.portal, portal.reveal, portal.glow, portal.open ?? 1, 0);
  put(f, F.screen, W, H, 1 / W, 1 / H);
  put(f, F.params, look.bgKind, look.wind, look.exposure, look.fiber);
  put(f, F.grade, look.saturation, look.grain, look.vignette, 0);
  const ps = portal.screen ?? [0.5, 0.5, 0.5];
  put(f, F.zoom, ps[0], ps[1], ps[2], look.bloom);
  put(f, F.parts, look.particleCount, look.particleKind, portal.pull, look.particleSize);
  put(f, F.portalPos, portal.pos[0], portal.pos[1], portal.pos[2], portal.radius);
  put(f, F.tint, look.tint[0], look.tint[1], look.tint[2], 0);
  // Camera basis for background rays and billboards.
  const fwd = v3norm([cam.target[0] - cam.pos[0], cam.target[1] - cam.pos[1], cam.target[2] - cam.pos[2]]);
  let right = v3cross(fwd, cam.up);
  right = v3norm(right);
  const up = v3cross(right, fwd);
  const ty = Math.tan(cam.fov / 2);
  put(f, F.camR, right[0], right[1], right[2], ty * aspect);
  put(f, F.camU, up[0], up[1], up[2], ty);
  put(f, F.camF, fwd[0], fwd[1], fwd[2], cam.shiftX);
  put(f, F.pBoxC, look.particleCenter[0], look.particleCenter[1], look.particleCenter[2], cam.shiftY);
  put(f, F.pBoxS, look.particleHalf[0], look.particleHalf[1], look.particleHalf[2], 1);
  put(f, F.misc, particleFade, 0, 0, look.pool);
  put(f, F.sky, look.sky[0], look.sky[1], look.sky[2], look.sky[3]);
  const pn = portal.normal ?? [0, 0, 1];
  put(f, F.portalN, pn[0], pn[1], pn[2], 0);
  return vp;
}

// Post uniforms (`Post` in shaders.ts): exposure, bloom, saturation, fade | vignette, grain,
// time, radial blur | blur centre, unused | tint.
export function writePost(p: Float32Array, look: Look, time: number, blur: number, cx: number, cy: number) {
  'worklet';
  p[0] = look.exposure;
  p[1] = look.bloom;
  p[2] = look.saturation;
  p[3] = 0;
  p[4] = look.vignette;
  p[5] = look.grain;
  p[6] = time;
  p[7] = blur;
  p[8] = cx;
  p[9] = cy;
  p[10] = 0;
  p[11] = 0;
  p[12] = look.tint[0];
  p[13] = look.tint[1];
  p[14] = look.tint[2];
  p[15] = 0;
}
