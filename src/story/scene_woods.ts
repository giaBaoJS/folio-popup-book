// Chapter I: the open book on the reading table, the pop-up Lantern House.
import { WOODS } from '../assets/scenes/woods';
import type { SceneDef } from './types';
import { WOODS_CAM, WOODS_LOOK, WOODS_POINTS } from './looks';

export const WOODS_SCENE: SceneDef = {
  name: 'woods',
  asset: WOODS,
  look: WOODS_LOOK,
  points: WOODS_POINTS,
  cam: WOODS_CAM,
  // Arriving from the deep sea, the camera falls down into the open book from above.
  entry: { ...WOODS_CAM, pos: [0, 3.4, 0.35], target: [0, 0.3, -0.02], up: [0, 0, -1] },
  portalPart: 'house',
  chapter: {
    numeral: 'I',
    title: 'The Lantern House',
    body: 'Deep in the paper woods stands a house whose windows never go dark. Nobody has seen who lives there. Everybody has seen the light in the tower.',
    hint: 'Pinch into the glowing window',
  },
};
