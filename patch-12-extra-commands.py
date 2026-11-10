#!/usr/bin/env python3
"""Patch nx12 (extra buttons): more than one optional command next to Open, Close and Stop. nx23: the taps of the pad, and the words of the page.

Usage: python patch-12-extra-commands.py <apktool-output-dir>   (all or nothing; idempotent)

The app has ONE optional "fourth button" (page "Optional command" in the accessory settings), and all other secondary commands
("Open and Block", "Release and Close", ...) sit behind the eye icon. nx-patch.js (section 8) keeps a list of ticked commands per
accessory and offers it to the app's templates as $rootScope.nxExtra(device), nxQuickHas, nxQuickToggle, nxCanQuick and nxEditQuick.
This script makes two templates use it (assets/www/templates):
  system/device_detail.html: the ticked commands as buttons under Open, Close and Stop, and a link "Edit extra buttons" ("Add extra
                             buttons" while none is ticked)
  settings/device_4th_button.html: the radio list (one choice) becomes a list in which any number of commands can be ticked, with a
                             hint that is always there (not only when the switch is on) and one line about Block and Release
nx23 (command feedback): every tap of Open, Close, Stop and of the extra buttons goes through $rootScope.nxRun(device, code, primary,
runCommand) of nx-patch.js (section 9). It calls the app's own runCommand first and unchanged and notes what became of the tap (the
status line says sending, sent, not sent). The old "<command>: sent" message of the extra buttons, shown at the tap whether or not
anything went out, is gone. This script owns the ng-click of those buttons; the layout script (patch-18) anchors on the start tags and
class names only.
Where nxRun / nxExtra / nxQuickToggle do not exist (nx-patch.js did not load) the buttons call runCommand as before, the old fourth
button stays visible and the radio list stays in place.
"""
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
WWW = os.path.join(sys.argv[1], "assets", "www")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


detail_path = os.path.join(WWW, "templates", "system", "device_detail.html")
pick_path = os.path.join(WWW, "templates", "settings", "device_4th_button.html")
for path in (detail_path, pick_path):
    if not os.path.isfile(path):
        sys.exit("not found: " + os.path.relpath(path, WWW))
detail = read_text(detail_path)
pick = read_text(pick_path)
if "nxExtra" in detail or "nxQuickToggle" in pick:
    sys.exit("already patched (nx12 extra buttons)")

# ---- 1. the accessory screen: the old fourth button only while nx-patch.js is not there; the ticked commands next to it
RE_DETAIL = re.compile(
    r'(?P<i>[ \t]*)<a class="command bg-blue-4"\n'
    r'(?P<j>[ \t]*)data-ng-click="runCommand\(data\.device\.automations\[0\]\.fourthButton\.code, false\)"\n'
    r'[ \t]*data-ng-if="data\.device\.automations\[0\]\.fourthButtonEnabled && data\.device\.automations\[0\]\.fourthButton">\n'
    r'[ \t]*<span translate="\{\{ \'DEVICE_COMMAND_\'\+data\.device\.automations\[0\]\.fourthButton\.code \}\}"></span>\n'
    r'[ \t]*</a>\n')


def detail_new(m):
    i, j = m.group("i"), m.group("j")
    return (
        '%s<a class="command bg-blue-4"\n'
        '%sdata-ng-click="runCommand(data.device.automations[0].fourthButton.code, false)"\n'
        '%sdata-ng-if="!nxExtra && data.device.automations[0].fourthButtonEnabled && data.device.automations[0].fourthButton">\n'
        '%s    <span translate="{{ \'DEVICE_COMMAND_\'+data.device.automations[0].fourthButton.code }}"></span>\n'
        '%s</a>\n'
        '\n'
        '%s<div class="nx-extras" data-ng-if="nxExtra(data.device).length">\n'
        '%s    <a class="command nx-extra" data-ng-repeat="code in nxExtra(data.device) track by code"\n'
        '%s       data-ng-click="nxRun ? nxRun(data.device, code, false, runCommand) : runCommand(code, false)">\n'
        '%s        <span translate="{{ \'DEVICE_COMMAND_\'+code }}"></span>\n'
        '%s    </a>\n'
        '%s</div>\n'
        '%s<a class="nx-extra-edit" data-ng-if="nxCanQuick && nxCanQuick(data.device)" data-ng-click="nxEditQuick(data.device)">'
        '<span>{{ nxExtra(data.device).length ? \'Edit extra buttons\' : \'Add extra buttons\' }}</span></a>\n'
        % (i, j, j, i, i, i, i, i, i, i, i, i))


