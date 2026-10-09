// Atlas painters for the deep scene (chapter IV, Under the Paper Sea). Keys are pattern names
// from patterns.json. The atlas is shared and nearly full, so every region here is small.
// Orientation: canvas row 0 is uv v = 0; deep.py flips cards so the canvas top is the top of the
// object. Tinted patterns are painted light and neutral; the whale and fish carry their own colours.
import type { Ctx, Spec } from './brush';
import { Blend, Cap, grain, lcg, linear, paint, path, radial, shaderPaint, wrapped } from './brush';

// Constellation on the whale's flank, in body uv (u towards the head, v down the canvas).
// deep.py places glowing stars at the same points.
const WHALE_STARS: [number, number][] = [
  [0.86, 0.36],
  [0.76, 0.24],
  [0.64, 0.2],
  [0.53, 0.27],
  [0.42, 0.22],
  [0.31, 0.3],
  [0.58, 0.42],
  [0.69, 0.47],
];
const WHALE_LINKS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [3, 6],
  [6, 7],
  [7, 1],
];

const clear = (x: Ctx) => paint(x.S, '#000000', { blend: Blend.Clear });

// ---------------------------------------------------------------- sand (tile, tinted)

const sand: Spec = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#efebe3'));
    wrapped(x, () => {
      // Ripples left by the current: soft dark troughs with a lit crest above each.
      for (let i = 0; i < 9; i++) {
        const y0 = (i / 9) * h + rnd() * 6;
        const ph = rnd() * 6.28;
        const g = path(S, (b) => {
          b.moveTo(-8, y0);
          for (let xx = 0; xx <= w + 8; xx += 8) b.lineTo(xx, y0 + Math.sin((xx / w) * 6.283 * 2 + ph) * 5 + Math.sin((xx / w) * 6.283 * 3 + i) * 2);
        });
        c.drawPath(g, paint(S, '#cbc3b4', { stroke: 4, alpha: 0.55 }));
        c.save();
        c.translate(0, -3);
        c.drawPath(g, paint(S, '#ffffff', { stroke: 2, alpha: 0.7 }));
        c.restore();
      }
      // A web of caustic light printed in pale ink.
      for (let i = 0; i < 14; i++) {
        const cx = rnd() * w;
        const cy = rnd() * h;
        const R = 18 + rnd() * 22;
        const g = path(S, (b) => {
          for (let k = 0; k <= 7; k++) {
            const a = (k / 7) * Math.PI * 2;
            const rr = R * (0.75 + 0.25 * Math.sin(k * 2.3 + i));
            if (k === 0) b.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            else b.quadTo(cx + Math.cos(a - 0.45) * rr * 1.15, cy + Math.sin(a - 0.45) * rr * 1.15, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
          }
        });
        c.drawPath(g, paint(S, '#ffffff', { stroke: 2.2, alpha: 0.4 }));
      }
      // Grains, pebbles and broken shell.
      for (let i = 0; i < 220; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const v = rnd();
        c.drawCircle(px, py, 0.8 + rnd() * 1.6, paint(S, v < 0.5 ? '#b9b0a0' : '#ffffff', { alpha: 0.6 }));
      }
      for (let i = 0; i < 7; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const r = 3 + rnd() * 4;
        c.drawOval(S.XYWHRect(px - r, py - r * 0.7, 2 * r, 1.4 * r), paint(S, '#d8d0c2'));
        c.drawOval(S.XYWHRect(px - r * 0.6, py - r * 0.6, 1.2 * r, 0.8 * r), paint(S, '#ffffff', { alpha: 0.7 }));
      }
    });
    grain(x, 0.1, 0.8);
  },
};

// ---------------------------------------------------------------- kelp (alpha, tinted): 2 stalks

