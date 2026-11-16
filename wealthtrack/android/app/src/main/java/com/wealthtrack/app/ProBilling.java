package com.wealthtrack.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebView;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * WealthTrack Pro: a one-time, non-consumable Google Play purchase (product "wealthtrack_pro").
 *
 * Google Play is the source of truth. The last answer is kept in SharedPreferences so Pro keeps
 * working offline, and every successful query of Play replaces it (a refund turns Pro back off).
 * Only built with BuildConfig.PRO_ENFORCED (the Play build); otherwise this class is never created
 * and the page treats every feature as unlocked.
 *
 * The page reads the state through WebAppBridge (proOwned, proPending, proAvailable, proPrice) and
 * gets a window event "wtpro" with detail {op: 'purchase'|'restore'|'status', ok, owned, pending, error}.
 */
final class ProBilling implements PurchasesUpdatedListener {
    static final String PRODUCT_ID = "wealthtrack_pro";
    private static final String PREFS = "wt.pro";

    private final MainActivity activity;
    private final WebView webView;
    private final SharedPreferences prefs;
    private final BillingClient client;
    private volatile ProductDetails product;
    private volatile boolean connected;
    private volatile boolean pending;

    ProBilling(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.client = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
        connect(null);
    }

    // ---------------------------------------------------------------- state for the page

    boolean owned() { return prefs.getBoolean("owned", false); }
    boolean pending() { return pending; }
    boolean available() { return connected && product != null; }

    String price() {
        ProductDetails p = product;
        if (p == null || p.getOneTimePurchaseOfferDetails() == null) return "";
        return p.getOneTimePurchaseOfferDetails().getFormattedPrice();
    }

    // ---------------------------------------------------------------- actions

    void purchase() {
        if (owned()) { emit("purchase", true, null); return; }
        if (!available()) {
            connect(() -> { if (available()) launch(); else emit("purchase", false, "Google Play isn't available right now. Check your connection and try again."); });
            return;
        }
        launch();
    }

    /** Asks Google Play again (the "Restore purchase" button, and every time the app comes back). */
    void restore(boolean fromUser) {
        String op = fromUser ? "restore" : "status";
        if (!connected) { connect(() -> { if (connected) queryPurchases(op); else emit(op, false, "Google Play isn't available right now. Check your connection and try again."); }); return; }
        queryPurchases(op);
    }

    void close() {
        try { client.endConnection(); } catch (Exception ignored) { }
    }

    // ---------------------------------------------------------------- Play Billing

    private void connect(Runnable then) {
        if (client.isReady()) { connected = true; if (then != null) then.run(); return; }
        try {
            client.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult r) {
                    connected = r.getResponseCode() == BillingClient.BillingResponseCode.OK;
                    if (connected) { queryProduct(then); queryPurchases("status"); }
                    else if (then != null) then.run();
                }

                @Override
                public void onBillingServiceDisconnected() {
                    connected = false; // enableAutoServiceReconnection() reconnects on the next call
                }
            });
        } catch (Exception e) {
            connected = false;
            if (then != null) then.run();
        }
    }

    private void queryProduct(Runnable then) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build()))
                .build();
        client.queryProductDetailsAsync(params, (r, result) -> {
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK && result != null) {
                for (ProductDetails d : result.getProductDetailsList()) {
                    if (PRODUCT_ID.equals(d.getProductId())) product = d;
                }
            }
            if (then != null) then.run();
            emitStatus(); // the price is known now
        });
    }

    private void launch() {
        final ProductDetails p = product;
        if (p == null) { emit("purchase", false, "Pro isn't available to buy yet."); return; }
        activity.runOnUiThread(() -> {
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(
                            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(p).build()))
                    .build();
            BillingResult r = client.launchBillingFlow(activity, flow);
            int code = r.getResponseCode();
            if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) queryPurchases("restore");
            else if (code != BillingClient.BillingResponseCode.OK) emit("purchase", false, message(r));
        });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, List<Purchase> purchases) {
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) { handle(purchases, "purchase", false); return; }
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { emit("purchase", false, "cancelled"); return; }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { queryPurchases("restore"); return; }
        emit("purchase", false, message(r));
    }

    private void queryPurchases(String op) {
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(),
                (r, list) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        // keep the saved answer: being offline must not take Pro away
                        if (!"status".equals(op)) emit(op, false, message(r));
                        return;
                    }
                    handle(list, op, true);
                });
    }

    /** complete: the list is everything Play has for this account, so "not in it" means "not owned". */
    private void handle(List<Purchase> list, String op, boolean complete) {
        boolean isOwned = false, isPending = false;
        if (list != null) {
            for (Purchase p : list) {
                if (!p.getProducts().contains(PRODUCT_ID)) continue;
                int state = p.getPurchaseState();
                if (state == Purchase.PurchaseState.PURCHASED) {
                    isOwned = true;
                    if (!p.isAcknowledged()) acknowledge(p);
                } else if (state == Purchase.PurchaseState.PENDING) {
                    isPending = true;
                }
            }
        }
        pending = isPending && !isOwned;
        if (isOwned || complete) prefs.edit().putBoolean("owned", isOwned).apply();
        emit(op, true, null);
    }

    private void acknowledge(Purchase p) {
        // Play refunds purchases that aren't acknowledged within 3 days.
        client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
    }

    private static String message(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
            case BillingClient.BillingResponseCode.NETWORK_ERROR:
                return "Can't reach Google Play. Check your connection and try again.";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
                return "Google Play billing isn't available on this phone or account.";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:
                return "Pro isn't available to buy yet.";
            default:
                return "Google Play error (" + r.getResponseCode() + "). Try again.";
        }
    }

    // ---------------------------------------------------------------- events to the page

    private void emitStatus() { emit("status", true, null); }

    private void emit(String op, boolean ok, String error) {
        try {
            JSONObject d = new JSONObject().put("op", op).put("ok", ok).put("owned", owned()).put("pending", pending);
            if (error != null) d.put("error", error);
            String js = "window.dispatchEvent(new CustomEvent('wtpro',{detail:" + d + "}));";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }
}
