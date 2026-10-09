"""Reusable paper props: trees, houses, grass, mushrooms, fences, lanterns."""
import math

import numpy as np

import kit
from kit import MAT


# ---------------------------------------------------------------- foliage

def umbrella(R, sag=0.05, ripple=0.012, folds=9, col='#f2a07b', mat=MAT.VELLUM, pat_name='canopy_lace', tilt=(0, 0, 0), nr=8, nt=48, seed=0.0, emis=0.0):
    """A domed lace canopy (pleated umbrella), centred at the origin, opening downwards."""
    def f(u, v):
        th = v * 2 * math.pi
        r = u * R
        pleat = ripple * math.cos(folds * th) * (u ** 1.5)
        y = -sag * (u ** 2) + pleat + 0.25 * sag * (1 - u)
        return np.array([r * math.cos(th), y, -r * math.sin(th)])
    g = kit.grid(f, nr, nt, u0=0.02, u1=1.0)
    g.uv = np.column_stack([g.pos[:, 0] / (2 * R) + 0.5, 0.5 - g.pos[:, 2] / (2 * R)])
    if np.mean(g.nrm[:, 1]) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    g = kit.two_sided(g, 0.0012)
    g.paint(col, pat_name, mat, emis)
    g.occluder = False
    g.xf(R=kit.rot(*tilt))
    return g


def trunk(path, r0, r1, col='#8a5a3c', seg=10, seed=0.0):
    P = np.asarray(path, dtype=np.float64)
    radii = np.linspace(r0, r1, len(P))
    g = kit.tube(P, radii, seg=seg, twist=6.0, uv_scale=3.0, wobble=0.12, seed=seed)
    g.paint(col, 'bark', MAT.PAPER)
    return g


def curve(a, b, bend=(0, 0, 0), n=10):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    m = (a + b) / 2 + np.asarray(bend, dtype=np.float64)
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) ** 2 * a + 2 * (1 - t) * t * m + t * t * b


def tree(seed, height=0.85, spread=0.32, palette=('#f0a27c', '#7fc2b4', '#f6c27a'), trunk_col='#8d5b3f', canopies=4, lean=0.0, R0=0.17):
    """Twisted storybook tree with lace umbrella canopies. Base at origin."""
    rng = np.random.default_rng(seed)
    out = []
    # Trunk: S-curve with a lean.
    pts = []
    for t in np.linspace(0, 1, 14):
        x = lean * t + 0.04 * math.sin(t * 5.5 + seed) * (1 - t * 0.3)
        z = 0.03 * math.cos(t * 4.0 + seed * 2)
        pts.append([x, t * height, z])
    out.append(trunk(pts, 0.05, 0.016, trunk_col, seed=seed))
    # Roots.
    for k in range(4):
        a = k * math.pi / 2 + rng.uniform(-0.4, 0.4)
        d = np.array([math.cos(a), 0, math.sin(a)])
        p = curve([0, 0.10, 0], d * rng.uniform(0.09, 0.13) + [0, 0.002, 0], bend=[0, 0.01, 0], n=8)
        out.append(trunk(p, 0.022, 0.006, trunk_col, seg=7, seed=seed + k))
    # Branches and canopies.
    tops = []
    for k in range(canopies):
        t = 0.45 + 0.5 * (k / max(canopies - 1, 1))
        base = np.array(pts[int(t * (len(pts) - 1))])
        side = -1 if k % 2 == 0 else 1
        dx = side * rng.uniform(0.35, 1.0) * spread * (1.15 - t * 0.6)
        tip = base + np.array([dx, rng.uniform(0.06, 0.16), rng.uniform(-0.08, 0.08)])
        if k == canopies - 1:
            tip = np.array([pts[-1][0], height + 0.05, pts[-1][2]])
        br = curve(base, tip, bend=[dx * 0.1, 0.08, 0], n=9)
        out.append(trunk(br, 0.022 * (1.2 - t * 0.5), 0.009, trunk_col, seg=8, seed=seed + 10 + k))
        tops.append((tip, side, k))
    for tip, side, k in tops:
        R = R0 * rng.uniform(0.75, 1.15) * (1.1 if k == canopies - 1 else 1.0)
        col = palette[k % len(palette)]
        c = umbrella(R, sag=R * 0.32, folds=int(rng.integers(7, 11)), col=col,
                     tilt=(rng.uniform(-10, 10), rng.uniform(0, 360), side * rng.uniform(5, 16)), seed=seed + k)
        c.xf(t=tip + np.array([0, 0.012, 0]))
        out.append(c)
    return kit.merge(out)


