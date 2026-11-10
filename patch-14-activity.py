#!/usr/bin/env python3
"""Patch nx14 (activity): the history of the accessory in a sheet (and, through patch-18, the entry on the accessory screen that opens it).

Usage: python patch-14-activity.py <apktool-output-dir>   (all or nothing; idempotent)

nx-activity.js reads the accessory's event log (what the app's own "Historian of events" page reads) and shows what was done, by whom,
when, and how the Wi-Fi module is doing (restarts, Wi-Fi drops). nx-patch.js starts it and offers $rootScope.nxActivity(device) and
$rootScope.nxLast(device) to the app's templates. This script:
  js/nx-activity.js (new): copied into the app
  index.html: loads it before nx-patch.js (nx-patch.js starts it)
The entry on the accessory screen (a chip with the last command, "Last: Close · today 14:12 · Anna", that opens the sheet; "Activity" while the log has not been read yet)
used to be put under the chips of the accessory and the home by this script. Since nx23 patch-18-accessory-layout.py makes the whole accessory screen, that chip included.
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


src_path = os.path.join(HERE, "nx-activity.js")
idx_path = os.path.join(WWW, "index.html")
for path in (src_path, idx_path):
    if not os.path.isfile(path):
        sys.exit("not found: " + path)
idx = read_text(idx_path)
if "nx-activity.js" in idx:
    sys.exit("already patched (nx14 activity)")

# ---- index.html: before nx-patch.js, which starts it
ANCHOR = '<script src="js/nx-patch.js"></script>'
if idx.count(ANCHOR) != 1:
    sys.exit("index.html: expected 1 nx-patch.js script line (patch-06 first), found %d" % idx.count(ANCHOR))
idx = idx.replace(ANCHOR, '<script src="js/nx-activity.js"></script>\n        ' + ANCHOR)

# everything matched: only now write
shutil.copy(src_path, os.path.join(WWW, "js", "nx-activity.js"))
write_text(idx_path, idx)
print("patched (nx14 activity): js/nx-activity.js, index.html")
