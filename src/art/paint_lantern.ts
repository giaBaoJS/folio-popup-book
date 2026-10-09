// Atlas painters for chapter III, the night sea inside the lantern. Keys are pattern names
// from patterns.json. Tinted patterns are painted light/neutral; unique art in full colour.
import type { Ctx, Spec } from './brush';
import { Blend, Cap, grain, lcg, linear, paint, paragraph, path, radial, shaderPaint, text, wrapped } from './brush';

const clear = (x: Ctx) => paint(x.S, '#000000', { blend: Blend.Clear });

// Little spiral curl, the signature stroke of the cut-paper sea.
function curl(x: Ctx, cx: number, cy: number, r: number, turns: number, col: string, sw: number, alpha: number, dir = 1) {
  const p = path(x.S, (b) => {
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = dir * t * turns * Math.PI * 2;
      const rr = r * (1 - t * 0.85);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr;
      if (i === 0) b.moveTo(px, py);
      else b.lineTo(px, py);
    }
  });
  x.c.drawPath(p, paint(x.S, col, { stroke: sw, alpha }));
}

// Wave linework for the sea strips (tinted, tiles): flowing lines, curls and foam dots.
const waves: Spec = {
  w: 512,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const rnd = lcg(311);
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#cfd5da'));
    wrapped(x, () => {
      // Long flowing swell lines (periodic in x so the tile wraps).
      for (let i = 0; i < 7; i++) {
        const y0 = (i + 0.5) * (h / 7);
        const ph = rnd() * 6.28;
        const amp = 6 + rnd() * 8;
        const g = path(S, (b) => {
          for (let xx = 0; xx <= w; xx += 8) {
            const y = y0 + Math.sin((xx / w) * Math.PI * 4 + ph) * amp;
            if (xx === 0) b.moveTo(xx, y);
            else b.lineTo(xx, y);
          }
        });
        c.drawPath(g, paint(S, '#ffffff', { stroke: 3, alpha: 0.85 }));
        c.save();
        c.translate(0, 4);
        c.drawPath(g, paint(S, '#9aa3ae', { stroke: 1.4, alpha: 0.45 }));
        c.restore();
      }
      // Curls.
      for (let i = 0; i < 6; i++) {
        const cx = rnd() * w;
        const cy = rnd() * h;
        const r = 10 + rnd() * 12;
        curl(x, cx, cy, r, 1.3, '#ffffff', 2.6, 0.85, rnd() > 0.5 ? 1 : -1);
      }
      // Foam dots and dashes.
      for (let i = 0; i < 70; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        if (rnd() > 0.5) c.drawCircle(px, py, 1.2 + rnd() * 2, paint(S, '#ffffff', { alpha: 0.55 }));
        else c.drawLine(px, py, px + 6 + rnd() * 8, py, paint(S, '#ffffff', { stroke: 1.6, alpha: 0.45 }));
      }
    });
    grain(x, 0.1, 0.8);
  },
};

