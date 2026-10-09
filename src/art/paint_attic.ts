// Atlas painters for the attic scene (Chapter II, the reading room in the tower).
// Keys are pattern names from patterns.json. Image y runs down; the geometry maps v = 0 to the top.
import type { Ctx, Spec } from './brush';
import { Blend, Cap, gold, grain, lcg, linear, paint, path, radial, shaderPaint, text, wrapped } from './brush';

const TAU = Math.PI * 2;

function fill(x: Ctx, col: string) {
  x.c.drawRect(x.S.XYWHRect(-x.w, -x.h, 3 * x.w, 3 * x.h), paint(x.S, col));
}

function star(x: Ctx, cx: number, cy: number, r: number, col: string, points = 5, inner = 0.45, rot = -Math.PI / 2, alpha = 1) {
  const { S, c } = x;
  const p = path(S, (b) => {
    for (let i = 0; i < points * 2; i++) {
      const a = rot + (i / (points * 2)) * TAU;
      const rr = i % 2 ? r * inner : r;
      if (i === 0) b.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else b.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    b.close();
  });
  c.drawPath(p, paint(S, col, { alpha }));
}

function petal(x: Ctx, cx: number, cy: number, a: number, len: number, wid: number, col: string, alpha = 1) {
  const { S, c } = x;
  c.save();
  c.translate(cx, cy);
  c.rotate((a * 180) / Math.PI, 0, 0);
  const p = path(S, (b) => {
    b.moveTo(0, 0);
    b.cubicTo(len * 0.3, -wid, len * 0.8, -wid, len, 0);
    b.cubicTo(len * 0.8, wid, len * 0.3, wid, 0, 0);
    b.close();
  });
  c.drawPath(p, paint(S, col, { alpha }));
  c.restore();
}

function flower(x: Ctx, cx: number, cy: number, r: number, col: string, centre: string, n = 5, rot = 0) {
  for (let i = 0; i < n; i++) petal(x, cx, cy, rot + (i / n) * TAU, r, r * 0.42, col);
  x.c.drawCircle(cx, cy, r * 0.28, paint(x.S, centre));
}

// ---------------------------------------------------------------- room

// Dusty blue wallpaper: stripes, half-drop sprigs and tiny stars.
const wallpaper: Spec = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    fill(x, '#4f7186');
    wrapped(x, () => {
      for (let i = 0; i < 8; i++) {
        const sx = (i * w) / 8;
        c.drawRect(S.XYWHRect(sx + 20, 0, 24, h), paint(S, '#5a7d92'));
        c.drawLine(sx + 2, 0, sx + 2, h, paint(S, '#e9d9b4', { stroke: 1.4, alpha: 0.35, cap: Cap.Butt }));
      }
      // Sprigs on a half-drop grid.
      for (let gy = 0; gy < 4; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          const cx = (gx + 0.5 + (gy % 2) * 0.5) * (w / 4);
          const cy = (gy + 0.5) * (h / 4);
          const rot = (gx + gy) % 2 ? 0.4 : -0.4;
          // Stem and two leaves.
          const st = path(S, (b) => {
            b.moveTo(cx, cy + 4);
            b.cubicTo(cx + 6 * Math.sin(rot), cy + 18, cx - 4, cy + 26, cx + 2, cy + 36);
          });
          c.drawPath(st, paint(S, '#9fb8a0', { stroke: 2.4 }));
          petal(x, cx, cy + 18, 0.5 + rot, 16, 6, '#9fb8a0');
          petal(x, cx, cy + 24, Math.PI - 0.5 + rot, 14, 5.5, '#8fae95');
          flower(x, cx, cy, 11, '#f1e4c8', '#e3ae4f', 5, rot);
        }
      }
      // Tiny gold stars between the sprigs.
      for (let gy = 0; gy < 4; gy++) {
        for (let gx = 0; gx < 4; gx++) {
          const cx = (gx + (gy % 2) * 0.5) * (w / 4);
          const cy = gy * (h / 4) + 6;
          star(x, cx, cy, 7, '#f0cf7e', 5, 0.45);
          c.drawCircle(cx + 22, cy + 30, 2.2, paint(S, '#e9d9b4', { alpha: 0.7 }));
          c.drawCircle(cx - 20, cy + 34, 1.8, paint(S, '#e9d9b4', { alpha: 0.6 }));
        }
      }
    });
    grain(x, 0.12, 0.8);
  },
};

