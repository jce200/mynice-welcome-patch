#!/usr/bin/env python3
"""The logo of Nice (a blue house with a white N), rebuilt from the launcher icon of the app that you patch, so that it can be drawn sharp at any size (nx20).

This file contains NO Nice artwork: it only knows how to read the icon that is in YOUR copy of the app, and how to draw what it finds. Nothing of the logo is stored here.

THE ICON IS A RASTER: 192 x 192 px at the most (res/mipmap-xxxhdpi/ic_launcher.png). Scaled up by plain resampling it turns soft, and the splash screen
needs it at 2 to 3 times that size. So the icon is not scaled, it is taken apart into three things that are each easy to draw at any size:

  the gradient   one smooth blue, a straight diagonal (45 degrees, dark at the lower left) that is fitted with a polynomial of degree 2 per color channel
                 (it is fitted on pixels that are well inside the house, away from the edges, where the source file has ringing)
  the house      the coverage of the whole shape (the alpha channel of the icon)
  the N          the coverage of the white N inside the house (how white a pixel is, measured against the gradient); where the N reaches the lower edge of the
                 house (it is open at the bottom: white on white) it is carried on to that edge

Drawing at another size then means: sample the two coverages with a Catmull-Rom filter; when enlarging, steepen the edge around the 50 % line, so that an
edge becomes one pixel wide (a sharp edge, not a smeared one); when reducing, take several samples per pixel and average them; the color comes straight
from the gradient. The result is the same logo with clean edges: no halo (the source has a light fringe of its own) and no ringing.

Pure Python 3, standard library only (zlib, struct, math): the patch scripts need nothing to be installed.

    mark = Mark(open('ic_launcher.png', 'rb').read())     raises MarkError when the file is not what is expected: a gradient with a white shape in it
    tile = mark.render(scale, dx, dy, canvas_w, canvas_h) draws it: a source point (u, v) lands at (u * scale + dx, v * scale + dy), in pixels of the canvas
    tile.rgba()                                           the logo in its colors      (straight alpha)
    tile.silhouette((r, g, b))                            the house with the N cut out, in one color (for the status bar and the themed icons)
    write_png(w, h, pixels, channels)                     a PNG file
"""
import math
import random
import struct
import zlib

PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'


class MarkError(ValueError):
    """the icon is not the blue house with the white N that this script expects"""


# ------------------------------------------------------------------------------------------------ PNG files
def _chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def _unfilter(raw, width, height, bpp):
    stride = width * bpp
    out = bytearray(height * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        kind = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if len(line) != stride:
            raise ValueError('truncated PNG data')
        if kind == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif kind == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif kind == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if (pa <= pb and pa <= pc) else (b if pb <= pc else c))) & 255
        elif kind != 0:
            raise ValueError('unknown PNG filter %d' % kind)
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return out


