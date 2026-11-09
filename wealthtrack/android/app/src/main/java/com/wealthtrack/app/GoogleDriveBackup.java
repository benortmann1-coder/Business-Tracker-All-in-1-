package com.wealthtrack.app;

import android.content.Intent;
import android.content.IntentSender;
import android.webkit.WebView;

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * "Sign in with Google" for backups: asks the user for the Drive "drive.file" permission
 * (the app can only see files it creates) and keeps one file, WealthTrack-backup.json,
 * in their Google Drive. Drive keeps older versions of that file automatically.
 *
 * Results go back to the page as a window event "googledrive" with
 * detail {op: 'signin'|'backup'|'restore', ok, email?, time?, error?}.
 * Restored data is fetched with WebAppBridge.googleRestoreData() so large backups
 * never pass through evaluateJavascript.
 *
 * Requires an Android OAuth client (package com.wealthtrack.app + the release signing
 * SHA-1) in the Google Cloud project — see wealthtrack/GOOGLE-SIGNIN.md.
 */
final class GoogleDriveBackup {
    static final int REQ_AUTH = 3001;
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String FILE_NAME = "WealthTrack-backup.json";
    private static final String API = "https://www.googleapis.com/drive/v3/";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/";

    interface TokenCallback { void ok(String token); void fail(String error); }

    private final MainActivity activity;
    private final WebView webView;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private TokenCallback pendingAuth;
    private volatile String restoreData;

    GoogleDriveBackup(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    // ---------------------------------------------------------------- public operations

    void signIn() {
        authorize(true, new TokenCallback() {
            public void ok(String token) {
                io.execute(() -> {
                    try {
                        JSONObject about = new JSONObject(request("GET", API + "about?fields=user(emailAddress)", token, null, null));
                        String email = about.optJSONObject("user") != null ? about.getJSONObject("user").optString("emailAddress", "") : "";
                        emit(new JSONObject().put("op", "signin").put("ok", true).put("email", email));
                    } catch (Exception e) { emitError("signin", e); }
                });
            }
            public void fail(String error) { emitError("signin", error); }
        });
    }

    void backup(String json) {
        if (json == null || json.length() > 40_000_000) { emitError("backup", "Backup is too large"); return; }
        authorize(false, new TokenCallback() {
            public void ok(String token) {
                io.execute(() -> {
                    try {
                        String id = findBackupId(token);
                        byte[] body = json.getBytes(StandardCharsets.UTF_8);
                        if (id != null) {
                            request("PATCH", UPLOAD + "files/" + id + "?uploadType=media&fields=id", token, "application/json", body);
                        } else {
                            String boundary = "wealthtrack" + System.nanoTime();
                            String meta = new JSONObject().put("name", FILE_NAME).put("mimeType", "application/json").toString();
                            ByteArrayOutputStream out = new ByteArrayOutputStream();
                            out.write(("--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + meta + "\r\n--" + boundary + "\r\nContent-Type: application/json\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                            out.write(body);
                            out.write(("\r\n--" + boundary + "--").getBytes(StandardCharsets.UTF_8));
                            request("POST", UPLOAD + "files?uploadType=multipart&fields=id", token, "multipart/related; boundary=" + boundary, out.toByteArray());
                        }
                        emit(new JSONObject().put("op", "backup").put("ok", true).put("time", System.currentTimeMillis()));
                    } catch (Exception e) { emitError("backup", e); }
                });
            }
            public void fail(String error) { emitError("backup", error); }
        });
    }

    void restore() {
        authorize(true, new TokenCallback() {
            public void ok(String token) {
                io.execute(() -> {
                    try {
                        String id = findBackupId(token);
                        if (id == null) { emitError("restore", "No WealthTrack backup was found in this Google Drive yet"); return; }
                        restoreData = request("GET", API + "files/" + id + "?alt=media", token, null, null);
                        emit(new JSONObject().put("op", "restore").put("ok", true));
                    } catch (Exception e) { emitError("restore", e); }
                });
            }
            public void fail(String error) { emitError("restore", error); }
        });
    }

    String takeRestoreData() { String d = restoreData; restoreData = null; return d; }

    // ---------------------------------------------------------------- Google authorization

    private void authorize(boolean interactive, TokenCallback cb) {
        AuthorizationRequest req = AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(SCOPE)))
                .build();
        activity.runOnUiThread(() -> Identity.getAuthorizationClient(activity).authorize(req)
                .addOnSuccessListener(res -> {
                    if (res.hasResolution()) {
                        if (!interactive) { cb.fail("signin-required"); return; }
                        try {
                            pendingAuth = cb;
                            activity.startIntentSenderForResult(res.getPendingIntent().getIntentSender(), REQ_AUTH, null, 0, 0, 0, null);
                        } catch (IntentSender.SendIntentException e) {
                            pendingAuth = null;
                            cb.fail("Couldn't open Google sign-in");
                        }
                    } else if (res.getAccessToken() != null) {
                        cb.ok(res.getAccessToken());
                    } else {
                        cb.fail("Google didn't return access");
                    }
                })
                .addOnFailureListener(e -> cb.fail(describe(e))));
    }

    /** Called from MainActivity.onActivityResult for REQ_AUTH. */
    void onAuthResult(int resultCode, Intent data) {
        TokenCallback cb = pendingAuth; pendingAuth = null;
        if (cb == null) return;
        if (resultCode != MainActivity.RESULT_OK || data == null) { cb.fail("cancelled"); return; }
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(data);
            if (r.getAccessToken() != null) cb.ok(r.getAccessToken()); else cb.fail("Google didn't return access");
        } catch (ApiException e) {
            cb.fail(describe(e));
        }
    }

