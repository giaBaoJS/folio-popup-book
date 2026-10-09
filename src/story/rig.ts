// Pop-up mechanics: the book's left half swings over the gutter, the spine wraps around
// the hinge, and every pop-up piece stands up on its hinge with a papery overshoot.
import type { SceneAsset } from '../assets/types';
import { clamp, hash, hingeMatrix, identity, mulAt, smoothstep } from '../engine/math';

// A page spans z = -PAGE_Z..PAGE_Z (back edge to front edge).
const PAGE_Z = 0.68;

export type Rig = {
  n: number;
  pivot: Float32Array; // xyz per part
  axis: Float32Array;
  role: Int8Array; // 0 static, 1 right page, 2 left page, 3 spine, 4 pop, 5 actor
  parent: Int16Array; // part index of the parent, or -1
  order: Float32Array;
  lie: Float32Array;
  flat: Float32Array; // scale of a piece's height while it lies flat
  k: Float32Array; // spine strip index (role 3)
  rise: Float32Array; // spring state 0..1(+overshoot)
  vel: Float32Array;
  crossed: Uint8Array; // which pieces have played their pop sound
  hb: number; // hinge height
};

export function makeRig(a: SceneAsset): Rig {
  const n = a.parts.length;
  const rig: Rig = {
    n,
    pivot: new Float32Array(n * 3),
    axis: new Float32Array(n * 3),
    role: new Int8Array(n),
    parent: new Int16Array(n).fill(-1),
    order: new Float32Array(n),
    lie: new Float32Array(n),
    flat: new Float32Array(n).fill(1),
    k: new Float32Array(n),
    rise: new Float32Array(n),
    vel: new Float32Array(n),
    crossed: new Uint8Array(n),
    hb: 0.094,
  };
  const index: Record<string, number> = {};
  a.parts.forEach((p, i) => (index[p.name] = i));
  a.parts.forEach((p, i) => {
    rig.pivot.set(p.pivot, i * 3);
    rig.axis.set(p.axis, i * 3);
    const m = p.meta;
    const role = m.role ?? 'static';
    if (role === 'page') {
      rig.role[i] = (m.side ?? 1) > 0 ? 1 : 2;
      rig.hb = p.pivot[1];
    } else if (role === 'spine') {
      rig.role[i] = 3;
      rig.k[i] = ((m.k ?? 0) + 0.5) / (m.n ?? 10);
      rig.lie[i] = 1 / (m.n ?? 10); // spine strips reuse `lie` for their arc fraction
    } else if (role === 'pop') {
      rig.role[i] = 4;
      rig.order[i] = m.order ?? 0;
      rig.lie[i] = m.lie ?? -1;
      const parentName = m.parent ?? 'right';
      // A parent name may be a suffix of the page part's name: match on the ending.
      let pi = index[parentName];
      if (pi === undefined) {
        for (const key of Object.keys(index)) if (key.endsWith(parentName)) pi = index[key];
      }
      rig.parent[i] = pi ?? -1;
      // How far the piece reaches above its hinge vs. the room on the page in the
      // direction it lies down.
      const height = Math.max(0.001, (m.hi?.[1] ?? p.pivot[1] + 0.1) - p.pivot[1]);
      const room = (m.lie ?? -1) < 0 ? p.pivot[2] + PAGE_Z : PAGE_Z - p.pivot[2];
      rig.flat[i] = clamp((room - 0.02) / height, 0.12, 1);
    } else if (role === 'actor') {
      rig.role[i] = 5;
    }
  });
  return rig;
}

// Squashes a piece about its hinge: height (y) and depth (z), so a folded piece lies
// thin on the page instead of standing on its side.
function squash(o: Float32Array, pivot: ArrayLike<number>, sy: number, sz: number, sx: number, off: number) {
  'worklet';
  identity(o, off);
  o[off + 0] = sx;
  o[off + 5] = sy;
  o[off + 10] = sz;
  o[off + 12] = pivot[0] * (1 - sx);
  o[off + 13] = pivot[1] * (1 - sy);
  o[off + 14] = pivot[2] * (1 - sz);
}

// Target stand-up amount for a piece given how open the book is (0 closed, 1 flat).
function riseTarget(order: number, open: number) {
  'worklet';
  const start = 0.5 + order * 0.42;
  return smoothstep(start, start + 0.16, open);
}

