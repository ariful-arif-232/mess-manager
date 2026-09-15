# Mess Manager — Android app (Trusted Web Activity)

This wraps the existing PWA at https://mess-manager.app in a Trusted Web
Activity (TWA). A TWA is a full-screen Chrome tab with **no address bar, no
browser toolbar**, running the exact same Chrome engine, cookie jar,
`localStorage`, and service worker as the regular browser — so login
sessions and site behavior are unchanged from the website. The back button
navigates the page's history (Custom Tabs handles this automatically) and
closes the app when there's no more history to go back to.

No custom Java/Kotlin code is needed: the whole wrapper is
`com.google.androidbrowserhelper.trusted.LauncherActivity`, configured
entirely through `AndroidManifest.xml` metadata (Google's official,
Bubblewrap-equivalent approach).

## Why the Chrome bar might currently show up

Chrome only removes the toolbar for a TWA once it has verified — via
[Digital Asset Links](https://developers.google.com/digital-asset-links) —
that the app and the website are owned by the same party. That's the
`/.well-known/assetlinks.json` file at the repo root, which must:

1. List the app's `package_name` (`app.messmanager.twa`).
2. List the **SHA-256 certificate fingerprint** of the exact keystore used
   to sign the installed APK.

If the fingerprint doesn't match the APK's actual signing key, verification
silently fails and Chrome falls back to showing the URL bar. **This means
whichever keystore you use to sign the release APK, its SHA-256 fingerprint
must exactly match what's published in `assetlinks.json`.**

## One-time setup

### 1. Generate a release keystore (or reuse the one already generated)

A release keystore was generated for you as part of this change (see the
message where these files were delivered) — do not lose it, you'll need the
exact same one for every future update, or Google Play / users' installs
will reject the new APK as a different app.

To generate your own instead:

```bash
keytool -genkeypair -v -keystore release.keystore -alias messmanager \
  -keyalg RSA -keysize 2048 -validity 10000
```

Get its SHA-256 fingerprint:

```bash
keytool -list -v -keystore release.keystore -alias messmanager
```

### 2. Update `.well-known/assetlinks.json`

Put that SHA-256 fingerprint (colon-separated hex, as printed by keytool)
into `sha256_cert_fingerprints` in `/.well-known/assetlinks.json` at the
repo root, then deploy the website so it's served at
`https://mess-manager.app/.well-known/assetlinks.json` with
`Content-Type: application/json`. GitHub Pages serves `.well-known` files
by default.

Verify after deploying:

```bash
curl -s https://mess-manager.app/.well-known/assetlinks.json
```

Or check it with Google's tool:
`https://developers.google.com/digital-asset-links/tools/generator`

### 3. Add GitHub Actions secrets

This repo can't build/sign Android APKs itself (no Android SDK, and
Google's Maven/SDK distribution host is network-blocked here), so building
happens in GitHub Actions, which has full internet access. In
**Settings → Secrets and variables → Actions**, add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.keystore` output |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `messmanager` (or your alias) |
| `ANDROID_KEY_PASSWORD` | the key password |

### 4. Build the release APK

Push a tag to build and attach the APK to a GitHub Release automatically:

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

Or run the **Android Release APK** workflow manually from the Actions tab
(`workflow_dispatch`) to just build the APK as a downloadable artifact
without creating a release.

## Local build (if you have Android Studio / the SDK installed)

```bash
cd android
echo "storeFile=/path/to/release.keystore
storePassword=...
keyAlias=messmanager
keyPassword=..." > keystore.properties
./gradlew :app:assembleRelease
```

The signed APK lands at `app/build/outputs/apk/release/app-release.apk`.

## Files

* `app/src/main/AndroidManifest.xml` — the whole TWA configuration
  (launch URL, verified domain, colors, splash).
* `app/src/main/res/values/strings.xml` — launch URL, verified host, and
  the Digital Asset Links statement embedded in the APK.
* `app/build.gradle` — app id `app.messmanager.twa`, signing config read
  from `keystore.properties` (gitignored).
