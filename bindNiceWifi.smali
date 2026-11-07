
# --- added by this patch: keep traffic on the module's Wi-Fi network ---
# Java-equivalent:
#   private void bindNiceWifi(Context ctx) {
#     try {
#       ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService("connectivity");
#       for (Network n : cm.getAllNetworks()) {
#         NetworkCapabilities nc = cm.getNetworkCapabilities(n);
#         NetworkInfo ni = cm.getNetworkInfo(n);
#         if (nc != null && nc.hasTransport(TRANSPORT_WIFI) && ni != null && ni.isConnected()) {
#           if (nc.hasCapability(NET_CAPABILITY_VALIDATED)) break;   // Wi-Fi with internet: unbind
#           cm.bindProcessToNetwork(n);                               // Wi-Fi without internet (the module)
#           send event "wifi-associated" to the JS;
#           return;
#         }
#       }
#       cm.bindProcessToNetwork(null);
#     } catch (Throwable t) { }
#   }
.method private bindNiceWifi(Landroid/content/Context;)V
    .locals 8

    :try_start_0
    const-string v0, "connectivity"

    invoke-virtual {p1, v0}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;

    move-result-object v0

    check-cast v0, Landroid/net/ConnectivityManager;

    invoke-virtual {v0}, Landroid/net/ConnectivityManager;->getAllNetworks()[Landroid/net/Network;

    move-result-object v1

    array-length v2, v1

    const/4 v3, 0x0

    :loop_0
    if-ge v3, v2, :cond_unbind

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

    const/16 v6, 0x10

    invoke-virtual {v5, v6}, Landroid/net/NetworkCapabilities;->hasCapability(I)Z

    move-result v6

    if-nez v6, :cond_unbind

    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z

    new-instance v6, Lorg/json/JSONObject;

    invoke-direct {v6}, Lorg/json/JSONObject;-><init>()V

    const-string v7, "eventType"

    const-string v1, "wifi-associated"

    invoke-virtual {v6, v7, v1}, Lorg/json/JSONObject;->put(Ljava/lang/String;Ljava/lang/Object;)Lorg/json/JSONObject;

    new-instance v7, Lorg/apache/cordova/PluginResult;

    sget-object v1, Lorg/apache/cordova/PluginResult$Status;->OK:Lorg/apache/cordova/PluginResult$Status;

    invoke-direct {v7, v1, v6}, Lorg/apache/cordova/PluginResult;-><init>(Lorg/apache/cordova/PluginResult$Status;Lorg/json/JSONObject;)V

    const/4 v1, 0x1

    invoke-virtual {v7, v1}, Lorg/apache/cordova/PluginResult;->setKeepCallback(Z)V

    iget-object v1, p0, Lcom/nice/wifiwizard/WifiWizard$2;->val$call:Lorg/apache/cordova/CallbackContext;

    invoke-virtual {v1, v7}, Lorg/apache/cordova/CallbackContext;->sendPluginResult(Lorg/apache/cordova/PluginResult;)V

    return-void

    :cond_next
    add-int/lit8 v3, v3, 0x1

    goto :loop_0

    :cond_unbind
    const/4 v4, 0x0

    invoke-virtual {v0, v4}, Landroid/net/ConnectivityManager;->bindProcessToNetwork(Landroid/net/Network;)Z
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    return-void

    :catch_0
    move-exception v0

    return-void
.end method