// Four puffy cut-paper clouds, one per row (512 x 128 each). Tinted.
const clouds: Spec = {
  w: 512,
  h: 512,
  alpha: true,
  paint: (x) => {
    const { S, c, w } = x;
    const rh = 128;
    for (let k = 0; k < 4; k++) {
      const r = lcg(71 + k * 13);
      c.save();
      c.translate(0, k * rh);
      // A row of overlapping puffs on a flat-ish base.
      const base = rh * 0.86;
      const puffs: [number, number, number][] = [];
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = w * (0.1 + t * 0.8) + (r() - 0.5) * 20;
        const mid = 1 - Math.abs(t - 0.5) * 2;
        const pr = rh * (0.16 + 0.22 * mid + r() * 0.08);
        puffs.push([px, base - pr * (0.55 + r() * 0.35), pr]);
      }
      const shape = path(S, (b) => {
        b.addRRect(S.RRectXY(S.XYWHRect(w * 0.08, base - rh * 0.18, w * 0.84, rh * 0.18), rh * 0.09, rh * 0.09));
        for (const [px, py, pr] of puffs) b.addCircle(px, py, pr);
      });
      c.drawPath(shape, shaderPaint(S, linear(S, 0, rh * 0.05, 0, base, ['#ffffff', '#f0f0f0', '#c9c9cf'])));
      // Inner scallop linework: each puff's upper arc, offset inwards.
      for (const [px, py, pr] of puffs) {
        const arc = path(S, (b) => {
          b.addArc(S.XYWHRect(px - pr * 0.72, py - pr * 0.72, pr * 1.44, pr * 1.44), 200, 120);
        });
        c.drawPath(arc, paint(S, '#ffffff', { stroke: 3, alpha: 0.9 }));
        const arc2 = path(S, (b) => {
          b.addArc(S.XYWHRect(px - pr * 0.9, py - pr * 0.9, pr * 1.8, pr * 1.8), 20, 140);
        });
        c.drawPath(arc2, paint(S, '#9a9aa8', { stroke: 2, alpha: 0.45 }));
      }
      // A few lace holes along the base and a curl.
      const cl = clear(x);
      for (let i = 0; i < 7; i++) {
        const hx = w * (0.18 + (i / 6) * 0.64);
        c.drawCircle(hx, base - rh * 0.09, 3.2, cl);
      }
      curl(x, puffs[1][0], puffs[1][1], puffs[1][2] * 0.45, 1.2, '#b4b4c0', 2.2, 0.6);
      c.drawPath(shape, paint(S, '#8e8ea0', { stroke: 2.5, alpha: 0.5 }));
      c.restore();
    }
  },
};

// Red and cream bands of the lighthouse (full colour, tiles vertically: one red + one cream band).
const lighthouse: Spec = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#f4ead6'));
    wrapped(x, () => {
      c.drawRect(S.XYWHRect(0, 0, w, h / 2), paint(S, '#c8473c'));
      // Paper strip seams: the bands are glued strips with a darker lap line.
      for (const y of [0, h / 2]) {
        c.drawLine(0, y + 2, w, y + 2, paint(S, '#5a1f1a', { stroke: 3, alpha: 0.35, cap: Cap.Butt }));
        c.drawLine(0, y + 6, w, y + 6, paint(S, '#ffffff', { stroke: 2, alpha: 0.35, cap: Cap.Butt }));
      }
      // Rivet dots.
      for (let i = 0; i < 8; i++) {
        c.drawCircle((i + 0.5) * (w / 8), h * 0.45, 2.5, paint(S, '#7a2a22', { alpha: 0.5 }));
        c.drawCircle((i + 0.5) * (w / 8), h * 0.95, 2.5, paint(S, '#b9a98c', { alpha: 0.6 }));
      }
    });
    grain(x, 0.12, 0.7);
  },
};

// The paper boat is folded from a storybook page (full colour).
const sail: Spec = {
  w: 512,
  h: 512,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, radial(S, w * 0.5, h * 0.4, w * 0.8, ['#fbf4e2', '#f1e4c6', '#e2cfa6'])));
    grain(x, 0.14, 0.7);
    // Printed text: the page the boat was folded from.
    text(x, 'III', w * 0.5, 70, 'serifItalic', 34, '#7a4d2e', 'center', 0.75);
    const body =
      'Once there was a lantern so old that it had forgotten how to go out. Inside its glass there was a sea, and on the sea a small boat, and in the boat a light for anyone who might be lost on the way home. ' +
      'The keeper of the light kept the stars dusted and the moon hung straight, and every night the paper waves came in, one row after another.';
    paragraph(x, body, 48, 120, w - 96, 'serifItalic', 22, 30, '#4a3424', 0.7);
    c.drawLine(w * 0.3, h - 60, w * 0.7, h - 60, paint(S, '#9b7a55', { stroke: 1.5, alpha: 0.6 }));
    c.drawCircle(w * 0.5, h - 60, 4, paint(S, '#9b7a55', { alpha: 0.6 }));
    // Fold creases.
    for (const [x0, y0, x1, y1] of [
      [0, 0, w, h],
      [w, 0, 0, h],
      [w / 2, 0, w / 2, h],
    ]) {
      c.drawLine(x0, y0, x1, y1, paint(S, '#8a6a44', { stroke: 2, alpha: 0.22 }));
      c.drawLine(x0 + 3, y0, x1 + 3, y1, paint(S, '#ffffff', { stroke: 2, alpha: 0.35 }));
    }
  },
};

