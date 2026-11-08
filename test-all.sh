#!/bin/bash
# Runs all tests that work without a phone:
#   skin     static check of the CSS (node)
#   masker   masking of passwords in the LOG panel (node)
#   jsdom    nx-patch.js in a simulated Angular/Cordova environment (node + jsdom: npm install)
#   activity nx-activity.js: the statistics from the accessory's event log (node), and its sheet (jsdom)
#   java     the logic of the native layer on a plain JVM, against android-all-10 (run ./get-tools.sh first)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="${TOOLS:-$HERE/tools}"
export JAVA_TOOL_OPTIONS=""
failed=0
cd "$HERE"

echo "== skin";   node test/skin.test.js   | tail -1 || failed=1
echo "== masker"; node test/masker.test.js | tail -1 || failed=1
echo "== jsdom (nx-patch.js)"
if node -e "require('jsdom')" 2>/dev/null; then
  node test/nxpatch.test.js | tail -1 || failed=1
else
  echo "   skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom)"
fi
echo "== activity (nx-activity.js)"
node test/activity.test.js | tail -1 || failed=1     # without jsdom it tests the statistics only and says so
echo "== java (native layer)"
if [ -f "$TOOLS/android-all-10.jar" ]; then
  T="$(mktemp -d)"; mkdir -p "$T/stubs" "$T/classes" "$T/test"
  javac --release 8 -Xlint:-options -cp "$TOOLS/android-all-10.jar" -d "$T/stubs" $(find java/stubs -name '*.java') &&
  javac --release 8 -Xlint:-options -cp "$TOOLS/android-all-10.jar:$T/stubs" -d "$T/classes" $(find java/src -name '*.java') 2>/dev/null &&
  javac --release 8 -Xlint:-options -cp "$TOOLS/android-all-10.jar:$T/stubs:$T/classes" -d "$T/test" java/test/com/nice/patch/NxTest.java &&
  java -cp "$TOOLS/android-all-10.jar:$T/stubs:$T/classes:$T/test" com.nice.patch.NxTest | tail -1 || failed=1
  rm -rf "$T"
else
  echo "   skipped: $TOOLS/android-all-10.jar is missing (run ./get-tools.sh)"
fi
[ "$failed" = 0 ] && echo "done" || { echo "SOMETHING FAILED" >&2; exit 1; }
