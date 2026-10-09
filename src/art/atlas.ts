// The paper atlas: every printed, cut or patterned surface in the book, painted with Skia
// into one 4096² texture that the WebGPU renderer samples (Skia -> WebGPU, no copy).
// The same code runs on Skia Graphite in the app and on CanvasKit in tools/headless.ts,
// so nothing here imports react-native-skia: the Skia API object is passed in.
import PATTERN_LIST from './patterns.json';
import type { Canvas, Ctx, Fonts, Sk, Spec } from './brush';
import { ATLAS, Blend, Cap, GUTTER, Style, gold, grain, lcg, linear, measure, paint, paragraph, path, radial, shaderPaint, text, wrapped } from './brush';
import { ATTIC_PAINTERS } from './paint_attic';
import { DEEP_PAINTERS } from './paint_deep';
import { LANTERN_PAINTERS } from './paint_lantern';

export { ATLAS };
export type { Fonts };

// ---------------------------------------------------------------- painters

const P: Record<string, Spec> = {};

// The front cover. With foil = true only the gold-blocked parts are painted (white, with
// alpha) for the foil layer that sits on the cloth and catches the light.
function coverArt(x: Ctx, foil: boolean) {
  const { S, c, w, h } = x;
  if (!foil) {
    // Cloth.
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, 0, 0, w, h, ['#8a2a3b', '#6e1f2e', '#7d2535'])));
    const weave = S.Shader.MakeTurbulence(0.9, 0.03, 2, 7, 0, 0);
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, weave, 0.18, Blend.Overlay));
    const weave2 = S.Shader.MakeTurbulence(0.03, 0.9, 2, 9, 0, 0);
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, weave2, 0.18, Blend.Overlay));
    grain(x, 0.1, 0.5);
    // Worn edges.
    c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, radial(S, w / 2, h / 2, h * 0.75, ['#00000000', '#00000000', '#2a0a10aa'], [0, 0.6, 1])));
  }
  const g = foil ? linear(S, 0, 0, w, h, ['#ffffff', '#efe6cf', '#ffffff', '#f6efdc'], [0, 0.35, 0.6, 1]) : gold(S, 0, 0, w, h);
  const gp = shaderPaint(S, g);
  const stroke = (sw: number) => {
    const p = shaderPaint(S, g);
    p.setStyle(Style.Stroke);
    p.setStrokeWidth(sw);
    return p;
  };
  // Double frame with corner flourishes.
  c.drawRRect(S.RRectXY(S.XYWHRect(96, 96, w - 192, h - 192), 22, 22), stroke(6));
  c.drawRRect(S.RRectXY(S.XYWHRect(118, 118, w - 236, h - 236), 12, 12), stroke(2));
  for (const [cx, cy, sx, sy] of [
    [118, 118, 1, 1],
    [w - 118, 118, -1, 1],
    [118, h - 118, 1, -1],
    [w - 118, h - 118, -1, -1],
  ]) {
    c.save();
    c.translate(cx, cy);
    c.scale(sx, sy);
    const curl = path(S, (b) => {
      b.moveTo(10, 70);
      b.cubicTo(10, 20, 30, 10, 70, 10);
      b.moveTo(24, 70);
      b.cubicTo(30, 40, 46, 30, 70, 24);
      b.moveTo(40, 40);
      b.addCircle(40, 40, 7);
    });
    c.drawPath(curl, stroke(3));
    c.restore();
  }
  // Emblem: a lantern hanging in an arch, with stars.
  c.save();
  c.translate(w / 2, h * 0.43);
  const arch = path(S, (b) => {
    b.moveTo(-150, 190);
    b.lineTo(-150, -40);
    b.cubicTo(-150, -230, 150, -230, 150, -40);
    b.lineTo(150, 190);
  });
  c.drawPath(arch, stroke(5));
  const arch2 = path(S, (b) => {
    b.moveTo(-132, 190);
    b.lineTo(-132, -36);
    b.cubicTo(-132, -205, 132, -205, 132, -36);
    b.lineTo(132, 190);
  });
  c.drawPath(arch2, stroke(2));
  // Lantern.
  c.drawLine(0, -170, 0, -110, stroke(3));
  c.drawCircle(0, -112, 8, stroke(3));
  const lantern = path(S, (b) => {
    b.moveTo(-48, -60);
    b.lineTo(48, -60);
    b.lineTo(62, -40);
    b.lineTo(54, 70);
    b.lineTo(-54, 70);
    b.lineTo(-62, -40);
    b.close();
  });
  c.drawPath(lantern, stroke(5));
  const cap = path(S, (b) => {
    b.moveTo(-60, -60);
    b.lineTo(0, -104);
    b.lineTo(60, -60);
    b.close();
  });
  c.drawPath(cap, gp);
  c.drawRect(S.XYWHRect(-66, 70, 132, 16), gp);
  for (const xx of [-18, 18]) c.drawLine(xx, -58, xx * 1.2, 68, stroke(2));
  // Flame glow in the lantern.
  if (!foil) c.drawCircle(0, 14, 34, shaderPaint(S, radial(S, 0, 14, 34, ['#fff6c8', '#f7c86acc', '#f7c86a00'])));
  const flame = path(S, (b) => {
    b.moveTo(0, -18);
    b.cubicTo(18, 6, 16, 30, 0, 38);
    b.cubicTo(-16, 30, -18, 6, 0, -18);
  });
  c.drawPath(flame, gp);
  // Little house silhouette at the foot of the arch.
  const house = path(S, (b) => {
    b.moveTo(-120, 190);
    b.lineTo(-120, 130);
    b.lineTo(-96, 104);
    b.lineTo(-72, 130);
    b.lineTo(-72, 190);
    b.moveTo(72, 190);
    b.lineTo(72, 140);
    b.lineTo(104, 112);
    b.lineTo(130, 140);
    b.lineTo(130, 190);
  });
  c.drawPath(house, stroke(3));
  c.restore();
  // Stars.
  const rnd = lcg(5);
  for (let i = 0; i < 26; i++) {
    const sx = 130 + rnd() * (w - 260);
    const sy = 140 + rnd() * (h * 0.62);
    if (sy > h * 0.6) continue; // keep the title clear
    if (Math.abs(sx - w / 2) < 190 && sy > 220 && sy < h * 0.62) continue;
    const r = 3 + rnd() * 7;
    const star = path(S, (b) => {
      for (let k = 0; k < 10; k++) {
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        const rr = k % 2 === 0 ? r : r * 0.42;
        if (k === 0) b.moveTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
        else b.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
      }
      b.close();
    });
    c.drawPath(star, gp);
  }
  // Title.
  text(x, 'The', w / 2, h * 0.665, 'serifItalic', 64, foil ? '#ffffff' : '#f3d58a', 'center');
  c.save();
  const titleP = shaderPaint(S, foil ? g : gold(S, 0, h * 0.68, w, h * 0.76));
  const f = x.fonts.font('display', 112);
  if (f) {
    const s = 'Lantern';
    const tw = measure(x, s, 'display', 112);
    c.drawText(s, w / 2 - tw / 2, h * 0.75, titleP, f);
    const s2 = 'House';
    const tw2 = measure(x, s2, 'display', 112);
    c.drawText(s2, w / 2 - tw2 / 2, h * 0.835, titleP, f);
  }
  c.restore();
  text(x, 'A  POP-UP  STORY', w / 2, h * 0.862, 'serif', 30, foil ? '#ffffff' : '#e7c77a', 'center', 0.9);
}

