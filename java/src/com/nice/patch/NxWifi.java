package com.nice.patch;

import android.app.Activity;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Handler;
import android.os.Looper;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.PluginResult;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Connecting to the accessory's Wi-Fi (NiceIT4WIFI...) the way Android 10+ prescribes:
 * an app-specific connection through WifiNetworkSpecifier. Android itself shows a confirmation
 * ("Connect to device"); the old WifiManager.addNetwork/enableNetwork no longer work there.
 *
 * Behavior:
 *  - onAvailable: the process is bound to this network (it has no internet), the discovery module
 *    is restarted on the new IP, the wizard gets "COMPLETED" and then the event wifi-associated.
 *  - onUnavailable (user cancels or time-out): error WIFI_UNAVAILABLE.
 *  - release: lift the binding and withdraw the request; Android then returns by itself to the
 *    saved home network.
 *  - A safety net releases the connection after 10 minutes, so that an aborted wizard does not leave
 *    the app bound to a network without internet.
 */
final class NxWifi {
    private NxWifi() { }

    private static final Object LOCK = new Object();
    private static final Handler H = new Handler(Looper.getMainLooper());
    private static final int REQUEST_TIMEOUT_MS = 60000;
    private static final long MAX_HOLD_MS = 10L * 60L * 1000L;

    private static Req current;
    private static Runnable autoRelease;

    // ------------------------------------------------------------------ connecting

    /** true = handled (the callback gets its answer from us); false = let the old code carry on. */
    static boolean connect(Activity act, CallbackContext cb, CallbackContext events, String ssid) {
        Context app = act.getApplicationContext();
        ConnectivityManager cm = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        WifiManager wm = (WifiManager) app.getSystemService(Context.WIFI_SERVICE);

        synchronized (LOCK) {
            // 1. Already connected this way: immediate success.
            if (Nx.activeNetwork != null && ssid.equals(Nx.activeSsid)) {
                Nx.log("accessory Wi-Fi was already active: " + ssid);
                succeedNow(cb, events);
                return true;
            }
            // 2. A request for the same SSID is already running (for example tapped twice): wait along.
            if (current != null && !current.answered && ssid.equals(current.ssid)) {
                current.waiters.add(cb);
                Nx.log("request for " + ssid + " already running; waiting for it");
                return true;
            }
            // 3. The phone is already on this SSID through the system (connected manually): the existing
            //    code binds that network and reports success.
            try {
                WifiInfo wi = wm.getConnectionInfo();
                if (wi != null && ("\"" + ssid + "\"").equals(wi.getSSID())) {
                    Nx.log("phone is already on " + ssid + " (system connection)");
                    return false;
                }
            } catch (Throwable ignored) { }

            // 4. New request.
            releaseLocked(cm, "new request");
            NetworkRequest req;
            try {
                WifiNetworkSpecifier spec = new WifiNetworkSpecifier.Builder().setSsid(ssid).build();
                req = new NetworkRequest.Builder()
                        .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                        .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .setNetworkSpecifier(spec)
                        .build();
            } catch (Throwable t) {
                Nx.log("building the request failed, falling back to manual connect: " + t);
                return false;
            }
            Req r = new Req(cm, ssid, events);
            r.waiters.add(cb);
            current = r;
            try {
                cm.requestNetwork(req, r, H, REQUEST_TIMEOUT_MS);
            } catch (Throwable t) {
                current = null;
                Nx.log("requestNetwork failed, falling back to manual connect: " + t);
                return false;
            }
            Nx.log("request to connect to " + ssid + " sent; Android shows a confirmation");
            return true;
        }
    }

    // ------------------------------------------------------------------ releasing

