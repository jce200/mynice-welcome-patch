#!/usr/bin/env python3
"""The files that patch-16-brand.py (nx20) draws from the logo of Nice and puts in the app. Sizes are in dp (1 dp = 1 px on mdpi). The logo is placed by the smallest
circle around it (Mark.circle: the roof and the two lower corners lie on it), so that it keeps the same distance to the edge of any mask.

  mipmap-<d>/ic_launcher_foreground.png    the logo on the 108 x 108 dp canvas of the adaptive icon, inside the safe zone (a circle of 66 dp; the launcher shows 72 dp of it)
  mipmap-<d>/ic_launcher_monochrome.png    the house with the N cut out, one color: the layer for the themed icons of Android 13 (the launcher colors it)
  mipmap-anydpi-v26/ic_launcher.xml        the adaptive icon: a white background, the two layers above
  drawable-<d>/nx_stat.png                 the same silhouette, white, 24 x 24 dp: the small icon of the notifications (Android shows only the shape of it)
  drawable-<d>/nx_splash_icon.png          the icon of the splash screen that Android 12 and up show first: 288 x 288 dp, the logo inside the circle of 192 dp that is visible
  drawable-<port|land>[-night]-<d>/screen.png   the splash screen of the Cordova plugin: the logo on the surface color of the skin (light; dark for the night mode), in the
                                                sizes of the pictures of the original app (a picture of it is replaced, the night ones are new)
  values/nx_brand.xml, values-night/, values-v31/   the colors and the theme NxTheme of the activity (the window has the color of the splash screen from the first moment)

The launcher icons of Android 7 and older (res/mipmap-<d>/ic_launcher.png) are not touched: they are the original logo.
"""
import logo

DENSITIES = (('mdpi', 1.0), ('hdpi', 1.5), ('xhdpi', 2.0), ('xxhdpi', 3.0), ('xxxhdpi', 4.0))

ADAPTIVE_CANVAS = 108.0        # dp
ADAPTIVE_RADIUS = 31.0         # dp: the radius of the circle around the logo (the safe zone of Android has 33; a circular mask shows 36)
STATUS_CANVAS = 24.0
STATUS_HEIGHT = 20.0           # dp: the height of the house in the small icon (2 dp of air above and below)
SPLASH_CANVAS = 288.0
SPLASH_RADIUS = 76.0           # dp: the radius of the circle around the logo; Android 12 shows a circle of 96 of this icon
SCREEN_LOGO = 0.27             # the height of the logo on a splash screen, as a part of its shorter side

WHITE = (0xFF, 0xFF, 0xFF)     # the background of the adaptive icon: the logo is made for white
LIGHT = (0xF6, 0xFA, 0xFE)     # surface of the light theme of the skin (skin/src/tokens.css)
DARK = (0x0F, 0x14, 0x17)      # surface of the dark theme


def hexcolor(rgb):
    return '#%02X%02X%02X' % tuple(rgb)


def _by_circle(mark, canvas_w, canvas_h, cx, cy, radius):
    """draws the logo with the center of its circle at (cx, cy) and the radius of that circle `radius` pixels"""
    mx, my, mr = mark.circle
    scale = radius / mr
    return mark.render(scale, cx - mx * scale, cy - my * scale, canvas_w, canvas_h)


def _by_box(mark, canvas_w, canvas_h, height):
    """draws the logo with its box centered on the canvas and `height` pixels high"""
    x0, y0, x1, y1 = mark.box
    scale = height / (y1 - y0)
    return mark.render(scale, canvas_w / 2.0 - (x0 + x1) / 2.0 * scale, canvas_h / 2.0 - (y0 + y1) / 2.0 * scale, canvas_w, canvas_h)


def _png(tile, pixels, w, h):
    canvas = bytearray(4 * w * h)
    logo.paste(canvas, w, h, pixels, tile)
    return logo.write_png(w, h, canvas, 4)


def launcher_layers(mark):
    files = {}
    for name, d in DENSITIES:
        size = int(round(ADAPTIVE_CANVAS * d))
        tile = _by_circle(mark, size, size, size / 2.0, size / 2.0, ADAPTIVE_RADIUS * d)
        files['mipmap-%s/ic_launcher_foreground.png' % name] = _png(tile, tile.rgba(), size, size)
        files['mipmap-%s/ic_launcher_monochrome.png' % name] = _png(tile, tile.silhouette((0, 0, 0)), size, size)
    return files


