package com.nice.patch;

import android.content.Context;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Cordova plugin "Nx": the bridge between the JS improvements (nx-patch.js) and the native layer.
 * Registered through an extra &lt;feature name="Nx"&gt; in res/xml/config.xml.
 *
 * Actions:
 *   logStream            keeps a callback open over which native log lines go to the LOG panel
 *   setHints [[{mac,address}...]]  stored addresses of accessories (IP fallback when mDNS finds nothing)
 *   netState [host]      state of the network (wifi/mobile/vpn/ssid/ip); with host also whether a VPN route captures the address
 *   probe host,port,tcpMs,tls[,cloud]  measures reachability of the accessory over Wi-Fi (and, with a VPN or mobile data, over the
 *                        default route); with cloud=true also the route to the Nice cloud (name and TCP)
 *   checkFailed / checkSucceeded   the JS reports the outcome of a check; on failure the app switches between local and cloud
 *   reconnect            close sessions and restart discovery
 *   release              release the accessory Wi-Fi (app-specific connection)
 *   version               returns the version of the native layer
 */
public class NxPlugin extends CordovaPlugin {

    @Override
    public boolean execute(final String action, final JSONArray args, final CallbackContext cb) throws JSONException {
        final Context ctx;
        try {
            ctx = cordova.getActivity().getApplicationContext();
            Nx.appCtx = ctx;
        } catch (Throwable t) {
            cb.error("Nx: no context: " + t);
            return true;
        }

        if ("logStream".equals(action)) {
            Nx.logCb = cb;
            PluginResult r = new PluginResult(PluginResult.Status.NO_RESULT);
            r.setKeepCallback(true);
            cb.sendPluginResult(r);
            Nx.log("native layer " + Nx.PATCH_VERSION + " loaded");
            return true;
        }
        if ("version".equals(action)) {
            cb.success(Nx.PATCH_VERSION);
            return true;
        }
        if ("setHints".equals(action)) {
            try {
                Nx.setHints(args.optJSONArray(0));
                cb.success();
            } catch (Throwable t) {
                cb.error(String.valueOf(t));
            }
            return true;
        }
        if ("release".equals(action)) {
            cordova.getThreadPool().execute(new Runnable() {
                @Override public void run() {
                    try {
                        if (android.os.Build.VERSION.SDK_INT >= 29) NxWifi.release(ctx, "requested by the app");
                        cb.success();
                    } catch (Throwable t) {
                        cb.error(String.valueOf(t));
                    }
                }
            });
            return true;
        }
        if ("netState".equals(action)) {
            final String stateHost = args.optString(0, "");
            cordova.getThreadPool().execute(new Runnable() {
                @Override public void run() {
                    try {
                        cb.success(Nx.netState(ctx, stateHost));
                    } catch (Throwable t) {
                        cb.error(String.valueOf(t));
                    }
                }
            });
            return true;
        }
        if ("probe".equals(action)) {
            final String host = args.optString(0, "");
            final int port = args.optInt(1, 443);
            final int tcpMs = args.optInt(2, 5000);
            final boolean tls = args.optBoolean(3, false);
            final boolean measureCloud = args.optBoolean(4, false);
            cordova.getThreadPool().execute(new Runnable() {
                @Override public void run() {
                    try {
                        JSONObject o = Nx.probe(ctx, host, port, tcpMs, tls, measureCloud);
                        cb.success(o);
                    } catch (Throwable t) {
                        cb.error(String.valueOf(t));
                    }
                }
            });
            return true;
        }
        if ("checkFailed".equals(action)) {
            Nx.checkFailed();
            cb.success();
            return true;
        }
        if ("checkSucceeded".equals(action)) {
            Nx.checkSucceeded();
            cb.success();
            return true;
        }
        if ("reconnect".equals(action)) {
            cordova.getThreadPool().execute(new Runnable() {
                @Override public void run() {
                    try {
                        Nx.reconnect();
                        cb.success();
                    } catch (Throwable t) {
                        cb.error(String.valueOf(t));
                    }
                }
            });
            return true;
        }
        return false;
    }
}
