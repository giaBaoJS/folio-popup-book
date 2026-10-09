// Chapter IV: under the paper sea. The camera comes down through the moon's reflection into
// deep blue water; an old paper whale swims past, and on the sand lies the little book from
// chapter I, glowing like a lantern. Its pages lead back to the beginning.
import { DEEP } from '../assets/scenes/deep';
import type { Cam, Look, PointLight } from '../engine/frame';
import { deg, v3norm } from '../engine/math';
import { attach, pivotOf, rotate, scale, translate } from './anim';
import type { AnimCtx, SceneDef } from './types';

// Mirrors tools/blender/deep.py.
const WHALE_X = -0.35;
const JELLY0: [number, number, number] = [-0.66, 0.66, -0.12];
const BUBBLE_STREAMS = 12;
// The portal (centre and normal of the glowing pages), straight from the built asset.
const PORTAL = DEEP.parts.find((p) => p.name === 'portal')?.meta.portal ?? { center: [0, 0.15, -0.07], normal: [0, 0.93, 0.37], radius: 0.17 };
const BOOK_C: [number, number, number] = [PORTAL.center[0], PORTAL.center[1], PORTAL.center[2]];
const BOOK_UP: [number, number, number] = [PORTAL.normal[0], PORTAL.normal[1], PORTAL.normal[2]];

export const DEEP_LOOK: Look = {
  lightDir: v3norm([0.25, 1.0, -0.3]),
  lightCol: [0.2, 0.4, 0.53],
  translucency: 1.0,
  shadowSoft: 3.0,
  shadowCenter: [0, 0.6, -0.6],
  shadowHalf: [2.7, 2.7, 3.5],
  ambTop: [0.05, 0.14, 0.23],
  ambBot: [0.035, 0.05, 0.08],
  fog: [0.012, 0.09, 0.135, 0.24],
  bgKind: 3,
  bgA: '#3aa9c4',
  bgB: '#05142a',
  bgC: '#c4f6ff',
  exposure: 1.2,
  saturation: 1.08,
  vignette: 0.62,
  grain: 0.022,
  fiber: 1,
  wind: 1,
  bloom: 0.95,
  tint: [0.98, 1.0, 1.03],
  // Bubbles are paper geometry (rising streams, see deep.py): the shared particle pull spirals in
  // the XY plane, which for this upward-facing portal would crowd the end of the dive.
  particleKind: 2,
  particleCount: 0,
  particleCenter: [0, 0.95, -0.5],
  particleHalf: [1.9, 0.95, 1.3],
  particleSize: 0.008,
  sky: [0, 0, 4, 0],
  pool: 0,
};

const BOOK_LIGHT: [number, number, number] = [BOOK_C[0] + BOOK_UP[0] * 0.13, BOOK_C[1] + BOOK_UP[1] * 0.13, BOOK_C[2] + BOOK_UP[2] * 0.13];

const DEEP_POINTS: PointLight[] = [
  // The book: the warm heart of a cold scene.
  { pos: BOOK_LIGHT, radius: 0.4, col: [2.4, 1.35, 0.55] },
  // Its spill on the sand in front.
  { pos: [0.0, 0.07, 0.36], radius: 0.24, col: [1.3, 0.72, 0.3] },
  // The pink jelly's lantern (follows it, see animate).
  { pos: [JELLY0[0], JELLY0[1] + 0.04, JELLY0[2]], radius: 0.18, col: [1.1, 0.5, 1.2] },
  // Cold light from the surface falling on the whale's flank as it passes.
  { pos: [0.1, 1.15, -0.6], radius: 0.75, col: [0.22, 0.5, 0.68] },
];

const DEEP_CAM: Cam = {
  pos: [0, 1.12, 2.3],
  target: [0, 0.3, -0.45],
  up: [0, 1, 0],
  fov: deg(34),
  shiftX: 0,
  shiftY: 0,
  near: 0.02,
  far: 30,
};

// Just under the surface, looking down into the deep (we came through the moon's reflection).
const DEEP_ENTRY: Cam = {
  pos: [0, 2.9, 1.0],
  target: [0, 0.25, -0.35],
  up: [0, 0, -1],
  fov: deg(34),
  shiftX: 0,
  shiftY: 0,
  near: 0.02,
  far: 30,
};