def read_png(data):
    """Decodes a PNG file (8 bits per channel, not interlaced: gray, gray + alpha, RGB, RGBA or palette) to (width, height, RGBA bytearray, straight alpha)."""
    if data[:8] != PNG_SIGNATURE:
        raise ValueError('not a PNG file')
    pos, header, idat, palette, trns = 8, None, [], None, None
    while pos + 8 <= len(data):
        length, kind = struct.unpack('>I4s', data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif kind == b'PLTE':
            palette = body
        elif kind == b'tRNS':
            trns = body
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
    if header is None or not idat:
        raise ValueError('not a complete PNG file')
    width, height, depth, ctype, _, _, interlace = header
    if depth != 8 or interlace != 0 or ctype not in (0, 2, 3, 4, 6):
        raise ValueError('only 8-bit PNG files that are not interlaced are supported (this one: depth %d, color type %d, interlace %d)' % (depth, ctype, interlace))
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    raw = _unfilter(zlib.decompress(b''.join(idat)), width, height, channels)
    n = width * height
    rgba = bytearray(4 * n)
    if ctype == 6:
        rgba[:] = raw
    elif ctype == 2:
        rgba[0::4], rgba[1::4], rgba[2::4] = raw[0::3], raw[1::3], raw[2::3]
        rgba[3::4] = b'\xff' * n
    elif ctype == 0:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = raw
        rgba[3::4] = b'\xff' * n
    elif ctype == 4:
        rgba[0::4] = rgba[1::4] = rgba[2::4] = raw[0::2]
        rgba[3::4] = raw[1::2]
    else:
        if palette is None:
            raise ValueError('palette PNG without palette')
        for i in range(n):
            k = raw[i]
            rgba[4 * i:4 * i + 3] = palette[3 * k:3 * k + 3]
            rgba[4 * i + 3] = trns[k] if trns and k < len(trns) else 255
    return width, height, rgba


def write_png(width, height, pixels, channels=4):
    """A PNG file from `pixels` (bytes, rows from the top, `channels` = 4 for RGBA or 3 for RGB). A row that equals the one above it is written with the filter
    "Up" (all zeros), so that the flat areas of a splash screen compress to almost nothing."""
    stride = width * channels
    if len(pixels) != stride * height:
        raise ValueError('%d bytes for a %d x %d image of %d channels' % (len(pixels), width, height, channels))
    rows = []
    zeros = b'\x02' + bytes(stride)
    prev = None
    for y in range(height):
        row = bytes(pixels[y * stride:(y + 1) * stride])
        rows.append(zeros if row == prev else b'\x00' + row)
        prev = row
    header = struct.pack('>IIBBBBB', width, height, 8, 6 if channels == 4 else 2, 0, 0, 0)
    return PNG_SIGNATURE + _chunk(b'IHDR', header) + _chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + _chunk(b'IEND', b'')


# ------------------------------------------------------------------------------------------------ small numeric helpers
def _solve(a, b):
    """solves a x = b (Gaussian elimination with pivoting; a is a list of lists)"""
    n = len(b)
    m = [list(a[i]) + [b[i]] for i in range(n)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            raise MarkError('the colors of the icon cannot be fitted (singular system)')
        m[c], m[p] = m[p], m[c]
        for r in range(c + 1, n):
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (m[r][n] - sum(m[r][k] * x[k] for k in range(r + 1, n))) / m[r][r]
    return x


def _window(mask, width, height, r, need_all):
    """a square window of radius r over a mask (a list of 0/1), as two passes (rows, then columns): erosion (need_all: every pixel of the window is set, and the
    window lies inside the image) or dilation (any pixel of the window is set)"""
    def line(values):
        n = len(values)
        pre = [0]
        for v in values:
            pre.append(pre[-1] + v)
        out = []
        for i in range(n):
            lo, hi = i - r, i + r
            if need_all:
                out.append(1 if (lo >= 0 and hi < n and pre[hi + 1] - pre[lo] == 2 * r + 1) else 0)
            else:
                out.append(1 if pre[min(n - 1, hi) + 1] - pre[max(0, lo)] > 0 else 0)
        return out
    rows = [line(mask[y * width:(y + 1) * width]) for y in range(height)]
    out = [0] * (width * height)
    for x in range(width):
        col = line([rows[y][x] for y in range(height)])
        for y in range(height):
            out[y * width + x] = col[y]
    return out


def _enclosing_circle(points):
    """the smallest circle around the points (the incremental algorithm of Welzl; deterministic)"""
    pts = list(points)
    random.Random(20).shuffle(pts)
    eps = 1e-7

    def inside(c, p):
        return math.hypot(p[0] - c[0], p[1] - c[1]) <= c[2] + eps

    def two(a, b):
        return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, math.hypot(a[0] - b[0], a[1] - b[1]) / 2.0)

    def three(a, b, c):
        d = 2.0 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]))
        if abs(d) < 1e-12:
            return max((two(a, b), two(a, c), two(b, c)), key=lambda t: t[2])
        ux = ((a[0] ** 2 + a[1] ** 2) * (b[1] - c[1]) + (b[0] ** 2 + b[1] ** 2) * (c[1] - a[1]) + (c[0] ** 2 + c[1] ** 2) * (a[1] - b[1])) / d
        uy = ((a[0] ** 2 + a[1] ** 2) * (c[0] - b[0]) + (b[0] ** 2 + b[1] ** 2) * (a[0] - c[0]) + (c[0] ** 2 + c[1] ** 2) * (b[0] - a[0])) / d
        return (ux, uy, math.hypot(a[0] - ux, a[1] - uy))

    c = (pts[0][0], pts[0][1], 0.0)
    for i, p in enumerate(pts):
        if inside(c, p):
            continue
        c = (p[0], p[1], 0.0)
        for j in range(i):
            q = pts[j]
            if inside(c, q):
                continue
            c = two(p, q)
            for k in range(j):
                s = pts[k]
                if not inside(c, s):
                    c = three(p, q, s)
    return c


def _catmull_rom(t):
    t2 = t * t
    t3 = t2 * t
    return (-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1.0, -1.5 * t3 + 2.0 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2)


# ------------------------------------------------------------------------------------------------ the logo
WHITE_MIN = 90        # a pixel whose weakest channel is at least this is (partly) white: the N (the blue of the house has a red channel of 60 at the most)
EDGE = 3              # pixels this close to the edge of the house, or to the N, are not used for the fit of the gradient (ringing in the source file)
PAD = 4               # the coverages are padded with zeros: the filter looks 2 pixels around a sample


