// The app's only screen: GPU setup (Skia's Dawn device shared with WebGPU), the Graphite
// view, the UI-thread frame loop, gestures, the hinge and the audio/haptics bridge.
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import type { SkGraphiteContext, SkiaGraphiteViewRef, SkImage } from 'react-native-skia';
import { FilterMode, MipmapMode, Skia, SkiaGraphiteView } from 'react-native-skia';
import { importDevice } from 'react-native-webgpu';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { addHingeListener, hingeSupported } from '../../modules/folio-hinge';
import { ATLAS, layoutAtlas, paintAtlas, patternTable } from '../art/atlas';
import type { Fonts } from '../art/atlas';
import { initAudio, playCue, setScene } from '../audio';
import { stepShowreel } from '../director/showreel';
import type { World } from '../director/world';
import { beginPinch, createWorld, endPinch, goBack, movePinch, orbitBy, orbitEnd, settleBook, stepWorld, tapAt } from '../director/world';
import type { Bundle, Targets } from '../engine/gpu';
import { buildAtlas, createBundle, createTargets, destroyTargets } from '../engine/gpu';
import { renderFrame } from '../engine/render';
import { MAX_PATTERNS } from '../engine/shaders';
import { DEBUG, MUTE, NO_HAPTICS, RENDER_STAGE, SHOW_ATLAS, SHOW_PATTERN, SHOWREEL, START_CHAPTER, TEST_CLEAR } from '../flags';
import { SCENES } from '../story/registry';
import { makeRig, slotInfo } from '../story/rig';
import type { UiRes } from './overlay';
import { TAP_BACK, TAP_CARD, createUiRes, drawOverlay, tapOverlay } from './overlay';

// UI-runtime globals shared by the frame callback and the gesture worklets.
type G = { __folio?: World; __folioUi?: UiRes; __folioImgs?: SkImage[]; __folioPinch?: number };

// Flags as plain constants so worklets capture numbers, not module objects.
const SHOWREEL_UI = SHOWREEL;
const DEBUG_UI = DEBUG;
const MUTE_UI = MUTE;
const TEST_CLEAR_UI = TEST_CLEAR;
const STAGE_UI = RENDER_STAGE;
// -atlas 1 shows the whole atlas; -pattern <id> zooms into one pattern's region.
const ATLAS_RECT: number[] = (() => {
  const r = layoutAtlas().find((q) => q.id === SHOW_PATTERN);
  return r ? [r.x, r.y, r.w, r.h] : [0, 0, ATLAS, ATLAS];
})();

const MAX_SCALE = 2;
const TEX_RENDER = 0x10;
const TEX_BINDING = 0x04;
const TEX_COPY_SRC = 0x01;

function haptic(code: number) {
  if (code === 1) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  else if (code === 2) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  else Haptics.selectionAsync();
}

// Faces for the atlas painters, by role (tools/headless.ts loads font files for the same roles).
function systemFonts(): Fonts {
  const mgr = Skia.FontMgr.System();
  const face = (family: string, weight: number, slant: number) => mgr.matchFamilyStyle(family, { weight, width: 5, slant });
  const faces = {
    serif: face('Baskerville', 400, 0),
    serifItalic: face('Baskerville', 400, 1),
    serifBold: face('Baskerville', 600, 0),
    display: face('Didot', 700, 0),
    script: face('Snell Roundhand', 400, 0),
  };
  return { font: (role, size) => Skia.Font(faces[role], size) };
}

