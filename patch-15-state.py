#!/usr/bin/env python3
"""Patch nx15 (state and block): the state of the gate settled from the log, and a pill for a gate that was blocked.

Usage: python patch-15-state.py <apktool-output-dir>   (all or nothing; idempotent)

The accessory screen of the app shows the state that the accessory reported last. That report can be out of date: with a gate that had been
opened with "Open and Block" the screen stayed on "Opening" while the gate was open. nx-activity.js (nx-patch.js starts it) knows the accessory's
event log and offers $rootScope.nxState(device), nxIcon(device) and nxSettled(device): the state as it is, or, when the report is "opening" or
"closing" and the log says that the movement ended long ago, the state that follows ("open", "closed"). It also keeps track of the last Block or
Release command and offers $rootScope.nxBlock(device). This script changes templates/system/device_detail.html:
  - the state text asks nxState, the icon asks nxIcon first (the app's own function when it answers nothing)
The note under the state while the state is settled ("Accessory says Opening; the log shows it finished.") and the pill "Blocked · since 09:37" for a gate whose last Block command was
not followed by a Release used to be put under the state by this script. Since nx23 they are in the status line above the pad, which patch-18-accessory-layout.py makes.
Where those functions do not exist (nx-patch.js or nx-activity.js did not load) the page behaves as before.
"""
import os
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
if "nxState" in t:
    sys.exit("already patched (nx15 state)")


def once(old, new, what):
    global t
    if t.count(old) != 1:
        sys.exit("device_detail.html: expected 1 %s, found %d" % (what, t.count(old)))
    t = t.replace(old, new)


# 1. the icon: the settled state first, the app's own function otherwise
once('<div class="device-icon"><i class="{{ retrieveIconClass(data.device) }}"></i></div>',
     '<div class="device-icon"><i class="{{ (nxIcon && nxIcon(data.device)) || retrieveIconClass(data.device) }}"></i></div>',
     "icon line")

# 2. the state text
once("translate=\"{{ 'DEVICE_STATE_'+data.device.properties[0].value }}\"",
     "translate=\"{{ 'DEVICE_STATE_'+(nxState ? nxState(data.device) : data.device.properties[0].value) }}\"",
     "state text")

# everything matched: only now write
write_text(path, t)
print("patched (nx15 state): device_detail.html (state text, icon)")
