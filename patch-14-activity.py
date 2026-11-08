#!/usr/bin/env python3
"""Patch nx14 (activity): the history of the accessory in a sheet, and a line on the accessory screen that opens it.

Usage: python patch-14-activity.py <apktool-output-dir>   (all or nothing; idempotent)

nx-activity.js reads the accessory's event log (what the app's own "Historian of events" page reads) and shows what was done, by whom,
when, and how the Wi-Fi module is doing (restarts, Wi-Fi drops). nx-patch.js starts it and offers $rootScope.nxActivity(device) and
$rootScope.nxLast(device) to the app's templates. This script:
  js/nx-activity.js (new): copied into the app
  index.html: loads it before nx-patch.js (nx-patch.js starts it)
  templates/system/device_detail.html: under the chips (accessory, home) a line with the last command ("Close · today 14:12 · Anna") that
      opens the sheet; "Activity" while the log has not been read yet
Where nxActivity does not exist (nx-patch.js did not load) the line is not shown.
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


src_path = os.path.join(HERE, "nx-activity.js")
idx_path = os.path.join(WWW, "index.html")
detail_path = os.path.join(WWW, "templates", "system", "device_detail.html")
for path in (src_path, idx_path, detail_path):
    if not os.path.isfile(path):
        sys.exit("not found: " + path)
idx = read_text(idx_path)
detail = read_text(detail_path)
if "nx-activity.js" in idx or "nxActivity" in detail:
    sys.exit("already patched (nx14 activity)")

# ---- index.html: before nx-patch.js, which starts it
ANCHOR = '<script src="js/nx-patch.js"></script>'
if idx.count(ANCHOR) != 1:
    sys.exit("index.html: expected 1 nx-patch.js script line (patch-06 first), found %d" % idx.count(ANCHOR))
idx = idx.replace(ANCHOR, '<script src="js/nx-activity.js"></script>\n        ' + ANCHOR)

# ---- device_detail.html: the line after the "home" chip
RE_HOME = re.compile(
    r'(?P<i>[ \t]*)<div class="device-row">\n'
    r'[ \t]*<span translate="DEVICE_DETAIL_LABEL_HOME"></span> \{\{ data\.homeName \}\}\n'
    r'[ \t]*</div>\n')


def home_new(m):
    i = m.group("i")
    return (m.group(0) +
            '%s<div class="device-row nx-last-row" data-ng-if="nxActivity">\n'
            '%s    <a class="nx-last" role="button" data-ng-click="nxActivity(data.device)">\n'
            '%s        <i class="nx-last-icon" aria-hidden="true"></i>\n'
            '%s        <span class="nx-last-text">{{ nxLast(data.device) || \'Activity\' }}</span>\n'
            '%s        <i class="nx-last-chev" aria-hidden="true"></i>\n'
            '%s    </a>\n'
            '%s</div>\n' % (i, i, i, i, i, i, i))


detail, n = RE_HOME.subn(home_new, detail)
if n != 1:
    sys.exit("device_detail.html: expected 1 'home' row, found %d" % n)

# everything matched: only now write
shutil.copy(src_path, os.path.join(WWW, "js", "nx-activity.js"))
write_text(idx_path, idx)
write_text(detail_path, detail)
print("patched (nx14 activity): js/nx-activity.js, index.html, device_detail.html")
