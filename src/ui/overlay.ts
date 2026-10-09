// The app chrome drawn by Skia on top of the WebGPU frame, on the UI thread: the cover
// prompt, the chapter card with its text inking in, the progress dots, the back button
// and the pulsing ring that marks each scene's portal. createUiRes runs on the JS thread;
// everything else is a worklet.
import type { SkCanvas, SkFont, SkPaint, SkParagraph, SkPath } from 'react-native-skia';
import { BlurStyle, Skia, TileMode } from 'react-native-skia';
import type { World } from '../director/world';
import { clamp, easeOut, smoothstep } from '../engine/math';
import type { SceneDef } from '../story/types';

type SkiaApi = typeof Skia;

export type UiRes = {
  fonts: {
    numeral: SkFont;
    title: SkFont;
    caps: SkFont;
    hint: SkFont;
  };
  paras: SkParagraph[]; // body paragraph per chapter, laid out at cardBodyW
  paraH: number[];
  cardBodyW: number;
  paints: {
    shadow: SkPaint;
    card: SkPaint;
    cardLine: SkPaint;
    gold: SkPaint;
    goldStroke: SkPaint;
    ink: SkPaint;
    inkSoft: SkPaint;
    white: SkPaint;
    dim: SkPaint;
    mask: SkPaint; // vertical alpha gradient (opaque above, clear below) for the ink wipe
    image: SkPaint;
  };
  cardPath: SkPath; // deckled outline, cardW x 400, scaled in y to the card's height
  cardW: number;
};

// Card outline with a slightly deckled edge, drawn at width w and height 400 (scaled in y).
function deckledCard(w: number) {
  const b = Skia.PathBuilder.Make();
  const h = 400;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const j = () => (rnd() - 0.5) * 1.6;
  b.moveTo(6, 4);
  for (let x = 6; x <= w - 6; x += 7) b.lineTo(x, 3 + j());
  for (let y = 6; y <= h - 6; y += 9) b.lineTo(w - 3 + j() * 0.6, y);
  for (let x = w - 6; x >= 6; x -= 7) b.lineTo(x, h - 3 + j() * 0.3);
  for (let y = h - 6; y >= 6; y -= 9) b.lineTo(3 + j() * 0.6, y);
  b.close();
  return b.build();
}

// Fonts, paints and laid-out paragraphs for a screen of width W (JS thread).
export function createUiRes(W: number, scenes: SceneDef[]): UiRes {
  const mgr = Skia.FontMgr.System();
  const tf = (family: string, weight: number, slant: number) => mgr.matchFamilyStyle(family, { weight, width: 5, slant });
  const didotI = tf('Didot', 400, 1);
  const bask = tf('Baskerville', 400, 0);
  const baskI = tf('Baskerville', 400, 1);
  const cardW = Math.min(340, Math.max(260, W * 0.36));
  const bodyW = cardW - 48;
  const para = (text: string, size: number, color: string) => {
    const pb = Skia.ParagraphBuilder.Make({ textStyle: { fontFamilies: ['Baskerville'], fontSize: size, color: Skia.Color(color), heightMultiplier: 1.32, fontStyle: { slant: 0 } } });
    pb.addText(text);
    const p = pb.build();
    p.layout(bodyW);
    return p;
  };
  const paras = scenes.map((s) => para(s.chapter.body, 15.5, '#3b2a1e'));
  const P = (color: string, stroke?: number) => {
    const p = Skia.Paint();
    p.setAntiAlias(true);
    p.setColor(Skia.Color(color));
    if (stroke) {
      p.setStyle(1);
      p.setStrokeWidth(stroke);
      p.setStrokeCap(1);
    }
    return p;
  };
  const shadow = P('#000000');
  shadow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 10, true));
  const mask = Skia.Paint();
  mask.setBlendMode(6 /* DstIn */);
  mask.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: 0 }, { x: 0, y: 1 }, [Skia.Color('#000000ff'), Skia.Color('#00000000')], null, TileMode.Clamp));
  return {
    fonts: {
      numeral: Skia.Font(tf('Didot', 700, 0), 34),
      title: Skia.Font(didotI, 24),
      caps: Skia.Font(bask, 11),
      hint: Skia.Font(baskI, 14.5),
    },
    paras,
    paraH: paras.map((p) => p.getHeight()),
    cardBodyW: bodyW,
    paints: {
      shadow,
      card: P('#f6efe0'),
      cardLine: P('#b08a5a', 1),
      gold: P('#f2cf7d'),
      goldStroke: P('#f2cf7d', 1.6),
      ink: P('#3b2a1e'),
      inkSoft: P('#6b5240'),
      white: P('#f5ead2'),
      dim: P('#140d22'),
      mask,
      image: Skia.Paint(),
    },
    cardPath: deckledCard(cardW),
    cardW,
  };
}

