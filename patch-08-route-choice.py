#!/usr/bin/env python3
"""Patch nx6 (smali): make the app fall back to the cloud when the local route does not work, and have the cloud name
resolved via the underlying network when the VPN's DNS fails.

Usage: python patch-08-route-choice.py <apktool-output-dir>   (all or nothing: only writes after all replacements succeeded)

Three hooks in ConnectionsManager (com/nice/hki/protocol):
 1. getActiveConnection: directly after looking up the local connection (mDNS) it is passed through Nx.vetLocal().
    If there is no session yet and the address does not fit the network (with a VPN: it does not answer within 3 s),
    it becomes null and the app carries on as without a local connection: IP safety net (which does the same check), then
    the Nice cloud. In nx3 through nx5, with a VPN that captures or blocks the traffic to the module, the app got stuck
    on an address that does not work.
 2. getActiveConnection, at the end: Nx.noteRoute() remembers whether the choice is local or the cloud (for the status bar).
 3. openSocket: new InetSocketAddress(host, port) becomes Nx.socketAddress(host, port). Normal behavior stays the same;
    only when the resolution fails or gives an unusable answer (0.0.0.0 from a DNS filter) and there is a VPN,
    it uses the resolver of the underlying network.
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
ROOT = sys.argv[1]
PATH = os.path.join(ROOT, "smali", "com", "nice", "hki", "protocol", "ConnectionsManager.smali")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


s = read_text(PATH)
if "Lcom/nice/patch/Nx;->vetLocal" in s:
    sys.exit("already patched (nx6)")


def exactly_once(search, name):
    n = s.count(search)
    if n != 1:
        sys.exit("%s: expected 1 occurrence, found %d" % (name, n))


# ---- 1. check the local connection, before the IP safety net (patch-05 puts that safety net at this label)
VET_OLD = "    :try_start_nx\n    if-nez v0, :cond_nx_skip\n"
VET_NEW = (
    "    :try_start_nx\n"
    "    if-eqz v0, :cond_nx_vet\n"
    "\n"
    "    invoke-static {v0}, Lcom/nice/patch/Nx;->vetLocal(Lcom/nice/hki/model/ConnectionContext;)Lcom/nice/hki/model/ConnectionContext;\n"
    "\n"
    "    move-result-object v0\n"
    "\n"
    "    :cond_nx_vet\n"
    "    if-nez v0, :cond_nx_skip\n"
)
exactly_once(VET_OLD, "vet hook (IP safety net of patch-05 missing?)")
s = s.replace(VET_OLD, VET_NEW)

# ---- 2. remember the chosen route
ROUTE_OLD = "    :cond_7\n    if-eqz v0, :cond_8\n"
ROUTE_NEW = (
    "    :cond_7\n"
    "    invoke-static {v0}, Lcom/nice/patch/Nx;->noteRoute(Lcom/nice/hki/model/ConnectionContext;)V\n"
    "\n"
    "    if-eqz v0, :cond_8\n"
)
exactly_once(ROUTE_OLD, "route hook")
s = s.replace(ROUTE_OLD, ROUTE_NEW)

# ---- 3. name resolution
ADDR_OLD = (
    "    new-instance v0, Ljava/net/InetSocketAddress;\n"
    "\n"
    "    invoke-direct {v0, p1, p2}, Ljava/net/InetSocketAddress;-><init>(Ljava/lang/String;I)V\n"
)
ADDR_NEW = (
    "    invoke-static {p1, p2}, Lcom/nice/patch/Nx;->socketAddress(Ljava/lang/String;I)Ljava/net/InetSocketAddress;\n"
    "\n"
    "    move-result-object v0\n"
)
exactly_once(ADDR_OLD, "address hook")
s = s.replace(ADDR_OLD, ADDR_NEW)

# everything succeeded: only now write
open(PATH, "w", encoding="utf-8", newline="").write(s)
print("patched (nx6): ConnectionsManager (vetLocal, noteRoute, socketAddress)")
