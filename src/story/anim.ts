// Worklet helpers for posing actor parts from a scene's `animate`. Each one applies its
// transform after whatever the slot already holds, so calls compose in order.
import { hingeMatrix, mulAt } from '../engine/math';
import type { AnimCtx } from './types';

function slotOff(ctx: AnimCtx, part: string) {
  'worklet';
  const i = ctx.idx[part];
  if (i === undefined) return -1;
  return (ctx.base + i) * 16;
}

export function pivotOf(ctx: AnimCtx, part: string): [number, number, number] {
  'worklet';
  const i = ctx.idx[part] ?? 0;
  return [ctx.pivots[i * 3], ctx.pivots[i * 3 + 1], ctx.pivots[i * 3 + 2]];
}

// Pre-multiplies the slot matrix by the matrix at ctx.tmp[16..32] (applied after what is
// already there). Uses ctx.tmp[32..48] as scratch; nothing is allocated per frame.
function premulTmp(ctx: AnimCtx, off: number) {
  'worklet';
  const t = ctx.tmp;
  for (let k = 0; k < 16; k++) t[32 + k] = ctx.xf[off + k];
  mulAt(ctx.xf, off, t, 16, t, 32);
}

// Rotate a part about an axis through a point (radians), after its current transform.
export function rotate(ctx: AnimCtx, part: string, pivot: ArrayLike<number>, axis: ArrayLike<number>, angle: number) {
  'worklet';
  const off = slotOff(ctx, part);
  if (off < 0) return;
  hingeMatrix(ctx.tmp, pivot, axis, angle, 16);
  premulTmp(ctx, off);
}

// Translate a part, after its current transform.
export function translate(ctx: AnimCtx, part: string, dx: number, dy: number, dz: number) {
  'worklet';
  const off = slotOff(ctx, part);
  if (off < 0) return;
  ctx.xf[off + 12] += dx;
  ctx.xf[off + 13] += dy;
  ctx.xf[off + 14] += dz;
}

// Uniform/axis scale about a point, after its current transform.
export function scale(ctx: AnimCtx, part: string, pivot: ArrayLike<number>, sx: number, sy: number, sz: number) {
  'worklet';
  const off = slotOff(ctx, part);
  if (off < 0) return;
  const t = ctx.tmp;
  for (let k = 16; k < 32; k++) t[k] = 0;
  t[16] = sx;
  t[21] = sy;
  t[26] = sz;
  t[28] = pivot[0] * (1 - sx);
  t[29] = pivot[1] * (1 - sy);
  t[30] = pivot[2] * (1 - sz);
  t[31] = 1;
  premulTmp(ctx, off);
}

// Copy one part's matrix to another (e.g. a child that follows its parent), then apply
// the child's own motion afterwards with the helpers above.
export function follow(ctx: AnimCtx, child: string, parent: string) {
  'worklet';
  const a = slotOff(ctx, child);
  const b = slotOff(ctx, parent);
  if (a < 0 || b < 0) return;
  for (let k = 0; k < 16; k++) ctx.xf[a + k] = ctx.xf[b + k];
}

// Applies a part's own matrix after another part's (child = parent * child).
export function attach(ctx: AnimCtx, child: string, parent: string) {
  'worklet';
  const a = slotOff(ctx, child);
  const b = slotOff(ctx, parent);
  if (a < 0 || b < 0) return;
  const t = ctx.tmp;
  for (let k = 0; k < 16; k++) t[32 + k] = ctx.xf[a + k];
  for (let k = 0; k < 16; k++) t[16 + k] = ctx.xf[b + k];
  mulAt(ctx.xf, a, t, 16, t, 32);
}
