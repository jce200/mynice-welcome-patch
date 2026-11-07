#!/bin/bash
# Compiles the Java layer (com.nice.patch) against an Android library and stubs of the app's and Cordova's classes, and converts
# only our own classes to classes2.dex. The stubs do NOT go into the dex: at run time the app uses its own real classes.
#
# Requires: a JDK (javac), android-all-10.jar and dalvik-dx.jar (./get-tools.sh downloads them into ./tools).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="${TOOLS:-$HERE/tools}"
ANDROID_JAR="${ANDROID_JAR:-$TOOLS/android-all-10.jar}"
DX_JAR="${DX_JAR:-$TOOLS/dalvik-dx.jar}"
OUT="${1:-$HERE/java/out}"

rm -rf "$OUT"; mkdir -p "$OUT/stubs" "$OUT/classes"
export JAVA_TOOL_OPTIONS=""   # proxy options of the environment are not needed here

javac --release 8 -Xlint:-options -cp "$ANDROID_JAR" -d "$OUT/stubs" $(find "$HERE/java/stubs" -name '*.java')
javac --release 8 -Xlint:all,-options,-deprecation -cp "$ANDROID_JAR:$OUT/stubs" -d "$OUT/classes" $(find "$HERE/java/src" -name '*.java')

# dx 1.x can read Java 8 class files; no lambdas or default methods are used.
java -cp "$DX_JAR" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$OUT/classes2.dex" "$OUT/classes"
ls -la "$OUT/classes2.dex"
