package com.wealthtrack.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewFeature;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Hosts the bundled WealthTrack web app in a full-screen WebView.
 *
 * The app is served from https://appassets.androidplatform.net/assets/index.html via
 * WebViewAssetLoader, giving it a secure context (crypto.subtle) and a stable origin
 * for IndexedDB / localStorage.
 */
public class MainActivity extends Activity {

    static final String APP_HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + APP_HOST + "/assets/index.html";

    private static final int REQ_FILE_CHOOSER = 1001;
    GoogleDriveBackup drive;
    BiometricLock biometric;
    AddressLookup address;
    /** Play Billing for WealthTrack Pro; null unless this is the Google Play build (BuildConfig.PRO_ENFORCED). */
    ProBilling pro;
    static final int REQ_NOTIFICATIONS = 2001;
    static final int REQ_STORAGE = 2002;

    private WebView webView;
    /** Host of the page currently shown; the JS bridge only answers when this is the bundled app. */
    private volatile String currentHost = null;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraOutputUri;
    private File cameraOutputFile;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Android 15+ draws apps edge to edge: keep the page clear of the status bar, navigation bar,
        // display cutout and keyboard by padding a container (its background shows behind the bars).
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getResources().getColor(R.color.bg, getTheme()));
        root.addView(webView);
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });
        // Android 13+ back gesture (required behaviour when targeting Android 16): same handling as onBackPressed
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            // The web app ships its own dark theme (prefers-color-scheme follows the
            // activity theme, which follows the system); do not auto-darken it.
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        }

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(APP_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/res/", new WebViewAssetLoader.ResourcesPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                WebResourceResponse r = assetLoader.shouldInterceptRequest(url);
                if (r != null) return r;
                // The app is fully offline: never fetch anything from the network.
                String scheme = url.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", null,
                            new java.io.ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                currentHost = url == null ? null : Uri.parse(url).getHost();
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                currentHost = url == null ? null : Uri.parse(url).getHost();
                super.doUpdateVisitedHistory(view, url, isReload);
            }

            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (APP_HOST.equals(uri.getHost())) return false;
                // Anything else (http links, mailto:, tel:, ...) goes to an external app.
                openExternal(uri);
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                return showFileChooser(callback, params);
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            // blob:/data: downloads are handled by the web app via AndroidBridge.saveFile.
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))
                    && !url.contains(APP_HOST)) {
                openExternal(Uri.parse(url));
            }
        });

        drive = new GoogleDriveBackup(this, webView);
        biometric = new BiometricLock(this, webView);
        address = new AddressLookup(this, webView);
        if (BuildConfig.PRO_ENFORCED) pro = new ProBilling(this, webView);
        webView.addJavascriptInterface(new WebAppBridge(this, webView), "AndroidBridge");

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(START_URL);
        }
    }

    /** True only while the bundled WealthTrack page is showing (checked by every bridge call). */
    boolean isTrustedPage() {
        return APP_HOST.equals(currentHost);
    }

    private void openExternal(Uri uri) {
        String scheme = uri.getScheme();
        // Only hand ordinary links to other apps; never intent:, file:, content:, javascript:, data: ...
        if (scheme == null || !(scheme.equals("http") || scheme.equals("https") || scheme.equals("mailto") || scheme.equals("tel"))) {
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app can open this link", Toast.LENGTH_SHORT).show();
        }
    }

    // ---- File chooser (<input type=file>) ----

    private boolean showFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
        }
        filePathCallback = callback;
        cameraOutputUri = null;
        cameraOutputFile = null;

        String[] accept = params.getAcceptTypes();
        List<String> mimes = new ArrayList<>();
        boolean wantsImage = false;
        if (accept != null) {
            for (String a : accept) {
                if (a == null) continue;
                for (String part : a.split(",")) {
                    String t = part.trim().toLowerCase(java.util.Locale.ROOT);
                    if (t.isEmpty()) continue;
                    if (t.equals(".json")) t = "application/json";
                    else if (t.equals(".csv")) t = "text/csv";
                    else if (t.equals(".png")) t = "image/png";
                    else if (t.equals(".jpg") || t.equals(".jpeg")) t = "image/jpeg";
                    else if (t.equals(".xlsx")) t = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                    else if (t.startsWith(".")) t = "*/*";
                    if (t.startsWith("image/")) wantsImage = true;
                    if (!mimes.contains(t)) mimes.add(t);
                }
            }
        }
        if (mimes.contains("application/json") && !mimes.contains("*/*")) {
            // Many file managers label .json files as octet-stream or text/plain.
            mimes.add("application/octet-stream");
            mimes.add("text/plain");
        }

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        if (mimes.isEmpty() || mimes.contains("*/*")) {
            pick.setType("*/*");
        } else if (mimes.size() == 1) {
            pick.setType(mimes.get(0));
        } else {
            pick.setType("*/*");
            pick.putExtra(Intent.EXTRA_MIME_TYPES, mimes.toArray(new String[0]));
        }
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }

        Intent chooser = Intent.createChooser(pick, "Choose file");
        if (wantsImage) {
            Intent camera = buildCameraIntent();
            if (camera != null) {
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
            }
        }
        try {
            startActivityForResult(chooser, REQ_FILE_CHOOSER);
            return true;
        } catch (ActivityNotFoundException e) {
            filePathCallback = null;
            Toast.makeText(this, "No file picker available", Toast.LENGTH_SHORT).show();
            return false;
        }
    }

    private Intent buildCameraIntent() {
        try {
            Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            if (capture.resolveActivity(getPackageManager()) == null) return null;
            File dir = new File(getCacheDir(), "camera");
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
            File photo = new File(dir, "receipt-" + System.currentTimeMillis() + ".jpg");
            cameraOutputFile = photo;
            cameraOutputUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
            capture.putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri);
            capture.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            capture.setClipData(ClipData.newRawUri("output", cameraOutputUri));
            return capture;
        } catch (Exception e) {
            cameraOutputUri = null;
            cameraOutputFile = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == GoogleDriveBackup.REQ_AUTH) {
            if (drive != null) drive.onAuthResult(resultCode, data);
            return;
        }
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                boolean cameraShot = cameraOutputFile != null && cameraOutputFile.length() > 0;
                if (cameraShot) {
                    result = new Uri[]{cameraOutputUri};
                } else if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                } else if (data != null && data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                }
            }
            if (filePathCallback != null) filePathCallback.onReceiveValue(result);
            filePathCallback = null;
            cameraOutputUri = null;
            cameraOutputFile = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ---- Runtime permissions ----

    void requestNotificationPermissionCompat() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
        } else {
            dispatchPermissionEvent("notifications", Notifications.enabled(this));
        }
    }

    void requestLegacyStoragePermission() {
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_NOTIFICATIONS) {
            dispatchPermissionEvent("notifications", granted);
        } else if (requestCode == REQ_STORAGE) {
            dispatchPermissionEvent("storage", granted);
        }
    }

    /** Fires `window` event "androidpermission" with detail {name, granted}. */
    private void dispatchPermissionEvent(String name, boolean granted) {
        if (webView == null) return;
        String js = "window.dispatchEvent(new CustomEvent('androidpermission',{detail:{name:'"
                + name + "',granted:" + granted + "}}));";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    // ---- Lifecycle / navigation ----

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        handleBack();
    }

    private void handleBack() {
        if (webView == null) { finish(); return; }
        // Give the web app first refusal (e.g. to close a modal): if it defines
        // window.onAndroidBack and that returns true, the press is consumed.
        webView.evaluateJavascript(
                "(function(){try{return !!(window.onAndroidBack && window.onAndroidBack());}catch(e){return false;}})()",
                value -> {
                    if ("true".equals(value)) return;
                    if (webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finish();
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        if (pro != null) pro.restore(false); // a pending purchase may have finished, or been refunded
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (pro != null) { pro.close(); pro = null; }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