P.cover = { w: 1024, h: 1408, paint: (x) => coverArt(x, false) };
P.cover_foil = { w: 1024, h: 1408, alpha: true, paint: (x) => coverArt(x, true) };

function pageArt(x: Ctx, side: 'l' | 'r') {
  const { S, c, w, h } = x;
  // Cream paper with a soft vignette.
  c.drawRect(S.XYWHRect(0, 0, w, h), paint(S, '#f7efdc'));
  grain(x, 0.12, 0.7);
  // Gutter shading (towards the spine).
  const gx = side === 'l' ? w : 0;
  c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, linear(S, gx, 0, side === 'l' ? w - 220 : 220, 0, ['#5a3a2a55', '#5a3a2a00'])));
  // Watercolour meadow wash around the pop-up (top of the image = back of the page).
  const rnd = lcg(side === 'l' ? 11 : 23);
  const wash = (cx: number, cy: number, rx: number, ry: number, col: string, a: number) => {
    c.save();
    c.translate(cx, cy);
    c.scale(rx, ry);
    c.drawCircle(0, 0, 1, shaderPaint(S, radial(S, 0, 0, 1, [col, col + '00']), a));
    c.restore();
  };
  const inner = side === 'l' ? w : 0;
  for (let i = 0; i < 26; i++) {
    const cx = inner + (side === 'l' ? -1 : 1) * rnd() * w * 0.95;
    const cy = h * (0.05 + rnd() * 0.6);
    wash(cx, cy, 140 + rnd() * 240, 90 + rnd() * 150, ['#6fae7e', '#4f9480', '#93c48f', '#5e9f9a'][i % 4], 0.38 + rnd() * 0.25);
  }
  // Painted path from the house (gutter) to the front edge.
  c.save();
  const pathCol = '#e3c08e';
  const pp = path(S, (b) => {
    const x0 = side === 'l' ? w : 0;
    const s = side === 'l' ? -1 : 1;
    b.moveTo(x0, h * 0.58);
    b.cubicTo(x0 + s * 70, h * 0.66, x0 + s * 20, h * 0.8, x0 + s * 90, h);
    b.lineTo(x0, h);
    b.close();
  });
  c.drawPath(pp, paint(S, pathCol, { alpha: 0.85 }));
  for (let i = 0; i < 40; i++) {
    const t = rnd();
    const s = side === 'l' ? -1 : 1;
    const px = (side === 'l' ? w : 0) + s * (8 + rnd() * (30 + t * 50));
    const py = h * (0.6 + t * 0.4);
    c.drawOval(S.XYWHRect(px - 9, py - 5, 18, 10), paint(S, '#c99a63', { alpha: 0.6 }));
  }
  c.restore();
  // Little flowers dotted in the grass.
  for (let i = 0; i < 70; i++) {
    const s = side === 'l' ? -1 : 1;
    const px = inner + s * (60 + rnd() * (w - 100));
    const py = h * (0.15 + rnd() * 0.55);
    const col = ['#f4a3a8', '#fbd38d', '#ffffff', '#c3a6f0'][i % 4];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.drawCircle(px + Math.cos(a) * 4, py + Math.sin(a) * 4, 3.2, paint(S, col, { alpha: 0.85 }));
    }
    c.drawCircle(px, py, 2.4, paint(S, '#e9a23b'));
  }
  // Border.
  const bp = paint(S, '#9b7a55', { stroke: 2, alpha: 0.55 });
  c.drawRect(S.XYWHRect(40, 40, w - 80, h - 80), bp);
  c.drawRect(S.XYWHRect(52, 52, w - 104, h - 104), paint(S, '#9b7a55', { stroke: 1, alpha: 0.4 }));
  // Text block at the front corner, page number.
  const tx = side === 'l' ? 90 : w - 470;
  const ty = h * 0.8;
  if (side === 'l') {
    text(x, 'I.', tx, ty - 6, 'serifItalic', 30, '#7a4d2e', 'left', 0.9);
    paragraph(x, 'Deep in the paper woods there is a house whose windows never go dark.', tx + 40, ty - 6, 340, 'serifItalic', 25, 32, '#4a3424', 0.85);
  } else {
    paragraph(x, 'Some say a lantern burns in the tower. Some say the lantern is a door.', tx, ty - 6, 380, 'serifItalic', 25, 32, '#4a3424', 0.85);
  }
  text(x, side === 'l' ? '2' : '3', side === 'l' ? 80 : w - 80, h - 70, 'serif', 26, '#7a5a3a', 'center', 0.8);
  // Ornament under the text.
  const ox = side === 'l' ? tx + 200 : tx + 190;
  const oy = h * 0.93;
  c.drawLine(ox - 90, oy, ox - 12, oy, paint(S, '#9b7a55', { stroke: 1.5, alpha: 0.7 }));
  c.drawLine(ox + 12, oy, ox + 90, oy, paint(S, '#9b7a55', { stroke: 1.5, alpha: 0.7 }));
  c.drawCircle(ox, oy, 5, paint(S, '#9b7a55', { alpha: 0.7 }));
}

