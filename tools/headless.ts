// Headless renderer: the app's director and WGSL on Dawn (npm `webgpu`), the atlas painted
// by the same Skia code on CanvasKit. Writes PNGs to .headless/ (or --out).
//   bun run headless -- --shot "woods,cover,attic@4,woods:p=0.6" [--w 951 --h 669 --scale 2 --out dir]
// Bundled by bun but run with node: bun segfaults inside the `webgpu` addon.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { create, globals } from 'webgpu';
// @ts-ignore: web implementation of the RN Skia API over CanvasKit
import { JsiSkApi } from 'react-native-skia/lib/module/skia/web/JsiSkia.js';
// @ts-ignore
import CanvasKitInit from 'canvaskit-wasm/bin/full/canvaskit.js';
import { ATLAS, layoutAtlas, paintAtlas, patternTable } from '../src/art/atlas';
import type { Fonts } from '../src/art/atlas';
import { buildAtlas, createBundle, createTargets } from '../src/engine/gpu';
import { renderFrame } from '../src/engine/render';
import { MAX_PATTERNS } from '../src/engine/shaders';
import { createWorld, setTransition, settleBook, stepWorld } from '../src/director/world';
import { SCENES, sceneIndex } from '../src/story/registry';
import { makeRig, slotInfo } from '../src/story/rig';

Object.assign(globalThis, globals);

const args = process.argv.slice(2);
const opt = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const W = Number(opt('w', '951'));
const H = Number(opt('h', '669'));
const SCALE = Number(opt('scale', '2'));
const OUT = opt('out', '.headless');

function crc32(buf: Uint8Array) {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function encodePNG(rgba: Uint8Array, w: number, h: number) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  }
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(12 + data.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) b[4 + i] = type.charCodeAt(i);
    b.set(data, 8);
    dv.setUint32(8 + data.length, crc32(b.subarray(4, 8 + data.length)));
    return b;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array(0))];
  const len = parts.reduce((a, p) => a + p.length, 0);
  const png = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

