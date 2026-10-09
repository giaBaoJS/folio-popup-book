// Shape of the generated scene modules in src/assets/scenes (written by tools/blender/export.py).
export type PartMeta = {
  role?: 'page' | 'spine' | 'pop' | 'static' | 'actor';
  parent?: string;
  order?: number;
  lie?: number;
  sway?: number;
  side?: number;
  k?: number;
  n?: number;
  lo?: [number, number, number];
  hi?: [number, number, number];
  portal?: { center: [number, number, number]; normal: [number, number, number]; radius: number };
  [key: string]: unknown;
};

export type PartAsset = {
  name: string;
  pivot: [number, number, number];
  axis: [number, number, number];
  meta: PartMeta;
};

export type SceneAsset = {
  name: string;
  vertexCount: number;
  indexCount: number;
  min: [number, number, number];
  max: [number, number, number];
  parts: PartAsset[];
  vertices: string;
  indices: string;
};
