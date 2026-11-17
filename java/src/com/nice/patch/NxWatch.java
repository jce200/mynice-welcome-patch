package com.nice.patch;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import org.json.JSONObject;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * nx34: a notification of Android when the gate moves (Settings > Notifications).
 *
 * The app only hears from the accessory while it runs and holds a connection. So while this is switched on a foreground service
 * (NxWatchService, with its permanent notification) keeps the process alive after the app left the screen; the app keeps its
 * connection as it always did, and nx-patch.js checks it every few minutes. The state of a gate arrives here along two ways, and
 * the same state twice is one notification: the event of the accessory as the native layer reads it (Nx.noteEvent), and what the
 * JS layer learns (an event, or the answer to a request for the state).
 *
 * Honest limits: Android can still stop the app (battery saving, memory), and swiping the app away ends it: then nothing is
 * heard until the app is opened again. A notification is not shown while the app itself is on the screen.
 */
public final class NxWatch {
    private NxWatch() { }

    static final String PREFS = "nx_watch";
    static final String CH_GATE = "nx_gate";
    static final String CH_WATCH = "nx_watch";
    static final int ID_WATCH = 7340;
    static final int ID_GATE = 7341;       // + a number per accessory

    /** true while the app is on the screen (NxPlugin follows the life of the activity): then nothing is notified. */
    static volatile boolean appVisible = true;

    private static final Pattern DOOR = Pattern.compile("<DoorStatus>\\s*([a-z]+)\\s*</DoorStatus>");
    private static final Pattern OBST = Pattern.compile("<Obstruct>\\s*([0-9]+)\\s*</Obstruct>");
    private static final Pattern SRC = Pattern.compile("\\bsource=\"([^\"]*)\"");

    /** What to tell: the words, and whether it asks for attention (sound) or quietly replaces what was said. */
    static final class Notice {
        final String text;
        final boolean alert;
        Notice(String text, boolean alert) { this.text = text; this.alert = alert; }
    }

    /**
     * The notification for a gate that went from one state to another, or null when there is nothing to tell: the first state
     * that is heard of a gate, the same state again, or a state that is not one of the five.
     * The start of a movement, a stop and an obstruction ask for attention; the arrival of a movement that was announced
     * ("is opening" a moment ago, "is open" now) replaces the notification without a second sound.
     */
    static Notice decide(String prevState, String prevObstruct, String state, String obstruct) {
        if (state == null) return null;
        boolean wasBlocked = "1".equals(prevObstruct), blocked = "1".equals(obstruct);
        if (prevState == null) return null;
        if (blocked && !wasBlocked) return new Notice("Obstruction detected", true);
        if (state.equals(prevState)) return null;
        if ("opening".equals(state)) return new Notice("The gate is opening", true);
        if ("closing".equals(state)) return new Notice("The gate is closing", true);
        if ("stopped".equals(state)) return new Notice("The gate was stopped", true);
        if ("open".equals(state)) return new Notice("The gate is open", !"opening".equals(prevState));
        if ("closed".equals(state)) return new Notice("The gate is closed", !"closing".equals(prevState));
        return null;
    }

    /** { state, obstruct (or null), source (or null) } of a CHANGE event that says the state of the gate, else null. */
    static String[] parseChange(String xml) {
        if (xml == null || !"CHANGE".equals(Nx.eventType(xml))) return null;
        Matcher d = DOOR.matcher(xml);
        if (!d.find()) return null;
        Matcher o = OBST.matcher(xml), s = SRC.matcher(xml);
        return new String[] { d.group(1), o.find() ? o.group(1) : null, s.find() ? s.group(1) : null };
    }

    static String normMac(String mac) { return mac == null ? "" : mac.replaceAll("[^0-9A-Fa-f]", "").toLowerCase(); }

    // ------------------------------------------------------------------ what is remembered

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    public static boolean enabled(Context ctx) {
        try { return prefs(ctx).getBoolean("on", false); } catch (Throwable t) { return false; }
    }