// Faceted stone (tinted, tiles).
const rocks: Spec = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const rnd = lcg(907);
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#d4d4d8'));
    wrapped(x, () => {
      // Facets: irregular polygons in slightly different tones.
      for (let i = 0; i < 40; i++) {
        const cx = rnd() * w;
        const cy = rnd() * h;
        const r = 30 + rnd() * 60;
        const n = 5 + Math.floor(rnd() * 3);
        const v = Math.round(190 + rnd() * 60);
        const f = path(S, (b) => {
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
            const rr = r * (0.6 + rnd() * 0.4);
            if (k === 0) b.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7);
            else b.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7);
          }
          b.close();
        });
        c.drawPath(f, paint(S, `rgb(${v},${v},${v + 4})`, { alpha: 0.7 }));
        c.drawPath(f, paint(S, '#6e6e7a', { stroke: 1.6, alpha: 0.35 }));
      }
      // Cracks.
      for (let i = 0; i < 14; i++) {
        let px = rnd() * w;
        let py = rnd() * h;
        const g = path(S, (b) => {
          b.moveTo(px, py);
          for (let k = 0; k < 5; k++) {
            px += (rnd() - 0.5) * 40;
            py += 8 + rnd() * 20;
            b.lineTo(px, py);
          }
        });
        c.drawPath(g, paint(S, '#4e4e5a', { stroke: 1.8, alpha: 0.45 }));
      }
      // Lichen speckle.
      for (let i = 0; i < 160; i++) c.drawCircle(rnd() * w, rnd() * h, 1 + rnd() * 2.2, paint(S, rnd() > 0.5 ? '#ffffff' : '#8a8a96', { alpha: 0.4 }));
    });
    grain(x, 0.12, 0.8);
  },
};

// The lighthouse beam: cut-paper petals of light, solid near the lamp, with lace holes
// along each petal. Tinted, tiles around the cone (u); v runs from the lamp (0) outwards.
const beam: Spec = {
  w: 256,
  h: 512,
  alpha: true,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const rnd = lcg(5151);
    const rays = 3;
    const lens = Array.from({ length: rays }, () => h * (0.88 + rnd() * 0.1));
    const cl = clear(x);
    for (const dx of [-w, 0, w]) {
      for (let i = 0; i < rays; i++) {
        const cx = dx + ((i + 0.5) / rays) * w;
        const len = lens[i];
        const w0 = (w / rays) * 1.02;
        const w1 = (w / rays) * 0.3;
        const ray = path(S, (b) => {
          b.moveTo(cx - w0 / 2, 0);
          b.lineTo(cx + w0 / 2, 0);
          b.cubicTo(cx + w0 / 2, len * 0.35, cx + w1 / 2, len * 0.7, cx + w1 / 2, len - w1 / 2);
          b.quadTo(cx + w1 / 2, len + w1 * 0.25, cx, len + w1 * 0.25);
          b.quadTo(cx - w1 / 2, len + w1 * 0.25, cx - w1 / 2, len - w1 / 2);
          b.cubicTo(cx - w1 / 2, len * 0.7, cx - w0 / 2, len * 0.35, cx - w0 / 2, 0);
          b.close();
        });
        c.drawPath(ray, shaderPaint(S, linear(S, 0, 0, 0, len, ['#ffffff', '#fff7e6', '#ffeccb'])));
        // A crease down the middle of each petal.
        c.drawLine(cx - w0 * 0.22, h * 0.06, cx - w1 * 0.25, len - w1 * 0.4, paint(S, '#e8c890', { stroke: 2, alpha: 0.45 }));
        // Lace: a row of holes growing towards the tip.
        for (let k = 0; k < 7; k++) {
          const t = (k + 1) / 8;
          const r = 1.5 + t * 3.5;
          c.drawCircle(cx, h * 0.2 + t * (len - h * 0.3), r, cl);
        }
      }
    }
  },
};