def grass_strip(w, h, col, seed=0.0, curve=0.03):
    """A long strip of cut-paper grass (the pattern tiles along the strip)."""
    c = kit.card(w, h, 'grass', col, nu=10, nv=2, anchor=(0.5, 0.0), bend=lambda u, v: curve * math.sin(u * math.pi) * (1 + 0.5 * v))
    c.uv = np.column_stack([c.uv[:, 0] * w / (h * 4.0) + seed * 0.37, 0.002 + (1 - c.uv[:, 1]) * 0.995])  # atlas v=0 is the top of the art
    return c


def fern(w, h, col, k=0):
    c = kit.card(w, h, 'fern', col, nu=2, nv=4, bend=lambda u, v: 0.03 * v * v)
    c.uv = np.column_stack([(c.uv[:, 0] + k % 2) / 2.0, 1 - c.uv[:, 1]])
    return c


def mushroom(h, r, cap_col='#ef6f5b', stem_col='#f3e3c8', glow=0.0, seed=0):
    stem = kit.lathe([(r * 0.30, 0), (r * 0.26, h * 0.5), (r * 0.22, h)], seg=12)
    stem.paint(stem_col, None, MAT.PAPER)
    prof = [(r * 0.2, h * 0.92), (r, h * 0.95), (r * 0.92, h * 1.08), (r * 0.62, h * 1.24), (r * 0.02, h * 1.32)]
    cap = kit.lathe(prof, seg=20, cap_bottom=False)
    cap.uv = cap.uv * np.array([1.6 / max(r, 1e-3) * 0.08, 6.0])
    cap.paint(cap_col, 'mushroom', MAT.VELLUM if glow > 0 else MAT.PAPER, glow)
    gills = kit.lathe([(r * 0.95, h * 0.95), (r * 0.2, h * 0.9)], seg=20)
    gills.paint('#f8d9a8' if glow == 0 else '#ffe0a0', None, MAT.GLOW if glow > 0 else MAT.PAPER, glow * 0.6)
    gills.occluder = False
    return kit.merge([stem, cap, gills])


def puffball(h, r, col='#f08a4b', stem='#6f9a62'):
    s = kit.tube(curve([0, 0, 0], [0, h, 0], bend=[0.01, 0, 0], n=6), [0.004, 0.003], seg=6, cap=False)
    s.paint(stem, None, MAT.PAPER)
    b = kit.sphere(r, c=(0, h + r * 0.8, 0), seg=14, rings=8)
    b.uv = b.uv * np.array([3.0, 3.0])
    b.paint(col, 'dandelion', MAT.PAPER)
    return kit.merge([s, b])


# ---------------------------------------------------------------- architecture

WALL_T = 0.008


def frame_ring(loop, grow=0.012, col='#f3e6cc', thick=0.006):
    loop = np.asarray(loop, dtype=np.float64)
    c = loop.mean(axis=0)
    outer = c + (loop - c) * (1 + grow / max(np.linalg.norm(loop - c, axis=1).mean(), 1e-6))
    g = kit.slab([outer, loop], thick=thick, col=col, edge_col='#fff4dd')
    return g


def window_pane(loop, glow='#ffcf7a', strength=2.6, pat_name='window'):
    loop = np.asarray(loop, dtype=np.float64)
    lo, hi = loop.min(axis=0), loop.max(axis=0)
    uv = lambda p: np.column_stack([(p[:, 0] - lo[0]) / max(hi[0] - lo[0], 1e-6), (hi[1] - p[:, 1]) / max(hi[1] - lo[1], 1e-6)])  # image v=0 at the top
    g = kit.slab([loop], thick=0.002, col=glow, pat_name=pat_name, mat=MAT.GLOW, emis=strength, uv_fn=uv, edges=False)
    g.occluder = False
    return g


