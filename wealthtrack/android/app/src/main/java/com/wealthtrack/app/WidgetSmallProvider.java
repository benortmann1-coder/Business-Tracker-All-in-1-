package com.wealthtrack.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget (small: money left after bills and the next bill). Drawn by WidgetData. */
public class WidgetSmallProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, WidgetData.buildSmall(ctx));
    }
}