// A leaping paper fish (full colour), nose to the right.
const leapingFish: Spec = {
  w: 256,
  h: 128,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const body = path(S, (b) => {
      b.moveTo(w * 0.95, h * 0.5);
      b.cubicTo(w * 0.85, h * 0.12, w * 0.45, h * 0.08, w * 0.24, h * 0.42);
      b.lineTo(w * 0.06, h * 0.14);
      b.cubicTo(w * 0.1, h * 0.4, w * 0.1, h * 0.6, w * 0.06, h * 0.86);
      b.lineTo(w * 0.24, h * 0.58);
      b.cubicTo(w * 0.45, h * 0.92, w * 0.85, h * 0.88, w * 0.95, h * 0.5);
      b.close();
    });
    c.drawPath(body, shaderPaint(S, linear(S, 0, h * 0.1, 0, h * 0.9, ['#ffd27a', '#f39a4a', '#e2683a'])));
    // Fins.
    const fin = path(S, (b) => {
      b.moveTo(w * 0.62, h * 0.2);
      b.quadTo(w * 0.52, h * 0.0, w * 0.4, h * 0.06);
      b.lineTo(w * 0.46, h * 0.24);
      b.close();
    });
    c.drawPath(fin, paint(S, '#f6b45e'));
    // Scales.
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 6; k++) {
        const px = w * (0.36 + k * 0.08);
        const py = h * (0.36 + r * 0.14);
        const arc = path(S, (b) => b.addArc(S.XYWHRect(px - 9, py - 9, 18, 18), 300, 120));
        c.drawPath(arc, paint(S, '#fff1c8', { stroke: 2, alpha: 0.7 }));
      }
    }
    // Tail stripes and gill.
    for (let i = 0; i < 3; i++) c.drawLine(w * 0.08, h * (0.3 + i * 0.2), w * 0.2, h * 0.5, paint(S, '#b6482a', { stroke: 2, alpha: 0.6 }));
    const gill = path(S, (b) => b.addArc(S.XYWHRect(w * 0.68, h * 0.28, w * 0.12, h * 0.44), 120, 120));
    c.drawPath(gill, paint(S, '#b6482a', { stroke: 2.5, alpha: 0.7 }));
    c.drawCircle(w * 0.83, h * 0.42, 6, paint(S, '#2a1a22'));
    c.drawCircle(w * 0.835, h * 0.41, 2, paint(S, '#ffffff'));
    c.drawPath(body, paint(S, '#8a3420', { stroke: 2, alpha: 0.6 }));
  },
};

// Lace halo behind the moon (tinted): a scalloped ring with ray cut-outs.
const moonHalo: Spec = {
  w: 512,
  h: 512,
  alpha: true,
  paint: (x) => {
    const { S, c, w } = x;
    const cx = w / 2;
    const R = w * 0.48;
    const r0 = w * 0.3;
    const ring = path(S, (b) => {
      const n = 360;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = R * (1 - 0.06 * Math.pow(Math.abs(Math.sin(a * 12)), 0.7));
        if (i === 0) b.moveTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
        else b.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
      }
      b.close();
    });
    c.drawPath(ring, shaderPaint(S, radial(S, cx, cx, R, ['#ffffff', '#ffffff', '#e6e6e6'], [0, 0.6, 1])));
    const cl = clear(x);
    c.drawCircle(cx, cx, r0, cl);
    for (let k = 0; k < 24; k++) {
      const a = ((k + 0.5) / 24) * Math.PI * 2;
      c.save();
      c.translate(cx, cx);
      c.rotate((a * 180) / Math.PI, 0, 0);
      const slot = path(S, (b) => {
        b.moveTo(r0 + 14, -3);
        b.lineTo(R * 0.86, -9);
        b.quadTo(R * 0.9, 0, R * 0.86, 9);
        b.lineTo(r0 + 14, 3);
        b.close();
      });
      c.drawPath(slot, cl);
      c.restore();
      c.drawCircle(cx + Math.cos(a + 0.13) * R * 0.9, cx + Math.sin(a + 0.13) * R * 0.9, 4, cl);
    }
    c.drawCircle(cx, cx, r0 + 6, paint(S, '#c9c9c9', { stroke: 3, alpha: 0.7 }));
  },
};