def wall_with_windows(w, h, windows, col='#d98a52', pat_name='wood', glow='#ffcf7a', strength=2.6, frame_col='#f3e6cc', door=None):
    """Wall in XY (bottom-centre at origin), facing +Z. windows: list of loops. door: loop or None."""
    outer = kit.rect(w, h, c=(0, h / 2))
    holes = list(windows) + ([door] if door is not None else [])
    g = [kit.slab([outer] + holes, thick=WALL_T, col=col, pat_name=pat_name, uv_scale=5.0)]
    for L in windows:
        pane = window_pane(L, glow, strength)
        pane.xf(t=(0, 0, -WALL_T * 0.6))
        g.append(pane)
        fr = frame_ring(L, col=frame_col)
        fr.xf(t=(0, 0, WALL_T * 0.6))
        g.append(fr)
        # Sill.
        lo = L.min(axis=0)
        hi = L.max(axis=0)
        sill = kit.box(hi[0] - lo[0] + 0.026, 0.008, 0.022, c=((lo[0] + hi[0]) / 2, lo[1] - 0.012, WALL_T))
        sill.paint(frame_col)
        g.append(sill)
    if door is not None:
        pane = window_pane(door, '#ffbf66', 1.6, 'door')
        pane.xf(t=(0, 0, -WALL_T * 0.6))
        g.append(pane)
        fr = frame_ring(door, grow=0.014, col=frame_col)
        fr.xf(t=(0, 0, WALL_T * 0.6))
        g.append(fr)
    return kit.merge(g)


def storey(w, d, h, front, back=(), left=(), right=(), door=None, col='#d98a52', glow='#ffcf7a', skip_front=False):
    """Four walls and a floor plate; base centre at origin; front faces +Z."""
    parts = []
    if not skip_front:
        f = wall_with_windows(w, h, front, col=col, glow=glow, door=door)
        f.xf(t=(0, 0, d / 2))
        parts.append(f)
    b = wall_with_windows(w, h, back, col=col, glow=glow)
    b.xf(R=kit.ry(180), t=(0, 0, -d / 2))
    parts.append(b)
    l_ = wall_with_windows(d, h, left, col=col, glow=glow)
    l_.xf(R=kit.ry(-90), t=(-w / 2, 0, 0))
    parts.append(l_)
    r_ = wall_with_windows(d, h, right, col=col, glow=glow)
    r_.xf(R=kit.ry(90), t=(w / 2, 0, 0))
    parts.append(r_)
    # Interior glow so empty rooms read as lit through every window.
    inner = kit.box(w - 0.03, h - 0.02, d - 0.03, c=(0, 0.01, 0))
    inner.nrm = -inner.nrm
    inner.tri = inner.tri[:, ::-1].copy()
    inner.paint('#ffb45c', None, MAT.GLOW, 0.9)
    inner.occluder = False
    parts.append(inner)
    # Corner posts.
    for sx in (-1, 1):
        for sz in (-1, 1):
            post = kit.box(0.014, h, 0.014, c=(sx * w / 2, 0, sz * d / 2))
            post.paint('#a95f36')
            parts.append(post)
    trim = kit.box(w + 0.02, 0.012, d + 0.02, c=(0, h - 0.006, 0))
    trim.paint('#f1e2c4')
    parts.append(trim)
    return kit.merge(parts)


def skirt_roof(w_bottom, d_bottom, w_top, d_top, h, col='#3d8db0', flare=0.35, seg=6):
    """Flared pagoda skirt between storeys: rectangle eaves rising to a smaller rectangle."""
    # Build as 4 trapezoid faces with a concave flare, each a grid.
    faces = []
    corners_b = np.array([[-w_bottom / 2, d_bottom / 2], [w_bottom / 2, d_bottom / 2], [w_bottom / 2, -d_bottom / 2], [-w_bottom / 2, -d_bottom / 2]])
    corners_t = np.array([[-w_top / 2, d_top / 2], [w_top / 2, d_top / 2], [w_top / 2, -d_top / 2], [-w_top / 2, -d_top / 2]])
    for i in range(4):
        b0, b1 = corners_b[i], corners_b[(i + 1) % 4]
        t0, t1 = corners_t[i], corners_t[(i + 1) % 4]

        def f(u, v, b0=b0, b1=b1, t0=t0, t1=t1):
            bot = b0 * (1 - u) + b1 * u
            top = t0 * (1 - u) + t1 * u
            # Concave flare: horizontal position eases out, height eases in.
            vv = 1 - (1 - v) ** (1 + flare * 2)
            xz = bot * (1 - vv) + top * vv
            # Upturned corners.
            corner = (abs(u - 0.5) * 2) ** 4
            y = h * v + corner * 0.018 * (1 - v) ** 2
            return np.array([xz[0], y, xz[1]])
        g = kit.grid(f, 6, seg)
        L = np.linalg.norm(b1 - b0)
        g.uv = np.column_stack([g.uv[:, 0] * L * 9, g.uv[:, 1] * h * 9 * 1.3])
        # Outward normals.
        mid = np.array([(b0[0] + b1[0]) / 2, 0, (b0[1] + b1[1]) / 2])
        if np.mean(g.nrm @ mid) < 0:
            g.nrm = -g.nrm
            g.tri = g.tri[:, ::-1].copy()
        faces.append(kit.two_sided(g, 0.002, back_col='#2a6684'))
    r = kit.merge(faces)
    r.paint(col, 'shingle', MAT.PAPER)
    # Back faces darker, plain.
    return r


