package com.wealthtrack.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint unlock. The app's data is encrypted with a key derived from the user's PIN, so a
 * fingerprint has to produce the PIN: when fingerprint is turned on, the PIN is encrypted with an
 * AES key that lives in the Android Keystore and can only be used right after a successful strong
 * biometric check (and is wiped if a new fingerprint is enrolled). Unlocking decrypts it again.
 *
 * Results go to the page as window event "biometric" with detail {op:'enable'|'unlock', ok, error?};
 * the PIN itself is fetched with WebAppBridge.biometricTakePin() (never through evaluateJavascript).
 * Uses the platform BiometricPrompt (Android 9+); older phones simply use the PIN.
 */
final class BiometricLock {
    private static final String KEY_ALIAS = "wealthtrack_pin_key";
    private static final String PREFS = "wealthtrack_biometric";
    private final MainActivity activity;
    private final WebView webView;
    private volatile String unlockedPin;

    BiometricLock(MainActivity activity, WebView webView) { this.activity = activity; this.webView = webView; }

    private SharedPreferences prefs() { return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** "none" (no hardware / Android < 9 / no fingerprint enrolled), "available", or "enabled". */
    String status() {
        if (!supported()) return "none";
        return prefs().contains("pin") ? "enabled" : "available";
    }

    private boolean supported() {
        if (Build.VERSION.SDK_INT < 28) return false;
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                BiometricManager bm = activity.getSystemService(BiometricManager.class);
                return bm != null && bm.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS;
            }
            if (Build.VERSION.SDK_INT == 29) {
                BiometricManager bm = activity.getSystemService(BiometricManager.class);
                return bm != null && bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
            }
            return activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        } catch (Exception e) {
            return false;
        }
    }

    void enable(String pin) {
        if (!supported() || pin == null || pin.length() < 4 || pin.length() > 64) { emit("enable", false, "Fingerprint isn't available on this phone"); return; }
        activity.runOnUiThread(() -> {
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, createKey());
                prompt("Turn on fingerprint unlock", "Touch the sensor to confirm", cipher, c -> {
                    byte[] enc = c.doFinal(pin.getBytes(StandardCharsets.UTF_8));
                    prefs().edit()
                            .putString("pin", Base64.encodeToString(enc, Base64.NO_WRAP))
                            .putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP))
                            .apply();
                    emit("enable", true, null);
                }, err -> emit("enable", false, err));
            } catch (Exception e) {
                emit("enable", false, "Couldn't set up fingerprint: " + e.getMessage());
            }
        });
    }

    void unlock() {
        if (!"enabled".equals(status())) { emit("unlock", false, "Fingerprint isn't turned on"); return; }
        activity.runOnUiThread(() -> {
            try {
                byte[] iv = Base64.decode(prefs().getString("iv", ""), Base64.NO_WRAP);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, loadKey(), new GCMParameterSpec(128, iv));
                prompt("Unlock WealthTrack", "Touch the sensor, or use your PIN", cipher, c -> {
                    byte[] enc = Base64.decode(prefs().getString("pin", ""), Base64.NO_WRAP);
                    unlockedPin = new String(c.doFinal(enc), StandardCharsets.UTF_8);
                    emit("unlock", true, null);
                }, err -> emit("unlock", false, err));
            } catch (KeyPermanentlyInvalidatedException e) {
                disable();
                emit("unlock", false, "Your fingerprints changed. Use your PIN, then turn fingerprint on again in Settings.");
            } catch (Exception e) {
                emit("unlock", false, "Use your PIN (" + e.getMessage() + ")");
            }
        });
    }

    String takePin() { String p = unlockedPin; unlockedPin = null; return p; }

    void disable() {
        prefs().edit().clear().apply();
        try { KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null); ks.deleteEntry(KEY_ALIAS); } catch (Exception ignored) { }
    }

    // ---------------------------------------------------------------- internals

    private interface CipherUse { void run(Cipher c) throws Exception; }
    private interface Fail { void run(String error); }

    private void prompt(String title, String subtitle, Cipher cipher, CipherUse onOk, Fail onFail) {
        BiometricPrompt.Builder b = new BiometricPrompt.Builder(activity).setTitle(title).setSubtitle(subtitle);
        if (Build.VERSION.SDK_INT >= 30) b.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG);
        b.setNegativeButton("Use PIN", activity.getMainExecutor(), (d, w) -> onFail.run("cancelled"));
        BiometricPrompt p = b.build();
        p.authenticate(new BiometricPrompt.CryptoObject(cipher), new CancellationSignal(), activity.getMainExecutor(),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                        try { onOk.run(r.getCryptoObject().getCipher()); } catch (Exception e) { onFail.run("Fingerprint check failed: " + e.getMessage()); }
                    }
                    @Override public void onAuthenticationError(int code, CharSequence msg) {
                        boolean cancelled = code == BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED || code == BiometricPrompt.BIOMETRIC_ERROR_CANCELED;
                        onFail.run(cancelled ? "cancelled" : String.valueOf(msg));
                    }
                });
    }

    private SecretKey createKey() throws Exception {
        KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true);
        if (Build.VERSION.SDK_INT >= 30) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        kg.init(spec.build());
        return kg.generateKey();
    }

    private SecretKey loadKey() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        SecretKey k = (SecretKey) ks.getKey(KEY_ALIAS, null);
        if (k == null) throw new KeyPermanentlyInvalidatedException("missing key");
        return k;
    }

    private void emit(String op, boolean ok, String error) {
        try {
            JSONObject d = new JSONObject().put("op", op).put("ok", ok);
            if (error != null) d.put("error", error);
            String js = "window.dispatchEvent(new CustomEvent('biometric',{detail:" + d + "}));";
            webView.post(() -> webView.evaluateJavascript(js, null));
        } catch (Exception ignored) { }
    }
}
