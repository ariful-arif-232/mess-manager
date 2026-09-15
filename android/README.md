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

## Why `minifyEnabled`/`shrinkResources` are off

They were briefly on and shipped in the `android-v1.0.0` release, which
installed but failed to launch. R8 has a well-documented history of
breaking `androidx.browser`'s Custom Tabs binding at runtime — that code
talks to Chrome over AIDL/Binder, resolved via reflection R8's static
analysis doesn't fully see, so it can silently strip or rename what it
can't trace. The build itself succeeds and prints no warning; the app just
crashes on launch. Since this project has no custom Kotlin/Java code (it's
~100% the `androidbrowserhelper` library), there's negligible size to save
by minifying, so it's left off rather than chasing a complete keep-rule
set. If you ever turn it back on, `proguard-rules.pro` keeps the full
`com.google.androidbrowserhelper.**` and `androidx.browser.**` surface,
not just their `.trusted` sub-packages — but test an install on a real
device before shipping, since a clean `BUILD SUCCESSFUL` does not prove
the APK actually launches.

## Why `FALLBACK_STRATEGY` is set to `webview`

Even after the R8 fix above, `android-v1.0.1` still crashed on launch on a
Xiaomi/MIUI device ("Mess Manager keeps stopping"). Investigated with real
evidence rather than another guess: fetched `androidbrowserhelper 2.7.3`'s
own published POM in CI and confirmed this project's pinned
`androidx.browser`/`androidx.appcompat` versions exactly match what the
library itself declares (no version skew), and dumped the *compiled*
manifest out of the actual built APK via `aapt2` — structurally correct,
matching the source XML exactly. Both ruled out.

What was missing: `LauncherActivity` binds to Chrome's Custom Tabs service
to render the TWA; on a device where that bind fails — Chrome not set as
default, disabled, or, as on many MIUI builds, the bind blocked outright —
there was no configured fallback, which is a documented crash source for
this library. Adding `android.support.customtabs.trusted.FALLBACK_STRATEGY`
= `webview` makes it degrade to an in-app WebView instead, which only needs
the system WebView component present on every real Android device. This
alone explains why the crash recurred identically across `1.0.0` and
`1.0.1`: the gap existed in both, untouched by the R8 fix.

## The actual launch crash, from a real device log (fixed in 1.0.3)

`android-v1.0.2` still crashed — but this time the user pulled the real
stack trace off the device via Android's crash dialog, which made this one
conclusive instead of another educated guess:

```
Caused by: android.content.res.Resources$NotFoundException: Drawable
app.messmanager.twa:drawable/splash with resource ID #0x7f07006b
Caused by: org.xmlpull.v1.XmlPullParserException: Binary XML file line #7:
<bitmap> requires a valid 'src' attribute
  at ... LauncherActivity.onCreate(LauncherActivity.java:136)
```

The crash happens in `LauncherActivity.onCreate()` before the TWA even
starts loading — inflating `Theme.SplashScreen`'s `windowBackground`, which
was `@drawable/splash`, a layer-list with `<bitmap android:src="@mipmap/
ic_launcher">`. On API 26+ (every real device in the field, MIUI included),
`@mipmap/ic_launcher` resolves to the *adaptive-icon* XML
(`mipmap-anydpi-v26/ic_launcher.xml`), not a raw bitmap — and a `<bitmap>`
tag can't inflate an adaptive icon as its `src`. This is unrelated to
Custom Tabs, R8, or MIUI's browser handling; it's a plain resource-type
mismatch that would crash on *any* Android 8.0+ device, every time.

Fixed by removing the custom `<bitmap>` drawable entirely:
`Theme.SplashScreen`'s `windowBackground` is now a direct `@color`
reference (can't hit this failure mode — there's no drawable to inflate),
and the TWA's own `SPLASH_IMAGE_DRAWABLE` meta-data now points at
`app/src/main/res/drawable/splash_icon.png`, a plain non-adaptive PNG,
instead of the same ambiguous `@mipmap/ic_launcher` reference. `android:icon`
/ `android:roundIcon` on the `<application>` tag are untouched — adaptive
icons are exactly what those attributes are for; the bug was only ever in
using that resource as a raw bitmap `src`.

## Verifying Digital Asset Links end-to-end

The `.github/workflows/verify-android-assetlinks.yml` workflow (manual
`workflow_dispatch`) checks that `.well-known/assetlinks.json` is live at
the expected URL, matches the copy in this repo, and — via Google's own
`digitalassetlinks.googleapis.com` API — actually passes verification for
this app's package name and signing certificate. Run it any time after a
new release or a redeploy of the site.

## Files

* `app/src/main/AndroidManifest.xml` — the whole TWA configuration
  (launch URL, verified domain, colors, splash).
* `app/src/main/res/values/strings.xml` — launch URL, verified host, and
  the Digital Asset Links statement embedded in the APK.
* `app/build.gradle` — app id `app.messmanager.twa`, signing config read
  from `keystore.properties` (gitignored).
