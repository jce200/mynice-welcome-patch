#!/usr/bin/env python3
"""Patch v3 (JS): 1) fill in the home network if listNetworks is empty; 2) log panel.
Usage: python patch-03-home-network-and-log.py <apktool-output-dir>   (idempotent)"""
import os, shutil, sys
if len(sys.argv) != 2: sys.exit(__doc__)
www = os.path.join(sys.argv[1], "assets", "www")
path = os.path.join(www, "js", "app.min.js")
s = open(path, encoding="utf-8", newline="").read()
if "__nhkHome" in s: sys.exit("already patched")
# Fallback: without the list of known networks (empty on modern Android) networkSsid stays empty.
# Then take the SSID remembered at the start of the wizard (= the home network) and read the security type from the scan results.
old = 'console.log("getScanResultsetup: "+setup.networkSsid'
fb = ('setup.networkSsid==setup.currentSsid||!setup.currentSsid||(function(){var __nhkHome=1,c="",k,r=result||[];'
      'for(k=0;k<r.length;k++){var n=r[k].SSID||"";if(n==setup.currentSsid||n=="\\""+setup.currentSsid+"\\""){c=r[k].capabilities||"";break}}'
      'setup.networkSsid=setup.currentSsid;'
      'setup.networkSecurity=c.indexOf("WEP")>=0?"WEP":c.indexOf("WPA2")>=0?"WPA2_MIXED_PSK":c.indexOf("WPA")>=0?(c.indexOf("TKIP")>=0?"WPA_TKIP_PSK":"WPA_AES_PSK"):(c&&c.indexOf("ESS")>=0&&c.indexOf("WPA")<0?"OPEN":"WPA2_MIXED_PSK");'
      'setup.networkWps=setup.networkWps||false;SetupService.updateSetup(setup)})(),')
n = s.count(old)
if n != 3: sys.exit("expected 3 occurrences, found %d" % n)
s = s.replace(old, fb + old)
open(path, "w", encoding="utf-8", newline="").write(s)
shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "debuglog.js"), os.path.join(www, "js", "debuglog.js"))
ip = os.path.join(www, "index.html")
h = open(ip, encoding="utf-8", newline="").read()
h = h.replace('<script src="cordova.js"></script>', '<script src="cordova.js"></script>\n        <script src="js/debuglog.js"></script>', 1)
assert "debuglog.js" in h
open(ip, "w", encoding="utf-8", newline="").write(h)
print("patched: app.min.js (%d occurrences), index.html, js/debuglog.js" % n)