function kelpStalk(x: Ctx, cx: number, seed: number) {
  const { S, c, h } = x;
  const r = lcg(seed);
  const top = 14;
  const bot = h - 4;
  const sx = (y: number) => cx + Math.sin(y * 0.018 + seed) * 7 + Math.sin(y * 0.047) * 3;
  // Holdfast: little claw roots at the bottom.
  for (let k = -3; k <= 3; k++) {
    const root = path(S, (b) => {
      b.moveTo(sx(bot - 24), bot - 24);
      b.quadTo(cx + k * 6, bot - 8, cx + k * 15, bot);
    });
    c.drawPath(root, paint(S, '#cfcfc6', { stroke: 4 }));
  }
  // Blades, alternating sides, smaller towards the tip.
  let y = bot - 36;
  let side = r() < 0.5 ? -1 : 1;
  while (y > top + 40) {
    const t = 1 - (y - top) / (bot - top); // 0 bottom .. 1 top
    const L = 52 + r() * 26 - t * 16;
    const wd = 10 + r() * 5 - t * 3;
    const ang = (-62 + r() * 18) * (Math.PI / 180);
    const bx = sx(y);
    const dx = Math.cos(ang) * side;
    const dy = Math.sin(ang);
    const ex = bx + dx * L;
    const ey = y + dy * L;
    const nx = -dy;
    const ny = dx;
    const blade = path(S, (b) => {
      b.moveTo(bx, y);
      // Ruffled edge on both sides.
      const n = 10;
      for (let i = 1; i <= n; i++) {
        const u = i / n;
        const wv = wd * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 + 0.18 * Math.sin(i * 2.7));
        b.lineTo(bx + dx * L * u + nx * wv * side, y + dy * L * u + ny * wv * side);
      }
      for (let i = n - 1; i >= 1; i--) {
        const u = i / n;
        const wv = wd * 0.7 * Math.sin(Math.PI * Math.pow(u, 0.8)) * (1 + 0.2 * Math.cos(i * 3.1));
        b.lineTo(bx + dx * L * u - nx * wv * side, y + dy * L * u - ny * wv * side);
      }
      b.close();
    });
    c.drawPath(blade, shaderPaint(S, linear(S, bx, y, ex, ey, ['#d5d8cb', '#f3f5ec', '#ffffff'])));
    c.drawPath(blade, paint(S, '#8e9384', { stroke: 1.5, alpha: 0.6 }));
    // Midrib and a couple of lace slits.
    c.drawLine(bx, y, bx + dx * L * 0.85, y + dy * L * 0.85, paint(S, '#a4a898', { stroke: 1.6, alpha: 0.8 }));
    for (const u of [0.38, 0.62]) {
      c.save();
      c.translate(bx + dx * L * u + nx * wd * 0.35 * side, y + dy * L * u + ny * wd * 0.35 * side);
      c.rotate((Math.atan2(dy, dx) * 180) / Math.PI, 0, 0);
      c.drawOval(S.XYWHRect(-5, -1.6, 10, 3.2), clear(x));
      c.restore();
    }
    // Gas bladder at the base of the blade.
    c.drawCircle(bx + dx * 7, y + dy * 7, 5, paint(S, '#e9ebdf'));
    c.drawCircle(bx + dx * 7, y + dy * 7, 5, paint(S, '#8e9384', { stroke: 1.2, alpha: 0.6 }));
    c.drawCircle(bx + dx * 6, y + dy * 6 - 1.5, 1.6, paint(S, '#ffffff'));
    y -= 18 + r() * 12;
    side = -side;
  }
  // The stipe on top of the blade roots, and the growing tip.
  const stipe = path(S, (b) => {
    b.moveTo(sx(bot), bot);
    for (let yy = bot; yy >= top; yy -= 8) b.lineTo(sx(yy), yy);
  });
  c.drawPath(stipe, paint(S, '#b9bcae', { stroke: 6 }));
  c.drawPath(stipe, paint(S, '#e6e8dd', { stroke: 2 }));
  const tip = path(S, (b) => {
    const tx = sx(top + 40);
    b.moveTo(tx - 7, top + 44);
    b.cubicTo(tx - 9, top + 18, tx - 2, top + 4, tx + 2, top);
    b.cubicTo(tx + 6, top + 14, tx + 8, top + 30, tx + 7, top + 44);
    b.close();
  });
  c.drawPath(tip, paint(S, '#f3f5ec'));
  c.drawPath(tip, paint(S, '#8e9384', { stroke: 1.5, alpha: 0.6 }));
}

const kelp: Spec = {
  w: 256,
  h: 512,
  alpha: true,
  paint: (x) => {
    kelpStalk(x, 64, 3);
    kelpStalk(x, 192, 8);
  },
};

// ---------------------------------------------------------------- coral fan (alpha, tinted lace)

