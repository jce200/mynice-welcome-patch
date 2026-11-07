#!/usr/bin/env python3
"""Patch v8 (JS): puts nx-patch.js into the app and hooks the existing JS in a few places.

Usage: python patch-06-js-layer.py <apktool-output-dir>   (idempotent; all or nothing)

 1. nx-patch.js to assets/www/js and a <script> tag in index.html
 2. failNetwork(e) in app.min.js: an understandable message instead of "A network error occurred" (5 occurrences)
 3. both goToStepAddDevice buttons (configure): do not run twice at the same time (2 occurrences)
 4. WifiWizard.js: remove the log line console.log("ssid", ssid); it also showed Wi-Fi passwords
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


app_path = os.path.join(WWW, "js", "app.min.js")
idx_path = os.path.join(WWW, "index.html")
ww_path = os.path.join(WWW, "plugins", "com.nice.wifiwizard", "www", "WifiWizard.js")

app = read_text(app_path)
idx = read_text(idx_path)
ww = read_text(ww_path)
if "__nxMsg" in app:
    sys.exit("already patched (v8 JS)")

# ---- 2. error messages
RE_FAIL = re.compile(r'(function failNetwork\(e\)\{[^{}]*?)\$translate\.instant\("ADD_NEW_DEVICE_MSG_NETWORK_ERROR"\)')
app, n = RE_FAIL.subn(r'\1window.__nxMsg(e,$translate.instant("ADD_NEW_DEVICE_MSG_NETWORK_ERROR"))', app)
if n != 5:
    sys.exit("failNetwork: expected 5 occurrences, found %d" % n)

# ---- 3. double Next
GUARD = "if(window.__nxBusyCfg&&window.__nxBusyCfg())return;"
old_a = '$scope.goToStepAddDevice=function(){console.log("1goToStepAddDevice");'
old_b = '$scope.goToStepAddDevice=function(){if(console.log("AddDeviceSettingsCtrl goToStepAddDevice"),'
for name, old in (("goToStepAddDevice (1)", old_a), ("goToStepAddDevice (2)", old_b)):
    if app.count(old) != 1:
        sys.exit("%s: expected 1 occurrence, found %d" % (name, app.count(old)))
app = app.replace(old_a, old_a.replace("{console", "{" + GUARD + "console", 1))
app = app.replace(old_b, old_b.replace("{if(console", "{" + GUARD + "if(console", 1))

# ---- 4. WifiWizard.js: do not log the ssid (and so sometimes the password)
old_log = 'console.log("ssid", ssid);'
if ww.count(old_log) != 1:
    sys.exit("WifiWizard.js: expected 1 occurrence of the ssid log, found %d" % ww.count(old_log))
ww = ww.replace(old_log, "/* nx: do not log, formatWifiString also receives Wi-Fi passwords */")

# ---- 1. nx-patch.js + script tag
TAG_AFTER = '<script src="lib/angular-ui-mask/dist/mask.min.js"></script>'
if idx.count(TAG_AFTER) != 1:
    sys.exit("index.html: the last script line was not found")
idx = idx.replace(TAG_AFTER, TAG_AFTER + '\n        <script src="js/nx-patch.js"></script>')

# everything succeeded: only now write
shutil.copy(os.path.join(HERE, "nx-patch.js"), os.path.join(WWW, "js", "nx-patch.js"))
write_text(app_path, app)
write_text(idx_path, idx)
write_text(ww_path, ww)
print("patched (v8 JS): app.min.js (5 messages, 2 buttons), index.html, nx-patch.js, WifiWizard.js")
