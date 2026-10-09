import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

export type HingeStatus = 'unknown' | 'closed' | 'partiallyOpen' | 'fullyOpen';
export type HingeEvent = { available: boolean; angle: number; status: HingeStatus };

type Native = {
  isSupported(): boolean;
  addListener(event: 'onHinge', cb: (e: HingeEvent) => void): EventSubscription;
};

const native = requireOptionalNativeModule<Native>('FolioHinge');

export function hingeSupported() {
  return !!native && native.isSupported();
}

// Angle in radians: 0 = closed, π = flat open.
export function addHingeListener(cb: (e: HingeEvent) => void): EventSubscription | null {
  return native ? native.addListener('onHinge', cb) : null;
}
