#!/usr/bin/env python3
"""Patch nx23 (lists): Favorites, Other commands and the Settings rows.

Usage: python patch-19-lists.py <apktool-output-dir>   (all or nothing; idempotent: a second run stops with "already patched")

Templates only. The functions that the templates ask for live in nx-patch.js (the section "nx23 lists"), the looks in skin/src/nx23-lists.css; where a function does not exist (nx-patch.js did not
load) a page shows what nx22 showed. It runs after patch-11 (the labels "Checking..."), patch-13 and patch-17 (the rows of Settings) and changes:

  templates/favorites/favorites.html
    - the divider "Favorites" that repeated the title of the page is gone
    - every accessory has a line of its own that says what we know about it: Online, Checking..., Connecting... or Not reachable (nxFavState), and, only when the state of the gate is confirmed
      at this moment, that state (nxFavGate, nxFavObst; it needs window.__nxTrust, see nx-patch.js). The labels of patch-11 stay for the case that nxFavState does not exist
    - with exactly one favorite the row becomes a card (class nx-fav-card)
    - a tap goes through nxRowTap: the app's own goToDettaglio and, for an accessory that is not usable, the status sheet that knows why (until nx22 the tap did nothing and said nothing)
  templates/system/device_commands.html  (Other commands)
    - a line under the header that says that a tap runs the command at once, and the attribute that nxCmdGap fills in for the first row of every group of commands (the CSS leaves space above it)
  templates/settings/settings.html
    - a row "Debug log" at the end of OTHER (where nxLogOpen exists: the LOG panel is opened from here and from the status sheet, not by a button that floats over the content)
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


def once(text, pattern, rel, what, flags=0):
    """the match of a regular expression that must occur exactly once"""
    found = list(re.finditer(pattern, text, flags))
    if len(found) != 1:
        sys.exit("%s: expected 1 %s, found %d" % (rel, what, len(found)))
    return found[0]


FAV = "templates/favorites/favorites.html"
CMD = "templates/system/device_commands.html"
SET = "templates/settings/settings.html"
paths = {rel: os.path.join(WWW, rel) for rel in (FAV, CMD, SET)}
for rel, path in paths.items():
    if not os.path.isfile(path):
        sys.exit("not found: " + rel)
texts = {rel: read_text(path) for rel, path in paths.items()}
if "nxFavState" in texts[FAV] or "nxCmdGap" in texts[CMD] or "nxLogOpen" in texts[SET]:
    sys.exit("already patched (nx23 lists)")

# ---------------------------------------------------------------------------------------------------------------- Favorites
fav = texts[FAV]
if "nxCheck" not in fav:
    sys.exit(FAV + ": the labels of patch-11 are not there (run patch-11 first)")

# the divider that repeats the title of the page ("Favorites"); the one of the edit mode stays
DIVIDER = '<span class="item item-divider" data-ng-show="editFavorites == false" translate="FAVORITES_LABEL_FAVORITES"></span>'
if fav.count(DIVIDER) != 1:
    sys.exit(FAV + ": expected 1 divider \"Favorites\", found %d" % fav.count(DIVIDER))
fav = fav.replace(DIVIDER, '<!-- nx23: the divider "Favorites" repeated the title of the page -->')

# the row: role, the card when there is one favorite, and the tap
m = once(fav, r'<a class="item item-favorites item-icon-right"(\s+)ng-click="goToDettaglio\(favorite\.homeId,favorite\.mac\)"(\s+)ng-repeat="favorite in favorites" data-ng-show="editFavorites == false">',
         FAV, "row of an accessory")
fav = fav[:m.start()] + (
    '<a class="item item-favorites item-icon-right" role="button" tabindex="0" data-ng-class="{ \'nx-fav-card\': favorites.length === 1 }"%s'
    'ng-click="nxRowTap ? nxRowTap(favorite, goToDettaglio) : goToDettaglio(favorite.homeId,favorite.mac)"%s'
    'ng-repeat="favorite in favorites" data-ng-show="editFavorites == false">' % (m.group(1), m.group(2))) + fav[m.end():]

# the name and the home get a class each (the card places them)
NAME = '<span>{{ favorite.description }}</span>'
if fav.count(NAME) != 1:
    sys.exit(FAV + ": expected 1 name of an accessory, found %d" % fav.count(NAME))
fav = fav.replace(NAME, '<span class="nx-fav-name">{{ favorite.description }}</span>')
m = once(fav, r'(<span class="nx-fav-name">\{\{ favorite\.description \}\}</span>\s*<i class="icon ion-ios-arrow-forward"></i>\s*)<span class="item-nota">\{\{ favorite\.homeName \}\}</span>',
         FAV, "home name under the name of an accessory")
fav = fav[:m.start()] + m.group(1) + '<span class="item-nota nx-fav-home">{{ favorite.homeName }}</span>' + fav[m.end():]

# the labels of patch-11 stay for the case that nxFavState does not exist; next to them the line that says what we know
CHECKING, CONNECTING = "Checking&hellip;", "Connecting&hellip;"
LEGACY = ('<span class="item-nota" data-ng-show="!verifyDevice(favorite) && !nxCheck(favorite)" translate="CONTROLS_DEVICE_NOT_READY"></span>'
          '<span class="item-nota nx-checking" data-ng-show="!verifyDevice(favorite) && nxCheck(favorite) === \'checking\'">' + CHECKING + '</span>'
          '<span class="item-nota nx-checking nx-connecting" data-ng-show="!verifyDevice(favorite) && nxCheck(favorite) === \'retry\'">' + CONNECTING + '</span>')
if fav.count(LEGACY) != 1:
    sys.exit(FAV + ": expected the 3 labels of patch-11 once, found %d" % fav.count(LEGACY))
STATUS = (
    '<span class="nx-fav-legacy" data-ng-if="!nxFavState">' + LEGACY + '</span>'
    '<span class="nx-fav-status" data-ng-if="nxFavState">'
    '<span class="item-nota nx-online" data-ng-if="nxFavState(favorite) === \'online\'">Online</span>'
    '<span class="item-nota nx-checking" data-ng-if="nxFavState(favorite) === \'checking\'">' + CHECKING + '</span>'
    '<span class="item-nota nx-checking nx-connecting" data-ng-if="nxFavState(favorite) === \'connecting\'">' + CONNECTING + '</span>'
    '<span class="item-nota nx-offline" data-ng-if="nxFavState(favorite) === \'offline\'">Not reachable</span>'
    '<span class="nx-fav-gate" data-ng-if="nxFavGate(favorite)" translate="{{ \'DEVICE_STATE_\' + nxFavGate(favorite) }}"></span>'
    '<span class="nx-fav-obst" data-ng-if="nxFavObst(favorite)" translate="DEVICE_STATE_OBSTRUCTED"></span>'
    '</span>')
fav = fav.replace(LEGACY, STATUS)

# ---------------------------------------------------------------------------------------------------------------- Other commands
cmd = texts[CMD]
HEAD = '<div class="item item-divider"><span translate="DEVICE_COMMANDS_LABEL_OTHER_COMMANDS"></span></div>'
if cmd.count(HEAD) != 1:
    sys.exit(CMD + ": expected 1 header, found %d" % cmd.count(HEAD))
cmd = cmd.replace(HEAD, HEAD + '\n      <div class="nx-pick-hint" data-ng-if="commands.length">Tap a command to run it at once.</div>')
m = once(cmd, r'(<a class="item item-icon-right command bg-white-\{\{ \$index < 12 \? \$index\+1 : 12 \}\}" data-ng-repeat="item in commands track by \$index")(\s+)data-ng-click="runCommand\(item\.code\)">',
         CMD, "row of a command")
cmd = cmd[:m.start()] + m.group(1) + m.group(2) + 'data-nx-gap="{{ nxCmdGap && nxCmdGap(commands, $index) ? \'1\' : \'\' }}"' + m.group(2) + 'data-ng-click="runCommand(item.code)">' + cmd[m.end():]

# ---------------------------------------------------------------------------------------------------------------- Settings
st = texts[SET]
m = once(st, r'(?m)^([ \t]*)<div class="spacer bordo_filetto_grigio">\s*\n[ \t]*<span translate="SETTINGS_PAGE_APP_VERSION"', SET, "line of the app version")
LOG = ('    <div class="item item-icon-right" role="button" tabindex="0" data-ng-if="nxLogOpen" data-ng-click="nxLogOpen()">\n'
       '      <span>Debug log</span>\n'
       '      <i class="icon ion-ios-arrow-forward"></i>\n'
       '    </div>\n\n')
st = st[:m.start()] + LOG + st[m.start():]

# everything matched: only now write
write_text(paths[FAV], fav)
write_text(paths[CMD], cmd)
write_text(paths[SET], st)
print("patched (nx23 lists): favorites.html (the line of the accessory, the card, the tap), device_commands.html (the hint, the groups), settings.html (Debug log)")
