// Shared Skia painting helpers for the atlas painters. The Skia API object is passed in,
// so this runs on Graphite (app) and CanvasKit (tools/headless.ts) alike.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Sk = any;
export type Canvas = any;

export const ATLAS = 4096;
export const GUTTER = 12;

export type Fonts = {
  // Returns an SkFont for a family role at a pixel size.
  font: (role: 'serif' | 'serifItalic' | 'serifBold' | 'display' | 'script', size: number) => any;
};

export type Ctx = {
  S: Sk;
  c: Canvas;
  w: number;
  h: number;
  rnd: () => number;
  fonts: Fonts;
};

export type Spec = { w: number; h: number; tile?: boolean; alpha?: boolean; paint: (x: Ctx) => void };

// ---------------------------------------------------------------- helpers

export const enum Style {
  Fill = 0,
  Stroke = 1,
}
export const enum Cap {
  Butt = 0,
  Round = 1,
}
const enum Tile {
  Clamp = 0,
  Repeat = 1,
  Mirror = 2,
}
export const enum Blend {
  Clear = 0,
  SrcOver = 3,
  DstOut = 8,
  SrcATop = 9,
  Multiply = 24,
  Screen = 14,
  Overlay = 15,
}

export function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function paint(S: Sk, color: string, opts: { stroke?: number; alpha?: number; blend?: number; cap?: number; aa?: boolean } = {}) {
  const p = S.Paint();
  p.setAntiAlias(opts.aa ?? true);
  p.setColor(S.Color(color));
  if (opts.alpha !== undefined) p.setAlphaf(opts.alpha);
  if (opts.stroke !== undefined) {
    p.setStyle(Style.Stroke);
    p.setStrokeWidth(opts.stroke);
    p.setStrokeCap(opts.cap ?? Cap.Round);
  }
  if (opts.blend !== undefined) p.setBlendMode(opts.blend);
  return p;
}

export function shaderPaint(S: Sk, shader: any, alpha = 1, blend?: number) {
  const p = S.Paint();
  p.setAntiAlias(true);
  p.setShader(shader);
  p.setAlphaf(alpha);
  if (blend !== undefined) p.setBlendMode(blend);
  return p;
}

export function linear(S: Sk, x0: number, y0: number, x1: number, y1: number, colors: string[], pos: number[] | null = null) {
  return S.Shader.MakeLinearGradient({ x: x0, y: y0 }, { x: x1, y: y1 }, colors.map((c) => S.Color(c)), pos, Tile.Clamp);
}

export function radial(S: Sk, x: number, y: number, r: number, colors: string[], pos: number[] | null = null) {
  return S.Shader.MakeRadialGradient({ x, y }, r, colors.map((c) => S.Color(c)), pos, Tile.Clamp);
}

export function path(S: Sk, build: (b: any) => void) {
  const b = S.PathBuilder.Make();
  build(b);
  return b.build();
}

// Subtle fibre noise over everything that is paper.
export function grain(x: Ctx, strength = 0.08, freq = 0.9) {
  const { S, c, w, h } = x;
  const n = S.Shader.MakeFractalNoise(freq, freq, 3, Math.floor(x.rnd() * 1000), 0, 0);
  c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, n, strength, Blend.Overlay));
  const n2 = S.Shader.MakeFractalNoise(0.02, 0.05, 2, Math.floor(x.rnd() * 1000), 0, 0);
  c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, n2, strength * 0.6, Blend.Overlay));
}

export function text(x: Ctx, s: string, px: number, py: number, role: Parameters<Fonts['font']>[0], size: number, color: string, align: 'left' | 'center' | 'right' = 'left', alpha = 1) {
  const f = x.fonts.font(role, size);
  if (!f) return 0;
  const p = paint(x.S, color, { alpha });
  const ids = f.getGlyphIDs(s);
  const widths = f.getGlyphWidths(ids);
  let tw = 0;
  for (const wv of widths) tw += wv;
  const ox = align === 'center' ? px - tw / 2 : align === 'right' ? px - tw : px;
  x.c.drawText(s, ox, py, p, f);
  return tw;
}

export function measure(x: Ctx, s: string, role: Parameters<Fonts['font']>[0], size: number) {
  const f = x.fonts.font(role, size);
  if (!f) return s.length * size * 0.5;
  const widths = f.getGlyphWidths(f.getGlyphIDs(s));
  let tw = 0;
  for (const wv of widths) tw += wv;
  return tw;
}

// Greedy word wrap; returns the y after the last line.
export function paragraph(x: Ctx, s: string, px: number, py: number, maxW: number, role: Parameters<Fonts['font']>[0], size: number, lead: number, color: string, alpha = 1) {
  const words = s.split(' ');
  let line = '';
  let y = py;
  for (const word of words) {
    const tryLine = line ? `${line} ${word}` : word;
    if (measure(x, tryLine, role, size) > maxW && line) {
      text(x, line, px, y, role, size, color, 'left', alpha);
      line = word;
      y += lead;
    } else line = tryLine;
  }
  if (line) text(x, line, px, y, role, size, color, 'left', alpha);
  return y + lead;
}

// Draws fn at 9 offsets so a tile wraps seamlessly (the gutter is filled too).
export function wrapped(x: Ctx, fn: () => void) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      x.c.save();
      x.c.translate(dx * x.w, dy * x.h);
      fn();
      x.c.restore();
    }
  }
}

export function gold(S: Sk, x0: number, y0: number, x1: number, y1: number) {
  return linear(S, x0, y0, x1, y1, ['#8a5a1c', '#f7dc8a', '#c08a2e', '#fff1b8', '#9a6a22', '#e9c46a'], [0, 0.22, 0.42, 0.55, 0.78, 1]);
}

