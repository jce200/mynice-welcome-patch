#!/usr/bin/env python3
"""Patch v8 (smali + manifest + config): hooks into the native layer com.nice.patch (Nx).

Usage: python patch-05-native-hooks.py <apktool-output-dir>
Requires patch-01-wifi-binding.py and patch-02-already-connected.py to have been applied already. Idempotent.

Every change checks that the target text occurs EXACTLY once; otherwise the script stops with a clear
message (so an APK version other than 2.2.0 is not silently patched wrongly).
"""
import glob
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
ROOT = sys.argv[1]
MARKER = "com/nice/patch/Nx"


def find(pattern):
    cand = glob.glob(os.path.join(ROOT, pattern))
    if len(cand) != 1:
        sys.exit("file not found (or not unique): %s -> %r" % (pattern, cand))
    return cand[0]


class TextFile:
    """Reads a text file, keeps the line endings, and only writes back when everything checks out."""

    def __init__(self, path):
        self.path = path
        raw = open(path, encoding="utf-8", newline="").read()
        self.nl = "\r\n" if "\r\n" in raw else "\n"
        self.text = raw.replace("\r\n", "\n")

    def replace_once(self, old, new, name):
        n = self.text.count(old)
        if n != 1:
            sys.exit("%s: expected 1 occurrence in %s, found %d" % (name, os.path.basename(self.path), n))
        self.text = self.text.replace(old, new)

    def write(self):
        open(self.path, "w", encoding="utf-8", newline="").write(self.text.replace("\n", self.nl))


FILES = []


def open_file(path):
    b = TextFile(path)
    FILES.append(b)
    return b


# ---------------------------------------------------------------- WifiWizard.smali
ww = open_file(find("smali*/com/nice/wifiwizard/WifiWizard.smali"))
if MARKER in ww.text:
    sys.exit("already patched (v8)")
if "patchAlreadyConnected" not in ww.text:
    sys.exit("patch-02-already-connected.py has not been applied yet")

# 1. connectNetwork: let the native layer try first (automatic connection via WifiNetworkSpecifier).
ww.replace_once(
    ".method private connectNetwork(Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)V\n"
    "    .locals 6\n"
    "\n"
    "    invoke-direct {p0, p1, p2}, Lcom/nice/wifiwizard/WifiWizard;->patchAlreadyConnected(",
    ".method private connectNetwork(Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)V\n"
    "    .locals 6\n"
    "\n"
    "    iget-object v0, p0, Lcom/nice/wifiwizard/WifiWizard;->cordova:Lorg/apache/cordova/CordovaInterface;\n"
    "\n"
    "    invoke-interface {v0}, Lorg/apache/cordova/CordovaInterface;->getActivity()Landroid/app/Activity;\n"
    "\n"
    "    move-result-object v0\n"
    "\n"
    "    iget-object v1, p0, Lcom/nice/wifiwizard/WifiWizard;->patchEvents:Lorg/apache/cordova/CallbackContext;\n"
    "\n"
    "    invoke-static {v0, p1, v1, p2}, Lcom/nice/patch/Nx;->handleConnect(Landroid/app/Activity;"
    "Lorg/apache/cordova/CallbackContext;Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)Z\n"
    "\n"
    "    move-result v0\n"
    "\n"
    "    if-eqz v0, :patch_nx_go\n"
    "\n"
    "    return-void\n"
    "\n"
    "    :patch_nx_go\n"
    "    invoke-direct {p0, p1, p2}, Lcom/nice/wifiwizard/WifiWizard;->patchAlreadyConnected(",
    "WifiWizard.connectNetwork")

# 2. getConnectedSSID: while the module connection runs via the specifier, the wizard reports that SSID.
ww.replace_once(
    ".method private getConnectedSSID(Lorg/apache/cordova/CallbackContext;)V\n"
    "    .locals 4\n",
    ".method private getConnectedSSID(Lorg/apache/cordova/CallbackContext;)V\n"
    "    .locals 4\n"
    "\n"
    "    invoke-static {p1}, Lcom/nice/patch/Nx;->handleSsid(Lorg/apache/cordova/CallbackContext;)Z\n"
    "\n"
    "    move-result v0\n"
    "\n"
    "    if-eqz v0, :patch_nx_ssid\n"
    "\n"
    "    return-void\n"
    "\n"
    "    :patch_nx_ssid\n",
    "WifiWizard.getConnectedSSID")