// Warm honey floorboards running along u.
const floorboards: Spec = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    fill(x, '#c48f5e');
    const rnd = lcg(91);
    wrapped(x, () => {
      const rows = 6;
      const rh = h / rows;
      for (let r = 0; r < rows; r++) {
        const y = r * rh;
        let px = -rnd() * w * 0.5;
        while (px < w) {
          const len = w * (0.35 + rnd() * 0.45);
          const tone = 0.84 + rnd() * 0.16;
          const cr = Math.round(205 * tone);
          const cg = Math.round(150 * tone);
          const cb = Math.round(100 * tone);
          const x0 = Math.max(px, 0);
          const x1 = Math.min(px + len, w);
          c.drawRect(S.XYWHRect(x0, y, x1 - x0, rh), paint(S, `rgb(${cr},${cg},${cb})`));
          // Grain.
          for (let k = 0; k < 6; k++) {
            const gy = y + 6 + rnd() * (rh - 12);
            const g = path(S, (b) => {
              b.moveTo(x0, gy);
              for (let xx = x0; xx <= x1; xx += 24) b.lineTo(xx, gy + Math.sin(xx * 0.03 + k * 2 + r) * 2.2);
            });
            c.drawPath(g, paint(S, '#7a4a2a', { stroke: 1.1, alpha: 0.22 }));
          }
          if (rnd() < 0.4) {
            const kx = x0 + rnd() * (x1 - x0);
            const ky = y + rh * (0.3 + rnd() * 0.4);
            c.drawOval(S.XYWHRect(kx - 9, ky - 4, 18, 8), paint(S, '#6e4024', { stroke: 1.4, alpha: 0.35 }));
          }
          // End joint and nails.
          if (px + len < w) {
            c.drawLine(px + len, y, px + len, y + rh, paint(S, '#4e2c18', { stroke: 2.4, alpha: 0.7, cap: Cap.Butt }));
            c.drawCircle(px + len - 8, y + rh * 0.3, 2.2, paint(S, '#3d2414', { alpha: 0.6 }));
            c.drawCircle(px + len - 8, y + rh * 0.7, 2.2, paint(S, '#3d2414', { alpha: 0.6 }));
          }
          px += len;
        }
        c.drawLine(0, y, w, y, paint(S, '#4a2a17', { stroke: 3, alpha: 0.75, cap: Cap.Butt }));
        c.drawLine(0, y + 2.5, w, y + 2.5, paint(S, '#ffe2b8', { stroke: 1.2, alpha: 0.3, cap: Cap.Butt }));
      }
    });
    grain(x, 0.12, 0.8);
  },
};

// Round folk rug: concentric rings, zigzags, dots and a flower medallion.
const rug: Spec = {
  w: 512,
  h: 512,
  paint: (x) => {
    const { S, c, w } = x;
    const cx = w / 2;
    const R = w / 2;
    c.drawRect(S.XYWHRect(0, 0, w, w), paint(S, '#8f3a34'));
    const ring = (r: number, col: string) => c.drawCircle(cx, cx, r, paint(S, col));
    ring(R * 0.99, '#9c3f37');
    // Tassel scallops on the rim.
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      c.drawCircle(cx + Math.cos(a) * R * 0.95, cx + Math.sin(a) * R * 0.95, R * 0.035, paint(S, '#e6cc98'));
    }
    ring(R * 0.92, '#2f5f6e');
    // Zigzag band.
    ring(R * 0.84, '#e3c995');
    const zz = path(S, (b) => {
      const n = 48;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * TAU;
        const r = i % 2 ? R * 0.70 : R * 0.82;
        if (i === 0) b.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
        else b.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
      }
      b.close();
    });
    c.drawPath(zz, paint(S, '#e2a33f'));
    ring(R * 0.70, '#b84a3c');
    // Dots ring.
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      c.drawCircle(cx + Math.cos(a) * R * 0.635, cx + Math.sin(a) * R * 0.635, R * 0.022, paint(S, '#ead2a2'));
    }
    ring(R * 0.58, '#2f5f6e');
    ring(R * 0.55, '#e2c793');
    // Petal medallion.
    for (let i = 0; i < 12; i++) petal(x, cx, cx, (i / 12) * TAU, R * 0.53, R * 0.11, i % 2 ? '#d9693f' : '#c2463b');
    for (let i = 0; i < 12; i++) petal(x, cx, cx, ((i + 0.5) / 12) * TAU, R * 0.36, R * 0.07, '#e9b04a');
    ring(R * 0.2, '#2f5f6e');
    star(x, cx, cx, R * 0.17, '#f2d07c', 8, 0.5);
    ring(R * 0.05, '#b84a3c');
    // Woven texture.
    const weave = S.Shader.MakeTurbulence(0.6, 0.6, 2, 3, 0, 0);
    c.drawRect(S.XYWHRect(0, 0, w, w), shaderPaint(S, weave, 0.12, Blend.Overlay));
    for (let r = R * 0.1; r < R; r += 5) c.drawCircle(cx, cx, r, paint(S, '#000000', { stroke: 1, alpha: 0.05 }));
    grain(x, 0.12, 0.8);
  },
};

