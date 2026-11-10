#!/usr/bin/env python3
"""Patch nx23 (setup wizard): the pages of the first run and of the pairing say what will happen, what to check and what to do next.

Usage: python patch-20-wizard.py <apktool-output-dir>   (all or nothing; idempotent)

The wizard of the original app is a row of nearly empty pages and full-screen waits. This script adds the missing words to the templates in assets/www/templates/first_setup
(English only, like everything the patches add; the wording rules: the cause first, then one action, at most two sentences). Every edit is anchored on a line that must occur
exactly once; the styles of the new classes (nx-wz-*) are in skin/src/nx23-wizard.css. Where the app's own texts are reworded (the "Accessory not found" text, the code page, ...),
that is done in skin/copy/wizard.json (patch-21-copy.py), and the lines that depend on the phone (Location off, VPN on) and the explanations of the waits are in nx-patch.js.

  benvenuto.html                    Welcome: what you need, and that Android will ask to connect to the accessory's Wi-Fi (before it happens)
  rete_wifi.html                    Wi-Fi network: the accessory only works on 2.4 GHz; a warning when the phone is on the accessory's own network
  accendi_dispositivo.html          Turn on the accessory: Android's dialog comes after the search
  bridge_rilevati.html              Accessories detected: tap one, then Connect in Android's dialog
  configura_bridge.html             Password: "Home Wi-Fi password" instead of the raw name of the accessory, and why the password must be exact
  start_email.html                  Sign up: who sees the two details
  user_pairing_max_user_reached.html              (new) a full accessory, first run: says so, and what to do (the app goes to this page, but the file did not exist)
  user_pairing_request_max_user_reached.html      (new) the same for Settings > Add accessory
"""
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
WWW = os.path.join(sys.argv[1], "assets", "www")
FS = os.path.join(WWW, "templates", "first_setup")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


# ---- the edits: (file, anchor, replacement). The anchor is one line (or a short pattern) that must occur exactly once; the replacement keeps it and adds the new lines after it
# (the app's template files have LF line endings; the new lines take the indentation of the anchor).
NEW_FILES = ["user_pairing_max_user_reached.html", "user_pairing_request_max_user_reached.html"]

BENVENUTO_NOTE = (
    '<div class="nx-wz-note">Have your home Wi-Fi password ready. Android will ask to connect to the accessory\'s Wi-Fi network: tap <b>Connect</b>.</div>')
RETE_NOTES = (
    '<div class="nx-wz-warn" ng-if="data.currentSsid.indexOf(\'NiceIT4WIFI\') === 0">This is the accessory\'s own network, not your home Wi-Fi. Connect your phone to your home Wi-Fi first.</div>\n'
    '<div class="nx-wz-note" ng-if="data.currentSsid">The accessory works on 2.4 GHz only. If your router also has a 5 GHz network, connect your phone to the 2.4 GHz one.</div>')
ACCENDI_NOTE = (
    '<div class="nx-wz-note">Keep the phone close to the accessory. After the search, Android will ask to connect to the accessory\'s Wi-Fi network: tap <b>Connect</b>.</div>')
RILEVATI_NOTE = (
    '<div class="nx-wz-note" data-ng-if="data.networks.length > 0">Tap your accessory. Android will then ask to connect to its Wi-Fi network: tap <b>Connect</b>.</div>')
PASSWORD_NOTES = (
    '<div class="nx-wz-note">The accessory joins this network by itself, so the password must be exact.</div>')
SIGNUP_MORE = '<span class="item-nota nx-wz-more">The accessory\'s administrator sees both.</span>'

