"""Chapter II: the reading room at the top of the Lantern House tower.

Mira reads to her sleeping fox Ember by the light of Grandma's brass lantern. The room is an
A-frame attic (ridge along Z) seen from the round window we came through (behind the camera).
The lantern's round front lens is the portal.
"""
import math

import numpy as np

import kit
import props
from kit import MAT

# Room shell.
W2 = 1.30        # half width at the floor
KNEE = 0.30      # knee wall height
RIDGE = 1.65     # ridge height
ZB = -1.05       # inner face of the gable wall
ZF = 3.60        # front end (behind the camera)
SLOPE_H = RIDGE - KNEE

# Side window in the gable wall (moonlight comes through it).
WX, WY, WR = 0.30, 0.72, 0.12

# Characters and the lantern.
MIRA = (-0.30, 0.04, 34.0)     # x, z, yaw (deg): she faces +Z rotated towards the fox
FOX = (0.40, 0.14, -12.0)
LAMP = (0.02, 0.24, 22.0)      # lantern on a stack of books; turned so a glowing side pane shows

WOOD = '#8a5a3c'
WOOD_D = '#6a4430'
BRASS = '#d6a24a'


# ---------------------------------------------------------------- helpers

def roof_x(y):
    return W2 * (RIDGE - y) / SLOPE_H


def orient(ch, want):
    want = np.asarray(want, dtype=np.float64)
    if np.mean(ch.nrm @ want) < 0:
        ch.nrm = -ch.nrm
        ch.tri = ch.tri[:, ::-1].copy()
    return ch


def flip_v(ch):
    ch.uv = np.column_stack([ch.uv[:, 0], 1.0 - ch.uv[:, 1]])
    return ch


def rect_uv(x0, y0, w, h, u0=0.0, u1=1.0):
    """Unique art over a rectangle (image top at the top of the rectangle)."""
    return lambda p: np.column_stack([u0 + (p[:, 0] - x0) / w * (u1 - u0), 1.0 - (p[:, 1] - y0) / h])


def disc_uv(cx, cy, r):
    return lambda p: np.column_stack([(p[:, 0] - cx) / (2 * r) + 0.5, 0.5 - (p[:, 1] - cy) / (2 * r)])


def frame_of(a, b, side):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    y = kit.norm(b - a)
    s = np.asarray(side, dtype=np.float64)
    x = kit.norm(s - y * np.dot(s, y))
    z = np.cross(x, y)
    return np.column_stack([x, y, z]), np.linalg.norm(b - a)


def beam(a, b, w, d, col=WOOD, side=(1, 0, 0), pat='wood', uvs=4.0):
    """A box from a to b with a w x d cross-section (w along `side`)."""
    R, L = frame_of(a, b, side)
    g = kit.box(w, L, d, uv_scale=uvs)
    g.xf(R=R, t=a)
    g.paint(col, pat, MAT.PAPER)
    return g


def star_loop(r, pts=5, inner=0.48, n_per=1, rot=90.0):
    out = []
    for i in range(pts * 2):
        a = math.radians(rot) + i * math.pi / pts
        rr = r if i % 2 == 0 else r * inner
        out.append([rr * math.cos(a), rr * math.sin(a)])
    return np.array(out)


def book_box(w, h, d, cover, page='#f3e7cc'):
    """A closed book lying flat: cover box plus an inset page block. Base centre at origin."""
    c = kit.box(w, h, d)
    c.paint(cover, None, MAT.CLOTH)
    p = kit.box(w - 0.006, h - 0.008, d - 0.004, c=(0.004, 0.004, 0))
    p.paint(page, None, MAT.PAPER)
    # Only the fore edges should show the pages: push the block out on +X a hair.
    p.xf(t=(0.002, 0, 0))
    return kit.merge([c, p])


def place(ch, x, z, yaw=0.0, y=0.0):
    ch.xf(R=kit.ry(yaw), t=(x, y, z))
    return ch


# ---------------------------------------------------------------- shell

def shell(scene):
    out = []
    # Floor: a fine grid so contact AO has vertices to land on.
    def ff(u, v):
        x = kit.lerp(-W2 - 0.02, W2 + 0.02, u)
        z = kit.lerp(ZB - 0.02, ZF, v)
        return np.array([x, 0.0, z])
    fl = kit.grid(ff, 46, 64)
    orient(fl, (0, 1, 0))
    fl.nrm[:] = [0, 1, 0]
    fl.uv = np.column_stack([fl.pos[:, 2], fl.pos[:, 0]]) * 1.55
    fl.paint('#ffffff', 'floorboards', MAT.PAPER)
    out.append(fl)

    # Knee walls with wallpaper and a skirting board.
    for s in (-1, 1):
        def fk(u, v, s=s):
            return np.array([s * W2, u * (KNEE + 0.08), kit.lerp(ZB - 0.02, ZF, v)])
        kw = kit.grid(fk, 3, 40)
        orient(kw, (-s, 0, 0))
        kw.uv = np.column_stack([kw.pos[:, 2], -kw.pos[:, 1]]) * 1.6
        kw.paint('#f2e6e0', 'wallpaper', MAT.PAPER)
        out.append(kw)
        sk = kit.box(0.012, 0.045, ZF - ZB, c=(s * (W2 - 0.006), 0, (ZB + ZF) / 2))
        sk.paint('#5e3b2a', 'wood', MAT.PAPER)
        out.append(sk)

    # Sloped ceiling: pale boards running along Z.
    for s in (-1, 1):
        def fr(u, v, s=s):
            x = s * W2 * (1 - u)
            y = KNEE + u * SLOPE_H
            return np.array([x * 1.02, y, kit.lerp(ZB - 0.03, ZF, v)])
        rf = kit.grid(fr, 10, 40)
        orient(rf, (-s * SLOPE_H, -W2, 0))
        rf.uv = np.column_stack([rf.pos[:, 2] * 1.4, (rf.pos[:, 1] - KNEE) * 1.9])
        rf.paint('#f0d4b8', 'floorboards', MAT.PAPER)
        out.append(rf)

    # Gable wall with the round side window.
    gw = [[-W2 - 0.06, 0], [W2 + 0.06, 0], [W2 + 0.06, KNEE - 0.03], [0, RIDGE + 0.06], [-W2 - 0.06, KNEE - 0.03]]
    hole = kit.circle(WR, n=40, c=(WX, WY))
    wall = kit.slab([np.array(gw), hole], thick=0.04, col='#f4ebe6', pat_name='wallpaper', uv_fn=lambda p: np.column_stack([p[:, 0], -p[:, 1]]) * 1.6,
                    edge_col='#e8d9c4')
    wall.xf(t=(0, 0, ZB - 0.02))
    out.append(wall)
    sk = kit.box(2 * W2, 0.045, 0.012, c=(0, 0, ZB + 0.006))
    sk.paint('#5e3b2a', 'wood', MAT.PAPER)
    out.append(sk)

    # Wall plates along the top of the knee walls (they also keep moonlight from leaking in).
    for s in (-1, 1):
        wp_ = kit.box(0.07, 0.07, ZF - ZB + 0.04, c=(s * (W2 - 0.03), KNEE - 0.045, (ZB + ZF) / 2))
        wp_.paint(WOOD_D, 'wood', MAT.PAPER)
        wp_.uv *= 4
        out.append(wp_)
    scene.part('shell', role='static').add(*out)

    # Exposed paper beams.
    bm = []
    zs = np.arange(ZB + 0.05, ZF, 0.42)
    for z in zs:
        for s in (-1, 1):
            inward = kit.norm(np.array([-s * SLOPE_H, -W2, 0.0]))
            a = np.array([s * W2, KNEE - 0.02, z]) + inward * 0.024
            b = np.array([0.0, RIDGE, z]) + inward * 0.024
            bm.append(beam(a, b, 0.05, 0.048, side=(0, 0, 1)))
            # Knee wall stud.
            st = kit.box(0.04, KNEE, 0.045, c=(s * (W2 - 0.02), 0, z))
            st.paint(WOOD, 'wood', MAT.PAPER)
            st.uv *= 4
            bm.append(st)
    # Collar ties across the A at three places.
    for z in (ZB + 0.47, ZB + 1.31, ZB + 2.15, ZB + 2.99):
        y = 1.12
        x = roof_x(y) + 0.03
        bm.append(beam([-x, y, z], [x, y, z], 0.045, 0.05, side=(0, 1, 0)))
    # Ridge beam and purlins.
    bm.append(beam([0, RIDGE - 0.05, ZB - 0.01], [0, RIDGE - 0.05, ZF], 0.07, 0.05, col=WOOD_D, side=(1, 0, 0)))
    for s in (-1, 1):
        y = 0.86
        x = roof_x(y) - 0.04
        bm.append(beam([s * x, y, ZB - 0.01], [s * x, y, ZF], 0.045, 0.045, col=WOOD_D, side=(1, 0, 0)))
    scene.part('beams', role='static').add(*bm)


