// The story director. Runs on the Reanimated UI runtime (and in tools/headless.ts):
// the fold and the book, the dive through each scene's portal into the next, the camera,
// and every per-frame uniform. All functions are worklets; helpers come before callers.
import type { Cam, PointLight } from '../engine/frame';
import { cameraMatrix, newFrame, writeFrame, writePost } from '../engine/frame';
import type { V3 } from '../engine/math';
import { clamp, easeInOut, easeOut, hingeMatrix, identity, mix, project, smoothstep, transformDir, transformPoint, v3add, v3cross, v3len, v3mix, v3norm, v3scale, v3sub } from '../engine/math';
import type { RenderState } from '../engine/render';
import { SLOTS } from '../engine/shaders';
import type { Rig } from '../story/rig';
import { poseRig, settleRig, stepRig } from '../story/rig';
import type { SceneDef } from '../story/types';

// Sound cues pushed to `World.sounds`. src/audio.ts maps them to files; rig.ts and
// showreel.ts push the raw numbers (Pop = 1, BookOpen = 2).
export const enum Cue {
  Pop = 1,
  BookOpen = 2,
  Dive = 3,
  Arrive = 4,
  Tap = 5,
  BookClose = 6,
  Back = 7,
}

export type Transition = {
  on: boolean;
  from: number; // outer scene (its portal is the way in)
  to: number; // inner scene
  p: number; // 0 = at the outer scene, 1 = arrived in the inner scene
  dragging: boolean;
  auto: boolean; // easing towards `target` on its own
  target: number;
  t: number; // time since the auto move started
  p0: number; // p when the auto move started
  dur: number;
  kEnd: number; // how settled the inner camera is when p reaches 1
  forward: boolean; // started at the outer scene (diving in); false = started inside, going back
  grab: number; // p when the current pinch grabbed the transition
};

export type World = {
  W: number; // points
  H: number;
  scale: number; // render pixels per point
  time: number;
  scenes: SceneDef[];
  idx: Record<string, number>[]; // per scene: part name -> part index
  pivots: Float32Array[]; // per scene: xyz hinge point per part
  rig: Rig | null; // the book (scene 0)
  rs: RenderState;
  // Fold and book.
  hingeAvail: boolean;
  hingeAngle: number; // radians, 0 closed .. π flat
  manualOpen: boolean; // opened by a tap (no hinge), or forced open by a flag/tool
  book: number; // 0 closed .. 1 open
  bookVel: number;
  wasCover: boolean; // last frame was on the cover display (folded)
  openT: number; // seconds since the book finished opening (0 while closed)
  // Story.
  level: number; // index of the scene on screen
  loops: number; // times the story has come back round to the book
  arrive: number; // 0..1 settle of the camera after arriving
  kArrive: number; // camera blend at arrival (0.6 after a dive)
  sceneT: number; // time since the current scene became current
  tr: Transition;
  orbit: { yaw: number; pitch: number; vy: number; vp: number; dragging: boolean };
  // Results for the overlay and hit tests.
  portalScreen: [number, number, number]; // x, y, radius in points (radius 0 = offscreen)
  cover: number; // 0..1 how much the cover UI should show
  chapterA: number; // 0..1 chapter UI visibility
  cardOpen: number; // 0 = collapsed to its title, 1 = full card
  cardWant: number; // -1 auto (open on arrival, folds away after a while), 0 closed, 1 open
  cardRight: number; // -1 undecided; else 0/1: which corner the card took for this scene (away from the portal)
  sounds: number[]; // Cue codes queued this frame, drained by the frame loop
  haptics: number[]; // 1 light, 2 medium, other = selection tick
  slotScene: number[]; // which scene's slot info is in GPU instance k
  slotInfo: Float32Array[]; // per scene
  postB: Float32Array; // the inner scene's grade, blended in as the portal fills the screen
  scratch: Float32Array; // reused matrices for the rig, actors and orbit (no per-frame allocation)
};

