"""The hardcover book. Shared by the opening spread and by the sunken book in the deep sea.

Layout (book units): the gutter runs along Z at x = 0. The right half stays on the
table; the left half (part 'left') swings over the hinge axis at (0, HB, z) about +Z,
closed at -pi. Pages face +Y. The front edge of the book is at +Z (towards the viewer).
"""
import math

import numpy as np

import kit
from kit import MAT

W = 1.0          # page width
D = 1.36         # page depth (z)
BW = 1.05        # board width
BD = 1.44        # board depth
BT = 0.024       # board thickness
BLOCK = 0.07     # page block thickness
HB = BT + BLOCK  # hinge height = page surface at the gutter
SPINE_STRIPS = 10

CLOTH = '#7a2433'
CLOTH_EDGE = '#5b1823'
ENDPAPER = '#e9dcc0'
PAGE = '#f6eedb'
EDGE_PAGES = '#efe4cb'


def page_height(x):
    """Page surface height at distance x from the gutter (dips into the gutter)."""
    x = np.abs(x)
    dip = 0.026 * np.clip(1 - x / 0.16, 0, 1) ** 2
    roll = 0.006 * np.clip((x - 0.86) / 0.14, 0, 1) ** 2  # pages curl down at the fore-edge
    return HB - dip - roll


def _board(side):
    """Cover board for the right half (side=+1) or left half (side=-1), spine edge at x=0."""
    s = side
    x0, x1 = 0.0, BW
    chunks = []
    # Outer face (bottom, y=0): front cover art on the left board, cloth on the right.
    nx = 24
    xs = np.linspace(x0, x1, nx + 1)
    zs = np.linspace(-BD / 2, BD / 2, 2)

    def face(y, normal_up, pat_name, col, mat, uv_fn):
        P, U, T = [], [], []
        for i, x in enumerate(xs):
            for z in zs:
                P.append([s * x, y, z])
                U.append(uv_fn(x, z))
        P = np.array(P)
        for i in range(nx):
            a, b, c, d = 2 * i, 2 * (i + 1), 2 * (i + 1) + 1, 2 * i + 1
            T += [[a, b, c], [a, c, d]]
        T = np.array(T)
        n = np.tile([0, 1.0 if normal_up else -1.0, 0], (len(P), 1))
        g = kit.Chunk(P, n, np.array(U), T)
        pa, pb, pc = g.pos[g.tri[:, 0]], g.pos[g.tri[:, 1]], g.pos[g.tri[:, 2]]
        if np.mean(np.cross(pb - pa, pc - pa) @ n[0]) < 0:
            g.tri = g.tri[:, ::-1].copy()
        g.paint(col, pat_name, mat)
        return g

    if s < 0:
        outer = face(0.0, False, 'cover', '#ffffff', MAT.CLOTH, lambda x, z: [x / BW, (z + BD / 2) / BD])
        # Gold blocking: a foil layer a hair proud of the cloth, cut to the gilded art.
        foil = face(-0.0007, False, 'cover_foil', '#cf9d45', MAT.GOLD, lambda x, z: [x / BW, (z + BD / 2) / BD])
        foil.occluder = False
        chunks.append(foil)
    else:
        outer = face(0.0, False, 'cloth', CLOTH, MAT.CLOTH, lambda x, z: [x * 6, z * 6])
    inner = face(BT, True, 'endpaper', ENDPAPER, MAT.PAPER, lambda x, z: [x * 2.2, z * 2.2])
    chunks += [outer, inner]
    # Edges: cloth turned over the board.
    for (a, b, nrm) in [
        ((x1, -BD / 2), (x1, BD / 2), (1, 0, 0)),
        ((x0, BD / 2), (x1, BD / 2), (0, 0, 1)),
        ((x0, -BD / 2), (x1, -BD / 2), (0, 0, -1)),
    ]:
        P = np.array([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], BT, b[1]], [a[0], BT, a[1]]])
        P[:, 0] *= s
        n = np.array(nrm, dtype=float)
        n[0] *= s
        g = kit.Chunk(P, np.tile(n, (4, 1)), np.array([[0, 0], [8, 0], [8, 0.2], [0, 0.2]]), np.array([[0, 1, 2], [0, 2, 3]]))
        pa, pb, pc = g.pos[0], g.pos[1], g.pos[2]
        if np.dot(np.cross(pb - pa, pc - pa), n) < 0:
            g.tri = g.tri[:, ::-1].copy()
        g.paint(CLOTH_EDGE, 'cloth', MAT.CLOTH)
        chunks.append(g)
    return kit.merge(chunks)


