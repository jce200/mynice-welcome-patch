
# --- added by this patch: skip connecting by ourselves (which Android refuses) if the phone is already on the requested SSID ---
# Java-equivalent:
#   private boolean patchAlreadyConnected(CallbackContext cb, JSONArray data) {
#     try {
#       String want = data.getString(0);                       // SSID with quotes, as the JS sends it
#       WifiInfo wi = wifiManager.getConnectionInfo();
#       if (wi == null || wi.getSSID() == null || !wi.getSSID().equals(want)) return false;
#       ConnectivityManager cm = (ConnectivityManager) cordova.getActivity().getSystemService("connectivity");
#       for (Network n : cm.getAllNetworks()) {                // Wi-Fi network without internet: bind the process to it
#         NetworkCapabilities nc = cm.getNetworkCapabilities(n);
#         NetworkInfo ni = cm.getNetworkInfo(n);
#         if (nc != null && nc.hasTransport(1) && ni != null && ni.isConnected()) { cm.bindProcessToNetwork(n); break; }
#       }
#       cb.success("COMPLETED");
#       if (patchEvents != null) send {"eventType":"wifi-associated"} via patchEvents (keepCallback);
#       return true;
#     } catch (Throwable t) { return false; }
#   }
.method private patchAlreadyConnected(Lorg/apache/cordova/CallbackContext;Lorg/json/JSONArray;)Z
    .locals 9

    :try_start_0
    const/4 v0, 0x0

    invoke-virtual {p2, v0}, Lorg/json/JSONArray;->getString(I)Ljava/lang/String;

    move-result-object v7

    iget-object v1, p0, Lcom/nice/wifiwizard/WifiWizard;->wifiManager:Landroid/net/wifi/WifiManager;

    invoke-virtual {v1}, Landroid/net/wifi/WifiManager;->getConnectionInfo()Landroid/net/wifi/WifiInfo;

    move-result-object v1

    const-string v8, "unknown"

    if-eqz v1, :cond_cmp

    invoke-virtual {v1}, Landroid/net/wifi/WifiInfo;->getSSID()Ljava/lang/String;

    move-result-object v1

    if-eqz v1, :cond_cmp

    move-object v8, v1

    :cond_cmp
    invoke-virtual {v8, v7}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :cond_no

    :cond_success
    iget-object v0, p0, Lcom/nice/wifiwizard/WifiWizard;->cordova:Lorg/apache/cordova/CordovaInterface;

    invoke-interface {v0}, Lorg/apache/cordova/CordovaInterface;->getActivity()Landroid/app/Activity;

    move-result-object v0

    const-string v1, "connectivity"

    invoke-virtual {v0, v1}, Landroid/app/Activity;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/net/ConnectivityManager;

    invoke-virtual {v0}, Landroid/net/ConnectivityManager;->getAllNetworks()[Landroid/net/Network;

    move-result-object v1

    array-length v2, v1

    const/4 v3, 0x0

    :loop_0
    if-ge v3, v2, :cond_done

    aget-object v4, v1, v3

    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->getNetworkCapabilities(Landroid/net/Network;)Landroid/net/NetworkCapabilities;

    move-result-object v5

    if-eqz v5, :cond_next

    const/4 v6, 0x1

    invoke-virtual {v5, v6}, Landroid/net/NetworkCapabilities;->hasTransport(I)Z

    move-result v6

    if-eqz v6, :cond_next

    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->getNetworkInfo(Landroid/net/Network;)Landroid/net/NetworkInfo;

    move-result-object v6

    if-eqz v6, :cond_next

    invoke-virtual {v6}, Landroid/net/NetworkInfo;->isConnected()Z

    move-result v6

    if-eqz v6, :cond_next

    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z

    goto :cond_done

    :cond_next
    add-int/lit8 v3, v3, 0x1

    goto :loop_0

    :cond_done
    const-string v0, "COMPLETED"

    invoke-virtual {p1, v0}, Lorg/apache/cordova/CallbackContext;->success(Ljava/lang/String;)V

    iget-object v0, p0, Lcom/nice/wifiwizard/WifiWizard;->patchEvents:Lorg/apache/cordova/CallbackContext;

    if-eqz v0, :cond_yes

    new-instance v1, Lorg/json/JSONObject;

    invoke-direct {v1}, Lorg/json/JSONObject;-><init>()V

    const-string v2, "eventType"

    const-string v3, "wifi-associated"

    invoke-virtual {v1, v2, v3}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    new-instance v2, Lorg/apache/cordova/PluginResult;

    sget-object v3, Lorg/apache/cordova/PluginResult$Status;->OK:Lorg/apache/cordova/PluginResult$Status;

    invoke-direct {v2, v3, v1}, Lorg/apache/cordova/PluginResult;-><init>(Lorg/apache/cordova/PluginResult$Status;Lorg/json/JSONObject;)V

    const/4 v3, 0x1

    invoke-virtual {v2, v3}, Lorg/apache/cordova/PluginResult;->setKeepCallback(Z)V

    invoke-virtual {v0, v2}, Lorg/apache/cordova/CallbackContext;->sendPluginResult(Lorg/apache/cordova/PluginResult;)V

    :cond_yes
    const/4 v0, 0x1

    return v0

    :cond_no
    sget v0, Landroid/os/Build$VERSION;->SDK_INT:I

    const/16 v1, 0x1d

    if-lt v0, v1, :cond_legacy

    const-string v0, "\"Nice"

    invoke-virtual {v7, v0}, Ljava/lang/String;->startsWith(Ljava/lang/String;)Z

    move-result v0

    if-nez v0, :cond_module

    const/4 v6, 0x0

    :wait_loop
    const/16 v0, 0x5a

    if-ge v6, v0, :cond_err

    const-wide/16 v0, 0x3e8

    invoke-static {v0, v1}, Ljava/lang/Thread;->sleep(J)V

    add-int/lit8 v6, v6, 0x1

    iget-object v0, p0, Lcom/nice/wifiwizard/WifiWizard;->wifiManager:Landroid/net/wifi/WifiManager;

    invoke-virtual {v0}, Landroid/net/wifi/WifiManager;->getConnectionInfo()Landroid/net/wifi/WifiInfo;

    move-result-object v0

    if-eqz v0, :wait_loop

    invoke-virtual {v0}, Landroid/net/wifi/WifiInfo;->getSSID()Ljava/lang/String;

    move-result-object v0

    if-eqz v0, :wait_loop

    move-object v8, v0

    invoke-virtual {v0, v7}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result v0

    if-eqz v0, :wait_loop

    goto :cond_success

    :cond_module
    new-instance v0, Landroid/content/Intent;

    const-string v1, "android.settings.WIFI_SETTINGS"

    invoke-direct {v0, v1}, Landroid/content/Intent;-><init>(Ljava/lang/String;)V

    iget-object v1, p0, Lcom/nice/wifiwizard/WifiWizard;->cordova:Lorg/apache/cordova/CordovaInterface;

    invoke-interface {v1}, Lorg/apache/cordova/CordovaInterface;->getActivity()Landroid/app/Activity;

    move-result-object v1

    invoke-virtual {v1, v0}, Landroid/app/Activity;->startActivity(Landroid/content/Intent;)V

    :cond_err
    new-instance v0, Ljava/lang/StringBuilder;

    invoke-direct {v0}, Ljava/lang/StringBuilder;-><init>()V

    const-string v1, "WIFI_MISMATCH current="

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    const-string v1, " requested="

    invoke-virtual {v0, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;

    invoke-virtual {v0}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;

    move-result-object v0

    invoke-virtual {p1, v0}, Lorg/apache/cordova/CallbackContext;->error(Ljava/lang/String;)V

    const/4 v0, 0x1

    return v0

    :cond_legacy
    const/4 v0, 0x0

    return v0
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    move-exception v0

    const/4 v0, 0x0

    return v0
.end method