// Patchwork quilt: 4 x 4 patches with little prints and stitches.
const quilt: Spec = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w } = x;
    const cols = ['#d9654e', '#e8b04a', '#3f8c8a', '#f1e2c4', '#5f86ad', '#d98a9a', '#8fb07a', '#c9483f'];
    const rnd = lcg(5);
    const n = 4;
    const s = w / n;
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const x0 = gx * s;
        const y0 = gy * s;
        const k = (gx * 3 + gy * 5 + Math.floor(rnd() * 3)) % cols.length;
        const base = cols[k];
        c.save();
        c.clipRect(S.XYWHRect(x0, y0, s, s), 1, true);
        c.drawRect(S.XYWHRect(x0, y0, s, s), paint(S, base));
        const motif = (gx + gy * 2 + k) % 5;
        const light = k === 3 ? '#c9483f' : '#fff3dc';
        if (motif === 0) {
          for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) c.drawCircle(x0 + (i + 0.5 + (j % 2) * 0.5) * (s / 5), y0 + (j + 0.5) * (s / 5), 4, paint(S, light, { alpha: 0.8 }));
        } else if (motif === 1) {
          for (let i = 0; i < 8; i++) c.drawRect(S.XYWHRect(x0 + (i * s) / 8, y0, s / 16, s), paint(S, light, { alpha: 0.35 }));
        } else if (motif === 2) {
          for (let i = 0; i < 6; i++) {
            c.drawRect(S.XYWHRect(x0 + (i * s) / 6, y0, s / 12, s), paint(S, light, { alpha: 0.25 }));
            c.drawRect(S.XYWHRect(x0, y0 + (i * s) / 6, s, s / 12), paint(S, light, { alpha: 0.25 }));
          }
        } else if (motif === 3) {
          for (let i = 0; i < 4; i++) flower(x, x0 + (i % 2 ? 0.28 : 0.72) * s, y0 + (i < 2 ? 0.28 : 0.72) * s, s * 0.13, light, '#e8b04a');
        } else {
          star(x, x0 + s / 2, y0 + s / 2, s * 0.32, light, 5, 0.45, -Math.PI / 2, 0.85);
        }
        c.restore();
        // Stitches.
        const sp = paint(S, '#fff6e4', { stroke: 2, alpha: 0.75 });
        for (let t = 6; t < s; t += 12) {
          c.drawLine(x0 + t, y0 + 5, x0 + t + 6, y0 + 5, sp);
          c.drawLine(x0 + 5, y0 + t, x0 + 5, y0 + t + 6, sp);
        }
        c.drawRect(S.XYWHRect(x0, y0, s, s), paint(S, '#3a2418', { stroke: 2.5, alpha: 0.45 }));
      }
    }
    // Puffy shading per patch.
    for (let gy = 0; gy < n; gy++) {
      for (let gx = 0; gx < n; gx++) {
        const cx = (gx + 0.5) * s;
        const cy = (gy + 0.5) * s;
        c.drawRect(S.XYWHRect(gx * s, gy * s, s, s), shaderPaint(S, radial(S, cx - s * 0.1, cy - s * 0.1, s * 0.75, ['#ffffff22', '#00000000', '#00000030'], [0, 0.6, 1])));
      }
    }
    grain(x, 0.12, 0.8);
  },
};