const PI = Math.PI;
// How far the inner camera has eased from its entry pose towards rest when a dive lands.
const INNER_ARRIVE = 0.6;
// How much of the next scene shows through a portal at rest (the rest is its warm glow).
const PEEK = 0.88;

export function createWorld(scenes: SceneDef[], rig: Rig | null, slotInfo: Float32Array[]): World {
  'worklet';
  return {
    W: 951,
    H: 669,
    scale: 2,
    time: 0,
    scenes,
    idx: scenes.map((s) => {
      const m: Record<string, number> = {};
      s.asset.parts.forEach((p, i) => (m[p.name] = i));
      return m;
    }),
    pivots: scenes.map((s) => {
      const a = new Float32Array(s.asset.parts.length * 3);
      s.asset.parts.forEach((p, i) => a.set(p.pivot, i * 3));
      return a;
    }),
    rig,
    rs: {
      bundle: null,
      targets: null,
      outIndex: 0,
      scene: ['woods', null],
      frames: [newFrame(), newFrame()],
      particles: [0, 0],
      xf: new Float32Array(SLOTS * 16),
      post: new Float32Array(16),
    },
    hingeAvail: false,
    hingeAngle: 0,
    manualOpen: false,
    book: 0,
    bookVel: 0,
    wasCover: true,
    openT: 0,
    level: 0,
    loops: 0,
    arrive: 1,
    kArrive: 1,
    sceneT: 0,
    tr: { on: false, from: 0, to: 1, p: 0, dragging: false, auto: false, target: 0, t: 0, p0: 0, dur: 1.8, kEnd: INNER_ARRIVE, forward: true, grab: 0 },
    orbit: { yaw: 0, pitch: 0, vy: 0, vp: 0, dragging: false },
    portalScreen: [0, 0, 0],
    cover: 1,
    chapterA: 0,
    cardOpen: 1,
    cardWant: -1,
    cardRight: -1,
    sounds: [],
    haptics: [],
    slotScene: [-1, -1],
    slotInfo,
    postB: new Float32Array(16),
    scratch: new Float32Array(128),
  };
}

// ---------------------------------------------------------------- cameras

function lerpCam(a: Cam, b: Cam, t: number): Cam {
  'worklet';
  return {
    pos: v3mix(a.pos, b.pos, t),
    target: v3mix(a.target, b.target, t),
    up: v3norm(v3mix(a.up, b.up, t)),
    fov: mix(a.fov, b.fov, t),
    shiftX: mix(a.shiftX, b.shiftX, t),
    shiftY: mix(a.shiftY, b.shiftY, t),
    near: Math.min(a.near, b.near),
    far: Math.max(a.far, b.far),
  };
}

// Pulls a camera back when the screen is narrower than the 1.42 the scenes were framed for.
function fitCam(c: Cam, aspect: number): Cam {
  'worklet';
  const ref = 1.42;
  if (aspect >= ref) return c;
  const k = Math.pow(ref / aspect, 0.92);
  const d = v3sub(c.pos, c.target);
  return { ...c, pos: v3add(c.target, v3scale(d, k)) };
}

// The closed book from above. On a portrait screen (the Duo's cover display) the cover fills
// the whole screen, seen straight on through a long lens, so the phone itself is the book.
// On a landscape screen it lies on the table, waiting to open.
function coverCam(aspect: number, hb: number): Cam {
  'worklet';
  if (aspect < 1) {
    const fov = (18 * PI) / 180;
    const t = Math.tan(fov / 2);
    const halfH = Math.min(0.705, 0.515 / aspect);
    const d = halfH / t;
    const c: V3 = [0.525, hb * 2, 0];
    return { pos: [c[0], c[1] + d, c[2] + 0.001], target: c, up: [0, 0, -1], fov, shiftX: 0, shiftY: 0, near: 0.05, far: 40 };
  }
  const fov = (34 * PI) / 180;
  const t = Math.tan(fov / 2);
  const halfH = 0.86;
  const halfW = 0.7;
  const d = Math.max(halfH / t, halfW / (t * aspect)) * 1.06;
  const tilt = (12 * PI) / 180;
  const c: V3 = [0.48, hb * 2, 0.04];
  return {
    pos: [c[0], c[1] + d * Math.cos(tilt), c[2] + d * Math.sin(tilt)],
    target: c,
    up: [0, 0, -1],
    fov,
    shiftX: 0,
    shiftY: 0,
    near: 0.02,
    far: 30,
  };
}