// Advances the pop-up springs (substepped at 240 Hz) and queues a pop sound for each
// piece that snaps upright.
export function stepRig(rig: Rig, open: number, dt: number, sounds: number[]) {
  'worklet';
  const w = 15;
  const z = 0.38;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < rig.n; i++) {
    if (rig.role[i] !== 4) continue;
    const target = riseTarget(rig.order[i], open);
    let x = rig.rise[i];
    let v = rig.vel[i];
    for (let s = 0; s < steps; s++) {
      const a = -w * w * (x - target) - 2 * z * w * v;
      v += a * h;
      x += v * h;
    }
    rig.rise[i] = x;
    rig.vel[i] = v;
    if (x > 0.62 && !rig.crossed[i]) {
      rig.crossed[i] = 1;
      sounds.push(1); // Cue.Pop
    } else if (x < 0.25 && rig.crossed[i]) {
      rig.crossed[i] = 0;
    }
  }
}

export function settleRig(rig: Rig, open: number) {
  'worklet';
  for (let i = 0; i < rig.n; i++) {
    if (rig.role[i] !== 4) continue;
    rig.rise[i] = riseTarget(rig.order[i], open);
    rig.vel[i] = 0;
    rig.crossed[i] = rig.rise[i] > 0.62 ? 1 : 0;
  }
}

// Writes one matrix per part into xf (16 floats each) starting at slot `base`.
export function poseRig(rig: Rig, xf: Float32Array, base: number, open: number, tmp: Float32Array) {
  'worklet';
  const phi = Math.PI * (1 - clamp(open, 0, 1));
  const hb = rig.hb;
  // Pass 1: pages and statics (pieces need their parent's matrix).
  for (let i = 0; i < rig.n; i++) {
    const off = (base + i) * 16;
    const role = rig.role[i];
    if (role === 2) {
      hingeMatrix(xf, [0, hb, 0], [0, 0, 1], -phi, off);
    } else if (role === 3) {
      // Spine strip on the arc between the boards.
      const m = rig.k[i];
      const th = -phi * m;
      const len = hb * phi * rig.lie[i] + 1e-4;
      const c = Math.cos(th);
      const s = Math.sin(th);
      // Arc point: pivot + R(th) * (0, -hb).
      const px = hb * s;
      const py = hb - hb * c;
      identity(xf, off);
      xf[off + 0] = c * len * 1.25;
      xf[off + 1] = s * len * 1.25;
      xf[off + 4] = -s;
      xf[off + 5] = c;
      xf[off + 12] = px;
      xf[off + 13] = py;
    } else if (role !== 4) {
      identity(xf, off);
    }
  }
  // Pass 2: pop-up pieces.
  for (let i = 0; i < rig.n; i++) {
    if (rig.role[i] !== 4) continue;
    const off = (base + i) * 16;
    const r = rig.rise[i];
    const piv = [rig.pivot[i * 3], rig.pivot[i * 3 + 1], rig.pivot[i * 3 + 2]];
    const ax = [rig.axis[i * 3], rig.axis[i * 3 + 1], rig.axis[i * 3 + 2]];
    const angle = rig.lie[i] * (Math.PI / 2) * (1 - r);
    const up = smoothstep(0.0, 0.85, r);
    const sy = rig.flat[i] + (1 - rig.flat[i]) * up;
    const sz = 0.18 + 0.82 * up;
    // Fully folded under a nearly closed cover: collapse so nothing pokes through.
    const vis = smoothstep(0.03, 0.12, open);
    const shrink = 0.001 + 0.999 * vis;
    squash(tmp, piv, sy * shrink, sz * shrink, shrink, 0);
    hingeMatrix(tmp, piv, ax, angle, 16);
    mulAt(tmp, 32, tmp, 16, tmp, 0);
    const p = rig.parent[i];
    if (p >= 0 && rig.role[p] === 2) {
      mulAt(xf, off, xf, (base + p) * 16, tmp, 32);
    } else {
      for (let k = 0; k < 16; k++) xf[off + k] = tmp[32 + k];
    }
  }
}

// Slot info for wind sway: pivot height, amplitude, phase.
export function slotInfo(a: SceneAsset): Float32Array {
  const out = new Float32Array(a.parts.length * 4);
  a.parts.forEach((p, i) => {
    out[i * 4] = p.pivot[1];
    out[i * 4 + 1] = (p.meta.sway as number | undefined) ?? 0;
    out[i * 4 + 2] = hash(i + 1) * 6.283;
  });
  return out;
}
