package org.apache.cordova;

import org.json.JSONArray;
import org.json.JSONObject;

public class PluginResult {
    public PluginResult(Status status) { }
    public PluginResult(Status status, String message) { }
    public PluginResult(Status status, JSONArray message) { }
    public PluginResult(Status status, JSONObject message) { }
    public PluginResult(Status status, int i) { }
    public PluginResult(Status status, boolean b) { }
    public void setKeepCallback(boolean b) { }

    public enum Status {
        NO_RESULT, OK, CLASS_NOT_FOUND_EXCEPTION, ILLEGAL_ACCESS_EXCEPTION, INSTANTIATION_EXCEPTION,
        MALFORMED_URL_EXCEPTION, IO_EXCEPTION, INVALID_ACTION, JSON_EXCEPTION, ERROR
    }
}
