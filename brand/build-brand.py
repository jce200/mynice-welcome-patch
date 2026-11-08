#!/usr/bin/env python3
"""The app icon, the small icon of the notifications and the splash screen (nx19): generates brand/res, which patch-16-brand.py puts in the app.

Usage: python3 brand/build-brand.py [--no-png]     (Python 3; the PNG files need Node with playwright and its Chromium: NODE_PATH=<folder with node_modules>)

THE MARK is an arched picket gate: six boards under one arch, a gap between the two leaves, one rail across. It is built, not drawn: every measure comes from
five numbers (the width of a board, the gap between boards, the gap between the leaves, the number of boards per leaf and the height) and from one circle (the arch is
the top of that circle, so the boards end on an exact semicircle). On the 108 x 108 canvas of the adaptive icon all the vertical edges lie on whole units:
    board 5, gap 3, gap between the leaves 6, three boards per leaf   ->   2 x (3 x 5 + 2 x 3) + 6 = 48 wide, 45 high (an arch of radius 24 on a body of 21)
White on one plain field (#003547, tone 20 of the ramp of the skin): two colors, no gradient, no shadow, no outline, nothing that has to be guessed at 48 px.
The mark stays inside the safe zone of an adaptive icon (a circle of 66 around the middle): its corners are 32.9 from the center.

Three sizes of the same mark, each on a grid of its own so that its edges fall on whole pixels where the density allows it:
    108 grid   the adaptive icon (vector)                                          board 5  gap 3  between the leaves 6  rail 3
     48 grid   the icon of Android 7 and older (PNG, 48 / 96 / 144 / 192 px = 1, 2, 3, 4 px per unit)       3 / 1 / 2 / 2
     24 grid   the small icon of the notifications (PNG, 24 / 48 / 72 / 96 px)       2 / 1 / 2 / 1; white on transparent, as Android demands
The splash screen draws the mark at a whole, even number of pixels per unit (so that the half units of the 108 grid are whole pixels too).

Generated (committed, so that building the APK needs neither Node nor Chromium):
  brand/res/drawable/ic_launcher_{background,foreground,monochrome}.xml    vector drawables of the adaptive icon (the monochrome layer is for the themed icons of Android 13)
  brand/res/mipmap-anydpi-v26/ic_launcher.xml                              the adaptive icon (Android 8 and up)
  brand/res/mipmap-<density>/ic_launcher.png                               the icon for older Android
  brand/res/drawable-<density>/nx_stat.png                                 the small icon of the notifications (patch-16 tells the push plugin to use it: without it the plugin takes the launcher
                                                                           icon, and an adaptive icon with a background is a white blot in the status bar)
  brand/res/drawable-<port|land>-<density>/screen.png                      the splash screen (the names and sizes of the original app, as apktool decodes them)
  brand/res/values/nx_brand.xml, brand/res/values-v31/nx_brand.xml         the color of the field, and the theme NxTheme
  brand/preview.png                                                        the icon behind a few launcher masks, the small icon and the splash screen (for the README)
"""
import json
import math
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RES = os.path.join(HERE, 'res')
NO_PNG = '--no-png' in sys.argv

FIELD = '#003547'        # tone 20 of the ramp of the seed color #1E6A8A (skin/src/tokens.css)
WHITE = '#FFFFFF'
NAME_COLOR = '#C2E8FF'   # tone 90
PRIMARY = '#196585'      # tone 40: the primary color of the skin (the color of the icon of the notifications in the shade)


# ------------------------------------------------------------------------------------------------ the mark
def f(v):
    s = ('%.3f' % v).rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