def side_window(scene):
    out = []
    z = ZB
    # Frame ring and a cross of mullions.
    ring = kit.circle(WR, n=40, c=(WX, WY))
    fr = props.frame_ring(ring, grow=0.028, col='#f1e4c8', thick=0.016)
    fr.xf(t=(0, 0, z + 0.008))
    out.append(fr)
    rv = kit.slab([kit.circle(WR + 0.002, n=40, c=(WX, WY)), kit.circle(WR - 0.008, n=40, c=(WX, WY))], thick=0.05, col='#efe0c2')
    rv.xf(t=(0, 0, z - 0.02))
    out.append(rv)
    for ang in (0, 90):
        m = kit.box(0.012, 2 * WR, 0.012, c=(0, -WR, 0))
        m.xf(R=kit.rz(ang), t=(WX, WY, z - 0.03))
        m.paint('#efe0c2')
        out.append(m)
    # Sill.
    sill = kit.box(0.34, 0.016, 0.07, c=(WX, WY - WR - 0.04, z + 0.035))
    sill.paint('#e9d5b0', 'wood', MAT.PAPER)
    sill.uv *= 4
    out.append(sill)
    for sx in (-1, 1):
        br = kit.slab([np.array([[0, 0], [0.05, 0], [0, -0.05]])], thick=0.01, col='#d8bf96')
        br.xf(R=kit.ry(-90), t=(WX + sx * 0.12, WY - WR - 0.04, z + 0.002))
        out.append(br)
    # The night outside: sky card, moon and a few stars.
    sky = kit.slab([kit.circle(0.42, n=40)], thick=0.004, col='#ffffff', pat_name='attic_c', mat=MAT.GLOW, emis=1.0,
                   uv_fn=disc_uv(0, 0, 0.42), edges=False)
    sky.xf(t=(WX - 0.05, WY + 0.02, z - 0.32))
    sky.occluder = False
    out.append(sky)
    moon = kit.slab([kit.circle(0.045, n=32)], thick=0.004, col='#fff3cc', pat_name='moon', mat=MAT.GLOW, emis=2.0, uv_fn=disc_uv(0, 0, 0.045), edges=False)
    moon.xf(t=(WX + 0.07, WY + 0.07, z - 0.2))
    moon.occluder = False
    out.append(moon)
    scene.part('window', role='static').add(*out)

    # Curtains on a brass rod, tied back, with a lace valance.
    cur = []
    rod_y = WY + WR + 0.05
    rod = kit.tube([[WX - 0.25, rod_y, z + 0.035], [WX + 0.25, rod_y, z + 0.035]], [0.005, 0.005], seg=8)
    rod.paint(BRASS, None, MAT.GOLD)
    cur.append(rod)
    for sx in (-1, 1):
        cur.append(kit.sphere(0.011, c=(WX + sx * 0.255, rod_y, z + 0.035), seg=10, rings=6).paint(BRASS, None, MAT.GOLD))
    for sx in (-1, 1):
        def fc(u, v, sx=sx):
            # u across the curtain (0 = window side), v from the rod down.
            y = rod_y - v * 0.34
            tie = math.exp(-((v - 0.62) / 0.16) ** 2)
            width = 0.12 * (1 - 0.55 * tie) + 0.03 * v
            xin = WX + sx * (WR * 0.8 + 0.02 * v + tie * 0.05)
            x = xin + sx * u * width
            zz = z + 0.03 + 0.012 * math.sin(u * math.pi * 5) * (1 - tie * 0.6) + 0.02 * v * tie
            return np.array([x, y, zz])
        g = kit.grid(fc, 14, 14)
        orient(g, (0, 0, 1))
        g.uv = np.column_stack([g.uv[:, 0] * 1.4, g.uv[:, 1] * 2.4])
        g = kit.two_sided(g, 0.0012)
        g.paint('#c65a48', 'curtain', MAT.CLOTH)
        cur.append(g)
        tieb = kit.tube([[WX + sx * (WR * 0.8 + 0.06), rod_y - 0.21, z + 0.05], [WX + sx * (WR * 0.8 + 0.13), rod_y - 0.215, z + 0.045]], [0.006, 0.006], seg=6)
        tieb.paint('#e7b44f', None, MAT.CLOTH)
        cur.append(tieb)
    val = kit.card(0.52, 0.06, 'attic_a', col='#f6efe0', anchor=(0.5, 1.0), nu=8, nv=1,
                   bend=lambda u, v: 0.01 * math.sin(u * math.pi * 6))
    val.uv = np.column_stack([val.uv[:, 0] * 3.0, 1 - val.uv[:, 1]])
    val.xf(t=(WX, rod_y + 0.012, z + 0.045))
    cur.append(val)
    scene.part('curtains', pivot=(WX, rod_y, z), role='static', sway=0.0).add(*cur)

    # A candle on the sill (the second warm light) and a teacup.
    cd = []
    sy = WY - WR - 0.024
    holder = kit.lathe([(0.03, 0), (0.032, 0.004), (0.012, 0.008), (0.01, 0.018), (0.014, 0.022)], seg=16, cap_bottom=True)
    holder.paint(BRASS, None, MAT.GOLD)
    holder.xf(t=(WX - 0.1, sy, z + 0.04))
    candle = kit.lathe([(0.009, 0), (0.009, 0.06), (0.007, 0.064)], seg=12, cap_top=True)
    candle.paint('#f6ead2', None, MAT.VELLUM)
    candle.xf(t=(WX - 0.1, sy + 0.02, z + 0.04))
    cd += [holder, candle]
    scene.part('candle', role='static').add(*cd)
    fl = kit.card(0.016, 0.032, 'flame', col='#ffd890', mat=MAT.GLOW, emis=4.0)
    flip_v(fl)
    fl.xf(R=kit.ry(20), t=(WX - 0.1, sy + 0.082, z + 0.04))
    scene.part('candle_flame', pivot=(WX - 0.1, sy + 0.082, z + 0.04), role='static').add(fl)
    return (WX - 0.1, sy + 0.1, z + 0.06)


# ---------------------------------------------------------------- furniture

