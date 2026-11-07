#!/bin/bash
# Downloads the four tools the build needs into ./tools and checks each on SHA-256 (the values below belong to the versions this
# project was built and tested with). Nothing else is downloaded and nothing is installed.
#
#   apktool 2.10.0            Apache-2.0   github.com/iBotPeaches/Apktool          (unpack and reassemble the APK)
#   uber-apk-signer 1.3.0     Apache-2.0   github.com/patrickfav/uber-apk-signer   (align and sign)
#   dalvik-dx 11.0.0_r3       Apache-2.0   Maven Central (JakeWharton repackaged)  (Java classes -> classes2.dex)
#   android-all 10            Apache-2.0   Maven Central (Robolectric)             (Android 10 API to compile and test against)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="${TOOLS:-$HERE/tools}"
mkdir -p "$TOOLS"

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }
# fetch NAME SHA256 URL [URL...]: tries the addresses in turn (a mirror if the first refuses, for example because of a rate limit)
fetch() {
  local name="$1" expected="$2" target="$TOOLS/$1"; shift 2
  if [ -f "$target" ] && [ "$(sha "$target")" = "$expected" ]; then echo "already present and fine: $name"; return; fi
  local url got
  for url in "$@"; do
    echo "downloading $name  ($url)"
    if curl -fsSL --retry 2 --retry-delay 5 -o "$target.part" "$url"; then
      got="$(sha "$target.part")"
      if [ "$got" = "$expected" ]; then mv "$target.part" "$target"; return; fi
      echo "  SHA-256 does not match (expected $expected, got $got): not used" >&2
    fi
    rm -f "$target.part"
  done
  echo "$name could not be fetched with a matching SHA-256" >&2
  exit 1
}

fetch apktool.jar      c0350abbab5314248dfe2ee0c907def4edd14f6faef1f5d372d3d4abd28f0431 \
  "https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar"
fetch uber-signer.jar  e1299fd6fcf4da527dd53735b56127e8ea922a321128123b9c32d619bba1d835 \
  "https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar"
fetch dalvik-dx.jar    37581a56fded15ec6f88b46d3c7704cc700a3371f9e75f41b2121e3287769ba9 \
  "https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/11.0.0_r3/dalvik-dx-11.0.0_r3.jar" \
  "https://repo.maven.apache.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/11.0.0_r3/dalvik-dx-11.0.0_r3.jar"
fetch android-all-10.jar a0ad701eedd47bdaefbac1c2cc80dd400c0adea3cccd8a3ad286f79da1ca294c \
  "https://repo1.maven.org/maven2/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar" \
  "https://repo.maven.apache.org/maven2/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar"
echo "done: $TOOLS"
