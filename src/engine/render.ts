// Per-frame command encoding (a worklet on the UI runtime). The director fills RenderState;
// this only records passes.
import type { Bundle, Instance, Targets, Tex } from './gpu';
import { BLOOM_LEVELS } from './gpu';
import { SLOTS } from './shaders';

export type RenderState = {
  bundle: Bundle | null;
  targets: Targets | null;
  outIndex: number;
  // Per instance: the scene mesh to draw (null = instance unused this frame).
  scene: (string | null)[];
  frames: Float32Array[];
  particles: number[];
  xf: Float32Array;
  post: Float32Array;
};

function fullscreen(enc: GPUCommandEncoder, pipeline: GPURenderPipeline, group: GPUBindGroup, target: Tex, load: boolean) {
  'worklet';
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: target.view, loadOp: load ? 'load' : 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.draw(3);
  pass.end();
}

function shadowPass(enc: GPUCommandEncoder, b: Bundle, inst: Instance, sceneName: string) {
  'worklet';
  const s = b.scenes[sceneName];
  const pass = enc.beginRenderPass({
    colorAttachments: [],
    depthStencilAttachment: { view: inst.shadow.view, depthLoadOp: 'clear', depthStoreOp: 'store', depthClearValue: 1 },
  });
  pass.setPipeline(b.pipelines.shadow);
  pass.setBindGroup(0, inst.group0);
  pass.setVertexBuffer(0, s.vbuf);
  pass.setIndexBuffer(s.ibuf, 'uint32');
  pass.drawIndexed(s.indexCount, 1, 0, 0, inst.base);
  pass.end();
}

function mainPass(enc: GPUCommandEncoder, b: Bundle, t: Targets, inst: Instance, group1: GPUBindGroup, sceneName: string, resolve: Tex, particles: number) {
  'worklet';
  const s = b.scenes[sceneName];
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: t.msaa.view, resolveTarget: resolve.view, loadOp: 'clear', storeOp: 'discard', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: t.depth.view, depthLoadOp: 'clear', depthStoreOp: 'discard', depthClearValue: 1 },
  });
  pass.setBindGroup(0, inst.group0);
  pass.setPipeline(b.pipelines.mesh);
  pass.setBindGroup(1, group1);
  pass.setVertexBuffer(0, s.vbuf);
  pass.setIndexBuffer(s.ibuf, 'uint32');
  pass.drawIndexed(s.indexCount, 1, 0, 0, inst.base);
  pass.setPipeline(b.pipelines.background);
  pass.draw(3);
  // Volumetric light on top of everything opaque (the mesh buffers are still bound).
  pass.setPipeline(b.pipelines.light);
  pass.drawIndexed(s.indexCount, 1, 0, 0, inst.base);
  if (particles > 0) {
    pass.setPipeline(b.pipelines.particles);
    pass.draw(6, particles);
  }
  pass.end();
}

// Encodes one frame: the inner scene (if any) into hdrInner, then the outer scene with its
// portal sampling hdrInner, then bloom and the composite into targets.out[outIndex].
export function renderFrame(r: RenderState, stage = 99) {
  'worklet';
  const b = r.bundle!;
  const t = r.targets!;
  const d = b.device;
  const q = d.queue;
  for (let k = 0; k < 2; k++) {
    if (r.scene[k]) q.writeBuffer(b.inst[k].frame, 0, r.frames[k]);
  }
  q.writeBuffer(b.xforms, 0, r.xf.buffer, 0, SLOTS * 64);
  q.writeBuffer(b.post, 0, r.post);
  const enc = d.createCommandEncoder();
  const inner = stage >= 5 ? r.scene[1] : null;
  if (inner) {
    shadowPass(enc, b, b.inst[1], inner);
    mainPass(enc, b, t, b.inst[1], b.inst[1].group1, inner, t.hdrInner, r.particles[1]);
  }
  const outer = r.scene[0]!;
  if (stage >= 4) shadowPass(enc, b, b.inst[0], outer);
  if (stage >= 3) mainPass(enc, b, t, b.inst[0], t.group1Outer, outer, t.hdr, stage >= 6 ? r.particles[0] : 0);
  const P = b.pipelines;
  if (stage >= 2) {
    fullscreen(enc, P.prefilter, t.prefilterGroup, t.bloom[0], false);
    for (let i = 0; i < BLOOM_LEVELS - 1; i++) fullscreen(enc, P.down, t.downGroups[i], t.bloom[i + 1], false);
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) fullscreen(enc, P.up, t.upGroups[i], t.bloom[i], true);
  }
  fullscreen(enc, P.composite, t.compositeGroup, t.out[r.outIndex], false);
  q.submit([enc.finish()]);
}
