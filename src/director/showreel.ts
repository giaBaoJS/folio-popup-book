// Autopilot for recordings (`-showreel 1`): opens the book if nobody does, then dives into
// each chapter after the reader has had time to take it in.
import type { World } from './world';
import { diveIn } from './world';

export function stepShowreel(w: World) {
  'worklet';
  if (w.book < 0.02 && w.time > 2.5 && !w.manualOpen && !w.hingeAvail) {
    w.manualOpen = true;
    w.sounds.push(2); // Cue.BookOpen
  }
  if (w.tr.on || w.book < 0.985) return;
  const dwell = w.level === 0 ? (w.loops > 0 ? 7 : 6.5) : 7.5;
  const since = w.level === 0 && w.loops === 0 ? w.openT : w.sceneT;
  if (since > dwell && w.chapterA > 0.9) diveIn(w);
}