// A shelf row of book spines (alpha-cut tops, tiles along u).
function spines(x: Ctx, seed: number, minW: number, maxW: number) {
  const { S, c, w, h } = x;
  const cols = ['#9c3b35', '#2f5f6e', '#d08a3c', '#4c6e3e', '#6d4b7d', '#c9b48a', '#a5523a', '#3b4f78', '#7a2f3f', '#e2c27a', '#5a8a8a'];
  const rnd = lcg(seed);
  let px = 0;
  const books: { x: number; w: number; top: number; col: string; lean: number }[] = [];
  while (px < w - minW) {
    let bw = minW + rnd() * (maxW - minW);
    if (w - px - bw < minW) bw = w - px;
    books.push({ x: px, w: bw, top: h * (0.04 + rnd() * 0.3), col: cols[Math.floor(rnd() * cols.length)], lean: 0 });
    px += bw;
  }
  wrapped(x, () => {
    for (const b of books) {
      const bx = b.x;
      const top = b.top;
      const rr = Math.min(6, b.w * 0.2);
      c.drawRRect(S.RRectXY(S.XYWHRect(bx + 1, top, b.w - 2, h - top + 4), rr, rr), paint(S, b.col));
      // Rounded spine shading.
      c.drawRect(S.XYWHRect(bx + 1, top, b.w - 2, h - top), shaderPaint(S, linear(S, bx, 0, bx + b.w, 0, ['#00000055', '#ffffff30', '#ffffff10', '#00000066'], [0, 0.35, 0.6, 1])));
      // Gold bands and a label.
      const gp = shaderPaint(S, gold(S, bx, 0, bx + b.w, 0));
      const bh = h - top;
      c.drawRect(S.XYWHRect(bx + 2, top + bh * 0.08, b.w - 4, 3), gp);
      c.drawRect(S.XYWHRect(bx + 2, top + bh * 0.14, b.w - 4, 2), gp);
      c.drawRect(S.XYWHRect(bx + 2, top + bh * 0.86, b.w - 4, 3), gp);
      if (b.w > (minW + maxW) * 0.45) c.drawRect(S.XYWHRect(bx + b.w * 0.2, top + bh * 0.32, b.w * 0.6, bh * 0.18), paint(S, '#f1e2c0', { alpha: 0.85 }));
      else c.drawCircle(bx + b.w / 2, top + bh * 0.42, b.w * 0.18, gp);
      c.drawLine(bx + 1, top, bx + 1, h, paint(S, '#1e140e', { stroke: 1.5, alpha: 0.6 }));
    }
  });
}

const book_spines: Spec = {
  w: 512,
  h: 256,
  tile: true,
  alpha: true,
  paint: (x) => spines(x, 17, 22, 46),
};

const spines_small: Spec = {
  w: 256,
  h: 128,
  tile: true,
  alpha: true,
  paint: (x) => spines(x, 29, 10, 22),
};

// Candle / lantern flame (alpha-cut teardrop).
const flame: Spec = {
  w: 128,
  h: 256,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const f = path(S, (b) => {
      b.moveTo(w / 2, 6);
      b.cubicTo(w * 0.62, h * 0.35, w * 0.95, h * 0.55, w * 0.88, h * 0.75);
      b.cubicTo(w * 0.8, h * 0.98, w * 0.2, h * 0.98, w * 0.12, h * 0.75);
      b.cubicTo(w * 0.05, h * 0.55, w * 0.38, h * 0.35, w / 2, 6);
      b.close();
    });
    c.drawPath(f, shaderPaint(S, radial(S, w / 2, h * 0.72, h * 0.6, ['#ffffff', '#fff2b0', '#ffc24a', '#f07a2a'], [0, 0.3, 0.65, 1])));
  },
};

// ---------------------------------------------------------------- characters

