#!/usr/bin/env python3
"""Patch nx9 (appearance): the app in the style of Material 3 Expressive.

Usage: python patch-10-skin.py <apktool-output-dir>   (all or nothing; idempotent)

What it does: puts skin/nx-expressive.css into assets/www/css (color roles from the Material scheme "vibrant", light and dark
following the system; shapes, lists, navigation bar, buttons, the hero on the device screen, the connection status), the
font Roboto Flex (OFL, skin/fonts-nx) into assets/www/fonts-nx, and a <link> in index.html directly after fontello.css
so that the skin overrides the original styles.

It is appearance only: no function of the app changes. The CSS is generated from skin/src (build-css.py); what
goes into the app here is the result, so change the source and regenerate, not the result.
"""
import os
import shutil
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(sys.argv[1], "assets", "www")
SKIN = os.path.join(HERE, "skin")

css_path = os.path.join(SKIN, "nx-expressive.css")
font_path = os.path.join(SKIN, "fonts-nx", "roboto-flex-latin.woff2")
license_path = os.path.join(SKIN, "fonts-nx", "ROBOTO-FLEX-LICENSE.txt")
idx_path = os.path.join(WWW, "index.html")

for path in (css_path, font_path, license_path, idx_path):
    if not os.path.isfile(path):
        sys.exit("missing: " + path)
css = open(css_path, encoding="utf-8").read()
if "{{" in css or "}}" in css:
    sys.exit("skin/nx-expressive.css still contains an unfilled placeholder: run skin/src/build-css.py again")

idx = open(idx_path, encoding="utf-8", newline="").read()
if "nx-expressive.css" in idx:
    sys.exit("already patched (nx9)")
TAG = '<link href="css/fontello.css" rel="stylesheet">'
if idx.count(TAG) != 1:
    sys.exit("index.html: the fontello line was found %d times (expected 1)" % idx.count(TAG))
idx = idx.replace(TAG, TAG + '\n        <link href="css/nx-expressive.css" rel="stylesheet">')

# everything succeeded: only now write
os.makedirs(os.path.join(WWW, "fonts-nx"), exist_ok=True)
shutil.copy(css_path, os.path.join(WWW, "css", "nx-expressive.css"))
shutil.copy(font_path, os.path.join(WWW, "fonts-nx", "roboto-flex-latin.woff2"))
shutil.copy(license_path, os.path.join(WWW, "fonts-nx", "ROBOTO-FLEX-LICENSE.txt"))
open(idx_path, "w", encoding="utf-8", newline="").write(idx)
print("patched (nx9 appearance): css/nx-expressive.css (%d bytes), fonts-nx/roboto-flex-latin.woff2, index.html" % len(css.encode("utf-8")))
