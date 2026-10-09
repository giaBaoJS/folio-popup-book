// Sound: a music-box lullaby under everything, one ambience per scene (cross-faded), and
// one-shot effects from small player pools. Every file is synthesized by tools/synth.py.
import type { AudioPlayer } from 'expo-audio';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const FX: Record<string, number> = {
  pop1: require('../assets/sfx/pop1.wav'),
  pop2: require('../assets/sfx/pop2.wav'),
  pop3: require('../assets/sfx/pop3.wav'),
  open: require('../assets/sfx/open.wav'),
  close: require('../assets/sfx/close.wav'),
  dive: require('../assets/sfx/dive.wav'),
  arrive: require('../assets/sfx/arrive.wav'),
  back: require('../assets/sfx/back.wav'),
  tap: require('../assets/sfx/tap.wav'),
};

const AMBIENCE = [
  require('../assets/sfx/amb_woods.wav'),
  require('../assets/sfx/amb_attic.wav'),
  require('../assets/sfx/amb_lantern.wav'),
  require('../assets/sfx/amb_deep.wav'),
];

// Cue codes match `Cue` in src/director/world.ts (1 = pop, handled in playCue).
const CUE_SOUND: Record<number, { name: string; volume: number }> = {
  2: { name: 'open', volume: 0.9 },
  3: { name: 'dive', volume: 0.85 },
  4: { name: 'arrive', volume: 0.55 },
  5: { name: 'tap', volume: 0.5 },
  6: { name: 'close', volume: 0.9 },
  7: { name: 'back', volume: 0.7 },
};

const pools: Record<string, AudioPlayer[]> = {};
const next: Record<string, number> = {};
let music: AudioPlayer | null = null;
const amb: (AudioPlayer | null)[] = [];
let ambTarget = -1;
let ambVol: number[] = [];
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let ready = false;
let lastPop = 0;

export function initAudio() {
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  for (const [name, src] of Object.entries(FX)) {
    const n = name.startsWith('pop') ? 3 : 2;
    pools[name] = Array.from({ length: n }, () => {
      const pl = createAudioPlayer(src);
      // Pops vary their playback rate: let the pitch move with it.
      if (name.startsWith('pop')) pl.shouldCorrectPitch = false;
      return pl;
    });
    next[name] = 0;
  }
  music = createAudioPlayer(require('../assets/sfx/music.wav'));
  music.loop = true;
  music.volume = 0;
  AMBIENCE.forEach((src, i) => {
    const p = createAudioPlayer(src);
    p.loop = true;
    p.volume = 0;
    amb[i] = p;
  });
  ambVol = AMBIENCE.map(() => 0);
}

function fire(name: string, volume: number, rate = 1) {
  const pool = pools[name];
  if (!pool) return;
  const p = pool[next[name] % pool.length];
  next[name] += 1;
  try {
    p.volume = volume;
    if (rate !== 1) p.setPlaybackRate(rate);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // A player that is still loading just misses this cue.
  }
}

export function playCue(code: number) {
  if (!ready) return;
  if (code === 1) {
    // Pop-ups come in bursts: thin them out and vary the pitch.
    const now = Date.now();
    if (now - lastPop < 45) return;
    lastPop = now;
    const k = 1 + Math.floor(Math.random() * 3);
    fire(`pop${k}`, 0.35 + Math.random() * 0.25, 0.92 + Math.random() * 0.18);
    return;
  }
  const s = CUE_SOUND[code];
  if (s) fire(s.name, s.volume);
}

// Music and ambience follow the story: scene = index of the scene on screen, bookOpen 0..1
// (the music swells as the book opens).
export function setScene(scene: number, bookOpen: number) {
  if (!ready) return;
  if (music) {
    const target = 0.12 + 0.28 * bookOpen;
    if (!music.playing) music.play();
    music.volume = target;
  }
  if (scene === ambTarget) return;
  ambTarget = scene;
  amb.forEach((p) => {
    if (p && !p.playing) p.play();
  });
  if (fadeTimer) clearInterval(fadeTimer);
  fadeTimer = setInterval(() => {
    let done = true;
    amb.forEach((p, i) => {
      if (!p) return;
      const goal = i === ambTarget ? 0.55 : 0;
      const v = ambVol[i] + Math.sign(goal - ambVol[i]) * Math.min(0.04, Math.abs(goal - ambVol[i]));
      ambVol[i] = v;
      p.volume = v;
      if (Math.abs(goal - v) > 1e-3) done = false;
    });
    if (done && fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }, 50);
}
