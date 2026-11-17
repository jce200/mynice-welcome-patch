#!/usr/bin/env python3
"""Patch nx34 (notifications): the switch in Settings for a notification of Android when the gate moves.

Usage: python patch-25-notify.py <apktool-output-dir>   (all or nothing; idempotent)

Adds a group "Notifications" to templates/settings/settings.html, before "Appearance" (which patch-13-theme.py put there):
  - a switch "Notify when the gate moves" (nxNotify / nxSetNotify of nx-patch.js; the native layer, NxWatch, does the work)
  - a line that says what it costs: the app stays awake in the background, with a permanent notification
  - only while it is on and Android stands in the way: a row that opens the settings of Android for the notifications of this app, and one for running while the phone
    sleeps (nxNotifyInfo / nxNotifySettings)
Without nx-patch.js none of it is shown. The service and the permissions are in the manifest (patch-05-native-hooks.py).
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
path = os.path.join(sys.argv[1], "assets", "www", "templates", "settings", "settings.html")
if not os.path.isfile(path):
    sys.exit("not found: " + path)
text = open(path, encoding="utf-8", newline="").read()
if "nx-notify-row" in text:
    sys.exit("already patched (nx34 notifications)")

ANCHOR = '    <div class="item item-divider" data-ng-if="nxSetTheme">Appearance</div>\n'
if text.count(ANCHOR) != 1:
    sys.exit("settings.html: expected 1 x the heading Appearance, found %d (patch-13-theme.py has to run first)" % text.count(ANCHOR))

LABEL = "Notify when the gate moves"
ROWS = ('    <div class="item item-divider" data-ng-if="nxSetNotify">Notifications</div>\n'
        '    <div class="item item-toggle nx-notify-row" data-ng-if="nxSetNotify">\n'
        '      <span>' + LABEL + '</span>\n'
        '      <label class="toggle"><input type="checkbox" aria-label="' + LABEL + '" data-ng-checked="nxNotify()" data-ng-click="nxSetNotify(!nxNotify())">'
        '<div class="track"><div class="handle"></div></div></label>\n'
        '    </div>\n'
        '    <div class="item nx-notify-note" data-ng-if="nxSetNotify">While this is on the app stays awake in the background, with a permanent notification, and uses some battery. '
        'Swiping the app away stops it.</div>\n'
        '    <div class="item item-icon-right nx-notify-fix" data-ng-if="nxSetNotify && nxNotify() && nxNotifyInfo().allowed === false" data-ng-click="nxNotifySettings(\'notifications\')">\n'
        '      <span>Android blocks the notifications of this app. Allow them</span>\n'
        '      <i class="icon ion-ios-arrow-forward"></i>\n'
        '    </div>\n'
        '    <div class="item item-icon-right nx-notify-fix" data-ng-if="nxSetNotify && nxNotify() && nxNotifyInfo().battery === false" data-ng-click="nxNotifySettings(\'battery\')">\n'
        '      <span>Let the app run while the phone sleeps</span>\n'
        '      <i class="icon ion-ios-arrow-forward"></i>\n'
        '    </div>\n')
text = text.replace(ANCHOR, ROWS + ANCHOR)
open(path, "w", encoding="utf-8", newline="").write(text)
print("patched (nx34 notifications): templates/settings/settings.html")
