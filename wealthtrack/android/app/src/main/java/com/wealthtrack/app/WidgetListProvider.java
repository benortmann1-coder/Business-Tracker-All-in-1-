package com.wealthtrack.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget (medium: the next three unpaid bills). Drawn by WidgetData. */
public class WidgetListProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, WidgetData.buildList(ctx));
    }
}