// Mira's face: brows, rosy cheeks, freckles, a small smile (the eyes are geometry).
const girl: Spec = {
  w: 512,
  h: 512,
  paint: (x) => {
    const { S, c, w } = x;
    const cx = w / 2;
    c.drawRect(S.XYWHRect(0, 0, w, w), shaderPaint(S, radial(S, cx * 0.9, cx * 0.85, w * 0.62, ['#fde3cf', '#f6cfb3', '#e9b597'], [0, 0.6, 1])));
    // Cheeks.
    for (const s of [-1, 1]) c.drawCircle(cx + s * w * 0.21, w * 0.64, w * 0.1, shaderPaint(S, radial(S, cx + s * w * 0.21, w * 0.64, w * 0.1, ['#f28b80cc', '#f28b8000'])));
    // Eyes are separate paper pieces (they blink); only the brows are printed.
    for (const s of [-1, 1]) {
      const ex = cx + s * w * 0.15;
      const brow = path(S, (b) => {
        b.moveTo(ex - w * 0.06, w * 0.38);
        b.quadTo(ex, w * 0.35, ex + w * 0.06, w * 0.38);
      });
      c.drawPath(brow, paint(S, '#7a3f2c', { stroke: 7, alpha: 0.8 }));
      // A soft shadow where the eye sits in the face.
      c.drawOval(S.XYWHRect(ex - w * 0.085, w * 0.44, w * 0.17, w * 0.17), shaderPaint(S, radial(S, ex, w * 0.53, w * 0.09, ['#d9a58833', '#d9a58800'])));
    }
    // Freckles.
    const rnd = lcg(3);
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) c.drawCircle(cx + s * w * (0.15 + rnd() * 0.12), w * (0.6 + rnd() * 0.06), 4, paint(S, '#b9714f', { alpha: 0.55 }));
    // Nose and smile.
    const nose = path(S, (b) => {
      b.moveTo(cx - 10, w * 0.62);
      b.quadTo(cx, w * 0.645, cx + 10, w * 0.62);
    });
    c.drawPath(nose, paint(S, '#c27d62', { stroke: 6 }));
    const mouth = path(S, (b) => {
      b.moveTo(cx - w * 0.06, w * 0.71);
      b.quadTo(cx, w * 0.77, cx + w * 0.06, w * 0.71);
    });
    c.drawPath(mouth, paint(S, '#a8423c', { stroke: 8 }));
    grain(x, 0.08, 0.8);
  },
};

// Fox fur: neutral so the vertex colour (orange, white, dark) tints it.
const fox: Spec = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    fill(x, '#ececec');
    const rnd = lcg(12);
    wrapped(x, () => {
      for (let i = 0; i < 260; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const l = 8 + rnd() * 10;
        const a = 0.3 + (rnd() - 0.5) * 0.6;
        const col = rnd() < 0.5 ? '#ffffff' : '#b9b9b9';
        const st = path(S, (b) => {
          b.moveTo(px, py);
          b.quadTo(px + Math.cos(a) * l * 0.5 + 3, py + Math.sin(a) * l * 0.5, px + Math.cos(a) * l, py + Math.sin(a) * l);
        });
        c.drawPath(st, paint(S, col, { stroke: 2, alpha: 0.55 }));
      }
    });
    grain(x, 0.1, 0.8);
  },
};

// ---------------------------------------------------------------- textiles and decor

// Curtain fabric: soft folds and a small dotted print (tinted by vertex colour).
const curtain: Spec = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    fill(x, '#f2f2f2');
    wrapped(x, () => {
      c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, 0, 0, w, 0, ['#c8c8c8', '#ffffff', '#d6d6d6', '#bdbdbd', '#ffffff', '#c8c8c8'], [0, 0.22, 0.45, 0.6, 0.82, 1])));
      for (let j = 0; j < 8; j++) {
        for (let i = 0; i < 4; i++) {
          const px = (i + 0.5 + (j % 2) * 0.5) * (w / 4);
          const py = (j + 0.5) * (h / 8);
          flower(x, px, py, 7, '#ffffff', '#d8d8d8', 4, j);
        }
      }
    });
    grain(x, 0.1, 0.8);
  },
};

