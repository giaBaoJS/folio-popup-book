// Chapter II: the reading room at the top of the Lantern House tower. Mira reads to her
// sleeping fox Ember by Grandma's brass lantern; the lantern's round lens is the way on.
import { ATTIC } from '../assets/scenes/attic';
import type { Cam, Look, PointLight } from '../engine/frame';
import { deg, hash, v3norm } from '../engine/math';
import { attach, pivotOf, rotate, scale, translate } from './anim';
import type { AnimCtx, SceneDef } from './types';

function axisOf(name: string): [number, number, number] {
  const p = ATTIC.parts.find((q) => q.name === name);
  return p ? [p.axis[0], p.axis[1], p.axis[2]] : [0, 0, 1];
}

const portal = ATTIC.parts.find((p) => p.name === 'portal')?.meta.portal;
const LENS: [number, number, number] = portal ? [portal.center[0], portal.center[1], portal.center[2]] : [0.03, 0.21, 0.31];
const LENS_N: [number, number, number] = portal ? [portal.normal[0], portal.normal[1], portal.normal[2]] : [0.16, 0, 0.99];

const PAGE_AXIS = axisOf('mira_page');
const HEAD_AXIS = axisOf('mira_head');
const EAR_AXIS = axisOf('fox_ear');
const TAIL_AXIS = axisOf('fox_tail');
// Mira's own left-right axis (for a small nod): perpendicular to her facing, horizontal.
const NOD_AXIS: [number, number, number] = v3norm([HEAD_AXIS[2], 0, -HEAD_AXIS[0]]);

// How far a page turns about the spine (the two halves of the book sit in a shallow V).
const PAGE_TURN = deg(166);

// Paper stars hanging on threads (parts tagged `swing` in attic.py).
const STARS: string[] = ATTIC.parts.filter((p) => p.meta.swing).map((p) => p.name);

const EYES = ATTIC.parts.find((p) => p.name === 'mira_eyes')?.meta as { glance?: number[]; lid?: number } | undefined;
const GLANCE: [number, number, number] = EYES?.glance ? [EYES.glance[0], EYES.glance[1], EYES.glance[2]] : [0.002, 0.003, 0];
const LID = EYES?.lid ?? 0.018;

// How closed her eyes are (0 open, 1 shut): a blink every few seconds, sometimes a double.
function blink(t: number) {
  'worklet';
  const P = 3.4;
  const k = Math.floor(t / P);
  const local = t - k * P - hash(k) * 1.6;
  const one = (x: number) => (x < 0 || x > 0.17 ? 0 : x < 0.06 ? x / 0.06 : 1 - (x - 0.06) / 0.11);
  let c = one(local);
  if (hash(k + 17) > 0.62) c = Math.max(c, one(local - 0.24));
  return c;
}

// Every so often she looks up from the book at Ember, then back down.
function glance(t: number) {
  'worklet';
  const P = 9.5;
  const x = (t + 3.0) % P;
  if (x > 2.2) return 0;
  const u = x / 2.2;
  return Math.min(1, u * 6) * Math.min(1, (1 - u) * 4);
}

// Moonlight through the side window in the gable wall.
export const ATTIC_LOOK: Look = {
  lightDir: v3norm([-0.02, 0.72, -0.55]),
  lightCol: [0.6, 0.78, 1.35],
  translucency: 0.6,
  shadowSoft: 2.6,
  shadowCenter: [0, 0.6, 0.3],
  shadowHalf: [1.7, 1.7, 3.2],
  ambTop: [0.07, 0.06, 0.11],
  ambBot: [0.1, 0.07, 0.06],
  fog: [0.05, 0.035, 0.04, 0.05],
  bgKind: 2,
  bgA: '#2a1d2e',
  bgB: '#140d12',
  bgC: '#ffb066',
  exposure: 1.15,
  saturation: 1.05,
  vignette: 0.55,
  grain: 0.022,
  fiber: 1,
  wind: 1,
  bloom: 0.9,
  tint: [1.02, 0.99, 0.97],
  particleKind: 1,
  particleCount: 90,
  particleCenter: [0.02, 0.36, 0.2],
  particleHalf: [0.45, 0.28, 0.35],
  particleSize: 0.0045,
  sky: [0, 0, 0, 0],
  pool: 0,
};

const LAMP_COL: [number, number, number] = [2.4, 1.45, 0.62];
const CANDLE_COL: [number, number, number] = [1.5, 0.85, 0.38];

const POINTS: PointLight[] = [
  // Grandma's lantern: the warm key, a little in front of the lens.
  { pos: [LENS[0] - LENS_N[0] * 0.065, LENS[1] + 0.005, LENS[2] - LENS_N[2] * 0.065], radius: 0.34, col: [...LAMP_COL] },
  // The candle on the window sill.
  { pos: [0.2, 0.68, -0.98], radius: 0.22, col: [...CANDLE_COL] },
  // Warm fill from the star garland, so the beams read.
  { pos: [0, 1.0, 0.4], radius: 0.9, col: [0.32, 0.2, 0.12] },
  // Cool moonlight bouncing off the gable wall.
  { pos: [0.25, 0.4, -0.7], radius: 0.5, col: [0.12, 0.16, 0.32] },
];

