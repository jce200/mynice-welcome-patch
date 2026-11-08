#!/usr/bin/env python3
"""Patch nx18 (brand): a new app icon and a new splash screen.

Usage: python patch-16-brand.py <apktool-output-dir>   (all or nothing; idempotent)

brand/build-brand.py draws them (the same colors and the cookie shape as the skin, a gate of its own) and writes brand/res; this script puts that in the app:
  res/mipmap-*/ic_launcher.png            the icon of Android 7 and older (the original had the blue N in a house of Nice)
  res/mipmap-anydpi-v26/ic_launcher.xml   the adaptive icon of Android 8 and up (background, foreground, and a monochrome layer for the themed icons of Android 13)
  res/drawable/ic_launcher_*.xml          its layers (vector drawables)
  res/drawable-{port,land}-*/screen.png   the splash screen of the Cordova plugin (the original was "Welcome to your Nice World!", white on black)
  res/values/nx_brand.xml, values-v31/    the color of the field and the theme NxTheme: the theme of the activity, as before (Theme.DeviceDefault.NoActionBar) but with that
                                          color as the color of the window, and, from Android 12, as the color and the icon of the splash screen that the system shows first
  AndroidManifest.xml                     the activity MainActivity uses NxTheme
  res/xml/config.xml                      SplashMaintainAspectRatio: the splash picture is no longer stretched to the screen (FIT_XY) but scaled to cover it (CENTER_CROP), so that the
                                          logo keeps its shape on any screen; the pictures are made for that
Nothing else changes: the name of the app, the package and the permissions stay as they were.
"""
import os
import shutil
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "brand", "res")
OUT = sys.argv[1]
MANIFEST = os.path.join(OUT, "AndroidManifest.xml")
CONFIG = os.path.join(OUT, "res", "xml", "config.xml")
RES = os.path.join(OUT, "res")

OLD_THEME = 'android:theme="@android:style/Theme.DeviceDefault.NoActionBar"'
NEW_THEME = 'android:theme="@style/NxTheme"'
DELAY = '<preference name="SplashScreenDelay" value="3000" />'
ASPECT = '<preference name="SplashMaintainAspectRatio" value="true" />'


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


for p in (MANIFEST, CONFIG, SRC):
    if not os.path.exists(p):
        sys.exit("not found: " + p + (" (run brand/build-brand.py)" if p == SRC else ""))
files = []
for d, _, names in os.walk(SRC):
    for n in sorted(names):
        files.append(os.path.relpath(os.path.join(d, n), SRC))
files.sort()
if len(files) < 20 or not any(f.endswith("ic_launcher.xml") for f in files) or not any(f.endswith("screen.png") for f in files):
    sys.exit("brand/res is incomplete (%d files): run brand/build-brand.py" % len(files))

manifest = read_text(MANIFEST)
config = read_text(CONFIG)
if "NxTheme" in manifest or ASPECT in config or os.path.exists(os.path.join(RES, "mipmap-anydpi-v26", "ic_launcher.xml")):
    sys.exit("already patched (nx18 brand)")
if manifest.count(OLD_THEME) != 1:
    sys.exit("AndroidManifest.xml: expected 1 activity theme %s, found %d" % (OLD_THEME, manifest.count(OLD_THEME)))
if config.count(DELAY) != 1:
    sys.exit("config.xml: expected 1 %s, found %d" % (DELAY, config.count(DELAY)))
# the pictures that are replaced must be there (the folders of the original: a different name would leave the old picture next to the new one)
missing = [f for f in files if f.endswith(".png") and not os.path.isfile(os.path.join(RES, f))]
if missing:
    sys.exit("the original app has no " + ", ".join(missing[:3]) + " to replace (other names? check the decoded res folder)")

# everything matched: only now write
for f in files:
    dst = os.path.join(RES, f)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(os.path.join(SRC, f), dst)
write_text(MANIFEST, manifest.replace(OLD_THEME, NEW_THEME))
write_text(CONFIG, config.replace(DELAY, DELAY + "\n    " + ASPECT))
print("patched (nx18 brand): %d files in res/ (icon, adaptive icon, splash screens, theme), AndroidManifest.xml (NxTheme), config.xml (SplashMaintainAspectRatio)" % len(files))
