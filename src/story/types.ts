import type { SceneAsset } from '../assets/types';
import type { Cam, Look, PointLight } from '../engine/frame';

// Per-frame context handed to a scene's `animate` worklet.
export type AnimCtx = {
  xf: Float32Array; // all transform slots, 16 floats each (column-major)
  base: number; // first slot of this scene instance
  t: number; // seconds of story time (global, so a scene looks the same through the portal and after arriving)
  idx: Record<string, number>; // part name -> part index
  pivots: Float32Array; // xyz per part (rest-space hinge points from Blender)
  points: PointLight[]; // mutable copy of the scene's point lights (animate may move/flicker them)
  arrive: number; // 0..1, how settled the camera is after arriving through the previous portal
  tmp: Float32Array; // scratch (>= 48 floats) the helpers in anim.ts reuse; do not keep references
};

export type Chapter = {
  title: string;
  numeral: string;
  body: string;
  hint: string;
};

export type SceneDef = {
  name: string;
  asset: SceneAsset;
  look: Look;
  points: PointLight[];
  // Rest camera, framed for the unfolded Duo (951 x 669 pt, aspect 1.42).
  cam: Cam;
  // Where the camera starts when it arrives through the previous scene's portal.
  entry: Cam;
  // Part whose meta.portal is the way into the next scene.
  portalPart: string;
  chapter: Chapter;
  // Which bottom corner the chapter card sits in (keep it off the characters).
  cardSide?: 'left' | 'right';
  // Optional worklet that poses 'actor' parts every frame (identity is written first).
  animate?: (ctx: AnimCtx) => void;
};
