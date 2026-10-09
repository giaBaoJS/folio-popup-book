"""Paper-craft geometry kit for Folio.

Everything is authored in app space: Y up, the viewer looks down -Z, units are
"book units" (one page is 1.0 wide). A Chunk is a triangle soup with flat or
smooth normals and per-vertex paper attributes:

    col   sRGB albedo (0..1)
    pat   atlas pattern id (0 = plain), see src/art/patterns.json
    mat   material id (see MAT below, mirrored in src/engine/shaders.ts)
    emis  emissive strength (0..8)
    uv    pattern coordinates (tiles repeat every 1.0, unique art spans 0..1)

A Part is a rigid group of chunks that moves as one at runtime (one transform
slot). Its pivot and axis describe the hinge the runtime rotates it about.
"""
import json
import math
import os

import numpy as np
from mathutils import Vector
from mathutils import geometry as mg
from mathutils import noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

with open(os.path.join(ROOT, 'src', 'art', 'patterns.json')) as f:
    _PATTERNS = json.load(f)['patterns']
PAT = {name: i + 1 for i, name in enumerate(_PATTERNS)}


def pat(name):
    if name is None or name == 0:
        return 0
    if name not in PAT:
        raise KeyError(f'unknown pattern {name}; add it to src/art/patterns.json')
    return PAT[name]


class MAT:
    PAPER = 0      # lit paper; alpha-tested when the pattern has alpha
    EDGE = 1       # the cut edge of a sheet: the paper's pale core
    GLOW = 2       # emissive (windows, lanterns); flickers
    PORTAL = 3     # the way into the next scene
    VELLUM = 4     # thin translucent paper, glows when lit from behind
    GOLD = 5       # foil
    CLOTH = 6      # book cloth
    INK = 7        # unlit flat colour (silhouettes far away)
    WATER = 8      # paper water: lit paper plus a moving sheen
    GLASS = 9      # lantern glass: additive-ish tint (drawn opaque but bright)
    LIGHT = 10     # volumetric light (beams, shafts): additive, no depth write, no shadow;
                   # uv.y runs along the beam from 0 at the source to 1 at the far end


# ---------------------------------------------------------------- math

def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)])


def norm(a):
    a = np.asarray(a, dtype=np.float64)
    n = np.linalg.norm(a, axis=-1, keepdims=True)
    return a / np.maximum(n, 1e-12)


def rx(d):
    r = math.radians(d)
    c, s = math.cos(r), math.sin(r)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], dtype=np.float64)


def ry(d):
    r = math.radians(d)
    c, s = math.cos(r), math.sin(r)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)


def rz(d):
    r = math.radians(d)
    c, s = math.cos(r), math.sin(r)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], dtype=np.float64)


def rot(x=0.0, y=0.0, z=0.0):
    """Rotate about X, then Y, then Z (degrees)."""
    return rz(z) @ ry(y) @ rx(x)


def lerp(a, b, t):
    return a + (b - a) * t


