package com.suez.gateway

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var assetLoader: WebViewAssetLoader

    private val siteUrl: String = BuildConfig.SITE_URL
    private val siteHost: String? = if (siteUrl.isNotEmpty()) Uri.parse(siteUrl).host else null
    private var usingBundledCopy = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/site/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }
            webViewClient = SuezClient()
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 8)
            max = 100
            visibility = View.GONE
        }

        setContentView(FrameLayout(this).apply {
            addView(webView)
            addView(progressBar)
        })

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else if (siteUrl.isNotEmpty()) {
            webView.loadUrl(siteUrl)
        } else {
            loadBundledCopy()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    private fun loadBundledCopy() {
        usingBundledCopy = true
        webView.loadUrl("https://$ASSET_HOST/site/index.html")
    }

    private fun openExternally(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: ActivityNotFoundException) {
            // No app can handle this link; ignore.
        }
    }

    private inner class SuezClient : WebViewClient() {

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest
        ): WebResourceResponse? {
            val uri = request.url
            if (uri.host != ASSET_HOST) return null

            // The AI/voice backend lives on Netlify and cannot be reached from the bundled copy.
            val path = uri.path.orEmpty()
            if (path.startsWith("/.netlify/functions/")) {
                return if (path.endsWith("/speech")) {
                    // 404 makes the page fall back to the phone's built-in voices.
                    jsonResponse(404, "Not Found", """{"error":{"code":"not_found","message":"unavailable"}}""")
                } else {
                    jsonResponse(
                        503, "Service Unavailable",
                        """{"error":{"code":"offline","message":"المساعد الذكي يتطلب الاتصال بالإنترنت وإعداد خادم الموقع."}}"""
                    )
                }
            }
            return assetLoader.shouldInterceptRequest(uri)
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val host = uri.host
            if (host == ASSET_HOST || (siteHost != null && host == siteHost)) return false
            openExternally(uri)
            return true
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            progressBar.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String?) {
            progressBar.visibility = View.GONE
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            // Live site unreachable (offline etc.): show the bundled copy instead.
            if (request.isForMainFrame && siteUrl.isNotEmpty() && !usingBundledCopy) {
                loadBundledCopy()
            }
        }
    }

    private fun jsonResponse(status: Int, reason: String, body: String) = WebResourceResponse(
        "application/json", "UTF-8", status, reason,
        mapOf("Cache-Control" to "no-store"),
        ByteArrayInputStream(body.toByteArray(Charsets.UTF_8))
    )

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
    }
}