def bookcase(scene):
    out = []
    x0, x1 = -0.84, -0.32
    d = 0.17
    h = 0.62
    zc = ZB + d / 2
    cx = (x0 + x1) / 2
    w = x1 - x0
    back = kit.box(w, h, 0.01, c=(cx, 0, ZB + 0.005))
    back.paint('#4a2e22', 'wood', MAT.PAPER)
    back.uv *= 3
    out.append(back)
    for x in (x0 + 0.012, x1 - 0.012):
        side = kit.box(0.024, h + 0.02, d, c=(x, 0, zc))
        side.paint(WOOD, 'wood', MAT.PAPER)
        side.uv *= 4
        out.append(side)
    shelves = [0.0, 0.03, 0.18, 0.33, 0.48, h]
    for y in shelves[1:]:
        sh = kit.box(w, 0.018, d + 0.01, c=(cx, y - 0.009, zc + 0.005))
        sh.paint('#9a6a48', 'wood', MAT.PAPER)
        sh.uv *= 4
        out.append(sh)
    base = kit.box(w, 0.03, d, c=(cx, 0, zc))
    base.paint(WOOD_D, 'wood', MAT.PAPER)
    out.append(base)
    # Crown with lace trim.
    lace = kit.card(w, 0.04, 'attic_a', col='#f3e9d6', anchor=(0.5, 1.0), nu=6, nv=1)
    lace.uv = np.column_stack([lace.uv[:, 0] * 2.6, 1 - lace.uv[:, 1]])
    lace.xf(t=(cx, h - 0.004, ZB + d + 0.012))
    out.append(lace)
    for i, y in enumerate([0.03, 0.18, 0.33]):
        lc = kit.card(w - 0.05, 0.022, 'attic_a', col='#f3e9d6', anchor=(0.5, 1.0), nu=6, nv=1)
        lc.uv = np.column_stack([lc.uv[:, 0] * 2.4 + i * 0.3, 1 - lc.uv[:, 1]])
        lc.xf(t=(cx, y + 0.15 - 0.001, ZB + d + 0.012))
        out.append(lc)
    scene.part('bookcase', role='static').add(*out)

    books = []
    rng = np.random.default_rng(3)
    for i, (y, hh) in enumerate([(0.03, 0.13), (0.18, 0.13), (0.33, 0.13), (0.48, 0.12)]):
        # Two rows of spines for depth, the front one a little shorter.
        for row, (dz, hs, du) in enumerate([(0.05, 1.0, 0.0), (0.11, 0.92, 0.37)]):
            ww = w - 0.05
            if i == 3 and row == 1:
                ww = w * 0.55
            cd = kit.card(ww, hh * hs, 'book_spines', col='#ffffff', anchor=(0.5, 0.0), nu=1, nv=1)
            cd.uv = np.column_stack([cd.uv[:, 0] * ww / 0.24 + du + i * 0.21, 0.998 - cd.uv[:, 1] * 0.996])
            xo = 0 if not (i == 3 and row == 1) else -w * 0.2
            cd.xf(t=(cx + xo, y + 0.009, ZB + dz))
            books.append(cd)
        # A few loose books lying flat.
        if i in (1, 3):
            for k in range(2 + i // 2):
                bk = book_box(0.11, 0.016, 0.08, ['#2f5f6e', '#b8483b', '#d08a3c', '#4c6e3e'][k % 4])
                bk.xf(R=kit.ry(rng.uniform(-10, 10)), t=(x1 - 0.1, y + k * 0.016, ZB + 0.1))
                books.append(bk)
    # On top: a pot plant, a jar of stars, a little globe.
    pot = kit.lathe([(0.03, 0), (0.038, 0.05), (0.042, 0.055), (0.04, 0.062)], seg=16, cap_bottom=True)
    pot.paint('#c5603f', None, MAT.PAPER)
    pot.xf(t=(x0 + 0.1, h, ZB + 0.09))
    books.append(pot)
    for k in range(3):
        pl = kit.card(0.2, 0.2, 'plant', col=['#5e9a63', '#4f8a5a', '#6fae6c'][k], anchor=(0.5, 0.0), nu=2, nv=3,
                      bend=lambda u, v: 0.04 * (u - 0.5) ** 2 + 0.02 * v)
        flip_v(pl)
        pl.xf(R=kit.ry(k * 60 + 10), t=(x0 + 0.1, h + 0.04, ZB + 0.09))
        books.append(pl)
    jar = kit.lathe([(0.025, 0), (0.028, 0.01), (0.028, 0.06), (0.02, 0.07), (0.02, 0.078)], seg=16)
    jar.paint('#ffe2a0', 'lantern_glass', MAT.GLASS, 1.1)
    jar.occluder = False
    jar.xf(t=(x1 - 0.1, h, ZB + 0.09))
    lid = kit.lathe([(0.022, 0), (0.022, 0.012), (0.002, 0.014)], seg=16)
    lid.paint(BRASS, None, MAT.GOLD)
    lid.xf(t=(x1 - 0.1, h + 0.076, ZB + 0.09))
    books += [jar, lid]
    glow = kit.sphere(0.014, c=(x1 - 0.1, h + 0.03, ZB + 0.09), seg=10, rings=6)
    glow.paint('#ffe08a', None, MAT.GLOW, 2.2)
    glow.occluder = False
    books.append(glow)
    scene.part('books', role='static').add(*books)


def picture(scene):
    out = []
    cx, cy = -0.05, 0.78
    w, h = 0.15, 0.19
    art = kit.slab([kit.rect(w, h, c=(cx, cy))], thick=0.004, col='#ffffff', pat_name='frame_picture', uv_fn=rect_uv(cx - w / 2, cy - h / 2, w, h))
    art.xf(t=(0, 0, ZB + 0.008))
    out.append(art)
    fr = kit.slab([kit.rect(w + 0.034, h + 0.034, c=(cx, cy)), kit.rect(w - 0.006, h - 0.006, c=(cx, cy))], thick=0.014, col='#e2b04e', mat=MAT.GOLD)
    fr.xf(t=(0, 0, ZB + 0.012))
    out.append(fr)
    nail = kit.tube([[cx - 0.05, cy + h / 2 + 0.017, ZB + 0.006], [cx, cy + h / 2 + 0.06, ZB + 0.004], [cx + 0.05, cy + h / 2 + 0.017, ZB + 0.006]], [0.0012], seg=4)
    nail.paint('#3a2a22')
    out.append(nail)
    scene.part('picture', role='static').add(*out)


def bed(scene):
    out = []
    x0, x1 = 0.56, 1.06
    z0, z1 = ZB + 0.02, ZB + 1.0
    cx = (x0 + x1) / 2
    zc = (z0 + z1) / 2
    w = x1 - x0
    L = z1 - z0
    frame = kit.box(w, 0.09, L, c=(cx, 0.04, zc))
    frame.paint('#a0663f', 'wood', MAT.PAPER)
    frame.uv *= 4
    out.append(frame)
    for lx in (x0 + 0.025, x1 - 0.025):
        for lz in (z0 + 0.025, z1 - 0.025):
            leg = kit.box(0.036, 0.05, 0.036, c=(lx, 0, lz))
            leg.paint(WOOD_D)
            out.append(leg)
    mat_ = kit.box(w - 0.02, 0.05, L - 0.02, c=(cx, 0.13, zc))
    mat_.paint('#f4ead8', None, MAT.CLOTH)
    out.append(mat_)
    # Headboard and footboard: turned posts with brass knobs, panels with a humped top.
    def board(H, hump, hole):
        loop = kit.smooth_loop([(-w / 2, 0.06), (w / 2, 0.06), (w / 2, H - hump), (w * 0.25, H - hump * 0.35), (0, H), (-w * 0.25, H - hump * 0.35), (-w / 2, H - hump)], n_per=6)
        return kit.slab([loop, hole], thick=0.018, col='#b5734a', pat_name='wood', uv_scale=5.0)
    hbs = board(0.42, 0.08, star_loop(0.045, inner=0.45) + np.array([0, 0.31]))
    hbs.xf(t=(cx, 0, ZB + 0.012))
    fbs = board(0.22, 0.04, star_loop(0.03, inner=0.45) + np.array([0, 0.16]))
    fbs.xf(t=(cx, 0, z1 + 0.012))
    out += [hbs, fbs]
    for px in (x0 - 0.004, x1 + 0.004):
        for pz, H in ((ZB + 0.014, 0.4), (z1 + 0.012, 0.21)):
            post = kit.lathe([(0.016, 0), (0.016, H * 0.5), (0.02, H * 0.52), (0.014, H * 0.56), (0.014, H)], seg=10)
            post.paint('#9a5f3a', None, MAT.PAPER)
            post.xf(t=(px, 0, pz))
            knob = kit.sphere(0.02, c=(px, H + 0.014, pz), seg=10, rings=6)
            knob.paint(BRASS, None, MAT.GOLD)
            out += [post, knob]
    # Pillow.
    pil = kit.sphere(0.1, c=(cx, 0.2, z0 + 0.12), seg=16, rings=8, squash=0.35)
    pil.xf(t=(0, 0, 0))
    pil.pos[:, 2] = (pil.pos[:, 2] - (z0 + 0.12)) * 0.55 + (z0 + 0.12)
    pil.pos[:, 0] = (pil.pos[:, 0] - cx) * 1.9 + cx
    pil.paint('#fbf3e6', 'curtain', MAT.CLOTH)
    pil.uv *= 2
    out.append(pil)
    # Patchwork quilt draped over the mattress, folded back at the top.
    top_y = 0.185
    def fq(u, v):
        # u across (x), v along the bed (z from the fold to the foot).
        x = kit.lerp(-1, 1, u)
        ax = abs(x)
        z = kit.lerp(z0 + 0.3, z1 + 0.025, v)
        if ax < 0.82:
            y = top_y + 0.012 * math.sin(v * 9 + x * 2) * 0.5 + 0.01 * (1 - ax)
            xx = x / 0.82 * (w / 2 - 0.01)
        else:
            t = (ax - 0.82) / 0.18
            y = top_y - t * 0.13
            xx = math.copysign(w / 2 - 0.01 + 0.035 * math.sin(t * math.pi / 2), x)
            z = z + 0.008 * math.sin(v * 30) * t
        return np.array([cx + xx, y, z])
    q = kit.grid(fq, 24, 20)
    orient(q, (0, 1, 0))
    q.uv = np.column_stack([q.pos[:, 0] * 3.2, q.pos[:, 2] * 3.2])
    q = kit.two_sided(q, 0.0015, back_col='#efe2c8')
    q.paint('#ffffff', 'quilt', MAT.CLOTH)
    out.append(q)
    # The folded edge.
    fold = kit.tube([[x0 + 0.005, top_y + 0.012, z0 + 0.3], [x1 - 0.005, top_y + 0.012, z0 + 0.3]], [0.014, 0.014], seg=10)
    fold.paint('#f1e2c4', 'quilt', MAT.CLOTH)
    fold.uv *= 0.6
    out.append(fold)
    # Foot of the bed: a folded knitted blanket.
    bl = kit.box(w - 0.08, 0.024, 0.12, c=(cx, top_y + 0.008, z1 - 0.12))
    bl.paint('#e2a33f', None, MAT.CLOTH)
    out.append(bl)
    scene.part('bed', role='static').add(*out)


def rug(scene):
    r = 0.52
    g = kit.slab([kit.circle(r, n=72)], thick=0.006, col='#ffffff', pat_name='rug', uv_fn=disc_uv(0, 0, r), mat=MAT.CLOTH, edge_col='#f0dcb0')
    g.xf(R=kit.rx(-90), t=(0.0, 0.003, 0.06))
    scene.part('rug', role='static').add(g)


def clutter(scene):
    out = []
    rng = np.random.default_rng(11)
    # Book stack + teacup by Mira.
    cols = ['#b8483b', '#2f5f6e', '#e2a33f', '#6d4b7d', '#4c6e3e']
    y = 0.0
    for k in range(4):
        h = 0.022 + 0.008 * rng.random()
        bk = book_box(0.15 - k * 0.01, h, 0.11 - k * 0.006, cols[k])
        bk.xf(R=kit.ry(rng.uniform(-20, 20)), t=(-0.62, y, 0.34))
        out.append(bk)
        y += h
    cup = kit.lathe([(0.002, 0), (0.016, 0.0), (0.02, 0.006), (0.024, 0.03), (0.026, 0.034)], seg=18)
    cup.paint('#f4ece0', None, MAT.PAPER)
    cup.xf(t=(-0.61, y + 0.004, 0.34))
    saucer = kit.lathe([(0.002, 0), (0.03, 0.0), (0.04, 0.006)], seg=18)
    saucer.paint('#f4ece0', None, MAT.PAPER)
    saucer.xf(t=(-0.61, y, 0.34))
    tea = kit.slab([kit.circle(0.023, n=18)], thick=0.002, col='#9a5a2a', edges=False)
    tea.xf(R=kit.rx(-90), t=(-0.61, y + 0.032, 0.34))
    handle = kit.tube([[-0.586, y + 0.028, 0.34], [-0.574, y + 0.024, 0.34], [-0.574, y + 0.014, 0.34], [-0.584, y + 0.01, 0.34]], [0.003], seg=5)
    handle.paint('#f4ece0')
    band = kit.lathe([(0.0242, 0.024), (0.0256, 0.028)], seg=18)
    band.paint('#c65a48')
    band.xf(t=(-0.61, y + 0.004, 0.34))
    out += [cup, saucer, tea, handle, band]
    # A second, taller stack by the bed and a fallen open book.
    y = 0.0
    for k in range(5):
        h = 0.02 + 0.01 * rng.random()
        bk = book_box(0.16 - k * 0.008, h, 0.12, cols[(k + 2) % 5])
        bk.xf(R=kit.ry(rng.uniform(-25, 25) + 90), t=(0.48, y, -0.2))
        out.append(bk)
        y += h
    # Slippers by the bed: a sole, a puffy toe cap and a pom-pom.
    for k, (sx, sz, a) in enumerate([(0.4, 0.74, -28), (0.48, 0.79, -8)]):
        Rs = kit.ry(a)
        sole = kit.slab([kit.circle(0.024, n=24, rx_=0.056)], thick=0.008, col='#f1dfc0', edge_col='#f6ead4')
        sole.xf(R=kit.rx(-90), t=(0, 0.004, 0))
        cap = kit.sphere(0.028, c=(0, 0, 0), seg=14, rings=8, squash=0.6)
        cap.pos[:, 1] = np.maximum(cap.pos[:, 1], 0) + 0.006
        cap.pos[:, 0] = cap.pos[:, 0] * 1.25 + 0.022
        cap.paint('#d9654e', 'quilt', MAT.CLOTH)
        cap.uv *= 0.3
        pom = kit.sphere(0.011, c=(0.008, 0.026, 0), seg=8, rings=5)
        pom.paint('#f6efe4', 'fox', MAT.CLOTH)
        for ch in (sole, cap, pom):
            ch.xf(R=Rs, t=(sx, 0.0, sz))
            out.append(ch)
    # Low shelf of books along the left knee wall.
    for i, z in enumerate(np.arange(-0.85, 1.9, 0.42)):
        if i in (0,):
            continue
        cd = kit.card(0.36, 0.11, 'spines_small', col='#ffffff', anchor=(0.5, 0.0))
        cd.uv = np.column_stack([cd.uv[:, 0] * 2.2 + i * 0.31, 0.998 - cd.uv[:, 1] * 0.996])
        cd.xf(R=kit.ry(90), t=(-W2 + 0.07, 0.115, z + 0.21))
        out.append(cd)
        sh = kit.box(0.09, 0.012, 0.4, c=(-W2 + 0.045, 0.103, z + 0.21))
        sh.paint('#9a6a48', 'wood', MAT.PAPER)
        out.append(sh)
    # Right knee wall: a little trunk and a stack of hat boxes towards the front.
    tr = kit.box(0.2, 0.14, 0.32, c=(W2 - 0.12, 0, 0.55))
    tr.paint('#3f6f7a', 'wood', MAT.PAPER)
    tr.uv *= 3
    out.append(tr)
    for dy in (0.03, 0.11):
        strap = kit.box(0.205, 0.012, 0.325, c=(W2 - 0.12, dy, 0.55))
        strap.paint('#7a4a2a')
        out.append(strap)
    lid = kit.box(0.21, 0.02, 0.33, c=(W2 - 0.12, 0.14, 0.55))
    lid.paint('#33606b', 'wood', MAT.PAPER)
    out.append(lid)
    for k, (r, h, col) in enumerate([(0.09, 0.07, '#e2a33f'), (0.07, 0.06, '#d98a9a')]):
        hb = kit.lathe([(r, 0), (r, h)], seg=24, cap_top=True)
        hb.paint(col, 'curtain', MAT.PAPER)
        hb.xf(t=(W2 - 0.13 + k * 0.01, 0.16 + k * 0.072, 0.55 - k * 0.02))
        out.append(hb)
    # Basket of yarn at the front left.
    bs = kit.lathe([(0.07, 0), (0.085, 0.07), (0.09, 0.075)], seg=20, cap_bottom=True)
    bs.paint('#c9a46a', 'wood', MAT.PAPER)
    bs.uv *= 3
    bs.xf(t=(0.62, 0, 0.42))
    out.append(bs)
    for k, (dx, dz, col) in enumerate([(-0.025, 0.0, '#c65a48'), (0.03, 0.01, '#3f8c8a'), (0.0, -0.03, '#e8b04a')]):
        b = kit.sphere(0.035, c=(0.62 + dx, 0.08, 0.42 + dz), seg=12, rings=8)
        b.paint(col, 'fox', MAT.CLOTH)
        b.uv *= 2
        out.append(b)
    nd = kit.tube([[0.6, 0.09, 0.43], [0.66, 0.16, 0.45]], [0.002], seg=4)
    nd.paint('#d8c8a8')
    out.append(nd)
    # A folded paper boat on the floor (the next chapter is a paper sea).
    boat = []
    hull = np.array([[-0.07, 0.0], [0.07, 0.0], [0.1, 0.035], [-0.1, 0.035]])
    for sz in (-1, 1):
        h_ = kit.slab([hull], thick=0.0015, col='#f3ead8', pat_name='attic_b', uv_fn=lambda p: np.column_stack([0.62 + (p[:, 0] + 0.1) * 1.5, 0.5 + (0.035 - p[:, 1]) * 4]), edge_col='#fbf5ea')
        h_.xf(R=kit.rx(sz * 14), t=(0, 0.0, sz * 0.012))
        boat.append(h_)
    sail = kit.slab([np.array([[-0.045, 0.03], [0.045, 0.03], [0.0, 0.1]])], thick=0.0015, col='#efe2c8', pat_name='attic_b',
                    uv_fn=lambda p: np.column_stack([0.78 + p[:, 0] * 1.5, 0.75 - p[:, 1] * 3]), edge_col='#fbf5ea')
    boat.append(sail)
    for ch in boat:
        ch.xf(R=kit.ry(35), t=(-0.48, 0.004, 0.5))
        out.append(ch)
    # Mira's crayon drawing pinned above the bed.
    dr = kit.slab([kit.rect(0.13, 0.1)], thick=0.002, col='#ffffff', pat_name='attic_d', uv_fn=rect_uv(-0.065, -0.05, 0.13, 0.1), edge_col='#fbf5ea')
    dr.xf(R=kit.rz(-6), t=(0.78, 0.6, ZB + 0.004))
    pin = kit.sphere(0.006, c=(0.778, 0.645, ZB + 0.006), seg=8, rings=5)
    pin.paint('#d0453a')
    out += [dr, pin]
    scene.part('clutter', role='static').add(*out)


def garlands(scene):
    """Two strings of gold stars and tiny lights across the beams. Each star is its own part
    so it can swing on its thread."""
    specs = [(ZB + 0.62, 0.98, 0.07, 7), (ZB + 1.55, 1.05, 0.08, 7)]
    for gi, (z, y, sag, n) in enumerate(specs):
        x = roof_x(y) - 0.02
        xs = np.linspace(-x, x, 40)
        ys = y - sag * (1 - (xs / x) ** 2)
        string = kit.tube(np.column_stack([xs, ys, np.full_like(xs, z)]), [0.0018], seg=4, cap=False)
        string.paint('#e8d6b0')
        parts = [string]
        for k in range(14):
            t = (k + 0.5) / 14
            bx = -x + 2 * x * t
            by = y - sag * (1 - (bx / x) ** 2) - 0.008
            b = kit.sphere(0.0065, c=(bx, by, z), seg=8, rings=5)
            b.paint(['#ffd27a', '#ffb0a0', '#bfe8ff'][k % 3] if k % 2 else '#ffd27a', None, MAT.GLOW, 3.0)
            b.occluder = False
            parts.append(b)
        scene.part(f'garland{gi}', role='static').add(*parts)
        for k in range(n):
            t = (k + 0.5) / n
            sx = -x * 0.9 + 1.8 * x * t
            sy = y - sag * (1 - (sx / x) ** 2)
            drop = 0.05 + 0.03 * ((k * 7 + gi * 3) % 3)
            r = 0.024 if k % 2 == 0 else 0.018
            th = kit.tube([[sx, sy, z], [sx, sy - drop + r, z]], [0.0012], seg=4, cap=False)
            th.paint('#e8d6b0')
            st = kit.slab([star_loop(r, inner=0.46)], thick=0.003, col='#f2c55c', mat=MAT.GOLD, edge_col='#fff0c0')
            st.xf(R=kit.ry(((k * 37 + gi * 11) % 50) - 25), t=(sx, sy - drop, z))
            scene.part(f'star{gi}_{k}', pivot=(sx, sy, z), axis=(0, 0, 1), role='actor', swing=1).add(th, st)


def herbs(scene):
    """Bunches of dried herbs and flowers hanging upside down from the left purlin."""
    y = 0.86 - 0.025
    x = -(roof_x(0.86) - 0.04)
    for k, (z, col, ribbon) in enumerate([(-0.42, '#9b8ac4', '#d0453a'), (-0.02, '#93ad86', '#e2a33f'), (0.38, '#c98a7a', '#3f8c8a')]):
        drop = 0.07 + 0.02 * (k % 2)
        th = kit.tube([[x, y, z], [x, y - drop, z]], [0.0014], seg=4, cap=False)
        th.paint('#e8d6b0')
        parts = [th]
        for j in range(3):
            c = kit.card(0.12, 0.15, 'plant', col=col, anchor=(0.5, 0.0), nu=2, nv=3, bend=lambda u, v: 0.02 * (u - 0.5) ** 2)
            c.xf(R=kit.ry(j * 60 + k * 20), t=(x, y - drop - 0.14, z))
            parts.append(c)
        tie = kit.sphere(0.009, c=(x, y - drop - 0.004, z), seg=8, rings=5)
        tie.paint(ribbon, None, MAT.CLOTH)
        parts.append(tie)
        scene.part(f'herb{k}', pivot=(x, y, z), axis=(0, 0, 1), role='actor', swing=1).add(*parts)


# ---------------------------------------------------------------- the lantern (portal)

def lantern(scene):
    lx, lz, yaw = LAMP
    R = kit.ry(yaw)
    fwd = R @ np.array([0, 0, 1.0])
    stack = []
    y = 0.0
    for k, (w, h, d, col, a) in enumerate([(0.22, 0.034, 0.17, '#2f5f6e', 4), (0.2, 0.03, 0.155, '#b8483b', -7), (0.18, 0.036, 0.15, '#e2a33f', 3)]):
        bk = book_box(w, h, d, col)
        bk.xf(R=kit.ry(yaw + a), t=(lx, y, lz))
        stack.append(bk)
        y += h
    base_y = y
    scene.part('lamp_books', role='static').add(*stack)

    out = []
    hw = 0.064         # half width of the body
    y0, y1 = 0.024, 0.178
    cy = (y0 + y1) / 2 + 0.002
    r = 0.052          # visible lens radius = portal radius
    k = hw / 0.07
    # Foot and cap (square, faceted).
    foot = kit.lathe([(0.118 * k, 0.0), (0.122 * k, 0.008), (0.11 * k, 0.016), (0.102 * k, y0)], sides=4, phase=math.pi / 4, flat=True)
    foot.paint(BRASS, None, MAT.GOLD)
    out.append(foot)
    capb = kit.lathe([(0.112 * k, y1 - 0.004), (0.124 * k, y1 + 0.006), (0.108 * k, y1 + 0.016), (0.07, y1 + 0.02)], sides=4, phase=math.pi / 4, flat=True)
    capb.paint(BRASS, None, MAT.GOLD)
    out.append(capb)
    dome = kit.lathe([(0.062, y1 + 0.016), (0.06, y1 + 0.032), (0.05, y1 + 0.05), (0.034, y1 + 0.062), (0.024, y1 + 0.066)], seg=28)
    dome.paint(BRASS, None, MAT.GOLD)
    out.append(dome)
    for sx in (-1, 1):
        for sz in (-1, 1):
            ft = kit.sphere(0.011, c=(sx * (hw + 0.008), -0.002, sz * (hw + 0.008)), seg=8, rings=6)
            ft.paint(BRASS, None, MAT.GOLD)
            out.append(ft)
    chim = kit.lathe([(0.024, y1 + 0.062), (0.024, y1 + 0.095), (0.034, y1 + 0.1), (0.03, y1 + 0.108), (0.012, y1 + 0.114)], seg=20)
    chim.paint(BRASS, None, MAT.GOLD)
    out.append(chim)
    holes = []
    for k in range(6):
        a = k * math.pi / 3
        hl = kit.slab([kit.circle(0.005, n=10)], thick=0.002, col='#ffcf7a', mat=MAT.GLOW, emis=3.0, edges=False)
        hl.xf(R=kit.ry(math.degrees(a) + 90), t=(0.0245 * math.cos(a), y1 + 0.078, -0.0245 * math.sin(a)))
        hl.occluder = False
        holes.append(hl)
    out += holes
    fin = kit.sphere(0.012, c=(0, y1 + 0.122, 0), seg=12, rings=8)
    fin.paint(BRASS, None, MAT.GOLD)
    out.append(fin)
    # Ring handle (faces the camera so it reads as a ring).
    ring = [[0.034 * math.sin(a), y1 + 0.165 + 0.034 * math.cos(a), 0.0] for a in np.linspace(0, 2 * math.pi, 33)]
    rg = kit.tube(ring, [0.0042], seg=8, cap=False)
    rg.paint(BRASS, None, MAT.GOLD)
    out.append(rg)
    # Corner posts and rails.
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = kit.box(0.013, y1 - y0 + 0.004, 0.013, c=(sx * hw, y0 - 0.002, sz * hw))
            p.paint(BRASS, None, MAT.GOLD)
            out.append(p)
    for yy in (y0, y1 - 0.01):
        for ax in range(4):
            rl = kit.box(2 * hw + 0.012, 0.01, 0.012, c=(0, yy, hw))
            rl.xf(R=kit.ry(ax * 90))
            rl.paint(BRASS, None, MAT.GOLD)
            out.append(rl)
    # Glass on the sides and back, with a brass cross on each pane.
    for ax in (90, 180, 270):
        g = kit.slab([kit.rect(2 * hw - 0.008, y1 - y0 - 0.008, c=(0, cy))], thick=0.003, col='#ffcf7a', pat_name='lantern_glass', mat=MAT.GLASS, emis=2.0,
                     uv_fn=lambda p: np.column_stack([p[:, 0] * 7, p[:, 1] * 7]), edges=False)
        g.xf(t=(0, 0, hw - 0.002))
        g.xf(R=kit.ry(ax))
        g.occluder = False
        out.append(g)
        vb = kit.box(0.006, y1 - y0 - 0.01, 0.005, c=(0, y0 + 0.005, hw + 0.002))
        hb = kit.box(2 * hw - 0.01, 0.006, 0.005, c=(0, cy - 0.003, hw + 0.002))
        for cb in (vb, hb):
            cb.xf(R=kit.ry(ax))
            cb.paint(BRASS, None, MAT.GOLD)
            out.append(cb)
    # Front plate with the round lens opening, a raised bezel with rivets.
    plate = kit.slab([kit.rect(2 * hw, y1 - y0, c=(0, (y0 + y1) / 2)), kit.circle(r, n=48, c=(0, cy))], thick=0.004, col=BRASS, mat=MAT.GOLD, edge_col='#f3d58a')
    plate.xf(t=(0, 0, hw + 0.002))
    out.append(plate)
    bez = kit.slab([kit.circle(r + 0.011, n=48, c=(0, cy)), kit.circle(r, n=48, c=(0, cy))], thick=0.006, col='#e8bb5c', mat=MAT.GOLD, edge_col='#fff0b8')
    bez.xf(t=(0, 0, hw + 0.006))
    out.append(bez)
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 8
        rv = kit.sphere(0.0032, c=((r + 0.0055) * math.cos(a), cy + (r + 0.0055) * math.sin(a), hw + 0.009), seg=6, rings=4)
        rv.paint('#fff0b8', None, MAT.GOLD)
        out.append(rv)
    # Little hinge and latch on the bezel.
    hinge = kit.tube([[-r - 0.014, cy - 0.016, hw + 0.006], [-r - 0.014, cy + 0.016, hw + 0.006]], [0.004], seg=8)
    hinge.paint(BRASS, None, MAT.GOLD)
    latch = kit.box(0.012, 0.01, 0.006, c=(r + 0.014, cy - 0.005, hw + 0.007))
    latch.paint(BRASS, None, MAT.GOLD)
    out += [hinge, latch]
    # The flame sits behind the lens (inside the lantern).
    fl = kit.card(0.03, 0.07, 'flame', col='#ffd890', mat=MAT.GLOW, emis=4.0)
    flip_v(fl)
    fl.xf(t=(0, y0 + 0.03, -0.01))
    out.append(fl)
    for ch in out:
        ch.xf(R=R, t=(lx, base_y, lz))
        gold = ch.mat == MAT.GOLD
        ch.emis[gold] = 0.22
    scene.part('lantern', role='static').add(*out)

    # The lens: the way into the next chapter.
    disc = kit.slab([kit.circle(r + 0.003, n=48, c=(0, cy))], thick=0.002, col="#ffd890", mat=MAT.PORTAL, emis=1.1,
                    uv_fn=disc_uv(0, cy, r + 0.003), edges=False)
    disc.xf(t=(0, 0, hw + 0.002))
    disc.occluder = False
    disc.xf(R=R, t=(lx, base_y, lz))
    centre = np.array([lx, base_y + cy, lz]) + fwd * (hw + 0.003)
    scene.part('portal', pivot=tuple(centre), axis=(0, 1, 0), role='static',
               portal=dict(center=[round(float(v), 4) for v in centre], normal=[round(float(v), 4) for v in fwd], radius=r)).add(disc)
    return centre, base_y + cy


# ---------------------------------------------------------------- Mira

def mira(scene):
    mx, mz, yaw = MIRA
    R = kit.ry(yaw)

    def W(ch):
        ch.xf(R=R, t=(mx, 0, mz))
        return ch

    def wp(p):
        return R @ np.asarray(p, dtype=np.float64) + np.array([mx, 0, mz])

    T = 0.005
    skin = '#f6cfb3'
    dress = '#3f8a94'
    dress_d = '#2f6f7a'
    hair = '#5a2e22'
    hair_l = '#6e3a2a'

    def sl(loop, z, col, pat=None, mat=MAT.PAPER, thick=T, uv=None, edge='#f4ead6'):
        g = kit.slab([np.asarray(loop)], thick=thick, col=col, pat_name=pat, mat=mat, uv_fn=uv, edge_col=edge)
        g.xf(t=(0, 0, z))
        return g

    body = []
    # Cushion (a tufted pouf).
    cu = kit.lathe([(0.002, 0.0), (0.12, 0.002), (0.142, 0.022), (0.13, 0.044), (0.06, 0.052), (0.002, 0.053)], seg=28)
    cu.paint('#e2a33f', 'quilt', MAT.CLOTH)
    cu.uv *= 0.5
    body.append(cu)
    btn = kit.sphere(0.008, c=(0, 0.053, 0), seg=8, rings=4)
    btn.paint('#c65a48', None, MAT.CLOTH)
    body.append(btn)
    s0 = 0.05  # seat height
    # Crossed legs under the skirt, then the skirt with a lace hem.
    legs = kit.smooth_loop([(-0.15, s0 + 0.012), (-0.08, s0 + 0.0), (0.0, s0 - 0.004), (0.08, s0 + 0.0), (0.15, s0 + 0.012),
                            (0.145, s0 + 0.05), (0.09, s0 + 0.075), (0.0, s0 + 0.07), (-0.09, s0 + 0.075), (-0.145, s0 + 0.05)], n_per=5)
    body.append(sl(legs, 0.035, dress_d))
    hem = kit.card(0.3, 0.022, 'attic_a', col='#f6ecd8', anchor=(0.5, 1.0), nu=6, nv=1, bend=lambda u, v: -0.02 * (2 * u - 1) ** 2)
    hem.uv = np.column_stack([hem.uv[:, 0] * 2.0, 1 - hem.uv[:, 1]])
    hem.xf(t=(0, s0 + 0.012, 0.042))
    body.append(hem)
    # Socks and shoes peeking out where the ankles cross.
    for sx in (-1, 1):
        sock = sl(kit.circle(0.017, n=16, c=(sx * 0.026, s0 + 0.008), rx_=0.024), 0.046, '#f6efe4')
        shoe = sl(kit.circle(0.016, n=16, c=(sx * 0.05, s0 + 0.004), rx_=0.026), 0.05, '#8a2f2f')
        strap = sl(kit.rect(0.006, 0.026, c=(sx * 0.045, s0 + 0.008)), 0.054, '#5a1f1f', thick=0.002)
        body += [sock, shoe, strap]
    # Torso.
    torso = kit.smooth_loop([(-0.085, s0 + 0.03), (0.085, s0 + 0.03), (0.07, s0 + 0.12), (0.058, s0 + 0.185), (0.04, s0 + 0.215),
                             (0.0, s0 + 0.222), (-0.04, s0 + 0.215), (-0.058, s0 + 0.185), (-0.07, s0 + 0.12)], n_per=5)
    body.append(sl(torso, 0.0, dress))
    # Pinafore bib (cream) with a heart pocket.
    bib = kit.smooth_loop([(-0.04, s0 + 0.06), (0.04, s0 + 0.06), (0.036, s0 + 0.17), (-0.036, s0 + 0.17)], n_per=4)
    body.append(sl(bib, 0.006, '#f2e4c6'))
    # Collar petals.
    for sx in (-1, 1):
        col_ = kit.smooth_loop([(0.0, s0 + 0.222), (sx * 0.045, s0 + 0.214), (sx * 0.05, s0 + 0.195), (sx * 0.02, s0 + 0.19)], n_per=5)
        body.append(sl(col_, 0.011, '#fbf3e4'))
    neck = kit.rect(0.026, 0.05, c=(0, s0 + 0.235))
    body.append(sl(neck, -0.004, '#efc2a4'))
    # The book on her lap, held up towards Ember (pages tilted to face up and forward).
    bc = np.array([0.0, s0 + 0.105, 0.085])
    BR = kit.rx(-34)
    bw, bh = 0.2, 0.135
    book = []
    cover = kit.slab([kit.rect(bw + 0.014, bh + 0.012)], thick=0.005, col='#b8483b', mat=MAT.CLOTH, edge_col='#e8c9a0')
    book.append(cover)
    for sx, u0, u1, ang in ((-1, 0.0, 0.5, 7), (1, 0.5, 1.0, -7)):
        x0 = 0.002 if sx > 0 else -bw / 2
        pg = kit.slab([kit.rect(bw / 2 - 0.002, bh, c=(sx * bw / 4, 0))], thick=0.008, col='#d6c8ad', pat_name='attic_b',
                      uv_fn=rect_uv(x0, -bh / 2, bw / 2 - 0.002, bh, u0, u1), edge_col='#efe2c4')
        pg.xf(t=(0, 0, 0.0065))
        pg.xf(R=kit.ry(ang))
        book.append(pg)
    for ch in book:
        ch.xf(R=BR, t=bc)
    body += book
    # Arms: puffed sleeves, forearms and hands holding the book edges.
    for sx in (-1, 1):
        sleeve = kit.smooth_loop([(sx * 0.05, s0 + 0.215), (sx * 0.085, s0 + 0.2), (sx * 0.095, s0 + 0.16), (sx * 0.07, s0 + 0.15), (sx * 0.055, s0 + 0.18)], n_per=5)
        body.append(sl(sleeve, 0.016, dress))
        arm = kit.smooth_loop([(sx * 0.07, s0 + 0.16), (sx * 0.095, s0 + 0.16), (sx * 0.112, s0 + 0.11), (sx * 0.1, s0 + 0.1), (sx * 0.085, s0 + 0.13)], n_per=4)
        body.append(sl(arm, 0.02, skin))
        cuff = kit.smooth_loop([(sx * 0.068, s0 + 0.162), (sx * 0.098, s0 + 0.162), (sx * 0.097, s0 + 0.15), (sx * 0.072, s0 + 0.148)], n_per=3)
        body.append(sl(cuff, 0.022, '#fbf3e4', thick=0.003))
    for sx in (-1, 1):
        hp = BR @ np.array([sx * (bw / 2 + 0.004), -0.01, 0.012]) + bc
        hand = kit.slab([kit.circle(0.015, n=16)], thick=0.006, col='#e8b392')
        hand.xf(R=BR, t=hp)
        thumb = kit.slab([kit.circle(0.007, n=10, rx_=0.01)], thick=0.004, col='#dfa685')
        thumb.xf(R=BR, t=hp + BR @ np.array([-sx * 0.012, 0.004, 0.004]))
        body += [hand, thumb]
    for ch in body:
        W(ch)
    seat = wp([0, s0, 0])
    scene.part('mira_body', pivot=tuple(seat), axis=(0, 1, 0), role='actor').add(*body)

    # The page that turns (right half, hinged on the spine).
    pg = kit.slab([kit.rect(bw / 2 - 0.004, bh - 0.004, c=(bw / 4, 0))], thick=0.0016, col='#d6c8ad', pat_name='attic_b',
                  uv_fn=rect_uv(0.002, -bh / 2 + 0.002, bw / 2 - 0.004, bh - 0.004, 0.5, 1.0), edge_col='#efe2c4')
    pg.xf(t=(0, 0, 0.0115))
    pg.xf(R=kit.ry(-7))
    pg.xf(R=BR, t=bc)
    W(pg)
    spine_p = wp(BR @ np.array([0, 0, 0.011]) + bc)
    spine_a = R @ (BR @ np.array([0, 1.0, 0]))
    scene.part('mira_page', pivot=tuple(spine_p), axis=tuple(spine_a), role='actor').add(pg)

    # Head: face, hair, fringe and a bow. Tilts about the neck.
    head = []
    hc = np.array([0.0, s0 + 0.29])
    hr = 0.062
    face = kit.slab([kit.circle(hr, n=40, c=hc)], thick=T, col='#ffffff', pat_name='girl', uv_fn=disc_uv(hc[0], hc[1], hr), edge_col='#f8dcc6')
    face.xf(t=(0, 0, 0.004))
    head.append(face)
    back = kit.smooth_loop([(0.0, hc[1] + 0.077), (0.06, hc[1] + 0.06), (0.08, hc[1] + 0.01), (0.078, hc[1] - 0.035), (0.088, hc[1] - 0.06),
                            (0.06, hc[1] - 0.062), (0.0, hc[1] - 0.05), (-0.06, hc[1] - 0.062), (-0.088, hc[1] - 0.06), (-0.078, hc[1] - 0.035),
                            (-0.08, hc[1] + 0.01), (-0.06, hc[1] + 0.06)], n_per=5)
    head.append(sl(back, -0.008, hair))
    # Fringe: scalloped bangs across the forehead.
    fr = []
    for a in np.linspace(math.radians(8), math.radians(172), 24):
        fr.append([math.cos(a) * 0.071, hc[1] + math.sin(a) * 0.071])
    for k, x in enumerate(np.linspace(-0.066, 0.066, 9)):
        dip = 0.016 if k % 2 else 0.004
        fr.append([x, hc[1] + 0.016 + dip * 0.6 + 0.012 * (1 - (x / 0.066) ** 2)])
    head.append(sl(np.array(fr)[::1], 0.011, hair_l))
    # Side locks over the ears.
    for sx in (-1, 1):
        lock = kit.smooth_loop([(sx * 0.06, hc[1] + 0.03), (sx * 0.078, hc[1] - 0.0), (sx * 0.08, hc[1] - 0.05), (sx * 0.064, hc[1] - 0.058), (sx * 0.056, hc[1] - 0.02)], n_per=4)
        head.append(sl(lock, 0.01, hair_l))
    # Bow on top.
    bx, by = 0.042, hc[1] + 0.07
    for sx in (-1, 1):
        loop = kit.smooth_loop([(bx, by), (bx + sx * 0.03, by + 0.022), (bx + sx * 0.036, by - 0.004), (bx + sx * 0.026, by - 0.018)], n_per=5)
        head.append(sl(loop, 0.016, '#d0453a'))
        tail = np.array([[bx, by], [bx + sx * 0.012, by - 0.04], [bx + sx * 0.022, by - 0.034]])
        head.append(sl(tail, 0.014, '#b23a30'))
    head.append(sl(kit.circle(0.009, n=12, c=(bx, by)), 0.02, '#e85a4c'))
    for ch in head:
        W(ch)
    neck_p = wp([0, s0 + 0.235, 0])
    scene.part('mira_head', pivot=tuple(neck_p), axis=tuple(R @ np.array([0, 0, 1.0])), role='actor').add(*head)

    # Eyes and lashes are their own pieces so she can blink and glance up at Ember.
    eye_y = hc[1] - 0.004
    ex_, ery, erx = 0.0195, 0.0108, 0.0086
    eyes, lashes = [], []
    for sx in (-1, 1):
        cx_ = sx * ex_
        eyes.append(sl(kit.circle(ery, n=28, c=(cx_, eye_y), rx_=erx * 1.12), 0.0074, '#fbf4ea', thick=0.0012, edge='#f3e6d6'))
        # Iris low in the eye: she is reading.
        eyes.append(sl(kit.circle(ery * 0.78, n=24, c=(cx_ + sx * 0.0006, eye_y - 0.002), rx_=erx * 0.8), 0.0083, '#4a2a1a', thick=0.0012, edge='#3a2014'))
        eyes.append(sl(kit.circle(ery * 0.42, n=16, c=(cx_ + sx * 0.0006, eye_y - 0.0024), rx_=erx * 0.42), 0.0089, '#1d0f0a', thick=0.0008, edge='#1d0f0a'))
        g = sl(kit.circle(0.0022, n=10, c=(cx_ - 0.0026, eye_y + 0.0012)), 0.0095, '#ffffff', mat=MAT.GLOW, thick=0.0006, edge='#ffffff')
        g.emis[:] = 1.4
        eyes.append(g)
        # Upper lid line (a thin crescent over the eye) with a flick at the outer corner.
        lo = [[cx_ + math.cos(a) * erx * 1.2, eye_y + math.sin(a) * ery * 1.0] for a in np.linspace(math.pi, 0, 16)]
        hi = [[q[0], q[1] + 0.0018 * (0.4 + 0.6 * math.sin(math.pi * k / 15))] for k, q in enumerate(lo)]
        flick = [cx_ + sx * erx * 1.55, eye_y + ery * 0.5]
        if sx > 0:
            loop = lo + [flick] + hi[::-1]
        else:
            loop = [flick] + lo + hi[::-1]
        lashes.append(sl(np.array(loop), 0.0101, '#2c1810', thick=0.0010, edge='#2c1810'))
    for ch in eyes + lashes:
        W(ch)
    eyes_p = wp([0, eye_y - ery, 0])
    glance = R @ np.array([0.0026, 0.0034, 0.0])
    scene.part('mira_eyes', pivot=tuple(eyes_p), axis=(0, 1, 0), role='actor', glance=[round(float(v), 5) for v in glance], lid=round(2 * ery * 0.86, 5)).add(*eyes)
    scene.part('mira_lashes', pivot=tuple(eyes_p), axis=(0, 1, 0), role='actor').add(*lashes)
    return seat


# ---------------------------------------------------------------- Ember the fox

def ember(scene):
    fx, fz, yaw = FOX
    R = kit.ry(yaw)
    FS = 1.12

    def W(ch):
        ch.xf(R=R, t=(fx, 0, fz), s=FS)
        return ch

    def wp(p):
        return R @ (np.asarray(p, dtype=np.float64) * FS) + np.array([fx, 0, fz])

    orange = '#e27a36'
    orange_d = '#b9582a'
    orange_l = '#ef9550'
    white = '#f7efe2'
    dark = '#3a2420'
    T = 0.006

    def sl(loop, z, col, pat='fox', thick=T, uvs=7.0):
        g = kit.slab([np.asarray(loop)], thick=thick, col=col, pat_name=pat, uv_scale=uvs, edge_col='#f6e2c8')
        g.xf(t=(0, 0, z))
        return g

    body = []
    mound = kit.smooth_loop([(-0.1, 0.004), (0.0, 0.0), (0.12, 0.004), (0.142, 0.045), (0.115, 0.09), (0.04, 0.112), (-0.04, 0.104), (-0.095, 0.075)], n_per=6)
    body.append(sl(mound * np.array([1.04, 0.92]) + np.array([0.004, 0]), -0.022, orange_d))
    body.append(sl(mound, 0.0, orange))
    haunch = kit.smooth_loop([(0.03, 0.02), (0.12, 0.012), (0.132, 0.05), (0.1, 0.085), (0.05, 0.075)], n_per=6)
    body.append(sl(haunch, 0.008, orange_l))
    # Back paw tucked at the rump.
    body.append(sl(kit.circle(0.012, n=12, c=(0.118, 0.012), rx_=0.022), 0.014, dark, pat=None))
    for ch in body:
        W(ch)
    scene.part('fox_body', pivot=tuple(wp([0, 0, 0])), axis=(0, 1, 0), role='actor').add(*body)

    rest = []
    # Tail: wraps around the front, the head rests on it.
    tail = kit.smooth_loop([(0.13, 0.03), (0.15, 0.06), (0.12, 0.052), (0.04, 0.042), (-0.04, 0.044), (-0.1, 0.05), (-0.115, 0.03),
                            (-0.1, 0.004), (-0.02, 0.0), (0.08, 0.002)], n_per=6)
    rest.append(sl(tail, 0.03, orange))
    # Head.
    head = kit.smooth_loop([(-0.185, 0.03), (-0.17, 0.05), (-0.125, 0.092), (-0.085, 0.1), (-0.05, 0.085), (-0.045, 0.05), (-0.07, 0.03), (-0.13, 0.022)], n_per=6)
    rest.append(sl(head, 0.038, orange))
    cheek = kit.smooth_loop([(-0.185, 0.03), (-0.15, 0.048), (-0.1, 0.05), (-0.06, 0.04), (-0.07, 0.028), (-0.13, 0.022)], n_per=5)
    rest.append(sl(cheek, 0.042, white))
    rest.append(sl(kit.circle(0.008, n=12, c=(-0.184, 0.033)), 0.046, dark, pat=None))
    eye = kit.smooth_loop([(-0.135, 0.066), (-0.122, 0.059), (-0.108, 0.066), (-0.122, 0.062)], n_per=4)
    rest.append(sl(eye, 0.044, dark, pat=None, thick=0.002))
    # Back ear (static); the front ear twitches.
    rest.append(sl(np.array([[-0.08, 0.094], [-0.06, 0.15], [-0.05, 0.088]]), 0.016, orange_d))
    for ch in rest:
        W(ch)
    scene.part('fox', role='static').add(*rest)

    ear = [sl(np.array([[-0.112, 0.094], [-0.098, 0.158], [-0.074, 0.096]]), 0.02, orange),
           sl(np.array([[-0.104, 0.112], [-0.097, 0.157], [-0.09, 0.122]]), 0.023, dark, pat=None, thick=0.002)]
    for ch in ear:
        W(ch)
    scene.part('fox_ear', pivot=tuple(wp([-0.093, 0.095, 0.02])), axis=tuple(R @ np.array([0, 0, 1.0])), role='actor').add(*ear)

    tip = [sl(kit.smooth_loop([(-0.09, 0.05), (-0.125, 0.056), (-0.148, 0.036), (-0.13, 0.008), (-0.09, 0.008)], n_per=5), 0.033, white)]
    for ch in tip:
        W(ch)
    scene.part('fox_tail', pivot=tuple(wp([-0.09, 0.028, 0.036])), axis=tuple(R @ np.array([0, 0, 1.0])), role='actor').add(*tip)


def fix_normals(scene):
    """Poles of spheres/lathes get zero normals from the grid gradient: point them outwards."""
    for part in scene.parts:
        for ch in part.chunks:
            n = np.linalg.norm(ch.nrm, axis=1)
            bad = n < 0.5
            if bad.any():
                c = ch.pos.mean(axis=0)
                ch.nrm[bad] = kit.norm(ch.pos[bad] - c + 1e-6)


def build_scene():
    scene = kit.Scene('attic', ao_dist=0.12, ao_strength=0.9)
    shell(scene)
    side_window(scene)
    bookcase(scene)
    picture(scene)
    bed(scene)
    rug(scene)
    clutter(scene)
    garlands(scene)
    herbs(scene)
    lantern(scene)
    mira(scene)
    ember(scene)
    fix_normals(scene)
    return scene


CAMS = [
    ((0.25, 0.58, 1.45), (0.0, 0.34, 0.0), 34, 'hero'),
    ((0.0, 0.85, 2.2), (0.0, 0.38, -0.2), 34, 'entry'),
]