// ---------------------------------------------------------------- worklets

type UiLayout = {
  back: [number, number, number]; // x, y, r
  card: [number, number, number, number]; // x, y, w, h
};

function uiLayout(W: number, H: number, cardW: number, cardH: number, right = false): UiLayout {
  'worklet';
  const m = Math.max(18, Math.min(W, H) * 0.035);
  return {
    back: [m + 20, m + 20, 20],
    card: [right ? W - m - cardW : m, H - m - cardH, cardW, cardH],
  };
}

function textW(font: SkFont, s: string) {
  'worklet';
  const ids = font.getGlyphIDs(s);
  const ws = font.getGlyphWidths(ids);
  let t = 0;
  for (let i = 0; i < ws.length; i++) t += ws[i];
  return t;
}

function centered(canvas: SkCanvas, s: string, x: number, y: number, font: SkFont, paint: SkPaint) {
  'worklet';
  canvas.drawText(s, x - textW(font, s) / 2, y, paint, font);
}

function withAlpha(paint: SkPaint, a: number) {
  'worklet';
  paint.setAlphaf(clamp(a, 0, 1));
  return paint;
}

// Height of the card folded away to its title row.
const CARD_FOLDED = 104;

// Area of a circle (x, y, r) inside a rect, sampled on a coarse grid.
function overlap(x: number, y: number, r: number, rx: number, ry: number, rw: number, rh: number) {
  'worklet';
  let n = 0;
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      const px = x + ((i - 4) / 4) * r;
      const py = y + ((j - 4) / 4) * r;
      if ((px - x) * (px - x) + (py - y) * (py - y) > r * r) continue;
      if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) n++;
    }
  }
  return n;
}

// The card takes the bottom corner that hides less of the portal (its glow and rays
// included); decided once per scene so it does not jump while the view is dragged.
function cardSide(w: World, res: UiRes, fullH: number) {
  'worklet';
  if (w.cardRight >= 0) return w.cardRight === 1;
  const [px, py, pr] = w.portalScreen;
  const pref = w.scenes[w.level].cardSide === 'right';
  // Wait until the portal has been placed on screen before deciding.
  if (pr <= 0) return pref;
  const L = uiLayout(w.W, w.H, res.cardW, fullH, false).card;
  const R = uiLayout(w.W, w.H, res.cardW, fullH, true).card;
  const rr = Math.max(pr * 3.4, 48); // the portal plus its glow and rays
  const ol = overlap(px, py, rr, L[0], L[1], L[2], L[3]);
  const or = overlap(px, py, rr, R[0], R[1], R[2], R[3]);
  const right = ol === or ? pref : or < ol;
  w.cardRight = right ? 1 : 0;
  return right;
}

function cardHeight(res: UiRes, ch: number, open = 1) {
  'worklet';
  const full = 26 + 46 + 10 + res.paraH[ch] + 46;
  return CARD_FOLDED + (full - CARD_FOLDED) * open;
}

// Two little arrows moving apart: the pinch-out gesture.
function pinchGlyph(canvas: SkCanvas, x: number, y: number, t: number, paint: SkPaint) {
  'worklet';
  const k = 3 + 3 * (0.5 + 0.5 * Math.sin(t * 3));
  const a = 5;
  for (const s of [-1, 1]) {
    const cx = x + s * k;
    const cy = y - s * k;
    canvas.drawLine(cx, cy, cx + s * 6, cy - s * 6, paint);
    canvas.drawLine(cx + s * 6, cy - s * 6, cx + s * 6 - s * a, cy - s * 6, paint);
    canvas.drawLine(cx + s * 6, cy - s * 6, cx + s * 6, cy - s * 6 + s * a, paint);
  }
}