function orbitCam(c: Cam, yaw: number, pitch: number, m: Float32Array): Cam {
  'worklet';
  if (Math.abs(yaw) < 1e-5 && Math.abs(pitch) < 1e-5) return c;
  const d = v3sub(c.pos, c.target);
  hingeMatrix(m, [0, 0, 0], [0, 1, 0], yaw, 0);
  let r = transformDir(m, d);
  const side = v3norm([r[2], 0, -r[0]]);
  hingeMatrix(m, [0, 0, 0], side, pitch, 0);
  r = transformDir(m, r);
  return { ...c, pos: v3add(c.target, r) };
}

// World-space portal of a scene (its part's meta.portal moved by that part's matrix).
function portalOf(w: World, s: number, base: number): { c: V3; n: V3; r: number } {
  'worklet';
  const def = w.scenes[s];
  const i = w.idx[s][def.portalPart] ?? 0;
  const meta = def.asset.parts[i]?.meta.portal;
  if (!meta) return { c: [0, 0, 0], n: [0, 0, 1], r: 0.05 };
  const off = (base + i) * 16;
  const c = transformPoint(w.rs.xf, meta.center, off);
  const n = v3norm(transformDir(w.rs.xf, meta.normal, off));
  return { c, n, r: meta.radius };
}

// Camera of scene s at rest (with arrival blend k: 0 = entry pose, 1 = rest).
function restCam(w: World, s: number, k: number): Cam {
  'worklet';
  const aspect = w.W / w.H;
  const def = w.scenes[s];
  const rest = fitCam(def.cam, aspect);
  const entry = fitCam(def.entry, aspect);
  if (s === 0) {
    // The book: cover view while closed, reading view once open.
    const cover = coverCam(aspect, w.rig ? w.rig.hb : 0.094);
    const e = easeInOut(smoothstep(0.02, 0.97, w.book));
    const book = lerpCam(cover, rest, e);
    return k >= 1 ? book : lerpCam(entry, book, easeInOut(k));
  }
  return lerpCam(entry, rest, easeInOut(k));
}

// The dive: from the outer scene's camera into its portal.
function diveCam(from: Cam, portal: { c: V3; n: V3; r: number }, aspect: number, p: number): Cam {
  'worklet';
  const e = easeInOut(p);
  const t = Math.tan(from.fov / 2);
  // Close enough that the portal disc covers the whole screen.
  const dEnd = (portal.r / (t * Math.sqrt(1 + aspect * aspect))) * 0.82;
  const end = v3add(portal.c, v3scale(portal.n, dEnd));
  const mid = v3add(portal.c, v3scale(portal.n, Math.max(dEnd * 6, v3len(v3sub(from.pos, portal.c)) * 0.42)));
  // Quadratic bezier from -> mid -> end.
  const a = v3mix(from.pos, mid, e);
  const b = v3mix(mid, end, e);
  const pos = v3mix(a, b, e);
  const target = v3mix(from.target, portal.c, smoothstep(0.0, 0.6, p));
  return {
    pos,
    target,
    up: v3norm(v3mix(from.up, [0, 1, 0], smoothstep(0, 0.5, p))),
    fov: from.fov,
    shiftX: from.shiftX * (1 - e),
    shiftY: from.shiftY * (1 - e),
    near: Math.min(from.near, dEnd * 0.25),
    far: from.far,
  };
}

// ---------------------------------------------------------------- input

function canDive(w: World) {
  'worklet';
  return w.book > 0.95 && w.W > w.H * 0.6;
}

