"""Chapter 0: the open book and the pop-up Lantern House in the paper woods."""
import numpy as np

import book
import kit
import props
from book import HB
from kit import MAT

GROUND = HB - 0.004  # pieces sink a hair into the page so their feet never float


def pop(scene, name, parent, base, order, lie=-1, sway=0.0, **meta):
    """A pop-up piece: hinged on the page at `base` about X, lying towards -Z (lie=-1) or +Z when folded."""
    x, z = base
    return scene.part(name, pivot=(x, GROUND, z), axis=(1, 0, 0), role='pop', parent=parent, order=order, lie=lie, sway=sway, **meta)


def place(ch, x, z, ry=0.0, s=1.0):
    ch.xf(R=kit.ry(ry), t=(x, GROUND, z), s=s)
    return ch


def house(scene, base=(0.0, -0.1)):
    bx, bz = base
    out = []
    glow = '#ffcf7a'
    wall = '#d98a52'
    # Stone plinth.
    plinth = kit.box(0.5, 0.05, 0.35)
    plinth.paint('#6f7fa3', 'bricks', MAT.PAPER)
    plinth.uv = plinth.uv * 6
    out.append(plinth)
    y = 0.05
    # Ground floor.
    door = kit.arch(0.085, 0.15, c=(0, 0.0))
    wins = [kit.arch(0.07, 0.11, c=(-0.135, 0.07)), kit.arch(0.07, 0.11, c=(0.135, 0.07))]
    side = [kit.arch(0.07, 0.1, c=(0, 0.075))]
    g = props.storey(0.44, 0.3, 0.24, wins, back=[kit.arch(0.06, 0.09, c=(0.1, 0.08))], left=side, right=side, door=door, col=wall, glow=glow)
    g.xf(t=(0, y, 0))
    out.append(g)
    # Porch: stairs down to the page.
    st = props.stairs(5, 0.1, 0.01, 0.024, col='#e9b071')
    st.xf(t=(0, 0, 0.175))
    out.append(st)
    for sx in (-1, 1):
        r = props.railing(0.12, 0.05, posts=4, col='#2f7f86')
        r.xf(R=kit.ry(90), t=(sx * 0.058, 0.05 * 0.2, 0.235))
        out.append(r)
    # First skirt roof.
    y += 0.24
    sk = props.skirt_roof(0.56, 0.42, 0.37, 0.26, 0.075, col='#3f93b5')
    sk.xf(t=(0, y - 0.012, 0))
    out.append(sk)
    # Hanging lanterns at the front eave corners.
    for sx in (-1, 1):
        th = kit.tube([[sx * 0.25, y - 0.012, 0.2], [sx * 0.25, y - 0.06, 0.2]], [0.0012, 0.0012], seg=4, cap=False)
        th.paint('#2b2b33')
        bulb = kit.sphere(0.014, c=(sx * 0.25, y - 0.075, 0.2), seg=10, rings=6, squash=1.2)
        bulb.paint('#ffb85c', 'lantern_glass', MAT.GLOW, 3.5)
        bulb.occluder = False
        out += [th, bulb]
    # Second floor with a balcony.
    w2 = [kit.arch(0.05, 0.085, c=(x, 0.075)) for x in (-0.11, 0.0, 0.11)]
    g2 = props.storey(0.36, 0.25, 0.19, w2, back=[kit.arch(0.05, 0.08, c=(0, 0.07))],
                      left=[kit.arch(0.05, 0.08, c=(0, 0.075))], right=[kit.arch(0.05, 0.08, c=(0, 0.075))], col='#e09a5e', glow=glow)
    g2.xf(t=(0, y, 0))
    out.append(g2)
    bal = kit.box(0.3, 0.008, 0.06, c=(0, y + 0.07, 0.155))
    bal.paint('#f1e2c4')
    out.append(bal)
    rail = props.railing(0.3, 0.045, posts=9, col='#2f7f86')
    rail.xf(t=(0, y + 0.078, 0.183))
    out.append(rail)
    # Second skirt.
    y += 0.19
    sk2 = props.skirt_roof(0.46, 0.35, 0.21, 0.19, 0.075, col='#4aa0c0')
    sk2.xf(t=(0, y - 0.01, 0))
    out.append(sk2)
    # Chimney.
    ch = kit.box(0.045, 0.14, 0.045, c=(0.13, y - 0.05, -0.08))
    ch.paint('#8a6f9e', 'bricks', MAT.PAPER)
    ch.uv = ch.uv * 10
    out.append(ch)
    # Tower with the round window: the way in.
    tw, td, th_ = 0.2, 0.18, 0.17
    portal_c = (0.0, 0.09)
    ring = kit.circle(0.045, n=40, c=portal_c)
    gt = props.storey(tw, td, th_, [], left=[kit.arch(0.03, 0.08, c=(0, 0.05))], right=[kit.arch(0.03, 0.08, c=(0, 0.05))], col='#e7a76a', glow=glow, skip_front=True)
    # Front wall replaced: round hole + portal disc.
    front = kit.slab([kit.rect(tw, th_, c=(0, th_ / 2)), ring], thick=props.WALL_T, col='#e7a76a', pat_name='wood', uv_scale=5.0)
    front.xf(t=(0, 0, td / 2 + 0.0015))
    disc = kit.slab([kit.circle(0.047, n=40, c=portal_c)], thick=0.002, col='#ffd890', mat=MAT.PORTAL, emis=2.0,
                    uv_fn=lambda p: (p - np.array([portal_c[0] - 0.047, portal_c[1] - 0.047])) / 0.094, edges=False)
    disc.xf(t=(0, 0, td / 2 - 0.004))
    disc.occluder = False
    fr = props.frame_ring(ring, grow=0.016, col='#f5d77e', thick=0.01)
    fr.paint(None, None, MAT.GOLD)
    fr.xf(t=(0, 0, td / 2 + 0.006))
    # Mullions in front of the portal: a cross that reads as a window from far away.
    for cur in (gt, front, disc, fr):
        cur.xf(t=(0, y, 0))
        out.append(cur)
    # Spire.
    y += th_
    sp = props.spire(0.3, 0.28, 0.34, col='#3a86a8')
    sp.xf(t=(0, y - 0.01, 0))
    out.append(sp)
    g = kit.merge(out)
    g.xf(t=(bx, GROUND, bz))
    portal_center = [bx, GROUND + 0.05 + 0.24 + 0.19 + portal_c[1], bz + td / 2 - 0.004]
    p = scene.part('house', pivot=(bx, GROUND, bz + 0.17), axis=(1, 0, 0), role='pop', parent='right', order=0.34, lie=-1, sway=0.0, split=True,
                   portal=dict(center=[round(v, 4) for v in portal_center], normal=[0, 0, 1], radius=0.047))
    p.add(g)
    return p


