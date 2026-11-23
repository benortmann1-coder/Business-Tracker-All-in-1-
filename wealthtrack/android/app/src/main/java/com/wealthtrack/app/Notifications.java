package com.wealthtrack.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

final class Notifications {
    static final String CHANNEL_BILLS = "bills";

    private Notifications() {}

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_BILLS) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL_BILLS,
                        ctx.getString(R.string.channel_bills_name), NotificationManager.IMPORTANCE_DEFAULT);
                ch.setDescription(ctx.getString(R.string.channel_bills_desc));
                nm.createNotificationChannel(ch);
            }
        }
    }

    static boolean enabled(Context ctx) {
        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }
}
