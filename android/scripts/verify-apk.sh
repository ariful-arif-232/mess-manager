#!/usr/bin/env bash
# Post-build gate on a built APK. Every check here exists because it caught a
# real crash on a real device; a clean "BUILD SUCCESSFUL" caught none of them.
#
# Usage: verify-apk.sh <path-to-apk>
set -euo pipefail

APK="${1:?usage: verify-apk.sh <apk>}"
AAPT2=$(find "${ANDROID_HOME:?ANDROID_HOME not set}" -iname aapt2 -type f | sort -V | tail -1)
[ -n "$AAPT2" ] || { echo "::error::aapt2 not found under ANDROID_HOME"; exit 1; }

echo "Verifying: $APK"
echo "Using:     $AAPT2"

MANIFEST=$("$AAPT2" dump xmltree "$APK" --file AndroidManifest.xml)
RESOURCES=$("$AAPT2" dump resources "$APK")
PKG=$("$AAPT2" dump badging "$APK" | sed -n "s/^package: name='\([^']*\)'.*/\1/p")
[ -n "$PKG" ] || { echo "::error::could not read package name"; exit 1; }
echo "Package:   $PKG"
FAIL=0

# ---------------------------------------------------------------------------
# 1. FileProvider authority: the <provider> declaration and the meta-data the
#    library reads must name the SAME authority, or getUriForFile can't resolve.
# ---------------------------------------------------------------------------
PROVIDER_AUTH=$(echo "$MANIFEST" | grep -o 'authorities([^)]*)="[^"]*"' | head -1 | sed 's/.*="\(.*\)"/\1/')
META_AUTH=$(echo "$MANIFEST" \
  | grep -A2 'FILE_PROVIDER_AUTHORITY' \
  | grep -o 'value([^)]*)="[^"]*"' | head -1 | sed 's/.*="\(.*\)"/\1/')
echo
echo "FileProvider <provider> authority : ${PROVIDER_AUTH:-<none>}"
echo "FILE_PROVIDER_AUTHORITY meta-data : ${META_AUTH:-<none>}"
if [ -z "$PROVIDER_AUTH" ] || [ "$PROVIDER_AUTH" != "$META_AUTH" ]; then
  echo "::error::FileProvider authority mismatch (provider='$PROVIDER_AUTH' meta-data='$META_AUTH')"
  FAIL=1
else
  echo "PASS: authorities match"
fi

# ---------------------------------------------------------------------------
# 2. The FileProvider <paths> must cover the exact file the TWA splash
#    transfer hands to getUriForFile at runtime. FileProvider's
#    SimplePathStrategy resolves a file only if a configured root is a path
#    prefix of it, so reproduce that prefix test here.
#      <files-path path="P"/>  =>  root = getFilesDir()/P
#                              =>  /data/data/<pkg>/files/P
# ---------------------------------------------------------------------------
RUNTIME_FILE="/data/data/$PKG/files/twa_splash/splash_image.png"
FP_RES=$(echo "$RESOURCES" | grep -A2 "xml/filepaths" | grep -oE "res/[A-Za-z0-9_.-]+\.xml" | head -1)
echo
if [ -z "$FP_RES" ]; then
  echo "::error::xml/filepaths resource not found in the APK"
  FAIL=1
else
  echo "filepaths resource: $FP_RES"
  FP_TREE=$("$AAPT2" dump xmltree "$APK" --file "$FP_RES")
  echo "$FP_TREE"
  COVERED=0
  # every <files-path path="..."> becomes a candidate root
  while IFS= read -r P; do
    ROOT="/data/data/$PKG/files/${P#/}"
    case "$ROOT" in */) ;; *) ROOT="$ROOT/";; esac
    echo "  candidate root: $ROOT"
    case "$RUNTIME_FILE" in
      "$ROOT"*) echo "    covers $RUNTIME_FILE"; COVERED=1;;
    esac
  done < <(echo "$FP_TREE" | awk '/E: files-path/{f=1;next} f&&/A: path=/{match($0,/path="[^"]*"/); print substr($0,RSTART+6,RLENGTH-7); f=0}')

  if [ "$COVERED" = "1" ]; then
    echo "PASS: a configured <files-path> root contains $RUNTIME_FILE"
  else
    echo "::error::No configured FileProvider root contains $RUNTIME_FILE — TrustedWebUtils.transferSplashImage will throw IllegalArgumentException at launch"
    FAIL=1
  fi
fi

# ---------------------------------------------------------------------------
# 3. Regression guard (v1.0.3): the splash window background must stay a plain
#    colour. A <bitmap> drawable whose src resolved to the adaptive-icon XML
#    crashed LauncherActivity.onCreate.
# ---------------------------------------------------------------------------
echo
if echo "$RESOURCES" | grep -q "drawable/splash "; then
  echo "::error::a drawable named 'splash' is back; windowBackground must stay a colour"
  FAIL=1
else
  echo "PASS: no drawable/splash"
  echo "$RESOURCES" | grep -A2 "style/Theme.SplashScreen" || true
fi

# ---------------------------------------------------------------------------
# 4. Regression guard (v1.0.4): every component the library toggles with
#    setComponentEnabledSetting must be declared, or that call throws.
# ---------------------------------------------------------------------------
echo
if echo "$MANIFEST" | grep -q "ManageDataLauncherActivity"; then
  echo "PASS: ManageDataLauncherActivity declared"
else
  echo "::error::ManageDataLauncherActivity is not declared in the APK manifest"
  FAIL=1
fi

echo
[ "$FAIL" = "0" ] || { echo "APK VERIFICATION FAILED"; exit 1; }
echo "APK VERIFICATION PASSED"