def smooth(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def n1(x, seed=0.0):
    return noise.noise(Vector((x * 1.0, seed * 1.37 + 0.5, seed * 0.71 + 0.25)))


# ---------------------------------------------------------------- chunk

class Chunk:
    def __init__(self, pos, nrm, uv, tri):
        self.pos = np.asarray(pos, dtype=np.float64).reshape(-1, 3)
        self.nrm = norm(np.asarray(nrm, dtype=np.float64).reshape(-1, 3))
        self.uv = np.asarray(uv, dtype=np.float64).reshape(-1, 2)
        self.tri = np.asarray(tri, dtype=np.int64).reshape(-1, 3)
        n = len(self.pos)
        self.col = np.ones((n, 3))
        self.pat = np.zeros(n, dtype=np.int64)
        self.mat = np.zeros(n, dtype=np.int64)
        self.emis = np.zeros(n)
        # Alpha-tested cards and glow panes must not darken their neighbours' AO.
        self.occluder = True

    def paint(self, col=None, pat_name=None, mat=None, emis=None, mask=None):
        m = slice(None) if mask is None else mask
        if col is not None:
            c = hexc(col) if isinstance(col, str) else np.asarray(col, dtype=np.float64)
            self.col[m] = c
        if pat_name is not None:
            self.pat[m] = pat(pat_name)
        if mat is not None:
            self.mat[m] = mat
        if emis is not None:
            self.emis[m] = emis
        return self

    def xf(self, R=None, t=(0, 0, 0), s=None):
        """Scale (per axis), then rotate, then translate."""
        p = self.pos
        n = self.nrm
        if s is not None:
            s = np.broadcast_to(np.asarray(s, dtype=np.float64), (3,))
            p = p * s
            n = norm(n / np.where(np.abs(s) < 1e-9, 1e-9, s))
            if np.prod(s) < 0:
                self.tri = self.tri[:, ::-1].copy()
        if R is not None:
            p = p @ R.T
            n = n @ R.T
        self.pos = p + np.asarray(t, dtype=np.float64)
        self.nrm = norm(n)
        return self

    def deform(self, fn, eps=1e-4):
        """Apply a smooth deformation p -> fn(p) and transport normals with its Jacobian."""
        p = self.pos
        q = fn(p)
        J = []
        for k in range(3):
            d = np.zeros(3)
            d[k] = eps
            J.append((fn(p + d) - q) / eps)
        J = np.stack(J, axis=2)  # (n, 3 out, 3 in): column k = dq/dp_k
        inv_t = np.linalg.inv(J).transpose(0, 2, 1)
        self.nrm = norm(np.einsum('nij,nj->ni', inv_t, self.nrm))
        self.pos = q
        return self

    def copy(self):
        c = Chunk(self.pos.copy(), self.nrm.copy(), self.uv.copy(), self.tri.copy())
        c.col = self.col.copy()
        c.pat = self.pat.copy()
        c.mat = self.mat.copy()
        c.emis = self.emis.copy()
        c.occluder = self.occluder
        return c


def merge(chunks):
    chunks = [c for c in chunks if c is not None and len(c.tri)]
    base = 0
    P, N, U, T, C, PA, M, E, O = [], [], [], [], [], [], [], [], []
    for c in chunks:
        occ = getattr(c, 'occ_v', None)
        P.append(c.pos)
        N.append(c.nrm)
        U.append(c.uv)
        T.append(c.tri + base)
        C.append(c.col)
        PA.append(c.pat)
        M.append(c.mat)
        E.append(c.emis)
        O.append(occ if occ is not None else np.full(len(c.pos), c.occluder))
        base += len(c.pos)
    out = Chunk(np.concatenate(P), np.concatenate(N), np.concatenate(U), np.concatenate(T))
    out.col = np.concatenate(C)
    out.pat = np.concatenate(PA)
    out.mat = np.concatenate(M)
    out.emis = np.concatenate(E)
    out.occ_v = np.concatenate(O)
    return out


# ---------------------------------------------------------------- 2D outlines

def signed_area(loop):
    x, y = loop[:, 0], loop[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def ccw(loop, want=True):
    loop = np.asarray(loop, dtype=np.float64)
    if (signed_area(loop) > 0) != want:
        loop = loop[::-1].copy()
    return loop


def dedupe_loop(loop, eps=1e-6):
    out = [loop[0]]
    for p in loop[1:]:
        if np.linalg.norm(p - out[-1]) > eps:
            out.append(p)
    if np.linalg.norm(out[0] - out[-1]) <= eps:
        out.pop()
    return np.array(out)


def circle(r=1.0, n=48, c=(0, 0), a0=0.0, rx_=None):
    a = a0 + np.linspace(0, 2 * math.pi, n, endpoint=False)
    rr = r if rx_ is None else rx_
    return np.stack([c[0] + rr * np.cos(a), c[1] + r * np.sin(a)], axis=1)


def rect(w, h, c=(0, 0)):
    x0, y0 = c[0] - w / 2, c[1] - h / 2
    return np.array([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], dtype=np.float64)


def arch(w, h, n=16, c=(0, 0)):
    """Window with a round top: width w, total height h, bottom centred at c."""
    r = w / 2
    pts = [[c[0] - r, c[1]], [c[0] + r, c[1]]]
    for a in np.linspace(0, math.pi, n):
        pts.append([c[0] + r * math.cos(a), c[1] + h - r + r * math.sin(a)])
    return np.array(pts[:2] + pts[2:])


def polar(fn, n=96, c=(0, 0)):
    a = np.linspace(0, 2 * math.pi, n, endpoint=False)
    r = np.array([fn(t) for t in a])
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], axis=1)


