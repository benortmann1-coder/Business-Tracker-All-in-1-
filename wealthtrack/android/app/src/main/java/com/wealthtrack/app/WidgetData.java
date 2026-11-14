package com.wealthtrack.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Calendar;
import java.util.Locale;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget data and drawing.
 *
 * The web app sends a small, already-formatted snapshot (web/widget.js) through AndroidBridge.updateWidgets.
 * It's kept in this app's private SharedPreferences, which data_extraction_rules.xml already excludes from
 * Google cloud backup and device-to-device transfer. When the PIN lock is on, the snapshot carries no amounts.
 */
final class WidgetData {
    private static final String PREFS = "wt_widget";
    private static final String KEY = "snapshot";
    private static final int MAX_JSON = 20_000;
    private static final int MAX_TEXT = 60;

    private WidgetData() {}

    static void save(Context ctx, String json) {
        if (json == null || json.length() > MAX_JSON) return;
        try {
            JSONObject o = new JSONObject(json);
            if (o.optInt("v") != 1) return;
        } catch (Exception e) {
            return;
        }
        prefs(ctx).edit().putString(KEY, json).apply();
        updateAll(ctx);
    }

    static void clear(Context ctx) {
        prefs(ctx).edit().clear().apply();
        updateAll(ctx);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject load(Context ctx) {
        String s = prefs(ctx).getString(KEY, null);
        if (s == null) return null;
        try { return new JSONObject(s); } catch (Exception e) { return null; }
    }

    /** Redraws every placed WealthTrack widget of both sizes. */
    static void updateAll(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        if (m == null) return;
        int[] small = m.getAppWidgetIds(new ComponentName(ctx, WidgetSmallProvider.class));
        int[] list = m.getAppWidgetIds(new ComponentName(ctx, WidgetListProvider.class));
        for (int id : small) m.updateAppWidget(id, buildSmall(ctx));
        for (int id : list) m.updateAppWidget(id, buildList(ctx));
    }

    private static String txt(JSONObject o, String k) {
        String s = o == null ? "" : o.optString(k, "");
        return s.length() > MAX_TEXT ? s.substring(0, MAX_TEXT) : s;
    }

    /** Message shown instead of amounts, or null when the snapshot can be shown. */
    private static String notice(Context ctx, JSONObject o) {
        if (o == null) return ctx.getString(R.string.widget_setup);
        switch (o.optString("state")) {
            case "ok": return null;
            case "pin": return ctx.getString(R.string.widget_pin);
            case "pro": return ctx.getString(R.string.widget_pro);
            default: return ctx.getString(R.string.widget_empty);
        }
    }

    private static PendingIntent open(Context ctx, String route, int requestCode) {
        Intent i = new Intent(ctx, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                .putExtra(MainActivity.EXTRA_ROUTE, route);
        return PendingIntent.getActivity(ctx, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** "Overdue", "Today", "Tomorrow" or the formatted date, worked out against the phone's clock at draw time. */
    private static String dueLabel(Context ctx, JSONObject b) {
        String d = b.optString("dueDate", "");
        String shown = txt(b, "dueShort");
        if (!d.matches("\\d{4}-\\d{2}-\\d{2}")) return shown;
        Calendar c = Calendar.getInstance();
        String today = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        c.add(Calendar.DAY_OF_MONTH, 1);
        String tomorrow = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        if (d.compareTo(today) < 0) return ctx.getString(R.string.widget_overdue);
        if (d.equals(today)) return ctx.getString(R.string.widget_today);
        if (d.equals(tomorrow)) return ctx.getString(R.string.widget_tomorrow);
        return shown;
    }

    private static boolean isOverdue(JSONObject b) {
        String d = b.optString("dueDate", "");
        Calendar c = Calendar.getInstance();
        String today = String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
        return b.optBoolean("overdue") || (d.length() == 10 && d.compareTo(today) < 0);
    }

    private static String routeFor(JSONObject o, String okRoute) {
        if (o != null && "pro".equals(o.optString("state"))) return "upgrade";
        return okRoute;
    }

    static RemoteViews buildSmall(Context ctx) {
        JSONObject o = load(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_small);
        String n = notice(ctx, o);
        v.setOnClickPendingIntent(R.id.widget_root, open(ctx, routeFor(o, "dashboard"), 1));
        if (n != null) {
            v.setViewVisibility(R.id.widget_content, View.GONE);
            v.setViewVisibility(R.id.widget_notice, View.VISIBLE);
            v.setTextViewText(R.id.widget_notice, n);
            return v;
        }
        v.setViewVisibility(R.id.widget_content, View.VISIBLE);
        v.setViewVisibility(R.id.widget_notice, View.GONE);
        v.setTextViewText(R.id.left_label, txt(o, "leftLabel"));
        v.setTextViewText(R.id.left_amount, txt(o, "leftText"));
        v.setTextColor(R.id.left_amount, ctx.getColor(o.optBoolean("leftNeg") ? R.color.widget_neg : R.color.widget_ink));
        JSONArray bills = o.optJSONArray("bills");
        JSONObject b = bills != null && bills.length() > 0 ? bills.optJSONObject(0) : null;
        if (b != null) {
            v.setTextViewText(R.id.next_bill, ctx.getString(R.string.widget_next_bill, txt(b, "name"), txt(b, "amount"), dueLabel(ctx, b)));
            v.setTextColor(R.id.next_bill, ctx.getColor(isOverdue(b) ? R.color.widget_neg : R.color.widget_ink2));
        } else {
            v.setTextViewText(R.id.next_bill, ctx.getString(R.string.widget_all_paid));
            v.setTextColor(R.id.next_bill, ctx.getColor(R.color.widget_ink2));
        }
        return v;
    }

    private static final int[][] ROWS = {
            {R.id.row1, R.id.row1_name, R.id.row1_amount, R.id.row1_due},
            {R.id.row2, R.id.row2_name, R.id.row2_amount, R.id.row2_due},
            {R.id.row3, R.id.row3_name, R.id.row3_amount, R.id.row3_due},
    };

    static RemoteViews buildList(Context ctx) {
        JSONObject o = load(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_list);
        String n = notice(ctx, o);
        v.setOnClickPendingIntent(R.id.widget_root, open(ctx, routeFor(o, "bills"), 2));
        if (n != null) {
            v.setViewVisibility(R.id.widget_content, View.GONE);
            v.setViewVisibility(R.id.widget_notice, View.VISIBLE);
            v.setTextViewText(R.id.widget_notice, n);
            return v;
        }
        v.setViewVisibility(R.id.widget_content, View.VISIBLE);
        v.setViewVisibility(R.id.widget_notice, View.GONE);
        String sub = txt(o, "leftLabel") + " " + txt(o, "leftText");
        String pay = txt(o, "payText");
        v.setTextViewText(R.id.list_sub, pay.isEmpty() ? sub : sub + " · " + pay);
        String od = txt(o, "overdueText");
        v.setViewVisibility(R.id.list_overdue, od.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.list_overdue, od);
        JSONArray bills = o.optJSONArray("bills");
        int count = bills == null ? 0 : Math.min(bills.length(), ROWS.length);
        for (int k = 0; k < ROWS.length; k++) {
            int[] r = ROWS[k];
            JSONObject b = k < count ? bills.optJSONObject(k) : null;
            if (b == null) { v.setViewVisibility(r[0], View.GONE); continue; }
            v.setViewVisibility(r[0], View.VISIBLE);
            v.setTextViewText(r[1], txt(b, "name"));
            v.setTextViewText(r[2], txt(b, "amount"));
            v.setTextViewText(r[3], dueLabel(ctx, b));
            v.setTextColor(r[3], ctx.getColor(isOverdue(b) ? R.color.widget_neg : R.color.widget_ink2));
        }
        v.setViewVisibility(R.id.list_empty, count == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.list_asof, txt(o, "asOfText"));
        return v;
    }
}
