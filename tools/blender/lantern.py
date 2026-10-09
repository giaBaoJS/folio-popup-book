"""Chapter III: the sky in the lantern. A paper night sea with a lighthouse, a paper boat,
a hanging moon and, on the water, the moon's reflection: the way into the next scene."""
import math

import numpy as np

import kit
from kit import MAT

# The moon's reflection (portal) on a calm patch of water.
PORTAL_C = np.array([-0.2, 0.062, 0.2])
PORTAL_N = kit.norm(np.array([0.0, 0.92, 0.39]))
PORTAL_R = 0.1
MOON_C = np.array([-0.3, 0.86, -1.05])
LAMP = np.array([0.82, 0.0, -0.62])  # lighthouse base; lamp height added below
BOAT = np.array([0.4, 0.025, 0.43])

# Wave rows, front to back: z, crest height, body colour, crest colour, half width, period.
ROWS = [
    (1.05, 0.17, '#161b4a', '#5f7fc0', 2.4, 0.34),
    (0.86, 0.15, '#173a5e', '#6fb2c6', 2.4, 0.32),
    (0.68, 0.13, '#1f2f6c', '#86a6d8', 2.4, 0.3),
    (0.5, 0.115, '#1b4a6e', '#86c8d2', 2.4, 0.28),
    (0.36, 0.1, '#25417f', '#9cbce0', 2.4, 0.27),
    (0.04, 0.09, '#215c7a', '#a3dadb', 2.45, 0.26),
    (-0.14, 0.085, '#2b5590', '#b1d0e8', 2.5, 0.25),
    (-0.33, 0.08, '#2a6c86', '#b3e3df', 2.55, 0.24),
    (-0.53, 0.075, '#336a98', '#c1def0', 2.6, 0.23),
    (-0.75, 0.07, '#367f92', '#c4ece4', 2.7, 0.22),
    (-0.98, 0.065, '#4580a6', '#d1e8f2', 2.8, 0.21),
    (-1.22, 0.06, '#4c929e', '#d8f2ea', 2.9, 0.2),
]
WAVE_BOTTOM = -0.12


def disc_uv(r, c=(0, 0)):
    return lambda p: (p - np.asarray(c)) / (2 * r) + 0.5


# ---------------------------------------------------------------- wave outlines

def scallop(xa, xb, ya, yb, h, n=8):
    """A rounded swell from (xa, ya) to (xb, yb), rising h, its peak leaning forward (+x)."""
    t = np.linspace(0, 1, n + 1)[1:]
    x = xa + (xb - xa) * t
    y = ya + (yb - ya) * t + h * np.sin(math.pi * t ** 1.25) ** 1.4
    return list(zip(x, y))


def curl_crest(xa, xb, ya, yb, h):
    """A breaking crest curling towards +x, from trough (xa, ya) to trough (xb, yb)."""
    xc = xa + (xb - xa) * 0.42
    top = max(ya, yb) + h
    R = min(h * 0.34, (xb - xa) * 0.22)
    cy = top - R
    pts = []
    # Back slope up to the left side of the curl (vertical tangent at the end).
    for t in np.linspace(0, 1, 7)[1:]:
        x = xa + (xc - R - xa) * t
        y = ya + (cy - ya) * (t ** 1.6)
        pts.append((x, y))
    # Outer lip: over the top and down the front, ending in the curled tip.
    for a in np.radians(np.linspace(180, -60, 15))[1:]:
        pts.append((xc + R * math.cos(a), cy + R * math.sin(a)))
    # Inner lip back up and over (the hollow of the curl).
    ri = R * 0.48
    for a in np.radians(np.linspace(-60, 195, 12)):
        pts.append((xc + R * 0.1 + ri * math.cos(a), cy + ri * math.sin(a)))
    # The face: below the tip, down to the next trough.
    tip_y = cy + R * math.sin(math.radians(-60))
    face = [(xc - R * 0.25, cy - R * 0.95), (xc + R * 0.4, tip_y - R * 0.45), (xc + R * 1.25, tip_y - R * 0.7)]
    pts += face
    xf0, yf0 = face[-1]
    for t in np.linspace(0, 1, 5)[1:]:
        pts.append((xf0 + (xb - xf0) * t, yf0 + (yb - yf0) * (1 - (1 - t) ** 2)))
    return pts