// Calm water under the waves (tinted, tiles): sparse rippled lines.
const calmWater: Spec = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const rnd = lcg(4242);
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#e4e6ea'));
    wrapped(x, () => {
      for (let i = 0; i < 16; i++) {
        const y0 = (i + 0.5) * (h / 16);
        const x0 = rnd() * w;
        const len = 40 + rnd() * 120;
        const g = path(S, (b) => {
          for (let k = 0; k <= 10; k++) {
            const xx = x0 + (k / 10) * len;
            const y = y0 + Math.sin(k * 1.2 + i) * 2.5;
            if (k === 0) b.moveTo(xx, y);
            else b.lineTo(xx, y);
          }
        });
        c.drawPath(g, paint(S, '#ffffff', { stroke: 2, alpha: 0.6 }));
      }
    });
    grain(x, 0.08, 0.8);
  },
};

// Lantern-room glazing of the lighthouse (full colour).
const glazing: Spec = {
  w: 256,
  h: 128,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), shaderPaint(S, radial(S, w / 2, h / 2, w * 0.7, ['#fffbe6', '#ffe08a', '#f2a94a'])));
    wrapped(x, () => {
      for (let i = 0; i <= 4; i++) c.drawLine((i * w) / 4, 0, (i * w) / 4, h, paint(S, '#3a2a2a', { stroke: 7, alpha: 0.8, cap: Cap.Butt }));
      c.drawLine(0, h * 0.5, w, h * 0.5, paint(S, '#3a2a2a', { stroke: 4, alpha: 0.6, cap: Cap.Butt }));
    });
  },
};

// Paper gulls (full colour): two poses side by side.
const gulls: Spec = {
  w: 256,
  h: 128,
  alpha: true,
  paint: (x) => {
    const { S, c } = x;
    for (let k = 0; k < 2; k++) {
      c.save();
      c.translate(k * 128 + 64, 64);
      const lift = k === 0 ? -30 : -12;
      const g = path(S, (b) => {
        b.moveTo(-56, lift);
        b.quadTo(-30, -6 + lift * 0.3, -6, 6);
        b.lineTo(0, 14);
        b.lineTo(6, 6);
        b.quadTo(30, -6 + lift * 0.3, 56, lift);
        b.quadTo(30, 8 + lift * 0.2, 4, 22);
        b.lineTo(-4, 22);
        b.quadTo(-30, 8 + lift * 0.2, -56, lift);
        b.close();
      });
      c.drawPath(g, shaderPaint(S, linear(S, 0, -30, 0, 24, ['#ffffff', '#e8eef4', '#b9c4d2'])));
      c.drawPath(g, paint(S, '#5a6478', { stroke: 2, alpha: 0.6 }));
      c.drawCircle(0, 10, 4, paint(S, '#f2a54a'));
      c.restore();
    }
  },
};

export const LANTERN_PAINTERS: Record<string, Spec> = {
  waves,
  clouds,
  lighthouse,
  sail,
  rocks,
  lantern_a: beam,
  lantern_b: leapingFish,
  lantern_c: moonHalo,
  lantern_d: calmWater,
  lantern_e: glazing,
  lantern_f: gulls,
};