def smooth_loop(pts, n_per=8, closed=True):
    """Catmull-Rom through control points."""
    P = np.asarray(pts, dtype=np.float64)
    m = len(P)
    out = []
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = P[(i - 1) % m] if closed or i > 0 else P[0]
        p1 = P[i]
        p2 = P[(i + 1) % m]
        p3 = P[(i + 2) % m] if closed or i + 2 < m else P[-1]
        for t in np.linspace(0, 1, n_per, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-1])
    return np.array(out)


# ---------------------------------------------------------------- primitives

def _tess(loops):
    """Triangulate loops (outer first, holes after). Returns (points, tris)."""
    pts = np.concatenate(loops)
    vl = [[Vector((float(p[0]), float(p[1]), 0.0)) for p in L] for L in loops]
    tris = np.array(mg.tessellate_polygon(vl), dtype=np.int64).reshape(-1, 3)
    # Make every triangle CCW (+Z facing).
    a, b, c = pts[tris[:, 0]], pts[tris[:, 1]], pts[tris[:, 2]]
    cr = (b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0])
    flip = cr < 0
    tris[flip] = tris[flip][:, ::-1]
    return pts, tris


def slab(loops, thick=0.006, col='#ffffff', pat_name=None, mat=MAT.PAPER, uv_scale=1.0, uv_off=(0, 0),
         edge_col='#f4ead6', emis=0.0, back_col=None, back_pat=None, uv_fn=None, edges=True, smooth_edges=35.0):
    """Extrude 2D loops (outer CCW + holes) into a sheet lying in XY, centred on z=0.

    Front faces +Z, back faces -Z, the cut edge gets MAT.EDGE in a pale core colour.
    """
    if isinstance(loops, np.ndarray):
        loops = [loops]
    loops = [dedupe_loop(np.asarray(L, dtype=np.float64)) for L in loops]
    loops = [ccw(loops[0], True)] + [ccw(L, False) for L in loops[1:]]
    pts, tris = _tess(loops)
    h = thick / 2
    n = len(pts)
    uv = uv_fn(pts) if uv_fn else pts * uv_scale + np.asarray(uv_off)
    front = Chunk(np.column_stack([pts, np.full(n, h)]), np.tile([0, 0, 1.0], (n, 1)), uv, tris)
    front.paint(col, pat_name, mat, emis)
    back = Chunk(np.column_stack([pts, np.full(n, -h)]), np.tile([0, 0, -1.0], (n, 1)), uv, tris[:, ::-1])
    back.paint(back_col if back_col is not None else col, back_pat if back_pat is not None else pat_name, mat, emis)
    parts = [front, back]
    if edges and thick > 0:
        P, N, U, T = [], [], [], []
        base = 0
        for L in loops:
            m = len(L)
            d = np.roll(L, -1, axis=0) - L
            en = norm(np.column_stack([d[:, 1], -d[:, 0]]))  # outward for CCW outer / CW holes
            # Vertex normals: average with neighbours when the corner is gentle.
            prev = np.roll(en, 1, axis=0)
            gentle = np.einsum('ij,ij->i', prev, en) > math.cos(math.radians(smooth_edges))
            vn_start = np.where(gentle[:, None], norm(prev + en), en)       # at L[i] for edge i
            vn_end = np.roll(vn_start, -1, axis=0)                          # at L[i+1] for edge i
            gentle_next = np.roll(gentle, -1)
            vn_end = np.where(gentle_next[:, None], vn_end, en)
            per = np.cumsum(np.r_[0, np.linalg.norm(d, axis=1)])
            for i in range(m):
                a, b = L[i], L[(i + 1) % m]
                quad = np.array([[a[0], a[1], h], [b[0], b[1], h], [b[0], b[1], -h], [a[0], a[1], -h]])
                na = np.r_[vn_start[i], 0.0]
                nb = np.r_[vn_end[i], 0.0]
                P.append(quad)
                N.append(np.array([na, nb, nb, na]))
                U.append(np.array([[per[i], 1], [per[i + 1], 1], [per[i + 1], 0], [per[i], 0]]) * np.array([uv_scale, thick * uv_scale]))
                T.append(np.array([[0, 1, 2], [0, 2, 3]]) + base)
                base += 4
        side = Chunk(np.concatenate(P), np.concatenate(N), np.concatenate(U), np.concatenate(T))
        side.paint(edge_col, None, MAT.EDGE, 0.0)
        parts.append(side)
    return merge(parts)