P.page_l = { w: 1024, h: 1392, paint: (x) => pageArt(x, 'l') };
P.page_r = { w: 1024, h: 1392, paint: (x) => pageArt(x, 'r') };

P.cloth = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#d8d0cc'));
    wrapped(x, () => {
      for (let i = 0; i < 64; i++) {
        const y = (i / 64) * h;
        c.drawLine(0, y, w, y, paint(S, i % 2 ? '#ffffff' : '#bdb2ad', { stroke: 1.4, alpha: 0.5, cap: Cap.Butt }));
        c.drawLine(y, 0, y, h, paint(S, i % 2 ? '#c8bdb8' : '#efe8e4', { stroke: 1.2, alpha: 0.35, cap: Cap.Butt }));
      }
    });
    grain(x, 0.12, 0.8);
  },
};

P.endpaper = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#f1e6cc'));
    wrapped(x, () => {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 4; i++) {
          const cx = (i + (j % 2) * 0.5) * (w / 4);
          const cy = j * (h / 4) + h / 8;
          // Small leaf motif.
          c.save();
          c.translate(cx, cy);
          for (let k = 0; k < 4; k++) {
            c.rotate(90, 0, 0);
            const leaf = path(S, (b) => {
              b.moveTo(0, 0);
              b.quadTo(14, -10, 0, -34);
              b.quadTo(-14, -10, 0, 0);
            });
            c.drawPath(leaf, paint(S, '#8fa9b8', { alpha: 0.55 }));
          }
          c.drawCircle(0, 0, 5, paint(S, '#c98f6b', { alpha: 0.7 }));
          c.restore();
        }
      }
    });
    grain(x, 0.12, 0.8);
  },
};

P.page_edges = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#f4ead3'));
    const rnd = x.rnd;
    wrapped(x, () => {
      for (let i = 0; i < 48; i++) {
        const y = (i / 48) * h + rnd() * 1.5;
        c.drawLine(0, y, w, y, paint(S, '#b9a27c', { stroke: 1 + rnd(), alpha: 0.35 + rnd() * 0.3, cap: Cap.Butt }));
      }
    });
  },
};

