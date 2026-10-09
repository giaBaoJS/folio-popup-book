// GPU resources: pipelines, buffers, the mipmapped atlas and size-dependent render targets.
// Created on the JS thread, then handed to the UI runtime where every frame is encoded.
import type { SceneAsset } from '../assets/types';
import { BACKGROUND, FRAME_FLOATS, LIGHT, MAX_PATTERNS, MESH, PARTICLES, POST, SHADOW, SHADOW_SIZE, SLOTS } from './shaders';

const HDR: GPUTextureFormat = 'rgba16float';
const DEPTH: GPUTextureFormat = 'depth24plus';
const SHADOW_FMT: GPUTextureFormat = 'depth32float';
const SAMPLES = 4;
const ATLAS_SIZE = 4096; // matches ATLAS in src/art/brush.ts
export const BLOOM_LEVELS = 5;
const POST_FLOATS = 16;

const VERTEX = 0x1;
const FRAGMENT = 0x2;
const BUF_COPY_DST = 0x8;
const BUF_INDEX = 0x10;
const BUF_VERTEX = 0x20;
const BUF_UNIFORM = 0x40;
const BUF_STORAGE = 0x80;
const TEX_COPY_DST = 0x02;
const TEX_BINDING = 0x04;
const TEX_RENDER = 0x10;

export type GpuScene = {
  name: string;
  vbuf: GPUBuffer;
  ibuf: GPUBuffer;
  indexCount: number;
};

export type Tex = { texture: GPUTexture; view: GPUTextureView; w: number; h: number };

export type Instance = {
  frame: GPUBuffer;
  group0: GPUBindGroup;
  group1: GPUBindGroup;
  shadow: Tex;
  base: number;
};

export type Bundle = {
  device: GPUDevice;
  outFormat: GPUTextureFormat;
  pipelines: {
    shadow: GPURenderPipeline;
    mesh: GPURenderPipeline;
    background: GPURenderPipeline;
    particles: GPURenderPipeline;
    light: GPURenderPipeline;
    prefilter: GPURenderPipeline;
    down: GPURenderPipeline;
    up: GPURenderPipeline;
    composite: GPURenderPipeline;
  };
  layouts: { g0: GPUBindGroupLayout; g1: GPUBindGroupLayout; post: GPUBindGroupLayout };
  samplers: { atlas: GPUSampler; linear: GPUSampler };
  xforms: GPUBuffer;
  slots: GPUBuffer;
  patterns: GPUBuffer;
  post: GPUBuffer;
  atlas: Tex;
  dummy: Tex;
  scenes: Record<string, GpuScene>;
  // Instance 0 = the scene on screen (outer), 1 = the scene inside the portal.
  inst: Instance[];
};

