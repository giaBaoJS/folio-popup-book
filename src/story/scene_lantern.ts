// Chapter III: the sky in the lantern. A paper night sea seen as a little theatre: rows of
// cut-paper waves, a lighthouse with a turning beam, a paper boat, a moon on strings, and
// the moon's reflection on the water, which is the way on.
import { LANTERN } from '../assets/scenes/lantern';
import type { Cam, Look, PointLight } from '../engine/frame';
import { deg, v3norm } from '../engine/math';
import { pivotOf, rotate, scale, translate } from './anim';
import type { AnimCtx, SceneDef } from './types';

const LAMP: [number, number, number] = [0.82, 0.68, -0.62];
const boatMeta = LANTERN.parts.find((p) => p.name === 'boat')?.meta.lamp as number[] | undefined;
const BOAT_LAMP: [number, number, number] = boatMeta ? [boatMeta[0], boatMeta[1], boatMeta[2]] : [0.29, 0.07, 0.44];
const PORTAL_GLOW: [number, number, number] = [-0.2, 0.15, 0.28];

export const LANTERN_LOOK: Look = {
  lightDir: v3norm([-0.3, 0.75, 0.32]),
  lightCol: [0.36, 0.44, 0.78],
  translucency: 0.8,
  shadowSoft: 2.0,
  shadowCenter: [0, 0.55, -0.3],
  shadowHalf: [2.2, 1.6, 3.0],
  ambTop: [0.13, 0.14, 0.3],
  ambBot: [0.07, 0.08, 0.17],
  fog: [0.09, 0.1, 0.22, 0.09],
  bgKind: 1,
  bgA: '#121640',
  bgB: '#3a3c84',
  bgC: '#ffcf86',
  exposure: 1.18,
  saturation: 1.06,
  vignette: 0.48,
  grain: 0.02,
  fiber: 1,
  wind: 1,
  bloom: 0.9,
  tint: [1.0, 0.99, 1.03],
  particleKind: 0,
  particleCount: 130,
  particleCenter: [0, 0.4, -0.2],
  particleHalf: [1.5, 0.35, 0.9],
  particleSize: 0.008,
  sky: [0, 1.0, 0, 0],
  pool: 0,
};

const POINTS: PointLight[] = [
  // The lighthouse lamp.
  { pos: LAMP, radius: 0.5, col: [2.4, 1.45, 0.6] },
  // Where the beam sweeps (moved every frame).
  { pos: [LAMP[0] - 0.4, LAMP[1] - 0.1, LAMP[2] + 0.3], radius: 0.3, col: [1.2, 0.85, 0.42] },
  // The boat's lantern.
  { pos: BOAT_LAMP, radius: 0.15, col: [1.8, 1.0, 0.42] },
  // The moon's reflection lights the calm water around it.
  { pos: PORTAL_GLOW, radius: 0.16, col: [1.0, 0.92, 0.62] },
];

const CAM: Cam = {
  pos: [0, 0.82, 2.55],
  target: [0, 0.3, -0.3],
  up: [0, 1, 0],
  fov: deg(33),
  shiftX: 0,
  shiftY: 0,
  near: 0.02,
  far: 30,
};

// Arriving out of the lantern flame: high in the paper sky, close to the moon, then the
// camera settles back and down to the whole stage.
const ENTRY: Cam = { ...CAM, pos: [-0.15, 1.25, 1.15], target: [-0.25, 0.72, -0.9], fov: deg(36) };

// Pendulums: part, amplitude (rad), speed, phase.
const HANGING: [string, number, number, number][] = [
  ['moon', 0.012, 0.5, 0.0],
  ['cloud0', 0.016, 0.42, 1.1],
  ['cloud1', 0.014, 0.37, 2.3],
  ['cloud2', 0.016, 0.45, 3.9],
  ['cloud3', 0.012, 0.33, 0.7],
  ['cloud4', 0.012, 0.4, 5.1],
  ['star0', 0.03, 0.8, 0.3],
  ['star1', 0.028, 0.7, 1.9],
  ['star2', 0.03, 0.9, 2.8],
  ['star3', 0.026, 0.75, 4.1],
  ['star4', 0.03, 0.85, 5.3],
  ['star5', 0.026, 0.65, 0.9],
  ['star6', 0.028, 0.95, 3.3],
  ['star7', 0.026, 0.8, 4.7],
  ['gull0', 0.05, 0.9, 0.4],
  ['gull1', 0.05, 1.1, 2.0],
];

// Per fish: scale, period, phase, direction, hop length, peak height, airtime.
const FISH: number[][] = LANTERN.parts
  .filter((p) => /^fish\d+$/.test(p.name))
  .map((p, i) => {
    const sc = ((p.meta.fish as number[] | undefined) ?? [0, 0, 1])[2];
    return [sc, 4.2 + (i % 3) * 1.1 + i * 0.07, i * 1.37 + 0.4, i % 2 === 0 ? 1 : -1, 0.2 + 0.09 * sc, 0.12 + 0.07 * sc, 0.85 + 0.2 * sc];
  });

