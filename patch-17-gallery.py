#!/usr/bin/env python3
"""Patch nx22 (design): Settings > Design, a reference page of Material 3 Expressive inside the app.

Usage: python patch-17-gallery.py <apktool-output-dir>   (all or nothing; idempotent)

nx-gallery.js builds one overlay on <body> the first time it is opened: every part of Material 3 Expressive (the 35 shapes that morph into each other, the springs,
buttons in five sizes, button groups, split button, FAB and FAB menu, the loading indicator, wavy progress, sliders, switches, chips, toolbars, lists, type, color) as a
working example, made with the stylesheet of the app itself (nx-expressive.css: what the page shows is what the screens are made of), with the numbers of the tokens under it.
It is a demo page, not a setting (nx23): a banner says that nothing on it controls the gate, the buttons that look like the real ones say "(demo)", the class names are behind a
switch "Developer notes". nx-patch.js offers $rootScope.nxGallery() to the Settings page when the script is there. This script:
  js/nx-gallery.js (new): copied into the app
  index.html: loads it before nx-patch.js (which looks for it when it starts)
  templates/settings/settings.html: a plain row "Design reference" with a chevron, at the end of the OTHER rows (nx22: in the Appearance card, with an avatar). patch-19-lists.py adds
  the row "Debug log" behind it
Where nxGallery does not exist (nx-gallery.js or nx-patch.js did not load) the row is not shown.
"""
import os
import re
import shutil
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
HERE = os.path.dirname(os.path.abspath(__file__))
WWW = os.path.join(sys.argv[1], "assets", "www")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


src_path = os.path.join(HERE, "nx-gallery.js")
idx_path = os.path.join(WWW, "index.html")
set_path = os.path.join(WWW, "templates", "settings", "settings.html")
for path in (src_path, idx_path, set_path):
    if not os.path.isfile(path):
        sys.exit("not found: " + path)
idx = read_text(idx_path)
settings = read_text(set_path)
if "nx-gallery.js" in idx or "nxGallery" in settings:
    sys.exit("already patched (nx22 design)")

# ---- index.html: before nx-patch.js, which looks for it
ANCHOR = '<script src="js/nx-patch.js"></script>'
if idx.count(ANCHOR) != 1:
    sys.exit("index.html: expected 1 nx-patch.js script line (patch-06 first), found %d" % idx.count(ANCHOR))
idx = idx.replace(ANCHOR, '<script src="js/nx-gallery.js"></script>\n        ' + ANCHOR)

# ---- settings.html: the row at the end of OTHER (before the lines with the version and the user), behind the rows of patch-13 and of the original app
if "nxSetPalette" not in settings:
    sys.exit("settings.html: the Appearance rows of patch-13 are not there (run patch-13 first)")
if "SETTINGS_PAGE_LABEL_MORE" not in settings:
    sys.exit("settings.html: the divider of the OTHER rows is not there")
VERSION = re.compile(r'(?m)^[ \t]*<div class="spacer bordo_filetto_grigio">\s*\n[ \t]*<span translate="SETTINGS_PAGE_APP_VERSION"')
found = list(VERSION.finditer(settings))
if len(found) != 1:
    sys.exit("settings.html: expected 1 line of the app version (after the OTHER rows), found %d" % len(found))
ROW = ('    <div class="item item-icon-right nx-design-row" role="button" tabindex="0" data-ng-if="nxGallery" data-ng-click="nxGallery()">\n'
       '      <span>Design reference</span>\n'
       '      <i class="icon ion-ios-arrow-forward"></i>\n'
       '    </div>\n\n')
if settings.index("SETTINGS_PAGE_LABEL_MORE") > found[0].start():
    sys.exit("settings.html: the line of the app version comes before the OTHER rows")
settings = settings[:found[0].start()] + ROW + settings[found[0].start():]

# everything matched: only now write
shutil.copy(src_path, os.path.join(WWW, "js", "nx-gallery.js"))
write_text(idx_path, idx)
write_text(set_path, settings)
print("patched (nx22 design): js/nx-gallery.js, index.html, settings.html")
