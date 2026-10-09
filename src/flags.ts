// Launch flags, read once at startup. See AGENTS.md for the list.
import { Settings } from 'react-native';

// Launch flags arrive as NSUserDefaults: `simctl launch <udid> com.giabaojs.folio -showreel 1`.
function flag(name: string) {
  const v = Settings.get(name);
  return v === 1 || v === '1' || v === true || v === 'true';
}

function num(name: string, def: number) {
  const v = Settings.get(name);
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : def;
}

// Autopilot through the whole story (for recordings): opens the book, dives every few seconds.
export const SHOWREEL = flag('showreel');
// Start inside a chapter (0..3), with the book already open.
export const START_CHAPTER = num('chapter', -1);
// On-screen setup / frame status line.
export const DEBUG = flag('debug');
export const MUTE = flag('mute');
export const NO_HAPTICS = flag('nohaptics');

// Debug: clear the frame to red instead of rendering (GPU path check).
export const TEST_CLEAR = flag('testclear');
// Debug: render only the first N passes (1 composite, 2 bloom, 3 main, 4 shadow, 5 inner, 6 particles).
export const RENDER_STAGE = num('stage', 99);
// Debug: draw the paper atlas in a corner, or (-pattern <id>) just one pattern's region.
export const SHOW_ATLAS = flag('atlas');
export const SHOW_PATTERN = num('pattern', -1);
