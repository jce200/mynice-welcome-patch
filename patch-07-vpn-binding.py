#!/usr/bin/env python3
"""Patch nx4: make the app's network choice robust against an active VPN and mobile data.

Usage: python patch-07-vpn-binding.py <apktool-output-dir>   (all or nothing: only writes after all replacements succeeded)

 1. WifiWizard$2.onReceive: the type of getActiveNetworkInfo() goes through Nx.wifiType(). Without that the app reports
    "wifi-disconnected" as soon as a VPN (or mobile data, when the Wi-Fi has no internet) is the active network, even
    when the phone is simply on the Wi-Fi. The JS then sets every module to "Not usable" (and searches again).
    Plus Nx.ctx(context) so that the hook always has a context.
 2. bindNiceWifi (two copies: WifiWizard and WifiWizard$2): skip VPN networks. A VPN over Wi-Fi also reports
    TRANSPORT_WIFI; because of that the loop could bind the process to the VPN instead of to the Wi-Fi.
 3. app.min.js: call the hook window.__nxWrapVerify directly after the definition of verifyDeviceRecheability.
    The function is only defined in Ionic's ready callback; the old startup (looking every 500 ms) could run
    before or after that, so on a cold start the first check ran without hints and without retries.
"""
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
ROOT = sys.argv[1]
SMALI = os.path.join(ROOT, "smali", "com", "nice", "wifiwizard")
APP = os.path.join(ROOT, "assets", "www", "js", "app.min.js")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


ww_path = os.path.join(SMALI, "WifiWizard.smali")
ww2_path = os.path.join(SMALI, "WifiWizard$2.smali")
ww, ww2, app = read_text(ww_path), read_text(ww2_path), read_text(APP)

if "Lcom/nice/patch/Nx;->wifiType" in ww2 or "__nxWrapVerify" in app:
    sys.exit("already patched (nx4)")


def exactly_once(text, search, name):
    n = text.count(search)
    if n != 1:
        sys.exit("%s: expected 1 occurrence, found %d" % (name, n))


# ---- 2. skip VPN networks in the bind loop (both copies have the same text)
BIND_OLD = (
    "    if-eqz v5, :cond_next\n"
    "\n"
    "    const/4 v6, 0x1\n"
    "\n"
    "    invoke-virtual {v5, v6}, Landroid/net/NetworkCapabilities;->hasTransport(I)Z\n"
)
BIND_NEW = (
    "    if-eqz v5, :cond_next\n"
    "\n"
    "    # nx4: a VPN over Wi-Fi also reports TRANSPORT_WIFI; skip VPN networks (TRANSPORT_VPN = 4)\n"
    "    const/4 v6, 0x4\n"
    "\n"
    "    invoke-virtual {v5, v6}, Landroid/net/NetworkCapabilities;->hasTransport(I)Z\n"
    "\n"
    "    move-result v6\n"
    "\n"
    "    if-nez v6, :cond_next\n"
    "\n"
    "    const/4 v6, 0x1\n"
    "\n"
    "    invoke-virtual {v5, v6}, Landroid/net/NetworkCapabilities;->hasTransport(I)Z\n"
)
exactly_once(ww, BIND_OLD, "WifiWizard.smali bind loop")
exactly_once(ww2, BIND_OLD, "WifiWizard$2.smali bind loop")
ww = ww.replace(BIND_OLD, BIND_NEW)
ww2 = ww2.replace(BIND_OLD, BIND_NEW)

# ---- 1. onReceive: remember the context and have the type of the active network corrected
CTX_OLD = "    invoke-direct {p0, p1}, Lcom/nice/wifiwizard/WifiWizard$2;->bindNiceWifi(Landroid/content/Context;)V\n"
exactly_once(ww2, CTX_OLD, "WifiWizard$2.smali bindNiceWifi call")
ww2 = ww2.replace(
    CTX_OLD,
    "    invoke-static {p1}, Lcom/nice/patch/Nx;->ctx(Landroid/content/Context;)V\n\n" + CTX_OLD)

TYPE_OLD = (
    "    invoke-virtual {p1}, Landroid/net/NetworkInfo;->getType()I\n"
    "\n"
    "    move-result p1\n"
    "\n"
    "    if-ne p1, v2, :cond_0\n"
)
TYPE_NEW = (
    "    invoke-virtual {p1}, Landroid/net/NetworkInfo;->getType()I\n"
    "\n"
    "    move-result p1\n"
    "\n"
    "    # nx4: with a VPN or mobile data the active network is not Wi-Fi, even though the phone is on it\n"
    "    invoke-static {p1}, Lcom/nice/patch/Nx;->wifiType(I)I\n"
    "\n"
    "    move-result p1\n"
    "\n"
    "    if-ne p1, v2, :cond_0\n"
)
exactly_once(ww2, TYPE_OLD, "WifiWizard$2.smali getType")
ww2 = ww2.replace(TYPE_OLD, TYPE_NEW)

# ---- 3. app.min.js: hook directly after the definition of verifyDeviceRecheability
JS_OLD = "deferred.resolve(device)}),deferred},$rootScope.translateComplex="
JS_NEW = ("deferred.resolve(device)}),deferred},window.__nxWrapVerify&&window.__nxWrapVerify($rootScope),"
          "$rootScope.translateComplex=")
exactly_once(app, JS_OLD, "app.min.js verifyDeviceRecheability")
# the function must really be verifyDeviceRecheability (not another one with the same ending)
i = app.index(JS_OLD)
if app.rfind("$rootScope.verifyDeviceRecheability=function(device)", 0, i) < 0 or \
        i - app.rfind("$rootScope.verifyDeviceRecheability=function(device)", 0, i) > 2500:
    sys.exit("app.min.js: this ending does not belong to verifyDeviceRecheability")
app = app.replace(JS_OLD, JS_NEW)

# everything succeeded: only now write
write_text(ww_path, ww)
write_text(ww2_path, ww2)
write_text(APP, app)
print("patched (nx4): WifiWizard (skip VPN), WifiWizard$2 (skip VPN, Nx.ctx, Nx.wifiType), app.min.js (__nxWrapVerify)")