def wave_loop(half_w, h0, period, seed, calm=None, curl_rate=0.33, bottom=WAVE_BOTTOM, mirror=False):
    rng = np.random.default_rng(seed)
    xs = [-half_w]
    while xs[-1] < half_w:
        xs.append(xs[-1] + period * rng.uniform(0.75, 1.25))
    xs[-1] = half_w
    trough = lambda: rng.uniform(0.0, 0.015)
    ys = [trough() for _ in xs]
    pts = [(xs[0], ys[0])]
    for i in range(len(xs) - 1):
        xa, xb = xs[i], xs[i + 1]
        xm = (xa + xb) / 2
        k = 1.0 if calm is None else calm(-xm if mirror else xm)
        h = h0 * rng.uniform(0.7, 1.15) * k
        if h > h0 * 0.62 and rng.uniform() < curl_rate and xb - xa > period * 0.8:
            pts += curl_crest(xa, xb, ys[i], ys[i + 1], h)
        else:
            pts += scallop(xa, xb, ys[i], ys[i + 1], h * 0.85, n=9 if h > 0.03 else 5)
    loop = np.array(pts + [(half_w, bottom), (-half_w, bottom)])
    if mirror:
        loop[:, 0] *= -1
    return loop


def dips_fn(dips):
    """Height factor along x: 1 everywhere except gaussian dips [(x, width, depth)]."""
    def f(x):
        k = 1.0
        for cx, w, d in dips:
            k *= 1.0 - d * math.exp(-((x - cx) / w) ** 2)
        return k
    return f


def crest_y(loop, x, win=0.012):
    top = loop[:-2]
    sel = top[np.abs(top[:, 0] - x) < win]
    return float(sel[:, 1].min()) if len(sel) else 0.0


def glint(w, col='#fff1c4', emis=1.6):
    lens = np.array([[-w, 0], [-w * 0.45, 0.0045], [w * 0.45, 0.0045], [w, 0], [w * 0.45, -0.0045], [-w * 0.45, -0.0045]])
    g = kit.slab([lens], thick=0.002, col=col, mat=MAT.GLOW, emis=emis, edges=False)
    g.occluder = False
    return g


def wave_strip(loop, body, crest, z, uv_seed=0.0, path_k=0.0):
    uv = lambda p: np.column_stack([p[:, 0] * 2.4 + uv_seed, p[:, 1] * 4.8])
    front = kit.slab([loop], thick=0.006, col=body, pat_name='waves', uv_fn=uv, edge_col='#e8f2f0')
    # Deeper colour towards the water line, lighter under the crest.
    b = kit.hexc(body)
    hmax = max(float(loop[:, 1].max()), 0.03)
    t = np.clip(front.pos[:, 1] / hmax, 0, 1)[:, None] ** 0.9
    face = front.mat != MAT.EDGE
    front.col[face] = (b * 0.55 + (np.minimum(b * 1.35 + 0.03, 1) - b * 0.55) * t)[face]
    front.xf(t=(0, 0, z))
    # A pale layer glued behind, peeking above the crest line: the foam.
    foam = kit.slab([loop], thick=0.004, col=crest, pat_name='waves', uv_fn=uv, edges=False)
    # Moonlight on the water: crests under the moon turn cream.
    k = np.exp(-((foam.pos[:, 0] - (PORTAL_C[0] - 0.04)) / 0.2) ** 2)[:, None] * path_k
    foam.col = foam.col * (1 - k) + kit.hexc('#fff0c8') * k
    foam.emis = 0.9 * k[:, 0]
    kf = 0.35 * np.exp(-((front.pos[:, 0] - (PORTAL_C[0] - 0.04)) / 0.2) ** 2)[:, None] * path_k
    front.col[face] = (front.col * (1 - kf) + np.array([0.55, 0.62, 0.85]) * kf)[face]
    front.emis[face] = 0.25 * kf[:, 0][face]
    foam.xf(t=(0.005, 0.008, z - 0.007))
    return [front, foam]


# ---------------------------------------------------------------- props

def string(a, b, r=0.0014, col='#c9b78f'):
    s = kit.tube([a, b], [r, r], seg=4, cap=False)
    s.paint(col)
    s.occluder = False
    return s


def star_shape(r, points=5, inner=0.45, n_per=6):
    pts = []
    for k in range(points * 2):
        a = math.pi / 2 + k * math.pi / points
        rr = r if k % 2 == 0 else r * inner
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    return np.array(pts)


def rock_blob(r, seed, squash=0.7, col='#5a6386'):
    g = kit.sphere(r, seg=12, rings=7, squash=squash)
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0, 10, 3)

    def f(p):
        d = np.sin(p[:, 0] * 31 + ph[0]) * np.sin(p[:, 1] * 27 + ph[1]) * np.sin(p[:, 2] * 23 + ph[2])
        k = 1 + 0.18 * d
        q = p * k[:, None]
        lo = -r * 0.15
        q[:, 1] = np.where(q[:, 1] < lo, lo + (q[:, 1] - lo) * 0.08, q[:, 1])
        return q
    g.deform(f)
    g.uv = np.column_stack([g.pos[:, 0] + g.pos[:, 2], g.pos[:, 1]]) * 3.0
    g.paint(col, 'rocks', MAT.PAPER)
    return g


