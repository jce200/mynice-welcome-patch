#!/usr/bin/env python3
"""Patch nx12 (theme): a choice between Auto, Light and Dark in the settings of the app.

Usage: python patch-13-theme.py <apktool-output-dir>   (all or nothing; idempotent)

The skin has a light and a dark palette and picks one with the WebView's prefers-color-scheme. Android's WebView takes that from
the Android theme of the app, and the theme of the Nice app is a dark base theme (Theme.DeviceDefault), so the app does not
necessarily follow the phone, and there was no way to choose. Now:
  js/nx-theme.js (new, in <head> before the stylesheets): puts the saved choice on <html> (data-nx-theme) before the first paint
  index.html: loads it
  templates/settings/settings.html: a row "Theme" with Auto | Light | Dark under the settings of the connection
nx-patch.js (nxTheme, nxSetTheme) saves the choice and applies it at once; the color tokens answer to data-nx-theme. Where nxSetTheme
does not exist (nx-patch.js did not load) the row is not shown.
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


src_path = os.path.join(HERE, "nx-theme.js")
idx_path = os.path.join(WWW, "index.html")
set_path = os.path.join(WWW, "templates", "settings", "settings.html")
for path in (src_path, idx_path, set_path):
    if not os.path.isfile(path):
        sys.exit("not found: " + path)
idx = read_text(idx_path)
settings = read_text(set_path)
if "nx-theme.js" in idx or "nxSetTheme" in settings:
    sys.exit("already patched (nx12 theme)")

# ---- index.html: the early script, before everything else that is loaded
ANCHOR = '<script src="lib/ionic/js/ionic.bundle.js"></script>'
if idx.count(ANCHOR) != 1:
    sys.exit("index.html: expected 1 ionic.bundle.js script line, found %d" % idx.count(ANCHOR))
idx = idx.replace(ANCHOR, '<script src="js/nx-theme.js"></script>\n        ' + ANCHOR)

# ---- settings.html: the row
DIVIDER = '    <div class="item item-divider" translate="SETTINGS_PAGE_LABEL_MORE"></div>\n'
if settings.count(DIVIDER) != 1:
    sys.exit("settings.html: expected 1 divider line (more), found %d" % settings.count(DIVIDER))


def seg(mode, label):
    return ('        <a class="nx-seg-btn" role="radio" tabindex="0" data-ng-class="{ \'nx-on\': nxTheme() === \'%s\' }" '
            'aria-checked="{{ nxTheme() === \'%s\' }}" data-ng-click="nxSetTheme(\'%s\')">%s</a>\n' % (mode, mode, mode, label))


ROW = ('    <div class="item item-divider" data-ng-if="nxSetTheme">Appearance</div>\n'
       '    <div class="item nx-theme-row" data-ng-if="nxSetTheme">\n'
       '      <span>Theme</span>\n'
       '      <div class="nx-seg" role="radiogroup" aria-label="Theme">\n'
       + seg("auto", "Auto") + seg("light", "Light") + seg("dark", "Dark") +
       '      </div>\n'
       '    </div>\n\n')
settings = settings.replace(DIVIDER, ROW + DIVIDER)

# everything matched: only now write
shutil.copy(src_path, os.path.join(WWW, "js", "nx-theme.js"))
write_text(idx_path, idx)
write_text(set_path, settings)
print("patched (nx12 theme): js/nx-theme.js, index.html, settings.html")
