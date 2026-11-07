package org.apache.cordova;

import org.json.JSONArray;
import org.json.JSONException;

public class CordovaPlugin {
    public CordovaInterface cordova;
    protected CordovaWebView webView;

    public void initialize(CordovaInterface cordova, CordovaWebView webView) { }
    protected void pluginInitialize() { }
    public boolean execute(String action, JSONArray args, CallbackContext callbackContext) throws JSONException { return false; }
}