// ---------------------------------------------------------------- animation

function rotateThenMove(ctx: AnimCtx, part: string, pivot: number[], axis: number[], angle: number, dx: number, dy: number, dz: number) {
  'worklet';
  rotate(ctx, part, pivot, axis, angle);
  translate(ctx, part, dx, dy, dz);
}

// The whale's long loop: across to the right, a slow U-turn out of sight, back to the left,
// another turn. Both flanks are decorated, so it reads the same either way.
const LANE = 3.0; // |x| where the whale turns (out of frame, even when orbiting)
const SPEED = 0.055;
const T_LANE = (2 * LANE) / SPEED;
const T_TURN = 9;
const T_CYCLE = 2 * T_LANE + 2 * T_TURN;
const T_START = (WHALE_X + LANE) / SPEED; // at t = 0 the whale is at its rest pose, heading right

function whalePath(t: number): [number, number, number] {
  'worklet';
  const raw = t + T_START;
  const s = raw - T_CYCLE * Math.floor(raw / T_CYCLE);
  if (s < T_LANE) return [-LANE + SPEED * s, 0, 0];
  if (s < T_LANE + T_TURN) {
    const u = (s - T_LANE) / T_TURN;
    const e = u * u * (3 - 2 * u);
    return [LANE + 0.4 * Math.sin(Math.PI * u), Math.PI * e, -0.5 * Math.sin(Math.PI * u)];
  }
  if (s < 2 * T_LANE + T_TURN) return [LANE - SPEED * (s - T_LANE - T_TURN), Math.PI, 0];
  const u = (s - 2 * T_LANE - T_TURN) / T_TURN;
  const e = u * u * (3 - 2 * u);
  return [-LANE - 0.4 * Math.sin(Math.PI * u), Math.PI + Math.PI * e, 0.5 * Math.sin(Math.PI * u)];
}

function whaleBase(ctx: AnimCtx, part: string, c: number[], pitch: number, yaw: number, dx: number, dy: number, dz: number) {
  'worklet';
  rotate(ctx, part, c, [0, 0, 1], pitch);
  rotate(ctx, part, c, [0, 1, 0], yaw);
  translate(ctx, part, dx, dy, dz);
}

function whaleSwim(ctx: AnimCtx) {
  'worklet';
  const t = ctx.t;
  const path = whalePath(t);
  const dx = path[0] - WHALE_X;
  const w = (t * 2 * Math.PI) / 19;
  const dy = 0.035 * Math.sin(w);
  const pitch = 0.05 * Math.cos(w);
  const beat = (t * 2 * Math.PI) / 5.2;
  const body = pivotOf(ctx, 'whale_body');
  whaleBase(ctx, 'whale_body', body, pitch, path[1], dx, dy, path[2]);
  whaleBase(ctx, 'whale_belly', body, pitch, path[1], dx, dy, path[2]);
  rotate(ctx, 'whale_rear', pivotOf(ctx, 'whale_rear'), [0, 0, 1], 0.07 * Math.sin(beat));
  attach(ctx, 'whale_rear', 'whale_body');
  rotate(ctx, 'whale_tail', pivotOf(ctx, 'whale_tail'), [0, 0, 1], 0.2 * Math.sin(beat - 1.0));
  attach(ctx, 'whale_tail', 'whale_rear');
  const fp = (t * 2 * Math.PI) / 7.5;
  rotate(ctx, 'whale_fin', pivotOf(ctx, 'whale_fin'), [0, 0, 1], 0.05 + 0.13 * Math.sin(fp));
  attach(ctx, 'whale_fin', 'whale_body');
  rotate(ctx, 'whale_fin2', pivotOf(ctx, 'whale_fin2'), [0, 0, 1], 0.05 + 0.13 * Math.sin(fp + 0.5));
  attach(ctx, 'whale_fin2', 'whale_body');
}

