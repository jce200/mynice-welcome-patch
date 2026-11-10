#!/bin/bash
# Runs all tests that work without a phone:
#   skin     static check of the CSS (node)
#   masker   masking of passwords in the LOG panel (node)
#   debuglog the Debug log sheet: build, open and close, Copy, Clear (node + jsdom)
#   jsdom    nx-patch.js in a simulated Angular/Cordova environment (node + jsdom: npm install)
#   activity nx-activity.js: the statistics from the accessory's event log (node), and its sheet (jsdom)
#   brand    patch-16-brand.py on an invented logo: the icon, the small icon and the splash screens it makes (node + python3)
#   gallery  nx-gallery.js (Settings > Design, the page of Material 3 Expressive) in jsdom, and patch-17-gallery.py on an invented app tree
#   copy     patch-21-copy.py on an invented app tree (the English wording of the original app)
#   nx23-*   one test file per workstream of nx23
#   java     the logic of the native layer on a plain JVM, against android-all-10 (run ./get-tools.sh first)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="${TOOLS:-$HERE/tools}"
export JAVA_TOOL_OPTIONS=""
failed=0
cd "$HERE"

echo "== skin";   node test/skin.test.js   | tail -1 || failed=1
echo "== masker"; node test/masker.test.js | tail -1 || failed=1
echo "== debuglog (the Debug log sheet)"; node test/debuglog.test.js | tail -1 || failed=1       # without jsdom it says that it is skipped
echo "== jsdom (nx-patch.js)"
if node -e "require('jsdom')" 2>/dev/null; then
  node test/nxpatch.test.js | tail -1 || failed=1
else
  echo "   skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom)"
fi
echo "== activity (nx-activity.js)"
node test/activity.test.js | tail -1 || failed=1     # without jsdom it tests the statistics only and says so
echo "== brand (the icon and the splash screen)"
node test/brand.test.js | tail -1 || failed=1
echo "== gallery (Settings > Design)"
node test/gallery.test.js | tail -1 || failed=1       # without jsdom it says that it is skipped
echo "== copy (patch-21-copy.py: the English wording of the original app)"
node test/copy.test.js | tail -1 || failed=1
for t in test/nx23-*.test.js; do
  [ -f "$t" ] || continue
  echo "== $(basename "$t" .test.js)"
  node "$t" | tail -1 || failed=1
done
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
