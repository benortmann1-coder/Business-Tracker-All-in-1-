package com.wealthtrack.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Schedules bill reminders with AlarmManager and persists them for reboot. */
final class ReminderScheduler {
    private static final String TAG = "WealthTrackReminders";
    private static final String PREFS = "wealthtrack_reminders";
    private static final String KEY_JSON = "json";
    private static final String KEY_IDS = "ids";

    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_BODY = "body";

    private static final int MAX_ALARMS = 300;

    private ReminderScheduler() {}

    /** Replace all scheduled reminders with those in {@code json}. */
    static synchronized void setReminders(Context ctx, String json) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        cancelAll(ctx, prefs.getStringSet(KEY_IDS, new HashSet<>()));
        Set<String> ids = schedule(ctx, json);
        prefs.edit()
                .putString(KEY_JSON, json == null ? "[]" : json)
                .putStringSet(KEY_IDS, ids)
                .apply();
    }

    /** Re-schedule from the persisted list (after boot / app update). */
    static synchronized void reschedule(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = prefs.getString(KEY_JSON, "[]");
        cancelAll(ctx, prefs.getStringSet(KEY_IDS, new HashSet<>()));
        Set<String> ids = schedule(ctx, json);
        prefs.edit().putStringSet(KEY_IDS, ids).apply();
    }

    private static Set<String> schedule(Context ctx, String json) {
        Set<String> ids = new HashSet<>();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || json == null) return ids;
        long now = System.currentTimeMillis();
        try {
            JSONArray arr = new JSONArray(json);
            // Android caps alarms per app (500 on many devices); stay well below it.
            int max = Math.min(arr.length(), MAX_ALARMS * 4);
            for (int i = 0; i < max && ids.size() < MAX_ALARMS; i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                String id = o.optString("id", "");
                long at = (long) o.optDouble("at", 0);
                if (id.isEmpty() || at <= now) continue;
                if (id.length() > 200) continue;
                PendingIntent pi = pendingIntent(ctx, id, clip(o.optString("title", "Bill reminder"), 200),
                        clip(o.optString("body", ""), 500));
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                ids.add(id);
            }
        } catch (Exception e) {
            Log.w(TAG, "Invalid reminders JSON", e);
        }
        return ids;
    }

    private static String clip(String s, int max) {
        return s == null ? null : (s.length() > max ? s.substring(0, max) : s);
    }

    private static void cancelAll(Context ctx, Set<String> ids) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || ids == null) return;
        for (String id : ids) {
            PendingIntent pi = pendingIntent(ctx, id, null, null);
            am.cancel(pi);
            pi.cancel();
        }
    }

    private static PendingIntent pendingIntent(Context ctx, String id, String title, String body) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        // Unique data URI per id so each reminder gets its own PendingIntent.
        i.setData(Uri.parse("wealthtrack://reminder/" + Uri.encode(id)));
        i.putExtra(EXTRA_ID, id);
        if (title != null) i.putExtra(EXTRA_TITLE, title);
        if (body != null) i.putExtra(EXTRA_BODY, body);
        return PendingIntent.getBroadcast(ctx, 0, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