// The atlas is cached by a hash of src/art/*, so painter edits repaint it (a few seconds).
async function atlasPixels(): Promise<Uint8Array> {
  const src = readdirSync('src/art').sort().map((f) => readFileSync(`src/art/${f}`, 'utf8')).join('');
  const key = createHash('sha1').update(src).digest('hex').slice(0, 12);
  const cache = `${OUT}/atlas-${key}.rgba`;
  if (existsSync(cache)) return new Uint8Array(readFileSync(cache));
  console.log('painting atlas on CanvasKit…');
  const CK = await CanvasKitInit({ locateFile: (f: string) => `node_modules/canvaskit-wasm/bin/full/${f}` });
  const S = JsiSkApi(CK);
  const face = (p: string) => S.Typeface.MakeFreeTypeFaceFromData(S.Data.fromBytes(new Uint8Array(readFileSync(p))));
  const sup = '/System/Library/Fonts/Supplemental/';
  const faces = {
    serif: face(sup + 'Baskerville.ttc'),
    serifItalic: face(sup + 'Georgia Italic.ttf'),
    serifBold: face(sup + 'Georgia Bold.ttf'),
    display: face(sup + 'Didot.ttc'),
    script: face(sup + 'SnellRoundhand.ttc'),
  };
  const fonts: Fonts = { font: (role, size) => S.Font(faces[role], size) };
  const surface = S.Surface.Make(ATLAS, ATLAS);
  const t0 = Date.now();
  paintAtlas(S, surface.getCanvas(), layoutAtlas(), fonts);
  surface.flush();
  const img = surface.makeImageSnapshot();
  const px = img.readPixels(0, 0, { width: ATLAS, height: ATLAS, colorType: 4, alphaType: 2 }) as Uint8Array;
  console.log(`atlas painted in ${Date.now() - t0} ms`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(cache, px);
  writeFileSync(`${OUT}/atlas.png`, encodePNG(unpremul(px), ATLAS, ATLAS));
  return px;
}

function unpremul(px: Uint8Array) {
  const o = new Uint8Array(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    const k = a ? 255 / a : 0;
    o[i] = Math.min(255, px[i] * k);
    o[i + 1] = Math.min(255, px[i + 1] * k);
    o[i + 2] = Math.min(255, px[i + 2] * k);
    o[i + 3] = a;
  }
  return o;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const gpu = create([]);
  const adapter = await gpu.requestAdapter();
  const device = await adapter!.requestDevice();
  device.addEventListener?.('uncapturederror', (e: any) => console.error('GPU error:', e.error?.message));
  const fmt: GPUTextureFormat = 'rgba8unorm';

  const px = await atlasPixels();
  const srcTex = device.createTexture({ size: [ATLAS, ATLAS], format: fmt, usage: 0x01 | 0x02 | 0x04 });
  device.queue.writeTexture({ texture: srcTex }, px, { bytesPerRow: ATLAS * 4 }, [ATLAS, ATLAS]);
  const atlas = buildAtlas(device, srcTex, fmt);
  const table = patternTable(layoutAtlas(), MAX_PATTERNS);
  const bundle = createBundle(device, fmt, SCENES.map((s) => s.asset), atlas, table);
  const rig = makeRig(SCENES[0].asset);
  const w = createWorld(SCENES, rig, SCENES.map((s) => slotInfo(s.asset)));
  w.rs.bundle = bundle;

  // Shots: "<scene>[@t][:p=<0..1>][:open=<0..1>][:yaw=<rad>][:WxH]", comma separated.
  const shots = opt('shot', 'woods').split(',');
  for (const shot of shots) {
    const [head, ...mods] = shot.split(':');
    const [name, tStr] = head.split('@');
    const si = sceneIndex(name === 'cover' ? 'woods' : name);
    if (si < 0) throw new Error(`unknown scene ${name}`);
    let open = name === 'cover' ? 0 : 1;
    let p = -1;
    let sw = name === 'cover' ? 466 : W;
    let sh = name === 'cover' ? 678 : H;
    let yaw = 0;
    for (const m of mods) {
      const [k, v] = m.split('=');
      if (k === 'p') p = Number(v);
      else if (k === 'open') open = Number(v);
      else if (k === 'yaw') yaw = Number(v);
      else if (/^\d+x\d+$/.test(k)) [sw, sh] = k.split('x').map(Number);
    }
    w.W = sw;
    w.H = sh;
    w.scale = SCALE;
    w.time = tStr ? Number(tStr) : 3;
    w.wasCover = sw < sh;
    w.level = si;
    w.arrive = 1;
    w.kArrive = 1;
    settleBook(w, si === 0 ? open : 1);
    w.manualOpen = open > 0.5;
    w.hingeAvail = false;
    w.orbit.yaw = yaw;
    w.orbit.dragging = true;
    if (p >= 0) setTransition(w, si, p);
    else w.tr.on = false;
    const tw = Math.round(sw * SCALE);
    const th = Math.round(sh * SCALE);
    const tg = createTargets(bundle, tw, th, 0x01, 1);
    w.rs.targets = tg;
    stepWorld(w, 0);
    const t0 = Date.now();
    renderFrame(w.rs);
    const bytesPerRow = Math.ceil((tw * 4) / 256) * 256;
    const rb = device.createBuffer({ size: bytesPerRow * th, usage: 0x01 | 0x08 });
    const enc = device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tg.out[0].texture }, { buffer: rb, bytesPerRow }, [tw, th]);
    device.queue.submit([enc.finish()]);
    await rb.mapAsync(1);
    const data = new Uint8Array(rb.getMappedRange());
    const img = new Uint8Array(tw * th * 4);
    for (let y = 0; y < th; y++) img.set(data.subarray(y * bytesPerRow, y * bytesPerRow + tw * 4), y * tw * 4);
    rb.unmap();
    const file = `${OUT}/${shot.replace(/[:=@]/g, '_')}.png`;
    writeFileSync(file, encodePNG(img, tw, th));
    console.log(`${shot}: ${tw}x${th} in ${Date.now() - t0} ms -> ${file}  portal=${w.portalScreen.map((v) => v.toFixed(0)).join(',')}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
