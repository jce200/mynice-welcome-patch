package org.apache.cordova;

import org.json.JSONArray;
import org.json.JSONObject;

/** Stub: signatures only, so that Nx compiles against the real Cordova class in the app. */
public class CallbackContext {
    public CallbackContext(String callbackId, CordovaWebView webView) { }
    public boolean isFinished() { return false; }
    public String getCallbackId() { return null; }
    public void sendPluginResult(PluginResult pluginResult) { }
    public void success(JSONObject message) { }
    public void success(String message) { }
    public void success(JSONArray message) { }
    public void success(int message) { }
    public void success() { }
    public void error(JSONObject message) { }
    public void error(String message) { }
    public void error(int message) { }
}