// The little painting on the wall: the Lantern House at night.
const frame_picture: Spec = {
  w: 256,
  h: 320,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), paint(S, '#efe0c0'));
    const m = 22;
    c.save();
    c.clipRect(S.XYWHRect(m, m, w - 2 * m, h - 2 * m), 1, true);
    c.drawRect(S.XYWHRect(m, m, w - 2 * m, h - 2 * m), shaderPaint(S, linear(S, 0, m, 0, h - m, ['#1d2350', '#3a3f7a', '#6a4f78'])));
    c.drawCircle(w * 0.72, h * 0.22, 20, paint(S, '#fff0c4'));
    const rnd = lcg(8);
    for (let i = 0; i < 26; i++) c.drawCircle(m + rnd() * (w - 2 * m), m + rnd() * h * 0.45, 1.2 + rnd() * 1.6, paint(S, '#ffe9b0', { alpha: 0.8 }));
    // Hills and trees.
    const hill = path(S, (b) => {
      b.moveTo(0, h * 0.72);
      b.cubicTo(w * 0.3, h * 0.6, w * 0.6, h * 0.78, w, h * 0.66);
      b.lineTo(w, h);
      b.lineTo(0, h);
      b.close();
    });
    c.drawPath(hill, paint(S, '#264c5c'));
    for (const [tx, ts, col] of [
      [0.2, 1, '#d9826a'],
      [0.84, 0.9, '#6fb3a6'],
    ] as [number, number, string][]) {
      c.drawRect(S.XYWHRect(w * tx - 3, h * 0.5, 6, h * 0.25), paint(S, '#4a2a22'));
      c.drawOval(S.XYWHRect(w * tx - 30 * ts, h * 0.42, 60 * ts, 34 * ts), paint(S, col));
    }
    // The house and its tower.
    const hx = w / 2;
    c.drawRect(S.XYWHRect(hx - 36, h * 0.58, 72, h * 0.16), paint(S, '#c9773f'));
    c.drawRect(S.XYWHRect(hx - 22, h * 0.44, 44, h * 0.14), paint(S, '#d88a4e'));
    const roof = (y: number, hw: number, hh: number) => {
      const p = path(S, (b) => {
        b.moveTo(hx - hw, y);
        b.lineTo(hx + hw, y);
        b.lineTo(hx, y - hh);
        b.close();
      });
      c.drawPath(p, paint(S, '#2f6f9a'));
    };
    roof(h * 0.6, 50, 22);
    roof(h * 0.45, 34, 50);
    c.drawCircle(hx, h * 0.5, 8, paint(S, '#ffd88a'));
    for (const dx of [-20, 0, 20]) c.drawRect(S.XYWHRect(hx + dx - 5, h * 0.63, 10, 14), paint(S, '#ffcf6a'));
    c.restore();
    c.drawRect(S.XYWHRect(m, m, w - 2 * m, h - 2 * m), paint(S, '#5a3a22', { stroke: 3, alpha: 0.6 }));
    grain(x, 0.12, 0.8);
  },
};

// Trailing pot plant leaves (alpha-cut, tinted green).
const plant: Spec = {
  w: 256,
  h: 256,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const rnd = lcg(44);
    const leaf = (lx: number, ly: number, a: number, s: number, tone: number) => {
      c.save();
      c.translate(lx, ly);
      c.rotate((a * 180) / Math.PI, 0, 0);
      const p = path(S, (b) => {
        b.moveTo(0, 0);
        b.cubicTo(s * 0.7, -s * 0.2, s * 0.9, -s * 0.9, 0, -s * 1.3);
        b.cubicTo(-s * 0.9, -s * 0.9, -s * 0.7, -s * 0.2, 0, 0);
        b.close();
      });
      const v = Math.round(200 + tone * 55);
      c.drawPath(p, paint(S, `rgb(${v},${v},${v})`));
      c.drawLine(0, 0, 0, -s * 1.15, paint(S, '#8a8a8a', { stroke: 2, alpha: 0.7 }));
      c.drawPath(p, paint(S, '#6a6a6a', { stroke: 1.5, alpha: 0.5 }));
      c.restore();
    };
    // Stems from the bottom centre, arching out and down.
    for (let k = 0; k < 7; k++) {
      const side = k % 2 ? 1 : -1;
      const spread = 0.15 + rnd() * 0.32;
      const x0 = w / 2 + (rnd() - 0.5) * 20;
      const y0 = h - 4;
      const tipx = w / 2 + side * w * spread;
      const tipy = h * (0.05 + rnd() * 0.4);
      const stem = path(S, (b) => {
        b.moveTo(x0, y0);
        b.quadTo(w / 2 + side * w * spread * 0.2, tipy, tipx, tipy + 10);
      });
      c.drawPath(stem, paint(S, '#9a9a9a', { stroke: 4 }));
      for (let i = 1; i <= 4; i++) {
        const t = i / 4.4;
        const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * (w / 2 + side * w * spread * 0.2) + t * t * tipx;
        const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * tipy + t * t * (tipy + 10);
        leaf(px, py, side * (0.5 + rnd() * 0.8) + (rnd() - 0.5) * 0.4, 18 + rnd() * 10, rnd());
      }
    }
  },
};