    /** Switches the notifications on or off: remembers it, and starts or stops the service that keeps the app alive. */
    public static void setEnabled(Context ctx, boolean on) {
        try {
            prefs(ctx).edit().putBoolean("on", on).apply();
            Intent i = new Intent(ctx, NxWatchService.class);
            if (on) {
                channels(ctx);
                ctx.startService(i);          // from the app on the screen: the service makes itself a foreground service
                Nx.log("notifications: on, the app stays awake in the background");
            } else {
                ctx.stopService(i);
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) for (int k = 0; k < 8; k++) nm.cancel(ID_GATE + k);
                Nx.log("notifications: off");
            }
        } catch (Throwable t) {
            Nx.log("notifications: " + (on ? "could not start" : "could not stop") + " (" + t + ")");
        }
    }

    /** What the settings page shows: is it on, does Android let this app notify, may the app run while the phone sleeps. */
    public static JSONObject info(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            o.put("on", enabled(ctx));
            boolean allowed = true;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && Build.VERSION.SDK_INT >= 24) allowed = nm.areNotificationsEnabled();
            o.put("allowed", allowed);
            boolean battery = true;
            if (Build.VERSION.SDK_INT >= 23) {
                PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
                if (pm != null) battery = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            }
            o.put("battery", battery);
        } catch (Throwable ignored) { }
        return o;
    }

    /** Opens the page of Android where the user allows notifications ("notifications") or running in the background ("battery"). */
    public static void openSettings(Context ctx, String what) {
        Intent i;
        if ("battery".equals(what) && Build.VERSION.SDK_INT >= 23) {
            i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + ctx.getPackageName()));
        } else if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
        } catch (Throwable t) {
            try {
                ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Throwable t2) { Nx.log("notifications: the settings of Android could not be opened (" + t2 + ")"); }
        }
    }

    // ------------------------------------------------------------------ the state of a gate arrives

    /** From the native layer: an event of the accessory, as it was received. */
    static void fromEvent(String xml) {
        try {
            Context ctx = Nx.appCtx;
            if (ctx == null) return;
            String[] c = parseChange(xml);
            if (c == null) return;
            SharedPreferences p = prefs(ctx);
            String mac = normMac(c[2]);
            if (mac.length() != 12 || !p.contains("name." + mac)) {
                // the event does not say which accessory in a way this layer knows: with one accessory it is that one, else the JS layer tells
                String only = p.getString("only", "");
                if (only.length() == 0) return;
                mac = only;
            }
            gateState(ctx, mac, null, c[0], c[1]);
        } catch (Throwable ignored) { }
    }

    /** From either way: this accessory is in this state now. name and obstruct may be null (then what was known stays). */
    public static synchronized void gateState(Context ctx, String macIn, String name, String state, String obstruct) {
        try {
            String mac = normMac(macIn);
            if (mac.length() == 0 || state == null || state.length() == 0) return;
            SharedPreferences p = prefs(ctx);
            SharedPreferences.Editor e = p.edit();
            if (name != null && name.length() > 0) e.putString("name." + mac, name);
            String prev = p.getString("state." + mac, null), prevObst = p.getString("obst." + mac, null);
            String obst = (obstruct == null || obstruct.length() == 0) ? prevObst : obstruct;
            e.putString("state." + mac, state);
            if (obst != null) e.putString("obst." + mac, obst);
            // the accessories this layer knows, in the order in which they were first heard of (the number of a notification)
            String known = p.getString("macs", "");
            if (("," + known + ",").indexOf("," + mac + ",") < 0) { known = known.length() == 0 ? mac : known + "," + mac; e.putString("macs", known); }
            e.putString("only", known.indexOf(',') < 0 ? known : "");
            e.apply();
            Notice n = decide(prev, prevObst, state, obst);
            if (n == null || appVisible || !p.getBoolean("on", false)) return;
            int index = java.util.Arrays.asList(known.split(",")).indexOf(mac);
            String title = name != null && name.length() > 0 ? name : p.getString("name." + mac, "Gate");
            post(ctx, ID_GATE + Math.max(0, Math.min(7, index)), title, n);
        } catch (Throwable t) {
            Nx.log("notifications: " + t);
        }
    }

    // ------------------------------------------------------------------ the notifications themselves

    static void channels(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel gate = new NotificationChannel(CH_GATE, "Gate", NotificationManager.IMPORTANCE_DEFAULT);
        gate.setDescription("When the gate opens, closes or is stopped");
        nm.createNotificationChannel(gate);
        NotificationChannel watch = new NotificationChannel(CH_WATCH, "Running in the background", NotificationManager.IMPORTANCE_LOW);
        watch.setDescription("The permanent notification that keeps the app awake for the notifications of the gate");
        watch.setShowBadge(false);
        nm.createNotificationChannel(watch);
    }

    static int smallIcon(Context ctx) {
        try {
            int id = ctx.getResources().getIdentifier("nx_stat", "drawable", ctx.getPackageName());
            if (id != 0) return id;
        } catch (Throwable ignored) { }
        return ctx.getApplicationInfo().icon;
    }

    static PendingIntent openApp(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) launch = new Intent();
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(ctx, 0, launch, flags);
    }

    @SuppressWarnings("deprecation")
    static Notification.Builder builder(Context ctx, String channel) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, channel) : new Notification.Builder(ctx);
    }

    /** The permanent notification of the service. */
    static Notification watching(Context ctx) {
        channels(ctx);
        Notification.Builder b = builder(ctx, CH_WATCH)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle("Gate notifications are on")
            .setContentText("The app stays awake to tell you when the gate moves.")
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(openApp(ctx));
        return b.build();
    }

    @SuppressWarnings("deprecation")
    static void post(Context ctx, int id, String title, Notice n) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        channels(ctx);
        Notification.Builder b = builder(ctx, CH_GATE)
            .setSmallIcon(smallIcon(ctx))
            .setContentTitle(title)
            .setContentText(n.text)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setAutoCancel(true)
            .setOnlyAlertOnce(!n.alert)
            .setContentIntent(openApp(ctx));
        if (Build.VERSION.SDK_INT < 26 && n.alert) b.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        if (n.alert) nm.cancel(id);       // a notification that is still shown would be replaced without a sound
        nm.notify(id, b.build());
        Nx.log("notifications: \"" + n.text + "\"" + (n.alert ? "" : " (quietly, it replaces the one before)"));
    }
}
