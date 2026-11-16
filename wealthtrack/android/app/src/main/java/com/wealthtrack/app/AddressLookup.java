package com.wealthtrack.app;

import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Address suggestions for Settings > Personal info, from OpenStreetMap data via the free Photon
 * search service (photon.komoot.io, built for search-as-you-type). No key, no account.
 *
 * Results never go through evaluateJavascript: the page gets a small "address" event
 * {op:'search', seq, ok, error?} and then reads the data with addressTake(seq).
 */
final class AddressLookup {
    private static final String ENDPOINT = "https://photon.komoot.io/api/";
    private final WebView webView;
    private final String userAgent;
    private final ExecutorService pool = Executors.newSingleThreadExecutor();
    private volatile String lastSeq = "";
    private volatile String lastData = null;

    AddressLookup(MainActivity activity, WebView webView) {
        this.webView = webView;
        this.userAgent = "WealthTrack/" + BuildConfig.VERSION_NAME + " (Android personal finance app)";
    }

    boolean supported() { return true; }

    void search(String query, String seq) {
        if (query == null || seq == null) return;
        final String q = query.trim();
        if (q.length() < 3 || q.length() > 200) return;
        pool.execute(() -> {
            try {
                String url = ENDPOINT + "?q=" + URLEncoder.encode(q, "UTF-8") + "&limit=8&lang=en&layer=house&layer=street";
                JSONObject res = get(url);
                JSONArray feats = res.optJSONArray("features");
                JSONArray out = new JSONArray();
                boolean wantsNumber = Character.isDigit(q.charAt(0));
                // houses first when the query starts with a number, then US results, then the rest
                for (int pass = 0; pass < 3 && out.length() < 5; pass++) {
                    for (int i = 0; feats != null && i < feats.length() && out.length() < 5; i++) {
                        JSONObject p = feats.getJSONObject(i).optJSONObject("properties");
                        if (p == null) continue;
                        boolean house = !p.optString("housenumber").isEmpty();
                        boolean us = "US".equalsIgnoreCase(p.optString("countrycode"));
                        int rank = (wantsNumber && house && us) ? 0 : (us ? 1 : 2);
                        if (rank != pass) continue;
                        JSONObject item = toItem(p, i);
                        if (item != null) out.put(item);
                    }
                }
                deliver(seq, out.toString(), null);
            } catch (Exception e) {
                deliver(seq, null, e instanceof HttpError ? "Address suggestions aren't available right now" : "No internet connection. Type the address instead");
            }
        });
    }

    /** The data for the latest event, once. */
    String take(String seq) {
        if (seq == null || !seq.equals(lastSeq)) return null;
        String d = lastData; lastData = null; return d;
    }

    // ---------------------------------------------------------------- internals

    private static JSONObject toItem(JSONObject p, int i) throws Exception {
        String num = p.optString("housenumber"), street = p.optString("street"), name = p.optString("name");
        String type = p.optString("type");
        if (street.isEmpty() && "street".equals(type)) street = name;
        if (street.isEmpty()) return null;
        String line1 = (num + " " + street).trim();
        String city = first(p, "city", "town", "village", "district", "county");
        String state = p.optString("state"), zip = p.optString("postcode"), country = p.optString("country");
        StringBuilder sec = new StringBuilder();
        for (String part : new String[]{city, (state + " " + zip).trim(), "US".equalsIgnoreCase(p.optString("countrycode")) ? "" : country}) {
            if (!part.isEmpty()) { if (sec.length() > 0) sec.append(", "); sec.append(part); }
        }
        return new JSONObject().put("id", "osm" + i).put("main", line1).put("secondary", sec.toString())
                .put("street", line1).put("city", city).put("state", state).put("zip", zip)
                .put("countrycode", p.optString("countrycode"));
    }

    private static String first(JSONObject p, String... keys) {
        for (String k : keys) { String v = p.optString(k); if (!v.isEmpty()) return v; }
        return "";
    }

    private JSONObject get(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(8000);
        c.setRequestProperty("User-Agent", userAgent);
        c.setRequestProperty("Accept", "application/json");
        int code = c.getResponseCode();
        InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
        String text = read(in);
        c.disconnect();
        if (code < 200 || code >= 300) throw new HttpError();
        return new JSONObject(text.isEmpty() ? "{}" : text);
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int n; int total = 0;
        while ((n = in.read(buf)) > 0) { bo.write(buf, 0, n); total += n; if (total > 512 * 1024) break; }
        in.close();
        return bo.toString("UTF-8");
    }

    private static final class HttpError extends Exception { }

    private void deliver(String seq, String data, String error) {
        lastSeq = seq; lastData = data;
        try {
            JSONObject d = new JSONObject().put("op", "search").put("seq", seq).put("ok", error == null);
            if (error != null) d.put("error", error);
            String js = "window.dispatchEvent(new CustomEvent('address',{detail:" + d + "}));";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }
}