function newTransition(w: World, forward: boolean): Transition {
  'worklet';
  const n = w.scenes.length;
  if (forward) {
    return { on: true, from: w.level, to: (w.level + 1) % n, p: 0, dragging: false, auto: false, target: 0, t: 0, p0: 0, dur: 1.8, kEnd: INNER_ARRIVE, forward: true, grab: 0 };
  }
  // Going back: the current scene becomes the inner one, seen from where its camera is now.
  const k = w.kArrive + (1 - w.kArrive) * smoothstep(0, 1, w.arrive);
  return { on: true, from: w.level - 1, to: w.level, p: 1, dragging: false, auto: false, target: 1, t: 0, p0: 1, dur: 1.4, kEnd: k, forward: false, grab: 1 };
}

export function beginPinch(w: World, inward: boolean) {
  'worklet';
  if (!w.tr.on) {
    if (!canDive(w)) return;
    if (inward) w.tr = newTransition(w, true);
    else if (w.level > 0) w.tr = newTransition(w, false);
    else return;
  }
  // Grab the transition where it is, whichever way it was going.
  w.tr.dragging = true;
  w.tr.auto = false;
  w.tr.grab = w.tr.p;
}

// scale = pinch scale since the gesture started; spreading the fingers moves p towards 1.
export function movePinch(w: World, scale: number) {
  'worklet';
  if (!w.tr.on || !w.tr.dragging) return;
  const s = Math.max(scale, 0.01);
  w.tr.p = clamp(w.tr.grab + Math.log(s) / Math.log(3.2), 0.001, 0.999);
}

function autoTo(w: World, goal: number) {
  'worklet';
  const tr = w.tr;
  tr.auto = true;
  tr.target = goal;
  tr.t = 0;
  tr.p0 = tr.p;
  const span = Math.abs(goal - tr.p);
  tr.dur = goal === 1 ? 0.5 + 1.5 * span : 0.35 + 1.1 * span;
  // Sound only when the story actually moves: diving into a new scene, or backing out.
  if (goal === 1 && tr.forward) w.sounds.push(Cue.Dive);
  else if (goal === 0 && !tr.forward) w.sounds.push(Cue.Back);
}

export function endPinch(w: World, velocity: number) {
  'worklet';
  if (!w.tr.on || !w.tr.dragging) return;
  w.tr.dragging = false;
  const threshold = w.tr.forward ? 0.3 : 0.7;
  const goal = velocity > 0.9 ? 1 : velocity < -0.9 ? 0 : w.tr.p > threshold ? 1 : 0;
  autoTo(w, goal);
}

export function diveIn(w: World) {
  'worklet';
  if (w.tr.on || !canDive(w)) return;
  w.tr = newTransition(w, true);
  autoTo(w, 1);
  w.haptics.push(1);
}

// Tap: on the portal it dives in; on the cover it opens the book.
export function tapAt(w: World, x: number, y: number) {
  'worklet';
  if (w.book < 0.5 && !w.manualOpen) {
    w.manualOpen = true;
    w.sounds.push(Cue.BookOpen);
    w.haptics.push(1);
    return;
  }
  if (w.tr.on || !canDive(w)) return;
  const [px, py, pr] = w.portalScreen;
  if (pr > 0 && Math.hypot(x - px, y - py) < Math.max(pr * 2.2, 44)) diveIn(w);
}

export function goBack(w: World) {
  'worklet';
  if (w.tr.on || w.level === 0 || !canDive(w)) return;
  w.tr = newTransition(w, false);
  autoTo(w, 0);
}

export function orbitBy(w: World, dx: number, dy: number) {
  'worklet';
  w.orbit.dragging = true;
  w.orbit.yaw = clamp(w.orbit.yaw - dx * 0.0016, -0.32, 0.32);
  w.orbit.pitch = clamp(w.orbit.pitch + dy * 0.0012, -0.14, 0.12);
}

export function orbitEnd(w: World) {
  'worklet';
  w.orbit.dragging = false;
}

