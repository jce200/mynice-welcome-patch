#!/bin/bash
# Builds the patched MyNice Welcome (build "nx13") from YOUR copy of the ORIGINAL APK (version 2.2.0).
#
#   ./get-tools.sh                              (once: downloads apktool and friends into ./tools, checked on SHA-256)
#   ./build.sh <original.apk> [output-dir]      (default output: ./out)
#
# Requires (see README.md): java and javac (JDK 17+), keytool (part of the JDK), python3, bash. For the check at the end you can
# add a Python with androguard and loguru (pip install androguard loguru); without them that step is skipped.
#
# The APK is signed with your own key in ./keys/ (listed in .gitignore). If there is no key yet, this script creates one with a
# random password (./keys/password.txt). Keep that folder safe and never share it: whoever has it can build an APK that installs
# over your installed app. ALWAYS use the same key for later versions, otherwise Android cannot install the new version over the
# old one and the app's data (the pairing with your accessory) is lost.
# Own key or another password:  KS=/path/to/key.jks KSPASS=password ./build.sh ...
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ORIGINAL="${1:?give the path to the original MyNiceWelcome 2.2.0 APK (README.md explains where to get it)}"
OUT="${2:-$HERE/out}"
TOOLS="${TOOLS:-$HERE/tools}"
PY="${PY:-python3}"
PYVENV="${PYVENV:-$HERE/venv/bin/python}"
[ -x "$PYVENV" ] || PYVENV="$PY"
KS="${KS:-$HERE/keys/mynice.jks}"
export JAVA_TOOL_OPTIONS=""

for t in apktool.jar uber-signer.jar android-all-10.jar dalvik-dx.jar; do
  [ -f "$TOOLS/$t" ] || { echo "missing: $TOOLS/$t  (run ./get-tools.sh first)" >&2; exit 1; }
done
[ -f "$ORIGINAL" ] || { echo "file not found: $ORIGINAL" >&2; exit 1; }

# the output folder is emptied: only do that if it is new or comes from an earlier build
if [ -e "$OUT" ] && [ -n "$(ls -A "$OUT" 2>/dev/null)" ] && [ ! -f "$OUT/.mynice-build" ]; then
  echo "$OUT already exists and is not from an earlier build; choose another output folder" >&2
  exit 1
fi

# --- key
if [ -z "${KSPASS:-}" ] && [ -f "$(dirname "$KS")/password.txt" ]; then KSPASS="$(cat "$(dirname "$KS")/password.txt")"; fi
if [ ! -f "$KS" ]; then
  echo "== no key yet: creating a new one in $KS"
  mkdir -p "$(dirname "$KS")"
  KSPASS="${KSPASS:-$("$PY" -c 'import secrets; print(secrets.token_hex(16))')}"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -alias mynice -keyalg RSA -keysize 3072 -validity 36500 \
    -storepass "$KSPASS" -keypass "$KSPASS" -dname "CN=MyNice patch (own key)" >/dev/null 2>&1
  ( umask 077; printf '%s' "$KSPASS" > "$(dirname "$KS")/password.txt" )
  echo "   Keep the folder $(dirname "$KS") safe (don't share it, don't commit it): without this key you cannot install an update over this version later."
fi
: "${KSPASS:?no password for $KS: set KSPASS=... or put it in $(dirname "$KS")/password.txt}"

rm -rf "$OUT"; mkdir -p "$OUT"; touch "$OUT/.mynice-build"
echo "== 1/7 unpacking"
java -jar "$TOOLS/apktool.jar" d -f "$ORIGINAL" -o "$OUT/app" >/dev/null

echo "== 2/7 smali and JS patches"
for s in patch-01-wifi-binding.py patch-02-already-connected.py patch-03-home-network-and-log.py patch-04-continue-after-discovery.py \
         patch-05-native-hooks.py patch-06-js-layer.py patch-07-vpn-binding.py patch-08-route-choice.py patch-09-socket-fallback.py patch-10-skin.py patch-11-checking-state.py patch-12-extra-commands.py patch-13-theme.py; do
  "$PY" -I "$HERE/$s" "$OUT/app"
done

echo "== 3/7 native layer (Java -> classes2.dex)"
TOOLS="$TOOLS" "$HERE/build-java.sh" "$HERE/java/out" >/dev/null

echo "== 4/7 assembling the APK"
java -jar "$TOOLS/apktool.jar" b "$OUT/app" -o "$OUT/without-dex.apk" 2>&1 | grep -v '^I: ' || true
"$PY" -I "$HERE/add-dex.py" "$OUT/without-dex.apk" "$HERE/java/out/classes2.dex" "$OUT/unsigned.apk"

echo "== 5/7 aligning and signing"
java -jar "$TOOLS/uber-signer.jar" -a "$OUT/unsigned.apk" --ks "$KS" --ksAlias mynice \
  --ksPass "$KSPASS" --ksKeyPass "$KSPASS" -o "$OUT/signed" --allowResign | grep -E "verified|Successfully" || true
[ -f "$OUT/signed/unsigned-aligned-signed.apk" ] || { echo "signing failed (is the password of $KS correct?)" >&2; exit 1; }
cp "$OUT/signed/unsigned-aligned-signed.apk" "$OUT/MyNiceWelcome_2.2.0_nx13.apk"

echo "== 6/7 checking the APK"
if "$PYVENV" -c "import androguard, loguru" 2>/dev/null; then
  "$PYVENV" -I "$HERE/verify-apk.py" "$OUT/MyNiceWelcome_2.2.0_nx13.apk" 2>&1 | grep -v '^$'
else
  echo "   skipped: androguard and loguru are not installed (pip install androguard loguru)"
fi

echo "== 7/7 done: $OUT/MyNiceWelcome_2.2.0_nx13.apk"
