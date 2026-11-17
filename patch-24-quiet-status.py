#!/usr/bin/env python3
"""Patch nx32 (no alert for the state that the accessory screen asks for by itself).

Usage: python patch-24-quiet-status.py <apktool-output-dir>   (all or nothing; idempotent)

When the accessory screen opens, and every time the app comes back to it, the app asks the accessory for its state. When that request fails the original shows an alert
("Attention", with the text of the error code) over the screen, for every code but 4. Nobody asked for anything at that moment, and the screen already says what is wrong: the
chip in the header, the state word and the status line above the buttons, with a button to reconnect (nx-patch.js). Since nx30 the app starts on this screen when there is one
accessory, so with an accessory that cannot be reached the alert came at every start of the app.

This script takes the alert out of that one place in js/app.min.js (the failure branch of the state request of the accessory screens; the line in the log stays). The alert
after a command that failed (Open, Close, Stop, an extra command) is not touched.
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
path = os.path.join(sys.argv[1], "assets", "www", "js", "app.min.js")
if not os.path.isfile(path):
    sys.exit("not found: " + path)
text = open(path, encoding="utf-8", newline="").read()

LOG = 'console.log("DeviceDetailCtrl:status ERROR "+JSON.stringify(error))'
OLD = ('function(error){' + LOG + ',null!=error.code&&"NHK_ERROR-"+error.code!="NHK_ERROR-4"&&'
       'showAlert($ionicPopup,$translate.instant("ALERT_TITLE_WARNING"),$translate.instant("NHK_ERROR-"+error.code))}')
NEW = 'function(error){' + LOG + '}'
EXPECTED = 4   # the accessory screen and its three variants (a scene, a bridge, a bidirectional automation) share the code

if OLD not in text:
    if text.count(NEW) == EXPECTED:
        sys.exit("already patched (nx32 quiet state request)")
    sys.exit("app.min.js: the failure branch of the state request was not found (another version of the app?)")
if text.count(OLD) != EXPECTED:
    sys.exit("app.min.js: expected %d x the failure branch of the state request, found %d" % (EXPECTED, text.count(OLD)))
if text.count(LOG) != EXPECTED:
    sys.exit("app.min.js: the state request has %d failure branches, %d of them as expected: not changed" % (text.count(LOG), EXPECTED))
text = text.replace(OLD, NEW)
open(path, "w", encoding="utf-8", newline="").write(text)
print("patched (nx32 quiet state request): js/app.min.js (%d places)" % EXPECTED)