function jellyPulse(ctx: AnimCtx, i: number, period: number) {
  'worklet';
  const t = ctx.t;
  const bell = 'jelly' + i + '_bell';
  const tent = 'jelly' + i + '_tent';
  const apex = pivotOf(ctx, bell);
  const c = pivotOf(ctx, tent);
  const ph = (t * 2 * Math.PI) / period + i * 1.7;
  const s = Math.max(Math.sin(ph), 0);
  const k = s * s;
  const dx = 0.045 * Math.sin(t * 0.11 + i * 2.0);
  const dy = 0.05 * Math.sin(t * 0.17 + i) + 0.014 * Math.sin(ph - 0.7);
  const tilt = 0.12 * Math.sin(t * 0.23 + i * 1.3);
  scale(ctx, bell, apex, 1 - 0.14 * k, 1 + 0.07 * k, 1 - 0.14 * k);
  rotateThenMove(ctx, bell, c, [0, 0, 1], tilt, dx, dy, 0);
  scale(ctx, tent, c, 1 - 0.08 * k, 1 + 0.08 * Math.max(Math.sin(ph - 0.8), 0), 1 - 0.08 * k);
  rotate(ctx, tent, c, [1, 0, 0], 0.12 * Math.sin(ph - 1.3));
  rotateThenMove(ctx, tent, c, [0, 0, 1], tilt * 1.4, dx, dy, 0);
  if (i === 0 && ctx.points.length > 2) {
    ctx.points[2].pos = [JELLY0[0] + dx, JELLY0[1] + 0.04 + dy, JELLY0[2]];
    const g = 1 + 0.25 * k;
    ctx.points[2].col = [1.1 * g, 0.5 * g, 1.2 * g];
  }
}

function school(ctx: AnimCtx, part: string, rate: number, ph: number) {
  'worklet';
  const p = pivotOf(ctx, part);
  rotate(ctx, part, p, [0, 1, 0], ctx.t * rate + ph);
  translate(ctx, part, 0, 0.025 * Math.sin(ctx.t * 0.6 + ph), 0);
}

function animateDeep(ctx: AnimCtx) {
  'worklet';
  const t = ctx.t;
  whaleSwim(ctx);
  jellyPulse(ctx, 0, 2.8);
  jellyPulse(ctx, 1, 3.3);
  jellyPulse(ctx, 2, 2.5);
  jellyPulse(ctx, 3, 3.0);
  school(ctx, 'school_a0', 0.34, 0);
  school(ctx, 'school_a1', 0.28, 1.1);
  school(ctx, 'school_a2', 0.23, 2.3);
  school(ctx, 'school_b0', 0.42, 0.5);
  school(ctx, 'school_b1', 0.36, 1.7);
  // Bubble streams rise and wrap by one period.
  for (let i = 0; i < BUBBLE_STREAMS; i++) {
    const v = 0.1 + 0.03 * Math.sin(i * 2.7);
    const r = t * v + i * 0.37;
    translate(ctx, 'bubbles' + i, 0, r - 0.9 * Math.floor(r / 0.9), 0);
  }
  // Motes of light circle the book and breathe up and down.
  rotate(ctx, 'motes', BOOK_C, BOOK_UP, t * 0.16);
  const lift = 0.012 * Math.sin(t * 0.9);
  translate(ctx, 'motes', BOOK_UP[0] * lift, BOOK_UP[1] * lift, BOOK_UP[2] * lift);
  // The book breathes like a lantern.
  if (ctx.points.length > 0) {
    const f = 1 + 0.07 * Math.sin(t * 2.2) + 0.03 * Math.sin(t * 5.3);
    ctx.points[0].col = [2.4 * f, 1.35 * f, 0.55 * f];
  }
}

export const DEEP_SCENE: SceneDef = {
  name: 'deep',
  asset: DEEP,
  look: DEEP_LOOK,
  points: DEEP_POINTS,
  cam: DEEP_CAM,
  entry: DEEP_ENTRY,
  portalPart: 'portal',
  chapter: {
    numeral: 'IV',
    title: 'Under the Paper Sea',
    body: 'Below the waves, an old whale keeps every light that was ever lost. And on the sand lies a little book, glowing like a lantern.',
    hint: 'Pinch into the glowing book',
  },
  animate: animateDeep,
};
