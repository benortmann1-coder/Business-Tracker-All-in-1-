package com.wealthtrack.app;

import android.Manifest;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Exposed to the web app as window.AndroidBridge. All methods are called on the
 * WebView's JavaBridge thread, not the UI thread.
 */
public class WebAppBridge {

    private final MainActivity activity;
    private final WebView webView;

    WebAppBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    // ---------- Files ----------

    /**
     * Saves base64 data into the public Downloads folder.
     * @return "ok:&lt;displayed path&gt;" or "error:&lt;message&gt;"
     */
    @JavascriptInterface
    public String saveFile(String fileName, String mimeType, String base64Data) {
        if (!activity.isTrustedPage()) return "error:Not allowed";
        try {
            String name = sanitizeName(fileName);
            String mime = safeMime(mimeType);
            byte[] bytes = decode(base64Data);
            String shownPath;

            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver cr = activity.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri item = cr.insert(collection, values);
                if (item == null) return "error:Could not create file in Downloads";
                try (OutputStream out = cr.openOutputStream(item)) {
                    if (out == null) throw new IllegalStateException("Could not open output stream");
                    out.write(bytes);
                } catch (Exception e) {
                    cr.delete(item, null, null);
                    throw e;
                }
                values.clear();
                values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(item, values, null, null);
                // MediaStore may have renamed it (e.g. "file (1).json").
                String actual = name;
                try (Cursor c = cr.query(item, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                    if (c != null && c.moveToFirst()) actual = c.getString(0);
                }
                shownPath = "Downloads/" + actual;
            } else {
                File dir;
                boolean hasPerm = activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                        == PackageManager.PERMISSION_GRANTED;
                if (hasPerm) {
                    dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                } else {
                    // Ask for next time; save to the app's own Downloads folder now.
                    activity.runOnUiThread(activity::requestLegacyStoragePermission);
                    dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                }
                if (dir == null) return "error:External storage unavailable";
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                File f = uniqueFile(dir, name);
                try (FileOutputStream out = new FileOutputStream(f)) {
                    out.write(bytes);
                }
                MediaScannerConnection.scanFile(activity, new String[]{f.getAbsolutePath()}, new String[]{mime}, null);
                shownPath = hasPerm ? "Downloads/" + f.getName() : f.getAbsolutePath();
            }

            final String msg = "Saved to " + shownPath;
            activity.runOnUiThread(() -> Toast.makeText(activity, msg, Toast.LENGTH_LONG).show());
            return "ok:" + shownPath;
        } catch (Throwable t) {
            return "error:" + (t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
        }
    }

    /**
     * Writes the file to the app cache and opens the Android share sheet.
     * @return "ok" or "error:&lt;message&gt;"
     */
    @JavascriptInterface
    public String shareFile(String fileName, String mimeType, String base64Data) {
        if (!activity.isTrustedPage()) return "error:Not allowed";
        try {
            String name = sanitizeName(fileName);
            String mime = safeMime(mimeType);
            byte[] bytes = decode(base64Data);
            File dir = new File(activity.getCacheDir(), "shared");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File f = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, name);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Share " + name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.runOnUiThread(() -> activity.startActivity(chooser));
            return "ok";
        } catch (Throwable t) {
            return "error:" + (t.getMessage() == null ? t.getClass().getSimpleName() : t.getMessage());
        }
    }

    // ---------- Reminders / notifications ----------

    /** json: [{"id": "...", "at": epochMillis, "title": "...", "body": "..."}] */
    @JavascriptInterface
    public void setReminders(String json) {
        if (!activity.isTrustedPage()) return;
        if (json != null && json.length() > 2_000_000) return;
        ReminderScheduler.setReminders(activity.getApplicationContext(), json);
    }

    @JavascriptInterface
    public void requestNotificationPermission() {
        if (!activity.isTrustedPage()) return;
        activity.runOnUiThread(activity::requestNotificationPermissionCompat);
    }

    @JavascriptInterface
    public boolean notificationsEnabled() {
        return Notifications.enabled(activity);
    }

    // ---- Fingerprint unlock ----

