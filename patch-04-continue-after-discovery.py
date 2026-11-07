#!/usr/bin/env python3
"""Patch v6 (JS): use the response of discoverUnconfiguredDevices when the 'unconfiguredDeviceFound' event has already passed.
Usage: python patch-04-continue-after-discovery.py <apktool-output-dir>   (idempotent)"""
import os, sys
if len(sys.argv) != 2: sys.exit(__doc__)
path = os.path.join(sys.argv[1], "assets", "www", "js", "app.min.js")
s = open(path, encoding="utf-8", newline="").read()
if "__nhkGo" in s: sys.exit("already patched")
old = 'window.addEventListener("unconfiguredDeviceFound",discoverUnconfiguredHandler,!1),NHKPluginService.discoverUnconfiguredDevices().then(function(response){'
new = old + 'response&&response.length&&!window.__nhkGo&&(window.__nhkGo=1,setTimeout(function(){window.__nhkGo=0},4e3),discoverUnconfiguredHandler(response[0]));'
n = s.count(old)
if n != 3: sys.exit("expected 3 occurrences, found %d" % n)
open(path, "w", encoding="utf-8", newline="").write(s.replace(old, new))
print("patched: %d occurrences in app.min.js" % n)