def rock_flat(w, h, seed, col):
    """A cut-paper crag silhouette (layered rock), base at y=0, facing +Z."""
    rng = np.random.default_rng(seed)
    n = 9
    xs = np.linspace(-w / 2, w / 2, n)
    ys = h * (0.45 + 0.55 * np.sin(np.linspace(0, math.pi, n)) ** 0.7) * rng.uniform(0.75, 1.1, n)
    ys[0] = h * 0.15
    ys[-1] = h * 0.1
    top = [(x, y) for x, y in zip(xs, ys)]
    # Faceted: insert a notch between peaks.
    pts = []
    for i, p in enumerate(top):
        pts.append(p)
        if i < n - 1:
            pts.append(((p[0] + top[i + 1][0]) / 2 + rng.uniform(-0.01, 0.01), min(p[1], top[i + 1][1]) * rng.uniform(0.82, 0.95)))
    loop = np.array(pts + [(w / 2, -0.06), (-w / 2, -0.06)])
    return kit.slab([loop], thick=0.008, col=col, pat_name='rocks', uv_scale=2.2, edge_col='#d9dbe6')


def lighthouse(base_y):
    out = []
    H = 0.5
    prof = [(0.078, 0.0), (0.074, 0.06), (0.066, H * 0.5), (0.056, H - 0.02), (0.058, H)]
    tower = kit.lathe(prof, seg=28)
    tower.uv = np.column_stack([tower.uv[:, 0] * 1.4, tower.uv[:, 1] * 9.0])
    tower.paint('#ffffff', 'lighthouse', MAT.PAPER)
    out.append(tower)
    # Plinth.
    pl = kit.lathe([(0.1, -0.02), (0.1, 0.02), (0.085, 0.035)], seg=20, cap_top=True)
    pl.paint('#8a90a8', 'rocks', MAT.PAPER)
    pl.uv = pl.uv * 3
    out.append(pl)
    # Door and windows on the front (+Z), glowing.
    door = kit.slab([kit.arch(0.03, 0.05, c=(0, 0))], thick=0.003, col='#ffc46a', mat=MAT.GLOW, emis=1.4, edges=False)
    door.xf(R=kit.rx(-3), t=(0, 0.03, 0.0755))
    door.occluder = False
    out.append(door)
    for y, r in ((0.2, 0.068), (0.33, 0.063)):
        w = kit.slab([kit.arch(0.018, 0.03, c=(0, 0))], thick=0.003, col='#ffd27a', mat=MAT.GLOW, emis=1.8, edges=False)
        w.xf(R=kit.rx(-3), t=(0.0, y, r + 0.001))
        w.occluder = False
        out.append(w)
        fr = kit.slab([kit.arch(0.026, 0.036, c=(0, -0.004)), kit.arch(0.018, 0.03, c=(0, 0))], thick=0.004, col='#f4ead6')
        fr.xf(R=kit.rx(-3), t=(0.0, y, r + 0.002))
        out.append(fr)
    # Gallery deck, railing.
    deck = kit.slab([kit.circle(0.095, n=28)], thick=0.012, col='#2f3a52', edge_col='#c9cbd6')
    deck.xf(R=kit.rx(-90), t=(0, H + 0.006, 0))
    out.append(deck)
    for k in range(16):
        a = 2 * math.pi * k / 16
        p = np.array([0.088 * math.cos(a), H + 0.012, 0.088 * math.sin(a)])
        post = kit.tube([p, p + [0, 0.035, 0]], [0.0022, 0.0022], seg=4, cap=False)
        post.paint('#2f3a52')
        out.append(post)
    ring = [[0.088 * math.cos(a), H + 0.047, 0.088 * math.sin(a)] for a in np.linspace(0, 2 * math.pi, 33)]
    rail = kit.tube(ring, [0.0025] * 33, seg=4, cap=False)
    rail.paint('#2f3a52')
    out.append(rail)
    # Lantern room: glowing glazing, a bright lamp inside.
    room = kit.lathe([(0.046, H + 0.012), (0.046, H + 0.085)], seg=16, sides=8, flat=True)
    room.uv = np.column_stack([room.uv[:, 0] * 1.0, room.uv[:, 1] * 13])
    room.paint('#ffffff', 'lantern_e', MAT.GLOW, 2.2)
    room.occluder = False
    out.append(room)
    roof = kit.lathe([(0.062, H + 0.085), (0.056, H + 0.095), (0.022, H + 0.135), (0.006, H + 0.15)], seg=20)
    roof.paint('#c8473c')
    out.append(roof)
    rim = kit.lathe([(0.064, H + 0.083), (0.064, H + 0.09)], seg=20)
    rim.paint('#f1c86a', None, MAT.GOLD)
    out.append(rim)
    ball = kit.sphere(0.012, c=(0, H + 0.162, 0), seg=10, rings=6)
    ball.paint('#f4c45a', None, MAT.GOLD)
    out.append(ball)
    vane = kit.tube([[0, H + 0.15, 0], [0, H + 0.21, 0]], [0.002, 0.0015], seg=5)
    vane.paint('#f4c45a', None, MAT.GOLD)
    out.append(vane)
    g = kit.merge(out)
    g.xf(t=(0, base_y, 0))
    lamp = np.array([0, base_y + H + 0.05, 0])
    return g, lamp