def grid(fn, nu, nv, u0=0.0, u1=1.0, v0=0.0, v1=1.0, uv_fn=None, wrap_u=False):
    """Parametric surface (u, v) -> xyz with smooth normals; returns one-sided chunk (CCW = +normal)."""
    us = np.linspace(u0, u1, nu + 1)
    vs = np.linspace(v0, v1, nv + 1)
    U, V = np.meshgrid(us, vs, indexing='ij')
    P = np.array([[fn(u, v) for v in vs] for u in us])  # (nu+1, nv+1, 3)
    du = np.gradient(P, axis=0)
    dv = np.gradient(P, axis=1)
    if wrap_u:
        du[0] = du[-1] = (P[1] - P[-2])
    N = norm(np.cross(du, dv))
    idx = np.arange((nu + 1) * (nv + 1)).reshape(nu + 1, nv + 1)
    a, b, c, d = idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]
    tris = np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])
    uvs = np.stack([U, V], -1).reshape(-1, 2) if uv_fn is None else uv_fn(U.reshape(-1), V.reshape(-1))
    return Chunk(P.reshape(-1, 3), N.reshape(-1, 3), uvs, tris)


def two_sided(ch, offset=0.0006, back_col=None):
    """Turn a one-sided surface into a thin sheet (front + reversed back)."""
    f = ch.copy()
    f.pos = f.pos + f.nrm * offset
    b = ch.copy()
    b.pos = b.pos - b.nrm * offset
    b.nrm = -b.nrm
    b.tri = b.tri[:, ::-1].copy()
    if back_col is not None:
        b.col[:] = hexc(back_col) if isinstance(back_col, str) else back_col
    return merge([f, b])


def card(w, h, pat_name, col='#ffffff', mat=MAT.PAPER, emis=0.0, anchor=(0.5, 0.0), nu=1, nv=1, bend=None):
    """Alpha-cut card in the XY plane facing +Z, uv 0..1 across the art. anchor = which point sits at the origin."""
    def f(u, v):
        x = (u - anchor[0]) * w
        y = (v - anchor[1]) * h
        z = 0.0 if bend is None else bend(u, v)
        return np.array([x, y, z])
    g = two_sided(grid(f, nu, nv))
    g.paint(col, pat_name, mat, emis)
    g.occluder = False
    return g


