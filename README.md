# Suez Android app

Android (WebView) wrapper for the Suez industrial & economic website. The site is bundled
inside the app (`app/src/main/assets/site`), so the pages work without a server.

## Get the APK (no Android Studio needed)
1. Create a new GitHub repository and upload everything in this folder (keep the `.github` folder).
2. Open the **Actions** tab -> **Build APK** -> wait ~3 minutes.
3. Open the finished run -> **Artifacts** -> download `suez-app-apk`, unzip, copy `app-debug.apk` to your phone and install it (allow "install unknown apps").

## Or build with Android Studio
Open this folder, wait for Gradle sync, then **Build > Build APK(s)**.
Output: `app/build/outputs/apk/debug/app-debug.apk`.

## AI assistant
The assistant needs your Netlify backend (see `AI-SETUP.md` in your original site).
After deploying it, set in `gradle.properties`:

    siteUrl=https://your-site.netlify.app

and rebuild. The app then opens the live site (assistant + voice work) and falls back to the
bundled copy when offline. With `siteUrl` empty, the app is fully offline and the assistant shows a message that it is unavailable.
