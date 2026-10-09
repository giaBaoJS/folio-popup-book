// Chapter I's look, lights and camera (the open book on the table).
import type { Cam, Look, PointLight } from '../engine/frame';
import { deg, v3norm } from '../engine/math';

export const BOOK_HB = 0.094;

export const WOODS_LOOK: Look = {
  lightDir: v3norm([0.55, 0.85, -0.55]),
  lightCol: [0.4, 0.46, 0.82],
  translucency: 0.8,
  shadowSoft: 2.2,
  shadowCenter: [0, 0.5, 0],
  shadowHalf: [1.5, 1.5, 3.0],
  ambTop: [0.13, 0.11, 0.26],
  ambBot: [0.16, 0.1, 0.08],
  fog: [0.045, 0.03, 0.07, 0.06],
  bgKind: 0,
  bgA: '#2b2150',
  bgB: '#0f0a1c',
  bgC: '#ffb066',
  exposure: 1.15,
  saturation: 1.08,
  vignette: 0.5,
  grain: 0.022,
  fiber: 1,
  wind: 1,
  bloom: 0.85,
  tint: [1.0, 0.98, 1.02],
  particleKind: 0,
  particleCount: 140,
  particleCenter: [0, BOOK_HB + 0.42, -0.02],
  particleHalf: [0.95, 0.38, 0.62],
  particleSize: 0.009,
  sky: [0, 0, 0, 0],
  pool: 1.25,
};

// Warm light spilling from the house and the two lantern posts, plus the reading lamp.
export const WOODS_POINTS: PointLight[] = [
  { pos: [0, BOOK_HB + 0.16, 0.26], radius: 0.2, col: [1.7, 0.95, 0.4] },
  { pos: [-0.13 - 0.04, BOOK_HB + 0.17, 0.4], radius: 0.11, col: [1.4, 0.75, 0.3] },
  { pos: [0.13 + 0.04, BOOK_HB + 0.17, 0.4], radius: 0.11, col: [1.4, 0.75, 0.3] },
  { pos: [-1.8, 1.5, 1.8], radius: 2.0, col: [0.5, 0.3, 0.17] },
];

// The spread, seen from the reader's chair.
export const WOODS_CAM: Cam = {
  pos: [0, 1.62, 2.45],
  target: [0, 0.4, -0.06],
  up: [0, 1, 0],
  fov: deg(32),
  shiftX: 0,
  shiftY: 0,
  near: 0.02,
  far: 30,
};