const coral: Spec = {
  w: 256,
  h: 256,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const r = lcg(41);
    const bx = w / 2;
    const by = h - 6;
    // Fan silhouette.
    const fan = path(S, (b) => {
      b.moveTo(bx - 6, by);
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (1.06 + (i / n) * 0.88);
        const R = h * 0.9 * (0.92 + 0.08 * Math.sin(i * 1.9)) * (1 - 0.18 * Math.pow(Math.abs(i / n - 0.5) * 2, 2));
        b.lineTo(bx + Math.cos(a) * R * 1.05, by + 10 + Math.sin(a) * R);
      }
      b.lineTo(bx + 6, by);
      b.close();
    });
    c.drawPath(fan, shaderPaint(S, radial(S, bx, by, h, ['#d9d2cf', '#f4efed', '#ffffff'], [0, 0.5, 1])));
    // Lace: a net of small cells cut between the ribs (the gorgonian mesh).
    for (let gy = 10; gy < h - 20; gy += 11) {
      for (let gx = 6; gx < w - 6; gx += 11) {
        const px = gx + (r() - 0.5) * 5 + ((gy / 11) % 2) * 5;
        const py = gy + (r() - 0.5) * 5;
        const d = Math.hypot(px - bx, py - by);
        if (d < h * 0.12) continue;
        const sz = 2.2 + r() * 2.2 + (d / h) * 1.5;
        c.save();
        c.translate(px, py);
        c.rotate(r() * 180, 0, 0);
        c.drawRRect(S.RRectXY(S.XYWHRect(-sz, -sz * 0.75, sz * 2, sz * 1.5), sz * 0.6, sz * 0.6), clear(x));
        c.restore();
      }
    }
    // Ribs: a branching tree from the stalk.
    const rib = (x0: number, y0: number, a: number, L: number, wd: number, d: number) => {
      const x1 = x0 + Math.cos(a) * L;
      const y1 = y0 + Math.sin(a) * L;
      c.drawLine(x0, y0, x1, y1, paint(S, '#b9adaa', { stroke: wd }));
      c.drawLine(x0, y0, x1, y1, paint(S, '#ffffff', { stroke: wd * 0.35, alpha: 0.7 }));
      if (d > 0) {
        rib(x1, y1, a - 0.32 - r() * 0.15, L * 0.78, wd * 0.72, d - 1);
        rib(x1, y1, a + 0.32 + r() * 0.15, L * 0.78, wd * 0.72, d - 1);
      } else {
        c.drawCircle(x1, y1, 2.5, paint(S, '#ffffff'));
      }
    };
    rib(bx, by, -Math.PI / 2, h * 0.24, 7, 4);
    // Polyps: tiny bright dots scattered on the lace.
    for (let i = 0; i < 70; i++) {
      const a = Math.PI * (1.08 + r() * 0.84);
      const R = h * (0.15 + r() * 0.72);
      c.drawCircle(bx + Math.cos(a) * R * 1.05, by + 10 + Math.sin(a) * R, 1.3 + r(), paint(S, '#ffffff', { alpha: 0.85 }));
    }
    c.drawPath(fan, paint(S, '#a99b98', { stroke: 2, alpha: 0.5 }));
  },
};

// ---------------------------------------------------------------- whale body (full colour)