// ---------------------------------------------------------------- step

function stepBook(w: World, dt: number) {
  'worklet';
  // Folded = the cover display is showing. With a hinge, a portrait window on an open
  // phone is just a rotated phone, not a folded one.
  const coverMode = w.hingeAvail ? w.W < w.H && w.hingeAngle < 2.4 : w.W < w.H;
  if (!coverMode && w.wasCover && w.hingeAvail) {
    // Unfolded: from now on the book follows the hinge again.
    w.manualOpen = false;
    w.sceneT = 0;
  }
  if (coverMode && !w.wasCover) {
    // The phone was folded: the book closes and the story starts over.
    w.manualOpen = false;
    w.tr.on = false;
    if (w.level !== 0) {
      w.level = 0;
      w.arrive = 1;
      w.kArrive = 1;
    }
    w.sounds.push(Cue.BookClose);
  }
  w.wasCover = coverMode;
  let target = 0;
  if (w.manualOpen) target = 1;
  else if (w.hingeAvail && !coverMode) target = smoothstep(0.12, 2.95, w.hingeAngle);
  else if (!w.hingeAvail && !coverMode) target = 1;
  if (w.level !== 0 || w.tr.on) target = 1;
  // Critically damped follow, so a hinge that jumps still animates.
  const om = 4.2;
  const a = -om * om * (w.book - target) - 2 * om * w.bookVel;
  w.bookVel += a * dt;
  w.book += w.bookVel * dt;
  if (w.book < 0) {
    w.book = 0;
    w.bookVel = 0;
  }
  if (w.book > 1) {
    w.book = 1;
    w.bookVel = 0;
  }
  w.openT = w.book > 0.98 ? w.openT + dt : 0;
}

function stepTransition(w: World, dt: number) {
  'worklet';
  const tr = w.tr;
  if (!tr.on) return;
  if (tr.auto) {
    tr.t += dt;
    const k = clamp(tr.t / tr.dur, 0, 1);
    const e = tr.target === 1 ? easeInOut(k) : easeOut(k);
    tr.p = tr.p0 + (tr.target - tr.p0) * e;
    if (k >= 1) {
      tr.p = tr.target;
      tr.on = false;
      if (tr.target === 1) {
        w.level = tr.to;
        if (tr.forward) {
          // Arrived inside: the inner scene becomes the scene.
          if (tr.to === 0) w.loops += 1;
          w.arrive = 0;
          w.kArrive = tr.kEnd;
          w.sceneT = 0;
          w.sounds.push(Cue.Arrive);
          w.haptics.push(2);
        }
      } else {
        w.level = tr.from;
        if (!tr.forward) {
          // Backed out into the previous scene.
          w.arrive = 1;
          w.kArrive = 1;
          w.sceneT = 0;
        }
      }
    }
  }
}

function poseInstance(w: World, k: number, s: number) {
  'worklet';
  const def = w.scenes[s];
  const base = k * (SLOTS / 2);
  // Transforms: identity, then the book rig or the scene's actors.
  for (let i = 0; i < def.asset.parts.length; i++) identity(w.rs.xf, (base + i) * 16);
  const points: PointLight[] = def.points.map((p) => ({ pos: [p.pos[0], p.pos[1], p.pos[2]] as V3, radius: p.radius, col: [p.col[0], p.col[1], p.col[2]] as V3 }));
  if (s === 0 && w.rig) poseRig(w.rig, w.rs.xf, base, k === 0 ? w.book : 1, w.scratch);
  if (s === 0 && k === 0 && w.cover > 0.01 && points.length > 0) {
    // A warm lamp drifting over the closed cover so the gold blocking catches the light.
    const t = w.time;
    const hb = w.rig ? w.rig.hb : 0.094;
    points[0] = {
      pos: [0.525 + 0.7 * Math.sin(t * 0.42), hb * 2 + 0.75, 0.5 * Math.cos(t * 0.29)],
      radius: 1.1,
      col: [1.5 * w.cover, 1.05 * w.cover, 0.6 * w.cover],
    };
  }
  if (def.animate) {
    def.animate({ xf: w.rs.xf, base, t: w.time, idx: w.idx[s], pivots: w.pivots[s], points, arrive: k === 0 ? w.arrive : 0, tmp: w.scratch });
  }
  return { points, pt: portalOf(w, s, base) };
}