P.wood = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#f2e3d2'));
    wrapped(x, () => {
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        const x0 = (i / planks) * w;
        const pw = w / planks;
        const tone = 0.86 + rnd() * 0.14;
        const v = Math.round(255 * tone);
        c.drawRect(S.XYWHRect(x0, 0, pw, h), paint(S, `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.86)})`));
        for (let k = 0; k < 7; k++) {
          const gx = x0 + 6 + rnd() * (pw - 12);
          const g = path(S, (b) => {
            b.moveTo(gx, 0);
            for (let y = 0; y <= h; y += 32) b.lineTo(gx + Math.sin(y * 0.02 + k) * 3, y);
          });
          c.drawPath(g, paint(S, '#a0765a', { stroke: 1.2, alpha: 0.25 }));
        }
        c.drawLine(x0, 0, x0, h, paint(S, '#6b4630', { stroke: 3, alpha: 0.55, cap: Cap.Butt }));
        c.drawLine(x0 + 2.5, 0, x0 + 2.5, h, paint(S, '#ffffff', { stroke: 1.5, alpha: 0.35, cap: Cap.Butt }));
        // Nails.
        for (const ny of [h * 0.18, h * 0.68]) c.drawCircle(x0 + pw / 2, ny, 2.5, paint(S, '#6b4630', { alpha: 0.6 }));
      }
    });
    grain(x, 0.1, 0.8);
  },
};

P.shingle = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#d6e2e6'));
    wrapped(x, () => {
      const rows = 8;
      const cols = 8;
      const rh = h / rows;
      const cw = w / cols;
      for (let r = rows; r >= -1; r--) {
        for (let k = -1; k <= cols; k++) {
          const cx = (k + (r % 2) * 0.5) * cw;
          const cy = r * rh;
          const t = 0.85 + rnd() * 0.15;
          const v = Math.round(255 * t);
          const scale = path(S, (b) => {
            b.moveTo(cx - cw / 2, cy - rh * 0.2);
            b.lineTo(cx - cw / 2, cy + rh * 0.45);
            b.quadTo(cx - cw / 2, cy + rh * 1.15, cx, cy + rh * 1.15);
            b.quadTo(cx + cw / 2, cy + rh * 1.15, cx + cw / 2, cy + rh * 0.45);
            b.lineTo(cx + cw / 2, cy - rh * 0.2);
            b.close();
          });
          c.drawPath(scale, paint(S, `rgb(${v},${v},${v})`));
          c.drawPath(scale, paint(S, '#4d6a78', { stroke: 2.2, alpha: 0.5 }));
          // Highlight on the scale.
          const hl = path(S, (b) => {
            b.moveTo(cx - cw * 0.3, cy + rh * 0.55);
            b.quadTo(cx - cw * 0.28, cy + rh * 0.95, cx, cy + rh * 0.98);
          });
          c.drawPath(hl, paint(S, '#ffffff', { stroke: 2, alpha: 0.5 }));
        }
      }
    });
    grain(x, 0.08, 0.9);
  },
};

P.bark = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#e9d8c8'));
    wrapped(x, () => {
      for (let i = 0; i < 18; i++) {
        const x0 = (i / 18) * w;
        const g = path(S, (b) => {
          b.moveTo(x0, 0);
          for (let y = 0; y <= h; y += 16) b.lineTo(x0 + Math.sin(y * 0.05 + i * 1.7) * 5, y);
        });
        c.drawPath(g, paint(S, '#7a5236', { stroke: 1.5 + rnd() * 1.5, alpha: 0.4 }));
      }
    });
    grain(x, 0.14, 0.7);
  },
};

P.canopy_lace = {
  w: 1024,
  h: 1024,
  alpha: true,
  paint: (x) => {
    const { S, c, w } = x;
    const cx = w / 2;
    const R = w * 0.475;
    const ribs = 12;
    // Scalloped disc.
    const disc = path(S, (b) => {
      const n = 240;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const sc = 1 - 0.07 * Math.pow(Math.abs(Math.sin((a * ribs) / 2)), 0.6);
        const r = R * sc;
        if (i === 0) b.moveTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
        else b.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r);
      }
      b.close();
    });
    c.drawPath(disc, shaderPaint(S, radial(S, cx, cx, R, ['#ffffff', '#f6f6f6', '#e4e4e4'], [0, 0.6, 1])));
    // Lace cut-outs between the ribs: rings of teardrops.
    const clear = paint(S, '#000000', { blend: Blend.Clear });
    for (let ring = 0; ring < 5; ring++) {
      const rr = R * (0.22 + ring * 0.155);
      const per = ribs * (ring < 2 ? 1 : 2);
      for (let k = 0; k < per; k++) {
        const a = ((k + 0.5) / per) * Math.PI * 2;
        const size = R * (0.035 + ring * 0.012);
        c.save();
        c.translate(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr);
        c.rotate((a * 180) / Math.PI + 90, 0, 0);
        const drop = path(S, (b) => {
          b.moveTo(0, -size * 1.6);
          b.cubicTo(size, -size * 0.4, size, size, 0, size);
          b.cubicTo(-size, size, -size, -size * 0.4, 0, -size * 1.6);
        });
        c.drawPath(drop, clear);
        c.restore();
      }
    }
    // Small round holes near the rim.
    for (let k = 0; k < ribs * 3; k++) {
      const a = ((k + 0.25) / (ribs * 3)) * Math.PI * 2;
      c.drawCircle(cx + Math.cos(a) * R * 0.88, cx + Math.sin(a) * R * 0.88, R * 0.018, clear);
    }
    // Ribs and veins.
    for (let k = 0; k < ribs; k++) {
      const a = (k / ribs) * Math.PI * 2;
      c.drawLine(cx, cx, cx + Math.cos(a) * R * 0.92, cx + Math.sin(a) * R * 0.92, paint(S, '#b8b8b8', { stroke: 5, alpha: 0.7 }));
      c.drawLine(cx, cx, cx + Math.cos(a) * R * 0.92, cx + Math.sin(a) * R * 0.92, paint(S, '#ffffff', { stroke: 2, alpha: 0.8 }));
    }
    for (let ring = 1; ring < 5; ring++) {
      c.drawCircle(cx, cx, R * (0.14 + ring * 0.155), paint(S, '#c4c4c4', { stroke: 2, alpha: 0.5 }));
    }
    // Outline of the scallops.
    c.drawPath(disc, paint(S, '#a8a8a8', { stroke: 4, alpha: 0.6 }));
    c.drawCircle(cx, cx, R * 0.07, paint(S, '#cfcfcf'));
  },
};