class Gate:
    """boards (`board` wide, `gap` between them, `per_leaf` in each leaf, `center` between the leaves) under one arch, from `top` to `bottom`, and rails across the leaves"""

    def __init__(self, cx, top, bottom, board, gap, center, per_leaf, rails):
        self.cx, self.top, self.bottom, self.board, self.gap, self.center, self.n, self.rails = cx, top, bottom, board, gap, center, per_leaf, rails
        self.leaf = per_leaf * board + (per_leaf - 1) * gap
        self.width = 2 * self.leaf + center
        self.r = self.width / 2.0
        self.spring = top + self.r
        self.left = cx - self.r

    def arch(self, x):
        """the height of the arch above the point x (a circle of radius r around (cx, spring))"""
        return self.spring - math.sqrt(max(0.0, self.r ** 2 - (x - self.cx) ** 2))

    def boards(self):
        xs = []
        for base in (self.left, self.cx + self.center / 2.0):
            xs += [base + i * (self.board + self.gap) for i in range(self.n)]
        return xs

    def path(self):
        """one path (non-zero fill): the six boards, each ending in the arc of the arch, and the rails; they overlap, so they are one shape"""
        p = []
        for x in self.boards():
            p.append('M%s,%sV%sA%s,%s 0 0 1 %s,%sV%sZ' % (f(x), f(self.bottom), f(self.arch(x)), f(self.r), f(self.r), f(x + self.board), f(self.arch(x + self.board)), f(self.bottom)))
        for y, h in self.rails:
            for base in (self.left, self.cx + self.center / 2.0):
                p.append('M%s,%sH%sV%sH%sZ' % (f(base), f(y), f(base + self.leaf), f(y + h), f(base)))
        return ''.join(p)

    def svg(self, canvas, fill=WHITE, x=0, y=0, scale=1):
        return '<path transform="translate(%s %s) scale(%s)" d="%s" fill="%s"/>' % (f(x), f(y), f(scale), self.path(), fill)


MASTER = Gate(54, 31.5, 76.5, 5, 3, 6, 3, ((61.5, 3),))      # the 108 grid: 48 x 45, centered on (54, 54)
LEGACY = Gate(24, 13, 35, 3, 1, 2, 3, ((28, 2),))            # the 48 grid:   24 x 22
SMALL = Gate(12, 3, 21, 2, 1, 2, 3, ((15, 1),))              # the 24 grid:   18 x 18


def svg_doc(w, h, viewbox, body):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%d" height="%d" shape-rendering="geometricPrecision">%s</svg>' % (viewbox, w, h, body)


# ------------------------------------------------------------------------------------------------ Android resources
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def vector(color, d, size=108):
    return ('<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="%ddp" android:height="%ddp" '
            'android:viewportWidth="%d" android:viewportHeight="%d">\n    <path android:fillColor="%s" android:pathData="%s"/>\n</vector>\n' % (size, size, size, size, color, d))


def build_xml():
    write(os.path.join(RES, 'drawable', 'ic_launcher_background.xml'), vector(FIELD, 'M0,0h108v108h-108z'))
    write(os.path.join(RES, 'drawable', 'ic_launcher_foreground.xml'), vector(WHITE, MASTER.path()))
    write(os.path.join(RES, 'drawable', 'ic_launcher_monochrome.xml'), vector('#FF000000', MASTER.path()))
    write(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
          '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
          '    <background android:drawable="@drawable/ic_launcher_background"/>\n    <foreground android:drawable="@drawable/ic_launcher_foreground"/>\n'
          '    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>\n</adaptive-icon>\n')
    write(os.path.join(RES, 'values', 'nx_brand.xml'),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="nx_splash_field">%s</color>\n'
          '    <!-- the theme of the activity: the same as before (Theme.DeviceDefault.NoActionBar), with the field of the splash screen as the color of the window -->\n'
          '    <style name="NxTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">\n        <item name="android:windowBackground">@color/nx_splash_field</item>\n    </style>\n</resources>\n' % FIELD)
    write(os.path.join(RES, 'values-v31', 'nx_brand.xml'),
          '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
          '    <!-- Android 12 and up show a splash screen of their own before the app: the same field, with the icon (the foreground of the adaptive icon) -->\n'
          '    <style name="NxTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">\n        <item name="android:windowBackground">@color/nx_splash_field</item>\n'
          '        <item name="android:windowSplashScreenBackground">@color/nx_splash_field</item>\n'
          '        <item name="android:windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>\n    </style>\n</resources>\n')


