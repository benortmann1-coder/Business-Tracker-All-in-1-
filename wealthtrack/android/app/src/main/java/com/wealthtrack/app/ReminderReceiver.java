package com.wealthtrack.app;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/** Posts a bill-reminder notification when an alarm fires. */
public class ReminderReceiver extends BroadcastReceiver {
    @SuppressLint("MissingPermission")
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String id = intent.getStringExtra(ReminderScheduler.EXTRA_ID);
        String title = intent.getStringExtra(ReminderScheduler.EXTRA_TITLE);
        String body = intent.getStringExtra(ReminderScheduler.EXTRA_BODY);
        if (title == null || title.isEmpty()) title = "Bill reminder";
        if (body == null) body = "";

        Notifications.ensureChannel(ctx);
        if (!Notifications.enabled(ctx)) return;

        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, Notifications.CHANNEL_BILLS)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(ContextCompat.getColor(ctx, R.color.brand_green))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setContentIntent(content)
                // Lock screen shows a generic message; bill names/amounts only after unlocking.
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(new NotificationCompat.Builder(ctx, Notifications.CHANNEL_BILLS)
                        .setSmallIcon(R.drawable.ic_stat_notify)
                        .setContentTitle("Bill reminder")
                        .setContentText("Open WealthTrack to see what's due")
                        .build())
                .setAutoCancel(true);

        int notifId = id == null ? (int) System.currentTimeMillis() : id.hashCode();
        NotificationManagerCompat.from(ctx).notify(notifId, b.build());
    }
}