function frameInstance(
  w: World,
  k: number,
  s: number,
  cam: Cam,
  posed: { points: PointLight[]; pt: { c: V3; n: V3; r: number } },
  portal: { reveal: number; glow: number; pull: number; screen?: [number, number, number]; open?: number },
  particleFade: number,
) {
  'worklet';
  const def = w.scenes[s];
  const base = k * (SLOTS / 2);
  const W = Math.round(w.W * w.scale);
  const H = Math.round(w.H * w.scale);
  const look = def.look;
  const pt = posed.pt;
  const vp = writeFrame(w.rs.frames[k], cam, look, W, H, w.time, posed.points, { reveal: portal.reveal, glow: portal.glow, pull: portal.pull, pos: pt.c, radius: pt.r, normal: pt.n, screen: portal.screen, open: portal.open }, particleFade);
  // No fireflies over a closed cover on the cover display: there the phone is the book.
  const closedCover = s === 0 && k === 0 && w.W < w.H && w.cover > 0.5;
  w.rs.particles[k] = particleFade >= 0.999 || closedCover ? 0 : look.particleCount;
  w.rs.scene[k] = def.name;
  // Slot info (wind sway) for this instance, rewritten when its scene changes.
  if (w.slotScene[k] !== s && w.rs.bundle) {
    w.rs.bundle.device.queue.writeBuffer(w.rs.bundle.slots, base * 16, w.slotInfo[s]);
    w.slotScene[k] = s;
  }
  return vp;
}

