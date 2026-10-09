"""Chapter IV: Under the Paper Sea.

A cut-paper sea floor in stacked sand terraces, kelp ribbons, lace coral and anemones, an
articulated paper whale with a constellation on its flank, vellum jellyfish, a school of paper
fish, and on the sand the little open book from chapter I, glowing like a lantern. Its pages
are the portal back to the beginning.

Space: Y up, the viewer looks down -Z. The book sits a little in front of the origin.
"""
import math

import bmesh
import numpy as np

import book
import kit
import props
from kit import MAT

# ---------------------------------------------------------------- layout constants (mirrored in scene_deep.ts)

BOOK_S = 0.36                        # sunken book scale
BOOK_C = np.array([0.0, 0.0, -0.08])  # where the book's gutter/base centre sits (x, y set below, z)
BOOK_TILT = 22.0                     # degrees, front edge down (tilts the pages towards the viewer)
BOOK_YAW = -9.0
PORTAL_R = 0.17

WHALE_POS = np.array([-0.35, 0.8, -1.32])
WHALE_S = 1.0

# Jellies: centre of the bell rim, bell radius, colour, rim glow colour.
JELLIES = [
    ((-0.66, 0.66, -0.12), 0.072, '#ff9ccf', '#ffd2f0'),
    ((0.78, 0.98, -0.62), 0.06, '#9fd8ff', '#d8f6ff'),
    ((-1.02, 1.04, -0.86), 0.048, '#c9a6ff', '#efe0ff'),
    ((1.18, 0.62, 0.12), 0.05, '#ffb98f', '#ffe6c9'),
]

# Fish schools: centre, ring radii, count per ring, height jitter, fish length.
SCHOOLS = [
    ('school_a', (0.66, 0.5, -0.32), [0.24, 0.31, 0.38], [5, 6, 5], 0.05, 0.07),
    ('school_b', (-0.86, 0.98, -0.78), [0.16, 0.22], [4, 5], 0.04, 0.05),
]

# Constellation on the whale (body uv, u towards the head, v down the art) — same list as
# WHALE_STARS in src/art/paint_deep.ts.
WHALE_STARS = [(0.86, 0.36), (0.76, 0.24), (0.64, 0.2), (0.53, 0.27), (0.42, 0.22), (0.31, 0.3), (0.58, 0.42), (0.69, 0.47)]

RNG = np.random.default_rng(1234)


def bead(r, c=(0, 0, 0), seg=6, rings=4, squash=1.0):
    """Small sphere with normals that stay valid at the poles."""
    g = kit.sphere(r, c=c, seg=seg, rings=rings, squash=squash)
    g.nrm = kit.norm(g.pos - np.asarray(c, dtype=np.float64) + 1e-9)
    return g


def flipv(ch):
    """Cards: make the canvas top the top of the object."""
    ch.uv = np.column_stack([ch.uv[:, 0], 1.0 - ch.uv[:, 1]])
    return ch


# ---------------------------------------------------------------- sand terraces

# top y, front z, wave amp, wave freq, phase, colour
LAYERS = [
    (0.020, 0.86, 0.07, 1.5, 0.4, '#c9b18a'),
    (0.046, -0.46, 0.08, 1.25, 2.1, '#c0a882'),
    (0.076, -1.0, 0.1, 1.05, 4.0, '#b49d7c'),
    (0.110, -1.55, 0.11, 0.9, 1.0, '#a99478'),
    (0.150, -2.1, 0.12, 0.8, 3.3, '#9e8a72'),
]


def front_z(k, x):
    _, z0, amp, fr, ph, _ = LAYERS[k]
    z = z0 + amp * np.sin(fr * x * 2.0 + ph) + amp * 0.45 * np.sin(fr * x * 5.3 + ph * 1.7)
    if k == 1:
        # A bay behind the book so it lies on the lowest terrace.
        z = z - 0.16 * np.exp(-((np.asarray(x) - BOOK_C[0]) / 0.55) ** 2)
    return z


def ground(x, z):
    y = 0.0
    for k in range(len(LAYERS)):
        if z < front_z(k, x):
            y = LAYERS[k][0]
    return y


def sand(scene):
    p = scene.part('sand', role='static')
    # Base sheet: denser near the middle so the AO of the book and rocks has vertices to land on.
    def f(u, v):
        x = np.sign(u - 0.5) * (abs(u - 0.5) * 2) ** 1.5 * 4.8
        z = 0.5 + np.sign(v - 0.5) * (abs(v - 0.5) * 2) ** 1.4 * (3.0 if v > 0.5 else 4.5)
        return np.array([x, 0.0, z])
    g = kit.grid(f, 44, 40)
    if np.mean(g.nrm[:, 1]) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    g.nrm[:] = [0, 1, 0]
    g.uv = np.column_stack([g.pos[:, 0], g.pos[:, 2]]) * 1.3
    g.paint('#cdb995', 'sand', MAT.PAPER)
    p.add(g)
    # Cut-paper terraces, each a thick sheet with a wavy front edge and a pale cut.
    for k, (top, _, _, _, _, col) in enumerate(LAYERS):
        xs = np.linspace(-5.2, 5.2, 170)
        zf = front_z(k, xs)
        outline = np.vstack([np.column_stack([xs, -zf]), [[5.2, 4.6], [-5.2, 4.6]]])
        th = 0.034
        s = kit.slab([outline], thick=th, col=col, pat_name='sand', uv_scale=1.3, edge_col='#f3e7cf')
        s.xf(R=kit.rx(-90), t=(0, top - th / 2, 0))
        p.add(s)
    return p


# ---------------------------------------------------------------- rocks