    @JavascriptInterface
    public String biometricStatus() {
        if (!activity.isTrustedPage() || activity.biometric == null) return "none";
        return activity.biometric.status();
    }

    @JavascriptInterface
    public void biometricEnable(String pin) {
        if (!activity.isTrustedPage() || activity.biometric == null) return;
        activity.biometric.enable(pin);
    }

    @JavascriptInterface
    public void biometricUnlock() {
        if (!activity.isTrustedPage() || activity.biometric == null) return;
        activity.biometric.unlock();
    }

    @JavascriptInterface
    public String biometricTakePin() {
        if (!activity.isTrustedPage() || activity.biometric == null) return null;
        return activity.biometric.takePin();
    }

    @JavascriptInterface
    public void biometricDisable() {
        if (!activity.isTrustedPage() || activity.biometric == null) return;
        activity.biometric.disable();
    }

    // ---- Google Drive backup (Sign in with Google) ----

    // ---- address suggestions (OpenStreetMap via Photon); see AddressLookup
    private static boolean okSeq(String s) { return s != null && s.matches("[0-9a-z]{1,20}"); }

    @JavascriptInterface
    public boolean addressSupported() { return activity.isTrustedPage() && activity.address != null; }

    @JavascriptInterface
    public void addressSearch(String query, String seq) {
        if (activity.isTrustedPage() && activity.address != null && okSeq(seq)) activity.address.search(query, seq);
    }

    @JavascriptInterface
    public String addressTake(String seq) {
        if (!activity.isTrustedPage() || activity.address == null) return null;
        return activity.address.take(seq);
    }

    /** Theme colors for the system bars: only a #rrggbb color and a light/dark flag are accepted. */
    @JavascriptInterface
    public void setSystemBars(String hex, boolean dark) {
        if (!activity.isTrustedPage() || hex == null || !hex.matches("^#[0-9a-fA-F]{6}$")) return;
        activity.applySystemBars(android.graphics.Color.parseColor(hex), dark);
    }

    @JavascriptInterface
    public boolean googleDriveSupported() { return true; }

    @JavascriptInterface
    public void googleSignIn() {
        if (!activity.isTrustedPage() || activity.drive == null) return;
        activity.drive.signIn();
    }

    @JavascriptInterface
    public void googleBackup(String json) {
        if (!activity.isTrustedPage() || activity.drive == null) return;
        activity.drive.backup(json);
    }

    @JavascriptInterface
    public void googleRestore() {
        if (!activity.isTrustedPage() || activity.drive == null) return;
        activity.drive.restore();
    }

    @JavascriptInterface
    public String googleRestoreData() {
        if (!activity.isTrustedPage() || activity.drive == null) return null;
        return activity.drive.takeRestoreData();
    }

    @JavascriptInterface
    public String appVersion() {
        try {
            PackageInfo pi = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            return pi.versionName + " (" + code + ")";
        } catch (Exception e) {
            return "unknown";
        }
    }

    // ---------- helpers ----------

    /** Exports are a few MB at most; refuse absurd payloads instead of running out of memory. */
    private static final int MAX_BASE64_CHARS = 80 * 1024 * 1024;

    private static String safeMime(String m) {
        if (m == null || !m.matches("[A-Za-z0-9.+-]{1,64}/[A-Za-z0-9.+-]{1,128}")) return "application/octet-stream";
        return m;
    }

    private static byte[] decode(String base64Data) {
        if (base64Data == null) return new byte[0];
        if (base64Data.length() > MAX_BASE64_CHARS) throw new IllegalArgumentException("File is too large");
        String b = base64Data;
        int comma = b.indexOf(',');
        if (b.startsWith("data:") && comma > 0) b = b.substring(comma + 1); // tolerate data: URLs
        return Base64.decode(b, Base64.DEFAULT);
    }

    private static String sanitizeName(String fileName) {
        String n = fileName == null ? "" : fileName.trim();
        n = n.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1F]", "_");
        n = n.replaceAll("^\\.+", ""); // no hidden files / relative names
        if (n.isEmpty()) n = "wealthtrack-export";
        if (n.length() > 120) n = n.substring(n.length() - 120);
        return n;
    }

    private static File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            f = new File(dir, base + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }
}