// attic_a: paper lace trim (scallops + holes), tiles along u.
const lace: Spec = {
  w: 512,
  h: 128,
  tile: true,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const clear = paint(S, '#000000', { blend: Blend.Clear });
    wrapped(x, () => {
      c.drawRect(S.XYWHRect(0, 0, w, h * 0.55), paint(S, '#f6f6f6'));
      const n = 8;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * (w / n);
        c.drawCircle(cx, h * 0.55, w / n / 2, paint(S, '#f6f6f6'));
      }
    });
    wrapped(x, () => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const cx = (i + 0.5) * (w / n);
        c.drawCircle(cx, h * 0.6, 9, clear);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI + Math.PI * 0.08;
          c.drawCircle(cx + Math.cos(a) * 21, h * 0.55 + Math.sin(a) * 21, 3.6, clear);
        }
        c.drawCircle(cx + w / n / 2, h * 0.28, 6, clear);
        c.drawCircle(cx, h * 0.18, 3.5, clear);
      }
    });
    wrapped(x, () => {
      c.drawLine(0, h * 0.06, w, h * 0.06, paint(S, '#cfcfcf', { stroke: 3, cap: Cap.Butt }));
    });
  },
};

// attic_b: the open book on Mira's lap (two pages: text, a drop cap and a starry lantern picture).
const bookSpread: Spec = {
  w: 512,
  h: 320,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), paint(S, '#f6ecd6'));
    // Gutter shadow.
    c.drawRect(S.XYWHRect(w / 2 - 40, 0, 80, h), shaderPaint(S, linear(S, w / 2 - 40, 0, w / 2 + 40, 0, ['#00000000', '#5a3a2a40', '#00000000'])));
    const lines = (x0: number, y0: number, x1: number, y1: number, seed: number) => {
      const rnd = lcg(seed);
      for (let y = y0; y < y1; y += 17) {
        let px = x0;
        while (px < x1 - 10) {
          const ww = 10 + rnd() * 34;
          c.drawRect(S.XYWHRect(px, y, Math.min(ww, x1 - px), 6), paint(S, '#5a4636', { alpha: 0.65 }));
          px += ww + 7;
        }
      }
    };
    // Left page: a picture of a lantern full of stars.
    const lx = 34;
    c.drawRRect(S.RRectXY(S.XYWHRect(lx, 30, w / 2 - 70, 150), 8, 8), shaderPaint(S, linear(S, 0, 30, 0, 180, ['#1e2a5a', '#3b3f86'])));
    const pcx = lx + (w / 2 - 70) / 2;
    c.drawCircle(pcx, 108, 40, paint(S, '#ffd27a'));
    c.drawCircle(pcx, 108, 40, paint(S, '#c08a2e', { stroke: 6 }));
    const rnd = lcg(21);
    for (let i = 0; i < 16; i++) star(x, lx + 10 + rnd() * (w / 2 - 90), 40 + rnd() * 130, 3 + rnd() * 4, '#ffe9a8', 5, 0.45);
    star(x, pcx, 108, 16, '#fff6dc', 5, 0.45);
    lines(lx, 200, w / 2 - 36, h - 30, 4);
    // Right page: drop cap and text.
    const rx = w / 2 + 36;
    c.drawRect(S.XYWHRect(rx, 34, 44, 44), paint(S, '#b8483b'));
    text(x, 'O', rx + 22, 70, 'serifBold', 38, '#f6ecd6', 'center');
    lines(rx + 54, 38, w - 34, 82, 9);
    lines(rx, 98, w - 34, h - 30, 13);
    grain(x, 0.08, 0.8);
  },
};

