#!/usr/bin/env python3
"""Patch nx23 (accessory screen): the layout of the accessory screen (state box, status line, Activity entry, pad, extra commands).

Usage: python patch-18-accessory-layout.py <apktool-output-dir>   (all or nothing; idempotent)

Runs after the scripts that made the accessory screen (patch-11 "Checking...", 12 extra buttons, 15 the state of the gate) and rewrites the part of
templates/system/device_detail.html that they left, in one pass, so that the screen is a stack of boxes that keep their height (skin/src/nx23-gate.css):

  state box   <div class="nx-state">: the state word, "Checking...", "Connecting...", "Not usable" (the strongs of patch-11 keep their conditions) and, new, an obstruction as an error chip
              ("Obstruction detected", role alert) with the position of the gate under it, as context. The rows "Accessory: ..." (it repeats the title) and "Home: ..." (only when
              the app has more than one home: nxManyHomes) are no longer chips between the state and the buttons.
  Activity    under the state word one button "Last: Close · yesterday 22:00 · Schedule" (a tonal chip with the history icon; nxLastSpoken is its name for a screen reader, "Last
              command: ...", nxLastStale says when the log was read if that was a while ago) in place of the link that started with a command word
  status line <div class="nx-line"> directly above the pad, ALWAYS in the DOM (never ng-if: its height is reserved). role status, aria-live polite (assertive for a failure: nxLineLive), and the bindings that the workstream
              "Command feedback and trust" fills: data-nx-kind (nxLineKind), data-nx-trust (nxTrust), data-nx-unsure (nxUnsure), the text (nxLine), the optional button (nxLineAct,
              nxLineDo). All guarded: without them the line shows what the accessory screen knows by itself, in this order: the pill of a blocked gate (Blocked / Maybe blocked, a button that
              opens the Activity sheet), "Gate state unknown" (nxUnknown), the note that the state was settled from the log (nxSettled)
  extras      a caption "Extra buttons" inside the block that patch-12 made (the group has a name for a screen reader too)
Nothing here touches the commands themselves (their click, role, keys: the other workstream owns those): this script anchors on the start tags and class names only.
Where nx-patch.js or nx-activity.js did not load, every call is guarded and the screen shows what the app does.
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


path = os.path.join(WWW, "templates", "system", "device_detail.html")
if not os.path.isfile(path):
    sys.exit("not found: templates/system/device_detail.html")
t = read_text(path)
if "nx-state" in t:
    sys.exit("already patched (nx23 accessory layout)")
for marker, script in (("nxCheck", "patch-11"), ("nxExtra", "patch-12"), ("nxState", "patch-15")):
    if marker not in t:
        sys.exit("device_detail.html does not have %s yet (%s first)" % (marker, script))


def sub1(pattern, repl, what, flags=re.M):
    """Replace exactly one occurrence (a regular expression); anything else stops the script before a single file is written."""
    global t
    t, n = re.subn(pattern, repl, t, flags=flags)
    if n != 1:
        sys.exit("device_detail.html: expected 1 %s, found %d" % (what, n))


# 1. the row of the state becomes the state box (the label "State:" was hidden by the skin: it goes)
sub1(r'(?P<i>[ \t]*)<div class="device-row">\n[ \t]*<span translate="\{\{ \'DEVICE_DETAIL_LABEL_STATE\' \}\}"></span>\n',
     lambda m: '%s<div class="nx-state">\n' % m.group("i"), "state row")

# 2. "Not usable" and the reachable state get a class of their own (the skin and the hero look at them)
sub1(r'<strong data-ng-show="!nxCheck\(data\.device\) && !isDeviceReachable\(data\.device\)">',
     '<strong class="nx-unusable" data-ng-show="!nxCheck(data.device) && !isDeviceReachable(data.device)">', "'Not usable' strong")
sub1(r'<strong data-ng-show="isDeviceReachable\(data\.device\)">', '<strong class="nx-reach" data-ng-show="isDeviceReachable(data.device)">', "reachable state strong")

# 3. the obstruction: an error chip that says what is wrong, not a parenthesis under the state word
sub1(r'<span translate="\{\{ \'DEVICE_STATE_OBSTRUCTED\' \}\}"\s+data-ng-show="([^"]*)"\s+class="[^"]*"></span>',
     lambda m: '<span class="nx-obst" role="alert" data-ng-show="%s"><i class="nx-obst-icon" aria-hidden="true"></i>Obstruction detected</span>' % m.group(1), "obstruction span")

# 4. the chip "Accessory:" (it repeats the title) is gone; the chip "Home:" becomes a line that is there only when the app has more than one home; and under them the entry to the Activity
#    sheet: a button with the last command, in place of the link that started with a command word
LAST = '''{i}<button type="button" class="nx-last" data-ng-if="nxActivity" data-ng-click="nxActivity(data.device)" aria-label="{{{{ nxLastSpoken ? nxLastSpoken(data.device) : 'Activity' }}}}">
{i}    <i class="nx-last-icon" aria-hidden="true"></i>
{i}    <span class="nx-last-text">{{{{ nxLast(data.device) ? 'Last: ' + nxLast(data.device) : 'Activity' }}}}</span>
{i}    <span class="nx-last-age" data-ng-if="nxLastStale && nxLastStale(data.device)">log read {{{{ nxLastStale(data.device) }}}}</span>
{i}</button>
'''
sub1(r'[ \t]*<div class="device-row">\n[ \t]*<span translate="DEVICE_DETAIL_LABEL_DEVICE"></span> \{\{ slide\.description \}\}\n[ \t]*</div>\n', "", "accessory row")
sub1(r'(?P<i>[ \t]*)<div class="device-row">\n(?P<b>[ \t]*<span translate="DEVICE_DETAIL_LABEL_HOME"></span> \{\{ data\.homeName \}\}\n)[ \t]*</div>\n',
     lambda m: '%s<div class="nx-home" data-ng-if="nxManyHomes && nxManyHomes()">\n%s%s</div>\n%s' % (m.group("i"), m.group("b"), m.group("i"), LAST.format(i=m.group("i"))), "home row")

# 5. the status line, directly above the pad of the accessory (not above the pad of a scene: that is the other .device-commands)
LINE = '''{i}<div class="nx-line" role="status" aria-live="{{{{ nxLineLive ? nxLineLive(data.device) : 'polite' }}}}" data-nx-kind="{{{{ nxLineKind ? nxLineKind(data.device) : '' }}}}" data-nx-trust="{{{{ nxTrust ? nxTrust(data.device) : '' }}}}"
{i}     ng-attr-data-nx-unsure="{{{{ (nxUnsure && nxUnsure(data.device)) ? '1' : undefined }}}}">
{i}    <span class="nx-line-text" data-ng-if="nxLine && nxLine(data.device)">{{{{ nxLine(data.device) }}}}</span>
{i}    <button type="button" class="nx-line-act" data-ng-if="nxLineAct && nxLineAct(data.device)" data-ng-click="nxLineDo(data.device)">{{{{ nxLineAct(data.device) }}}}</button>
{i}    <button type="button" class="nx-pill nx-block" data-ng-if="!(nxLine && nxLine(data.device)) && nxBlock && nxBlock(data.device)" data-ng-class="{{ 'nx-maybe': nxBlockMaybe && nxBlockMaybe(data.device) }}"
{i}            data-ng-click="nxActivity(data.device)" aria-label="{{{{ nxBlock(data.device) }}}}. Opens the history.">
{i}        <i class="nx-block-icon" aria-hidden="true"></i><span>{{{{ nxBlock(data.device) }}}}</span>
{i}    </button>
{i}    <span class="nx-unknown" data-ng-if="!(nxLine && nxLine(data.device)) && !(nxBlock && nxBlock(data.device)) && nxUnknown && nxUnknown(data.device)">{{{{ nxUnknown(data.device) }}}}</span>
{i}    <span class="nx-settled" data-ng-if="!(nxLine && nxLine(data.device)) && !(nxBlock && nxBlock(data.device)) && !(nxUnknown && nxUnknown(data.device)) && nxSettled && nxSettled(data.device)">{{{{ nxSettled(data.device) }}}}</span>
{i}</div>
'''
sub1(r'(?P<row><div class="row flex-3" data-ng-if="slide\.isDevice"\s*>\n)(?P<i>[ \t]*)(?=<div class="device-commands">)',
     lambda m: m.group("row") + LINE.format(i=m.group("i")) + m.group("i"), "pad of the accessory")

# 6. the extra commands: a caption inside the block of patch-12, and a name for the group (unless the group has a role already)
def extras(m):
    i, attrs = m.group("i"), m.group("attrs")
    if "role=" not in attrs:
        attrs += ' role="group" aria-label="Extra buttons"'
    return '%s<div class="nx-extras"%s>\n%s    <div class="nx-extras-cap" aria-hidden="true">Extra buttons</div>' % (i, attrs, i)


sub1(r'(?P<i>[ \t]*)<div class="nx-extras"(?P<attrs>[^>]*)>', extras, "extra commands block")

# everything matched: only now write
write_text(path, t)
print("patched (nx23 accessory layout): device_detail.html (state box, obstruction chip, Activity chip, status line, extra commands caption)")
