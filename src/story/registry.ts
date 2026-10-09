// The story order. Each scene's portal leads to the next; the last one leads back to the book.
import { ATTIC_SCENE } from './scene_attic';
import { DEEP_SCENE } from './scene_deep';
import { LANTERN_SCENE } from './scene_lantern';
import { WOODS_SCENE } from './scene_woods';
import type { SceneDef } from './types';

export const SCENES: SceneDef[] = [WOODS_SCENE, ATTIC_SCENE, LANTERN_SCENE, DEEP_SCENE];

export function sceneIndex(name: string) {
  return SCENES.findIndex((s) => s.name === name);
}
