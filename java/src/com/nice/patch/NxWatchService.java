package com.nice.patch;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/**
 * nx34: keeps the process of the app alive while the notifications of the gate are on (see NxWatch). It does nothing itself:
 * it only is a foreground service, with the permanent notification that Android asks for.
 * When the app is swiped away the page that keeps the connection is gone, so the service ends too: a permanent notification
 * that says "on" while nothing can be heard would be a lie. It is not restarted by Android for the same reason.
 */
public class NxWatchService extends Service {

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public void onCreate() {
        super.onCreate();
        try {
            startForeground(NxWatch.ID_WATCH, NxWatch.watching(this));
        } catch (Throwable t) {
            Nx.log("notifications: the background service could not start (" + t + ")");
            stopSelf();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!NxWatch.enabled(this)) stopSelf();
        return START_NOT_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent) {
        Nx.log("notifications: the app was closed, so they stop until it is opened again");
        try { stopForeground(true); } catch (Throwable ignored) { }
        stopSelf();
    }
}