// attic_c: the night outside the side window.
const nightSky: Spec = {
  w: 256,
  h: 256,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, 0, 0, 0, h, ['#121a44', '#24306a', '#4a3f78'])));
    const rnd = lcg(77);
    for (let i = 0; i < 70; i++) {
      const r = rnd() < 0.85 ? 0.8 + rnd() * 1.2 : 2 + rnd() * 1.5;
      c.drawCircle(rnd() * w, rnd() * h * 0.85, r, paint(S, rnd() < 0.5 ? '#fff4d0' : '#cfe0ff', { alpha: 0.6 + rnd() * 0.4 }));
    }
    for (let i = 0; i < 4; i++) star(x, rnd() * w, rnd() * h * 0.6, 5, '#fff2c0', 4, 0.3, 0);
    // Distant paper treetops.
    const tops = path(S, (b) => {
      b.moveTo(0, h);
      for (let i = 0; i <= 12; i++) {
        const px = (i / 12) * w;
        b.lineTo(px, h * (0.82 - 0.08 * Math.abs(Math.sin(i * 1.7))));
      }
      b.lineTo(w, h);
      b.close();
    });
    c.drawPath(tops, paint(S, '#141a3a'));
  },
};

// attic_d: Mira's crayon drawing of Ember under the moon.
const drawing: Spec = {
  w: 256,
  h: 200,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), paint(S, '#f8f1e2'));
    const crayon = (col: string, sw: number) => paint(S, col, { stroke: sw, alpha: 0.9 });
    // Sky scribble and the moon.
    for (let i = 0; i < 18; i++) c.drawLine(10 + i * 13, 8, 4 + i * 13, 58, crayon('#5a78b8', 5));
    c.drawCircle(w * 0.8, 40, 22, paint(S, '#f4d35e'));
    c.drawCircle(w * 0.8, 40, 22, crayon('#e0a92e', 3));
    star(x, w * 0.25, 30, 9, '#f4d35e', 5, 0.45);
    star(x, w * 0.48, 22, 7, '#f4d35e', 5, 0.45);
    // Grass.
    for (let i = 0; i < 26; i++) c.drawLine(6 + i * 10, h - 6, 10 + i * 10, h - 26, crayon('#5ea05a', 4));
    // The fox: body, head, ears, tail with a white tip.
    c.drawOval(S.XYWHRect(w * 0.3, h * 0.5, w * 0.36, h * 0.3), paint(S, '#e87a33'));
    c.drawCircle(w * 0.3, h * 0.55, 24, paint(S, '#e87a33'));
    for (const ex of [-12, 8]) {
      const ear = path(S, (b) => {
        b.moveTo(w * 0.3 + ex - 8, h * 0.45);
        b.lineTo(w * 0.3 + ex + 2, h * 0.3);
        b.lineTo(w * 0.3 + ex + 10, h * 0.45);
        b.close();
      });
      c.drawPath(ear, paint(S, '#e87a33'));
    }
    const tail = path(S, (b) => {
      b.moveTo(w * 0.64, h * 0.68);
      b.quadTo(w * 0.86, h * 0.62, w * 0.82, h * 0.42);
    });
    c.drawPath(tail, crayon('#e87a33', 22));
    c.drawCircle(w * 0.82, h * 0.42, 10, paint(S, '#ffffff'));
    c.drawCircle(w * 0.3 - 8, h * 0.53, 3, paint(S, '#2a2a2a'));
    c.drawCircle(w * 0.3 - 22, h * 0.6, 4, paint(S, '#2a2a2a'));
    // A wobbly outline, like a child's hand.
    c.drawOval(S.XYWHRect(w * 0.3, h * 0.5, w * 0.36, h * 0.3), crayon('#b8552a', 3));
    c.drawCircle(w * 0.3, h * 0.55, 24, crayon('#b8552a', 3));
    grain(x, 0.12, 0.8);
  },
};

export const ATTIC_PAINTERS: Record<string, Spec> = {
  wallpaper,
  floorboards,
  rug,
  quilt,
  book_spines,
  spines_small,
  flame,
  girl,
  fox,
  curtain,
  frame_picture,
  plant,
  attic_a: lace,
  attic_b: bookSpread,
  attic_c: nightSky,
  attic_d: drawing,
};

