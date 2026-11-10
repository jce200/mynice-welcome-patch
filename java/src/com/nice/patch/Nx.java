package com.nice.patch;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.RouteInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import com.nice.hki.model.ConnectionContext;
import com.nice.hki.protocol.ConnectionsManager;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONObject;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Helper functions for the patched MyNice Welcome. The smali hooks in the app call these static
 * methods; everything here catches its own errors, so that a fault in this layer never hurts the
 * app more than the original behavior did.
 *
 * Deliberately free of references to API 29 classes: those live in {@link NxWifi}.
 */
public final class Nx {
    private Nx() { }

    static final String TAG = "NX";
    public static final String PATCH_VERSION = "nx-27";

    /** Log channel to the LOG panel in the app (see NxPlugin 'logStream'). */
    static volatile CallbackContext logCb;
    static volatile Context appCtx;

    // State of the accessory Wi-Fi connected through WifiNetworkSpecifier (only NxWifi writes it).
    static volatile String activeSsid;
    static volatile Network activeNetwork;
    static volatile InetAddress activeIp;
    /** Incremented on every network change; part of the network key of the discovery module (JmDNS). */
    static volatile int generation;

    private static volatile Map<String, String> hints = new HashMap<String, String>();
    private static final Pattern IPV4 =
            Pattern.compile("^(25[0-5]|2[0-4]\\d|1?\\d?\\d)(\\.(25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}$");

    // ------------------------------------------------------------------ logging

    public static void log(String msg) {
        try {
            Log.i(TAG, msg);
        } catch (Throwable ignored) { }
        CallbackContext l = logCb;
        if (l != null) {
            try {
                PluginResult r = new PluginResult(PluginResult.Status.OK, msg);
                r.setKeepCallback(true);
                l.sendPluginResult(r);
            } catch (Throwable ignored) { }
        }
    }

    // ------------------------------------------------------------------ events the app does not read (nx26)

    private static final Pattern EVENT_TYPE = Pattern.compile("<Event\\b[^>]*\\btype=\"([^\"]*)\"");
    private static final Pattern EVENT_KNOWN = Pattern.compile("^(CHANGE|USER_NEW|USER_EDIT|GROUP_EDIT|TABLE_CHANGE|BINDING)$");

    /** Called by MessageParser for every event, before the app parses it (patch-22). Never throws. */
    public static void noteEvent(String xml) {
        try {
            String d = describeEvent(xml);
            if (d != null) { log(d); return; }
            // an event that the app reads completely: one line per type and session, so that the log shows that this hook sees the events at all
            String t = eventType(xml);
            synchronized (seenEvents) { if (!seenEvents.add(t)) return; }
            log("event " + t + ": read by the app, no details in it (said once per type)");
        } catch (Throwable ignored) { }
    }

    /**
     * The line for the Debug log, or null for an event that the app reads completely. An event of a type that the app does not know
     * (DIAGNOSTIC) and an event with EventDetails are written out, without the names, the addresses and the signature in them.
     */
    private static final java.util.Set<String> seenEvents = new java.util.HashSet<String>();

    static String eventType(String xml) {
        if (xml == null) return "";
        Matcher m = EVENT_TYPE.matcher(xml);
        return m.find() ? m.group(1) : "";
    }

    static String describeEvent(String xml) {
        if (xml == null) return null;
        String type = eventType(xml);
        boolean known = EVENT_KNOWN.matcher(type).matches();
        if (known && !xml.contains("EventDetails")) return null;
        String s = xml.replaceAll("[\\u0000-\\u001f]+", " ").replaceAll("\\s+", " ").trim();
        s = s.replaceAll("\\b(source|target|gw|username|user)=\"[^\"]*\"", "$1=\"...\"");
        s = s.replaceAll("<(Sign|SerialNr|User|Username)>[^<]*</\\1>", "<$1>...</$1>");
        s = s.replaceAll("(?i)\\b[0-9a-f]{2}([:-][0-9a-f]{2}){5}\\b", "..:..:..");
        if (s.length() > 1800) s = s.substring(0, 1800) + " ... (" + s.length() + " characters)";
        return "event " + (type.length() == 0 ? "(no type)" : type) + (known ? " with details the app does not read: " : " (not read by the app): ") + s;
    }

    // ------------------------------------------------------------------ small helpers

    static String unquote(String s) {
        if (s == null) return "";
        String t = s.trim();
        if (t.length() >= 2 && t.charAt(0) == '"' && t.charAt(t.length() - 1) == '"') {
            t = t.substring(1, t.length() - 1);
        }
        return t;
    }

    /** SSIDs of Nice accessories; the same prefixes as the filter in the wizard. */
    static boolean isModuleSsid(String ssid) {
        return ssid != null && (ssid.startsWith("NiceIT4WIFI")
                || ssid.startsWith("NiceCORE")
                || ssid.startsWith("NiceBridge"));
    }