P.leaf_lace = {
  w: 512,
  h: 512,
  alpha: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    const leaf = path(S, (b) => {
      b.moveTo(w / 2, h * 0.96);
      b.cubicTo(w * 0.05, h * 0.7, w * 0.15, h * 0.2, w / 2, h * 0.03);
      b.cubicTo(w * 0.85, h * 0.2, w * 0.95, h * 0.7, w / 2, h * 0.96);
    });
    c.drawPath(leaf, paint(S, '#f2f2f2'));
    const clear = paint(S, '#000', { blend: Blend.Clear });
    for (let i = 0; i < 7; i++) {
      const y = h * (0.2 + i * 0.1);
      for (const s of [-1, 1]) {
        c.save();
        c.translate(w / 2 + s * w * 0.12, y);
        c.rotate(s * 35, 0, 0);
        c.drawOval(S.XYWHRect(-9, -22, 18, 44), clear);
        c.restore();
      }
    }
    c.drawLine(w / 2, h * 0.95, w / 2, h * 0.08, paint(S, '#bdbdbd', { stroke: 6 }));
    c.drawPath(leaf, paint(S, '#b0b0b0', { stroke: 4 }));
  },
};

P.grass = {
  w: 1024,
  h: 256,
  alpha: true,
  tile: true,
  paint: (x) => {
    const { S, c } = x;
    for (let k = -1; k < 9; k++) {
      c.save();
      c.translate(((k + 8) % 8) * 128 + 64 + (k < 0 ? -1024 : k >= 8 ? 1024 : 0), 256);
      const blades = 7;
      const r2 = lcg(((k + 8) % 8) * 31 + 7);
      for (let i = 0; i < blades; i++) {
        const t = i / (blades - 1) - 0.5;
        const bx = t * 110 + (r2() - 0.5) * 24;
        const hgt = 120 + r2() * 125 - Math.abs(t) * 40;
        const lean = t * 90 + (r2() - 0.5) * 70;
        const wd = 13 + r2() * 8;
        const tone = 0.8 + r2() * 0.2;
        const v = Math.round(255 * tone);
        const dark = Math.round(v * 0.74);
        const blade = path(S, (b) => {
          b.moveTo(bx - wd, 0);
          b.cubicTo(bx - wd * 0.9 + lean * 0.15, -hgt * 0.45, bx - wd * 0.3 + lean * 0.6, -hgt * 0.8, bx + lean, -hgt);
          b.cubicTo(bx + wd * 0.35 + lean * 0.6, -hgt * 0.75, bx + wd * 0.9 + lean * 0.15, -hgt * 0.4, bx + wd, 0);
          b.close();
        });
        c.drawPath(blade, shaderPaint(S, linear(S, 0, 0, 0, -hgt, [`rgb(${dark},${dark},${dark})`, `rgb(${v},${v},${v})`, '#ffffff'], [0, 0.7, 1])));
        // Midrib fold: a lit half and a shaded half.
        const rib = path(S, (b) => {
          b.moveTo(bx, 0);
          b.cubicTo(bx + lean * 0.15, -hgt * 0.45, bx + lean * 0.6, -hgt * 0.8, bx + lean, -hgt);
        });
        c.drawPath(rib, paint(S, '#ffffff', { stroke: 2.4, alpha: 0.6 }));
        c.drawPath(blade, paint(S, '#ffffff', { stroke: 1.4, alpha: 0.35 }));
      }
      c.restore();
    }
  },
};

