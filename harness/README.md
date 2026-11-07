# Screenshot harness (optional)

Runs the real app, unpacked from an APK, in headless Chromium with a simulated Cordova bridge (`shim.js`) and takes screenshots of any
page. This is how the look was checked without a phone. It needs Node with `playwright` (and Python with PIL for `sweep.sh`).

```
unzip -o MyNiceWelcome_2.2.0_nx11.apk "assets/www/*" -d tmp && mv tmp/assets/www harness/www
cd harness
node screens.cjs my-folder '#/tabs/favorites' '#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC'   # -> shots/my-folder/*.png
COLOR_SCHEME=dark node screens.cjs ...            # dark mode
PRE='NX.open()' PREWAIT=2500 node screens.cjs ...        # run something first, e.g. open the status sheet (NX.diagnose() also runs the diagnosis)
CFG='{"net":{...},"verifyFail":true}' node screens.cjs ...   # another network state (see shim.js)
./sweep.sh name                                    # 25 pages and a contact sheet
python3 make-screenshots.py                        # redoes the pictures in ../docs/screenshots (README)
```

The data in `shim.js` is made up (module `AABBCC`, Wi-Fi `HomeWifi`). It shows how the app *looks*, not how it behaves on a real
network.