def lathe(profile, seg=32, uv_v=None, cap_top=False, cap_bottom=False, sides=None, squash=1.0, phase=0.0, flat=False):
    """Surface of revolution around +Y. profile = [(r, y), ...] bottom to top.

    sides=4 makes a square pyramid-like cross-section (with rounded flare from the profile).
    """
    prof = np.asarray(profile, dtype=np.float64)
    m = len(prof)
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(prof, axis=0), axis=1)])
    vcoord = L / max(L[-1], 1e-9) if uv_v is None else np.asarray(uv_v)

    def shape(a):
        if sides is None:
            return 1.0
        k = sides
        return math.cos(math.pi / k) / math.cos(((a - phase) % (2 * math.pi / k)) - math.pi / k)

    if flat and sides:
        # Hard-edged faceted lathe: separate faces per side.
        chunks = []
        for s in range(sides):
            a0 = phase + 2 * math.pi * s / sides
            a1 = a0 + 2 * math.pi / sides

            def f(u, v, a0=a0, a1=a1):
                i = v * (m - 1)
                j = min(int(i), m - 2)
                t = i - j
                r = prof[j, 0] * (1 - t) + prof[j + 1, 0] * t
                y = prof[j, 1] * (1 - t) + prof[j + 1, 1] * t
                pa = np.array([r * math.cos(a0), y, -r * math.sin(a0) * squash])
                pb = np.array([r * math.cos(a1), y, -r * math.sin(a1) * squash])
                return pa * (1 - u) + pb * u
            g = grid(f, 1, (m - 1) * 2, uv_fn=lambda U, V: np.stack([U, V * L[-1]], -1))
            # Flat normals per facet.
            a, b, c = g.pos[g.tri[:, 0]], g.pos[g.tri[:, 1]], g.pos[g.tri[:, 2]]
            fn_ = norm(np.cross(b - a, c - a))
            P = np.concatenate([a, b, c])
            ntri = len(g.tri)
            idx = np.arange(3 * ntri).reshape(3, ntri).T
            uvs = np.concatenate([g.uv[g.tri[:, 0]], g.uv[g.tri[:, 1]], g.uv[g.tri[:, 2]]])
            N = np.concatenate([fn_, fn_, fn_])
            chunks.append(Chunk(P, N, uvs, idx))
        out = merge(chunks)
        # Point normals outward.
        cen = out.pos.copy()
        cen[:, 1] = 0
        out_dir = np.einsum('ij,ij->i', out.nrm, cen)
        if np.mean(out_dir) < 0:
            out.nrm = -out.nrm
            out.tri = out.tri[:, ::-1].copy()
        return out

    def f(u, v):
        a = phase + u * 2 * math.pi
        i = v * (m - 1)
        j = min(int(i), m - 2)
        t = i - j
        r = (prof[j, 0] * (1 - t) + prof[j + 1, 0] * t) * shape(a)
        y = prof[j, 1] * (1 - t) + prof[j + 1, 1] * t
        return np.array([r * math.cos(a), y, -r * math.sin(a) * squash])

    g = grid(f, seg, (m - 1), uv_fn=lambda U, V: np.stack([U * 2 * math.pi * max(prof[:, 0].max(), 1e-3), np.interp(V, np.linspace(0, 1, m), vcoord * L[-1])], -1), wrap_u=True)
    # Orientation: make normals point away from the axis.
    cen = g.pos.copy()
    cen[:, 1] = 0
    if np.mean(np.einsum('ij,ij->i', g.nrm, cen)) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    out = [g]
    if cap_top or cap_bottom:
        for top in ([True] if cap_top else []) + ([False] if cap_bottom else []):
            r, y = prof[-1] if top else prof[0]
            a = phase + np.linspace(0, 2 * math.pi, seg, endpoint=False)
            ring = np.stack([r * np.cos(a) * np.array([shape(t) for t in a]), np.full(seg, y), -r * np.sin(a) * squash * np.array([shape(t) for t in a])], 1)
            P = np.vstack([[0, y, 0], ring])
            T = np.array([[0, 1 + i, 1 + (i + 1) % seg] for i in range(seg)])
            nvec = [0, 1 if top else -1, 0]
            ch = Chunk(P, np.tile(nvec, (len(P), 1)), P[:, [0, 2]], T)
            # Fix winding to match the normal.
            a_, b_, c_ = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
            if np.mean(np.cross(b_ - a_, c_ - a_) @ np.array(nvec, dtype=float)) < 0:
                ch.tri = ch.tri[:, ::-1].copy()
            out.append(ch)
    return merge(out)


def tube(points, radii, seg=10, twist=0.0, uv_scale=1.0, cap=True, wobble=0.0, seed=0.0):
    """Sweep a circle along a polyline (parallel transport frames)."""
    P = np.asarray(points, dtype=np.float64)
    R = np.asarray(radii, dtype=np.float64)
    if R.ndim == 0:
        R = np.full(len(P), float(R))
    elif len(R) != len(P):
        R = np.interp(np.linspace(0, 1, len(P)), np.linspace(0, 1, len(R)), R)
    T = np.gradient(P, axis=0)
    T = norm(T)
    up = np.array([0, 0, 1.0]) if abs(T[0][1]) > 0.9 else np.array([0, 1.0, 0])
    Nn = norm(np.cross(T[0], up))
    frames = []
    for i in range(len(P)):
        if i > 0:
            Nn = norm(Nn - T[i] * np.dot(Nn, T[i]))
        B = np.cross(T[i], Nn)
        frames.append((Nn.copy(), B))
    L = np.cumsum(np.r_[0, np.linalg.norm(np.diff(P, axis=0), axis=1)])
    rings_p, rings_n, uvs = [], [], []
    for i in range(len(P)):
        Nn_, B = frames[i]
        for k in range(seg + 1):
            a = 2 * math.pi * k / seg + twist * L[i]
            d = Nn_ * math.cos(a) + B * math.sin(a)
            r = R[i] * (1 + wobble * n1(L[i] * 7 + k * 0.9, seed))
            rings_p.append(P[i] + d * r)
            rings_n.append(d)
            uvs.append([k / seg * 2 * math.pi * R.max() * uv_scale, L[i] * uv_scale])
    idx = np.arange(len(P) * (seg + 1)).reshape(len(P), seg + 1)
    a, b, c, d = idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]
    tris = np.concatenate([np.stack([a, c, b], -1).reshape(-1, 3), np.stack([a, d, c], -1).reshape(-1, 3)])
    g = Chunk(np.array(rings_p), np.array(rings_n), np.array(uvs), tris)
    # Ensure outward winding.
    pa, pb, pc = g.pos[g.tri[:, 0]], g.pos[g.tri[:, 1]], g.pos[g.tri[:, 2]]
    if np.mean(np.einsum('ij,ij->i', np.cross(pb - pa, pc - pa), g.nrm[g.tri[:, 0]])) < 0:
        g.tri = g.tri[:, ::-1].copy()
    out = [g]
    if cap:
        for end in (0, len(P) - 1):
            ring = np.array(rings_p[end * (seg + 1):(end + 1) * (seg + 1) - 1])
            cpt = P[end]
            nvec = -T[end] if end == 0 else T[end]
            Pc = np.vstack([cpt, ring])
            Tc = np.array([[0, 1 + i, 1 + (i + 1) % seg] for i in range(seg)])
            ch = Chunk(Pc, np.tile(nvec, (len(Pc), 1)), Pc[:, :2] * 0, Tc)
            a_, b_, c_ = Pc[Tc[:, 0]], Pc[Tc[:, 1]], Pc[Tc[:, 2]]
            if np.mean(np.cross(b_ - a_, c_ - a_) @ nvec) < 0:
                ch.tri = ch.tri[:, ::-1].copy()
            out.append(ch)
    return merge(out)