export function Stage() {
  const ref = useRef<SkiaGraphiteViewRef>(null);
  const ctx = useSharedValue<SkGraphiteContext | null>(null);
  const hinge = useSharedValue({ avail: false, angle: 0 });
  const hapticsOn = useSharedValue(false);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = useState('starting');
  const [frameStatus, setFrameStatus] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const audioKey = useSharedValue(-1);

  useEffect(() => {
    if (!MUTE) {
      try {
        initAudio();
      } catch (e) {
        console.warn('[folio] audio unavailable', e);
      }
    }
    const avail = hingeSupported();
    hinge.value = { avail, angle: 0 };
    const sub = addHingeListener((e) => {
      hinge.value = { avail: e.available, angle: e.angle };
    });
    return () => sub?.remove();
  }, [hinge]);

  // GPU: Skia's Dawn device, shared with WebGPU. Skia paints the paper atlas straight into
  // a WebGPU texture; WebGPU builds its mip chain and renders the scenes.
  useEffect(() => {
    try {
      const t0 = Date.now();
      const device = importDevice(Skia.getNativeDevice());
      const format = navigator.gpu.getPreferredCanvasFormat();
      let errors = 0;
      device.addEventListener('uncapturederror', (ev: Event) => {
        const msg = (ev as unknown as { error?: { message?: string } }).error?.message ?? String(ev);
        if (errors++ < 3) {
          console.error('[folio] GPU error', msg);
          setFailed((f) => `${f ?? ''}\n${msg.slice(0, 400)}`);
        }
      });
      const info = (device as unknown as { adapterInfo?: Record<string, unknown> }).adapterInfo ?? {};
      const sim = /simulator/i.test(`${info.device ?? ''} ${info.description ?? ''} ${info.vendor ?? ''}`);
      hapticsOn.value = !NO_HAPTICS && !SHOWREEL && !sim;
      setStatus('painting the atlas');
      const regions = layoutAtlas();
      const src = device.createTexture({ size: [ATLAS, ATLAS], format, usage: TEX_RENDER | TEX_BINDING | TEX_COPY_SRC });
      const surface = Skia.Surface.MakeFromGPUTexture(src);
      paintAtlas(Skia, surface.getCanvas(), regions, systemFonts());
      surface.flush();
      const atlas = buildAtlas(device, src, format);
      const t1 = Date.now();
      setStatus(`atlas ${t1 - t0} ms, compiling pipelines`);
      const b = createBundle(device, format, SCENES.map((s) => s.asset), atlas, patternTable(regions, MAX_PATTERNS));
      setStatus(`gpu ready: atlas ${t1 - t0} ms, pipelines ${Date.now() - t1} ms, haptics ${hapticsOn.value ? 'on' : 'off'}`);
      setBundle(b);
      // The source texture is only needed until the copy runs.
      setTimeout(() => {
        surface.dispose();
        src.destroy();
      }, 3000);
    } catch (e) {
      console.error('[folio] GPU init failed', e);
      setFailed(String(e));
    }
  }, [hapticsOn]);

  useEffect(() => {
    ctx.value = ref.current?.getContext() ?? null;
  }, [ctx, dims]);

  // (Re)build size-dependent targets and install or update the world on the UI runtime.
  useEffect(() => {
    if (!bundle || !dims) return;
    const scale = Math.min(PixelRatio.get(), MAX_SCALE);
    const pw = Math.round(dims.w * scale);
    const ph = Math.round(dims.h * scale);
    const targets: Targets = createTargets(bundle, pw, ph);
    const imgs = targets.out.map((o) => Skia.Image.MakeImageFromGPUTexture(o.texture));
    if (SHOW_ATLAS || SHOW_PATTERN >= 0) imgs.push(Skia.Image.MakeImageFromGPUTexture(bundle.atlas.texture));
    const ui = createUiRes(dims.w, SCENES);
    const W = dims.w;
    const H = dims.h;
    // The UI runtime only needs the scene metadata, not the vertex data.
    const lite = SCENES.map((s) => ({ ...s, asset: { ...s.asset, vertices: '', indices: '' } }));
    const rig = makeRig(SCENES[0].asset);
    const slots = SCENES.map((s) => slotInfo(s.asset));
    const startChapter = START_CHAPTER;
    scheduleOnUI(() => {
      'worklet';
      const g = globalThis as unknown as G;
      let w = g.__folio;
      if (!w) {
        w = createWorld(lite, rig, slots);
        if (startChapter >= 0) {
          w.level = Math.min(startChapter, lite.length - 1);
          w.manualOpen = true;
          settleBook(w, 1);
          w.chapterA = 1;
        }
        g.__folio = w;
      }
      const old = w.rs.targets;
      w.rs.bundle = bundle;
      w.rs.targets = targets;
      w.W = W;
      w.H = H;
      w.scale = scale;
      w.slotScene = [-1, -1];
      g.__folioUi = ui;
      g.__folioImgs = imgs;
      if (old && old !== targets) destroyTargets(old);
    });
    setStatus((s) => `${s.split(' | ')[0]} | targets ${pw}x${ph}`);
  }, [bundle, dims]);

  // Boot screen on the UI thread, so it breathes while the JS thread compiles.
  const bootOut = useSharedValue(1);
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [pulse]);
  const bootStyle = useAnimatedStyle(() => ({ opacity: bootOut.value }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * pulse.value, transform: [{ scale: 0.7 + 0.5 * pulse.value }] }));

  useFrameCallback((info) => {
    const g = globalThis as unknown as G;
    const w = g.__folio;
    const ui = g.__folioUi;
    const imgs = g.__folioImgs;
    const c = ctx.value;
    if (!w || !ui || !imgs || !w.rs.bundle || !w.rs.targets || !c) return;
    if (bootOut.value === 1) bootOut.value = withDelay(200, withTiming(0, { duration: 700 }));
    const ms = info.timeSincePreviousFrame ?? 16.7;
    if (ms <= 0) return;
    const dt = Math.min(ms / 1000, 1 / 30);
    const hv = hinge.value;
    w.hingeAvail = hv.avail;
    w.hingeAngle = hv.avail ? hv.angle : w.hingeAngle;
    if (SHOWREEL_UI) stepShowreel(w);
    let recording = false;
    try {
      stepWorld(w, dt);
      w.rs.outIndex = (w.rs.outIndex + 1) % w.rs.targets.out.length;
      if (TEST_CLEAR_UI) {
        const enc = w.rs.bundle.device.createCommandEncoder();
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: w.rs.targets.out[w.rs.outIndex].view, loadOp: 'clear', storeOp: 'store', clearValue: [1, 0, 0, 1] }] });
        pass.end();
        w.rs.bundle.device.queue.submit([enc.finish()]);
      } else renderFrame(w.rs, STAGE_UI);
      const canvas = c.beginRecording();
      recording = true;
      canvas.clear(Skia.Color('#0b0714'));
      const img = imgs[w.rs.outIndex % 2];
      canvas.drawImageRectOptions(img, Skia.XYWHRect(0, 0, w.rs.targets.w, w.rs.targets.h), Skia.XYWHRect(0, 0, w.W, w.H), FilterMode.Linear, MipmapMode.None, ui.paints.image);
      drawOverlay(Skia, canvas, w, ui);
      if (imgs.length > 2) canvas.drawImageRectOptions(imgs[2], Skia.XYWHRect(ATLAS_RECT[0], ATLAS_RECT[1], ATLAS_RECT[2], ATLAS_RECT[3]), Skia.XYWHRect(10, 60, 300, 300), FilterMode.Linear, MipmapMode.None, ui.paints.image);
      recording = false;
      c.submit(c.finishRecording());
    } catch (e) {
      if (recording) c.finishRecording();
      w.sounds.length = 0;
      w.haptics.length = 0;
      scheduleOnRN(setFrameStatus, `frame error: ${(e as Error)?.message ?? String(e)}`);
      return;
    }
    if (w.sounds.length) {
      if (!MUTE_UI) for (const s of w.sounds) scheduleOnRN(playCue, s);
      w.sounds.length = 0;
    }
    {
      // Music + ambience follow the scene on screen.
      const sc = w.tr.on ? (w.tr.p > 0.6 ? w.tr.to : w.tr.from) : w.level;
      const op = Math.round(w.book * 4) / 4;
      const key = sc * 10 + op * 4;
      if (!MUTE_UI && key !== audioKey.value) {
        audioKey.value = key;
        scheduleOnRN(setScene, sc, op);
      }
    }
    if (w.haptics.length) {
      if (hapticsOn.value) for (const h of w.haptics) scheduleOnRN(haptic, h);
      w.haptics.length = 0;
    }
    if (DEBUG_UI && Math.floor(w.time) !== Math.floor(w.time - dt)) {
      scheduleOnRN(setFrameStatus, `img=${imgs[0].width()}x${imgs[0].height()} t=${w.time.toFixed(0)} lvl=${w.level} book=${w.book.toFixed(2)} hinge=${w.hingeAvail ? w.hingeAngle.toFixed(2) : '-'} tr=${w.tr.on ? w.tr.p.toFixed(2) : '-'} ${w.W}x${w.H} dt=${ms.toFixed(1)}`);
    }
  });

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        // 0 until the fingers commit to a direction: 1 = diving in, -1 = backing out.
        (globalThis as unknown as G).__folioPinch = 0;
      })
      .onUpdate((e) => {
        const g = globalThis as unknown as G;
        const w = g.__folio;
        if (!w) return;
        if (!g.__folioPinch) {
          // Direction decided once the fingers clearly move apart or together.
          if (e.scale > 1.04) {
            beginPinch(w, true);
            g.__folioPinch = 1;
          } else if (e.scale < 0.96) {
            beginPinch(w, false);
            g.__folioPinch = -1;
          }
        }
        if (g.__folioPinch) movePinch(w, e.scale);
      })
      .onEnd((e) => {
        const g = globalThis as unknown as G;
        const w = g.__folio;
        if (!w) return;
        if (g.__folioPinch) endPinch(w, e.velocity);
        g.__folioPinch = 0;
      });
    const pan = Gesture.Pan()
      .maxPointers(1)
      .minDistance(8)
      .onChange((e) => {
        const w = (globalThis as unknown as G).__folio;
        if (w && !w.tr.on) orbitBy(w, e.changeX, e.changeY);
      })
      .onFinalize(() => {
        const w = (globalThis as unknown as G).__folio;
        if (w) orbitEnd(w);
      });
    const tap = Gesture.Tap()
      .maxDuration(400)
      .onEnd((e, ok) => {
        const g = globalThis as unknown as G;
        const w = g.__folio;
        const ui = g.__folioUi;
        if (!ok || !w || !ui) return;
        const hit = tapOverlay(w, ui, e.x, e.y);
        if (hit === TAP_BACK) goBack(w);
        else if (hit === TAP_CARD) w.cardWant = w.cardOpen > 0.5 ? 0 : 1;
        else tapAt(w, e.x, e.y);
      });
    return Gesture.Race(pinch, Gesture.Exclusive(pan, tap));
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setDims((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
        <SkiaGraphiteView ref={ref} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.boot, bootStyle]} pointerEvents="none">
          <Animated.View style={[styles.bootDot, dotStyle]} />
          <Text style={styles.bootText}>FOLIO</Text>
        </Animated.View>
        {DEBUG && (
          <View style={styles.debug} pointerEvents="none">
            <Text style={styles.debugText}>{status}</Text>
            <Text style={styles.debugText}>{frameStatus}</Text>
          </View>
        )}
        {failed && (
          <View style={styles.fallback} pointerEvents="none">
            <Text style={styles.fallbackText}>{failed}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fallback: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 32 },
  fallbackText: { color: '#aaa', fontSize: 14, textAlign: 'center' },
  boot: { ...StyleSheet.absoluteFill, backgroundColor: '#120d1f', alignItems: 'center', justifyContent: 'center' },
  bootDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f2cf7d' },
  bootText: { marginTop: 16, color: '#f2cf7d', fontSize: 12, letterSpacing: 6, fontFamily: 'Baskerville', opacity: 0.85 },
  debug: { position: 'absolute', left: 12, right: 12, bottom: 12, padding: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
  debugText: { color: '#7f7', fontSize: 11, fontFamily: 'Menlo' },
});