def table(scene, R=4.0, n=48):
    """Dark walnut table under the book: a fine grid so the contact AO has vertices to land on."""
    def f(u, v):
        # Denser near the book.
        x = np.sign(u - 0.5) * (abs(u - 0.5) * 2) ** 2.2 * R
        z = np.sign(v - 0.5) * (abs(v - 0.5) * 2) ** 2.2 * R
        return np.array([x, -0.0008, z])
    g = kit.grid(f, n, n)
    if np.mean(g.nrm[:, 1]) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    g.nrm[:] = [0, 1, 0]
    g.uv = np.column_stack([g.pos[:, 0], g.pos[:, 2]]) * 0.9
    g.paint('#6e4636', 'table', MAT.PAPER)
    scene.part('table', pivot=(0, 0, 0), axis=(0, 1, 0), role='static').add(g)


def build_scene():
    scene = kit.Scene('woods', ao_dist=0.14, ao_strength=0.9)
    table(scene)
    book.build(scene)
    rng = np.random.default_rng(7)

    # Far hills (two layers each side).
    for side, parent in ((-1, 'left'), (1, 'right')):
        for layer, (z, h, col) in enumerate([(-0.6, 0.34, '#24506b'), (-0.5, 0.22, '#2f6f82')]):
            name = f'hills{layer}_{parent}'
            p = pop(scene, name, parent, (side * 0.5, z), order=0.02 + layer * 0.05, lie=-1)
            g = props.hills(0.96, h, 2.2 + layer, seed=layer * 3 + (side > 0), col=col)
            place(g, side * 0.5, z)
            p.add(g)

    # Moon on a wire and stars.
    p = pop(scene, 'moon', 'right', (0.7, -0.62), order=0.12, lie=-1, sway=0.6)
    stick = kit.tube([[0.7, GROUND, -0.62], [0.7, GROUND + 0.86, -0.62]], [0.003, 0.002], seg=6)
    stick.paint('#c9b78f')
    moon = kit.slab([kit.circle(0.085, n=48)], thick=0.006, col='#fff1c4', pat_name='moon', mat=MAT.GLOW, emis=1.1,
                    uv_fn=lambda q: q / 0.17 + 0.5, edge_col='#fff6dc')
    moon.xf(t=(0.7, GROUND + 0.86, -0.615))
    p.add(stick, moon)
    p = pop(scene, 'stars', 'left', (-0.45, -0.64), order=0.1, lie=-1, sway=0.8)
    for i, (x, h, r) in enumerate([(-0.78, 0.95, 0.032), (-0.5, 1.08, 0.024), (-0.22, 0.98, 0.028), (-0.62, 0.78, 0.02)]):
        stick = kit.tube([[x, GROUND, -0.64], [x, GROUND + h, -0.64]], [0.0018, 0.0012], seg=5)
        stick.paint('#c9b78f')
        st = kit.slab([kit.polar(lambda a: r * (0.55 + 0.45 * np.cos(5 * a) ** 2), n=60)], thick=0.004, col='#ffe9a8',
                      pat_name='star', mat=MAT.GLOW, emis=1.4, uv_fn=lambda q, r=r: q / (2 * r) + 0.5)
        st.xf(R=kit.rz(rng.uniform(0, 70)), t=(x, GROUND + h, -0.637))
        p.add(stick, st)

    # Trees: two big ones framing the house, two smaller behind. Seeds are fixed numbers:
    # str hash() is salted per process and made every build different.
    for name, parent, (x, z), order, seed, kw in [
        ('tree_bl', 'left', (-0.26, -0.5), 0.06, 12, dict(height=0.62, spread=0.22, palette=('#e7c27b', '#9fcfba', '#f0a27c'), canopies=3, R0=0.13, lean=0.02)),
        ('tree_br', 'right', (0.33, -0.52), 0.08, 92, dict(height=0.66, spread=0.22, palette=('#a4d3c2', '#f2b48a', '#7fb9b5'), canopies=3, R0=0.13, lean=-0.03)),
        ('tree_l', 'left', (-0.62, -0.3), 0.16, 62, dict(height=0.9, spread=0.36, palette=('#f2a07b', '#f6c27a', '#ec8a6a'), canopies=5, R0=0.17, lean=0.05)),
        ('tree_r', 'right', (0.64, -0.28), 0.2, 70, dict(height=0.82, spread=0.34, palette=('#7fc2b4', '#a7d9c4', '#f2b48a'), canopies=5, R0=0.16, lean=-0.06)),
    ]:
        p = pop(scene, name, parent, (x, z), order=order, lie=-1, sway=1.0)
        t = props.tree(seed=seed, **kw)
        place(t, x, z)
        p.add(t)

    house(scene)

    # Fairy lights strung between the two big trees, over the house.
    for name, parent, a, b in [('lights_l', 'left', (-0.58, 0.62, -0.26), (-0.04, 0.5, -0.05)), ('lights_r', 'right', (0.04, 0.5, -0.05), (0.6, 0.6, -0.25))]:
        p = pop(scene, name, parent, (a[0] * 0.5 + b[0] * 0.5, -0.15), order=0.4, lie=-1, sway=0.5)
        A = np.array([a[0], GROUND + a[1], a[2]])
        B = np.array([b[0], GROUND + b[1], b[2]])
        pts = []
        for k in range(24):
            u = k / 23
            q = A * (1 - u) + B * u
            q[1] -= 0.09 * np.sin(np.pi * u)  # the string sags
            pts.append(q)
        wire = kit.tube(pts, [0.0016], seg=4, cap=False)
        wire.paint('#3a2e2a')
        p.add(wire)
        for k in range(2, 22, 2):
            q = pts[k] - np.array([0, 0.012, 0])
            bulb = kit.sphere(0.0085, c=q, seg=8, rings=5, squash=1.25)
            bulb.paint(['#ffd27a', '#ffb070', '#fff0b0', '#ffc2a0'][k % 4], None, MAT.GLOW, 3.6)
            bulb.occluder = False
            p.add(bulb)

    # Grass rows: each row is one pop-up layer.
    greens = ['#6cc08a', '#86cf92', '#5bb19a', '#a2dc96', '#bde69c', '#4fa58c']
    rows = [('grass_back', -0.26, -0.14, 0.3, -1, 0.13), ('grass_mid', 0.0, 0.16, 0.52, 1, 0.1), ('grass_front', 0.44, 0.62, 0.74, 1, 0.08)]
    for rname, z0, z1, order, lie, hmax in rows:
        for side, parent in ((-1, 'left'), (1, 'right')):
            zc = (z0 + z1) / 2
            p = pop(scene, f'{rname}_{parent}', parent, (side * 0.5, zc), order=order + (0.02 if side > 0 else 0), lie=lie, sway=0.6)
            n = 5 if rname != 'grass_front' else 6
            for i in range(n):
                wdt = rng.uniform(0.22, 0.42)
                x = side * rng.uniform(0.04 + wdt / 2, 0.98 - wdt / 2)
                if rname == 'grass_mid' and abs(x) < 0.3 + wdt / 2:
                    x = side * (0.3 + wdt / 2 + rng.uniform(0, 0.3))  # keep the porch clear
                if rname == 'grass_front' and abs(x) - wdt / 2 < 0.1:
                    x = side * (0.1 + wdt / 2 + rng.uniform(0, 0.4))  # the path
                z = rng.uniform(z0, z1)
                h = rng.uniform(0.6, 1.0) * hmax
                gcol = greens[int(rng.integers(len(greens)))]
                g = props.grass_strip(wdt, h, gcol, seed=float(rng.uniform(0, 10)), curve=rng.uniform(-0.04, 0.04))
                g.xf(R=kit.ry(rng.uniform(-12, 12)), t=(x, GROUND, z))
                p.add(g)
            if rname == 'grass_back':
                for i in range(5):
                    x = side * rng.uniform(0.1, 0.9)
                    f = props.fern(0.14, 0.12, '#2f6f62', k=i)
                    f.xf(R=kit.ry(rng.uniform(-30, 30)), t=(x, GROUND, rng.uniform(z0, z1)))
                    p.add(f)

    # Mushrooms (some glowing).
    for name, parent, (cx, cz), order in [('mush_l', 'left', (-0.4, 0.04), 0.46), ('mush_r', 'right', (0.4, 0.12), 0.5)]:
        p = pop(scene, name, parent, (cx, cz), order=order, lie=1, sway=0.2)
        for i in range(5):
            h = rng.uniform(0.05, 0.13)
            r = h * rng.uniform(0.45, 0.7)
            glow = 0.7 if i % 2 == 0 else 0.0
            col = ['#ef6f5b', '#f39a5a', '#e8566b', '#f7b267', '#d9675f'][i]
            m = props.mushroom(h, r, cap_col=col, glow=glow)
            dx, dz = rng.uniform(-0.12, 0.12), rng.uniform(-0.06, 0.06)
            if parent == 'left':
                dx = min(dx, -0.02 - cx - 0.05) if cx + dx > -0.05 else dx
            m.xf(R=kit.rot(rng.uniform(-8, 8), rng.uniform(0, 360), rng.uniform(-8, 8)), t=(cx + dx, GROUND, cz + dz))
            p.add(m)

    # Puffballs.
    for side, parent in ((-1, 'left'), (1, 'right')):
        p = pop(scene, f'puffs_{parent}', parent, (side * 0.6, 0.3), order=0.66, lie=1, sway=1.2)
        for i in range(6):
            x = side * rng.uniform(0.18, 0.95)
            z = rng.uniform(0.2, 0.45)
            h = rng.uniform(0.07, 0.17)
            pb = props.puffball(h, rng.uniform(0.014, 0.022), col=['#f08a4b', '#f4a259', '#ec6b56'][i % 3])
            pb.xf(t=(x, GROUND, z))
            p.add(pb)

    # Fences and lantern posts along the path.
    for side, parent in ((-1, 'left'), (1, 'right')):
        p = pop(scene, f'fence_{parent}', parent, (side * 0.47, 0.3), order=0.6, lie=1)
        f = props.picket_fence(0.62, 0.075, 15, col='#2f7f86')
        f.xf(R=kit.ry(side * 6), t=(side * 0.47, GROUND, 0.3))
        p.add(f)
        p = pop(scene, f'lamp_{parent}', parent, (side * 0.13, 0.4), order=0.7, lie=1, sway=0.3)
        lp = props.lantern_post(0.2)
        lp.xf(R=kit.ry(0 if side > 0 else 180), t=(side * 0.13, GROUND, 0.4))
        p.add(lp)

    return scene


CAMS = [
    ((0.0, 1.55, 2.35), (0.0, 0.42, -0.08), 34, 'hero'),
    ((1.4, 1.0, 1.6), (0.0, 0.45, -0.1), 34, 'side'),
    ((0.0, 0.62, 0.55), (0.0, 0.57, -0.01), 34, 'portal'),
]
