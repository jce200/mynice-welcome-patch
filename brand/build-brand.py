#!/usr/bin/env python3
"""The app icon and the splash screen (nx18): generates brand/res/, which patch-16-brand.py puts in the app.

Usage: python3 brand/build-brand.py [--no-png]     (Python 3; the PNG files need Node with playwright and its Chromium: NODE_PATH=<folder with node_modules>)

The icon is made of the same ingredients as the skin: the seed color #1E6A8A and its tonal ramp (skin/src/tokens.css), the "cookie" shape of the
state icon (skin/src/shapes.json) and a gate that is drawn here (an arched double gate with pickets). Everything is in a 108 x 108 canvas, as the
adaptive icon of Android wants it (the visible part is a 72 dp circle at most, the safe zone 66 dp):
  background   a plain field, tone 20 of the ramp
  foreground   the cookie in the primary color (tone 40), the gate in white
  monochrome   the gate alone (Android 13 and up tint it with the colors of the wallpaper)
The same picture, as PNG on a rounded square, is the icon of Android 7 and older (no adaptive icons there). The splash screen is that picture on the same
field with the name of the app under it; its size is made for ImageView.ScaleType.CENTER_CROP (config.xml: SplashMaintainAspectRatio), so whatever the
shape of the screen the logo stays in the middle and is not stretched. Android 12 and up show their own splash first (icon on a colored field): the
theme NxTheme gives that field the same color, so that the two do not differ.

Generated (committed, so that building the APK needs neither Node nor Chromium):
  brand/res/drawable/ic_launcher_{background,foreground,monochrome}.xml    vector drawables of the adaptive icon
  brand/res/mipmap-anydpi-v26/ic_launcher.xml                              the adaptive icon (Android 8 and up)
  brand/res/mipmap-<density>/ic_launcher.png                               the icon for older Android
  brand/res/drawable-<port|land>-<density>/screen.png                      the splash screen (the names and sizes of the original app, as apktool decodes them)
  brand/res/values/nx_brand.xml, brand/res/values-v31/nx_brand.xml         the color of the field, and the theme NxTheme
  brand/preview.png                                                        the icon behind a few launcher masks, and the splash screen (for the README)
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

# the tonal ramp of the seed color #1E6A8A (tokens.css has the same tones: primary #196585 is tone 40, the containers are 30 and 90)
FIELD = '#003547'        # tone 20
COOKIE = '#196585'       # tone 40 (the primary color of the skin)
GATE_COLOR = '#FFFFFF'
NAME_COLOR = '#C2E8FF'   # tone 90
SHAPES = json.load(open(os.path.join(ROOT, 'skin', 'src', 'shapes.json')))


# ------------------------------------------------------------------------------------------------ geometry (everything in the 108 x 108 canvas)
def shape_points(name):
    return [(float(a), float(b)) for a, b in re.findall(r'([\d.]+)%\s+([\d.]+)%', SHAPES[name])]


def smooth_path(pts, cx, cy, size):
    """a closed path through the points of a shape of the skin, `size` wide, centered at (cx, cy); Catmull-Rom as cubic Beziers"""
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    k = size / max(max(xs) - min(xs), max(ys) - min(ys))
    mx, my = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    P = [((x - mx) * k + cx, (y - my) * k + cy) for x, y in pts]
    n = len(P)
    d = ['M%.2f,%.2f' % P[0]]
    for i in range(n):
        p0, p1, p2, p3 = P[(i - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append('C%.2f,%.2f %.2f,%.2f %.2f,%.2f' % (c1 + c2 + p2))
    d.append('Z')
    return ''.join(d)


def rrect(x, y, w, h, r):
    """a rounded rectangle (corner radius r)"""
    r = min(r, w / 2, h / 2)
    f = lambda v: '%.2f' % v
    return ('M' + f(x + r) + ',' + f(y) + 'H' + f(x + w - r) + 'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + w) + ',' + f(y + r) +
            'V' + f(y + h - r) + 'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + w - r) + ',' + f(y + h) +
            'H' + f(x + r) + 'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x) + ',' + f(y + h - r) +
            'V' + f(y + r) + 'A' + f(r) + ',' + f(r) + ' 0 0 1 ' + f(x + r) + ',' + f(y) + 'Z')


def poly(pts):
    return 'M' + 'L'.join('%.2f,%.2f' % p for p in pts) + 'Z'


def gate(cx, cy, s):
    """an arched double gate: two posts, an arch over them, three pickets in each leaf with a gap between the leaves, the ground. `s` is its width."""
    u = s / 24.0
    x0, y0 = cx - 12 * u, cy - 11 * u
    p = [rrect(x0, y0 + 6.0 * u, 3.8 * u, 16.0 * u, 1.6 * u),            # left post
         rrect(x0 + 20.2 * u, y0 + 6.0 * u, 3.8 * u, 16.0 * u, 1.6 * u)]  # right post
    r_out, r_in, c = 12.0 * u, 8.4 * u, (x0 + 12.0 * u, y0 + 12.0 * u)    # the arch: a thick half ring on the two posts
    pts = [(c[0] - r_out * math.cos(math.pi * i / 24), c[1] - r_out * math.sin(math.pi * i / 24)) for i in range(25)]
    pts += [(c[0] - r_in * math.cos(math.pi * i / 24), c[1] - r_in * math.sin(math.pi * i / 24)) for i in range(24, -1, -1)]
    p.append(poly(pts))
    for i in range(3):                                                    # the pickets of the two leaves
        p.append(rrect(x0 + (5.4 + i * 2.6) * u, y0 + 9.0 * u, 1.5 * u, 11.6 * u, 0.75 * u))
        p.append(rrect(x0 + (13.0 + i * 2.6) * u, y0 + 9.0 * u, 1.5 * u, 11.6 * u, 0.75 * u))
    p.append(rrect(x0, y0 + 21.8 * u, 24.0 * u, 2.6 * u, 1.3 * u))        # the ground
    return ''.join(p)


BADGE = smooth_path(shape_points('cookie'), 54, 54, 78)
GATE_PATH = gate(54, 54, 46)
GATE_MONO = gate(54, 54, 50)


def svg_layers(with_field=True, badge_color=COOKIE, gate_color=GATE_COLOR, gate_path=None, badge=True, size=108, rounded=0):
    """the icon as SVG (the same picture as the adaptive icon): the field, the cookie and the gate"""
    clip = ''
    body = ''
    if with_field:
        body += '<rect width="108" height="108" fill="%s"/>' % FIELD
    if badge:
        body += '<path d="%s" fill="%s"/>' % (BADGE, badge_color)
    body += '<path d="%s" fill="%s"/>' % (gate_path or GATE_PATH, gate_color)
    if rounded:
        clip = '<clipPath id="r"><rect width="108" height="108" rx="%s"/></clipPath>' % rounded
        body = '<g clip-path="url(#r)">%s</g>' % body
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="%d" height="%d">%s%s</svg>' % (size, size, clip, body)


# ------------------------------------------------------------------------------------------------ Android resources
def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


def vector(paths, tint=None):
    head = ('<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" '
            'android:viewportWidth="108" android:viewportHeight="108">\n')
    body = ''.join('    <path android:fillColor="%s" android:pathData="%s"/>\n' % (color, d) for color, d in paths)
    return head + body + '</vector>\n'


def build_xml():
    write(os.path.join(RES, 'drawable', 'ic_launcher_background.xml'), vector([(FIELD, 'M0,0h108v108h-108z')]))
    write(os.path.join(RES, 'drawable', 'ic_launcher_foreground.xml'), vector([(COOKIE, BADGE), (GATE_COLOR, GATE_PATH)]))
    write(os.path.join(RES, 'drawable', 'ic_launcher_monochrome.xml'), vector([('#FF000000', GATE_MONO)]))
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
LEGACY = {'ldpi': 36, 'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
# the sizes of the splash screens of the original app, per density: (portrait width, height); landscape is the same turned around
SPLASH = {'ldpi': (240, 320), 'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}


def splash_html(w, h):
    """the splash screen: the plain field (the same color as the splash screen of Android 12 and up, so that the two do not differ), the icon (cookie and gate)
    exactly in the middle (as the system puts it), the name under it. With CENTER_CROP the sides or the top and bottom of the picture can be cut off: everything
    that matters is in the middle (the logo is a bit more than half of the shortest side, the cookie in it three quarters)."""
    short = min(w, h)
    logo = int(short * 0.54)
    font = os.path.join(ROOT, 'skin', 'fonts-nx', 'roboto-flex-latin.woff2')
    name = max(10, int(short * 0.056))
    return ('<!doctype html><meta charset="utf-8"><style>@font-face{font-family:RF;src:url("file://%s");font-weight:100 1000}'
            'html,body{margin:0;width:%dpx;height:%dpx;overflow:hidden;background:%s}'
            'svg{position:absolute;left:50%%;top:50%%;width:%dpx;height:%dpx;transform:translate(-50%%,-50%%)}'
            'p{position:absolute;left:0;right:0;top:calc(50%% + %dpx);margin:0;text-align:center;font:560 %dpx/1 RF,sans-serif;letter-spacing:%.1fpx;color:%s;'
            'font-variation-settings:"wdth" 108}</style><body>%s<p>MyNice Welcome</p></body>'
            ) % (font, w, h, FIELD, logo, logo, int(logo * 0.5 + short * 0.012), name, short * 0.004, NAME_COLOR, svg_layers(with_field=False, size=logo))


def render(jobs):
    """jobs: [(html text, out png, width, height)]: one Chromium for all of them"""
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
        for f in (tmp, os.path.join(HERE, '.render.cjs')):
            if os.path.exists(f):
                os.remove(f)


def build_png():
    jobs = []
    for d, px in LEGACY.items():
        # the icon of Android 7 and older: the picture on a rounded square (those launchers do not mask the icon)
        svg = svg_layers(size=px, rounded=24)
        jobs.append(('<!doctype html><body style="margin:0;background:transparent">%s</body>' % svg, os.path.join(RES, 'mipmap-' + d, 'ic_launcher.png'), px, px))
    for d, (w, h) in SPLASH.items():
        jobs.append((splash_html(w, h), os.path.join(RES, 'drawable-port-%s' % d, 'screen.png'), w, h))
        jobs.append((splash_html(h, w), os.path.join(RES, 'drawable-land-%s' % d, 'screen.png'), h, w))
    for _, out, _, _ in jobs:
        os.makedirs(os.path.dirname(out), exist_ok=True)
    render(jobs)


# ------------------------------------------------------------------------------------------------ the preview for the README
def preview():
    """the icon behind the masks that launchers use (circle, squircle, rounded square) on a light and a dark wallpaper, at 48 dp, the icon of Android 13 that
    follows the wallpaper (the monochrome layer), and the splash screen: as one picture, for the README (docs/screenshots/brand.png)"""
    def mask(cls):
        return '<div class="m %s">%s</div>' % (cls, svg_layers(size=108))
    mono = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108"><rect width="108" height="108" fill="#c2e8ff"/>'
            '<path d="%s" fill="#003547"/></svg>' % GATE_MONO)
    html = ['<!doctype html><meta charset="utf-8"><style>body{margin:0;width:1180px;font:13px Roboto,sans-serif;color:#234}.row{display:flex;gap:26px;padding:22px 26px;align-items:flex-end}'
            '.light{background:#eef3f6}.dark{background:#10181c;color:#cde}.cell{display:flex;flex-direction:column;align-items:center;gap:8px}.m{width:108px;height:108px;overflow:hidden}'
            '.circle{border-radius:50%}.squircle{border-radius:34%}.round{border-radius:22%}.sm{width:48px;height:48px;overflow:hidden;border-radius:50%}.sm svg{width:48px;height:48px}'
            '.t{width:108px;height:108px;overflow:hidden;border-radius:50%}.s{height:230px;border-radius:12px;box-shadow:0 2px 10px #0006}</style>']
    splash = 'file://' + os.path.join(RES, 'drawable-port-xxhdpi', 'screen.png')
    for wall in ('light', 'dark'):
        html.append('<div class="row %s">' % wall)
        html.append('<div class="cell">%s<b>circle</b></div><div class="cell">%s<b>squircle</b></div><div class="cell">%s<b>rounded square</b></div>' % (mask('circle'), mask('squircle'), mask('round')))
        html.append('<div class="cell"><div class="sm">%s</div><b>48 dp</b></div>' % svg_layers(size=48))
        html.append('<div class="cell"><div class="t">%s</div><b>themed (Android 13)</b></div>' % mono)
        if wall == 'light':
            html.append('<div class="cell" style="margin-left:auto"><img class="s" src="%s"><b>splash screen</b></div>' % splash)
        html.append('</div>')
    page = ''.join(html)
    render([(page, os.path.join(HERE, 'preview.png'), 1180, 520)])


if __name__ == '__main__':
    build_xml()
    if not NO_PNG:
        build_png()
        preview()
    print('brand/res written' + (' (without PNG files)' if NO_PNG else ''))