    static InetAddress ipv4Of(ConnectivityManager cm, Network n) {
        try {
            LinkProperties lp = cm.getLinkProperties(n);
            if (lp == null) return null;
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress a = la.getAddress();
                if (a instanceof Inet4Address && !a.isLoopbackAddress()) return a;
            }
        } catch (Throwable t) {
            log("ipv4Of: " + t);
        }
        return null;
    }

    /**
     * A real Wi-Fi network: Wi-Fi transport and NOT a VPN. On modern Android versions a VPN over Wi-Fi
     * reports TRANSPORT_WIFI too (the VPN takes over the transports of the network beneath it); nx3
     * therefore sometimes picked the VPN network as "the Wi-Fi" (sockets and IP address of the tunnel instead of the Wi-Fi's).
     */
    static boolean realWifi(boolean transportWifi, boolean transportVpn) {
        return transportWifi && !transportVpn;
    }

    static boolean isRealWifi(ConnectivityManager cm, Network n) {
        NetworkCapabilities c = cm.getNetworkCapabilities(n);
        return c != null && realWifi(c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
                c.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
    }

    static Network pickWifi(ConnectivityManager cm) {
        Network m = activeNetwork;
        if (m != null) return m;
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkInfo i = cm.getNetworkInfo(n);
                if (i != null && i.isConnected() && isRealWifi(cm, n)) {
                    return n;
                }
            }
        } catch (Throwable t) {
            log("pickWifi: " + t);
        }
        return null;
    }

    // ------------------------------------------------------------------ hooks for WifiWizard

    /**
     * Called from WifiWizard.connectNetwork. Returns true if everything has been handled here
     * (the callback then gets its answer from us); false lets the existing code carry on.
     */
    public static boolean handleConnect(Activity act, CallbackContext cb, CallbackContext events, JSONArray data) {
        try {
            appCtx = act.getApplicationContext();
            String ssid = unquote(data.getString(0));
            boolean module = isModuleSsid(ssid);
            log("connectNetwork " + ssid + (module ? " (accessory)" : " (home network)")
                    + ", Android API " + Build.VERSION.SDK_INT);
            if (!module) {
                // Back to the home network: first release the app-specific accessory connection, then
                // the existing code waits until the phone has joined it by itself.
                if (Build.VERSION.SDK_INT >= 29) NxWifi.release(appCtx, "back to home network");
                return false;
            }
            if (Build.VERSION.SDK_INT < 29) return false;
            return NxWifi.connect(act, cb, events, ssid);
        } catch (Throwable t) {
            log("handleConnect error: " + t);
            return false;
        }
    }

    /** Called from the Wi-Fi receiver (WifiWizard$2): remember the context, so that wifiType() always has one. */
    public static void ctx(Context c) {
        try {
            if (c != null && appCtx == null) {
                Context a = c.getApplicationContext();
                appCtx = a != null ? a : c;
            }
        } catch (Throwable ignored) { }
    }

    private static volatile int lastReportedType = Integer.MIN_VALUE;

    /**
     * Called from the Wi-Fi receiver, right after NetworkInfo.getType() of getActiveNetworkInfo().
     *
     * The app reports "wifi-disconnected" as soon as the ACTIVE network is not Wi-Fi, and the JS then sets every
     * accessory to "Not usable". With a VPN the active network (for this app) is the type of the VPN or of the
     * network beneath it, and with mobile data present Android may regard a Wi-Fi without internet as non-default.
     * The phone is then still simply on the accessory's Wi-Fi. As long as a real Wi-Fi is connected, "Wi-Fi"
     * is the right answer.
     */
    public static int wifiType(int type) {
        if (type == ConnectivityManager.TYPE_WIFI) return type;
        try {
            if (hasWifi()) {
                if (lastReportedType != type) {
                    lastReportedType = type;
                    log("network report: active network is type " + type + " (VPN or mobile), but a Wi-Fi is "
                            + "connected: treated as Wi-Fi, not as 'Wi-Fi lost'");
                }
                return ConnectivityManager.TYPE_WIFI;
            }
        } catch (Throwable ignored) { }
        return type;
    }

    /** Called from WifiWizard.getConnectedSSID: report the accessory SSID as long as that connection is active. */
    public static boolean handleSsid(CallbackContext cb) {
        try {
            String s = activeSsid;
            if (s == null || activeNetwork == null) return false;
            JSONObject o = new JSONObject();
            o.put("ssid", "\"" + s + "\"");
            o.put("networkId", -2);
            cb.success(o);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    // ------------------------------------------------------------------ hooks for the discovery module (JmDNS)

    /** true as long as the app-specific accessory connection is active (the old binding logic must then not release anything). */
    public static boolean moduleActive() {
        return activeNetwork != null;
    }

    /** Own IPv4 on the accessory network; null if there is no accessory connection (the old method then applies). */
    public static InetAddress localIp() {
        return activeNetwork != null ? activeIp : null;
    }

    /** Key by which JmDNS notices that the network has changed (and restarts itself). */
    public static String networkKey(String ssid) {
        return (ssid == null ? "" : ssid) + "#nx" + generation;
    }

    /** Socket on the accessory network; null if that is not active (the old code then chooses by itself). */
    public static Socket moduleSocket() {
        Network n = activeNetwork;
        if (n == null) return null;
        try {
            return n.getSocketFactory().createSocket();
        } catch (Throwable t) {
            log("moduleSocket: " + t);
            return null;
        }
    }

    // ------------------------------------------------------------------ does the stored address fit this network?

    /** Is addr inside the network net/prefix? Only for equal lengths (IPv4 with IPv4, IPv6 with IPv6). */
    static boolean sameSubnet(byte[] net, int prefix, byte[] addr) {
        if (net == null || addr == null || net.length != addr.length || prefix < 0 || prefix > net.length * 8) return false;
        int full = prefix / 8, rest = prefix % 8;
        for (int i = 0; i < full; i++) {
            if (net[i] != addr[i]) return false;
        }
        if (rest == 0) return true;
        int masker = (0xFF << (8 - rest)) & 0xFF;
        return (net[full] & masker) == (addr[full] & masker);
    }

    static List<Network> connectedVpns(ConnectivityManager cm) {
        List<Network> out = new ArrayList<Network>();
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities c = cm.getNetworkCapabilities(n);
                NetworkInfo i = cm.getNetworkInfo(n);
                if (c != null && i != null && i.isConnected() && c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) out.add(n);
            }
        } catch (Throwable t) {
            log("connectedVpns: " + t);
        }
        return out;
    }

    private static volatile String hintKey;
    private static volatile long hintUntil;
    private static volatile boolean hintValue;

    static boolean inSubnetOf(ConnectivityManager cm, Network n, byte[] target) {
        try {
            LinkProperties lp = cm.getLinkProperties(n);
            if (lp == null) return false;
            for (LinkAddress la : lp.getLinkAddresses()) {
                InetAddress a = la.getAddress();
                if (a instanceof Inet4Address && sameSubnet(a.getAddress(), la.getPrefixLength(), target)) return true;
            }
        } catch (Throwable t) {
            log("inSubnetOf: " + t);
        }
        return false;
    }

    /** The first connected mobile network (not a VPN): what the app binds its socket to when there is no Wi-Fi. */
    static Network firstMobile(ConnectivityManager cm) {
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities c = cm.getNetworkCapabilities(n);
                NetworkInfo i = cm.getNetworkInfo(n);
                if (c != null && i != null && i.isConnected() && c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                        && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return n;
            }
        } catch (Throwable t) {
            log("firstMobile: " + t);
        }
        return null;
    }

    /**
     * May the address of an accessory be tried on this network?
     *
     * The app first picks a local connection (mDNS), then the IP fallback of nx3, and only then the Nice cloud, and
     * there is no fallback if the chosen connection fails. Without this check the home address was therefore tried
     * ahead of the cloud away from home too, and with a VPN (Tailscale) that sends the traffic to the address into
     * the tunnel or blocks it, the app got stuck on an address that does not work. Rules:
     *  - Without a VPN: if the Wi-Fi is in the same network as the address, yes (the usual case, at home on any Wi-Fi
     *    of the same router); without Wi-Fi no (no route to a local address); on a different Wi-Fi only if the
     *    address answers within 3 s (a routed network).
     *  - With a VPN: the VPN can capture, redirect or block the traffic to the address, and an app cannot bypass
     *    it. Only a real measurement then tells whether it works, over the same route the app itself takes.
     * If this says no, the app does not get the address and falls back to the cloud. When in doubt or on error: yes.
     */
    static boolean hintAllowed(String addr) {
        try {
            if (cloudPreferenceActive()) return false;    // the local route just failed; cloud first (see checkFailed)
            Context c = appCtx;
            if (c == null) return true;
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return true;
            byte[] target = InetAddress.getByName(addr).getAddress();   // a literal IP address: no DNS
            Network wifi = pickWifi(cm);
            List<Network> vpns = connectedVpns(cm);
            boolean vpn = !vpns.isEmpty();
            Network via;
            if (!vpn) {
                if (wifi != null && inSubnetOf(cm, wifi, target)) return true;
                if (wifi == null) return false;
                via = wifi;
            } else {
                if (wifi == null && vpnRouteFor(cm, vpns, addr) == null) return false;   // nothing leads to the address
                via = wifi != null ? wifi : firstMobile(cm);                             // null: the default route
            }
            String key = addr + "#" + via + "#" + vpns;
            long nu = SystemClock.elapsedRealtime();
            if (key.equals(hintKey) && nu < hintUntil) return hintValue;
            boolean ok = tcpOver(via, addr, 443, 3000);
            hintKey = key;
            hintValue = ok;
            hintUntil = nu + (ok ? 60000 : 30000);
            return ok;
        } catch (Throwable t) {
            log("hintAllowed: " + t);
            return true;
        }
    }

    /** TCP connection over a network (or, for null, the default route); only to measure. */
    static boolean tcpOver(Network n, String host, int port, int timeoutMs) {
        Socket s = null;
        try {
            s = n != null ? socketFor(n) : new Socket();
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (Throwable t) {
            return false;
        } finally {
            if (s != null) {
                try { s.close(); } catch (Throwable ignored) { }
            }
        }
    }

    // ------------------------------------------------------------------ hooks in getActiveConnection (smali)

    /**
     * Called from ConnectionsManager.getActiveConnection, right after the local connection (mDNS) has been looked up.
     * If there is no session yet and the address does not fit this network, this returns null: the app then carries on
     * as without a local connection (IP fallback, then the cloud). A working session and the cloud are left alone.
     */
    public static ConnectionContext vetLocal(ConnectionContext c) {
        try {
            if (c == null || c.isCloudConnection() || c.isActive()) return c;
            String addr = c.getAddress();
            if (addr == null || !IPV4.matcher(addr).matches()) return c;
            if (hintAllowed(addr)) return c;
            log("local address " + addr + " is not reachable from the phone on this network; the app falls back to the Nice cloud");
            return null;
        } catch (Throwable t) {
            return c;
        }
    }

    private static volatile String lastRoute;
    private static volatile long lastRouteAt;

    // ------------------------------------------------------------------ local and cloud take turns when one fails

    private static volatile long cloudPreferenceUntil;     // clock() time until which the cloud takes priority; 0 = it does not
    private static volatile int localFailures;

    static long clock() {
        return System.nanoTime() / 1000000L;
    }

    static boolean cloudPreferenceActive() {
        return clock() < cloudPreferenceUntil;
    }

    /** Remaining seconds that the cloud takes priority (0 if it does not). */
    static long cloudPreferenceRemaining() {
        long r = cloudPreferenceUntil - clock();
        return r > 0 ? r / 1000 : 0;
    }

    /**
     * Called from the JS when a check of the accessory failed. If the chosen route was local (the accessory sometimes accepted the
     * connection but did not answer the TLS handshake: it hangs), the cloud takes priority for a while: 2 minutes, doubled on each
     * further local failure up to 15 minutes. If the cloud failed, local is allowed again. This way, with a hanging accessory, the
     * app gets online via the cloud after one failed attempt, and does not stay stuck on one route.
     */
    static void checkFailed() {
        String r = lastRoute;
        if ("local".equals(r)) {
            localFailures++;
            long duration = Math.min(900000L, 120000L << Math.min(localFailures - 1, 3));
            cloudPreferenceUntil = clock() + duration;
            log("local connection to the accessory failed; the Nice cloud takes priority for " + (duration / 1000) + " s");
        } else if ("cloud".equals(r)) {
            if (cloudPreferenceUntil != 0) log("the Nice cloud failed too; the local connection is allowed again");
            cloudPreferenceUntil = 0;
        }
    }

    /** Called from the JS when a check succeeded. Via the local route: the cloud no longer needs to take priority. */
    static void checkSucceeded() {
        if ("local".equals(lastRoute)) {
            if (localFailures != 0 || cloudPreferenceUntil != 0) log("local connection to the accessory works again");
            localFailures = 0;
            cloudPreferenceUntil = 0;
        }
    }

    /** Called from getActiveConnection with the final choice: remember whether that is local or the cloud (for the status bar). */
    public static void noteRoute(ConnectionContext c) {
        try {
            String r = c == null ? null : (c.isCloudConnection() ? "cloud" : "local");
            if (r != null && !r.equals(lastRoute)) log("route to the accessory: " + r);
            lastRoute = r;
            lastRouteAt = SystemClock.elapsedRealtime();
        } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------ name resolution of the cloud (smali)

    /** A usable answer: not 0.0.0.0 or ::, not loopback (which is how a DNS filter answers for a blocked name). */
    static boolean usable(InetAddress a) {
        return a != null && !a.isAnyLocalAddress() && !a.isLoopbackAddress();
    }

    /** Resolve a name with each real network's own resolver (Wi-Fi first); null if nothing works. */
    static InetSocketAddress viaNetworks(ConnectivityManager cm, String host, int port) {
        List<Network> order = new ArrayList<Network>();
        try {
            Network w = pickWifi(cm);
            if (w != null) order.add(w);
            Network m = firstMobile(cm);
            if (m != null) order.add(m);
        } catch (Throwable t) {
            log("viaNetworks: " + t);
        }
        for (Network n : order) {
            try {
                InetAddress[] all = n.getAllByName(host);
                InetAddress first = null;
                for (InetAddress a : all) {
                    if (!usable(a)) continue;
                    if (a instanceof Inet4Address) return new InetSocketAddress(a, port);
                    if (first == null) first = a;
                }
                if (first != null) return new InetSocketAddress(first, port);
            } catch (Throwable t) {
                log("name resolution of " + host + " via " + n + ": " + t);
            }
        }
        return null;
    }

    /**
     * Replaces new InetSocketAddress(host, port) in ConnectionsManager.openSocket. First the normal resolution, as the
     * original does. If that fails or gives an unusable answer, and there is a VPN, then via the resolver of the
     * underlying network: a VPN takes over the phone's DNS (Tailscale: MagicDNS, often with the filter of the
     * user's own DNS server), and the cloud then no longer got through.
     */
    public static InetSocketAddress socketAddress(String host, int port) {
        InetSocketAddress normal = new InetSocketAddress(host, port);
        try {
            if (!normal.isUnresolved() && usable(normal.getAddress())) return normal;
            if (IPV4.matcher(host).matches()) return normal;
            Context c = appCtx;
            if (c == null) return normal;
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null || !hasVpn(cm)) return normal;           // without a VPN: exactly the behavior of the original
            InetSocketAddress alt = viaNetworks(cm, host, port);
            if (alt != null) {
                log("name resolution of " + host + " via the network itself succeeded: " + alt.getAddress().getHostAddress());
                return alt;
            }
        } catch (Throwable t) {
            log("socketAddress: " + t);
        }
        return normal;
    }

    // ------------------------------------------------------------------ binding sockets to a network (and what a VPN does about it)

    private static volatile long lastBindLog;

    /**
     * A socket bound to a network, as the original app always does it (Network.getSocketFactory().createSocket()).
     * If Android does not allow that, a plain socket comes out here instead of the error.
     *
     * That happens as soon as a VPN is on that cannot be bypassed (Tailscale): an app that this VPN applies to may not
     * bind its socket to another network ("Binding socket to network N failed: EPERM (Operation not permitted)").
     * The original app therefore failed every connection to the accessory and to the cloud, even when the VPN does not
     * touch the address at all. A plain socket follows the default route: addresses in the home network go via the
     * Wi-Fi, the internet via the underlying network, and a VPN only forces the traffic into the tunnel if its routes match.
     */
    public static Socket socketFor(Network n) {
        return socketFor(n, null);
    }

    static Socket socketFor(Network n, boolean[] bound) {
        try {
            Socket s = n.getSocketFactory().createSocket();
            if (bound != null) bound[0] = true;
            return s;
        } catch (Throwable t) {
            if (bound != null) bound[0] = false;
            try {
                long nu = SystemClock.elapsedRealtime();
                if (nu - lastBindLog > 30000) {
                    lastBindLog = nu;
                    log("binding socket to the network failed (" + t.getMessage() + "); plain socket used, as a VPN requires");
                }
            } catch (Throwable ignored) { }
            return new Socket();
        }
    }

    /** Is a VPN on right now? Then the whole process must not be bound to a Wi-Fi (all new sockets would then fail with EPERM). */
    public static boolean vpnActive() {
        try {
            Context c = appCtx;
            if (c == null) return false;
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            return cm != null && hasVpn(cm);
        } catch (Throwable t) {
            return false;
        }
    }

    // ------------------------------------------------------------------ IP fallback for "Not usable"

    /**
     * The app only knows accessories that mDNS has found. If mDNS does not find one (the accessory
     * sometimes does not answer it), the app fell back to the cloud and reported "Not usable". With the
     * stored address from the app itself we then still try to connect directly.
     */
    public static ConnectionContext hintContext(String mac) {
        try {
            if (mac == null) return null;
            String addr = hints.get(mac.toUpperCase(Locale.US));
            if (addr == null) return null;
            if (!hintAllowed(addr)) {
                log("stored address " + addr + " does not fit this network; the app falls back to the Nice cloud, like the original");
                return null;
            }
            ConnectionContext c = new ConnectionContext();
            c.setMac(mac);
            c.setAddress(addr);
            c.setPort(443);
            c.setServiceType("_nap._tcp.local.");
            c.setCloudConnection(false);
            log("mDNS did not find " + mac + "; trying the stored address " + addr);
            return c;
        } catch (Throwable t) {
            return null;
        }
    }

    static void setHints(JSONArray arr) {
        Map<String, String> m = new HashMap<String, String>();
        for (int i = 0; arr != null && i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o == null) continue;
            String mac = o.optString("mac", "");
            String addr = o.optString("address", "");
            if (mac.length() == 0 || !IPV4.matcher(addr).matches()) continue;
            m.put(mac.toUpperCase(Locale.US), addr);
        }
        if (!m.equals(hints)) log("stored addresses updated: " + m);
        hints = m;
    }

    // ------------------------------------------------------------------ discovery module and sessions

    /** Restarts the discovery module; needs two passes (the first creates JmDNS, the second turns the listeners on). */
    static void restartDiscovery(final String why) {
        Thread t = new Thread(new Runnable() {
            @Override public void run() { restartDiscoveryNow(why); }
        }, "nx-discovery");
        t.setDaemon(true);
        t.start();
    }

    static void restartDiscoveryNow(String why) {
        try {
            ConnectionsManager m = ConnectionsManager.getInstance();
            m.onWifiConnected();
            Thread.sleep(1500);
            m.onWifiConnected();
            log("discovery restarted (" + why + ")");
        } catch (Throwable t) {
            log("restarting discovery failed (" + why + "): " + t);
        }
    }

    /** After releasing the accessory Wi-Fi: close old sessions and, as soon as there is Wi-Fi again, search again. */
    static void afterRelease() {
        Thread t = new Thread(new Runnable() {
            @Override public void run() {
                try {
                    ConnectionsManager.getInstance().onWifiDisconnected();
                } catch (Throwable e) {
                    log("closing sessions: " + e);
                }
                for (int i = 0; i < 6; i++) {
                    try { Thread.sleep(4000); } catch (InterruptedException e) { return; }
                    if (hasWifi()) {
                        restartDiscoveryNow("back on Wi-Fi");
                        return;
                    }
                }
            }
        }, "nx-after-release");
        t.setDaemon(true);
        t.start();
    }

    static boolean hasWifi() {
        try {
            Context c = appCtx;
            if (c == null) return false;
            ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
            return pickWifi(cm) != null;
        } catch (Throwable t) {
            return false;
        }
    }

    /** "Reconnect": close all sessions and restart the discovery module. */
    static void reconnect() {
        try {
            ConnectionsManager.getInstance().onWifiDisconnected();
        } catch (Throwable t) {
            // for example when the cloud connection does not exist yet; the local sessions have then already been closed
            log("closing sessions: " + t);
        }
        try { Thread.sleep(400); } catch (InterruptedException ignored) { }
        restartDiscoveryNow("manual reconnect");
    }

    // ------------------------------------------------------------------ state and measurement for the status bar

    /**
     * Which network Android itself regards as active for this app (which is what the app bases its "Wi-Fi lost"
     * reports on): "wifi", "mobile", "vpn" or "none". With a VPN that is the type of the VPN or that of the
     * network beneath it, depending on what the VPN app sets.
     */
    static String defaultNetwork(ConnectivityManager cm) {
        try {
            Network d = Build.VERSION.SDK_INT >= 23 ? cm.getActiveNetwork() : null;
            NetworkCapabilities c = d != null ? cm.getNetworkCapabilities(d) : null;
            if (c == null) return "none";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "vpn";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "wifi";
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "mobile";
            return "other";
        } catch (Throwable t) {
            return "unknown";
        }
    }

    /** Readable label for a route, for example "192.168.1.0/24 via tun0". */
    static String routeLabel(String destination, String interfaceName) {
        String b = (destination == null || destination.length() == 0) ? "?" : destination;
        return (interfaceName == null || interfaceName.length() == 0) ? b : b + " via " + interfaceName;
    }

    /**
     * Does a VPN capture the traffic to this address? Then this returns the route (the longest one that matches),
     * otherwise null. A VPN has its own routes; if 192.168.1.0/24 is among them (a subnet route, or an exit node
     * with 0.0.0.0/0), the traffic to the accessory goes into the tunnel and does not reach the accessory, not
     * even when the app binds its socket to the Wi-Fi (that only helps if the VPN allows it).
     */
    static String vpnRouteFor(ConnectivityManager cm, List<Network> vpns, String host) {
        try {
            if (host == null || !IPV4.matcher(host).matches()) return null;
            InetAddress a = InetAddress.getByName(host);   // a literal IP address: no DNS
            String best = null;
            int bestLen = -1;
            for (Network n : vpns) {
                LinkProperties lp = cm.getLinkProperties(n);
                if (lp == null) continue;
                for (RouteInfo r : lp.getRoutes()) {
                    if (!r.matches(a)) continue;
                    int len = r.isDefaultRoute() ? 0 : 32;
                    String dest = r.isDefaultRoute() ? "0.0.0.0/0" : null;
                    try {
                        len = r.getDestination().getPrefixLength();
                        dest = String.valueOf(r.getDestination());
                    } catch (Throwable ignored) { }       // API < 29: no IpPrefix
                    if (len > bestLen) {
                        bestLen = len;
                        best = routeLabel(dest, r.getInterface());
                    }
                }
            }
            return best;
        } catch (Throwable t) {
            log("vpnRouteFor: " + t);
            return null;
        }
    }

    static JSONObject netState(Context ctx, String host) throws Exception {
        JSONObject o = new JSONObject();
        o.put("version", PATCH_VERSION);
        o.put("sdk", Build.VERSION.SDK_INT);
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean cellular = false, vpn = false;
        Network wifi = null;
        List<Network> vpns = new ArrayList<Network>();
        for (Network n : cm.getAllNetworks()) {
            NetworkCapabilities c = cm.getNetworkCapabilities(n);
            NetworkInfo i = cm.getNetworkInfo(n);
            if (c == null || i == null || !i.isConnected()) continue;
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                // a VPN over Wi-Fi or mobile also reports the transports of the network beneath it: do not count those
                vpn = true;
                vpns.add(n);
                continue;
            }
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) cellular = true;
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && wifi == null) wifi = n;
        }
        if (activeNetwork != null) wifi = activeNetwork;
        o.put("wifi", wifi != null);
        o.put("cellular", cellular);
        o.put("vpn", vpn);
        o.put("module", activeNetwork != null);
        o.put("defaultType", defaultNetwork(cm));
        String chosen = lastRoute;
        o.put("route", chosen == null ? JSONObject.NULL : chosen);
        if (chosen != null) o.put("routeAgeSeconds", (SystemClock.elapsedRealtime() - lastRouteAt) / 1000);
        long preference = cloudPreferenceRemaining();
        if (preference > 0) o.put("cloudPreference", preference);
        if (vpn && host != null && IPV4.matcher(host).matches()) {
            // only if we have an address to test; "no route" (null) is then a real answer
            String route = vpnRouteFor(cm, vpns, host);
            o.put("vpnRoute", route == null ? JSONObject.NULL : route);
        }
        String ssid = activeSsid;
        if (ssid == null) {
            try {
                WifiManager wm = (WifiManager) ctx.getSystemService(Context.WIFI_SERVICE);
                WifiInfo wi = wm.getConnectionInfo();
                String s = wi != null ? wi.getSSID() : null;
                if (s != null && !s.contains("unknown ssid")) ssid = unquote(s);
            } catch (Throwable ignored) { }
        }
        o.put("ssid", ssid == null ? JSONObject.NULL : ssid);
        if (wifi != null) {
            NetworkCapabilities c = cm.getNetworkCapabilities(wifi);
            o.put("validated", c != null && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            InetAddress ip = ipv4Of(cm, wifi);
            o.put("ip", ip == null ? JSONObject.NULL : ip.getHostAddress());
        }
        return o;
    }

    /**
     * Measures whether the accessory is reachable, over the Wi-Fi network (not over mobile data or a VPN).
     * Optionally the TLS handshake too, because that is where a slow accessory gets stuck first.
     * The handshake accepts any certificate, as the app itself does for the accessory; no
     * data is sent.
     */
    static JSONObject probe(Context ctx, String host, int port, int tcpTimeoutMs, boolean tls, boolean cloud) {
        JSONObject o = new JSONObject();
        Socket s = null;
        ConnectivityManager cm = null;
        boolean address = host != null && host.length() > 0;
        try {
            cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            Network wifi = pickWifi(cm);
            if (!address) {
                o.put("ok", false);
                o.put("error", "NO_ADDRESS");
                // still measure the cloud (below)
            } else if (wifi == null) {
                o.put("ok", false);
                o.put("error", "NO_WIFI");
            } else {
            long t0 = SystemClock.elapsedRealtime();
            boolean[] bound = new boolean[1];
            s = socketFor(wifi, bound);
            o.put("bound", bound[0]);     // false: the VPN did not allow binding to the Wi-Fi, so this is the plain connection
            s.connect(new InetSocketAddress(host, port), tcpTimeoutMs);
            long t1 = SystemClock.elapsedRealtime();
            o.put("tcpMs", t1 - t0);
            if (tls) {
                SSLContext c = SSLContext.getInstance("SSL");
                c.init(null, new TrustManager[] { new AcceptAll() }, new java.security.SecureRandom());
                SSLSocket ss = (SSLSocket) c.getSocketFactory().createSocket(s, host, port, true);
                s = ss;
                ss.setSoTimeout(Math.max(tcpTimeoutMs, 10000));
                ss.startHandshake();
                o.put("tlsMs", SystemClock.elapsedRealtime() - t1);
            }
            o.put("ok", true);
            }
        } catch (Throwable t) {
            try {
                o.put("ok", false);
                o.put("error", t.getClass().getSimpleName() + (t.getMessage() != null ? ": " + t.getMessage() : ""));
            } catch (Throwable ignored) { }
        } finally {
            if (s != null) {
                try { s.close(); } catch (Throwable ignored) { }
            }
        }
        // Second measurement, only if there is a VPN or mobile data: connect like an app without its own
        // network choice (Android's default route). If the outcome differs from the one over Wi-Fi, we know
        // that the route is the problem and not the accessory.
        try {
            boolean noWifi = "NO_WIFI".equals(o.optString("error", ""));
            // with Wi-Fi: also measure the default route if there is a VPN or mobile data; without Wi-Fi only if there is a VPN
            // (on the road with a VPN to home, that is the only route to the accessory)
            boolean measure = address && cm != null && (noWifi ? hasVpn(cm) : hasVpnOrCellular(cm));
            // if the measurement above was already a plain connection (binding failed), this is the same measurement
            if (measure && !o.optBoolean("bound", true)) measure = false;
            if (measure) {
                o.put("std", stdProbe(host, port, Math.min(tcpTimeoutMs, 4000)));
            }
        } catch (Throwable ignored) { }
        // The route to the Nice cloud: the way the app reaches the accessory when on the road.
        if (cloud) {
            try {
                o.put("cloud", cloudTest(cm));
            } catch (Throwable ignored) { }
        }
        return o;
    }

    static final String CLOUD_HOST = "it4wifi.cloud.nice.niceappdomain.com";
    static final int CLOUD_PORT = 7890;

    /**
     * Measures the route to the Nice cloud as the app itself takes it: the name (normal resolution, and via the network
     * itself if that fails or is unusable), then TCP to port 7890 over the network the app binds its
     * socket to (Wi-Fi, otherwise mobile). No data is sent.
     */
    static JSONObject cloudTest(ConnectivityManager cm) {
        JSONObject o = new JSONObject();
        Socket s = null;
        try {
            long t0 = SystemClock.elapsedRealtime();
            InetAddress plain = null;
            String failure = null;
            try {
                plain = InetAddress.getByName(CLOUD_HOST);
            } catch (Throwable t) {
                failure = t.getClass().getSimpleName();
            }
            o.put("dnsMs", SystemClock.elapsedRealtime() - t0);
            InetAddress target = null;
            if (plain != null && usable(plain)) {
                target = plain;
                o.put("dns", plain.getHostAddress());
            } else {
                o.put("dnsError", plain != null ? "unusable answer " + plain.getHostAddress() : failure);
                InetSocketAddress alt = cm != null ? viaNetworks(cm, CLOUD_HOST, CLOUD_PORT) : null;
                if (alt != null) {
                    target = alt.getAddress();
                    o.put("dnsViaNetwork", target.getHostAddress());
                }
            }
            if (target == null) {
                o.put("ok", false);
                return o;
            }
            Network via = null;
            if (cm != null) {
                via = pickWifi(cm);
                if (via == null) via = firstMobile(cm);
            }
            long t1 = SystemClock.elapsedRealtime();
            try {
                boolean[] bound = new boolean[1];
                s = via != null ? socketFor(via, bound) : new Socket();
                if (via != null) o.put("bound", bound[0]);
                s.connect(new InetSocketAddress(target, CLOUD_PORT), 4000);
                o.put("ok", true);
                o.put("tcpMs", SystemClock.elapsedRealtime() - t1);
            } catch (Throwable t) {
                o.put("ok", false);
                o.put("error", t.getClass().getSimpleName() + (t.getMessage() != null ? ": " + t.getMessage() : ""));
            }
        } catch (Throwable t) {
            try {
                o.put("ok", false);
                o.put("error", String.valueOf(t));
            } catch (Throwable ignored) { }
        } finally {
            if (s != null) {
                try { s.close(); } catch (Throwable ignored) { }
            }
        }
        return o;
    }

    static boolean hasVpn(ConnectivityManager cm) {
        return hasConnected(cm, true, false);
    }

    static boolean hasVpnOrCellular(ConnectivityManager cm) {
        return hasConnected(cm, true, true);
    }

    private static boolean hasConnected(ConnectivityManager cm, boolean vpn, boolean cellular) {
        try {
            for (Network n : cm.getAllNetworks()) {
                NetworkCapabilities c = cm.getNetworkCapabilities(n);
                NetworkInfo i = cm.getNetworkInfo(n);
                if (c == null || i == null || !i.isConnected()) continue;
                if (vpn && c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
                if (cellular && c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return true;
            }
        } catch (Throwable ignored) { }
        return false;
    }

    /** Connecting over Android's default route (VPN or mobile); TCP only, short. */
    static JSONObject stdProbe(String host, int port, int timeoutMs) {
        JSONObject o = new JSONObject();
        Socket s = null;
        try {
            long t0 = SystemClock.elapsedRealtime();
            s = new Socket();
            s.connect(new InetSocketAddress(host, port), timeoutMs);
            o.put("ok", true);
            o.put("tcpMs", SystemClock.elapsedRealtime() - t0);
        } catch (Throwable t) {
            try {
                o.put("ok", false);
                o.put("error", t.getClass().getSimpleName() + (t.getMessage() != null ? ": " + t.getMessage() : ""));
            } catch (Throwable ignored) { }
        } finally {
            if (s != null) {
                try { s.close(); } catch (Throwable ignored) { }
            }
        }
        return o;
    }

    private static final class AcceptAll implements X509TrustManager {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) { }
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) { }
        @Override public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }
}