def status_icons(mark):
    files = {}
    for name, d in DENSITIES:
        size = int(round(STATUS_CANVAS * d))
        tile = _by_box(mark, size, size, STATUS_HEIGHT * d)
        files['drawable-%s/nx_stat.png' % name] = _png(tile, tile.silhouette((255, 255, 255)), size, size)
    return files


def splash_icons(mark):
    files = {}
    for name, d in DENSITIES:
        size = int(round(SPLASH_CANVAS * d))
        tile = _by_circle(mark, size, size, size / 2.0, size / 2.0, SPLASH_RADIUS * d)
        files['drawable-%s/nx_splash_icon.png' % name] = _png(tile, tile.rgba(), size, size)
    return files


def night_name(rel):
    """'drawable-port-xxhdpi/screen.png' -> 'drawable-port-night-xxhdpi/screen.png' (the order of the qualifiers: orientation, night mode, density)"""
    folder, name = rel.rsplit('/', 1)
    parts = folder.split('-')
    return '-'.join(parts[:-1] + ['night', parts[-1]]) + '/' + name


def splash_screens(mark, screens):
    """screens: {'drawable-port-xxhdpi/screen.png': (960, 1600), ...}, the names and sizes of the pictures of the original app. Returns those names (light) and the names
    of the night variants, as PNG files (RGB). The logo is drawn once per size and laid on both backgrounds."""
    files = {}
    drawn = {}
    for rel in sorted(screens):
        w, h = screens[rel]
        if (w, h) not in drawn:
            short = min(w, h)
            x0, y0, x1, y1 = mark.box
            radius = SCREEN_LOGO * short * mark.circle[2] / (y1 - y0)
            tile = _by_circle(mark, w, h, w / 2.0, h / 2.0, radius)
            drawn[(w, h)] = (tile, tile.rgba())
        tile, pixels = drawn[(w, h)]
        for path, color in ((rel, LIGHT), (night_name(rel), DARK)):
            rows = [bytes(color) * w] * h
            logo.over(pixels, tile, color, w, h, rows)
            files[path] = logo.write_png(w, h, b''.join(rows), 3)
    return files


def xml_files():
    head = '<?xml version="1.0" encoding="utf-8"?>\n'
    files = {
        'mipmap-anydpi-v26/ic_launcher.xml': head + '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/nx_icon_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n'
        '</adaptive-icon>\n',
        'values/nx_brand.xml': head + '<resources>\n'
        '    <color name="nx_icon_background">%s</color>\n'
        '    <color name="nx_splash_field">%s</color>\n'
        '    <!-- the theme of the activity: the same as before (Theme.DeviceDefault.NoActionBar), with the surface color of the skin as the color of the window -->\n'
        '    <style name="NxTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">\n'
        '        <item name="android:windowBackground">@color/nx_splash_field</item>\n'
        '    </style>\n'
        '</resources>\n' % (hexcolor(WHITE), hexcolor(LIGHT)),
        'values-night/nx_brand.xml': head + '<resources>\n'
        '    <color name="nx_splash_field">%s</color>\n'
        '</resources>\n' % hexcolor(DARK),
        'values-v31/nx_brand.xml': head + '<resources>\n'
        '    <!-- Android 12 and up show a splash screen of their own before the app: the same surface color, with the logo -->\n'
        '    <style name="NxTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">\n'
        '        <item name="android:windowBackground">@color/nx_splash_field</item>\n'
        '        <item name="android:windowSplashScreenBackground">@color/nx_splash_field</item>\n'
        '        <item name="android:windowSplashScreenAnimatedIcon">@drawable/nx_splash_icon</item>\n'
        '    </style>\n'
        '</resources>\n',
    }
    return dict((k, v.encode('utf-8')) for k, v in files.items())


def all_files(mark, screens):
    """every file that is added to res/ (or, for the splash screens, replaced there): {relative path: bytes}"""
    files = {}
    for part in (launcher_layers(mark), status_icons(mark), splash_icons(mark), splash_screens(mark, screens), xml_files()):
        files.update(part)
    return files