    static void release(Context ctx, String why) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            synchronized (LOCK) {
                releaseLocked(cm, why);
            }
        } catch (Throwable t) {
            Nx.log("release: " + t);
        }
    }

    /** Call with LOCK held. Returns true if there was an active accessory connection. */
    private static boolean releaseLocked(ConnectivityManager cm, String why) {
        Req c = current;
        boolean wasActive = Nx.activeNetwork != null;
        if (c == null && !wasActive) return false;
        current = null;
        Nx.activeNetwork = null;
        Nx.activeSsid = null;
        Nx.activeIp = null;
        Nx.generation++;
        if (autoRelease != null) {
            H.removeCallbacks(autoRelease);
            autoRelease = null;
        }
        try { cm.bindProcessToNetwork(null); } catch (Throwable ignored) { }
        if (c != null) {
            try { cm.unregisterNetworkCallback(c); } catch (Throwable ignored) { }
            // Do not leave waiting requesters hanging.
            if (!c.answered) failWaiters(c, "WIFI_RELEASED");
        }
        Nx.log("accessory Wi-Fi released (" + why + ")");
        if (wasActive) Nx.afterRelease();
        return wasActive;
    }

    private static void armAutoRelease(final ConnectivityManager cm, final Req r) {
        if (autoRelease != null) H.removeCallbacks(autoRelease);
        autoRelease = new Runnable() {
            @Override public void run() {
                synchronized (LOCK) {
                    if (current == r) releaseLocked(cm, "automatically after 10 minutes");
                }
            }
        };
        H.postDelayed(autoRelease, MAX_HOLD_MS);
    }

    // ------------------------------------------------------------------ answers to the wizard

    private static void succeedNow(CallbackContext cb, CallbackContext events) {
        try { cb.success("COMPLETED"); } catch (Throwable ignored) { }
        fireLater(events, "wifi-associated", 400);
    }

    private static void failWaiters(Req r, String code) {
        List<CallbackContext> w = new ArrayList<CallbackContext>(r.waiters);
        r.waiters.clear();
        r.answered = true;
        for (CallbackContext c : w) {
            try { c.error(code); } catch (Throwable ignored) { }
        }
    }

    /** The event comes slightly after the success answer, so that the wizard has already placed its listener. */
    private static void fireLater(final CallbackContext events, final String type, long delayMs) {
        if (events == null) return;
        H.postDelayed(new Runnable() {
            @Override public void run() { fireNow(events, type); }
        }, delayMs);
    }

    private static void fireNow(CallbackContext events, String type) {
        if (events == null) return;
        try {
            JSONObject o = new JSONObject();
            o.put("eventType", type);
            PluginResult r = new PluginResult(PluginResult.Status.OK, o);
            r.setKeepCallback(true);
            events.sendPluginResult(r);
        } catch (Throwable ignored) { }
    }

    // ------------------------------------------------------------------ the callback

    private static final class Req extends ConnectivityManager.NetworkCallback {
        final ConnectivityManager cm;
        final String ssid;
        final CallbackContext events;
        final List<CallbackContext> waiters = new ArrayList<CallbackContext>();
        boolean answered;

        Req(ConnectivityManager cm, String ssid, CallbackContext events) {
            this.cm = cm;
            this.ssid = ssid;
            this.events = events;
        }

        @Override
        public void onAvailable(Network network) {
            boolean stale;
            List<CallbackContext> w = null;
            synchronized (LOCK) {
                stale = (current != this);
                if (!stale) {
                    Nx.activeNetwork = network;
                    Nx.activeSsid = ssid;
                    Nx.activeIp = Nx.ipv4Of(cm, network);
                    Nx.generation++;
                    try { cm.bindProcessToNetwork(network); } catch (Throwable t) {
                        Nx.log("bindProcessToNetwork failed: " + t);
                    }
                    armAutoRelease(cm, this);
                    if (!answered) {
                        answered = true;
                        w = new ArrayList<CallbackContext>(waiters);
                        waiters.clear();
                    }
                }
            }
            if (stale) {
                Nx.log("onAvailable of an old request ignored");
                return;
            }
            Nx.log("connected to accessory Wi-Fi " + ssid + ", own IP " + Nx.activeIp);
            Nx.restartDiscovery("accessory Wi-Fi available");
            if (w != null) {
                for (CallbackContext c : w) {
                    try { c.success("COMPLETED"); } catch (Throwable ignored) { }
                }
                fireLater(events, "wifi-associated", 400);
            }
        }

        @Override
        public void onLinkPropertiesChanged(Network network, LinkProperties lp) {
            synchronized (LOCK) {
                if (current == this && Nx.activeNetwork != null && Nx.activeNetwork.equals(network)
                        && Nx.activeIp == null) {
                    Nx.activeIp = Nx.ipv4Of(cm, network);
                    if (Nx.activeIp != null) Nx.log("IP of accessory Wi-Fi known: " + Nx.activeIp);
                }
            }
        }

        @Override
        public void onUnavailable() {
            List<CallbackContext> w = null;
            synchronized (LOCK) {
                if (current == this) current = null;
                if (!answered) {
                    answered = true;
                    w = new ArrayList<CallbackContext>(waiters);
                    waiters.clear();
                }
            }
            Nx.log("connecting to " + ssid + " failed or was canceled (onUnavailable)");
            if (w != null) {
                for (CallbackContext c : w) {
                    try { c.error("WIFI_UNAVAILABLE"); } catch (Throwable ignored) { }
                }
            }
        }

        @Override
        public void onLost(Network network) {
            boolean mine;
            synchronized (LOCK) {
                mine = current == this && Nx.activeNetwork != null && Nx.activeNetwork.equals(network);
                if (mine) {
                    current = null;
                    Nx.activeNetwork = null;
                    Nx.activeSsid = null;
                    Nx.activeIp = null;
                    Nx.generation++;
                    if (autoRelease != null) {
                        H.removeCallbacks(autoRelease);
                        autoRelease = null;
                    }
                    try { cm.bindProcessToNetwork(null); } catch (Throwable ignored) { }
                    try { cm.unregisterNetworkCallback(this); } catch (Throwable ignored) { }
                }
            }
            if (mine) {
                Nx.log("accessory Wi-Fi lost (onLost)");
                fireNow(events, "wifi-disconnected");
                Nx.afterRelease();
            }
        }
    }
}