# the page of a full accessory: the same stage as "Attention" (user_pairing_request.html), the app's own sentence (reworded in skin/copy/wizard.json) and what to do; the way out is the
# back arrow of the wizard, as on every page of it
MAX_USERS = """<ion-view class="light" hide-nav-bar="false" title=" ">
    <ion-content scroll="false" padding="false" class="manual-ios-statusbar-padding">
        <div class="full-container">
            <div class="row flex-1">
                <div class="setup-wifi-bridge">
                    <div class="area bg-black-one bg-img-attenzione">
                        <span></span>
                    </div>
                    <div class="area info">
                        <h2>Accessory is full</h2>
                        <p translate="USER_PAIRING_MAX_USER_REACHED_MESSAGE"></p>
                        <p>Ask an administrator of the accessory to remove a user who no longer needs access (Settings, your Home, {{ 'HOME_SETTINGS_BUTTON_USERS' | translate }}), then try again.</p>
                    </div>
                </div>
            </div>
        </div>
    </ion-content>
</ion-view>
"""

# every anchor must occur exactly once; a regex anchor must match exactly once too
EDITS = [
    ("benvenuto.html", "str", '<p translate="BENVENUTO_SPIEGA"></p>', BENVENUTO_NOTE),
    ("rete_wifi.html", "str", '<p ng-if="!data.currentSsid" translate="CHECK_WIFI_COLLEGAMENTO_ASSENTE"></p>', RETE_NOTES),
    ("accendi_dispositivo.html", "str", '<p translate="ACCENDI_DEVICE_TEXT"></p>', ACCENDI_NOTE),
    ("bridge_rilevati.html", "str", '<!--p translate="BRIDGE_FOUND_TEXT"></p-->', RILEVATI_NOTE),
    ("configura_bridge.html", "replace", '<h2><span translate="CONFIGURAZIONE"></span><br>{{data.name}}</h2>', '<h2>Home Wi-Fi password</h2>'),
    ("configura_bridge.html", "rx", r'</form>\s*</div>', PASSWORD_NOTES),
    ("start_email.html", "str", '<span class="item-nota" translate="INFO_SIGN_UP"></span>', SIGNUP_MORE),
]


def indent_lines(text, indent):
    return "\n".join((indent + line) if line.strip() else line for line in text.split("\n"))


texts = {}
for rel in sorted(set(e[0] for e in EDITS)):
    path = os.path.join(FS, rel)
    if not os.path.isfile(path):
        sys.exit("not found: templates/first_setup/" + rel)
    texts[rel] = read_text(path)
if any("nx-wz-" in t for t in texts.values()) or any(os.path.exists(os.path.join(FS, n)) for n in NEW_FILES):
    sys.exit("already patched (nx23 wizard)")

for rel, kind, anchor, add in EDITS:
    t = texts[rel]
    if kind == "rx":
        found = re.findall(anchor, t)
        if len(found) != 1:
            sys.exit("%s: expected 1 match of %s, found %d" % (rel, anchor, len(found)))
        m = re.search(anchor, t)
        # the new lines go after the end of the matched block, with the indentation of the line where it ends (the closing tag)
        line_start = t.rfind("\n", 0, m.end()) + 1
        indent = re.match(r"[ \t]*", t[line_start:]).group(0)
        t = t[:m.end()] + "\n" + indent_lines(add, indent) + t[m.end():]
    else:
        n = t.count(anchor)
        if n != 1:
            sys.exit("%s: expected 1 occurrence of %s, found %d" % (rel, anchor, n))
        i = t.index(anchor)
        line_start = t.rfind("\n", 0, i) + 1
        indent = re.match(r"[ \t]*", t[line_start:]).group(0)
        if kind == "replace":
            t = t.replace(anchor, add)
        else:
            t = t.replace(anchor, anchor + "\n" + indent_lines(add, indent))
    texts[rel] = t

# everything matched: only now write
for rel, t in texts.items():
    write_text(os.path.join(FS, rel), t)
for n in NEW_FILES:
    write_text(os.path.join(FS, n), MAX_USERS)
print("patched (nx23 wizard): %d templates, %d new (the pages of a full accessory)" % (len(texts), len(NEW_FILES)))
