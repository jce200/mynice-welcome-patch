#!/usr/bin/env python3
"""Patch nx11 (lists): "Checking…" instead of a premature "Not usable"; since nx18 also "Connecting…" while a new attempt runs.

Usage: python patch-11-checking-state.py <apktool-output-dir>   (all or nothing; idempotent)

The app shows the red label "Not usable" as soon as the first attempt of a reachability check fails, and nx-patch.js still
makes a second and third attempt after that. Right after startup the label also shows what the last session left in storage.
Neither is a confirmed status. nx-patch.js therefore offers $rootScope.nxCheck(device):
  'checking'  no result of this session yet: show a neutral "Checking…"
  'hold'      the last result was "reachable" and the check that is running has not failed for good: show nothing
  'retry'     the last result was "not reachable" and a new attempt to connect is running: show "Connecting…" (nx18; the screen used to
              keep saying "Not usable" while the app was trying again behind it)
  ''          nothing to add: the app's own rule applies
This script makes the lists ask that. Where nxCheck does not exist (nx-patch.js did not load) every expression falls back to
the original behavior: `!verifyDevice(x) && !nxCheck(x)` is the original `!verifyDevice(x)` when nxCheck is undefined.

Changed templates (assets/www/templates):
  favorites/favorites.html, favorites/add_favorites.html, settings/settings_device.html, settings/settings_scene_edit.html:
      the label under an accessory in a list
  system/controls_home.html: the label in the list of accessories of a home (it has its own "Connecting..." label already)
  system/device_detail.html: the state line at the top of the accessory screen
In that line nxCheck comes first in both expressions: isDeviceReachable(device) looks the accessory up in the app's home service and
writes some ten debug lines every time it is evaluated, so it must run once per digest and not twice (nx11 had it twice, which made the
accessory screen about 40% more talkative than the original app).
"""
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
WWW = os.path.join(sys.argv[1], "assets", "www")
CHECKING = "Checking&hellip;"
CONNECTING = "Connecting&hellip;"


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


# 1. the label under an accessory in a list: not inside an HTML comment (some are commented out in the original)
RE_BADGE = re.compile(r'(?<!<!--)<span class="item-nota" data-ng-hide="verifyDevice\((\w+)\)" translate="(\w+)"></span>(?!-->)')


def badge(m):
    x, key = m.group(1), m.group(2)
    return ('<span class="item-nota" data-ng-show="!verifyDevice(%s) && !nxCheck(%s)" translate="%s"></span>'
            '<span class="item-nota nx-checking" data-ng-show="!verifyDevice(%s) && nxCheck(%s) === \'checking\'">%s</span>'
            '<span class="item-nota nx-checking nx-connecting" data-ng-show="!verifyDevice(%s) && nxCheck(%s) === \'retry\'">%s</span>'
            % (x, x, key, x, x, CHECKING, x, x, CONNECTING))


# 2. controls_home.html: a label that already waits for isLoadingDevice
CONTROLS_OLD = ('<span class="item-nota" data-ng-show="!verifyDevice(device) && !isLoadingDevice(device.mac)" '
                'translate="CONTROLS_DEVICE_NOT_READY"></span>')
CONTROLS_NEW = ('<span class="item-nota" data-ng-show="!verifyDevice(device) && !nxCheck(device) && !isLoadingDevice(device.mac)" '
                'translate="CONTROLS_DEVICE_NOT_READY"></span>'
                '<span class="item-nota nx-checking" '
                'data-ng-show="!verifyDevice(device) && nxCheck(device) === \'checking\' && !isLoadingDevice(device.mac)">'
                + CHECKING + '</span>'
                '<span class="item-nota nx-checking nx-connecting" '
                'data-ng-show="!verifyDevice(device) && nxCheck(device) === \'retry\' && !isLoadingDevice(device.mac)">'
                + CONNECTING + '</span>')

# 3. device_detail.html: the state line; while not confirmed it says "Checking…" instead of "Not usable", and "Connecting…" during a new attempt
RE_DETAIL = re.compile(r'(?m)^([ \t]*)<strong data-ng-show="!isDeviceReachable\(data\.device\)">')

WORK = [
    ("templates/favorites/favorites.html", "badge", 1),
    ("templates/favorites/add_favorites.html", "badge", 1),
    ("templates/settings/settings_device.html", "badge", 1),
    ("templates/settings/settings_scene_edit.html", "badge", 1),
    ("templates/system/controls_home.html", "controls", 1),
    ("templates/system/device_detail.html", "detail", 1),
]

texts = {}
for rel, kind, expected in WORK:
    path = os.path.join(WWW, rel)
    if not os.path.isfile(path):
        sys.exit("not found: " + rel)
    texts[rel] = read_text(path)
if any("nxCheck" in t for t in texts.values()):
    sys.exit("already patched (nx11 lists)")

out = {}
for rel, kind, expected in WORK:
    t = texts[rel]
    if kind == "badge":
        t, n = RE_BADGE.subn(badge, t)
    elif kind == "controls":
        n = t.count(CONTROLS_OLD)
        t = t.replace(CONTROLS_OLD, CONTROLS_NEW)
    else:
        def detail(m):
            i = m.group(1)
            return ('%s<strong class="nx-checking-text" data-ng-show="nxCheck(data.device) && nxCheck(data.device) !== \'retry\' && !isDeviceReachable(data.device)">%s</strong>\n'
                    '%s<strong class="nx-checking-text nx-connecting" data-ng-show="nxCheck(data.device) === \'retry\' && !isDeviceReachable(data.device)">%s</strong>\n'
                    '%s<strong data-ng-show="!nxCheck(data.device) && !isDeviceReachable(data.device)">' % (i, CHECKING, i, CONNECTING, i))
        t, n = RE_DETAIL.subn(detail, t)
    if n != expected:
        sys.exit("%s: expected %d occurrence(s), found %d" % (rel, expected, n))
    out[rel] = t

# everything matched: only now write
for rel, t in out.items():
    write_text(os.path.join(WWW, rel), t)
print("patched (nx11 lists): %d templates (\"Checking...\" until the result is confirmed)" % len(out))
