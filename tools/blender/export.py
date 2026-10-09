"""Assemble a kit.Scene, bake ambient occlusion in Blender, pack the vertex buffer and
write src/assets/scenes/<name>.ts. Also renders a quick Blender preview.

Vertex layout (28 bytes, mirrored in src/engine/gpu.ts):
    float32x3 position | snorm8x4 normal | unorm8x4 sRGB albedo + AO | float16x2 uv |
    uint8x4 part, pattern, material, emissive*32
"""
import base64
import json
import math
import os
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import kit

ROOT = kit.ROOT


def hemisphere(k=28):
    i = np.arange(k) + 0.5
    r = np.sqrt(i / k)
    th = math.pi * (1 + 5 ** 0.5) * i
    x, y = r * np.cos(th), r * np.sin(th)
    z = np.sqrt(np.maximum(0, 1 - x * x - y * y))
    return np.stack([x, y, z], axis=1)


def frame_z(n):
    n = n / max(np.linalg.norm(n), 1e-9)
    u = np.array([0, 1.0, 0]) if abs(n[1]) < 0.95 else np.array([1.0, 0, 0])
    r = np.cross(u, n)
    r /= np.linalg.norm(r)
    u2 = np.cross(n, r)
    return np.stack([r, u2, n], axis=1)


