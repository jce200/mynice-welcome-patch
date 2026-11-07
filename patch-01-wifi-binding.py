#!/usr/bin/env python3
"""Adds bindNiceWifi() to WifiWizard$2.smali and calls it at the start of onReceive.

Usage:  python patch-01-wifi-binding.py <apktool-output-dir>
Idempotent: running it a second time does nothing.
"""
import glob, os, re, sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
out = sys.argv[1]
cand = glob.glob(os.path.join(out, "smali*", "com", "nice", "wifiwizard", "WifiWizard$2.smali"))
if len(cand) != 1:
    sys.exit("WifiWizard$2.smali not found (or not unique): %r" % cand)
path = cand[0]
text = open(path, encoding="utf-8", newline="").read()
if "bindNiceWifi" in text:
    sys.exit("already patched: " + path)
nl = "\r\n" if "\r\n" in text else "\n"
lines = text.replace("\r\n", "\n").split("\n")

head = ".method public onReceive(Landroid/content/Context;Landroid/content/Intent;)V"
try:
    start = next(i for i, r in enumerate(lines) if r.strip() == head)
except StopIteration:
    sys.exit("onReceive not found in " + path)

# first real instruction: skip .locals, .param, .prologue, .line, labels and annotation blocks
i, in_annotation = start + 1, False
while True:
    r = lines[i].strip()
    if in_annotation:
        in_annotation = not r.startswith(".end annotation")
    elif r.startswith(".annotation"):
        in_annotation = True
    elif r == "" or r.startswith((".", "#", ":")):
        pass
    else:
        break
    i += 1
lines[i:i] = ["    invoke-direct {p0, p1}, Lcom/nice/wifiwizard/WifiWizard$2;->bindNiceWifi(Landroid/content/Context;)V", ""]

helper = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "bindNiceWifi.smali"), encoding="utf-8").read()
new = nl.join(lines).rstrip() + nl + helper.replace("\n", nl)
open(path, "w", encoding="utf-8", newline="").write(new)
print("patched:", path)