P.fern = {
  w: 512,
  h: 256,
  alpha: true,
  paint: (x) => {
    const { S, c, rnd } = x;
    for (let k = 0; k < 2; k++) {
      c.save();
      c.translate(k * 256 + 128, 250);
      for (let f = 0; f < 3; f++) {
        const ang = -30 + f * 30 + (rnd() - 0.5) * 10;
        c.save();
        c.rotate(ang, 0, 0);
        const L = 200 + rnd() * 30;
        c.drawLine(0, 0, 0, -L, paint(S, '#cfcfcf', { stroke: 4 }));
        for (let i = 1; i < 12; i++) {
          const y = -(i / 12) * L;
          const lw = 46 * (1 - i / 13);
          for (const s of [-1, 1]) {
            const leaf = path(S, (b) => {
              b.moveTo(0, y);
              b.quadTo(s * lw * 0.5, y - 14, s * lw, y - 8);
              b.quadTo(s * lw * 0.5, y + 4, 0, y);
            });
            c.drawPath(leaf, paint(S, '#e8e8e8'));
          }
        }
        c.restore();
      }
      c.restore();
    }
  },
};

function windowArt(x: Ctx, round: boolean) {
  const { S, c, w, h } = x;
  c.drawRect(S.XYWHRect(0, 0, w, h), shaderPaint(S, radial(S, w / 2, h * 0.6, h * 0.8, ['#fff4cf', '#ffd27a', '#e89a48'])));
  // Curtains.
  for (const s of [-1, 1]) {
    const cur = path(S, (b) => {
      const x0 = s < 0 ? 0 : w;
      b.moveTo(x0, 0);
      b.lineTo(x0 + s * -w * 0.28, 0);
      b.cubicTo(x0 + s * -w * 0.18, h * 0.4, x0 + s * -w * 0.3, h * 0.6, x0 + s * -w * 0.12, h);
      b.lineTo(x0, h);
      b.close();
    });
    c.drawPath(cur, paint(S, '#c4543f', { alpha: 0.85 }));
    c.drawPath(cur, paint(S, '#7d2a22', { stroke: 3, alpha: 0.6 }));
  }
  // A pot plant silhouette on the sill.
  c.drawRect(S.XYWHRect(w * 0.42, h * 0.82, w * 0.16, h * 0.18), paint(S, '#8a4a2a', { alpha: 0.8 }));
  for (let i = 0; i < 5; i++) {
    c.drawOval(S.XYWHRect(w * (0.36 + i * 0.06), h * (0.66 + (i % 2) * 0.04), w * 0.08, h * 0.16), paint(S, '#4d6b3c', { alpha: 0.8 }));
  }
  // Mullions.
  const mp = paint(S, '#5a3320', { stroke: w * 0.05, cap: Cap.Butt });
  c.drawLine(w / 2, 0, w / 2, h, mp);
  if (!round) c.drawLine(0, h * 0.45, w, h * 0.45, mp);
  else c.drawLine(0, h / 2, w, h / 2, mp);
}

P.window = { w: 256, h: 256, paint: (x) => windowArt(x, false) };
P.window_round = { w: 256, h: 256, paint: (x) => windowArt(x, true) };

P.door = {
  w: 256,
  h: 384,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(0, 0, w, h), paint(S, '#8b5532'));
    for (let i = 0; i < 5; i++) {
      c.drawRect(S.XYWHRect((i * w) / 5, 0, w / 5, h), paint(S, i % 2 ? '#94603b' : '#87512f'));
      c.drawLine((i * w) / 5, 0, (i * w) / 5, h, paint(S, '#4a2a18', { stroke: 3 }));
    }
    for (const y of [h * 0.3, h * 0.75]) c.drawRect(S.XYWHRect(0, y, w, 14), paint(S, '#3a3236'));
    // Little round window with warm light.
    c.drawCircle(w / 2, h * 0.2, w * 0.13, paint(S, '#ffd27a'));
    c.drawCircle(w / 2, h * 0.2, w * 0.13, paint(S, '#3a3236', { stroke: 6 }));
    c.drawCircle(w * 0.78, h * 0.55, 10, paint(S, '#f4c45a'));
    grain(x, 0.12, 0.8);
  },
};

P.mushroom = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#e6e6e6'));
    wrapped(x, () => {
      for (let i = 0; i < 9; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        const r = 10 + rnd() * 16;
        c.drawOval(S.XYWHRect(px - r, py - r * 0.8, 2 * r, 1.6 * r), paint(S, '#ffffff'));
      }
    });
  },
};

P.hills = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#ececec'));
    wrapped(x, () => {
      for (let i = 0; i < 260; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        c.drawLine(px, py, px + 10, py - 6, paint(S, '#ffffff', { stroke: 2, alpha: 0.6 }));
      }
      for (let i = 0; i < 12; i++) {
        const y = (i / 12) * h;
        const g = path(S, (b) => {
          b.moveTo(0, y);
          for (let xx = 0; xx <= w; xx += 32) b.lineTo(xx, y + Math.sin(xx * 0.03 + i) * 6);
        });
        c.drawPath(g, paint(S, '#c9c9c9', { stroke: 1.5, alpha: 0.6 }));
      }
    });
  },
};