class Mark(object):
    def __init__(self, png):
        self.width, self.height, px = read_png(png)
        w, h = self.width, self.height
        if w < 96 or h < 96 or w > 1024 or h > 1024:
            raise MarkError('the icon is %d x %d px; expected something like 192 x 192' % (w, h))
        n = w * h
        red, green, blue, alpha = px[0::4], px[1::4], px[2::4], px[3::4]
        self.house = [a / 255.0 for a in alpha]
        # --- the gradient, fitted on pixels well inside the house and away from the white of the N
        solid = [1 if a == 255 else 0 for a in alpha]
        inner = _window(solid, w, h, EDGE, True)
        white = [1 if (alpha[i] >= 128 and min(red[i], green[i], blue[i]) >= WHITE_MIN) else 0 for i in range(n)]
        near_white = _window(white, w, h, EDGE, False)
        fit = [i for i in range(n) if inner[i] and not near_white[i]]
        if len(fit) < 0.1 * n:
            raise MarkError('too little of the icon is plain blue (%d of %d px) to fit a gradient' % (len(fit), n))
        self.plane = []
        for ch in (red, green, blue):
            self.plane.append(self._fit(ch, fit))
        # --- the white N: how white a pixel is, measured against the gradient (the red channel: the house has 17 to 55, the N 255); only where the house is solid
        self.n = [0.0] * n
        solid_n = {}
        for i in range(n):
            if alpha[i] == 255:
                x, y = i % w, i // w
                base = self.gradient(x, y)[0]
                v = (red[i] - base) / max(1.0, 255.0 - base)
                v = 0.0 if v < 0.04 else (1.0 if v > 0.96 else v)
                self.n[i] = v
                solid_n[i] = v
        # the edge of the house (alpha below 255): the N is open at the bottom, so where the house ends the N goes on up to the edge: take the nearest solid pixel
        for i in range(n):
            if 0 < alpha[i] < 255:
                x, y = i % w, i // w
                best, bd = 0.0, 1e9
                for yy in range(max(0, y - 2), min(h, y + 3)):
                    for xx in range(max(0, x - 2), min(w, x + 3)):
                        j = yy * w + xx
                        if j in solid_n:
                            d = (xx - x) ** 2 + (yy - y) ** 2
                            if d < bd:
                                best, bd = solid_n[j], d
                self.n[i] = best
        # --- padded copies for the filter
        def padded(values):
            rows = []
            zero = [0.0] * (w + 2 * PAD)
            for _ in range(PAD):
                rows.append(zero)
            for y in range(h):
                rows.append([0.0] * PAD + values[y * w:(y + 1) * w] + [0.0] * PAD)
            for _ in range(PAD):
                rows.append(zero)
            return rows
        self._house = padded(self.house)
        self._n = padded(self.n)
        # --- what the model says about the icon: where it is, how big, and how well it explains the pixels
        edge = []
        for y in range(h):
            for x in range(w):
                if self.house[y * w + x] >= 0.5:
                    if (x == 0 or y == 0 or x == w - 1 or y == h - 1 or self.house[y * w + x - 1] < 0.5 or self.house[y * w + x + 1] < 0.5
                            or self.house[(y - 1) * w + x] < 0.5 or self.house[(y + 1) * w + x] < 0.5):
                        edge.append((x + 0.5, y + 0.5))
        if len(edge) < 40:
            raise MarkError('the icon has no clear shape (alpha channel)')
        cx, cy, r = _enclosing_circle(edge)
        self.circle = (cx, cy, r + 0.5)                      # the smallest circle around the house, in source pixels (edge coordinates)
        xs = [p[0] for p in edge]
        ys = [p[1] for p in edge]
        self.box = (min(xs) - 0.5, min(ys) - 0.5, max(xs) + 0.5, max(ys) + 0.5)       # the house, where it is at least half covered: for the layout
        touched = [i for i in range(n) if self.house[i] > 0.0]
        tx = [i % w for i in touched]
        ty = [i // w for i in touched]
        # where anything of the house is (a pixel that is covered a little is part of it too), and 2 pixels more for the reach of the filter: the part that is drawn
        self.reach = (min(tx) - 2.0, min(ty) - 2.0, max(tx) + 3.0, max(ty) + 3.0)
        self.covered = sum(1 for v in self.house if v >= 0.5) / float(n)
        solid_count = sum(1 for a in alpha if a == 255)
        self.share_n = sum(1 for i in solid_n if solid_n[i] >= 0.5) / float(max(1, solid_count))
        sq, worst, count = 0.0, 0.0, 0
        for i in range(n):
            if inner[i]:
                x, y = i % w, i // w
                g = self.gradient(x, y)
                q = self.n[i]
                for k, ch in enumerate((red, green, blue)):
                    e = ch[i] - (g[k] * (1 - q) + 255.0 * q)
                    sq += e * e
                    worst = max(worst, abs(e))
                    count += 1
        self.rms = math.sqrt(sq / max(1, count))
        self.worst = worst
        self.base_color = tuple(int(round(v)) for v in self.gradient(self.circle[0] - 0.5, self.circle[1] - 0.5))
        if not (0.25 <= self.covered <= 0.9):
            raise MarkError('the house covers %.0f %% of the icon; expected 25 to 90 %%: this is not the icon of Nice' % (100 * self.covered))
        if not (0.05 <= self.share_n <= 0.6):
            raise MarkError('the white N is %.0f %% of the house; expected 5 to 60 %%: this is not the icon of Nice' % (100 * self.share_n))
        if self.rms > 4.0:
            raise MarkError('the icon is not a smooth gradient with a white shape (error %.1f levels): this is not the icon of Nice' % self.rms)

    # -------------------------------------------------------------------------------------------- the gradient
    @staticmethod
    def _basis(x, y, w, h):
        u = (x - (w - 1) / 2.0) / (w / 2.0)
        v = (y - (h - 1) / 2.0) / (h / 2.0)
        return (1.0, u, v, u * u, u * v, v * v)

    def _fit(self, channel, indexes):
        w, h = self.width, self.height
        m = [[0.0] * 6 for _ in range(6)]
        b = [0.0] * 6
        for i in indexes:
            phi = self._basis(i % w, i // w, w, h)
            val = channel[i]
            for r in range(6):
                pr = phi[r]
                b[r] += pr * val
                row = m[r]
                for c in range(r, 6):
                    row[c] += pr * phi[c]
        for r in range(6):
            for c in range(r):
                m[r][c] = m[c][r]
        return _solve(m, b)

    def gradient(self, x, y):
        """the color of the gradient at the pixel with index (x, y) (floats are fine); (r, g, b) as floats"""
        phi = self._basis(x, y, self.width, self.height)
        return tuple(sum(c * p for c, p in zip(coef, phi)) for coef in self.plane)

    # -------------------------------------------------------------------------------------------- drawing
    def render(self, scale, dx, dy, canvas_w, canvas_h):
        """Draws the logo: a point (u, v) of the source (in pixels, from the top left corner of the image) lands at (u * scale + dx, v * scale + dy) on a canvas of
        canvas_w x canvas_h pixels. Returns a Tile: the part of the canvas that the logo touches."""
        w, h = self.width, self.height
        x0 = max(0, int(math.floor(self.reach[0] * scale + dx)))
        y0 = max(0, int(math.floor(self.reach[1] * scale + dy)))
        x1 = min(canvas_w, int(math.ceil(self.reach[2] * scale + dx)))
        y1 = min(canvas_h, int(math.ceil(self.reach[3] * scale + dy)))
        tw, th = x1 - x0, y1 - y0
        if tw <= 0 or th <= 0:
            return Tile(self, x0, y0, 0, 0, [], [], [])
        ss = 1 if scale >= 1.0 else min(4, int(math.ceil(1.0 / scale)))       # samples per pixel and axis: more when the logo is reduced
        gain = max(1.0, scale)                                                  # how much the edge is steepened (enlarging only)
        # the columns: for each sample the index of the first of 4 source columns and the 4 weights
        cols = []
        for t in range(tw * ss):
            X = x0 + (t + 0.5) / ss
            u = (X - dx) / scale - 0.5
            i0 = int(math.floor(u))
            i0 = max(-PAD + 1, min(w + PAD - 3, i0))
            cols.append((i0 - 1 + PAD,) + _catmull_rom(u - math.floor(u)))
        cov = [0.0] * (tw * th)
        wht = [0.0] * (tw * th)
        colors = [None] * (tw * th)
        inv = 1.0 / (ss * ss)
        for j in range(th):
            acc_c = [0.0] * tw
            acc_w = [0.0] * tw
            for sj in range(ss):
                Y = y0 + j + (sj + 0.5) / ss
                v = (Y - dy) / scale - 0.5
                j0 = int(math.floor(v))
                j0 = max(-PAD + 1, min(h + PAD - 3, j0))
                a0, a1, a2, a3 = _catmull_rom(v - math.floor(v))
                r0 = j0 - 1 + PAD
                ha = [a0 * p + a1 * q + a2 * r + a3 * s for p, q, r, s in zip(self._house[r0], self._house[r0 + 1], self._house[r0 + 2], self._house[r0 + 3])]
                na = [a0 * p + a1 * q + a2 * r + a3 * s for p, q, r, s in zip(self._n[r0], self._n[r0 + 1], self._n[r0 + 2], self._n[r0 + 3])]
                for t in range(tw):
                    for si in range(ss):
                        c = cols[t * ss + si]
                        k = c[0]
                        a = c[1] * ha[k] + c[2] * ha[k + 1] + c[3] * ha[k + 2] + c[4] * ha[k + 3]
                        a = (a - 0.5) * gain + 0.5
                        if a <= 0.0:
                            continue
                        if a > 1.0:
                            a = 1.0
                        q = c[1] * na[k] + c[2] * na[k + 1] + c[3] * na[k + 2] + c[4] * na[k + 3]
                        q = (q - 0.5) * gain + 0.5
                        acc_c[t] += a
                        if q > 0.0:
                            acc_w[t] += a if q >= 1.0 else a * q
            base = j * tw
            for t in range(tw):
                if acc_c[t] > 0.0:
                    cov[base + t] = acc_c[t] * inv
                    wht[base + t] = acc_w[t] * inv
                    px = (x0 + t + 0.5 - dx) / scale - 0.5
                    py = (y0 + j + 0.5 - dy) / scale - 0.5
                    colors[base + t] = self.gradient(px, py)
        return Tile(self, x0, y0, tw, th, cov, wht, colors)


class Tile(object):
    """a part of a canvas with the logo on it: at (x, y), tw x th pixels; cov is how much of each pixel the house covers, white how much of it is the white N"""

    def __init__(self, mark, x, y, tw, th, cov, white, colors):
        self.mark, self.x, self.y, self.w, self.h, self.cov, self.white, self.colors = mark, x, y, tw, th, cov, white, colors

    def rgba(self):
        """the logo in its colors: RGBA bytes (straight alpha)"""
        out = bytearray(4 * self.w * self.h)
        for i, c in enumerate(self.cov):
            if c <= 0.0:
                continue
            q = min(1.0, self.white[i] / c)
            g = self.colors[i]
            o = 4 * i
            out[o] = max(0, min(255, int(round(g[0] * (1 - q) + 255.0 * q))))
            out[o + 1] = max(0, min(255, int(round(g[1] * (1 - q) + 255.0 * q))))
            out[o + 2] = max(0, min(255, int(round(g[2] * (1 - q) + 255.0 * q))))
            out[o + 3] = max(0, min(255, int(round(255.0 * c))))
        return out

    def silhouette(self, rgb):
        """the house with the N cut out, in one color: RGBA bytes"""
        out = bytearray(4 * self.w * self.h)
        for i, c in enumerate(self.cov):
            a = c - self.white[i]
            if a <= 0.0:
                continue
            o = 4 * i
            out[o], out[o + 1], out[o + 2] = rgb
            out[o + 3] = max(0, min(255, int(round(255.0 * a))))
        return out


def paste(canvas, canvas_w, canvas_h, tile_rgba, tile):
    """puts a tile (RGBA bytes) on a transparent RGBA canvas (a bytearray); the tile replaces what is under it"""
    for j in range(tile.h):
        y = tile.y + j
        if 0 <= y < canvas_h:
            canvas[4 * (y * canvas_w + tile.x):4 * (y * canvas_w + tile.x + tile.w)] = tile_rgba[4 * j * tile.w:4 * (j + 1) * tile.w]


def over(tile_rgba, tile, background, canvas_w, canvas_h, rows):
    """lays a tile (RGBA bytes) over a flat background (r, g, b) in the rows of a canvas: `rows` maps y to the RGB bytes of that row of the canvas"""
    br, bg, bb = background
    for j in range(tile.h):
        y = tile.y + j
        if not 0 <= y < canvas_h:
            continue
        row = bytearray(rows[y])
        for t in range(tile.w):
            o = 4 * (j * tile.w + t)
            a = tile_rgba[o + 3]
            if a == 0:
                continue
            p = 3 * (tile.x + t)
            if a == 255:
                row[p], row[p + 1], row[p + 2] = tile_rgba[o], tile_rgba[o + 1], tile_rgba[o + 2]
            else:
                f = a / 255.0
                row[p] = int(round(br * (1 - f) + tile_rgba[o] * f))
                row[p + 1] = int(round(bg * (1 - f) + tile_rgba[o + 1] * f))
                row[p + 2] = int(round(bb * (1 - f) + tile_rgba[o + 2] * f))
        rows[y] = bytes(row)
