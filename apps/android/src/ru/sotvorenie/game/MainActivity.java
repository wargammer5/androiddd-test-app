package ru.sotvorenie.game;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Vibrator;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends Activity {
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/index.html";
    static final int REQ_EXPORT = 41;
    static final int REQ_IMPORT = 42;

    WebView web;
    boolean immersive = true;
    final Handler main = new Handler(Looper.getMainLooper());
    byte[] pendingExport;
    int pendingExportCb;
    int pendingImportCb;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        w.setStatusBarColor(Color.BLACK);
        w.setNavigationBarColor(Color.BLACK);
        setCutoutMode(w);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.addJavascriptInterface(new Bridge(), "SotvAndroid");
        web.setWebViewClient(new AssetClient(getAssets()));
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.i("Sotvorenie", m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        setContentView(web);
        applyImmersive();
        web.loadUrl(START_URL);
    }

    void setCutoutMode(Window w) {
        if (Build.VERSION.SDK_INT < 28) return;
        try {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.getClass().getField("layoutInDisplayCutoutMode").setInt(lp, 1);
            w.setAttributes(lp);
        } catch (Throwable ignored) {
        }
    }

    void applyImmersive() {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
        if (immersive) flags |= View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
    }

    void js(String code) {
        if (web != null) web.evaluateJavascript(code, null);
    }

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript("(window.__sotvBack ? window.__sotvBack() : false)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (!"true".equals(v)) finish();
            }
        });
    }

    @Override
    protected void onPause() {
        js("window.__sotvLifecycle && window.__sotvLifecycle('pause')");
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        applyImmersive();
        js("window.__sotvLifecycle && window.__sotvLifecycle('resume')");
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    void callback(final int id, final boolean ok, final String data) {
        main.post(new Runnable() {
            @Override
            public void run() {
                String d = data == null ? "undefined" : "'" + data + "'";
                js("window.__sotvCallback && window.__sotvCallback(" + id + "," + ok + "," + d + ")");
            }
        });
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        Uri uri = data != null ? data.getData() : null;
        if (req == REQ_EXPORT) {
            boolean ok = false;
            if (res == RESULT_OK && uri != null && pendingExport != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(pendingExport);
                    os.close();
                    ok = true;
                } catch (Throwable ignored) {
                }
            }
            pendingExport = null;
            callback(pendingExportCb, ok, null);
        } else if (req == REQ_IMPORT) {
            String b64 = null;
            if (res == RESULT_OK && uri != null) {
                try {
                    InputStream is = getContentResolver().openInputStream(uri);
                    byte[] bytes = readAll(is);
                    is.close();
                    b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                } catch (Throwable ignored) {
                }
            }
            callback(pendingImportCb, b64 != null, b64);
        }
    }

    static byte[] readAll(InputStream is) throws java.io.IOException {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[65536];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return bo.toByteArray();
    }

    class Bridge {
        @JavascriptInterface
        public void exportFile(final String name, String b64, final String mime, final int cbId) {
            pendingExport = Base64.decode(b64, Base64.DEFAULT);
            pendingExportCb = cbId;
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_EXPORT);
                    } catch (Throwable t) {
                        callback(cbId, false, null);
                    }
                }
            });
        }

        @JavascriptInterface
        public void importFile(String accept, final int cbId) {
            pendingImportCb = cbId;
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    try {
                        startActivityForResult(i, REQ_IMPORT);
                    } catch (Throwable t) {
                        callback(cbId, false, null);
                    }
                }
            });
        }

        @JavascriptInterface
        public void share(final String title, final String text) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_SUBJECT, title);
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    try {
                        startActivity(Intent.createChooser(i, title));
                    } catch (Throwable ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 500)));
            } catch (Throwable ignored) {
            }
        }

        @JavascriptInterface
        public void setImmersive(final boolean on) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    immersive = on;
                    applyImmersive();
                }
            });
        }

        @JavascriptInterface
        public void exitApp() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    finish();
                }
            });
        }

        @JavascriptInterface
        public String deviceInfo() {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(mi);
            int cores = Runtime.getRuntime().availableProcessors();
            float d = getResources().getDisplayMetrics().density;
            int[] ins = insets();
            return "{\"memMb\":" + (mi.totalMem / (1024 * 1024)) + ",\"cores\":" + cores + ",\"sdk\":" + Build.VERSION.SDK_INT
                + ",\"lowRam\":" + am.isLowRamDevice() + ",\"heapMb\":" + am.getLargeMemoryClass()
                + ",\"safe\":[" + (ins[0] / d) + "," + (ins[1] / d) + "," + (ins[2] / d) + "," + (ins[3] / d) + "]}";
        }

        @JavascriptInterface
        public String insetsJson() {
            float d = getResources().getDisplayMetrics().density;
            int[] ins = insets();
            return "[" + (ins[0] / d) + "," + (ins[1] / d) + "," + (ins[2] / d) + "," + (ins[3] / d) + "]";
        }
    }

    int[] insets() {
        int[] r = new int[] {0, 0, 0, 0};
        if (Build.VERSION.SDK_INT < 28 || web == null) return r;
        try {
            WindowInsets wi = web.getRootWindowInsets();
            if (wi == null) return r;
            Object cut = wi.getClass().getMethod("getDisplayCutout").invoke(wi);
            if (cut == null) return r;
            r[0] = (Integer) cut.getClass().getMethod("getSafeInsetTop").invoke(cut);
            r[1] = (Integer) cut.getClass().getMethod("getSafeInsetRight").invoke(cut);
            r[2] = (Integer) cut.getClass().getMethod("getSafeInsetBottom").invoke(cut);
            r[3] = (Integer) cut.getClass().getMethod("getSafeInsetLeft").invoke(cut);
        } catch (Throwable ignored) {
        }
        return r;
    }

    static class AssetClient extends WebViewClient {
        final AssetManager assets;
        static final Map<String, String> MIME = new HashMap<String, String>();

        static {
            MIME.put("html", "text/html");
            MIME.put("js", "text/javascript");
            MIME.put("mjs", "text/javascript");
            MIME.put("css", "text/css");
            MIME.put("json", "application/json");
            MIME.put("png", "image/png");
            MIME.put("jpg", "image/jpeg");
            MIME.put("svg", "image/svg+xml");
            MIME.put("ogg", "audio/ogg");
            MIME.put("mp3", "audio/mpeg");
            MIME.put("wav", "audio/wav");
            MIME.put("woff2", "font/woff2");
            MIME.put("ttf", "font/ttf");
            MIME.put("wasm", "application/wasm");
            MIME.put("txt", "text/plain");
        }

        AssetClient(AssetManager a) {
            assets = a;
        }

        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return !HOST.equals(req.getUrl().getHost());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return !HOST.equals(Uri.parse(url).getHost());
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!HOST.equals(u.getHost())) {
                return new WebResourceResponse("text/plain", "utf-8", 403, "Offline", new HashMap<String, String>(), null);
            }
            String path = u.getPath();
            if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
            String ext = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
            String mime = MIME.get(ext);
            if (mime == null) mime = "application/octet-stream";
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            try {
                InputStream is = assets.open("web" + path, AssetManager.ACCESS_STREAMING);
                String enc = mime.startsWith("text/") || mime.equals("application/json") ? "utf-8" : null;
                return new WebResourceResponse(mime, enc, 200, "OK", headers, is);
            } catch (Throwable t) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, null);
            }
        }
    }
}