export type Targets = {
  w: number;
  h: number;
  msaa: Tex;
  depth: Tex;
  hdr: Tex;
  hdrInner: Tex;
  bloom: Tex[];
  out: Tex[];
  prefilterGroup: GPUBindGroup;
  downGroups: GPUBindGroup[];
  upGroups: GPUBindGroup[];
  compositeGroup: GPUBindGroup;
  group1Outer: GPUBindGroup;
  buffers: GPUBuffer[];
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function decodeBase64(s: string): Uint8Array {
  let len = s.length;
  while (len > 0 && s[len - 1] === '=') len--;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[s.charCodeAt(i)];
    const b = B64_LOOKUP[s.charCodeAt(i + 1)];
    const c = i + 2 < len ? B64_LOOKUP[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_LOOKUP[s.charCodeAt(i + 3)] : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function makeTex(device: GPUDevice, w: number, h: number, format: GPUTextureFormat, usage: number, sampleCount = 1, mips = 1): Tex {
  const texture = device.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format, usage, sampleCount, mipLevelCount: mips });
  return { texture, view: texture.createView(), w, h };
}

function uploadScene(device: GPUDevice, a: SceneAsset): GpuScene {
  const v = decodeBase64(a.vertices);
  const i = decodeBase64(a.indices);
  const vbuf = device.createBuffer({ size: Math.ceil(v.length / 4) * 4, usage: BUF_VERTEX | BUF_COPY_DST });
  device.queue.writeBuffer(vbuf, 0, v.buffer, v.byteOffset, Math.floor(v.length / 4) * 4);
  const ibuf = device.createBuffer({ size: i.length, usage: BUF_INDEX | BUF_COPY_DST });
  device.queue.writeBuffer(ibuf, 0, i.buffer, i.byteOffset, i.length);
  return { name: a.name, vbuf, ibuf, indexCount: a.indexCount };
}

const MIP_WGSL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
struct O { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> O {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: O;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = vec2f(p[i].x * 0.5 + 0.5, 0.5 - p[i].y * 0.5);
  return o;
}
@fragment fn fs(in: O) -> @location(0) vec4f { return textureSampleLevel(src, smp, in.uv, 0.0); }
`;

// Copies the Skia-painted atlas into a mipmapped texture and builds the mip chain.
export function buildAtlas(device: GPUDevice, source: GPUTexture, format: GPUTextureFormat): Tex {
  const mips = Math.floor(Math.log2(ATLAS_SIZE)) + 1;
  const tex = makeTex(device, ATLAS_SIZE, ATLAS_SIZE, format, TEX_BINDING | TEX_RENDER | TEX_COPY_DST, 1, mips);
  const enc = device.createCommandEncoder();
  enc.copyTextureToTexture({ texture: source }, { texture: tex.texture, mipLevel: 0 }, [ATLAS_SIZE, ATLAS_SIZE]);
  device.queue.submit([enc.finish()]);
  const module = device.createShaderModule({ code: MIP_WGSL });
  const pipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  });
  const smp = device.createSampler({ minFilter: 'linear', magFilter: 'linear' });
  const enc2 = device.createCommandEncoder();
  for (let m = 1; m < mips; m++) {
    const srcView = tex.texture.createView({ baseMipLevel: m - 1, mipLevelCount: 1 });
    const dstView = tex.texture.createView({ baseMipLevel: m, mipLevelCount: 1 });
    const bg = device.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: smp },
      ],
    });
    const pass = enc2.beginRenderPass({ colorAttachments: [{ view: dstView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
    pass.setPipeline(pipe);
    pass.setBindGroup(0, bg);
    pass.draw(3);
    pass.end();
  }
  device.queue.submit([enc2.finish()]);
  return tex;
}

export function createBundle(
  device: GPUDevice,
  outFormat: GPUTextureFormat,
  scenes: SceneAsset[],
  atlas: Tex,
  patternTable: Float32Array,
): Bundle {
  const g0 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: VERTEX | FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      { binding: 5, visibility: FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const g1 = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: FRAGMENT, texture: { sampleType: 'depth', viewDimension: '2d' } },
      { binding: 1, visibility: FRAGMENT, texture: { sampleType: 'float', viewDimension: '2d' } },
      { binding: 2, visibility: FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const tex = { sampleType: 'float' as const, viewDimension: '2d' as const };
  const post = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 1, visibility: FRAGMENT, texture: tex },
      { binding: 2, visibility: FRAGMENT, texture: tex },
      { binding: 3, visibility: FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 4, visibility: FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const plMain = device.createPipelineLayout({ bindGroupLayouts: [g0, g1] });
  const plScene = device.createPipelineLayout({ bindGroupLayouts: [g0] });
  const plPost = device.createPipelineLayout({ bindGroupLayouts: [post] });

  const meshBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: 28,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x3' },
        { shaderLocation: 1, offset: 12, format: 'snorm8x4' },
        { shaderLocation: 2, offset: 16, format: 'unorm8x4' },
        { shaderLocation: 3, offset: 20, format: 'float16x2' },
        { shaderLocation: 4, offset: 24, format: 'uint8x4' },
      ],
    },
  ];
  const mod = (code: string) => device.createShaderModule({ code });
  const mMesh = mod(MESH);
  const mShadow = mod(SHADOW);
  const mBg = mod(BACKGROUND);
  const mParts = mod(PARTICLES);
  const mLight = mod(LIGHT);
  const mPost = mod(POST);
  const ms = { count: SAMPLES };
  const additive: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
  };

  // Synchronous creation: async Dawn callbacks never fire on the device borrowed from Skia.
  const shadow = device.createRenderPipeline({
    layout: plScene,
    vertex: { module: mShadow, entryPoint: 'vs', buffers: meshBuffers },
    fragment: { module: mShadow, entryPoint: 'fs', targets: [] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: SHADOW_FMT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  const mesh = device.createRenderPipeline({
    layout: plMain,
    vertex: { module: mMesh, entryPoint: 'vs', buffers: meshBuffers },
    fragment: { module: mMesh, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: SAMPLES, alphaToCoverageEnabled: true },
  });
  const background = device.createRenderPipeline({
    layout: plScene,
    vertex: { module: mBg, entryPoint: 'vs' },
    fragment: { module: mBg, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less-equal' },
    multisample: ms,
  });
  const particles = device.createRenderPipeline({
    layout: plScene,
    vertex: { module: mParts, entryPoint: 'vs' },
    fragment: { module: mParts, entryPoint: 'fs', targets: [{ format: HDR, blend: additive }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
    multisample: ms,
  });
  const light = device.createRenderPipeline({
    layout: plScene,
    vertex: { module: mLight, entryPoint: 'vs', buffers: meshBuffers },
    fragment: { module: mLight, entryPoint: 'fs', targets: [{ format: HDR, blend: additive }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: 'less' },
    multisample: ms,
  });
  const postPipe = (entryPoint: string, format: GPUTextureFormat, blend?: GPUBlendState) =>
    device.createRenderPipeline({
      layout: plPost,
      vertex: { module: mPost, entryPoint: 'vs' },
      fragment: { module: mPost, entryPoint, targets: [{ format, blend }] },
      primitive: { topology: 'triangle-list' },
    });

  const samplers = {
    atlas: device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 8,
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    }),
    linear: device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' }),
  };

  const xforms = device.createBuffer({ size: SLOTS * 64, usage: BUF_STORAGE | BUF_COPY_DST });
  const slots = device.createBuffer({ size: SLOTS * 16, usage: BUF_STORAGE | BUF_COPY_DST });
  const patterns = device.createBuffer({ size: MAX_PATTERNS * 2 * 16, usage: BUF_STORAGE | BUF_COPY_DST });
  device.queue.writeBuffer(patterns, 0, patternTable.buffer, patternTable.byteOffset, patternTable.byteLength);
  const postBuf = device.createBuffer({ size: POST_FLOATS * 4, usage: BUF_UNIFORM | BUF_COPY_DST });
  const dummy = makeTex(device, 4, 4, HDR, TEX_BINDING);

  const inst: Instance[] = [];
  for (let k = 0; k < 2; k++) {
    const frame = device.createBuffer({ size: FRAME_FLOATS * 4, usage: BUF_UNIFORM | BUF_COPY_DST });
    const sh = makeTex(device, SHADOW_SIZE, SHADOW_SIZE, SHADOW_FMT, TEX_RENDER | TEX_BINDING);
    const group0 = device.createBindGroup({
      layout: g0,
      entries: [
        { binding: 0, resource: { buffer: frame } },
        { binding: 1, resource: { buffer: xforms } },
        { binding: 2, resource: { buffer: slots } },
        { binding: 3, resource: { buffer: patterns } },
        { binding: 4, resource: atlas.view },
        { binding: 5, resource: samplers.atlas },
      ],
    });
    // The inner scene never looks through a portal itself.
    const group1 = device.createBindGroup({
      layout: g1,
      entries: [
        { binding: 0, resource: sh.view },
        { binding: 1, resource: dummy.view },
        { binding: 2, resource: samplers.linear },
      ],
    });
    inst.push({ frame, group0, group1, shadow: sh, base: k * (SLOTS / 2) });
  }

  const gpuScenes: Record<string, GpuScene> = {};
  for (const s of scenes) gpuScenes[s.name] = uploadScene(device, s);

  return {
    device,
    outFormat,
    pipelines: {
      shadow,
      mesh,
      background,
      particles,
      light,
      prefilter: postPipe('prefilter', HDR),
      down: postPipe('down', HDR),
      up: postPipe('up', HDR, additive),
      composite: postPipe('composite', outFormat),
    },
    layouts: { g0, g1, post },
    samplers,
    xforms,
    slots,
    patterns,
    post: postBuf,
    atlas,
    dummy,
    scenes: gpuScenes,
    inst,
  };
}

// Size-dependent targets. `outUsage` lets the headless tool add COPY_SRC.
export function createTargets(b: Bundle, w: number, h: number, outUsage = 0, outCount = 2): Targets {
  const d = b.device;
  const msaa = makeTex(d, w, h, HDR, TEX_RENDER, SAMPLES);
  const depth = makeTex(d, w, h, DEPTH, TEX_RENDER, SAMPLES);
  const hdr = makeTex(d, w, h, HDR, TEX_RENDER | TEX_BINDING);
  const hdrInner = makeTex(d, w, h, HDR, TEX_RENDER | TEX_BINDING);
  const bloom: Tex[] = [];
  for (let i = 0; i < BLOOM_LEVELS; i++) {
    bloom.push(makeTex(d, Math.max(2, w >> (i + 1)), Math.max(2, h >> (i + 1)), HDR, TEX_RENDER | TEX_BINDING));
  }
  const out: Tex[] = [];
  for (let i = 0; i < outCount; i++) out.push(makeTex(d, w, h, b.outFormat, TEX_RENDER | TEX_BINDING | outUsage));

  const buffers: GPUBuffer[] = [];
  const passBuf = (src: Tex) => {
    const buf = d.createBuffer({ size: 16, usage: BUF_UNIFORM | BUF_COPY_DST });
    d.queue.writeBuffer(buf, 0, new Float32Array([1 / src.w, 1 / src.h, 1, 0]).buffer);
    buffers.push(buf);
    return buf;
  };
  const group = (a: Tex, bTex: Tex, pass: GPUBuffer) =>
    d.createBindGroup({
      layout: b.layouts.post,
      entries: [
        { binding: 0, resource: b.samplers.linear },
        { binding: 1, resource: a.view },
        { binding: 2, resource: bTex.view },
        { binding: 3, resource: { buffer: pass } },
        { binding: 4, resource: { buffer: b.post } },
      ],
    });
  const prefilterGroup = group(hdr, hdr, passBuf(hdr));
  const downGroups: GPUBindGroup[] = [];
  const upGroups: GPUBindGroup[] = [];
  for (let i = 0; i < BLOOM_LEVELS - 1; i++) {
    downGroups.push(group(bloom[i], bloom[i], passBuf(bloom[i])));
    upGroups.push(group(bloom[i + 1], bloom[i + 1], passBuf(bloom[i + 1])));
  }
  const compositeGroup = group(hdr, bloom[0], passBuf(hdr));
  // The outer scene samples the inner one through its portal.
  const group1Outer = d.createBindGroup({
    layout: b.layouts.g1,
    entries: [
      { binding: 0, resource: b.inst[0].shadow.view },
      { binding: 1, resource: hdrInner.view },
      { binding: 2, resource: b.samplers.linear },
    ],
  });
  return { w, h, msaa, depth, hdr, hdrInner, bloom, out, prefilterGroup, downGroups, upGroups, compositeGroup, group1Outer, buffers };
}

export function destroyTargets(t: Targets) {
  'worklet';
  t.msaa.texture.destroy();
  t.depth.texture.destroy();
  t.hdr.texture.destroy();
  t.hdrInner.texture.destroy();
  for (const x of t.bloom) x.texture.destroy();
  for (const x of t.out) x.texture.destroy();
  for (const x of t.buffers) x.destroy();
}