# ---------------------------------------------------------------- WifiWizard$2.smali (receiver)
receiver = open_file(find("smali*/com/nice/wifiwizard/WifiWizard$2.smali"))
if "bindNiceWifi" not in receiver.text:
    sys.exit("patch-01-wifi-binding.py has not been applied yet")
# The existing bind logic releases the binding when there is Wi-Fi with internet; during the app-specific
# module connection it must not do that.
receiver.replace_once(
    ".method private bindNiceWifi(Landroid/content/Context;)V\n"
    "    .locals 8\n",
    ".method private bindNiceWifi(Landroid/content/Context;)V\n"
    "    .locals 8\n"
    "\n"
    "    invoke-static {}, Lcom/nice/patch/Nx;->moduleActive()Z\n"
    "\n"
    "    move-result v0\n"
    "\n"
    "    if-eqz v0, :patch_nx_act\n"
    "\n"
    "    return-void\n"
    "\n"
    "    :patch_nx_act\n",
    "WifiWizard$2.bindNiceWifi")

# ---------------------------------------------------------------- JmDNSDiscoveryService.smali
jm = open_file(find("smali*/com/nice/hki/discovery/JmDNSDiscoveryService.smali"))
# Own IP on the module network (WifiManager.getConnectionInfo() is not always right there).
jm.replace_once(
    ".method private getLocalIpAddress()Ljava/net/InetAddress;\n"
    "    .locals 6\n",
    ".method private getLocalIpAddress()Ljava/net/InetAddress;\n"
    "    .locals 6\n"
    "\n"
    "    invoke-static {}, Lcom/nice/patch/Nx;->localIp()Ljava/net/InetAddress;\n"
    "\n"
    "    move-result-object v0\n"
    "\n"
    "    if-eqz v0, :patch_nx_ip\n"
    "\n"
    "    return-object v0\n"
    "\n"
    "    :patch_nx_ip\n",
    "JmDNS.getLocalIpAddress")
# Network key: when the network changes (generation), the discovery module restarts itself.
jm.replace_once(
    "    invoke-virtual {v0}, Landroid/net/wifi/WifiInfo;->getBSSID()Ljava/lang/String;\n"
    "\n"
    "    move-result-object v1\n"
    "\n"
    "    :cond_1\n"
    "    return-object v1\n",
    "    invoke-virtual {v0}, Landroid/net/wifi/WifiInfo;->getBSSID()Ljava/lang/String;\n"
    "\n"
    "    move-result-object v1\n"
    "\n"
    "    :cond_1\n"
    "    invoke-static {v1}, Lcom/nice/patch/Nx;->networkKey(Ljava/lang/String;)Ljava/lang/String;\n"
    "\n"
    "    move-result-object v1\n"
    "\n"
    "    return-object v1\n",
    "JmDNS.getCurrentSSID")

# ---------------------------------------------------------------- ConnectionsManager.smali
cmg = open_file(find("smali*/com/nice/hki/protocol/ConnectionsManager.smali"))
# 1. Connect timeout from 5 s to 12 s: the module sometimes only answers after 1 to 2 s per packet.
cmg.replace_once(
    "    const/16 v1, 0x1388\n"
    "\n"
    "    invoke-virtual {v5, v0, v1}, Ljava/net/Socket;->connect(Ljava/net/SocketAddress;I)V\n",
    "    const/16 v1, 0x2ee0\n"
    "\n"
    "    invoke-virtual {v5, v0, v1}, Ljava/net/Socket;->connect(Ljava/net/SocketAddress;I)V\n",
    "ConnectionsManager._openSocket timeout")
# 2. During the module connection always use a socket on that network (and not on "the first Wi-Fi network").
cmg.replace_once(
    "    move-object v5, v3\n"
    "\n"
    "    const/4 v4, 0x0\n"
    "\n"
    "    :goto_1\n"
    "    const/4 v6, 0x1\n",
    "    move-object v5, v3\n"
    "\n"
    "    const/4 v4, 0x0\n"
    "\n"
    "    invoke-static {}, Lcom/nice/patch/Nx;->moduleSocket()Ljava/net/Socket;\n"
    "\n"
    "    move-result-object v6\n"
    "\n"
    "    if-eqz v6, :patch_nx_sock\n"
    "\n"
    "    move-object v5, v6\n"
    "\n"
    "    const/4 v6, 0x1\n"
    "\n"
    "    goto :goto_2\n"
    "\n"
    "    :patch_nx_sock\n"
    "    :goto_1\n"
    "    const/4 v6, 0x1\n",
    "ConnectionsManager._openSocket network choice")
