#!/usr/bin/env python3
"""Patch v2: connectNetwork skips connecting by itself when the phone is already on the SSID.
Usage: python patch-02-already-connected.py <apktool-output-dir>   (idempotent; also run patch-01-wifi-binding.py, which complements it)"""
import glob, os, sys
if len(sys.argv) != 2: sys.exit(__doc__)
cand = glob.glob(os.path.join(sys.argv[1], "smali*", "com", "nice", "wifiwizard", "WifiWizard.smali"))
if len(cand) != 1: sys.exit("WifiWizard.smali not found: %r" % cand)
path = cand[0]
t = open(path, encoding="utf-8", newline="").read()
if "patchAlreadyConnected" in t: sys.exit("already patched")
nl = "\r\n" if "\r\n" in t else "\n"
r = t.replace("\r\n", "\n").split("\n")

def after_locals(head):
    i = next(k for k, x in enumerate(r) if x.strip() == head)
    j = next(k for k in range(i, i + 6) if r[k].strip().startswith(".locals"))
    return j + 1

# 1. field
i = next(k for k, x in enumerate(r) if x.startswith(".field private wifiManager:"))
r[i+1:i+1] = [".field private patchEvents:Lorg/apache/cordova/CallbackContext;"]
# 2. remember the events callback (before p1 is overwritten)
j = after_locals(".method private installMyReceiver(Lorg/apache/cordova/CallbackContext;)V")
r[j:j] = ["", "    iput-object p1, p0, Lcom/nice/wifiwizard/WifiWizard;->patchEvents:Lorg/apache/cordova/CallbackContext;"]
# 3. connectNetwork: first check whether we are already connected
j = after_locals(".method private connectNetwork(Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)V")
r[j:j] = ["",
 "    invoke-direct {p0, p1, p2}, Lcom/nice/wifiwizard/WifiWizard;->patchAlreadyConnected(Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)Z",
 "", "    move-result v0", "", "    if-eqz v0, :patch_go", "", "    return-void", "", "    :patch_go"]
helper = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "patchAlreadyConnected.smali"), encoding="utf-8").read()
open(path, "w", encoding="utf-8", newline="").write(nl.join(r).rstrip() + nl + helper.replace("\n", nl))
print("patched:", path)