function animateLantern(ctx: AnimCtx) {
  'worklet';
  const t = ctx.t;
  // Rows of waves slide past each other like a theatre sea.
  for (let i = 0; i < 10; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const amp = 0.032 - i * 0.0015;
    translate(ctx, 'wave' + i, dir * amp * Math.sin(t * 0.42 + i * 1.7), 0.005 * Math.sin(t * 0.9 + i * 0.8), 0);
  }
  // The boat rocks on its keel and bobs.
  const bp = pivotOf(ctx, 'boat');
  rotate(ctx, 'boat', bp, [0, 0, 1], 0.08 * Math.sin(t * 1.1));
  rotate(ctx, 'boat', bp, [1, 0, 0], 0.045 * Math.sin(t * 0.8 + 1.0));
  const bx = 0.018 * Math.sin(t * 0.42 + 2 * 1.7);
  const by = 0.008 * Math.sin(t * 1.1 + 0.6);
  translate(ctx, 'boat', bx, by, 0);
  const bl = ctx.points[2];
  if (bl) {
    bl.pos[0] = BOAT_LAMP[0] + bx - 0.07 * 0.08 * Math.sin(t * 1.1);
    bl.pos[1] = BOAT_LAMP[1] + by;
    bl.pos[2] = BOAT_LAMP[2];
  }
  // The beam turns; a warm light travels with the half facing the audience.
  const a = t * 0.5;
  rotate(ctx, 'beam', LAMP, [0, 1, 0], a);
  let dx = Math.cos(a);
  let dz = -Math.sin(a);
  if (dz < 0) {
    dx = -dx;
    dz = -dz;
  }
  const sw = ctx.points[1];
  if (sw) {
    sw.pos[0] = LAMP[0] + dx * 0.5;
    sw.pos[1] = LAMP[1] - 0.12;
    sw.pos[2] = LAMP[2] + dz * 0.5;
  }
  const lamp = ctx.points[0];
  if (lamp) {
    const fl = 0.94 + 0.06 * Math.sin(t * 6.3) * Math.sin(t * 2.7);
    lamp.col[0] = 2.4 * fl;
    lamp.col[1] = 1.45 * fl;
    lamp.col[2] = 0.6 * fl;
  }
  // The far boats ride the swell too.
  for (let i = 0; i < 4; i++) {
    const n = 'boat_far' + i;
    const pv = pivotOf(ctx, n);
    rotate(ctx, n, pv, [0, 0, 1], 0.07 * Math.sin(t * (0.9 + i * 0.13) + i * 2.0));
    translate(ctx, n, 0, 0.006 * Math.sin(t * 1.0 + i * 1.3), 0);
  }
  // Fish leap out of the sea between the rows of waves, each on its own rhythm.
  for (let i = 0; i < FISH.length; i++) {
    const [sc, period, off, dir, hop, h, dur] = FISH[i];
    const name = 'fish' + i;
    const sp = 'splash' + i;
    const pv = pivotOf(ctx, name);
    const tl = (t + off) % period;
    const u = tl / dur;
    if (u <= 1) {
      const lift = h + 0.06;
      const vy = lift * 4 * (1 - 2 * u);
      if (dir < 0) scale(ctx, name, pv, -1, 1, 1);
      // Nose follows the arc, with a little flick of the tail.
      rotate(ctx, name, pv, [0, 0, 1], dir * Math.atan2(vy, hop) + 0.12 * Math.sin(u * 18));
      translate(ctx, name, dir * hop * u, lift * 4 * u * (1 - u), 0);
    } else {
      scale(ctx, name, pv, 0.001, 0.001, 0.001);
    }
    // Splash where the fish leaves the water and where it dives back in.
    const landing = tl - dur;
    const age = landing >= 0 && landing < 0.65 ? landing : tl < 0.65 ? tl : -1;
    const spv = pivotOf(ctx, sp);
    if (age >= 0) {
      const k = age / 0.65;
      const grow = (0.45 + 0.75 * Math.sin(Math.min(k * 1.6, 1) * Math.PI * 0.5)) * (1 - k * k);
      scale(ctx, sp, spv, grow, grow * (0.8 + 0.6 * Math.sin(Math.PI * k)), grow);
      translate(ctx, sp, landing >= 0 && landing < 0.65 ? dir * hop : 0, 0.03 * sc * Math.sin(Math.PI * k), 0);
    } else {
      scale(ctx, sp, spv, 0.001, 0.001, 0.001);
    }
  }
  // Hanging things swing gently on their strings.
  for (let i = 0; i < HANGING.length; i++) {
    const h = HANGING[i];
    const p = pivotOf(ctx, h[0]);
    rotate(ctx, h[0], p, [0, 0, 1], h[1] * Math.sin(t * h[2] + h[3]));
    rotate(ctx, h[0], p, [1, 0, 0], h[1] * 0.5 * Math.sin(t * h[2] * 0.8 + h[3] * 1.3));
  }
}

export const LANTERN_SCENE: SceneDef = {
  name: 'lantern',
  asset: LANTERN,
  look: LANTERN_LOOK,
  points: POINTS,
  cam: CAM,
  entry: ENTRY,
  portalPart: 'portal',
  chapter: {
    numeral: 'III',
    title: 'The Sky in the Lantern',
    body: 'And there was. A small paper sky, a calm paper sea, and a lighthouse that keeps one light burning for anyone who is lost.',
    hint: "Pinch into the moon's reflection",
  },
  animate: animateLantern,
};