    // ---------------------------------------------------------------- Drive REST helpers

    private String findBackupId(String token) throws Exception {
        String q = URLEncoder.encode("name = '" + FILE_NAME + "' and trashed = false", "UTF-8");
        JSONObject res = new JSONObject(request("GET", API + "files?spaces=drive&orderBy=modifiedTime%20desc&fields=files(id)&q=" + q, token, null, null));
        JSONArray files = res.optJSONArray("files");
        return files != null && files.length() > 0 ? files.getJSONObject(0).getString("id") : null;
    }

    private static String request(String method, String url, String token, String contentType, byte[] body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(20000);
            c.setReadTimeout(60000);
            // HttpURLConnection has no PATCH; Google APIs accept the override header
            if ("PATCH".equals(method)) { c.setRequestMethod("POST"); c.setRequestProperty("X-HTTP-Method-Override", "PATCH"); }
            else c.setRequestMethod(method);
            c.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", contentType);
                c.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = c.getOutputStream()) { os.write(body); }
            }
            int code = c.getResponseCode();
            String text = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
            if (code >= 400) {
                String msg = "Google Drive error " + code;
                try { msg = new JSONObject(text).getJSONObject("error").optString("message", msg); } catch (Exception ignored) { }
                throw new Exception(msg);
            }
            return text;
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws Exception {
        if (in == null) return "";
        try (InputStream s = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384]; int n;
            while ((n = s.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    // ---------------------------------------------------------------- results back to the page

    private static String describe(Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            if (code == 10) return "Google sign-in isn't set up for this app yet (developer error 10)";
            if (code == 7) return "No internet connection";
            if (code == 16 || code == 12501) return "cancelled";
            return "Google sign-in failed (code " + code + ")";
        }
        return e.getMessage() != null ? e.getMessage() : e.toString();
    }

    private void emitError(String op, Exception e) { emitError(op, describe(e)); }

    private void emitError(String op, String error) {
        try { emit(new JSONObject().put("op", op).put("ok", false).put("error", error)); } catch (Exception ignored) { }
    }

    private void emit(JSONObject detail) {
        String js = "window.dispatchEvent(new CustomEvent('googledrive',{detail:" + detail.toString() + "}));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