const whale: Spec = {
  w: 512,
  h: 256,
  paint: (x) => {
    const { S, c, w, h } = x;
    const r = lcg(77);
    // Deep blue, darker along the back, a lighter band towards the belly.
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, 0, 0, 0, h, ['#1f4580', '#2b5c9e', '#3f78b8', '#6a9fd0'], [0, 0.35, 0.7, 1])));
    // Cut-paper mottling.
    const n = S.Shader.MakeFractalNoise(0.02, 0.04, 3, 5, 0, 0);
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, n, 0.22, Blend.Overlay));
    // Flowing woodcut lines along the body.
    for (let i = 0; i < 14; i++) {
      const y0 = h * (0.12 + i * 0.055);
      const g = path(S, (b) => {
        b.moveTo(0, y0);
        for (let xx = 0; xx <= w; xx += 16) b.lineTo(xx, y0 + Math.sin(xx * 0.012 + i * 0.7) * 5 - (xx / w) * 8);
      });
      c.drawPath(g, paint(S, '#8fb4dd', { stroke: 1.2, alpha: 0.18 }));
    }
    // A sky full of tiny stars on the back.
    for (let i = 0; i < 120; i++) {
      const px = r() * w;
      const py = h * (0.05 + r() * 0.55);
      const s = 0.6 + r() * 1.4;
      c.drawCircle(px, py, s, paint(S, r() < 0.7 ? '#dfe9ff' : '#ffe6a8', { alpha: 0.35 + r() * 0.5 }));
    }
    // Tubercles on the head.
    for (let i = 0; i < 16; i++) {
      const px = w * (0.84 + r() * 0.13);
      const py = h * (0.18 + r() * 0.32);
      c.drawCircle(px, py, 3 + r() * 2, paint(S, '#5d8cc0'));
      c.drawCircle(px - 0.8, py - 0.8, 1.6, paint(S, '#a9c6ea', { alpha: 0.8 }));
    }
    // The constellation: gold thread between the stars (the stars themselves glow in 3D).
    const P = WHALE_STARS.map(([u, v]) => [u * w, v * h]);
    for (const [a, b] of WHALE_LINKS) {
      c.drawLine(P[a][0], P[a][1], P[b][0], P[b][1], paint(S, '#f7dc8f', { stroke: 2, alpha: 0.75, cap: Cap.Round }));
    }
    for (const [px, py] of P) {
      c.drawCircle(px, py, 9, shaderPaint(S, radial(S, px, py, 9, ['#fff1c2', '#f7dc8f55', '#f7dc8f00'])));
    }
    // Mouth line.
    const mouth = path(S, (b) => {
      b.moveTo(w * 0.995, h * 0.58);
      b.cubicTo(w * 0.93, h * 0.6, w * 0.86, h * 0.62, w * 0.78, h * 0.66);
    });
    c.drawPath(mouth, paint(S, '#0b1a36', { stroke: 3, alpha: 0.8 }));
    grain(x, 0.12, 0.7);
  },
};

// ---------------------------------------------------------------- deep_b: whale belly grooves

const belly: Spec = {
  w: 256,
  h: 128,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, 0, 0, 0, h, ['#f3f1e6', '#dfe6ea', '#c9d6e2'])));
    // Pleats run from the chin (right) back along the belly, fanning slightly.
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.7) / 9.5;
      const g = path(S, (b) => {
        b.moveTo(w, h * (0.15 + t * 0.5));
        b.cubicTo(w * 0.7, h * (0.12 + t * 0.62), w * 0.35, h * (0.08 + t * 0.78), 0, h * (0.05 + t * 0.85));
      });
      c.drawPath(g, paint(S, '#8ea5bb', { stroke: 2.4, alpha: 0.8 }));
      c.save();
      c.translate(0, 2);
      c.drawPath(g, paint(S, '#ffffff', { stroke: 1.2, alpha: 0.8 }));
      c.restore();
    }
    grain(x, 0.1, 0.8);
  },
};

// ---------------------------------------------------------------- jelly bell (alpha, tinted lace, top view)

const jelly: Spec = {
  w: 256,
  h: 256,
  alpha: true,
  paint: (x) => {
    const { S, c, w } = x;
    const cx = w / 2;
    const R = w * 0.48;
    const lobes = 16;
    const disc = path(S, (b) => {
      const n = 200;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = R * (1 - 0.06 * Math.pow(Math.abs(Math.sin((a * lobes) / 2)), 0.5));
        if (i === 0) b.moveTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
        else b.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
      }
      b.close();
    });
    c.drawPath(disc, shaderPaint(S, radial(S, cx, cx, R, ['#ffffff', '#f4f4f4', '#ffffff'], [0, 0.7, 1])));
    // Radial canals and a ring canal.
    for (let k = 0; k < lobes; k++) {
      const a = (k / lobes) * Math.PI * 2;
      c.drawLine(cx + Math.cos(a) * R * 0.2, cx + Math.sin(a) * R * 0.2, cx + Math.cos(a) * R * 0.94, cx + Math.sin(a) * R * 0.94, paint(S, '#d0d0d0', { stroke: 3 }));
    }
    c.drawCircle(cx, cx, R * 0.86, paint(S, '#d0d0d0', { stroke: 3 }));
    // Lace windows between the canals.
    for (let k = 0; k < lobes; k++) {
      const a = ((k + 0.5) / lobes) * Math.PI * 2;
      for (const [rr, sz] of [
        [0.42, 7],
        [0.66, 9],
      ] as [number, number][]) {
        c.save();
        c.translate(cx + Math.cos(a) * R * rr, cx + Math.sin(a) * R * rr);
        c.rotate((a * 180) / Math.PI, 0, 0);
        c.drawOval(S.XYWHRect(-sz * 1.4, -sz * 0.75, sz * 2.8, sz * 1.5), clear(x));
        c.restore();
      }
    }
    // Four-leaf heart in the middle.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      c.drawCircle(cx + Math.cos(a) * R * 0.13, cx + Math.sin(a) * R * 0.13, R * 0.1, paint(S, '#e2e2e2'));
      c.drawCircle(cx + Math.cos(a) * R * 0.13, cx + Math.sin(a) * R * 0.13, R * 0.1, paint(S, '#bdbdbd', { stroke: 2 }));
    }
    c.drawPath(disc, paint(S, '#bdbdbd', { stroke: 3 }));
  },
};