def box(sx, sy, sz, c=(0, 0, 0), uv_scale=1.0):
    """Axis-aligned box with flat faces. c = centre of the bottom face."""
    x0, x1 = -sx / 2, sx / 2
    y0, y1 = 0.0, sy
    z0, z1 = -sz / 2, sz / 2
    faces = [
        ([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]),
        ([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]),
        ([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]),
        ([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]),
        ([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]),
        ([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]),
    ]
    P, N, U, T = [], [], [], []
    for i, (q, n) in enumerate(faces):
        q = np.array(q, dtype=np.float64)
        P.append(q)
        N.append(np.tile(n, (4, 1)))
        # Planar UV on the face's two widest axes.
        ax = [k for k in range(3) if abs(n[k]) < 0.5]
        U.append(q[:, ax] * uv_scale)
        T.append(np.array([[0, 1, 2], [0, 2, 3]]) + 4 * i)
    g = Chunk(np.concatenate(P), np.concatenate(N), np.concatenate(U), np.concatenate(T))
    g.pos += np.asarray(c, dtype=np.float64)
    return g


def sphere(r=1.0, c=(0, 0, 0), seg=16, rings=10, squash=1.0):
    def f(u, v):
        a = u * 2 * math.pi
        b = (v - 0.5) * math.pi
        return np.array([r * math.cos(b) * math.cos(a), r * math.sin(b) * squash, -r * math.cos(b) * math.sin(a)]) + np.asarray(c)
    g = grid(f, seg, rings, wrap_u=True)
    cen = g.pos - np.asarray(c)
    if np.mean(np.einsum('ij,ij->i', g.nrm, cen)) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    return g


# ---------------------------------------------------------------- scene / parts / export

class Part:
    def __init__(self, name, pivot=(0, 0, 0), axis=(1, 0, 0), meta=None):
        self.name = name
        self.pivot = np.asarray(pivot, dtype=np.float64)
        self.axis = norm(np.asarray(axis, dtype=np.float64))
        self.meta = meta or {}
        self.chunks = []

    def add(self, *chunks):
        for c in chunks:
            if c is not None:
                self.chunks.append(c)
        return self


class Scene:
    def __init__(self, name, ao_dist=0.12, ao_strength=0.85):
        self.name = name
        self.parts = []
        self.ao_dist = ao_dist
        self.ao_strength = ao_strength
        # Extra occluders used only for AO (e.g. the table under the book).
        self.ao_extra = []

    def part(self, name, pivot=(0, 0, 0), axis=(1, 0, 0), **meta):
        p = Part(name, pivot, axis, meta)
        self.parts.append(p)
        assert len(self.parts) <= 255, 'too many parts'
        return p

    def find(self, name):
        for p in self.parts:
            if p.name == name:
                return p
        raise KeyError(name)