def hull_rock(sx, sy, sz, seed, col='#7a86a3', n=16, sink=0.18):
    rng = np.random.default_rng(seed)
    pts = rng.normal(size=(n, 3))
    pts /= np.linalg.norm(pts, axis=1, keepdims=True)
    pts *= rng.uniform(0.82, 1.05, (n, 1))
    pts[:, 1] = np.maximum(pts[:, 1], -sink)
    pts *= np.array([sx, sy, sz])
    bm = bmesh.new()
    for q in pts:
        bm.verts.new(q.tolist())
    bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    P, N = [], []
    for fc in bm.faces:
        vs = [np.array(v.co) for v in fc.verts]
        nrm = np.cross(vs[1] - vs[0], vs[2] - vs[0])
        c = (vs[0] + vs[1] + vs[2]) / 3
        if np.dot(nrm, c) < 0:
            vs = vs[::-1]
            nrm = -nrm
        P += vs
        N += [nrm] * 3
    bm.free()
    P = np.array(P)
    N = kit.norm(np.array(N))
    T = np.arange(len(P)).reshape(-1, 3)
    ch = kit.Chunk(P, N, P[:, [0, 1]] * 4 + P[:, [2, 2]] * 3, T)
    ch.pos[:, 1] += sink * sy
    # Facets in slightly different tones, like torn paper patches.
    tone = 0.9 + 0.2 * rng.random(len(P) // 3)
    base = kit.hexc(col)
    ch.col = np.repeat(np.clip(base[None, :] * tone[:, None], 0, 1), 3, axis=0)
    ch.pat[:] = kit.pat('deep_a')
    return ch


def rocks(scene):
    p = scene.part('rocks', role='static')
    tones = ['#7c88a6', '#6d7896', '#8a8fae', '#7a7f9c', '#94839e']
    spots = [
        # x, z, size, flat
        (-0.45, -0.32, 0.11, 0.7), (-0.36, -0.42, 0.06, 0.9), (0.42, -0.36, 0.09, 0.8), (0.52, -0.26, 0.05, 1.0),
        (-0.95, 0.45, 0.16, 0.7), (-0.8, 0.62, 0.07, 0.9), (1.0, 0.4, 0.15, 0.75), (0.86, 0.6, 0.06, 1.0),
        (-1.35, -0.4, 0.22, 0.8), (1.4, -0.5, 0.24, 0.8), (-1.75, 0.3, 0.28, 0.7), (1.85, 0.25, 0.3, 0.7),
        (-0.62, 0.92, 0.05, 1.0), (0.28, 0.98, 0.04, 1.0), (0.62, 1.05, 0.05, 1.0), (-0.25, 1.1, 0.035, 1.0),
        (-1.1, -1.25, 0.2, 0.9), (1.05, -1.3, 0.18, 0.9), (-2.3, -0.8, 0.35, 0.8), (2.4, -0.9, 0.36, 0.8),
        (-0.2, -1.4, 0.08, 1.0), (0.15, -1.25, 0.06, 1.0), (-2.5, 0.8, 0.3, 0.7), (2.6, 0.9, 0.32, 0.7),
    ]
    for i, (x, z, s, fl) in enumerate(spots):
        r = hull_rock(s * RNG.uniform(1.0, 1.4), s * fl, s * RNG.uniform(0.8, 1.1), seed=100 + i, col=tones[i % len(tones)])
        r.xf(R=kit.ry(RNG.uniform(0, 360)), t=(x, ground(x, z) - 0.004, z))
        p.add(r)
    # The rock the sunken book leans on.
    r = hull_rock(0.15, 0.085, 0.07, seed=7, col='#6f7a98')
    r.xf(R=kit.ry(8), t=(BOOK_C[0] + 0.02, ground(0, BOOK_C[2] - 0.2) - 0.004, BOOK_C[2] - 0.17))
    p.add(r)
    return p


def reef_walls(scene):
    """Far cut-paper reef silhouettes that close the view (fog melts them into the water)."""
    p = scene.part('reef', role='static')
    for k, (z, h, col, rough) in enumerate([(-2.45, 0.3, '#3b5a78', 0.35), (-2.9, 0.48, '#2d4a68', 0.45), (-3.5, 0.62, '#223c58', 0.5)]):
        xs = np.linspace(-5.5, 5.5, 140)
        ys = np.array([h * (0.6 + rough * kit.n1(x * 0.9, k * 3.1) + 0.12 * kit.n1(x * 4.0, k + 7.0)) for x in xs])
        # Pinnacles.
        for cx in RNG.uniform(-4.5, 4.5, 5):
            ys += h * 0.4 * np.exp(-((xs - cx) / 0.18) ** 2)
        outline = np.vstack([[[-5.5, -0.05]], np.column_stack([xs, ys]), [[5.5, -0.05]]])
        loops = [outline]
        if k == 1:
            # A sea arch.
            loops.append(kit.smooth_loop([[-1.85, 0.04], [-1.45, 0.04], [-1.42, 0.22], [-1.63, 0.3], [-1.84, 0.22]], 6))
            ys[np.abs(xs + 1.64) < 0.4] = np.maximum(ys[np.abs(xs + 1.64) < 0.4], 0.5)
        s = kit.slab(loops, thick=0.02, col=col, pat_name='deep_a', uv_scale=2.0, edge_col='#8fb0c4')
        s.xf(t=(0, ground(0, z) - 0.01, z))
        p.add(s)
    return p


# ---------------------------------------------------------------- kelp, sea grass

KELP_COLS = ['#8c9a3e', '#b28a3c', '#4f9a76', '#6fae6a', '#c49a46', '#5f8f52', '#9aa84a']


def kelp_card(h, w, col, k, ph, lean=0.0):
    c = kit.card(w, h, 'kelp', col, mat=MAT.VELLUM, nu=1, nv=12,
                 bend=lambda u, v: 0.06 * h * math.sin(v * 3.2 + ph) * v)
    c.uv = np.column_stack([(c.uv[:, 0] * 0.98 + 0.01 + k) / 2.0, 0.998 - c.uv[:, 1] * 0.996])
    if lean:
        c.deform(lambda P: P + np.column_stack([lean * h * (P[:, 1] / h) ** 2, np.zeros(len(P)), np.zeros(len(P))]))
    return c


def kelp_forest(scene):
    groups = [
        # name, centre x, z, count, spread, height range
        ('kelp_fl', -1.02, 0.78, 3, 0.25, (1.5, 1.95)),
        ('kelp_fr', 1.05, 0.72, 3, 0.25, (1.45, 1.9)),
        ('kelp_ml', -1.3, -0.15, 4, 0.35, (1.2, 1.6)),
        ('kelp_mr', 1.35, -0.2, 4, 0.35, (1.15, 1.6)),
        ('kelp_bl', -1.0, -0.95, 4, 0.4, (0.95, 1.35)),
        ('kelp_br', 1.0, -1.0, 4, 0.4, (0.95, 1.35)),
        ('kelp_xl', -2.0, 0.2, 4, 0.5, (1.4, 1.9)),
        ('kelp_xr', 2.05, 0.15, 4, 0.5, (1.4, 1.9)),
        ('kelp_far', 0.0, -2.0, 8, 2.4, (0.8, 1.25)),
        ('kelp_ffl', -1.9, -1.55, 4, 0.5, (1.0, 1.4)),
        ('kelp_ffr', 1.9, -1.6, 4, 0.5, (1.0, 1.4)),
    ]
    for name, cx, cz, n, spread, (h0, h1) in groups:
        p = scene.part(name, pivot=(cx, ground(cx, cz), cz), role='static', sway=1.45)
        for i in range(n):
            x = cx + RNG.uniform(-spread, spread)
            z = cz + RNG.uniform(-spread, spread) * 0.6
            if name == 'kelp_far' and abs(x) < 0.35:
                x += 0.7 * np.sign(x if x else 1)
            h = RNG.uniform(h0, h1)
            w = h * RNG.uniform(0.2, 0.26)
            col = KELP_COLS[int(RNG.integers(len(KELP_COLS)))]
            lean = RNG.uniform(-0.12, 0.12) - 0.08 * np.sign(cx)
            c = kelp_card(h, w, col, int(RNG.integers(2)), RNG.uniform(0, 6), lean=lean)
            c.xf(R=kit.ry(RNG.uniform(-40, 40)), t=(x, ground(x, z) - 0.01, z))
            p.add(c)


def seagrass(scene):
    greens = ['#5f9e6e', '#7cb77a', '#4f8f74', '#9cc27f', '#6aa58a']
    for side in (-1, 1):
        p = scene.part(f'grass_{"l" if side < 0 else "r"}', pivot=(side * 1.0, 0.0, 0.0), role='static', sway=0.9)
        for k in range(1, 4):
            for i in range(5):
                x = side * RNG.uniform(0.35, 2.6)
                z = float(front_z(k, x)) - RNG.uniform(0.0, 0.05)
                w = RNG.uniform(0.25, 0.5)
                h = RNG.uniform(0.06, 0.12)
                g = kit.card(w, h, 'deep_d', greens[int(RNG.integers(len(greens)))], nu=8, nv=2,
                             bend=lambda u, v, a=RNG.uniform(-0.04, 0.04): a * math.sin(u * math.pi) * (1 + 0.5 * v))
                g.uv = np.column_stack([g.uv[:, 0] * w / (h * 2.0) + RNG.uniform(0, 5), 0.995 - g.uv[:, 1] * 0.99])
                g.xf(R=kit.ry(RNG.uniform(-10, 10)), t=(x, ground(x, z + 0.01) - 0.004, z))
                p.add(g)
        # Tufts in front of the base terrace.
        for i in range(4):
            x = side * RNG.uniform(0.45, 1.6)
            z = float(front_z(0, x)) + RNG.uniform(0.0, 0.25)
            w = RNG.uniform(0.18, 0.32)
            h = RNG.uniform(0.07, 0.11)
            g = kit.card(w, h, 'deep_d', greens[i % len(greens)], nu=6, nv=2)
            g.uv = np.column_stack([g.uv[:, 0] * w / (h * 2.0) + RNG.uniform(0, 5), 0.995 - g.uv[:, 1] * 0.99])
            g.xf(R=kit.ry(RNG.uniform(-25, 25)), t=(x, ground(x, z) - 0.004, z))
            p.add(g)


# ---------------------------------------------------------------- coral garden

CORAL_COLS = ['#ff7f6e', '#ff9a8a', '#f86f9a', '#ffab5e', '#f2577a', '#ffc27a']


def fan_coral(w, h, col, seed):
    rng = np.random.default_rng(seed)
    c = kit.card(w, h, 'coral', col, mat=MAT.VELLUM, nu=4, nv=4,
                 bend=lambda u, v: 0.18 * w * ((u - 0.5) * 2) ** 2 * v + 0.03 * h * v * v)
    flipv(c)
    c.uv[:, 1] = np.clip(c.uv[:, 1], 0.002, 0.998)
    stalk = kit.tube(props.curve([0, -0.01, 0], [0, h * 0.12, 0], bend=[0.005, 0, 0], n=4), [w * 0.04, w * 0.03], seg=5)
    stalk.paint(col)
    g = kit.merge([c, stalk])
    g.xf(R=kit.rot(rng.uniform(-8, 8), 0, rng.uniform(-10, 10)))
    return g


def branch_coral(size, col, tip_col, seed, depth=3):
    rng = np.random.default_rng(seed)
    out = []

    def grow(p0, d, L, r, k):
        p1 = p0 + d * L
        bend = rng.normal(0, L * 0.12, 3)
        pts = props.curve(p0, p1, bend=bend, n=4)
        t = kit.tube(pts, [r, r * 0.82], seg=5, cap=False)
        t.paint(col)
        out.append(t)
        if k == 0:
            tip = bead(r * 1.05, c=p1, seg=6, rings=4)
            tip.paint(tip_col, None, MAT.PAPER, 0.35)
            out.append(tip)
            return
        nb = 2 if rng.random() < 0.8 or k == depth else 3
        for j in range(nb):
            nd = d + rng.normal(0, 0.55, 3)
            nd[1] = abs(nd[1]) + 0.45
            nd = nd / np.linalg.norm(nd)
            grow(p1, nd, L * rng.uniform(0.68, 0.82), r * 0.78, k - 1)

    grow(np.array([0.0, -0.01, 0.0]), np.array([0.0, 1.0, 0.0]), size * 0.34, size * 0.06, depth)
    return kit.merge(out)


def sponge(h, r, col, seed):
    rng = np.random.default_rng(seed)
    out = []
    for i in range(3):
        hh = h * rng.uniform(0.6, 1.0)
        rr = r * rng.uniform(0.7, 1.0)
        prof = [(rr * 0.7, -0.01), (rr * 0.8, hh * 0.4), (rr * 1.0, hh * 0.85), (rr * 1.12, hh)]
        g = kit.lathe(prof, seg=12)
        g = kit.two_sided(g, 0.002)
        g.paint(col, 'deep_e', MAT.PAPER)
        g.uv = g.uv * 6
        # Darker inside: the back faces are the second half of two_sided's merge.
        n = len(g.pos) // 2
        g.col[n:] = np.clip(kit.hexc(col) * 0.45, 0, 1)
        rim = kit.tube([[rr * 1.12 * math.cos(a), hh, -rr * 1.12 * math.sin(a)] for a in np.linspace(0, 2 * math.pi, 17)], [rr * 0.09], seg=4, cap=False)
        rim.paint('#ffe1f2')
        a = i * 2.1 + rng.uniform(-0.3, 0.3)
        for ch in (g, rim):
            ch.xf(R=kit.rot(rng.uniform(-14, 14), 0, rng.uniform(-14, 14)), t=(math.cos(a) * r * 1.3 * (i > 0), 0, math.sin(a) * r * 1.3 * (i > 0)))
            out.append(ch)
    return kit.merge(out)


def anemone(h, r, col, tip, seed):
    rng = np.random.default_rng(seed)
    stalk = kit.lathe([(r * 0.8, -0.01), (r * 0.66, h * 0.45), (r * 0.72, h * 0.85), (r * 0.98, h)], seg=12)
    stalk.paint(col, 'deep_e', MAT.PAPER)
    stalk.uv = stalk.uv * 5
    out = [stalk]
    for k, (r0, r1, hh, reps) in enumerate([(0.95, 2.5, 1.7, 5), (0.6, 1.45, 1.35, 4)]):
        def f(u, v, r0=r0, r1=r1, hh=hh):
            a = u * 2 * math.pi
            rad = r * (r0 + (r1 - r0) * v ** 0.8)
            return np.array([rad * math.cos(a), h + r * hh * v, -rad * math.sin(a)])
        g = kit.grid(f, 30, 3, uv_fn=lambda U, V, reps=reps: np.stack([U * reps, 0.998 - V * 0.996], -1), wrap_u=True)
        g = kit.two_sided(g, 0.0008)
        g.paint(tip if k else col, 'deep_c', MAT.VELLUM, 0.25 if k else 0.1)
        g.occluder = False
        out.append(g)
    disc = kit.slab([kit.circle(r * 0.85, n=16)], thick=0.003, col=tip, edges=False)
    disc.xf(R=kit.rx(-90), t=(0, h + 0.002, 0))
    out.append(disc)
    g = kit.merge(out)
    g.xf(R=kit.rot(rng.uniform(-10, 10), rng.uniform(0, 360), rng.uniform(-10, 10)))
    return g


def starfish(R, col, seed):
    rng = np.random.default_rng(seed)
    loop = kit.polar(lambda a: R * (0.36 + 0.64 * (0.5 + 0.5 * math.cos(5 * a)) ** 1.6), n=90)
    s = kit.slab([loop], thick=0.012, col=col, pat_name='deep_e', uv_scale=14.0, edge_col='#ffd9b8')
    s.xf(R=kit.rx(-90))
    s.deform(lambda P: P + np.column_stack([np.zeros(len(P)), 0.35 * R * np.clip(1 - (np.hypot(P[:, 0], P[:, 2]) / R) ** 2, 0, 1) * (P[:, 1] > -0.001), np.zeros(len(P))]))
    s.xf(R=kit.ry(rng.uniform(0, 72)))
    return s


def scallop(R, col, seed):
    """A little folded-paper scallop: a fan with pleats, lying on the sand."""
    rng = np.random.default_rng(seed)
    pts = [[-R * 0.2, 0.0], [R * 0.2, 0.0]]
    for a in np.linspace(1.15, -1.15, 46):
        rr = R * (1 - 0.06 * abs(math.sin(a * 9 * math.pi / 2.3)))
        pts.append([rr * math.sin(-a), R * 0.1 + rr * math.cos(a)])
    s = kit.slab([np.array(pts)], thick=0.004, col=col, edge_col='#fff3ea')
    s.deform(lambda P: P + np.column_stack([np.zeros(len(P)), np.zeros(len(P)),
                                            0.07 * R * np.cos(np.arctan2(P[:, 0], P[:, 1] + 1e-6) * 9 * math.pi / 2.3) * np.clip(np.hypot(P[:, 0], P[:, 1]) / R, 0, 1)]))
    s.xf(R=kit.rot(-84 + rng.uniform(-5, 5), rng.uniform(0, 360), 0))
    return s


def lost_light(s, col='#ffc76a'):
    """A small glass jar with a light still burning inside, lying on its side in the sand."""
    jar = kit.lathe([(0.55 * s, 0), (0.75 * s, 0.25 * s), (0.72 * s, 0.85 * s), (0.42 * s, 1.05 * s), (0.4 * s, 1.2 * s)], seg=12)
    jar.paint(col, 'lantern_glass', MAT.GLASS, 1.4)
    jar.uv = jar.uv * np.array([1.0 / max(s, 1e-3) * 0.08, 4.0])
    jar.occluder = False
    lid = kit.lathe([(0.47 * s, 1.15 * s), (0.5 * s, 1.3 * s), (0.001, 1.38 * s)], seg=10)
    lid.paint('#3a3340', None, MAT.GOLD)
    g = kit.merge([jar, lid])
    g.xf(R=kit.rot(0, 0, 80))
    return g


def garden(scene):
    p = scene.part('coral', role='static')
    # Coral clusters framing the book: (x, z, kind, size)
    rng = RNG
    items = [
        (-0.5, 0.32, 'fan', 0.26), (-0.62, 0.18, 'branch', 0.3), (-0.4, 0.42, 'anem', 0.05), (-0.72, 0.4, 'sponge', 0.12),
        (0.52, 0.3, 'branch', 0.28), (0.66, 0.16, 'fan', 0.32), (0.42, 0.44, 'anem', 0.045), (0.74, 0.42, 'anem', 0.055),
        (-0.45, -0.62, 'fan', 0.36), (-0.62, -0.55, 'branch', 0.34), (0.5, -0.66, 'fan', 0.38), (0.7, -0.6, 'sponge', 0.16),
        (0.3, -0.62, 'branch', 0.22), (-0.28, -0.7, 'anem', 0.05),
        (-1.1, 0.12, 'fan', 0.42), (1.15, 0.05, 'fan', 0.44), (-0.9, -0.5, 'branch', 0.4), (0.95, -0.55, 'branch', 0.42),
        (-1.55, 0.7, 'sponge', 0.2), (1.6, 0.66, 'branch', 0.45), (-0.25, 0.75, 'anem', 0.04), (0.18, 0.62, 'anem', 0.035),
        (-1.45, -0.95, 'fan', 0.5), (1.5, -1.0, 'fan', 0.5), (-0.8, -1.2, 'sponge', 0.18), (0.75, -1.25, 'branch', 0.36),
        (-2.2, -0.2, 'fan', 0.55), (2.25, -0.3, 'fan', 0.55), (-2.05, 0.95, 'branch', 0.4), (2.1, 0.9, 'sponge', 0.22),
    ]
    for i, (x, z, kind, s) in enumerate(items):
        y = ground(x, z) - 0.003
        col = CORAL_COLS[i % len(CORAL_COLS)]
        if kind == 'fan':
            g = fan_coral(s * 0.95, s, col, seed=i)
            g.xf(R=kit.ry(rng.uniform(-35, 35)), t=(x, y, z))
        elif kind == 'branch':
            g = branch_coral(s, col, tuple(np.clip(kit.hexc(col) * 0.75 + 0.3, 0, 1)), seed=50 + i, depth=3 if s > 0.3 else 2)
            g.xf(R=kit.ry(rng.uniform(0, 360)), t=(x, y, z))
        elif kind == 'sponge':
            g = sponge(s, s * 0.22, ['#8a6fc4', '#b07ad0', '#6f8fd6'][i % 3], seed=i)
            g.xf(t=(x, y, z))
        else:
            g = anemone(s * 1.4, s * 0.5, ['#ff8fb1', '#ffb36b', '#9fd3c7', '#c79bff'][i % 4], ['#ffd6e6', '#fff0c2', '#e8fff6', '#f0e2ff'][i % 4], seed=i)
            g.xf(t=(x, y, z))
        p.add(g)
    # Starfish and shells on the sand.
    for i, (x, z, r, col) in enumerate([(-0.28, 0.42, 0.045, '#f2804f'), (0.33, 0.52, 0.04, '#e95f6a'), (-0.9, 0.85, 0.05, '#f6b04a'),
                                        (0.95, 0.9, 0.045, '#f27e5e'), (0.6, -0.38, 0.035, '#f6b04a')]):
        s = starfish(r, col, seed=i)
        s.xf(t=(x, ground(x, z) + 0.004, z))
        p.add(s)
    # Lost lights: little jars still glowing, the ones the whale has not gathered yet.
    for x, z, sz, ry in [(0.33, -0.44, 0.03, -30), (-0.9, -0.12, 0.032, 40), (-0.3, -1.1, 0.03, 70)]:
        j = lost_light(sz)
        j.xf(R=kit.ry(ry), t=(x, ground(x, z) + 0.6 * 0.75 * sz, z))
        p.add(j)
    for i, (x, z, r, col) in enumerate([(0.2, 0.36, 0.035, '#f4a99c'), (-0.12, 0.5, 0.03, '#f7c59f'), (0.72, 0.72, 0.04, '#f2b5d4'),
                                        (-0.62, 0.7, 0.035, '#f6c1a0'), (-0.18, -0.48, 0.028, '#f4a99c')]):
        s = scallop(r, col, seed=i)
        s.xf(t=(x, ground(x, z) + 0.006, z))
        p.add(s)


# ---------------------------------------------------------------- the whale

def _loop(ctrl, n=10):
    return kit.smooth_loop(np.array(ctrl, dtype=np.float64), n)


WHALE_BODY = [(0.78, 0.0), (0.7, 0.1), (0.52, 0.175), (0.25, 0.22), (0.0, 0.215), (-0.2, 0.185), (-0.34, 0.14),
              (-0.39, 0.05), (-0.35, -0.06), (-0.2, -0.13), (0.05, -0.2), (0.32, -0.205), (0.55, -0.145), (0.72, -0.065)]
WHALE_REAR = [(-0.24, 0.155), (-0.33, 0.15), (-0.39, 0.205), (-0.45, 0.125), (-0.6, 0.075), (-0.72, 0.04), (-0.76, 0.005),
              (-0.72, -0.025), (-0.58, -0.04), (-0.44, -0.07), (-0.26, -0.12), (-0.18, 0.02)]
WHALE_TAIL = [(-0.69, 0.035), (-0.8, 0.1), (-0.95, 0.225), (-0.92, 0.11), (-0.89, 0.01), (-0.92, -0.1), (-0.97, -0.2),
              (-0.82, -0.09), (-0.69, -0.02)]
WHALE_BELLY = [(0.745, -0.035), (0.6, -0.07), (0.4, -0.09), (0.15, -0.105), (-0.1, -0.1), (-0.26, -0.112),
               (-0.22, -0.142), (0.05, -0.208), (0.32, -0.212), (0.56, -0.15), (0.73, -0.07)]
WHALE_FIN = [(0.35, -0.075), (0.31, -0.15), (0.25, -0.23), (0.17, -0.3), (0.07, -0.36), (0.1, -0.31), (0.16, -0.25),
             (0.21, -0.17), (0.25, -0.1)]
REAR_PIVOT = (-0.27, 0.02)
TAIL_PIVOT = (-0.72, 0.008)
FIN_PIVOT = (0.3, -0.09)


def scalloped(loop, amp, freq, i0, i1):
    """Bumps along part of an outline (the humpback's knobbly flipper edge)."""
    L = loop.copy()
    n = len(L)
    d = np.roll(L, -1, axis=0) - np.roll(L, 1, axis=0)
    nrm = kit.norm(np.column_stack([d[:, 1], -d[:, 0]]))
    for i in range(int(i0 * n), int(i1 * n)):
        L[i] += nrm[i] * amp * abs(math.sin(i * freq))
    return L


def whale_slab(ctrl, z, col, pat_name, thick=0.012, n=10, uv_box=None, edge='#dce8f2', loop=None):
    lp = _loop(ctrl, n) if loop is None else loop
    lo, hi = (lp.min(axis=0), lp.max(axis=0)) if uv_box is None else uv_box
    uv = lambda q: np.column_stack([(q[:, 0] - lo[0]) / (hi[0] - lo[0]), 1 - (q[:, 1] - lo[1]) / (hi[1] - lo[1])])
    s = kit.slab([lp], thick=thick, col=col, pat_name=pat_name, uv_fn=uv, edge_col=edge)
    s.xf(t=(0, 0, z))
    return s


def brad(x, y, z, r=0.013):
    g = kit.lathe([(r, 0), (r * 0.8, r * 0.35), (0.0005, r * 0.5)], seg=10)
    g.xf(R=kit.rx(90), t=(x, y, z))
    g.paint('#f2cf6a', None, MAT.GOLD)
    return g


def glow_star(x, y, z, r, col='#fff0b8', emis=3.0):
    loop = kit.polar(lambda a: r * (0.35 + 0.65 * abs(math.cos(2 * a)) ** 3), n=32)
    s = kit.slab([loop], thick=0.002, col=col, mat=MAT.GLOW, emis=emis, edges=False)
    s.xf(R=kit.rz(RNG.uniform(0, 45)), t=(x, y, z))
    s.occluder = False
    return s


def mirror_z(ch, z0=0.0):
    """The same layer on the other side of a sheet lying at z0 (the whale is decorated on both sides)."""
    c = ch.copy()
    c.xf(t=(0, 0, -z0))
    c.xf(s=(1, 1, -1))
    c.xf(t=(0, 0, z0))
    return c


def whale(scene):
    """An articulated paper puppet whale, decorated on both faces so it can turn round and swim back."""
    W = lambda q: WHALE_POS + np.array([q[0], q[1], q[2] if len(q) > 2 else 0.0]) * WHALE_S
    body_loop = _loop(WHALE_BODY, 10)
    lo, hi = body_loop.min(axis=0), body_loop.max(axis=0)

    def place(chunks):
        out = []
        for ch in chunks:
            ch.xf(t=WHALE_POS, s=WHALE_S)
            out.append(ch)
        return out

    def both(chunks, z0=0.0):
        return list(chunks) + [mirror_z(c, z0) for c in chunks]

    # Body (front half, head) with the constellation and the eye on both flanks.
    body = scene.part('whale_body', pivot=tuple(W((0.0, 0.0))), axis=(0, 0, 1), role='actor')
    deco = []
    for (u, v) in WHALE_STARS:
        x = lo[0] + u * (hi[0] - lo[0])
        y = lo[1] + (1 - v) * (hi[1] - lo[1])
        deco.append(glow_star(x, y, 0.0072, 0.009 + 0.004 * RNG.random(), emis=2.2))
    ring = kit.slab([kit.circle(0.024, n=20), kit.circle(0.014, n=20)], thick=0.004, col='#cfe0f0', edge_col='#ffffff')
    ring.xf(t=(0.555, 0.005, 0.009))
    eye = kit.slab([kit.circle(0.015, n=16)], thick=0.004, col='#0c1426', edges=False)
    eye.xf(t=(0.555, 0.005, 0.0085))
    glint = kit.slab([kit.circle(0.004, n=8)], thick=0.002, col='#ffffff', mat=MAT.GLOW, emis=2.0, edges=False)
    glint.xf(t=(0.56, 0.011, 0.011))
    deco += [ring, eye, glint, brad(REAR_PIVOT[0] + 0.035, REAR_PIVOT[1] + 0.02, 0.009)]
    body.add(*place([whale_slab(WHALE_BODY, 0.0, '#ffffff', 'whale', uv_box=(lo, hi))] + both(deco)))

    belly = scene.part('whale_belly', pivot=tuple(W((0.0, 0.0))), axis=(0, 0, 1), role='actor')
    bl = [whale_slab(WHALE_BELLY, 0.011, '#ffffff', 'deep_b', thick=0.01, n=8, edge='#ffffff')]
    # Little lantern lights along the pleats.
    for i, x in enumerate(np.linspace(-0.12, 0.6, 7)):
        y = -0.16 + 0.07 * (x + 0.12) / 0.72 + 0.012 * math.sin(i * 1.7)
        bl.append(glow_star(x, y, 0.0172, 0.008, col='#bff6ff', emis=2.4))
    belly.add(*place(both(bl)))

    rear = scene.part('whale_rear', pivot=tuple(W(REAR_PIVOT)), axis=(0, 0, 1), role='actor')
    r_ = whale_slab(WHALE_REAR, -0.012, '#ffffff', 'whale', n=8, uv_box=(lo + np.array([-0.4, 0.0]), hi - np.array([0.5, 0.0])))
    rdeco = [glow_star(-0.48, 0.07, -0.0048, 0.012), glow_star(-0.6, 0.035, -0.0048, 0.01),
             brad(TAIL_PIVOT[0] + 0.04, TAIL_PIVOT[1] + 0.005, -0.0045, 0.01)]
    rear.add(*place([r_] + both(rdeco, -0.012)))

    tail = scene.part('whale_tail', pivot=tuple(W(TAIL_PIVOT)), axis=(0, 0, 1), role='actor')
    t_ = whale_slab(WHALE_TAIL, -0.022, '#ffffff', 'whale', n=8, uv_box=(lo + np.array([-0.25, 0.0]), hi - np.array([0.9, 0.0])))
    tail.add(*place([t_, mirror_z(brad(TAIL_PIVOT[0] + 0.04, TAIL_PIVOT[1] + 0.005, -0.0045, 0.01), -0.0165)]))

    # Flippers: one on each flank, the far one mostly hidden behind the body.
    fin_loop = scalloped(_loop(WHALE_FIN, 8), 0.007, 1.3, 0.02, 0.5)
    fin = scene.part('whale_fin', pivot=tuple(W(FIN_PIVOT)), axis=(0, 0, 1), role='actor')
    f_ = whale_slab(None, 0.026, '#8fa9c8', 'deep_b', thick=0.01, loop=fin_loop, edge='#ffffff')
    fin.add(*place([f_, brad(FIN_PIVOT[0] + 0.02, FIN_PIVOT[1] + 0.005, 0.0335)]))
    fin2 = scene.part('whale_fin2', pivot=tuple(W(FIN_PIVOT)), axis=(0, 0, 1), role='actor')
    f2 = mirror_z(whale_slab(None, 0.026, '#8fa9c8', 'deep_b', thick=0.01, loop=fin_loop, edge='#ffffff'))
    fin2.add(*place([f2, mirror_z(brad(FIN_PIVOT[0] + 0.02, FIN_PIVOT[1] + 0.005, 0.0335))]))


# ---------------------------------------------------------------- jellyfish

def jellyfish(scene, i, centre, R, col, rim_col):
    C = np.array(centre, dtype=np.float64)
    h = R * 1.05
    prof = [(R * 0.9, 0.0), (R * 1.0, h * 0.16), (R * 0.95, h * 0.48), (R * 0.75, h * 0.78), (R * 0.42, h * 0.96), (R * 0.02, h)]
    bell = kit.lathe(prof, seg=28)
    bell.uv = np.column_stack([bell.pos[:, 0] / (2.1 * R) + 0.5, bell.pos[:, 2] / (2.1 * R) + 0.5])
    bell = kit.two_sided(bell, 0.0012)
    bell.paint(col, 'jelly', MAT.VELLUM, 0.5)
    bell.occluder = False
    # Inner glowing heart, seen through the lace.
    core = bead(R * 0.32, c=(0, h * 0.55, 0), seg=10, rings=6, squash=0.7)
    core.paint(rim_col, None, MAT.GLOW, 1.8)
    core.occluder = False
    # Glowing rim with tiny bulbs.
    ring = kit.tube([[R * 0.95 * math.cos(a), h * 0.02, -R * 0.95 * math.sin(a)] for a in np.linspace(0, 2 * math.pi, 33)], [R * 0.045], seg=4, cap=False)
    ring.paint(rim_col, None, MAT.GLOW, 2.6)
    ring.occluder = False
    bulbs = []
    for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
        s = bead(R * 0.06, c=(R * 0.96 * math.cos(a), -R * 0.02, -R * 0.96 * math.sin(a)), seg=5, rings=3)
        s.paint('#ffffff', None, MAT.GLOW, 3.0)
        s.occluder = False
        bulbs.append(s)
    bp = scene.part(f'jelly{i}_bell', pivot=tuple(C + [0, h, 0]), axis=(0, 1, 0), role='actor')
    for ch in [bell, core, ring] + bulbs:
        ch.xf(t=C)
        bp.add(ch)
    # Tentacles: thin threads and curling vellum ribbons (oral arms).
    rng = np.random.default_rng(40 + i)
    tent = []
    for k in range(9):
        a = k / 9 * 2 * math.pi + rng.uniform(-0.2, 0.2)
        L = R * rng.uniform(3.0, 4.6)
        p0 = np.array([R * 0.85 * math.cos(a), 0.0, -R * 0.85 * math.sin(a)])
        pts = [p0 + np.array([0.012 * math.sin(t * 9 + k), -L * t, 0.012 * math.cos(t * 7 + k)]) for t in np.linspace(0, 1, 12)]
        t_ = kit.tube(pts, [R * 0.035, R * 0.012], seg=4, cap=False)
        t_.paint(col, None, MAT.GLOW, 0.55)
        t_.occluder = False
        tent.append(t_)
    for k in range(4):
        a = k / 4 * 2 * math.pi + 0.4
        L = R * rng.uniform(2.2, 3.0)
        wdt = R * 0.32

        def f(u, v, a=a, L=L, wdt=wdt, k=k):
            y = -L * u
            sw = 0.25 * R * math.sin(u * 7 + k)
            cx = R * 0.25 * math.cos(a) + sw * math.cos(a)
            cz = -R * 0.25 * math.sin(a) - sw * math.sin(a)
            tw = a + u * 5.0
            ww = wdt * (1 - 0.6 * u) * (v - 0.5) * (1 + 0.25 * math.sin(v * 9 + u * 20))
            return np.array([cx + ww * math.cos(tw), y, cz - ww * math.sin(tw)])
        g = kit.two_sided(kit.grid(f, 16, 2), 0.0008)
        g.paint(col, None, MAT.VELLUM, 0.6)
        g.occluder = False
        tent.append(g)
    tp = scene.part(f'jelly{i}_tent', pivot=tuple(C), axis=(0, 0, 1), role='actor')
    for ch in tent:
        ch.xf(t=C)
        tp.add(ch)


# ---------------------------------------------------------------- fish

def fish_card(L, k):
    c = kit.card(L, L * 0.5, 'fish', '#ffffff', nu=2, nv=1, anchor=(0.5, 0.5), bend=lambda u, v: 0.12 * L * (u - 0.5) ** 2)
    # 2 x 2 cells: k -> (col, row); canvas top is the top of the fish.
    cu, cv = k % 2, k // 2
    c.uv = np.column_stack([(c.uv[:, 0] * 0.96 + 0.02 + cu) / 2.0, (0.98 - c.uv[:, 1] * 0.96 + cv) / 2.0])
    return c


def schools(scene):
    for name, centre, radii, counts, jit, L in SCHOOLS:
        C = np.array(centre)
        for ri, (rad, n) in enumerate(zip(radii, counts)):
            p = scene.part(f'{name}{ri}', pivot=tuple(C), axis=(0, 1, 0), role='actor')
            for j in range(n):
                th = (j + RNG.uniform(-0.25, 0.25)) / n * 2 * math.pi + ri * 0.7
                rr = rad * RNG.uniform(0.9, 1.1)
                off = np.array([rr * math.cos(th), RNG.uniform(-jit, jit), rr * math.sin(th)])
                f = fish_card(L * RNG.uniform(0.85, 1.15), int(RNG.integers(3)) if name == 'school_a' else (ri * 2 + j) % 3)
                a = math.degrees(math.atan2(off[0], off[2]))
                f.xf(R=kit.rot(0, a, RNG.uniform(-8, 8)), t=C + off)
                p.add(f)


# ---------------------------------------------------------------- the sunken book (the portal)

def book_xf():
    R = kit.ry(BOOK_YAW) @ kit.rx(BOOK_TILT)
    # Rest the front edge on the sand: lowest corner of the tilted board at the terrace top.
    y0 = ground(BOOK_C[0], BOOK_C[2] + 0.2)
    corners = np.array([[sx * book.BW, 0.0, sz * book.BD / 2] for sx in (-1, 1) for sz in (-1, 1)]) * BOOK_S
    low = (corners @ R.T)[:, 1].min()
    t = np.array([BOOK_C[0], y0 - low - 0.006, BOOK_C[2]])
    return R, t


def sunken_book(scene):
    right, left = book.build(scene, prefix='sunk_', with_spine=False)
    R, t = book_xf()
    for part in (right, left):
        for ch in part.chunks:
            ch.xf(s=BOOK_S)
            ch.xf(R=R, t=t)
        part.pivot = R @ (np.array([0, book.HB, 0]) * BOOK_S) + t
        part.axis = kit.norm(R @ np.array([0, 0, 1.0]))
        part.meta['role'] = 'static'
        part.meta.pop('side', None)
        # The page block glows from within.
        part.chunks[1].emis[:] = 0.55
    up = kit.norm(R @ np.array([0, 1.0, 0]))
    centre = R @ (np.array([0, book.HB + 0.012, 0]) * BOOK_S) + t
    return R, t, up, centre


def portal(scene, R, t, up, centre):
    # The way back to chapter I: a warm disc lying over the open pages.
    disc = kit.slab([kit.circle(PORTAL_R, n=56)], thick=0.002, col='#ffcf80', mat=MAT.PORTAL, emis=1.3,
                    uv_fn=lambda q: q / (2 * PORTAL_R) + 0.5, edges=False)
    disc.xf(R=kit.rx(-90))
    disc.xf(R=R, t=centre)
    disc.occluder = False
    p = scene.part('portal', pivot=tuple(centre), axis=tuple(up), role='static',
                   portal=dict(center=[round(float(v), 4) for v in centre], normal=[round(float(v), 4) for v in up], radius=PORTAL_R))
    p.add(disc)
    # Gold foil ring lying on the pages around the light.
    ring = kit.slab([kit.circle(PORTAL_R + 0.014, n=56), kit.circle(PORTAL_R + 0.002, n=56)], thick=0.003, col='#f4cf6e', mat=MAT.GOLD, edge_col='#fff1c0')
    ring.xf(R=kit.rx(-90), t=(0, -0.001, 0))
    ring.xf(R=R, t=centre)
    p.add(ring)


def book_light(scene, R, t, up, centre):
    """A crown of cut-paper light rising from the pages, and motes of light around it."""
    p = scene.part('crown', pivot=tuple(centre), axis=tuple(up), role='static')
    for k, (r0, r1, hh, reps, emis, col) in enumerate([(PORTAL_R + 0.025, PORTAL_R + 0.2, 0.075, 3, 1.15, '#ffd27a'),
                                                       (PORTAL_R + 0.03, PORTAL_R + 0.11, 0.05, 4, 0.9, '#ffb45c')]):
        def f(u, v, r0=r0, r1=r1, hh=hh):
            a = u * 2 * math.pi
            rad = r0 + (r1 - r0) * v
            return np.array([rad * math.cos(a), hh * v, -rad * math.sin(a)])
        g = kit.grid(f, 48, 4, uv_fn=lambda U, V, reps=reps, k=k: np.stack([U * reps + k * 0.37, 0.995 - V * 0.99], -1), wrap_u=True)
        g = kit.two_sided(g, 0.0006)
        g.paint(col, 'deep_f', MAT.GLOW, emis)
        g.occluder = False
        g.xf(R=R, t=centre)
        p.add(g)
    m = scene.part('motes', pivot=tuple(centre), axis=tuple(up), role='actor')
    rng = np.random.default_rng(5)
    for i in range(28):
        a = rng.uniform(0, 2 * math.pi)
        rad = rng.uniform(PORTAL_R + 0.06, PORTAL_R + 0.36)
        hgt = rng.uniform(0.03, 0.55)
        s = bead(rng.uniform(0.004, 0.009), c=(rad * math.cos(a), hgt, -rad * math.sin(a)), seg=6, rings=4)
        s.paint(['#ffe7a8', '#fff6d8', '#ffc978'][i % 3], None, MAT.GLOW, 3.2)
        s.occluder = False
        s.xf(R=R, t=centre)
        m.add(s)


def book_dressing(scene, R, t):
    """Sand drifted over a corner, a little coral and a starfish: the book has been here a while."""
    p = scene.part('book_dress', role='static')
    def at(local):
        return R @ (np.asarray(local, dtype=np.float64) * BOOK_S) + t
    # Sand drift over the front-left corner.
    drift = kit.lathe([(0.16, 0.0), (0.13, 0.025), (0.07, 0.05), (0.001, 0.058)], seg=20)
    drift.xf(s=(1.4, 1.0, 0.8))
    c = at([-1.0, 0.0, 0.62])
    drift.xf(t=(c[0], ground(c[0], c[2]) - 0.01, c[2] + 0.02))
    drift.paint('#dcc6a0', 'sand', MAT.PAPER)
    drift.uv = drift.pos[:, [0, 2]] * 1.3
    p.add(drift)
    # Branch coral growing from the back-right corner of the board.
    bc = branch_coral(0.17, '#ff7f6e', '#fff0dc', seed=301, depth=2)
    c = at([1.0, 0.03, -0.66])
    bc.xf(R=kit.ry(30), t=c)
    p.add(bc)
    an = anemone(0.05, 0.022, '#c79bff', '#f0e2ff', seed=3)
    c = at([-0.96, 0.03, -0.62])
    an.xf(t=c)
    p.add(an)
    st = starfish(0.032, '#f2804f', seed=9)
    c = at([0.98, 0.0, 0.66])
    st.xf(R=kit.rz(-8), t=(c[0] + 0.04, ground(c[0], c[2]) + 0.006, c[2] + 0.03))
    p.add(st)
    sc = scallop(0.026, '#f2b5d4', seed=11)
    c = at([-0.55, 0.0, 0.8])
    sc.xf(t=(c[0], ground(c[0], c[2] + 0.06) + 0.006, c[2] + 0.06))
    p.add(sc)


# ---------------------------------------------------------------- light shafts from the surface

def shafts(scene):
    """Soft shafts of light falling from the surface (volumetric, additive)."""
    p = scene.part('shafts', role='static')
    for i, (x, z, r0, r1, length, tilt, emis) in enumerate([(-1.0, -1.5, 0.12, 0.42, 2.6, 13, 0.55), (0.3, -2.1, 0.16, 0.5, 2.8, 9, 0.5),
                                                              (1.25, -1.3, 0.1, 0.36, 2.4, 15, 0.45), (-0.25, -0.9, 0.07, 0.26, 2.3, 7, 0.32),
                                                              (-1.9, -0.8, 0.12, 0.4, 2.5, 17, 0.4), (2.0, -0.6, 0.1, 0.38, 2.5, 12, 0.38)]):
        def f(u, v, r0=r0, r1=r1, length=length):
            a_ = u * 2 * math.pi
            r = r0 + (r1 - r0) * v
            return np.array([r * math.cos(a_), -v * length, r * math.sin(a_) * 0.55])
        g = kit.grid(f, 20, 8, uv_fn=lambda U, V: np.stack([U + 1.0, V], -1), wrap_u=True)  # u >= 1: soft-start shaft
        g.paint('#bff3ff', None, MAT.LIGHT, emis * 0.6)
        g.occluder = False
        g.xf(R=kit.rot(0, RNG.uniform(-25, 25), tilt * (1 if x < 0 else -1)), t=(x, 2.35, z))
        p.add(g)


# ---------------------------------------------------------------- bubble streams

BUBBLE_P = 0.9  # vertical period of a stream (the runtime wraps its rise by this)
STREAMS = [(-0.62, 0.2), (1.02, 0.42), (-0.47, -0.6), (0.52, -0.64), (-1.33, -0.38), (1.42, -0.48), (-0.92, 0.82),
           (0.88, 0.62), (-0.2, -1.4), (0.2, -1.24), (-1.75, 0.35), (1.85, 0.3)]


def bubble(r, k):
    c = kit.card(2 * r, 2 * r, 'fish', '#d8f7ff', mat=MAT.GLOW, emis=1.0, anchor=(0.5, 0.5))
    # The bubble art lives in the fish atlas cell (1, 1): two variants side by side.
    c.uv = np.column_stack([0.5 + k * 0.25 + 0.005 + c.uv[:, 0] * 0.24, 0.5 + 0.005 + (1 - c.uv[:, 1]) * 0.49])
    return c


def bubble_streams(scene):
    for i, (x, z) in enumerate(STREAMS):
        rng = np.random.default_rng(900 + i)
        y0 = ground(x, z) - BUBBLE_P
        p = scene.part(f'bubbles{i}', pivot=(x, y0, z), axis=(0, 1, 0), role='actor', period=BUBBLE_P)
        offs = np.sort(rng.uniform(0, BUBBLE_P, 6))
        sizes = rng.uniform(0.005, 0.012, 6)
        wob = rng.uniform(0, 6.28, 6)
        for m in range(4):
            for j in range(6):
                y = y0 + m * BUBBLE_P + offs[j]
                if y > 2.4:
                    continue
                s = sizes[j] * (1 + 0.15 * m)
                b = bubble(s, j % 2)
                b.xf(R=kit.rx(-12), t=(x + 0.018 * math.sin(wob[j]), y, z + 0.012 * math.cos(wob[j])))
                p.add(b)


# ---------------------------------------------------------------- scene

def build_scene():
    scene = kit.Scene('deep', ao_dist=0.12, ao_strength=0.85)
    sand(scene)
    reef_walls(scene)
    shafts(scene)
    rocks(scene)
    R, t, up, centre = sunken_book(scene)
    portal(scene, R, t, up, centre)
    book_light(scene, R, t, up, centre)
    book_dressing(scene, R, t)
    garden(scene)
    seagrass(scene)
    kelp_forest(scene)
    bubble_streams(scene)
    whale(scene)
    for i, (c, r, col, rim) in enumerate(JELLIES):
        jellyfish(scene, i, c, r, col, rim)
    schools(scene)
    print('[deep] portal', scene.find('portal').meta['portal'])
    return scene


CAMS = [
    ((0.0, 1.0, 2.35), (0.0, 0.32, -0.5), 34, 'hero'),
    ((1.2, 0.9, 1.9), (0.0, 0.32, -0.5), 34, 'side'),
    ((0.0, 2.9, 1.0), (0.0, 0.25, -0.35), 34, 'entry'),
]