// ---------------------------------------------------------------- fish (alpha, full colour): 2 x 2 cells

type FishStyle = { body: string[]; fin: string; stripe: string; stripes: number; dots?: boolean };

function fish(x: Ctx, ox: number, oy: number, cw: number, ch: number, st: FishStyle) {
  const { S, c } = x;
  c.save();
  c.translate(ox, oy);
  const L = cw * 0.92;
  const H = ch * 0.78;
  const x0 = cw * 0.04;
  const cy = ch / 2;
  // Tail.
  const tail = path(S, (b) => {
    b.moveTo(x0 + L * 0.22, cy);
    b.lineTo(x0, cy - H * 0.48);
    b.quadTo(x0 + L * 0.07, cy, x0, cy + H * 0.48);
    b.close();
  });
  c.drawPath(tail, paint(S, st.fin));
  // Dorsal and belly fins.
  const fins = path(S, (b) => {
    b.moveTo(x0 + L * 0.35, cy - H * 0.3);
    b.quadTo(x0 + L * 0.5, cy - H * 0.62, x0 + L * 0.68, cy - H * 0.3);
    b.close();
    b.moveTo(x0 + L * 0.42, cy + H * 0.28);
    b.quadTo(x0 + L * 0.5, cy + H * 0.55, x0 + L * 0.6, cy + H * 0.28);
    b.close();
  });
  c.drawPath(fins, paint(S, st.fin));
  // Body.
  const body = path(S, (b) => {
    b.moveTo(x0 + L * 0.18, cy);
    b.cubicTo(x0 + L * 0.35, cy - H * 0.55, x0 + L * 0.8, cy - H * 0.5, x0 + L, cy + H * 0.02);
    b.cubicTo(x0 + L * 0.8, cy + H * 0.48, x0 + L * 0.35, cy + H * 0.5, x0 + L * 0.18, cy);
    b.close();
  });
  c.drawPath(body, shaderPaint(S, linear(S, 0, cy - H * 0.5, 0, cy + H * 0.5, st.body)));
  c.save();
  c.clipPath(body, 1, true);
  for (let i = 0; i < st.stripes; i++) {
    const sx = x0 + L * (0.36 + i * 0.17);
    c.drawLine(sx, cy - H, sx - L * 0.04, cy + H, paint(S, st.stripe, { stroke: ch * 0.09, cap: Cap.Butt }));
  }
  if (st.dots) {
    const r = lcg(9);
    for (let i = 0; i < 14; i++) c.drawCircle(x0 + L * (0.3 + r() * 0.55), cy + (r() - 0.5) * H * 0.6, 1.3, paint(S, '#ffffff', { alpha: 0.8 }));
  }
  // Scales.
  for (let i = 0; i < 4; i++) {
    for (let j = -1; j <= 1; j++) {
      c.drawCircle(x0 + L * (0.42 + i * 0.1), cy + j * H * 0.18, ch * 0.07, paint(S, '#ffffff', { stroke: 0.8, alpha: 0.35 }));
    }
  }
  c.restore();
  c.drawPath(body, paint(S, '#00000066', { stroke: 1.2 }));
  // Eye and gill.
  c.drawCircle(x0 + L * 0.82, cy - H * 0.08, ch * 0.075, paint(S, '#ffffff'));
  c.drawCircle(x0 + L * 0.83, cy - H * 0.08, ch * 0.04, paint(S, '#13162a'));
  const gill = path(S, (b) => {
    b.moveTo(x0 + L * 0.72, cy - H * 0.3);
    b.quadTo(x0 + L * 0.66, cy, x0 + L * 0.72, cy + H * 0.3);
  });
  c.drawPath(gill, paint(S, '#00000055', { stroke: 1.2 }));
  c.restore();
}