export function drawOverlay(S: SkiaApi, canvas: SkCanvas, w: World, res: UiRes) {
  'worklet';
  const W = w.W;
  const H = w.H;
  const t = w.time;
  const P = res.paints;
  const F = res.fonts;

  // Cover: how to open the book, quietly, under the gold frame.
  if (w.cover > 0.01) {
    const a = w.cover * smoothstep(1.5, 3.0, t) * (0.55 + 0.45 * Math.sin(t * 1.6));
    // Portrait: the cover fills the screen, so the hint sits inside the gold frame under
    // the subtitle. Landscape: under the book on the table.
    const y = W < H ? H * 0.908 : H - Math.max(26, H * 0.04);
    const msg = w.hingeAvail ? 'Unfold to open' : 'Tap the cover to open';
    withAlpha(P.gold, a);
    centered(canvas, msg, W / 2, y, F.hint, P.gold);
  }

  const chA = w.chapterA;
  if (chA < 0.01) return;
  const level = w.level;
  const def = w.scenes[level];

  // Portal ring: a soft pulse around the way in, once the reader has looked around a bit.
  const [px, py, pr] = w.portalScreen;
  if (pr > 0 && !w.tr.on) {
    const k = smoothstep(1.2, 2.6, w.sceneT) * chA;
    const ph = (t * 0.7) % 1;
    const rr = Math.max(pr * 1.3, 16) + ph * 26;
    withAlpha(P.goldStroke, k * (1 - ph) * 0.9);
    canvas.drawCircle(px, py, rr, P.goldStroke);
    const ph2 = (ph + 0.5) % 1;
    withAlpha(P.goldStroke, k * (1 - ph2) * 0.6);
    canvas.drawCircle(px, py, Math.max(pr * 1.3, 16) + ph2 * 26, P.goldStroke);
  }

  if (level === 0) {
    // The book itself: a quiet title and the hint, nothing covering the pages.
    const a = chA * smoothstep(0.3, 1.4, w.sceneT);
    const top = Math.max(30, H * 0.06);
    if (w.loops > 0) {
      withAlpha(P.white, a * 0.85);
      centered(canvas, '… and every light finds its way home.', W / 2, top + 10, F.hint, P.white);
    } else {
      withAlpha(P.gold, a);
      centered(canvas, def.chapter.title, W / 2, top + 14, F.title, P.gold);
    }
    const hy = H - Math.max(26, H * 0.045);
    withAlpha(P.white, a * (0.55 + 0.25 * Math.sin(t * 2)));
    centered(canvas, def.chapter.hint, W / 2 + 12, hy, F.hint, P.white);
    withAlpha(P.goldStroke, a * 0.9);
    pinchGlyph(canvas, W / 2 - textW(F.hint, def.chapter.hint) / 2 - 8, hy - 5, t, P.goldStroke);
    return;
  }

  // ---- Inside the story: app chrome.
  const open = easeOut(clamp(w.cardOpen, 0, 1));
  const right = cardSide(w, res, cardHeight(res, level, 1));
  const lay = uiLayout(W, H, res.cardW, cardHeight(res, level, open), right);
  const enter = easeOut(smoothstep(0.15, 0.9, w.sceneT)) * chA;
  // Top bar: back chip, chapter dots, chapter label.
  const [bx, by, br] = lay.back;
  withAlpha(P.dim, enter * 0.55);
  canvas.drawCircle(bx, by, br, P.dim);
  withAlpha(P.goldStroke, enter);
  canvas.drawLine(bx + 4, by - 7, bx - 4, by, P.goldStroke);
  canvas.drawLine(bx - 4, by, bx + 4, by + 7, P.goldStroke);
  const n = w.scenes.length;
  const dotY = by;
  for (let i = 0; i < n; i++) {
    const dx = W / 2 + (i - (n - 1) / 2) * 18;
    if (i === level) {
      withAlpha(P.gold, enter);
      canvas.drawCircle(dx, dotY, 4.2, P.gold);
    } else {
      withAlpha(P.goldStroke, enter * 0.7);
      canvas.drawCircle(dx, dotY, 3.4, P.goldStroke);
    }
  }
  const numeral = def.chapter.numeral;
  const label = `CHAPTER ${numeral}`;
  withAlpha(P.white, enter * 0.75);
  canvas.drawText(label, W - lay.back[0] + br - textW(F.caps, label), dotY + 4, P.white, F.caps);

  // The chapter card, sliding up like a page and inking in its text.
  const [cx, cy0, cw, chh] = lay.card;
  const slide = (1 - enter) * 24;
  const cy = cy0 + slide;
  canvas.save();
  canvas.translate(cx, cy);
  withAlpha(P.shadow, enter * 0.45);
  canvas.save();
  canvas.translate(0, 6);
  canvas.scale(1, chh / 400);
  canvas.drawPath(res.cardPath, P.shadow);
  canvas.restore();
  canvas.save();
  canvas.scale(1, chh / 400);
  withAlpha(P.card, enter * 0.94);
  canvas.drawPath(res.cardPath, P.card);
  canvas.restore();
  withAlpha(P.cardLine, enter * 0.6);
  canvas.drawRect(S.XYWHRect(8, 8, cw - 16, chh - 16), P.cardLine);
  // Numeral + title.
  withAlpha(P.gold, enter);
  canvas.drawText(numeral, 24, 26 + 34, P.gold, F.numeral);
  const nw = textW(F.numeral, numeral) + 12;
  withAlpha(P.ink, enter);
  canvas.drawText(def.chapter.title, 24 + nw, 26 + 30, P.ink, F.title);
  // Body: ink wipe from top to bottom.
  const reveal = clamp((w.sceneT - 0.5) / 2.2, 0, 1);
  const para = res.paras[level];
  const ph = res.paraH[level];
  const by0 = 26 + 46 + 10;
  if (para && reveal > 0 && open > 0.02) {
    const layerRect = S.XYWHRect(24, by0 - 4, res.cardBodyW, Math.max(0, Math.min(ph + 8, chh - 46 - by0 + 4)));
    canvas.save();
    canvas.clipRect(layerRect, 1, true);
    canvas.saveLayer(withAlpha(P.white, enter * smoothstep(0.25, 0.9, open)), layerRect);
    para.paint(canvas, 24, by0);
    // Mask: opaque down to the wipe line, then a soft fade.
    canvas.save();
    canvas.translate(24, by0 - 4);
    const span = ph + 40;
    canvas.translate(0, reveal * span - 36);
    canvas.scale(res.cardBodyW, 36);
    canvas.drawRect(S.XYWHRect(0, -100, 1, 200), P.mask);
    canvas.restore();
    canvas.restore();
    canvas.restore();
  }
  // Hint row.
  const hy = chh - 22;
  const ha = enter * smoothstep(2.4, 3.2, w.sceneT);
  withAlpha(P.goldStroke, ha);
  pinchGlyph(canvas, 32, hy - 5, t, P.goldStroke);
  withAlpha(P.inkSoft, ha * (0.75 + 0.25 * Math.sin(t * 2)));
  canvas.drawText(def.chapter.hint, 50, hy, P.inkSoft, F.hint);
  canvas.restore();
}

export const TAP_NONE = 0;
export const TAP_BACK = 1;
export const TAP_CARD = 2;

// Tap on the chrome: which control was hit.
export function tapOverlay(w: World, res: UiRes, x: number, y: number) {
  'worklet';
  if (w.level === 0 || w.chapterA < 0.5 || w.tr.on) return TAP_NONE;
  const lay = uiLayout(w.W, w.H, res.cardW, cardHeight(res, w.level, easeOut(clamp(w.cardOpen, 0, 1))), w.cardRight === 1);
  const [bx, by, br] = lay.back;
  if (Math.hypot(x - bx, y - by) < br + 16) return TAP_BACK;
  const [cx, cy0, cw, ch] = lay.card;
  // Same slide-in offset as drawOverlay.
  const enter = easeOut(smoothstep(0.15, 0.9, w.sceneT)) * w.chapterA;
  const cy = cy0 + (1 - enter) * 24;
  if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) return TAP_CARD;
  return TAP_NONE;
}
