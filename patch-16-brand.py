#!/usr/bin/env python3
"""Patch nx18/nx20 (brand): the logo of Nice as an adaptive icon, a small icon for the notifications, and a splash screen with the logo on the colors of the skin.

Usage: python patch-16-brand.py <apktool-output-dir>   (all or nothing; idempotent)

The logo is NOT in this repository. The script reads the launcher icon that is in the app you patch (res/mipmap-xxxhdpi/ic_launcher.png, the blue house with the white N),
takes it apart into a gradient and two shapes (brand/logo.py) and draws the files below from that (brand/assets.py), sharp at every size. If the icon is not what is expected
(another app, another version), the script stops without changing anything.

  res/mipmap-*/ic_launcher_foreground.png    the logo on the canvas of the adaptive icon (Android 8 and up)
  res/mipmap-*/ic_launcher_monochrome.png    its silhouette (the house with the N cut out): the layer for the themed icons of Android 13
  res/mipmap-anydpi-v26/ic_launcher.xml      the adaptive icon: the white background and those two layers
  res/mipmap-*/ic_launcher.png               NOT touched: the original icons stay for Android 7 and older
  res/drawable-*/nx_stat.png                 the small icon of the notifications (white silhouette, 24 dp). Without it the push plugin takes the launcher icon, and an adaptive
                                             icon has a background: in the status bar Android shows only the shape of an icon, so that would be a white blot
  assets/www/js/app.min.js                   PushNotification.init gets icon: "nx_stat" and iconColor (the blue of the logo): the plugin keeps these and uses them for every notification
  res/drawable-{port,land}[-night]-*/screen.png   the splash screen of the Cordova plugin (the original was "Welcome to your Nice World!", white on black): the logo on the surface color
                                             of the skin, light, and dark for the night mode (so that the app does not open with a white flash)
  res/drawable-*/nx_splash_icon.png          the icon of the splash screen that Android 12 and up show first
  res/values/nx_brand.xml, values-night/, values-v31/   the colors, and the theme NxTheme: the theme of the activity, as before (Theme.DeviceDefault.NoActionBar) but with the surface
                                             color as the color of the window, and, from Android 12, as the color and the icon of the splash screen
  AndroidManifest.xml                        the activity MainActivity uses NxTheme
  res/xml/config.xml                         SplashMaintainAspectRatio: the splash picture is no longer stretched to the screen (FIT_XY) but scaled to cover it (CENTER_CROP), so that the
                                             logo keeps its shape on any screen; the pictures are made for that
Nothing else changes: the name of the app, the package and the permissions stay as they were.
"""
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "brand"))      # python -I does not put the folder of the script on the path
import assets  # noqa: E402
import logo  # noqa: E402

if len(sys.argv) != 2:
    sys.exit(__doc__)
OUT = sys.argv[1]
MANIFEST = os.path.join(OUT, "AndroidManifest.xml")
APP = os.path.join(OUT, "assets", "www", "js", "app.min.js")
CONFIG = os.path.join(OUT, "res", "xml", "config.xml")
RES = os.path.join(OUT, "res")

OLD_THEME = 'android:theme="@android:style/Theme.DeviceDefault.NoActionBar"'
NEW_THEME = 'android:theme="@style/NxTheme"'
DELAY = '<preference name="SplashScreenDelay" value="3000" />'
ASPECT = '<preference name="SplashMaintainAspectRatio" value="true" />'
PUSH_OLD = 'PushNotification.init({android:{senderID:PUSH_SENDER_ID},ios:'
PUSH_NEW = 'PushNotification.init({android:{senderID:PUSH_SENDER_ID,icon:"nx_stat",iconColor:"%s"},ios:'
SCREEN_FOLDER = re.compile(r"^drawable-(port|land)-(ldpi|mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


for p in (MANIFEST, CONFIG, APP, RES):
    if not os.path.exists(p):
        sys.exit("not found: " + p)
manifest = read_text(MANIFEST)
config = read_text(CONFIG)
app = read_text(APP)
if "NxTheme" in manifest or ASPECT in config or "nx_stat" in app or os.path.exists(os.path.join(RES, "mipmap-anydpi-v26", "ic_launcher.xml")):
    sys.exit("already patched (nx18/nx20 brand)")
if manifest.count(OLD_THEME) != 1:
    sys.exit("AndroidManifest.xml: expected 1 activity theme %s, found %d" % (OLD_THEME, manifest.count(OLD_THEME)))
if config.count(DELAY) != 1:
    sys.exit("config.xml: expected 1 %s, found %d" % (DELAY, config.count(DELAY)))
if app.count(PUSH_OLD) != 1:
    sys.exit("app.min.js: expected 1 %s, found %d" % (PUSH_OLD, app.count(PUSH_OLD)))

# --- the logo: the launcher icon of the app itself
icons = [os.path.join(RES, d, "ic_launcher.png") for d in sorted(os.listdir(RES)) if re.match(r"^mipmap-xxxhdpi(-v\d+)?$", d)]
icons = [p for p in icons if os.path.isfile(p)]
if len(icons) != 1:
    sys.exit("expected 1 res/mipmap-xxxhdpi/ic_launcher.png (the logo to start from), found %d" % len(icons))
try:
    mark = logo.Mark(open(icons[0], "rb").read())
except (logo.MarkError, ValueError) as e:
    sys.exit("%s: %s" % (os.path.relpath(icons[0], OUT), e))

# --- the splash screens of the original: the pictures that are replaced (their names and sizes are kept)
screens = {}
for d in sorted(os.listdir(RES)):
    path = os.path.join(RES, d, "screen.png")
    if d.startswith("drawable-") and os.path.isfile(path):
        if not SCREEN_FOLDER.match(d):
            sys.exit("res/%s/screen.png: an unexpected folder name (expected drawable-port-xxhdpi and the like; another name would leave the old picture next to the new one)" % d)
        head = open(path, "rb").read(24)
        if head[:8] != logo.PNG_SIGNATURE:
            sys.exit("res/%s/screen.png is not a PNG file" % d)
        screens[d + "/screen.png"] = struct.unpack(">II", head[16:24])
if len(screens) < 6 or not any("-port-" in k for k in screens) or not any("-land-" in k for k in screens):
    sys.exit("expected the splash pictures res/drawable-{port,land}-<density>/screen.png of the original app, found %d" % len(screens))

files = assets.all_files(mark, screens)
# nothing may exist yet, except the pictures of the original that are replaced
taken = sorted(f for f in files if os.path.exists(os.path.join(RES, f)) and f not in screens)
if taken:
    sys.exit("already there: " + ", ".join(taken[:4]))

# everything matched: only now write
for f in sorted(files):
    dst = os.path.join(RES, f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, "wb") as fh:
        fh.write(files[f])
color = assets.hexcolor(mark.base_color)
write_text(MANIFEST, manifest.replace(OLD_THEME, NEW_THEME))
write_text(CONFIG, config.replace(DELAY, DELAY + "\n    " + ASPECT))
write_text(APP, app.replace(PUSH_OLD, PUSH_NEW % color))
print("patched (nx20 brand): the logo of Nice as %d files in res/ (adaptive icon with a themed layer, small icon, splash icon, %d splash screens in light and dark, theme), "
      "AndroidManifest.xml (NxTheme), config.xml (SplashMaintainAspectRatio), app.min.js (the icon of the notifications, %s)" % (len(files), len(screens), color))