const fishSpec: Spec = {
  w: 256,
  h: 128,
  alpha: true,
  paint: (x) => {
    const cw = 128;
    const ch = 64;
    fish(x, 0, 0, cw, ch, { body: ['#ffd36b', '#f6b23e', '#ffe9a6'], fin: '#3fb3b0', stripe: '#3a9fb0', stripes: 2 });
    fish(x, cw, 0, cw, ch, { body: ['#ff9a5a', '#f2733d', '#ffc08f'], fin: '#2b2f4a', stripe: '#fff4e6', stripes: 3 });
    fish(x, 0, ch, cw, ch, { body: ['#5ab4f0', '#2f7fd0', '#9ad6ff'], fin: '#ffd25e', stripe: '#1d4f9a', stripes: 1 });
    // Cell (1, 1) holds two paper bubbles (rising streams in deep.py): a cut ring with a glint.
    const { S, c } = x;
    for (let k = 0; k < 2; k++) {
      const bx = cw + k * 64 + 32;
      const by = ch + 32;
      c.drawCircle(bx, by, 28, paint(S, '#ffffff'));
      c.drawCircle(bx, by, 28, paint(S, '#cfe9f2', { stroke: 2 }));
      c.drawCircle(bx, by, 22 - k * 3, paint(S, '#000000', { blend: Blend.Clear }));
      const glint = path(S, (b) => {
        b.addArc(S.XYWHRect(bx - 17, by - 17, 34, 34), 190, 70);
      });
      c.drawPath(glint, paint(S, '#ffffff', { stroke: 5 }));
      c.drawCircle(bx + 9, by + 10, 3, paint(S, '#ffffff'));
    }
  },
};

// ---------------------------------------------------------------- deep_a: stone (tile, tinted)

const stone: Spec = {
  w: 128,
  h: 128,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#ebebef'));
    wrapped(x, () => {
      for (let i = 0; i < 26; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const rr = 3 + rnd() * 10;
        c.drawCircle(px, py, rr, paint(S, rnd() < 0.5 ? '#d6d6de' : '#f7f7fa', { alpha: 0.6 }));
      }
      for (let i = 0; i < 90; i++) c.drawCircle(rnd() * w, rnd() * h, 0.7 + rnd(), paint(S, '#9c9cab', { alpha: 0.6 }));
      // Lichen freckles.
      for (let i = 0; i < 6; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        for (let k = 0; k < 6; k++) c.drawCircle(px + (rnd() - 0.5) * 8, py + (rnd() - 0.5) * 8, 1.4, paint(S, '#ffffff', { alpha: 0.8 }));
      }
    });
    grain(x, 0.14, 0.9);
  },
};

// ---------------------------------------------------------------- deep_c: anemone fringe (alpha, tile in u)

const fringe: Spec = {
  w: 256,
  h: 128,
  alpha: true,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const r = lcg(13);
    const n = 8;
    wrapped(x, () => {
      c.drawRect(S.XYWHRect(0, h - 18, w, 18), paint(S, '#dcdcdc'));
      for (let k = 0; k < n; k++) {
        const bx = ((k + 0.5) / n) * w;
        const L = h * (0.72 + r() * 0.2);
        const curl = (r() - 0.5) * 16;
        const wd = (w / n) * 0.36;
        const t = path(S, (b) => {
          b.moveTo(bx - wd, h);
          b.cubicTo(bx - wd, h - L * 0.5, bx + curl - wd * 0.5, h - L * 0.85, bx + curl, h - L);
          b.cubicTo(bx + curl + wd * 0.5, h - L * 0.85, bx + wd, h - L * 0.5, bx + wd, h);
          b.close();
        });
        c.drawPath(t, shaderPaint(S, linear(S, 0, h, 0, h - L, ['#c8c8c8', '#ececec', '#ffffff'])));
        // Banded rings and a bright tip.
        for (let i = 1; i < 4; i++) {
          const yy = h - L * (0.25 * i);
          c.drawLine(bx - wd * 0.8 + curl * 0.25 * i, yy, bx + wd * 0.8 + curl * 0.25 * i, yy, paint(S, '#b5b5b5', { stroke: 1.5, alpha: 0.6 }));
        }
        c.drawCircle(bx + curl, h - L + 4, wd * 0.6, paint(S, '#ffffff'));
      }
    });
  },
};