def _subset(g, tri_mask):
    tri = g.tri[tri_mask]
    used = np.unique(tri)
    remap = -np.ones(len(g.pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    out = kit.Chunk(g.pos[used], g.nrm[used], g.uv[used], remap[tri])
    out.col = g.col[used]
    out.pat = g.pat[used]
    out.mat = g.mat[used]
    out.emis = g.emis[used]
    out.occ_v = g.occ_v[used]
    return out


def split_gutter(scene):
    """Pieces that straddle the gutter are cut in two, like a real pop-up: the half over
    the left page is glued to it and folds with it."""
    for part in list(scene.parts):
        if not part.meta.get('split'):
            continue
        g = kit.merge(part.chunks)
        cen = g.pos[g.tri].mean(axis=1)
        left = cen[:, 0] < 0
        if not left.any():
            continue
        right_g = _subset(g, ~left)
        left_g = _subset(g, left)
        part.chunks = [right_g]
        meta = dict(part.meta)
        meta['parent'] = 'left'
        meta.pop('split', None)
        part.meta.pop('split', None)
        twin = scene.part(part.name + '_l', part.pivot, part.axis, **meta)
        twin.chunks = [left_g]
        # The portal belongs to the right half only.
        twin.meta.pop('portal', None)


def assemble(scene):
    split_gutter(scene)
    chunks = []
    part_ids = []
    for pi, part in enumerate(scene.parts):
        for c in part.chunks:
            chunks.append(c)
            part_ids.append(np.full(len(c.pos), pi))
    g = kit.merge(chunks)
    g.part = np.concatenate(part_ids)
    return g


def bake_ao(scene, g):
    t0 = time.time()
    occ_tri = g.tri[g.occ_v[g.tri[:, 0]]]
    verts = [Vector(p) for p in g.pos]
    polys = [tuple(int(i) for i in t) for t in occ_tri]
    for extra in scene.ao_extra:
        o = len(verts)
        verts += [Vector(p) for p in extra.pos]
        polys += [tuple(int(i) + o for i in t) for t in extra.tri]
    bvh = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    H = hemisphere(28)
    dmax = scene.ao_dist
    eps = dmax * 0.004 + 1e-4
    # One AO value per (position, normal) pair.
    key = np.column_stack([np.round(g.pos * 2e4).astype(np.int64), np.round(g.nrm * 50).astype(np.int64)])
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    vals = np.ones(len(first))
    for j, i in enumerate(first):
        n = g.nrm[i]
        dirs = H @ frame_z(n).T
        o = Vector(g.pos[i] + n * eps)
        occ = 0.0
        for dv in dirs:
            hit = bvh.ray_cast(o, Vector(dv), dmax)
            if hit[0] is not None:
                occ += 1.0 - (hit[3] / dmax) ** 0.6
        vals[j] = 1.0 - occ / len(H) * scene.ao_strength
    g.ao = np.clip(vals[inv], 0.15, 1.0)
    print(f'[{scene.name}] AO for {len(first)} samples in {time.time() - t0:.1f}s')


def pack(scene, g):
    n8 = np.clip(np.round(g.nrm * 127), -127, 127).astype(np.int64)
    c8 = np.clip(np.round(g.col * 255), 0, 255).astype(np.int64)
    a8 = np.clip(np.round(g.ao * 255), 0, 255).astype(np.int64)
    e8 = np.clip(np.round(g.emis * 32), 0, 255).astype(np.int64)
    uvh = g.uv.astype(np.float16)
    q = np.round(g.pos * 1e5).astype(np.int64)
    key = np.column_stack([q, n8, c8, a8, uvh.view(np.uint16).astype(np.int64), g.part, g.pat, g.mat, e8])
    _, first, inverse = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    order = np.argsort(first)
    rank = np.empty_like(order)
    rank[order] = np.arange(len(order))
    remap = rank[inverse]
    src = first[order]
    idx = remap[g.tri]
    idx = idx[(idx[:, 0] != idx[:, 1]) & (idx[:, 1] != idx[:, 2]) & (idx[:, 0] != idx[:, 2])].reshape(-1)

    vb = np.zeros(len(src), dtype=[('p', '<f4', 3), ('n', 'i1', 4), ('c', 'u1', 4), ('uv', '<f2', 2), ('a', 'u1', 4)])
    assert vb.itemsize == 28
    vb['p'] = g.pos[src]
    vb['n'][:, :3] = n8[src]
    vb['c'][:, :3] = c8[src]
    vb['c'][:, 3] = a8[src]
    vb['uv'] = uvh[src]
    vb['a'][:, 0] = g.part[src]
    vb['a'][:, 1] = g.pat[src]
    vb['a'][:, 2] = g.mat[src]
    vb['a'][:, 3] = e8[src]
    ib = idx.astype('<u4')
    return vb, ib


def write_ts(scene, vb, ib):
    name = scene.name
    parts = []
    for pi, p in enumerate(scene.parts):
        sel = vb['p'][vb['a'][:, 0] == pi]
        if len(sel):
            lo_, hi_ = sel.min(axis=0), sel.max(axis=0)
            p.meta['lo'] = [round(float(v), 4) for v in lo_]
            p.meta['hi'] = [round(float(v), 4) for v in hi_]
        meta = json.dumps(p.meta, separators=(',', ':')) if p.meta else '{}'
        parts.append(
            f"    {{ name: '{p.name}', pivot: [{p.pivot[0]:.4f}, {p.pivot[1]:.4f}, {p.pivot[2]:.4f}], "
            f"axis: [{p.axis[0]:.4f}, {p.axis[1]:.4f}, {p.axis[2]:.4f}], meta: {meta} }},")
    lo = vb['p'].min(axis=0)
    hi = vb['p'].max(axis=0)
    lines = [
        f'// Generated by tools/blender/build.py ({name}). Do not edit.',
        "import type { SceneAsset } from '../types';",
        '',
        f'export const {name.upper()}: SceneAsset = {{',
        f"  name: '{name}',",
        f'  vertexCount: {len(vb)},',
        f'  indexCount: {len(ib)},',
        f'  min: [{lo[0]:.4f}, {lo[1]:.4f}, {lo[2]:.4f}],',
        f'  max: [{hi[0]:.4f}, {hi[1]:.4f}, {hi[2]:.4f}],',
        '  parts: [',
        *parts,
        '  ],',
        f"  vertices: '{base64.b64encode(vb.tobytes()).decode('ascii')}',",
        f"  indices: '{base64.b64encode(ib.tobytes()).decode('ascii')}',",
        '};',
        '',
    ]
    path = os.path.join(ROOT, 'src', 'assets', 'scenes', f'{name}.ts')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write('\n'.join(lines))
    print(f'[{name}] {len(vb)} verts, {len(ib) // 3} tris, {len(scene.parts)} parts -> {path} ({os.path.getsize(path) / 1024:.0f} KB)')


# ---------------------------------------------------------------- preview (Blender render)

def to_bl(p):
    p = np.asarray(p)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def srgb_lin(c):
    c = np.asarray(c)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def preview(scene, g, cams, out_dir, res=(951, 669), samples=32):
    """Render vertex colours * AO with Eevee from each camera (pos, target, fov_deg, tag)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    try:
        sc.eevee.taa_render_samples = samples
    except Exception:
        pass
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.035, 0.09, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sc.world = world

    me = bpy.data.meshes.new(scene.name)
    me.from_pydata(to_bl(g.pos).tolist(), [], g.tri.tolist())
    me.update()
    col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    lin = srgb_lin(g.col) * g.ao[:, None]
    rgba = np.column_stack([lin, np.ones(len(lin))])
    col.data.foreach_set('color', rgba.reshape(-1))
    em = me.attributes.new('Emis', 'FLOAT', 'POINT')
    em.data.foreach_set('value', g.emis.astype(np.float32))
    ob = bpy.data.objects.new(scene.name, me)
    sc.collection.objects.link(ob)
    mat = bpy.data.materials.new('m')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = 'Col'
    e = nt.nodes.new('ShaderNodeAttribute')
    e.attribute_name = 'Emis'
    nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(a.outputs['Color'], bsdf.inputs['Emission Color'])
    nt.links.new(e.outputs['Fac'], bsdf.inputs['Emission Strength'])
    bsdf.inputs['Roughness'].default_value = 0.8
    me.materials.append(mat)
    # Smooth shading uses the custom split normals we computed.
    for poly in me.polygons:
        poly.use_smooth = True
    try:
        me.normals_split_custom_set_from_vertices(to_bl(g.nrm).tolist())
    except Exception:
        pass

    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 2.2
    sun.color = (0.75, 0.8, 1.0)
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-30))
    sc.collection.objects.link(so)
    fill = bpy.data.lights.new('fill', 'AREA')
    fill.energy = 60
    fill.color = (1.0, 0.75, 0.5)
    fill.size = 2
    fo = bpy.data.objects.new('fill', fill)
    fo.location = (1.5, -2.0, 1.6)
    fo.rotation_euler = (math.radians(60), 0, math.radians(35))
    sc.collection.objects.link(fo)

    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    os.makedirs(out_dir, exist_ok=True)
    for pos, target, fov, tag in cams:
        cam.angle = math.radians(fov)
        cam.sensor_fit = 'VERTICAL'
        P = Vector(to_bl(np.array(pos)).tolist())
        T = Vector(to_bl(np.array(target)).tolist())
        co.location = P
        co.rotation_euler = (T - P).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(out_dir, f'{scene.name}_{tag}.png')
        bpy.ops.render.render(write_still=True)
        print('[preview]', sc.render.filepath)


def build(scene, cams=None, out_dir=None, do_preview=True):
    g = assemble(scene)
    bake_ao(scene, g)
    vb, ib = pack(scene, g)
    write_ts(scene, vb, ib)
    if do_preview and cams:
        preview(scene, g, cams, out_dir or os.path.join(kit.HERE, 'previews'))
    return g
