#!/usr/bin/env python3
"""Patch nx7 (smali): make the app work when Android refuses to bind a socket to a network (VPN, Tailscale).

Usage: python patch-09-socket-fallback.py <apktool-output-dir>   (all or nothing: only writes after all replacements succeeded)

Cause (from the user's diagnosis with Tailscale on): "Binding socket to network 376 failed: EPERM (Operation
not permitted)". A VPN that cannot be bypassed (Tailscale does not call allowBypass()) does not let an app it applies to
bind its socket to another network. ConnectionsManager._openSocket does that for EVERY connection
(Network.getSocketFactory().createSocket(), for Wi-Fi and for mobile), for the module and for the Nice cloud. With
Tailscale on, everything therefore failed, even when the VPN did not touch the address at all.

 1. _openSocket (two places, Wi-Fi and mobile): Nx.socketFor(network). If binding succeeds, exactly as before; if it
    fails, a plain socket (default route) instead of the error.
 2. bindNiceWifi (two copies, WifiWizard and WifiWizard$2): do not bind the whole process to a Wi-Fi without internet
    (the module Wi-Fi) while a VPN is on: all new sockets then fail with EPERM, including those for DNS
    and mDNS, and the app is completely dead. In that case the process stays unbound.
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
ROOT = sys.argv[1]
SMALI = os.path.join(ROOT, "smali", "com", "nice")
CM = os.path.join(SMALI, "hki", "protocol", "ConnectionsManager.smali")
WW = os.path.join(SMALI, "wifiwizard", "WifiWizard.smali")
WW2 = os.path.join(SMALI, "wifiwizard", "WifiWizard$2.smali")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


cm, ww, ww2 = read_text(CM), read_text(WW), read_text(WW2)
if "Lcom/nice/patch/Nx;->socketFor" in cm:
    sys.exit("already patched (nx7)")


def replace_once(text, old, new, name):
    n = text.count(old)
    if n != 1:
        sys.exit("%s: expected 1 occurrence, found %d" % (name, n))
    return text.replace(old, new)


# ---- 1. sockets: Wi-Fi (v0 is a temporary here) and mobile (v7 is the temporary)
WIFI_OLD = (
    "    invoke-virtual {v7}, Landroid/net/Network;->getSocketFactory()Ljavax/net/SocketFactory;\n\n"
    "    move-result-object v0\n\n"
    "    invoke-virtual {v0}, Ljavax/net/SocketFactory;->createSocket()Ljava/net/Socket;\n\n"
    "    move-result-object v5\n"
)
MOB_OLD = (
    "    invoke-virtual {v7}, Landroid/net/Network;->getSocketFactory()Ljavax/net/SocketFactory;\n\n"
    "    move-result-object v7\n\n"
    "    invoke-virtual {v7}, Ljavax/net/SocketFactory;->createSocket()Ljava/net/Socket;\n\n"
    "    move-result-object v5\n"
)
NEW = (
    "    invoke-static {v7}, Lcom/nice/patch/Nx;->socketFor(Landroid/net/Network;)Ljava/net/Socket;\n\n"
    "    move-result-object v5\n"
)
cm = replace_once(cm, WIFI_OLD, NEW, "_openSocket Wi-Fi socket")
cm = replace_once(cm, MOB_OLD, NEW, "_openSocket mobile socket")

# ---- 2. bind loops: do not bind the whole process while a VPN is on
BIND2_OLD = (
    "    if-nez v6, :cond_unbind\n\n"
    "    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z\n\n"
    "    new-instance v6, Lorg/json/JSONObject;\n"
)
BIND2_NEW = (
    "    if-nez v6, :cond_unbind\n\n"
    "    # nx7: with a VPN, binding the whole process would make every new socket fail with EPERM\n"
    "    invoke-static {}, Lcom/nice/patch/Nx;->vpnActive()Z\n\n"
    "    move-result v6\n\n"
    "    if-nez v6, :cond_unbind\n\n"
    "    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z\n\n"
    "    new-instance v6, Lorg/json/JSONObject;\n"
)
ww2 = replace_once(ww2, BIND2_OLD, BIND2_NEW, "WifiWizard$2 bind")

BIND1_OLD = (
    "    if-eqz v6, :cond_next\n\n"
    "    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z\n\n"
    "    goto :cond_done\n"
)
BIND1_NEW = (
    "    if-eqz v6, :cond_next\n\n"
    "    # nx7: with a VPN, binding the whole process would make every new socket fail with EPERM\n"
    "    invoke-static {}, Lcom/nice/patch/Nx;->vpnActive()Z\n\n"
    "    move-result v6\n\n"
    "    if-nez v6, :cond_done\n\n"
    "    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z\n\n"
    "    goto :cond_done\n"
)
ww = replace_once(ww, BIND1_OLD, BIND1_NEW, "WifiWizard bind")

# everything succeeded: only now write
for path, text in ((CM, cm), (WW, ww), (WW2, ww2)):
    open(path, "w", encoding="utf-8", newline="").write(text)
print("patched (nx7): ConnectionsManager (socketFor x2), WifiWizard and WifiWizard$2 (no process binding with a VPN)")