def _block(side):
    """Page block with a curved top (dipping into the gutter) and striped page edges."""
    s = side
    m0, m1 = 0.012, W + 0.012
    zA, zB = -D / 2, D / 2
    nx = 40
    xs = np.linspace(m0, m1, nx + 1)
    # Top surface (the page itself), uv = 0..1 across the printed art.
    def top(u, v):
        x = m0 + (m1 - m0) * u
        z = zA + (zB - zA) * v
        return np.array([s * x, float(page_height(x)), z])
    g = kit.grid(top, nx, 6)
    g.uv = np.column_stack([g.uv[:, 0] if s > 0 else 1 - g.uv[:, 0], g.uv[:, 1]])
    if np.mean(g.nrm[:, 1]) < 0:
        g.nrm = -g.nrm
        g.tri = g.tri[:, ::-1].copy()
    g.paint(PAGE, 'page_r' if s > 0 else 'page_l', MAT.PAPER)
    chunks = [g]
    # Fore-edge and head/tail: vertical strips under the top profile.
    def side_strip(path_xz, nvec):
        P, U, T = [], [], []
        L = 0.0
        for i, (x, z) in enumerate(path_xz):
            if i:
                L += math.hypot(x - path_xz[i - 1][0], z - path_xz[i - 1][1])
            yt = float(page_height(x))
            P += [[s * x, BT, z], [s * x, yt, z]]
            U += [[L * 3, 0], [L * 3, (yt - BT) * 14]]
        for i in range(len(path_xz) - 1):
            a, b, c, d = 2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1
            T += [[a, b, c], [a, c, d]]
        n = np.array(nvec, dtype=float)
        n[0] *= s
        ch = kit.Chunk(np.array(P), np.tile(n, (len(P), 1)), np.array(U), np.array(T))
        pa, pb, pc = ch.pos[ch.tri[:, 0]], ch.pos[ch.tri[:, 1]], ch.pos[ch.tri[:, 2]]
        if np.mean(np.cross(pb - pa, pc - pa) @ n) < 0:
            ch.tri = ch.tri[:, ::-1].copy()
        ch.paint(EDGE_PAGES, 'page_edges', MAT.PAPER)
        return ch
    chunks.append(side_strip([(x, zB) for x in xs], (0, 0, 1)))
    chunks.append(side_strip([(x, zA) for x in xs], (0, 0, -1)))
    chunks.append(side_strip([(m1, z) for z in np.linspace(zA, zB, 8)], (1, 0, 0)))
    return kit.merge(chunks)


def build(scene, prefix='', with_spine=True):
    """Adds parts '<prefix>right' and '<prefix>left' (+ spine strips). Returns (right, left) parts."""
    right = scene.part(prefix + 'right', pivot=(0, HB, 0), axis=(0, 0, 1), role='page', side=1)
    right.add(_board(1), _block(1))
    left = scene.part(prefix + 'left', pivot=(0, HB, 0), axis=(0, 0, 1), role='page', side=-1)
    left.add(_board(-1), _block(-1))
    if with_spine:
        # Unit strip: length 1 along X, thickness BT towards the hinge axis (+Y), full board depth. The runtime
        # places strip k on the arc between the two boards and stretches it to the arc segment.
        for k in range(SPINE_STRIPS):
            p = scene.part(f'{prefix}spine{k}', pivot=(0, HB, 0), axis=(0, 0, 1), role='spine', k=k, n=SPINE_STRIPS)
            outer = kit.box(1.0, BT, BD, c=(0, 0, 0))
            outer.paint(CLOTH, 'cloth', MAT.CLOTH)
            outer.uv = outer.uv * 6
            p.add(outer)
    return right, left
