# Not applied while minifyEnabled is false (see app/build.gradle), kept
# correct in case minification is ever re-enabled. Custom Tabs binds to
# Chrome's service via AIDL/Binder proxies that R8's static analysis can't
# fully trace, so the whole surface needs keeping, not just the "trusted"
# sub-packages.
-keep class com.google.androidbrowserhelper.** { *; }
-keep class androidx.browser.** { *; }
-keep interface androidx.browser.** { *; }