P.moon = {
  w: 512,
  h: 512,
  paint: (x) => {
    const { S, c, w, rnd } = x;
    c.drawRect(S.XYWHRect(0, 0, w, w), shaderPaint(S, radial(S, w * 0.42, w * 0.4, w * 0.7, ['#fffbe8', '#fff0c4', '#f3d995'])));
    for (let i = 0; i < 14; i++) {
      const px = w * (0.2 + rnd() * 0.6);
      const py = w * (0.2 + rnd() * 0.6);
      const r = 10 + rnd() * 34;
      c.drawCircle(px, py, r, paint(S, '#e8c77f', { alpha: 0.45 }));
      c.drawCircle(px + r * 0.15, py + r * 0.15, r * 0.8, paint(S, '#fff2c8', { alpha: 0.4 }));
    }
    grain(x, 0.1, 0.6);
  },
};

P.star = {
  w: 256,
  h: 256,
  paint: (x) => {
    const { S, c, w } = x;
    c.drawRect(S.XYWHRect(0, 0, w, w), shaderPaint(S, radial(S, w / 2, w / 2, w * 0.6, ['#ffffff', '#ffe9a8', '#f5c86a'])));
  },
};

P.dandelion = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#e2e2e2'));
    wrapped(x, () => {
      for (let i = 0; i < 120; i++) {
        const px = rnd() * w;
        const py = rnd() * h;
        c.drawCircle(px, py, 2 + rnd() * 4, paint(S, '#ffffff', { alpha: 0.8 }));
      }
    });
  },
};

P.table = {
  w: 512,
  h: 512,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#cdb7a6'));
    wrapped(x, () => {
      for (let i = 0; i < 4; i++) {
        c.drawRect(S.XYWHRect(0, (i * h) / 4, w, h / 4), paint(S, i % 2 ? '#c9b19f' : '#d4bfae'));
        c.drawLine(0, (i * h) / 4, w, (i * h) / 4, paint(S, '#6a4c3a', { stroke: 3, alpha: 0.6, cap: Cap.Butt }));
      }
      for (let i = 0; i < 70; i++) {
        const y0 = rnd() * h;
        const g = path(S, (b) => {
          b.moveTo(0, y0);
          for (let xx = 0; xx <= w; xx += 24) b.lineTo(xx, y0 + Math.sin(xx * 0.006 + i) * 10 + Math.sin(xx * 0.03 + i * 2) * 2);
        });
        c.drawPath(g, paint(S, '#8d6a54', { stroke: 1 + rnd() * 2, alpha: 0.18 + rnd() * 0.15 }));
      }
    });
    grain(x, 0.1, 0.5);
  },
};

P.bricks = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h, rnd } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), paint(S, '#b9b9c4'));
    wrapped(x, () => {
      const rows = 8;
      for (let r = 0; r < rows; r++) {
        const y = (r * h) / rows;
        for (let k = -1; k < 5; k++) {
          const bx = (k + (r % 2) * 0.5) * (w / 4);
          const v = Math.round(225 + rnd() * 30);
          c.drawRRect(S.RRectXY(S.XYWHRect(bx + 2, y + 2, w / 4 - 4, h / rows - 4), 5, 5), paint(S, `rgb(${v},${v},${v})`));
        }
      }
    });
    grain(x, 0.12, 0.8);
  },
};

P.lantern_glass = {
  w: 256,
  h: 256,
  tile: true,
  paint: (x) => {
    const { S, c, w, h } = x;
    c.drawRect(S.XYWHRect(-w, -h, 3 * w, 3 * h), shaderPaint(S, radial(S, w / 2, h / 2, w * 0.8, ['#ffffff', '#ffe2a8'])));
    wrapped(x, () => {
      for (let i = 0; i <= 4; i++) {
        c.drawLine((i * w) / 4, 0, (i * w) / 4, h, paint(S, '#7a5a3a', { stroke: 5, alpha: 0.6, cap: Cap.Butt }));
      }
    });
  },
};

// Fallback for pattern ids that have no painter yet: neutral tinted paper.
function plain(tile: boolean, alpha = false): Spec {
  return {
    w: 256,
    h: 256,
    tile,
    alpha,
    paint: (x) => {
      x.c.drawRect(x.S.XYWHRect(-x.w, -x.h, 3 * x.w, 3 * x.h), paint(x.S, '#eeeeee'));
      grain(x, 0.1, 0.8);
    },
  };
}

Object.assign(P, ATTIC_PAINTERS, LANTERN_PAINTERS, DEEP_PAINTERS);

// ---------------------------------------------------------------- layout

export type Region = { name: string; id: number; x: number; y: number; w: number; h: number; tile: boolean; alpha: boolean };

function specFor(name: string): Spec {
  return P[name] ?? plain(true);
}

