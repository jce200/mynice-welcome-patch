# Screenshot harness (optional)

Runs the real app, unpacked from an APK, in headless Chromium with a simulated Cordova bridge (`shim.js`) and takes screenshots of any
page. This is how the look was checked without a phone. It needs Node with `playwright` (and Python with PIL for `sweep.sh`).

```
unzip -o MyNiceWelcome_2.2.0_nx14.apk "assets/www/*" -d tmp && mv tmp/assets/www harness/www
cd harness
node screens.cjs my-folder '#/tabs/favorites' '#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC'   # -> shots/my-folder/*.png
COLOR_SCHEME=dark node screens.cjs ...            # dark mode
PRE='NX.open()' PREWAIT=2500 node screens.cjs ...        # run something first, e.g. open the status sheet (NX.diagnose() also runs the diagnosis)
CFG='{"net":{...},"verifyFail":true}' node screens.cjs ...   # another network state (see shim.js)
CFG='{"secondary":["MDBk","MDEw","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]}' node screens.cjs ...   # nx12: what the accessory offers
                                                   # ("secondary"), the switch "enable the optional command" ("fourth") and the ticked extras ("quick")
CFG='{"waiting":[{"id":2,"username":"Home assistant"}],"approveError":4}' SCRIPT=steps-approve.cjs node screens.cjs approve '#/tabs/favorites'
                                                   # nx13: a user waits for approval (the popup), and approving fails with code 4 (leave approveError out: it works)
CFG='{"activity":"error"}' SCRIPT=steps-activity.cjs node screens.cjs act '#/tabs/favorites'
                                                   # nx14: the activity sheet. "activity": "none" (empty log), "error" (reading fails), "slow" (answers after 4 s);
                                                   # "logs": a log of your own ({ interfaceLogs, deviceLogs }); the default is a made-up log of 12 days
VIEW=360x640 node screens.cjs ...                  # another window size, in CSS pixels (default 412x915)
SCRIPT=steps.cjs node screens.cjs name '#/...'     # steps.cjs: module.exports = async (page, { goto, wait, shot }) => { ... }, e.g. to tap
                                                   # (use page.locator(...).tap(): Ionic ignores a synthetic click())
./sweep.sh name                                    # 25 pages and a contact sheet
python3 make-screenshots.py                        # redoes the pictures in ../docs/screenshots (README)
```

The data in `shim.js` is made up (module `AABBCC`, Wi-Fi `HomeWifi`). It shows how the app *looks*, not how it behaves on a real
network.