# ------------------------------------------------------------------------------------------------ PNG files (Chromium renders them)
LEGACY_PX = {'ldpi': 36, 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
SMALL_PX = {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}
# the sizes of the splash screens of the original app, per density: (portrait width, height); landscape is the same turned around
SPLASH = {'ldpi': (240, 320), 'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}


def legacy_svg(px):
    """the icon of Android 7 and older: a rounded square (44 of 48, 2 around it) in the field color with the mark on the 48 grid; 1 unit = px / 48 pixels"""
    body = '<rect x="2" y="2" width="44" height="44" rx="10" fill="%s"/>%s' % (FIELD, LEGACY.svg(48))
    return svg_doc(px, px, '0 0 48 48', body)


def small_svg(px):
    return svg_doc(px, px, '0 0 24 24', SMALL.svg(24))


def splash_html(w, h):
    """the splash screen: the plain field, the mark exactly in the middle (as the system puts it), the name under it. The mark is drawn at a whole, even number of
    pixels per unit, so that every edge (also those at half a unit) falls on a pixel. With CENTER_CROP the sides or the top and bottom can be cut off: the mark is
    about 40% of the shortest side."""
    short = min(w, h)
    k = max(2, int(round(short * 0.40 / MASTER.width / 2.0)) * 2)           # pixels per unit: 2, 4, 6, ...
    gw, gh = MASTER.width * k, (MASTER.bottom - MASTER.top) * k
    font = os.path.join(ROOT, 'skin', 'fonts-nx', 'roboto-flex-latin.woff2')
    name = max(10, int(short * 0.056))
    left = int(round(w / 2.0 - gw / 2.0))
    top = int(round(h / 2.0 - gh / 2.0))
    gap = int(round(short * 0.05))
    body = ('<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;left:%dpx;top:%dpx" width="%d" height="%d" viewBox="%s %s %s %s" shape-rendering="geometricPrecision">%s</svg>'
            % (left, top, gw, gh, f(MASTER.cx - MASTER.width / 2.0), f(MASTER.top), f(MASTER.width), f(MASTER.bottom - MASTER.top), MASTER.svg(108)))
    return ('<!doctype html><meta charset="utf-8"><style>@font-face{font-family:RF;src:url("file://%s");font-weight:100 1000}html,body{margin:0;width:%dpx;height:%dpx;overflow:hidden;background:%s}'
            'p{position:absolute;left:0;right:0;top:%dpx;margin:0;text-align:center;font:560 %dpx/1 RF,sans-serif;letter-spacing:%.1fpx;color:%s;font-variation-settings:"wdth" 108}</style><body>%s<p>MyNice Welcome</p></body>'
            % (font, w, h, FIELD, top + gh + gap, name, short * 0.004, NAME_COLOR, body))


def render(jobs):
    """jobs: [(html text, out png, width, height)]: one Chromium for all of them (the pages have a transparent background unless they paint one)"""
    spec = json.dumps([{'html': h, 'out': o, 'w': w, 'h': hh} for h, o, w, hh in jobs])
    script = ("const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const path = require('path');"
              "(async () => { const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const b = await chromium.launch(); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxbrand-'));"
              "for (const [i, j] of jobs.entries()) { const f = path.join(dir, i + '.html'); fs.writeFileSync(f, j.html); const p = await b.newPage({ viewport: { width: j.w, height: j.h }, deviceScaleFactor: 1 });"
              "await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: j.out, omitBackground: true }); await p.close(); } await b.close(); })();")
    tmp = os.path.join(HERE, '.jobs.json')
    open(tmp, 'w').write(spec)
    open(os.path.join(HERE, '.render.cjs'), 'w').write(script)
    try:
        subprocess.check_call(['node', os.path.join(HERE, '.render.cjs'), tmp])
    finally:
        for fn in (tmp, os.path.join(HERE, '.render.cjs')):
            if os.path.exists(fn):
                os.remove(fn)


def page(svg):
    return '<!doctype html><body style="margin:0;background:transparent">%s</body>' % svg


def build_png():
    jobs = []
    for d, px in LEGACY_PX.items():
        jobs.append((page(legacy_svg(px)), os.path.join(RES, 'mipmap-' + d, 'ic_launcher.png'), px, px))
    for d, px in SMALL_PX.items():
        jobs.append((page(small_svg(px)), os.path.join(RES, 'drawable-' + d, 'nx_stat.png'), px, px))
    for d, (w, h) in SPLASH.items():
        jobs.append((splash_html(w, h), os.path.join(RES, 'drawable-port-' + d, 'screen.png'), w, h))
        jobs.append((splash_html(h, w), os.path.join(RES, 'drawable-land-' + d, 'screen.png'), h, w))
    for _, out, _, _ in jobs:
        os.makedirs(os.path.dirname(out), exist_ok=True)
    render(jobs)


# ------------------------------------------------------------------------------------------------ the preview for the README
def adaptive_svg(size):
    return svg_doc(size, size, '0 0 108 108', '<rect width="108" height="108" fill="%s"/>%s' % (FIELD, MASTER.svg(108)))


def preview():
    """the icon behind the masks that launchers use (circle, squircle, rounded square) on a light and a dark wallpaper, at 48 dp, the icon of Android 13 that follows the
    wallpaper (the monochrome layer), the small icon of the notifications on a status bar, and the splash screen: one picture, for the README (docs/screenshots/brand.png)"""
    mono = svg_doc(108, 108, '0 0 108 108', '<rect width="108" height="108" fill="#c2e8ff"/>%s' % MASTER.svg(108, fill=FIELD))
    status = ('<div class="bar"><span>13:54</span>%s<span class="n">Closing</span></div>' % small_svg(24).replace('fill="#FFFFFF"', 'fill="#ffffff"'))
    css = ('body{margin:0;width:1240px;font:13px Roboto,sans-serif;color:#234}.row{display:flex;gap:26px;padding:22px 26px;align-items:flex-end}.light{background:#eef3f6}.dark{background:#10181c;color:#cde}'
           '.cell{display:flex;flex-direction:column;align-items:center;gap:8px}.m{width:108px;height:108px;overflow:hidden}.circle{border-radius:50%}.squircle{border-radius:34%}.round{border-radius:22%}'
           '.sm{width:48px;height:48px;overflow:hidden;border-radius:50%}.sm svg{width:48px;height:48px}.t{width:108px;height:108px;overflow:hidden;border-radius:50%}'
           '.s{height:230px;border-radius:12px;box-shadow:0 2px 10px #0006}.bar{display:flex;align-items:center;gap:12px;background:#10181c;color:#fff;padding:0 14px;height:36px;border-radius:8px;width:200px}'
           '.bar svg{width:24px;height:24px}.n{opacity:.75}')
    splash = 'file://' + os.path.join(RES, 'drawable-port-xxhdpi', 'screen.png')
    html = ['<!doctype html><meta charset="utf-8"><style>%s</style>' % css]
    for wall in ('light', 'dark'):
        html.append('<div class="row %s">' % wall)
        for cls in ('circle', 'squircle', 'round'):
            html.append('<div class="cell"><div class="m %s">%s</div><b>%s</b></div>' % (cls, adaptive_svg(108), cls.replace('round', 'rounded square')))
        html.append('<div class="cell"><div class="sm">%s</div><b>48 dp</b></div>' % adaptive_svg(48))
        html.append('<div class="cell"><div class="t">%s</div><b>themed (Android 13)</b></div>' % mono)
        if wall == 'light':
            html.append('<div class="cell"><div style="height:108px;display:flex;align-items:center">%s</div><b>notification</b></div>' % status)
            html.append('<div class="cell" style="margin-left:auto"><img class="s" src="%s"><b>splash screen</b></div>' % splash)
        html.append('</div>')
    render([(''.join(html), os.path.join(HERE, 'preview.png'), 1240, 520)])


if __name__ == '__main__':
    build_xml()
    if not NO_PNG:
        build_png()
        preview()
    print('brand/res written' + (' (without PNG files)' if NO_PNG else ''))