def spire(w, d, h, col='#3d8db0', flare=0.6):
    """Tall pointed roof with flared eaves, base rectangle w x d."""
    r = skirt_roof(w, d, 0.006, 0.006, h, col=col, flare=flare, seg=10)
    ball = kit.sphere(0.012, c=(0, h + 0.01, 0), seg=10, rings=6)
    ball.paint('#f4c45a', None, MAT.GOLD)
    rod = kit.tube([[0, h - 0.02, 0], [0, h + 0.07, 0]], [0.0035, 0.002], seg=6)
    rod.paint('#f4c45a', None, MAT.GOLD)
    return kit.merge([r, ball, rod])


def stairs(n, w, step_h, step_d, col='#e2a868'):
    out = []
    for i in range(n):
        s = kit.box(w, step_h * (n - i), step_d, c=(0, 0, i * step_d))
        s.paint(col, 'wood', MAT.PAPER)
        s.uv = s.uv * 3
        out.append(s)
    return kit.merge(out)


def railing(length, h, posts=6, col='#2f7f86'):
    out = []
    for i in range(posts):
        x = -length / 2 + length * i / (posts - 1)
        p = kit.box(0.008, h, 0.008, c=(x, 0, 0))
        p.paint(col)
        out.append(p)
    for y in (h * 0.5, h):
        r = kit.box(length + 0.01, 0.007, 0.01, c=(0, y - 0.0035, 0))
        r.paint(col)
        out.append(r)
    return kit.merge(out)


def picket_fence(length, h, n, col='#2f7f86'):
    out = []
    for i in range(n):
        x = -length / 2 + length * (i + 0.5) / n
        L = np.array([[-0.011, 0], [0.011, 0], [0.011, h * 0.82], [0, h], [-0.011, h * 0.82]])
        p = kit.slab([L], thick=0.006, col=col)
        p.xf(t=(x, 0, 0))
        out.append(p)
    for y in (h * 0.3, h * 0.65):
        r = kit.box(length, 0.012, 0.006, c=(0, y, -0.006))
        r.paint(col)
        out.append(r)
    return kit.merge(out)


def lantern_post(h, col='#2b3a4a', glow='#ffc66a'):
    post = kit.tube([[0, 0, 0], [0, h, 0]], [0.007, 0.005], seg=8)
    post.paint(col)
    arm = kit.tube(curve([0, h, 0], [0.04, h + 0.005, 0], bend=[0, 0.02, 0], n=6), [0.004, 0.003], seg=6)
    arm.paint(col)
    cage = kit.lathe([(0.012, 0), (0.018, 0.01), (0.016, 0.032), (0.009, 0.04)], seg=6, flat=True, sides=6)
    cage.xf(t=(0.04, h - 0.045, 0))
    cage.paint(glow, 'lantern_glass', MAT.GLOW, 3.2)
    cap = kit.lathe([(0.02, 0), (0.002, 0.016)], seg=6, flat=True, sides=6)
    cap.xf(t=(0.04, h - 0.006, 0))
    cap.paint(col)
    return kit.merge([post, arm, cage, cap])


def hills(w, h, bumps, seed, col, pat_name='hills'):
    rng = np.random.default_rng(seed)
    xs = np.linspace(-w / 2, w / 2, 60)
    ph = rng.uniform(0, 6, 3)
    ys = h * (0.6 + 0.25 * np.sin(xs / w * bumps * math.pi + ph[0]) + 0.15 * np.sin(xs / w * bumps * 2.3 * math.pi + ph[1]))
    loop = np.vstack([[[-w / 2, 0]], np.column_stack([xs, ys]), [[w / 2, 0]]])
    g = kit.slab([loop], thick=0.005, col=col, pat_name=pat_name, uv_scale=2.5)
    return g
