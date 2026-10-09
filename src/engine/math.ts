// Column-major 4x4 matrices in Float32Array(16) / plain number arrays. Every helper is a
// worklet so the UI runtime can call it. Helpers are declared before their callers:
// worklet closures are captured when the module evaluates.

export type V3 = [number, number, number];

export function deg(d: number) {
  'worklet';
  return (d * Math.PI) / 180;
}

export function clamp(x: number, a: number, b: number) {
  'worklet';
  return x < a ? a : x > b ? b : x;
}

export function mix(a: number, b: number, t: number) {
  'worklet';
  return a + (b - a) * t;
}

export function smoothstep(a: number, b: number, x: number) {
  'worklet';
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeInOut(t: number) {
  'worklet';
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function easeOut(t: number) {
  'worklet';
  const x = clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

export function v3sub(a: number[], b: number[]): V3 {
  'worklet';
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function v3add(a: number[], b: number[]): V3 {
  'worklet';
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function v3scale(a: number[], s: number): V3 {
  'worklet';
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function v3mix(a: number[], b: number[], t: number): V3 {
  'worklet';
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function v3dot(a: number[], b: number[]) {
  'worklet';
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function v3cross(a: number[], b: number[]): V3 {
  'worklet';
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function v3len(a: number[]) {
  'worklet';
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

export function v3norm(a: number[]): V3 {
  'worklet';
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function identity(o: Float32Array, off = 0) {
  'worklet';
  for (let i = 0; i < 16; i++) o[off + i] = i % 5 === 0 ? 1 : 0;
}

// o = a * b (all column-major, 16 floats). o may alias neither a nor b.
export function mul(o: Float32Array | number[], a: ArrayLike<number>, b: ArrayLike<number>, off = 0) {
  'worklet';
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[off + c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
}

// o[oo..] = a[ao..] * b[bo..] without allocating views. o must not overlap a or b.
export function mulAt(o: Float32Array | number[], oo: number, a: ArrayLike<number>, ao: number, b: ArrayLike<number>, bo: number) {
  'worklet';
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[oo + c * 4 + r] =
        a[ao + r] * b[bo + c * 4] + a[ao + 4 + r] * b[bo + c * 4 + 1] + a[ao + 8 + r] * b[bo + c * 4 + 2] + a[ao + 12 + r] * b[bo + c * 4 + 3];
    }
  }
}

export function lookAt(eye: number[], target: number[], up: number[]): number[] {
  'worklet';
  const f = v3norm(v3sub(target, eye));
  let s = v3cross(f, up);
  if (v3len(s) < 1e-6) s = v3cross(f, [0, 0, -1]);
  s = v3norm(s);
  const u = v3cross(s, f);
  return [
    s[0], u[0], -f[0], 0,
    s[1], u[1], -f[1], 0,
    s[2], u[2], -f[2], 0,
    -v3dot(s, eye), -v3dot(u, eye), v3dot(f, eye), 1,
  ];
}

// WebGPU clip space: z in [0, 1]. shiftX/shiftY move the principal point (in NDC units)
// so the subject can sit off-centre without turning the camera.
export function perspective(fovY: number, aspect: number, near: number, far: number, shiftX = 0, shiftY = 0): number[] {
  'worklet';
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    shiftX, shiftY, far * nf, -1,
    0, 0, near * far * nf, 0,
  ];
}

export function ortho(l: number, r: number, b: number, t: number, n: number, f: number): number[] {
  'worklet';
  return [
    2 / (r - l), 0, 0, 0,
    0, 2 / (t - b), 0, 0,
    0, 0, 1 / (n - f), 0,
    -(r + l) / (r - l), -(t + b) / (t - b), n / (n - f), 1,
  ];
}

// Rotation of `angle` radians about a unit axis through `pivot`, written into o at off.
export function hingeMatrix(o: Float32Array | number[], pivot: ArrayLike<number>, axis: ArrayLike<number>, angle: number, off = 0) {
  'worklet';
  const x = axis[0];
  const y = axis[1];
  const z = axis[2];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const m00 = t * x * x + c;
  const m01 = t * x * y - s * z;
  const m02 = t * x * z + s * y;
  const m10 = t * x * y + s * z;
  const m11 = t * y * y + c;
  const m12 = t * y * z - s * x;
  const m20 = t * x * z - s * y;
  const m21 = t * y * z + s * x;
  const m22 = t * z * z + c;
  const px = pivot[0];
  const py = pivot[1];
  const pz = pivot[2];
  o[off + 0] = m00;
  o[off + 1] = m10;
  o[off + 2] = m20;
  o[off + 3] = 0;
  o[off + 4] = m01;
  o[off + 5] = m11;
  o[off + 6] = m21;
  o[off + 7] = 0;
  o[off + 8] = m02;
  o[off + 9] = m12;
  o[off + 10] = m22;
  o[off + 11] = 0;
  o[off + 12] = px - (m00 * px + m01 * py + m02 * pz);
  o[off + 13] = py - (m10 * px + m11 * py + m12 * pz);
  o[off + 14] = pz - (m20 * px + m21 * py + m22 * pz);
  o[off + 15] = 1;
}

export function transformPoint(m: ArrayLike<number>, p: number[], off = 0): V3 {
  'worklet';
  const x = p[0];
  const y = p[1];
  const z = p[2];
  return [
    m[off] * x + m[off + 4] * y + m[off + 8] * z + m[off + 12],
    m[off + 1] * x + m[off + 5] * y + m[off + 9] * z + m[off + 13],
    m[off + 2] * x + m[off + 6] * y + m[off + 10] * z + m[off + 14],
  ];
}

export function transformDir(m: ArrayLike<number>, p: number[], off = 0): V3 {
  'worklet';
  return [
    m[off] * p[0] + m[off + 4] * p[1] + m[off + 8] * p[2],
    m[off + 1] * p[0] + m[off + 5] * p[1] + m[off + 9] * p[2],
    m[off + 2] * p[0] + m[off + 6] * p[1] + m[off + 10] * p[2],
  ];
}

// Projects a world point; returns [x, y] in points (top-left origin) and w (depth).
export function project(viewProj: ArrayLike<number>, p: number[], W: number, H: number): [number, number, number] {
  'worklet';
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12];
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13];
  const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
  const iw = 1 / (Math.abs(w) < 1e-6 ? 1e-6 : w);
  return [(x * iw * 0.5 + 0.5) * W, (1 - (y * iw * 0.5 + 0.5)) * H, w];
}

// Cheap deterministic 0..1 noise from an integer-ish seed.
export function hash(n: number) {
  'worklet';
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
