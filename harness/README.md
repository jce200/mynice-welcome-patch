# Screenshot harness (optional)

Runs the real app, unpacked from an APK, in headless Chromium with a simulated Cordova bridge (`shim.js`) and takes screenshots of any
page. This is how the look was checked without a phone. It needs Node with `playwright` (and Python with PIL for `sweep.sh`).

```
unzip -o MyNiceWelcome_2.2.0_nx24.apk "assets/www/*" -d tmp && mv tmp/assets/www harness/www
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
CFG='{"activity":"blocked","state":"opening"}' SCRIPT=steps-state.cjs node screens.cjs state '#/tabs/favorites'
                                                   # nx15: the last thing in the log is an "Open and Block" of 20 minutes ago and the status still says "opening":
                                                   # the screen shows "Open", the note "reported: Opening" and the pill "Blocked"; "state": the status of the accessory
CFG='{"activity":"blocked"}' SCRIPT=steps-follow.cjs node screens.cjs follow '#/tabs/favorites'
                                                   # nx16: the pill and the line follow ANOTHER app: the script puts a Release, a Block and a "Release and Close" into the
                                                   # log of the simulated accessory (window.__extraLogs), sends the Cordova "resume" and a report of the state, and prints
                                                   # what the screen says and how often the log was read. About a minute. FAST=1 and
                                                   # CFG='{"activity":"blocked","activityTimes":{"ResumeMs":500,"PollMs":3000,"MinGapMs":500}}' shorten the waiting times.
                                                   # (A resume must be sent with cordova.fireDocumentEvent('resume'): a plain DOM event does not reach cordova.js's handlers.)
SCRIPT=steps-stale.cjs node screens.cjs stale '#/tabs/favorites'
                                                   # nx17: a Block of this phone from 3 hours ago (localStorage), the accessory restarted an hour ago and forgot its log, then
                                                   # Home Assistant opened the gate and the controller closed it: the pill must be gone (nx16 said "Blocked? since ...").
                                                   # window.__logsOverride in shim.js: the whole log answer, built by the script relative to "now".
CFG='{"verifyScript":["fail","fail","fail","fail","fail","fail","ok"],"verifyDelay":1500}' SCRIPT=steps-connecting.cjs node screens.cjs connecting '#/tabs/favorites'
                                                   # nx18: "Connecting…" while the app tries again: Checking… -> three failures -> Not usable -> the screen is entered again ->
                                                   # Connecting… (and the chip) -> ... -> the state. verifyScript: the outcomes of the successive attempts, verifyDelay: how long one takes
PRE='NxGallery.open()' PREWAIT=2500 node screens.cjs gal '#/tabs/settings/false'
                                                   # nx22: the page Settings > Design (scroll it with PRE='NxGallery.open(); setTimeout(function () { document.querySelector(".nx-gal-scroll").scrollTop =
                                                   # document.getElementById("nx-gal-buttons").offsetTop - 8; }, 800)'; the parts: shapes, motion, buttons, icons, groups, split, fab, progress, sliders, switches,
                                                   # toolbars, lists, type, color). Animations can be paused at a moment of your choice (make-screenshots.py does that for the loading indicator):
                                                   # document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = 900; })
VIEW=360x640 node screens.cjs ...                  # another window size, in CSS pixels (default 412x915)
SCRIPT=steps.cjs node screens.cjs name '#/...'     # steps.cjs: module.exports = async (page, { goto, wait, shot }) => { ... }, e.g. to tap
                                                   # (use page.locator(...).tap(): Ionic ignores a synthetic click())
./sweep.sh name                                    # 25 pages and a contact sheet
python3 make-screenshots.py                        # redoes the pictures in ../docs/screenshots (README)
```

The data in `shim.js` is made up (module `AABBCC`, Wi-Fi `HomeWifi`). It shows how the app *looks*, not how it behaves on a real
network.