detail, n1 = RE_DETAIL.subn(detail_new, detail)
if n1 != 1:
    sys.exit("device_detail.html: expected 1 fourth-button block, found %d" % n1)

# nx23: Open, Close and Stop (the app's primary commands) go through nxRun as well; runCommand is the app's own and is called first and unchanged
RE_PRIMARY = re.compile(r'data-ng-click="runCommand\(item, true\)"')
detail, n1b = RE_PRIMARY.subn('data-ng-click="nxRun ? nxRun(data.device, item, true, runCommand) : runCommand(item, true)"', detail)
if n1b != 1:
    sys.exit("device_detail.html: expected 1 primary command button, found %d" % n1b)

# ---- 2. the page "Optional command": any number of commands can be ticked
RE_PICK = re.compile(
    r'(?P<i>[ \t]*)(?P<radio><ion-radio class="item-checkbox-right" collection-repeat="item in data\.secondaryCommands" '
    r'data-ng-model="data\.fourthButton" data-ng-value="item\.code" data-ng-click="saveConfiguration\(item\.code\)">\n'
    r'[ \t]*<span translate="\{\{ \'DEVICE_COMMAND_\'\+item\.code \}\}"></span>\n'
    r'[ \t]*</ion-radio>)\n')


def pick_new(m):
    i = m.group("i")
    return (
        '%s<div data-ng-if="nxQuickToggle">\n'
        '%s  <div class="nx-pick-hint">Each ticked command becomes a button under Open, Close and Stop.</div>\n'
        '%s  <div class="item nx-pick" role="checkbox" tabindex="0" data-ng-repeat="item in data.secondaryCommands track by item.code"\n'
        '%s       data-ng-class="{ \'nx-picked\': nxQuickHas(data.device, item.code) }" aria-checked="{{ nxQuickHas(data.device, item.code) }}"\n'
        '%s       data-ng-click="nxQuickToggle(data.device, item)">\n'
        '%s    <span translate="{{ \'DEVICE_COMMAND_\'+item.code }}"></span>\n'
        '%s    <i class="nx-tick" aria-hidden="true"></i>\n'
        '%s  </div>\n'
        '%s  <div class="nx-pick-hint">Block: the gate should ignore commands until you Release it.</div>\n'
        '%s</div>\n'
        '%s<div data-ng-if="!nxQuickToggle">\n'
        '%s  %s\n'
        '%s</div>\n' % (i, i, i, i, i, i, i, i, i, i, i, i, m.group("radio"), i))


pick, n2 = RE_PICK.subn(pick_new, pick)
if n2 != 1:
    sys.exit("device_4th_button.html: expected 1 radio list, found %d" % n2)

# nx23: a line under the switch, always visible (the hint of nx12 only showed while the switch was on, that is when the person had already found out)
RE_TOGGLE = re.compile(r'(?P<i>[ \t]*)(?P<toggle><ion-toggle\b[^>]*>.*?</ion-toggle>)\n', re.S)
tm = list(RE_TOGGLE.finditer(pick))
if len(tm) != 1:
    sys.exit("device_4th_button.html: expected 1 toggle, found %d" % len(tm))
pick = (pick[:tm[0].end()] + tm[0].group("i") + '<div class="nx-pick-hint" data-ng-if="nxQuickToggle">Shows extra buttons on the accessory screen.</div>\n' + pick[tm[0].end():])

# everything matched: only now write
write_text(detail_path, detail)
write_text(pick_path, pick)
print("patched (nx12 extra buttons): device_detail.html, device_4th_button.html")