// Skyline packer, biggest first. Deterministic, so ids and rects never depend on runtime.
export function layoutAtlas(): Region[] {
  const names: string[] = (PATTERN_LIST as { patterns: string[] }).patterns;
  const items = names.map((name, i) => ({ name, id: i + 1, spec: specFor(name) }));
  const order = [...items].sort((a, b) => b.spec.h * b.spec.w - a.spec.h * a.spec.w || a.id - b.id);
  const out: Region[] = [];
  // Skyline: list of segments (x, width, y) covering [0, ATLAS).
  let sky: { x: number; w: number; y: number }[] = [{ x: 0, w: ATLAS, y: 0 }];
  const place = (w: number, h: number) => {
    let best = -1;
    let bestY = Infinity;
    let bestX = 0;
    for (let i = 0; i < sky.length; i++) {
      const x = sky[i].x;
      if (x + w > ATLAS) break;
      // Height needed to sit across the segments this rect spans.
      let y = 0;
      let span = 0;
      for (let j = i; j < sky.length && span < w; j++) {
        y = Math.max(y, sky[j].y);
        span += sky[j].w;
      }
      if (y + h <= ATLAS && (y < bestY || (y === bestY && x < bestX))) {
        best = i;
        bestY = y;
        bestX = x;
      }
    }
    if (best < 0) return null;
    // Raise the skyline under the rect.
    const nx = bestX;
    const nseg = { x: nx, w, y: bestY + h };
    const next: typeof sky = [];
    for (const seg of sky) {
      const s0 = seg.x;
      const s1 = seg.x + seg.w;
      if (s1 <= nx || s0 >= nx + w) {
        next.push(seg);
        continue;
      }
      if (s0 < nx) next.push({ x: s0, w: nx - s0, y: seg.y });
      if (s1 > nx + w) next.push({ x: nx + w, w: s1 - (nx + w), y: seg.y });
    }
    next.push(nseg);
    next.sort((a, b) => a.x - b.x);
    // Merge equal neighbours.
    sky = [];
    for (const seg of next) {
      const last = sky[sky.length - 1];
      if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w;
      else sky.push({ ...seg });
    }
    return { x: bestX, y: bestY };
  };
  const white = place(32 + GUTTER * 2, 32 + GUTTER * 2)!;
  out.push({ name: 'white', id: 0, x: white.x + GUTTER, y: white.y + GUTTER, w: 32, h: 32, tile: false, alpha: false });
  for (const it of order) {
    const pos = place(it.spec.w + GUTTER * 2, it.spec.h + GUTTER * 2);
    if (!pos) throw new Error(`atlas overflow at ${it.name}`);
    out.push({ name: it.name, id: it.id, x: pos.x + GUTTER, y: pos.y + GUTTER, w: it.spec.w, h: it.spec.h, tile: !!it.spec.tile, alpha: !!it.spec.alpha });
  }
  return out.sort((a, b) => a.id - b.id);
}

// rect (u0, v0, du, dv) per id, then info (tile, alpha, 0, 0) per id.
export function patternTable(regions: Region[], maxPatterns = 64): Float32Array {
  // Ids past the table would spill into the info rows (and the GPU reads past the buffer
  // on devices without robustness), so fail loudly instead.
  const top = Math.max(...regions.map((r) => r.id));
  if (top >= maxPatterns) throw new Error(`pattern id ${top} does not fit MAX_PATTERNS=${maxPatterns}`);
  const t = new Float32Array(maxPatterns * 8);
  for (const r of regions) {
    t[r.id * 4 + 0] = r.x / ATLAS;
    t[r.id * 4 + 1] = r.y / ATLAS;
    t[r.id * 4 + 2] = r.w / ATLAS;
    t[r.id * 4 + 3] = r.h / ATLAS;
    t[maxPatterns * 4 + r.id * 4 + 0] = r.tile ? 1 : 0;
    t[maxPatterns * 4 + r.id * 4 + 1] = r.alpha ? 1 : 0;
  }
  return t;
}

// Paints every region into `canvas` (an ATLAS x ATLAS surface).
export function paintAtlas(S: Sk, canvas: Canvas, regions: Region[], fonts: Fonts) {
  canvas.clear(S.Color('#00000000'));
  for (const r of regions) {
    canvas.save();
    if (r.id === 0) {
      canvas.drawRect(S.XYWHRect(r.x - GUTTER, r.y - GUTTER, r.w + GUTTER * 2, r.h + GUTTER * 2), paint(S, '#ffffff'));
      canvas.restore();
      continue;
    }
    const spec = specFor(r.name);
    const g = r.tile ? GUTTER : 2;
    canvas.clipRect(S.XYWHRect(r.x - g, r.y - g, r.w + g * 2, r.h + g * 2), 1, true);
    canvas.translate(r.x, r.y);
    const ctx: Ctx = { S, c: canvas, w: r.w, h: r.h, rnd: lcg(r.id * 7919), fonts };
    if (!r.tile && !r.alpha) {
      // Opaque art: extend its edge colours into the gutter by drawing it slightly scaled.
      canvas.save();
      canvas.translate(-g, -g);
      canvas.scale((r.w + g * 2) / r.w, (r.h + g * 2) / r.h);
      spec.paint({ ...ctx, rnd: lcg(r.id * 7919) });
      canvas.restore();
    }
    try {
      spec.paint(ctx);
    } catch (e) {
      // A broken painter must not take the whole atlas down: mark its region magenta.
      console.warn(`[atlas] painter ${r.name} failed: ${(e as Error)?.message ?? e}`);
      canvas.drawRect(S.XYWHRect(0, 0, r.w, r.h), paint(S, '#ff00ff'));
    }
    canvas.restore();
  }
}