def cottage():
    """The keeper's cottage: whitewashed walls, a blue roof, one warm window. Base at origin."""
    out = []
    w, h, d = 0.09, 0.055, 0.06
    body = kit.box(w, h, d)
    body.paint('#e6dcc6')
    out.append(body)
    gable = kit.slab([np.array([[-w / 2, h], [w / 2, h], [0, h + 0.035]])], thick=d, col='#e6dcc6', edge_col='#e6dcc6')
    out.append(gable)
    for s in (-1, 1):
        L = math.hypot(w / 2 + 0.01, 0.04)
        roof = kit.box(L, 0.006, d + 0.016)
        roof.xf(R=kit.rz(s * math.degrees(math.atan2(0.04, w / 2 + 0.01))), t=(s * (w / 4 + 0.004), h + 0.016, 0))
        roof.paint('#355a8c')
        out.append(roof)
    win = kit.slab([kit.rect(0.018, 0.02, c=(0.018, h * 0.5))], thick=0.002, col='#ffd27a', mat=MAT.GLOW, emis=2.2, edges=False)
    win.xf(t=(0, 0, d / 2 + 0.001))
    win.occluder = False
    out.append(win)
    door = kit.slab([kit.arch(0.016, 0.032, c=(-0.02, 0))], thick=0.002, col='#5a3a2a', edges=False)
    door.xf(t=(0, 0, d / 2 + 0.001))
    out.append(door)
    ch = kit.box(0.012, 0.03, 0.012, c=(0.025, h + 0.02, -0.01))
    ch.paint('#8a6f9e')
    out.append(ch)
    return kit.merge(out)


def lamp_core(c):
    s = kit.sphere(0.026, c=c, seg=12, rings=8)
    s.paint('#fff4cf', None, MAT.GLOW, 4.0)
    s.occluder = False
    return s


def beam_cone(length=0.95, r1=0.17):
    """A soft cone of light along +X from the origin (volumetric, additive)."""
    def f(u, v):
        a = u * 2 * math.pi
        r = 0.014 + (r1 - 0.014) * v
        return np.array([v * length, r * math.cos(a), r * math.sin(a)])
    g = kit.grid(f, 24, 10, uv_fn=lambda U, V: np.stack([U, V], -1), wrap_u=True)
    g.paint('#ffe7b0', None, MAT.LIGHT, 1.1)
    g.occluder = False
    return g


