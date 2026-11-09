#!/usr/bin/env python3
"""Patch nx22 (design): Settings > Design, a reference page of Material 3 Expressive inside the app.

Usage: python patch-17-gallery.py <apktool-output-dir>   (all or nothing; idempotent)

nx-gallery.js builds one overlay on <body> the first time it is opened: every part of Material 3 Expressive (the 35 shapes that morph into each other, the springs,
buttons in five sizes, button groups, split button, FAB and FAB menu, the loading indicator, wavy progress, sliders, switches, chips, toolbars, lists, type, color) as a
working example, made with the stylesheet of the app itself (nx-expressive.css: what the page shows is what the screens are made of), with the numbers of the tokens under it.
nx-patch.js offers $rootScope.nxGallery() to the Settings page when the script is there. This script:
  js/nx-gallery.js (new): copied into the app
  index.html: loads it before nx-patch.js (which looks for it when it starts)
  templates/settings/settings.html: a row "Design" with a chevron, at the end of the Appearance rows (after the rows of patch-13)
Where nxGallery does not exist (nx-gallery.js or nx-patch.js did not load) the row is not shown.
"""
import os
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

# ---- settings.html: the row, behind the Theme and Colors rows of patch-13
if "nxSetPalette" not in settings:
    sys.exit("settings.html: the Appearance rows of patch-13 are not there (run patch-13 first)")
DIVIDER = '    <div class="item item-divider" translate="SETTINGS_PAGE_LABEL_MORE"></div>\n'
if settings.count(DIVIDER) != 1:
    sys.exit("settings.html: expected 1 divider line (more), found %d" % settings.count(DIVIDER))
ROW = ('    <div class="item item-icon-right nx-design-row" role="button" tabindex="0" data-ng-if="nxGallery" data-ng-click="nxGallery()">\n'
       '      <span>Design</span>\n'
       '      <i class="icon ion-ios-arrow-forward"></i>\n'
       '      <span class="item-nota">Material 3 Expressive</span>\n'
       '    </div>\n\n')
settings = settings.replace(DIVIDER, ROW + DIVIDER)

# everything matched: only now write
shutil.copy(src_path, os.path.join(WWW, "js", "nx-gallery.js"))
write_text(idx_path, idx)
write_text(set_path, settings)
print("patched (nx22 design): js/nx-gallery.js, index.html, settings.html")