# 2b. TLS handshake with a 15 s timeout. Without a timeout, a module that accepts TCP but no longer answers
#     TLS blocks the call forever, and because getActiveConnection is synchronized, everything behind it as well.
#     After the handshake the timeout goes back to 0 (infinite), because the read thread normally waits a long time for messages.
cmg.replace_once(
    "    check-cast p2, Ljavax/net/ssl/SSLSocket;\n"
    "\n"
    "    invoke-virtual {p2}, Ljavax/net/ssl/SSLSocket;->startHandshake()V\n",
    "    check-cast p2, Ljavax/net/ssl/SSLSocket;\n"
    "\n"
    "    const/16 v0, 0x3a98\n"
    "\n"
    "    invoke-virtual {p2, v0}, Ljava/net/Socket;->setSoTimeout(I)V\n"
    "\n"
    "    invoke-virtual {p2}, Ljavax/net/ssl/SSLSocket;->startHandshake()V\n"
    "\n"
    "    const/4 v0, 0x0\n"
    "\n"
    "    invoke-virtual {p2, v0}, Ljava/net/Socket;->setSoTimeout(I)V\n",
    "ConnectionsManager._openSocket handshake timeout")
# 3. IP safety net: if mDNS did not find the module, use the stored address instead of the (dead) cloud.
cmg.replace_once(
    "    :catch_0\n"
    "    :cond_5\n"
    "    if-nez v0, :cond_7\n"
    "\n"
    "    if-nez p2, :cond_7\n",
    "    :catch_0\n"
    "    :cond_5\n"
    "    :try_start_nx\n"
    "    if-nez v0, :cond_nx_skip\n"
    "\n"
    "    invoke-static {p1}, Lcom/nice/patch/Nx;->hintContext(Ljava/lang/String;)Lcom/nice/hki/model/ConnectionContext;\n"
    "\n"
    "    move-result-object v1\n"
    "\n"
    "    if-eqz v1, :cond_nx_skip\n"
    "\n"
    "    iget-object v0, p0, Lcom/nice/hki/protocol/ConnectionsManager;->localConnections:Ljava/util/Map;\n"
    "\n"
    "    invoke-interface {v0, p1, v1}, Ljava/util/Map;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;\n"
    "\n"
    "    move-object v0, v1\n"
    "\n"
    "    :cond_nx_skip\n"
    "    :try_end_nx\n"
    "    .catchall {:try_start_nx .. :try_end_nx} :catchall_0\n"
    "\n"
    "    if-nez v0, :cond_7\n"
    "\n"
    "    if-nez p2, :cond_7\n",
    "ConnectionsManager.getActiveConnection hint")

# ---------------------------------------------------------------- AndroidManifest.xml
man = open_file(find("AndroidManifest.xml"))
man.replace_once(
    '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>\n',
    '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>\n'
    '    <uses-permission android:name="android.permission.CHANGE_NETWORK_STATE"/>\n',
    "manifest CHANGE_NETWORK_STATE")
# New version number (apktool 2.10 only keeps it in apktool.yml), so that Android sees the installation as an
# update; with the same key the data of the app is preserved.
yml_path = os.path.join(ROOT, "apktool.yml")
yml = open(yml_path, encoding="utf-8", newline="").read()
yml, n3 = re.subn(r"versionCode: \d+", "versionCode: 20201126", yml, count=1)
yml, n4 = re.subn(r"versionName: \S+", "versionName: 2.2.0-nx28", yml, count=1)
if n3 != 1 or n4 != 1:
    sys.exit("version number not found in apktool.yml")
YML = (yml_path, yml)

# ---------------------------------------------------------------- res/xml/config.xml (Cordova plugins)
cfg = open_file(find("res/xml/config.xml"))
cfg.replace_once(
    '    <feature name="nhk">\n'
    '        <param name="android-package" value="com.nice.hki.Plugin" />\n'
    '    </feature>\n',
    '    <feature name="nhk">\n'
    '        <param name="android-package" value="com.nice.hki.Plugin" />\n'
    '    </feature>\n'
    '    <feature name="Nx">\n'
    '        <param name="android-package" value="com.nice.patch.NxPlugin" />\n'
    '    </feature>\n',
    "config.xml Nx plugin")

for b in FILES:
    b.write()
open(YML[0], "w", encoding="utf-8", newline="").write(YML[1])

print("patched (v8): WifiWizard, WifiWizard$2, JmDNSDiscoveryService, ConnectionsManager, manifest, config.xml")