const CAM: Cam = {
  // The orbit pivots about the target, so it sits part-way along the view ray (not at the
  // lantern) to keep the camera inside the roof at the full drag range.
  pos: [0.14, 0.72, 2.0],
  target: [0.036, 0.473, 0.635],
  up: [0, 1, 0],
  fov: deg(34),
  shiftX: 0,
  shiftY: 0,
  near: 0.02,
  far: 30,
};

// Just inside the round tower window we flew through: higher and further back.
const ENTRY: Cam = { ...CAM, pos: [0.05, 0.9, 2.9], target: [0.02, 0.2, 0.0] };

function animateAttic(ctx: AnimCtx) {
  'worklet';
  const t = ctx.t;
  // Mira breathes; her head tilts slowly as she reads.
  const seat = pivotOf(ctx, 'mira_body');
  const br = Math.sin(t * 1.5);
  scale(ctx, 'mira_body', seat, 1 + 0.004 * br, 1 + 0.012 * br, 1 + 0.004 * br);
  // Every 6 seconds a page turns over about the spine.
  const cyc = t % 6.0;
  const u = Math.min(1, Math.max(0, (cyc - 4.4) / 1.25));
  const e = u * u * (3 - 2 * u);
  const neck = pivotOf(ctx, 'mira_head');
  const gl = glance(t);
  const look = 0.06 * Math.sin(t * 0.45) + 0.025 * Math.sin(t * 1.13 + 1.0) - 0.05 * Math.sin(e * Math.PI) - 0.12 * gl;
  rotate(ctx, 'mira_head', neck, HEAD_AXIS, look);
  rotate(ctx, 'mira_head', neck, NOD_AXIS, 0.04 + 0.03 * Math.sin(t * 0.6) * 0.5 + 0.05 * Math.sin(e * Math.PI) - 0.07 * gl);
  attach(ctx, 'mira_head', 'mira_body');
  // Eyes: the upper lid comes down over them; a glance lifts them towards Ember.
  const shut = blink(t);
  const eyeP = pivotOf(ctx, 'mira_eyes');
  scale(ctx, 'mira_eyes', eyeP, 1, 1 - 0.92 * shut, 1);
  translate(ctx, 'mira_eyes', GLANCE[0] * gl, GLANCE[1] * gl, GLANCE[2] * gl);
  attach(ctx, 'mira_eyes', 'mira_head');
  translate(ctx, 'mira_lashes', GLANCE[0] * gl * 0.4, -LID * shut + GLANCE[1] * gl * 0.5, GLANCE[2] * gl * 0.4);
  attach(ctx, 'mira_lashes', 'mira_head');
  rotate(ctx, 'mira_page', pivotOf(ctx, 'mira_page'), PAGE_AXIS, -e * PAGE_TURN);
  attach(ctx, 'mira_page', 'mira_body');

  // Ember breathes slowly in her sleep, her tail tip stirs and an ear twitches now and then.
  const fb = pivotOf(ctx, 'fox_body');
  const fbr = Math.sin(t * 1.15 + 0.7);
  scale(ctx, 'fox_body', fb, 1 + 0.008 * fbr, 1 + 0.035 * fbr, 1);
  rotate(ctx, 'fox_tail', pivotOf(ctx, 'fox_tail'), TAIL_AXIS, 0.1 * Math.sin(t * 0.8) + 0.04 * Math.sin(t * 2.1));
  const ec = t % 4.7;
  const twitch = ec < 0.5 ? Math.sin((ec / 0.5) * Math.PI * 2) * Math.exp(-ec * 3) : 0;
  rotate(ctx, 'fox_ear', pivotOf(ctx, 'fox_ear'), EAR_AXIS, 0.35 * twitch);

  // The paper stars swing on their threads.
  for (let i = 0; i < STARS.length; i++) {
    const p = pivotOf(ctx, STARS[i]);
    rotate(ctx, STARS[i], p, [0, 0, 1], 0.09 * Math.sin(t * (0.9 + (i % 4) * 0.13) + i * 1.3));
    rotate(ctx, STARS[i], p, [1, 0, 0], 0.06 * Math.sin(t * 0.7 + i * 2.1));
    rotate(ctx, STARS[i], p, [0, 1, 0], 0.25 * Math.sin(t * 0.5 + i));
  }

  // The lantern and the candle flicker.
  const lamp = ctx.points[0];
  if (lamp) {
    const fl = 0.95 + 0.05 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 0.4);
    lamp.col[0] = LAMP_COL[0] * fl;
    lamp.col[1] = LAMP_COL[1] * fl;
    lamp.col[2] = LAMP_COL[2] * fl;
  }
  const cd = ctx.points[1];
  if (cd) {
    const fl = 0.88 + 0.12 * Math.sin(t * 9.7) * Math.sin(t * 4.3 + 1.0);
    cd.col[0] = CANDLE_COL[0] * fl;
    cd.col[1] = CANDLE_COL[1] * fl;
    cd.col[2] = CANDLE_COL[2] * fl;
  }
}

export const ATTIC_SCENE: SceneDef = {
  name: 'attic',
  asset: ATTIC,
  look: ATTIC_LOOK,
  points: POINTS,
  cam: CAM,
  entry: ENTRY,
  portalPart: 'portal',
  chapter: {
    numeral: 'II',
    title: 'The Reading Room',
    body: 'Up in the tower, Mira reads to her fox, Ember, by the light of Grandma’s old brass lantern. “There is a whole sky inside it,” Grandma used to say.',
    hint: 'Pinch into the lantern',
  },
  animate: animateAttic,
};