def paper_boat():
    """Origami boat: two slanted hull sides, folded end points and a centre sail, along +X."""
    out = []
    L, Lb, Hh = 0.11, 0.06, 0.045
    for s in (-1, 1):
        loop = np.array([[-Lb, 0], [Lb, 0], [L, Hh], [-L, Hh]])
        side = kit.slab([loop], thick=0.003, col='#f6ecd6', pat_name='sail', uv_fn=lambda p: np.column_stack([p[:, 0] / (2 * L) + 0.5, 0.38 - p[:, 1] / Hh * 0.3]), edge_col='#fff8e8')
        side.xf(R=kit.rx(s * 28), t=(0, 0, s * 0.002))
        out.append(side)
    # Keel strip and the folded bow/stern triangles.
    keel = kit.box(2 * Lb, 0.004, 0.012, c=(0, -0.002, 0))
    keel.paint('#e9dcbf')
    out.append(keel)
    for s in (-1, 1):
        tri = np.array([[s * Lb, 0], [s * L, Hh], [s * (L - 0.02), Hh]])
        t = kit.slab([tri], thick=0.002, col='#e8d9b8', edges=False)
        out.append(t)
    sail = np.array([[-0.05, Hh * 0.6], [0.05, Hh * 0.6], [0.0, Hh + 0.085]])
    sl = kit.slab([sail], thick=0.004, col='#ffffff', pat_name='sail', uv_fn=lambda p: np.column_stack([p[:, 0] / 0.1 + 0.5, 1 - (p[:, 1] - Hh * 0.6) / 0.11]), edge_col='#fff8e8')
    out.append(sl)
    # Tiny lantern on a mast at the stern.
    mast = kit.tube([[-0.07, Hh * 0.7, 0], [-0.075, Hh + 0.055, 0]], [0.0018, 0.0015], seg=5)
    mast.paint('#6b4a32')
    out.append(mast)
    arm = kit.tube([[-0.075, Hh + 0.052, 0], [-0.093, Hh + 0.05, 0]], [0.0013, 0.0013], seg=4, cap=False)
    arm.paint('#6b4a32')
    out.append(arm)
    lan = kit.lathe([(0.006, 0), (0.009, 0.006), (0.008, 0.016), (0.004, 0.019)], seg=6, flat=True, sides=6)
    lan.xf(t=(-0.093, Hh + 0.018, 0))
    lan.paint('#ffcf7a', None, MAT.GLOW, 3.5)
    lan.occluder = False
    out.append(lan)
    cap = kit.lathe([(0.01, 0), (0.002, 0.008)], seg=6, flat=True, sides=6)
    cap.xf(t=(-0.093, Hh + 0.037, 0))
    cap.paint('#3a2a24')
    out.append(cap)
    thread = string([-0.093, Hh + 0.045, 0], [-0.093, Hh + 0.037, 0], r=0.0008, col='#3a2a24')
    out.append(thread)
    return kit.merge(out), np.array([-0.093, Hh + 0.027, 0])


def cloud(w, h, k, col, z_layers=2, seed=0, back='#e7c3cf'):
    rng = np.random.default_rng(seed)
    out = []
    for j in range(z_layers):
        kk = (k + j) % 4
        c = kit.card(w * (1 - 0.18 * j), h * (1 - 0.15 * j), 'clouds', col, nu=4, nv=1, anchor=(0.5, 0.5),
                     bend=lambda u, v: 0.03 * math.sin(u * math.pi))
        c.uv = np.column_stack([c.uv[:, 0], (kk + (1 - c.uv[:, 1]) * 0.97 + 0.015) / 4.0])
        if j > 0:
            c.paint(back)
        c.xf(t=(rng.uniform(-0.05, 0.05) * j, 0.03 * j, -0.035 * j))
        out.append(c)
    return kit.merge(out)


# ---------------------------------------------------------------- scene