// ---------------------------------------------------------------- deep_d: sea grass strip (alpha, tile)

const seagrass: Spec = {
  w: 256,
  h: 128,
  alpha: true,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const r = lcg(29);
    wrapped(x, () => {
      for (let i = 0; i < 14; i++) {
        const bx = ((i + 0.5) / 14) * w + (r() - 0.5) * 8;
        const L = h * (0.5 + r() * 0.48);
        const wd = 3.5 + r() * 2.5;
        const ph = r() * 6.28;
        const amp = 6 + r() * 6;
        const pts: number[][] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push([bx + Math.sin(t * 5 + ph) * amp * t, h - t * L]);
        }
        const blade = path(S, (b) => {
          b.moveTo(pts[0][0] - wd, pts[0][1]);
          for (let k = 1; k <= 12; k++) b.lineTo(pts[k][0] - wd * (1 - (k / 12) * 0.7), pts[k][1]);
          b.quadTo(pts[12][0], pts[12][1] - wd, pts[12][0] + wd * 0.3, pts[12][1]);
          for (let k = 12; k >= 0; k--) b.lineTo(pts[k][0] + wd * (1 - (k / 12) * 0.7), pts[k][1]);
          b.close();
        });
        const v = Math.round(205 + r() * 50);
        c.drawPath(blade, shaderPaint(S, linear(S, 0, h, 0, h - L, [`rgb(${v - 40},${v - 40},${v - 40})`, `rgb(${v},${v},${v})`, '#ffffff'])));
        c.drawPath(blade, paint(S, '#000000', { stroke: 1, alpha: 0.15 }));
      }
    });
  },
};

// ---------------------------------------------------------------- deep_e: embossed dots (tile, tinted)

const dots: Spec = {
  w: 128,
  h: 128,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#e9e9e9'));
    wrapped(x, () => {
      for (let i = 0; i < 34; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const rr = 2 + rnd() * 4;
        c.drawCircle(px + 0.8, py + 1, rr, paint(S, '#b8b8b8', { alpha: 0.7 }));
        c.drawCircle(px, py, rr, paint(S, '#ffffff'));
      }
    });
    grain(x, 0.1, 0.9);
  },
};

// ---------------------------------------------------------------- deep_f: paper light rays (alpha, tile in u)
// Strands rise from the canvas bottom (bright) to fine points at the top (dim).

const rays: Spec = {
  w: 256,
  h: 256,
  alpha: true,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const r = lcg(3);
    wrapped(x, () => {
      for (let i = 0; i < 9; i++) {
        const bx = ((i + 0.5) / 9) * w + (r() - 0.5) * 10;
        const L = h * (0.55 + r() * 0.45);
        const wd = 3 + r() * 4;
        const lean = (r() - 0.5) * 12;
        const s = path(S, (b) => {
          b.moveTo(bx - wd, h);
          b.quadTo(bx - wd * 0.5 + lean * 0.5, h - L * 0.5, bx + lean, h - L);
          b.quadTo(bx + wd * 0.5 + lean * 0.5, h - L * 0.5, bx + wd, h);
          b.close();
        });
        c.drawPath(s, shaderPaint(S, linear(S, 0, h, 0, h - L, ['#ffffff', '#c8c8c8', '#3a3a3a'])));
      }
    });
  },
};

export const DEEP_PAINTERS: Record<string, Spec> = {
  sand,
  kelp,
  coral,
  whale,
  jelly,
  fish: fishSpec,
  deep_a: stone,
  deep_b: belly,
  deep_c: fringe,
  deep_d: seagrass,
  deep_e: dots,
  deep_f: rays,
};