export function stepWorld(w: World, dt: number) {
  'worklet';
  w.time += dt;
  w.sceneT += dt;
  stepBook(w, dt);
  w.cover = 1 - smoothstep(0.0, 0.35, w.book);
  if (w.rig) stepRig(w.rig, w.book, dt, w.sounds);
  stepTransition(w, dt);
  if (!w.tr.on && w.arrive < 1) w.arrive = Math.min(1, w.arrive + dt / 1.6);
  // Orbit springs back to centre when released.
  if (!w.orbit.dragging) {
    const om = 6;
    w.orbit.vy += (-om * om * w.orbit.yaw - 2 * om * w.orbit.vy) * dt;
    w.orbit.vp += (-om * om * w.orbit.pitch - 2 * om * w.orbit.vp) * dt;
    w.orbit.yaw += w.orbit.vy * dt;
    w.orbit.pitch += w.orbit.vp * dt;
  }
  const aspect = w.W / w.H;
  const tr = w.tr;
  const outer = tr.on ? tr.from : w.level;
  // Outer camera: rest (+ orbit), or diving into its portal. The arrival settle starts with
  // zero slope so the camera eases out of the swap instead of lurching.
  const settle = w.kArrive + (1 - w.kArrive) * smoothstep(0, 1, w.arrive);
  const kOuter = tr.on ? (tr.from === w.level ? settle : 1) : settle;
  let cam = orbitCam(restCam(w, outer, kOuter), w.orbit.yaw, w.orbit.pitch, w.scratch);
  const p = tr.on ? tr.p : 0;
  // At rest the portal is a window: the next scene shows through it, warmly lit.
  const peek = w.book > 0.9 ? PEEK * smoothstep(0.9, 1.0, w.book) : 0;
  const reveal = Math.max(peek, smoothstep(0.02, 0.45, p));
  const glow = 0.6 + 0.4 * Math.sin(w.time * 2.2);
  // Pose the outer scene first so its portal position is known, then aim the camera.
  const posed = poseInstance(w, 0, outer);
  if (tr.on) cam = diveCam(cam, posed.pt, aspect, p);
  // Particles pulled into the portal fade out before the swap.
  const pfade = smoothstep(0.82, 0.98, p);
  // Where the portal sits on screen this frame, for the shader's miniature mapping.
  const vpPre = cameraMatrix(cam, aspect);
  const pcs = project(vpPre, posed.pt.c, 1, 1);
  const pes = project(vpPre, v3add(posed.pt.c, v3scale(v3norm(v3cross(posed.pt.n, Math.abs(posed.pt.n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), posed.pt.r)), 1, 1);
  const pr = pcs[2] > 0 ? Math.hypot((pes[0] - pcs[0]) * aspect, pes[1] - pcs[1]) : 0.05;
  const open = smoothstep(0.0, 0.85, p);
  const vp = frameInstance(w, 0, outer, cam, posed, { reveal, glow, pull: smoothstep(0.05, 0.9, p), screen: [pcs[0], pcs[1], pr], open }, pfade);
  if (tr.on) {
    const innerCam = orbitCam(restCam(w, tr.to, p * tr.kEnd), w.orbit.yaw, w.orbit.pitch, w.scratch);
    const innerPosed = poseInstance(w, 1, tr.to);
    frameInstance(w, 1, tr.to, innerCam, innerPosed, { reveal: 0, glow: 0, pull: 0 }, 0);
  } else if (peek > 0) {
    // The next scene, seen from where the dive will arrive.
    const next = (w.level + 1) % w.scenes.length;
    const innerPosed = poseInstance(w, 1, next);
    frameInstance(w, 1, next, restCam(w, next, 0), innerPosed, { reveal: 0, glow: 0, pull: 0 }, 0);
  } else {
    w.rs.scene[1] = null;
  }
  // Portal on screen (for the tap target and the hint).
  const W = w.W;
  const H = w.H;
  const pt = posed.pt;
  const pc = project(vp, pt.c, W, H);
  const edge = project(vp, v3add(pt.c, [pt.r, 0, 0]), W, H);
  w.portalScreen = [pc[0], pc[1], pc[2] > 0 ? Math.hypot(edge[0] - pc[0], edge[1] - pc[1]) : 0];
  // Post: blend the grading towards the inner scene as the portal fills the screen.
  const outerLook = w.scenes[outer].look;
  const blur = tr.on ? 0.05 * Math.pow(Math.sin(p * PI), 2) : 0;
  const cx = clamp(pc[0] / W, 0, 1);
  const cy = clamp(pc[1] / H, 0, 1);
  writePost(w.rs.post, outerLook, w.time, blur, cx, cy);
  if (tr.on) {
    writePost(w.postB, w.scenes[tr.to].look, w.time, blur, cx, cy);
    const m = smoothstep(0.7, 1.0, p);
    for (let i = 0; i < 16; i++) w.rs.post[i] = mix(w.rs.post[i], w.postB[i], m);
  }
  // Overlay visibility.
  const settled = !tr.on && w.book > 0.95 ? 1 : 0;
  w.chapterA += (settled - w.chapterA) * Math.min(1, dt * (settled ? 2.5 : 9));
  if (w.sceneT < 0.05) {
    w.cardWant = -1;
    w.cardRight = -1;
  }
  const want = w.cardWant >= 0 ? w.cardWant : w.sceneT < 9 ? 1 : 0;
  w.cardOpen += (want - w.cardOpen) * Math.min(1, dt * 4.5);
}

// Jump straight to a state (launch flags and tools/headless.ts).
export function settleBook(w: World, open: number) {
  'worklet';
  w.book = open;
  w.bookVel = 0;
  w.manualOpen = open > 0.5;
  if (w.rig) settleRig(w.rig, open);
}

export function setTransition(w: World, from: number, p: number) {
  'worklet';
  w.level = from;
  w.tr = { on: true, from, to: (from + 1) % w.scenes.length, p, dragging: true, auto: false, target: 0, t: 0, p0: 0, dur: 1.8, kEnd: INNER_ARRIVE, forward: true, grab: p };
}