def build_scene():
    scene = kit.Scene('lantern', ao_dist=0.12, ao_strength=0.8)
    rng = np.random.default_rng(3)

    # The water under the waves.
    def fsea(u, v):
        return np.array([(u - 0.5) * 10.0, 0.0, 1.5 - v * 4.0])
    sea = kit.grid(fsea, 30, 18)
    if np.mean(sea.nrm[:, 1]) < 0:
        sea.nrm = -sea.nrm
        sea.tri = sea.tri[:, ::-1].copy()
    sea.uv = np.column_stack([sea.pos[:, 0] * 1.6, sea.pos[:, 2] * 3.0])
    sea.paint('#141c48', 'lantern_d', MAT.PAPER)
    scene.part('sea', role='static').add(sea)

    # Wave rows (each an actor that slides and bobs).
    for i, (z, h, body, crest, hw, per) in enumerate(ROWS):
        dips = []
        if abs(z - PORTAL_C[2]) < 0.35:
            dips.append((PORTAL_C[0], 0.3, 0.85))
        elif z < PORTAL_C[2]:
            dips.append((PORTAL_C[0] - 0.05, 0.22, 0.4))
        if 0 < z - BOAT[2] < 0.15:
            dips.append((BOAT[0], 0.16, 0.6))
        loop = wave_loop(hw, h, per, seed=100 + i, calm=dips_fn(dips), mirror=(i % 2 == 1))
        p = scene.part(f'wave{i}', pivot=(0, 0, z), role='actor')
        p.add(*wave_strip(loop, body, crest, z, uv_seed=i * 0.37, path_k=float(np.clip((PORTAL_C[2] + 0.2 - z) / 0.4, 0, 1)) * 0.85))
        # The moon path: glints on the crests between the reflection and the horizon.
        if z < PORTAL_C[2] - 0.05:
            t = (PORTAL_C[2] - z) / 1.45
            for k in range(3):
                gx = PORTAL_C[0] - 0.06 * t + rng.uniform(-0.07, 0.07) * (1 - 0.5 * t)
                gy = crest_y(loop, gx) - 0.006 - k * 0.011
                if gy < 0.012:
                    continue
                gl = glint(0.05 * (1 - 0.5 * t) * rng.uniform(0.6, 1.1) * (1 - 0.35 * k))
                gl.xf(t=(gx + rng.uniform(-0.02, 0.02) * k, gy, z + 0.006))
                p.add(gl)

    # Horizon: a pale low strip and far islands.
    hz = wave_loop(5.0, 0.03, 0.2, seed=77, curl_rate=0.0)
    hor = kit.slab([hz], thick=0.004, col='#8cc0bf', pat_name='waves', uv_fn=lambda p: np.column_stack([p[:, 0] * 2.4, p[:, 1] * 4.8]), edges=False)
    hor.xf(t=(0, 0, -1.6))
    isl = []
    for x, w, h, col in ((-1.35, 0.7, 0.16, '#3f5a8a'), (-0.95, 0.45, 0.1, '#4a6a96'), (1.5, 0.9, 0.2, '#3f5a8a'), (0.3, 0.3, 0.06, '#56779d'), (-2.4, 1.2, 0.22, '#3a5486'), (2.6, 1.3, 0.18, '#3a5486')):
        r = rock_flat(w, h, seed=int(abs(x) * 10), col=col)
        r.xf(t=(x, 0, -1.75))
        r.paint(None, None, MAT.INK)
        isl.append(r)
    scene.part('horizon', role='static').add(hor, *isl)

    # The lighthouse island.
    out = []
    lx, lz = LAMP[0], LAMP[2]
    for j, (dx, dz, w, h, col) in enumerate([(-0.02, -0.12, 0.5, 0.2, '#4b5478'), (0.06, -0.04, 0.42, 0.16, '#5a6386'),
                                             (-0.08, 0.06, 0.36, 0.12, '#666f92'), (0.12, 0.1, 0.24, 0.08, '#7179a0')]):
        r = rock_flat(w, h, seed=11 + j, col=col)
        r.xf(R=kit.ry(rng.uniform(-10, 10)), t=(lx + dx, 0, lz + dz))
        out.append(r)
    for j in range(9):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(0.08, 0.2)
        b = rock_blob(rng.uniform(0.035, 0.07), seed=j, col=['#5a6386', '#6b739a', '#4f587c'][j % 3])
        b.xf(t=(lx + math.cos(a) * d * 1.3, 0.0, lz + math.sin(a) * d * 0.8 + 0.04))
        out.append(b)
    lh, lamp = lighthouse(0.13)
    lh.xf(t=(lx, 0, lz))
    lamp = lamp + np.array([lx, 0, lz])
    out.append(lh)
    out.append(lamp_core(lamp))
    ck = cottage()
    ck.xf(R=kit.ry(12), t=(lx - 0.17, 0.085, lz + 0.03))
    out.append(ck)
    under = rock_blob(0.075, seed=99, col='#5a6386')
    under.xf(t=(lx - 0.17, 0.02, lz + 0.03), s=(1.3, 1.0, 1.0))
    out.append(under)
    scene.part('island', role='static').add(*out)
    # Grass tufts / seaweed on the island: small cut-paper strips.
    beam = scene.part('beam', pivot=tuple(lamp), axis=(0, 1, 0), role='actor')
    for s in (0, 180):
        b = beam_cone()
        b.xf(R=kit.ry(s), t=lamp)
        beam.add(b)

    # Rocks in the wings (stage left / right) so the orbit never sees an empty edge.
    for name, x, z, cols in (('wing_l', -1.25, 0.72, ('#2c3560', '#38427a', '#46508a')), ('wing_r', 1.3, 0.55, ('#2c3560', '#38427a', '#46508a'))):
        out = []
        for j, (dx, dz, w, h) in enumerate([(0.0, -0.1, 0.6, 0.42), (0.12, 0.0, 0.5, 0.3), (-0.08, 0.1, 0.4, 0.18)]):
            r = rock_flat(w, h, seed=31 + j + int(x * 10), col=cols[j])
            r.xf(R=kit.ry(rng.uniform(-14, 14)), t=(x + dx * np.sign(x), 0, z + dz))
            out.append(r)
        for j in range(5):
            b = rock_blob(rng.uniform(0.04, 0.08), seed=40 + j, col=cols[1])
            b.xf(t=(x + rng.uniform(-0.25, 0.25), 0, z + rng.uniform(0.05, 0.2)))
            out.append(b)
        scene.part(name, role='static').add(*out)

    # The paper boat.
    bt, blamp = paper_boat()
    bt.xf(R=kit.ry(-18), t=BOAT)
    blamp = kit.ry(-18) @ blamp + BOAT
    scene.part('boat', pivot=tuple(BOAT), axis=(0, 0, 1), role='actor', lamp=[round(float(v), 4) for v in blamp]).add(bt)

    # Far away, more little boats carry their lights home.
    for i, (x, z, ry_, sc) in enumerate([(-0.95, -0.42, 20, 0.55), (-0.62, -0.88, -30, 0.45), (0.18, -0.64, 160, 0.5), (1.25, -0.25, 200, 0.6)]):
        b2, _ = paper_boat()
        b2.xf(R=kit.ry(ry_), t=(x, 0.03, z), s=sc)
        p = scene.part(f'boat_far{i}', pivot=(x, 0.03, z), axis=(0, 0, 1), role='actor')
        p.add(b2)

    # Leaping fish: each lives between two rows of waves and jumps out on its own rhythm.
    # The runtime moves them along a parabola (see FISH in scene_lantern.ts); a crown of
    # paper droplets splashes where they leave and re-enter the water.
    FISH = [(-1.1, 0.6, 2.0), (-0.6, -0.04, 1.5), (0.18, 0.61, 1.8), (0.98, 0.27, 1.6),
            (-0.98, -0.43, 1.3), (0.5, -0.24, 1.4), (1.42, 0.58, 1.9), (-0.12, -0.64, 1.2)]
    for i, (x, z, sc) in enumerate(FISH):
        fp = np.array([x, -0.06, z])
        fish = kit.card(0.095 * sc, 0.0475 * sc, 'lantern_b', ['#ffffff', '#ffe2c8', '#e8f4ff', '#fff0d0'][i % 4], anchor=(0.5, 0.5))
        fish.uv[:, 1] = 1 - fish.uv[:, 1]
        fish.xf(t=fp)
        scene.part(f'fish{i}', pivot=tuple(fp), axis=(0, 0, 1), role='actor', fish=[float(x), float(z), float(sc)]).add(fish)
        drops = []
        rng_ = np.random.default_rng(40 + i)
        for k in range(9):
            a = 2 * math.pi * k / 9 + rng_.uniform(-0.2, 0.2)
            rr = 0.028 * sc
            d = kit.slab([kit.polar(lambda t_: 0.0045 * sc * (1 + 0.6 * max(0.0, math.sin(t_))), n=14)], thick=0.002, col='#cdeaf8', emis=0.12, edge_col='#eaf6ff')
            d.xf(R=kit.rz(math.degrees(a) - 90), t=(x + rr * math.cos(a), 0.012 * sc + rr * 0.6 * abs(math.sin(a)), z + rr * 0.35 * math.sin(a)))
            drops.append(d)
        foam = kit.slab([kit.circle(0.022 * sc, n=28, rx_=0.036 * sc), kit.circle(0.016 * sc, n=28, rx_=0.027 * sc)], thick=0.002, col='#9fcbe6', emis=0.06, edge_col='#d6ecf8')
        foam.xf(R=kit.rx(-90), t=(x, 0.0, z))
        drops.append(foam)
        sp = scene.part(f'splash{i}', pivot=(x, 0.0, z), axis=(0, 1, 0), role='actor')
        sp.add(*drops)

    # The moon on two strings, with a lace halo.
    out = []
    moon = kit.slab([kit.circle(0.15, n=56)], thick=0.008, col='#fff1c4', pat_name='moon', mat=MAT.GLOW, emis=1.15,
                    uv_fn=disc_uv(0.15), edge_col='#fff6dc')
    moon.xf(t=MOON_C)
    out.append(moon)
    halo = kit.card(0.44, 0.44, 'lantern_c', '#e8ebff', mat=MAT.GLOW, emis=0.42, anchor=(0.5, 0.5))
    halo.xf(t=MOON_C + np.array([0, 0, -0.03]))
    out.append(halo)
    for dx in (-0.07, 0.07):
        out.append(string(MOON_C + [dx, 0.13, -0.004], MOON_C + [dx * 1.6, 1.4, -0.004]))
    top = MOON_C + np.array([0, 1.4, 0])
    scene.part('moon', pivot=tuple(top), axis=(0, 0, 1), role='actor').add(*out)

    # Hanging stars.
    stars = [(-1.0, 0.95, -1.2, 0.035), (-0.72, 1.18, -1.3, 0.026), (0.12, 1.12, -1.25, 0.03), (0.42, 0.9, -1.35, 0.022),
             (1.15, 1.2, -1.1, 0.032), (-1.25, 0.7, -0.95, 0.024), (0.62, 1.25, -1.0, 0.025), (-0.1, 0.72, -1.4, 0.018)]
    for i, (x, y, z, r) in enumerate(stars):
        st = kit.slab([star_shape(r)], thick=0.004, col='#ffe9a8', pat_name='star', mat=MAT.GLOW, emis=1.6,
                      uv_fn=disc_uv(r), edge_col='#fff3cf')
        st.xf(R=kit.rz(rng.uniform(-20, 20)), t=(x, y, z))
        top = (x, y + 1.4, z)
        p = scene.part(f'star{i}', pivot=top, axis=(0, 0, 1), role='actor')
        p.add(st, string((x, y + r * 0.9, z), top, r=0.001))

    # Clouds hanging like stage flats.
    clouds = [(-0.95, 0.98, -0.85, 0.62, 0.17, 0, '#cfc9ee', '#e9c0cc'), (0.2, 1.08, -1.15, 0.7, 0.18, 1, '#c6c2ea', '#a9a6dc'),
              (1.05, 1.05, -0.95, 0.6, 0.16, 2, '#d8cdee', '#f0c3b6'), (-0.4, 1.22, -1.5, 0.55, 0.14, 3, '#b8b7e2', '#d7b6d2'),
              (0.62, 0.78, -1.55, 0.5, 0.12, 1, '#a9b0de', '#e2bfc6')]
    for i, (x, y, z, w, h, k, col, back) in enumerate(clouds):
        c = cloud(w, h, k, col, z_layers=2, seed=i, back=back)
        c.xf(t=(x, y, z))
        top = (x, y + 1.4, z)
        p = scene.part(f'cloud{i}', pivot=top, axis=(0, 0, 1), role='actor')
        p.add(c)
        for dx in (-w * 0.3, w * 0.3):
            p.add(string((x + dx, y + h * 0.3, z - 0.002), (x + dx, y + 1.4, z - 0.002)))

    # Gulls on wires.
    for i, (x, y, z, k) in enumerate([(0.55, 0.62, -0.6, 0), (0.38, 0.7, -0.75, 1)]):
        g = kit.card(0.15, 0.075, 'lantern_f', '#ffffff', anchor=(0.5, 0.5))
        g.uv = np.column_stack([(g.uv[:, 0] + k) / 2.0, 1 - g.uv[:, 1]])
        g.xf(R=kit.ry(10), t=(x, y, z))
        top = (x, y + 1.4, z)
        p = scene.part(f'gull{i}', pivot=top, axis=(0, 0, 1), role='actor')
        p.add(g, string((x, y + 0.006, z), top, r=0.0008))

    # Ripple rings around the reflection, lying on the water.
    out = []
    for j, (r0, a0, a1) in enumerate([(0.15, 200, 340), (0.15, 20, 160), (0.2, 215, 330), (0.2, 30, 150), (0.26, 225, 315)]):
        a = np.radians(np.linspace(a0, a1, 18))
        outer = np.column_stack([np.cos(a) * (r0 + 0.008) * 1.3, np.sin(a) * (r0 + 0.008)])
        inner = np.column_stack([np.cos(a[::-1]) * r0 * 1.3, np.sin(a[::-1]) * r0])
        ring = kit.slab([np.vstack([outer, inner])], thick=0.002, col='#cfe6ea', mat=MAT.GLOW, emis=0.5, edges=False)
        ring.xf(R=kit.rx(-90), t=(PORTAL_C[0], 0.004 + j * 0.0005, PORTAL_C[2] - 0.02))
        ring.occluder = False
        out.append(ring)
    scene.part('ripples', role='static').add(*out)

    # THE PORTAL: the moon's reflection.
    tilt = -math.degrees(math.asin(PORTAL_N[1]))
    disc = kit.slab([kit.circle(PORTAL_R, n=48)], thick=0.003, col='#fff1c4', mat=MAT.PORTAL, emis=1.2,
                    uv_fn=disc_uv(PORTAL_R), edges=False)
    disc.occluder = False
    disc.xf(R=kit.rx(tilt), t=PORTAL_C)
    # A pale paper rim, outside the disc radius, a hair behind it.
    rim = kit.slab([kit.circle(PORTAL_R + 0.012, n=48), kit.circle(PORTAL_R - 0.001, n=48)], thick=0.003, col='#f6e7b8', mat=MAT.GOLD, edge_col='#fff6dc')
    rim.xf(R=kit.rx(tilt), t=PORTAL_C - PORTAL_N * 0.003)
    p = scene.part('portal', pivot=tuple(PORTAL_C), role='static',
                   portal=dict(center=[round(float(v), 4) for v in PORTAL_C + PORTAL_N * 0.0016], normal=[round(float(v), 4) for v in PORTAL_N], radius=PORTAL_R))
    p.add(disc, rim)

    return scene


CAMS = [((0.0, 0.95, 2.5), (0.0, 0.32, -0.25), 33, 'hero')]
