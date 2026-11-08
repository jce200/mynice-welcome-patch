# Details and history

This is the technical background to the [README.md](../README.md): why every change exists, with the diagnoses that led to them
(nx3 through nx16: the project's build numbers). The example values (Wi-Fi `HomeWifi`, accessory `NiceIT4WIFIAABBCC`, user
`homeuser`) stand in for whatever is different in your case. The data in this document comes from one phone and one IT4WIFI module.

## What is new in nx16 (the pill and the line follow what other apps do with the gate)

nx16 has version code 20201114 and installs over nx15 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-16` as its version). Only `nx-activity.js` changed in the app (and the test harness).

**What was reported.** "Open and Block" in this app, then "Release and Close" in the official MyNice app: the state showed *Closed* (the app asks
the accessory when the screen is shown or resumed), but the pill still said *Blocked · since 12:00* and the line on the screen still said
*Open and Block · just now* two minutes later. Reproduced in the harness with the nx15 file: after the report `closing` of the accessory the
log was not read again (1 reading, pill and line unchanged).

**Why.** The accessory has no state for "blocked", so the only place where a Block or Release shows is its event log, and nx15 read the log only when the
accessory screen was entered (and then only if the last reading was more than 10 minutes old), 3 seconds after a command of this phone, and when
the state was `opening` or `closing`. A report of the state that ends in a final state (`closed`, `open`) planned nothing, and a plain Block or
Release (`MDBm`, `MDEw`) moves nothing, so the accessory reports nothing at all. The line "just now" was also worked out when the log was read and
stayed on the screen as it was.

**What is read now, and when** (all in the background, read-only, the same request as the history page of the app; the times can be set with
`window.__nxActivityPollMs`, `...EventMs`, `...StatusMs`, `...ResumeMs`, `...RetryMs`, `...BackoffMs`, `...MinGapMs`, `...UsersAge`, `...MaxAge`, which the tests use):
- **After a report of the state** (`newDeviceState`, any state): 4 seconds later. The gate moves, so someone gave a command, and the log has it, with a
  Block or Release that came with it ("Release and Close"). Several reports in a row (closing, closed) are one reading. Not while the app is in the background.
- **When the app is asked for the state** (the app does that when the screen is entered, when you swipe to another accessory and when the app
  comes back): 1.5 seconds later, if the last reading is 30 seconds old or older, and only for the accessory whose screen is open.
- **When the app comes back to the front** (Cordova `resume`, or the page becoming visible again): 2 seconds later, unless a reading is less than
  2 seconds old. This is the case of the report: you leave for the official app and come back. When the activity sheet was open it is read again
  instead (it would show what it showed when you left).
- **On a timer, as long as the accessory screen is open:** every 30 seconds. This is the only way to see a plain Block or Release by another
  app or phone while you look at the screen. It is not done while the app is in the background, while the activity sheet is open (it has its own
  *Refresh*), for an accessory that is not reachable, or while the app is still checking the accessory. It stops when the screen is left.
- A reading younger than 5 seconds (2 for coming back) is as good as a new one and is not repeated.
- **Failures** are logged once per run (`activity: could not read the log (poll) {...}`), the reading is tried once more 5 seconds later when it was
  planned by a report, a state request or the return of the app, and the timer waits 2 minutes after a failure; `activity: the log can be read
  again` says when it works. A reading in the background asks for the users (for the names) only when it does not have them from the last 10
  minutes. The LOG gets lines for a reading in the background only when the log has changed (the newest event, the last Block or Release, the health of the module),
  with the reason in brackets: `activity: 85 device events, ... (event)`. A reading that someone asked for (the sheet) always says what it found.
  The line `state: "opening" is out of date ...` is said once per decision (the same movement and the same report), not at every reading.

**Which says it: this phone or the log.** The command that this phone gave is written down at once (the pill must not wait for the log), but the log wins
as soon as it can know better: when it has a newer Block or Release, and also when it was read at least 2 seconds after the command and has a Block or
Release from at most 60 seconds before it or later. The accessory writes a command in its log at once, so such a reading has the command of this
phone in it and the newest Block or Release is the one that counts, also when the clock of the accessory is a few seconds behind the phone's (a Release
from another phone just after the Block would be dated before it). A reading from the same second cannot have the command yet, and a Block or
Release from long before the command (more than a minute) is not the answer to it: this phone counts then. This rests on the accessory logging
every Block and Release (the app has texts for `MDBm` "Block" and `MDEw` "Release" for its history page, and `MDBk` and `MDFh` were seen in a real log); a
plain Block that was never logged would not show.

**The line on the screen** ("Open and Block · just now · Anna") is worked out when it is shown, not when the log was read, so "just now" becomes
"today 12:00" after a minute (at the next screen update, at most 30 seconds later because of the timer).

**What is not known.** All of this was run in the harness (headless Chromium, the real app, a simulated accessory whose log is changed by a script:
`harness/steps-follow.cjs`) and in the tests, not on a real accessory. How quickly the official app's command reaches the log, and whether the
accessory reports a state change for every command of another app, was not measured; the timer is the safety net for that. The timer reads the log
every 30 seconds while you look at the accessory screen: if that ever disturbs the accessory (a slow or unreachable answer), the LOG shows it and
the interval is one number (`POLL_MS`).

Tests: `test/activity.test.js` has 256 checks (196 in nx15; new: a report, the timer, coming back, a state request, failures and the retry, the users,
the LOG lines, and the precedence of this phone and the log, with the case of the report as the first test); the changes were also checked by breaking the
code on purpose (twenty-one changes, each seen by a test). `test/nxpatch.test.js` is unchanged (256).

## What is new in nx15 (blocked, a state that is out of date, and the first corrections from a real log)

nx15 has version code 20201113 and installs over nx14 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-15` as its version).

**What a log from a real accessory showed** (copied from the activity sheet; the names and IDs are left out here):
- The events of the module are written `Power ON`, `T4 device not found` and `T4 device found`, with the source `boot`; an entry has no `idx`.
  nx14 only knew `device not found`, so the row "Gate controller not found" said 0 although the log had one. The app's own history page
  matches a part of the text (`indexOf`), and so does this now.
- The log begins with the start of the accessory (the oldest entry is `Power ON`, some hours before): events are forgotten at a restart.
  The note under the history says so when the oldest entry is a start.
- Every command of a phone is followed within a second by the same movement from `busT4`: `MDFh` ("Release and Close") at 11:40:20 and `close` at
  11:40:21, `MDBk` ("Open and Block") at 10:15:02 and `open` at 10:15:03 (example times). `busT4` is the gate controller on the bus reporting what it does, for
  whatever reason it does it. nx14 counted both and called the second "Automation". Now a movement that `busT4` reports within 5 seconds of a command
  of the same kind (a phone, the schedule, an input) is folded into that command, one repeat per command. What is left of `busT4` is shown as
  "Gate controller": a remote control, a switch, the gate closing by itself, or the controller telling its state when the accessory starts
  (a `stop` right after "T4 device found"). So the line on the screen, the tiles and "who" now name the phone and count once.
- While the accessory starts it cannot see the gate controller yet (`T4 device not found`, a moment later `found`). That is not a fault: a "not found"
  within two minutes after a start is not counted in "Gate controller lost" (the row says "only while the accessory was starting").
- The T4 commands of the phones are in the log, with the phone's controller ID: the Block and Release commands below are built on that.

**Blocked.** The accessory has no property for it (`DoorStatus` and `Obstruct` only; `T4Action` is write-only), so no Nice app shows it. What is
known is the last Block command (`MDBk` Open and Block, `MDBl` Close and Block, `MDBm` Block) or Release command (`MDEw` Release, `MDE5` Release and
Open, `MDFh` Release and Close):
- Commands that this phone gives are written down when they succeed (`nx-patch.js` wraps `executePrimaryCommand` and `executeSecondaryCommand` of the
  app's service and tells `nx-activity.js`; kept in `localStorage` under `nxBlock`, apart from the app's data). The commands of every phone and of
  the schedule are in the log. The newer of the two counts.
- A pill "Blocked · since 09:37" under the state, and a card in the activity sheet (amber, with the command and who). With a question mark
  ("Blocked?") when the accessory has restarted after the last Block command: whether a block survives that is not known. After a Release the
  pill is gone, and the sheet says "Not blocked, as far as the log shows". Without any Block or Release command it says nothing.
- It is the last command and not a measurement, and it does not see a block that was lifted at the gate controller itself (a key switch, another
  device on the bus), or commands that were forgotten at a restart of the accessory. It must not be used as security; the card says so.

**A state that is out of date.** The accessory screen reads the state when it is shown or resumed (`status`) and after that only gets events
(`newDeviceState`); nothing in between (no polling). On a real gate that had been opened with "Open and Block" the screen showed "Opening" while the
gate was open, and the official app showed "Opened". Whether the accessory itself reports "opening" on a status request or the final event went
missing is not known yet, so the LOG now records what it says: `state: status of <mac> says [DoorStatus=..., Obstruct=...]` for every status request,
`state: event <mac> <state>, obstruct <n>` for every event, and once per session what the accessory declares
(`state: the accessory declares services [...] properties [...]`, to see whether there is more than the state and the obstruction).
The safety net, in `nx-activity.js` (`nxState`, `nxIcon`, `nxSettled`, used by `patch-15-state.py` in `device_detail.html`):
- A report of "opening" (or "closing") is shown as open (closed) when the newest event in the log that can have moved or stopped the gate (open, close, stop,
  step by step, block, obstruction; a repeat of the gate controller is folded) is an opening (closing) that is more than 150 seconds old, and the
  log was read after the latest event or command and less than two minutes ago. A stop, a block or an obstruction after it, or a closing after an
  opening, means that nothing is settled.
- The icon follows (the app's own class, `icon-i_gat005 open status-0`), and a small note says what was reported ("reported: Opening").
- The decision is only valid while the report stays the same. An event of the accessory, a command of this phone and a new look at the screen clear it.
  The log is read again 3 seconds after a command (it has the command and the movement within a second, which also makes the line on the screen
  right: in nx14 it stayed on the previous command until the screen was entered again), when the screen is entered with "opening" or "closing", and
  once more after the travel time plus 8 seconds when the gate is still said to move.
- Not tested on a real accessory: how often the accessory reports a stale "opening", and why.

**Small screens.** The extra lines (activity line, note, pill) cost height. The gate icon and the state text shrink in steps below 780, 720, 660 and
620 pixels of height; checked with the harness (`harness/steps-state.cjs`, the worst case: blocked, note, line) at heights from 568 to 915, with
Stop completely in view from 600 pixels up (below that the commands area scrolls).

Tests: `test/activity.test.js` (196 checks, with a log in the structure of the real one, with made-up names and IDs; also in five time zones) and the
wrappers in `test/nxpatch.test.js` (256); the tests were also checked by breaking the code on purpose (five changes, each seen by a test).

## What is new in nx14 (Activity: the history of the accessory)

nx14 has version code 20201112 and installs over nx13 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-14` as its version).

**What the accessory can tell, and what it cannot.** This was read from the app's own code (the model classes `Interface`, `Device`,
`Property`, `EventLog`, the response parsers in `protocol/commands`, the event parser) and not measured on an accessory:
- The status is `DoorStatus` (open, closed, opening, closing, stopped) and `Obstruct`. The event parser knows no other property, and the
  app reads the first two positionally. Information about the interface and the automation: manufacturer, product, type, hardware and firmware
  versions, serial number, date, time zone and daylight saving time, schedules, services and the secondary commands.
- There are **no counters of maneuvers, no maintenance counter, no motor current, no temperature**. The app's texts for temperature, pulse counter,
  battery and signal strength belong to the wireless sensors of the CORE ecosystem.
- There is an **event log** (`logs`): `{ interfaceLogs, deviceLogs }`, every entry `{ deviceId, source, type, time, idx, id }` (the XML `Event`
  element; `time` is parsed from `yyyy-MM-dd'T'HH:mm:ss` in the phone's time zone, so it is the accessory's own clock). For the device log the
  `type` is the door action (`open`, `close`, `stop`) or the T4 code of a secondary command (`MDBk` is "Open and Block"), or something else
  (`obstruction`, which has a text in the app, `Output`, `Scena_Out`); the `source` is `busT4` (what the app calls "Autom."), `scheduler`, `input`
  or the controller ID of a phone (the app finds the user name in `pairings.activeUsers`, also for an ID that is shortened with a dash). The
  app's own history page ("Historian of events") shows the device log in four columns and filters out the interface events:
  `Power ON`, `boot`, `wifi loss`, `error`, `device found`, `device not found`, `connect`, `pair`, user and reset events.

**What Activity shows** (`nx-activity.js`; plain functions first, the sheet second):
- Four tiles: the last opening, the last closing, the commands of 7 days (and 24 hours), the obstructions.
- Commands per day for 14 days as stacked bars (opening, closing, the rest), who gave them (the app's own labels: a user, Automation, Schedule),
  the busy hours of the day.
- The **Wi-Fi module** from the interface events: restarts (a power-on and the boot right after it, within two minutes, count once), Wi-Fi drops,
  errors, and the gate controller that was not found. Green at zero, amber (red for errors) above zero.
- The history grouped by day (25 entries, a button for up to 300) and a note on how far back the log goes: the accessory keeps a limited number
  of events, so the sheet says how many there are and from when.
- Entries without a usable time (a clock that was never set reports 1970 or 2000; anything before 2015 or more than a day ahead) are left out
  and counted in that note. `Scena_Out` is left out like in the app's own page. At most 5000 events are read.
- *Copy the log* puts the raw log on the clipboard (times, types, sources, ids; no passwords are in it).

**On the accessory screen.** `patch-14-activity.py` adds a line under the chips: the last command ("Close · today 14:12 · Anna", in the app's
own words for the command) or "Activity" while nothing has been read, and a tap opens the sheet. On a screen that is lower than 720 pixels
(360x640) the gate icon and the state text are a little smaller, so that Open, Close and Stop stay in view with the extra line (checked with
the harness at six heights, Stop completely visible from 640 up).

**How it reads.** Opening the sheet asks for `NHKPluginService.logs` and `pairings`, the two requests the app's history page makes (each
preceded by the app's own `connect`, which checks the session first). Looking at the accessory screen for 2.5 seconds does it once by itself,
so that the line is there: only when the accessory is reachable and not being checked, not when the answer is less than ten minutes old,
and not when the screen has been left. A request that is not answered within 20 seconds is given up (the sheet says so; the line stays
empty). Failures are only written to the LOG, in which each reading leaves two lines: the numbers, and the kinds of events
(`activity: device [close x12, open x12, ...] sources [busT4 x5, phone x20] module [boot x1, ...]`, without names or IDs). That second line is
what is needed to adjust the labels to what a real accessory sends.

**What it cannot do.** It shows the commands that the accessory logged, not every movement of the gate: whether a remote control or a key
switch shows up depends on what the accessory logs (the source `busT4`). The times are the accessory's clock. It was written without the log
of a real accessory in hand, from the model in the app. `harness/shim.js` has a made-up log (`CFG.activity`, `CFG.logs`) and
`harness/steps-activity.cjs` taps through it; `test/activity.test.js` has 256 checks (the statistics without a browser, the sheet and the readings in the background in jsdom),
run in five time zones.

## What is new in nx13 (a log that keeps the lines that matter, and clearer messages when approving a user)

nx13 has version code 20201111 and installs over nx12 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-13` as its version).

**The log was full of the Nice app's own noise.** Someone who could not approve a user pasted the log, and all of it was the same four
lines over and over (`scene getHome`, `devices.forEach`, `getDevice scene home.device`, `scene getDevice`, with `ICONA` and the
`updateDevice`/`updateHome` lines in between), each with the whole home and accessory as JSON, all from the same second. The cause is in
the original app: `HomeService.getDevice` and `getHome` write debug lines on every call, `retrieveIconClass` writes `ICONA` on every call,
and the accessory screen calls them in every Angular digest (`isDeviceReachable` looks the accessory up in the home service). Opening
the accessory screen once writes about 180 lines in the original app, and the log panel kept 500 lines, so one visit to that screen pushed
out everything else. Measured in the harness (the real app with a simulated Cordova bridge), in the 6 seconds after opening the accessory
screen (the log panel also holds the lines from startup):

| Build | Console lines | Lines in the log panel |
|---|---|---|
| original app | 294 | |
| nx10 | 303 | |
| nx11, nx12 | 423 | 495 (of 500) |
| nx13 | 20 | 75 |

- `debuglog.js` no longer stores or passes on lines whose text starts with one of those labels (`NOISE`). It counts them and ends the log
  with "(N repetitive debug lines of the Nice app left out)". `window.__nxLogAll = true` brings them back for debugging the app itself.
  The log keeps 1500 lines instead of 500 and redraws at most four times a second, however many lines come in. The masking is unchanged
  and now runs only on lines that are kept (the noise lines were the biggest strings, run through four regular expressions each).
- **A mistake of mine in nx11.** The state line at the top of the accessory screen evaluated `isDeviceReachable` twice (for "Checking…" and
  for "Not usable"), next to the original's own use for "usable": three times instead of two per digest, so that screen wrote about 40% more
  lines (91 lookups instead of 61 in the table above). `patch-11-checking-state.py` now puts `nxCheck` first in both expressions, so
  `isDeviceReachable` runs once in each state and at most as often as in the original app. `verify-apk.py` checks the order.

**Approving a user.** The popup itself did not change (it worked in the harness in all cases: allow, "maximum number of users" and another
error, with real taps). What changed is what you see and what is logged:
- Tapping *Allow* shows "Allowing "X"…" at once (and "Still waiting for the accessory…" after 15 seconds), because the accessory can take
  its time or not answer. Only one message is on screen at a time now, so the progress message does not stay under the result.
- When it fails the message carries the app's own explanation of the error code (`NHK_ERROR-n` in the app's translations), for example
  "Could not allow the user: Sign not valid (4)." or "The connection with the Accessory is not valid (3)." Before it said "(4)" only. The
  same goes for a failed check in the status sheet's *New users* button ("Check failed: ... (code).").
- The log has the steps: `newUser`, `waiting users <mac> <number>`, `new user: asking whether to allow X`, `new user: allowing X`, then
  `new user: allowed X` or `new user: could not allow X {"code":4}`. The app's own screen for approving (*Users*) logs its failures too
  (`userApproved ERROR ...`, `pairings ERROR ...`), and those lines are not noise, so they survive.
- The harness can simulate a waiting user (`CFG.waiting`) and a failing approval (`CFG.approveError`); `harness/steps-approve.cjs` taps through
  it. The native action behind the app's `userApproved` is called `userNew`.

## What is new in nx12 (more buttons on the accessory screen, and a choice of theme)

nx12 has version code 20201110 and installs over nx11 when it is signed with the same key. Nothing changed in the network layer
(the native layer only reports `nx-12` as its version).

**More than one optional command.** The accessory screen of the original app has Open, Close and Stop, and one optional "fourth button"
(page *Optional command*: a radio list of the accessory's secondary commands, one choice). All other secondary commands (*Open and Block*,
*Release and Close*, ...) are behind the eye icon. Now any number of them can be ticked, and each becomes a button under Open, Close and
Stop:
- `nx-patch.js` (section 8) keeps the choice per accessory in `localStorage` under `nxQuick`: `{ "<mac>": ["<code>", ...] }`, in the
  order in which the commands were ticked. It is kept apart from the app's own data on purpose: no flow of the app (discovery, updating
  the accessory from the module) can overwrite it. Until the list has been touched, the app's own optional command counts as the first
  choice, so an accessory that was set up with nx11 or earlier keeps its button. The first ticked command is also written to the app's own
  optional command (`fourthButton`), so that the app's own check ("select an optional command") still holds; the other ones live only in
  `nxQuick`.
- The buttons only show while the app's own switch "enable the optional command" is on, so that switch keeps its meaning. The *Choose
  commands* link on the accessory screen turns it on and goes to the page where the commands are ticked.
- `patch-12-extra-commands.py` changes two templates: `system/device_detail.html` (the buttons, run by the app's own `runCommand`, so they use
  the same `executeSecondaryCommand` as the old optional button; the link) and `settings/device_4th_button.html` (the radio list becomes a
  list with a tick per command). Where `nxExtra` / `nxQuickToggle` do not exist (when `nx-patch.js` did not load), the old fourth button
  stays visible and the radio list stays in place.
- Lists the templates get must be arrays of strings: `ng-repeat` over fresh objects on every call would re-render on every digest, and
  Ionic ignores clicks that are not real taps (a synthetic `click()` in a test does nothing; the harness uses `tap()`).
- Limits: the buttons run the command at once, without a confirmation, as the optional button always did; many buttons make the commands
  area of the screen scroll on a small phone (checked with 8 buttons at 360x640); the order is the order of ticking.

**Theme.** The skin has a light and a dark palette (`tokens.css`) and picked one with the WebView's `prefers-color-scheme`. Android derives
that value from the Android theme of the app, and the theme of the Nice app is `Theme.DeviceDefault.NoActionBar`, a dark base theme. So the
app does not necessarily follow the phone's setting (it could not be verified on the phone this was developed on), and there was no setting
to choose. The earlier statement "light and dark follow the system" was an assumption, not something that was measured. Now:
- `nx-theme.js` (new, loaded in `<head>` before the stylesheets) puts `data-nx-theme="light"` or `"dark"` on `<html>` from
  `localStorage.nxTheme` before the first paint; with nothing saved (Auto) it sets nothing and the WebView decides, as before. An unreadable
  storage also means Auto.
- The color tokens answer to the attribute (`:root[data-nx-theme="dark"]`, and the media query for a dark WebView is switched off by
  `data-nx-theme="light"`), and the whole file still has one set of properties for each palette (a test checks that both dark blocks define
  the same ones).
- `patch-13-theme.py` adds the script to `index.html` and a row *Appearance > Theme* (Auto | Light | Dark) to `settings/settings.html`.
  `nx-patch.js` saves the choice, applies it at once and gives the status bar icons the matching color.
- `NX.theme('light' | 'dark' | 'auto')` sets the theme from a script and `NX.theme()` returns the current choice (for tests and the harness, for example `PRE="NX.theme('dark')"`).

## What is new in nx11 (no status before it is confirmed, and a calmer palette)

nx11 has version code 20201109 and installs over nx10 when it is signed with the same key.

**"Checking…" instead of a premature "Not usable".** The app marks an accessory "Not usable" as soon as the *first* attempt of its
reachability check fails, while `nx-patch.js` still makes a second and a third attempt (since nx3). Right after startup the lists and the
chip also showed what the last session had left in storage. So a healthy accessory regularly showed a red "Not usable" and a red
chip for a few seconds, and a chip that said "online" before anything had been checked. Now no status is shown before it is confirmed:
- `nx-patch.js` keeps, per accessory, whether a check is running and the result of the last check of this session that really
  finished (after its new attempts). `$rootScope.nxCheck(device)` answers `'checking'` (no result yet), `'hold'` (the last result was
  "reachable" and the check that is running now has not failed for good, so the list keeps showing "usable") or `''` (nothing to add:
  the app's own flag is the confirmed state). A check that takes longer than 45 s is no longer waited for, and an accessory that has not
  been checked is only "being checked" for the first 9 s after startup.
- `patch-11-checking-state.py` makes the lists ask that: the label under an accessory in the favorites, the list of accessories of a
  home, the add-favorites and settings lists, and the state line at the top of the accessory screen. Where nothing is confirmed they show
  a neutral "Checking…" (grey pill with a pulsing dot; it stands still with reduced motion) instead of the red "Not usable". Where
  `nxCheck` does not exist (when `nx-patch.js` did not load) every expression falls back to what the app did before.
- The status chip says "Accessory: checking…" (grey) as long as a result is missing, also without Wi-Fi: with mobile data the Nice
  cloud may still work, so "No Wi-Fi" is not a verdict yet. Only the accessory's own Wi-Fi (setup) is known at once.
- An accessory that nobody checks (the app only checks the ones on the screen) is checked by the patch 2.5 s after startup, with the
  same new attempts, but not while the phone is on the accessory's own Wi-Fi.

**Palette.** The scheme is now a calm petrol blue: seed color #1E6A8A in the Material scheme "tonal spot" (before: the "vibrant" scheme
with seed #3A6FF7: electric blue next to lavender and pink). Surfaces, *Open*, *Close* and the sheet now come from one color family:
*Close* is a soft tint of it (secondary container) instead of a third hue, and the green, amber and red of the statuses stand out
because the rest is calm. The wizard screens follow too: the dark "stage" for Nice's light-gray icons and the brand surface of the welcome
screen are derived from the scheme (`--nx-stage`, `--nx-brand`, in `tokens.css`) instead of being fixed colors. Contrast of the
main pairs (text on surface, on primary, on the containers, white on the brand surface): 4.8:1 at the lowest (dark theme, white on the
brand surface), 6.5:1 and more everywhere else. `skin/src/tools/build-tokens.mjs` takes `--seed` and `--scheme` to try another
palette (`node bt.mjs --seed '#00796B' --scheme tonal` is the teal variant); the harness shows the result.

## What is new in nx10 (everything in English)

Only texts and names changed: no function and nothing in the network layer. Every text the patch adds (the status chip and sheet, the
diagnosis, the popups, the error messages, the log lines) is English now, and so are the code comments, the tests, the scripts, the file
and folder names and this documentation. The quotes in this document show the English wording; builds before nx10 showed these texts in
Dutch ("Module online", "Opnieuw verbinden", ...). The app's own screens still follow the phone's language. Names inside the code changed
too (for example the plugin action `versie` is `version` now, the JSON key `gebonden` is `bound`, the error code `GEEN_WIFI` is `NO_WIFI`), so names you
find in older notes or logs may differ.
nx10 has version code 20201108 and installs over nx9 when it is signed with the same key.

## Where does the app work? (nx16)

The app talks to the accessory in two ways: directly at its address on your home network (discovery via mDNS, then TLS on port 443;
if mDNS fails, the IP safety net tries the saved address), and through the Nice cloud (`it4wifi.cloud.nice.niceappdomain.com`, port 7890)
when there is no local route. The cloud works: on 5G without a VPN, nx5 connected to the accessory this way (diagnosis: "App connection
with the accessory: ok", status "Closed"). In nx3 and nx4 the app never got round to the cloud when away from home, because the IP
safety net came before it.

| Situation | Works? |
|---|---|
| At home, on the Wi-Fi network the accessory was set up on (HomeWifi) | Yes. |
| At home, another Wi-Fi network of the same router (HomeWifi-5G, 5 GHz, etc.) | Yes, as long as that Wi-Fi reaches the accessory (same home network). When you operate the gate, the original app does not look at the Wi-Fi name; only the setup wizard does. |
| At home, guest network or Wi-Fi with client isolation | Not locally (the phone cannot see the accessory); since nx6 the app then falls back to the cloud. |
| Away from home (4G/5G, someone else's Wi-Fi), without VPN | Yes, through the Nice cloud. The status chip then says "Accessory online · cloud". |
| Tailscale (or another VPN) on | Yes, since nx7 (see below). Before that, every connection failed with EPERM. |

### Tailscale always on
**The cause (from the diagnosis with Tailscale on):** `Binding socket to network 376 failed: EPERM (Operation not permitted)`. A VPN
that cannot be bypassed (Tailscale does not call `allowBypass()`) does not allow an app it covers to bind its socket to another
network. The original app does that on EVERY connection (`Network.getSocketFactory().createSocket()` in `ConnectionsManager._openSocket`,
for Wi-Fi and for mobile, for the accessory and for the cloud). So with Tailscale on, everything failed, even when the VPN did not touch
the accessory's address at all (the diagnosis said: "VPN route to the accessory: none"). My earlier suspicions (a subnet route catching
the traffic, Tailscale's DNS) were wrong: name resolution simply worked (13 ms). nx3 through nx6 could not fix this, because the bug is
in the original code.

**nx7:** `Nx.socketFor(network)` replaces that call in both places. If binding succeeds, everything is as before; if Android refuses it,
a plain socket comes out instead. That socket follows the default route: addresses in the home network go over the Wi-Fi, the internet
goes over the underlying network, and a VPN only catches traffic for which it has a route. In addition, the app no longer binds the whole
process to a Wi-Fi network without internet while a VPN is on (all new sockets, including those for DNS, would then fail with EPERM).

**If it still does not work (plan B):** exclude MyNice Welcome in Tailscale. Tailscale has a setting for this, which you can find in the
Tailscale app as **App split tunneling** (excluded apps, "Excluded apps"; the name comes from the source code of the Android app, your
version may differ). Tailscale then stays on for your other apps and this app goes around it.

Known limitation: on another network that uses the same address range as at home (for example 192.168.1.x at someone else's house) the
app tries the home address first, and the cloud never gets a turn. A check that tells the two apart could wrongly reject the home
address at home when the accessory is briefly slow to answer; that risk is worse than this limitation.

## What is new in nx9 (new look and a better connection status)

Only the look and the way the connection is shown; no function of the app and nothing in the network layer has changed
(the native layer only reports `nx-9` as its version).

**Look (Material 3 Expressive).** The same design language everywhere: color roles from the Material "vibrant" scheme with seed
color #3A6FF7 (replaced in nx11 by a calmer petrol palette; light and dark, with the choice in the settings since nx12; Android's status bar gets the same color as the header), the Roboto Flex
typeface (OFL, bundled), lists as cards with large corner radii at the ends, a navigation bar with a pill indicator, tonal round
buttons in the header, popups as dialogs, and on the accessory screen a large shape that changes with the state (closed, open, moving,
stopped, obstruction), with Open and Close side by side below it and Stop beneath them. The wizard screens keep their light-gray icons
on a dark podium. It is a layer of CSS (`skin/nx-expressive.css`, 86 KB) that is loaded after `style.css`.

**Connection status.** The green dot at the bottom right, which sat on top of the tab bar, is gone. Instead, under the title of every
page there is a chip with a colored dot: "Accessory online", "Accessory online · cloud", "Accessory not reachable · VPN, mobile", and
so on (the same texts as before; the chip turns red for a fault, orange for a warning). A tap on the chip (or the title) opens a sheet
from the bottom with:

- a shape that shows the state (cookie with Wi-Fi = online locally, flower with a cloud = via the cloud, star = fault, sun = checking or a warning),
- the outcome of the diagnosis as a plain sentence,
- the route: phone - accessory, or phone - Nice cloud - accessory, each link green (succeeded), red dashed (failed) or dotted
  (not known yet), with the measurement alongside (TCP in ms),
- the facts as list rows: Wi-Fi or mobile, VPN, which route the app chose, the measurement to the accessory, to the cloud, and whether the app has a session,
- "Technical details" (expandable): the same text as before, for Copy and for sharing,
- New users, Copy and Log, and, fixed at the bottom, Close and Reconnect.

You can close the sheet with the button, by tapping the dark area, by dragging it down, or with Android's back button (which then does
not also go back to the previous page). The sheet measures again as soon as it opens, as the old button did. The red LOG button has
become a small round icon above the tab bar, on the left, and is now also in the sheet. The chip only appears while the app has an accessory.

**What I could and could not see.** The look was checked in a real browser (Chromium, 412 x 915, light and dark) with the app files from
this APK and a simulated Cordova bridge, on some 25 screens, not on your phone. The skin uses `:has()`, `:where()` and a spring curve
written as `linear()`; these exist in Android System WebView from version 113 (the WebView updates itself through Google Play). On an
older WebView the app loses some of the shapes and animations, but not its function. Firefox and iOS play no part here. If something
looks odd, send a screenshot and say on which page.

## What came in nx8 (hung accessory, honest diagnosis)

Confirmed with nx7 and Tailscale on: the app connects through the Nice cloud ("Accessory online · cloud"). In the same diagnosis you could
see that TCP to the accessory did get through locally but the TLS handshake did not ("Read timed out"): in that case the accessory
itself has hung, and the network is fine.

| Change | What it does |
|---|---|
| **TCP and TLS reported separately** | "Accessory ...: TCP 14 ms, but no answer on TLS (...)" instead of just "no answer". That way you can see that the network works and the accessory has hung. |
| **Conclusion "the accessory has hung"** | In nx7 the conclusion then wrongly claimed that the VPN was in the way. Now: "the accessory accepts the connection but does not answer the handshake: it has hung. The network (and your VPN) are fine. Disconnect the accessory from power for half a minute." |
| **Local and cloud alternate on failure** | The app reports every outcome of a check to the native layer. If the local route failed (for example a hung accessory), the cloud takes precedence for 2 minutes (doubled with every further local failure, up to 15 minutes); if the cloud fails, local may be used again; if local succeeds, the precedence is gone. A working session is left alone. This way, with a hung accessory the app comes online through the cloud after one failed attempt. The diagnosis shows how much longer the cloud keeps precedence. |

## What came in nx7 (Tailscale on: the real cause)

| Change | What it does |
|---|---|
| **Plain socket when binding is not allowed** | See "Tailscale always on". In both places in `_openSocket` the app now calls `Nx.socketFor`. |
| **No process binding with a VPN** | `bindNiceWifi` (two copies) no longer binds the whole process to a Wi-Fi network without internet when a VPN is on. |
| **Honest measurements** | My probes and the cloud test now bind the same way the app does (with the same fallback) and report `bound: false`. The diagnosis then says: "The VPN does not allow the app to bind its connection to the Wi-Fi network (EPERM)" and calls the measurement "plain connection" instead of "over Wi-Fi". |
| **More careful about the VPN** | Earlier texts claimed that "the VPN is probably taking over the traffic"; that has been replaced by "try switching the VPN off briefly to see whether that is the cause". |

## What came in nx6 (fallback to the cloud)

| Change | What it does |
|---|---|
| **Fallback to the cloud** | `getActiveConnection` got a check: a local address (mDNS or saved) without a working session is only used if it fits the network. With a VPN that check is a measurement (TCP within 3 s, over the same route as the app); without a VPN it stays the ordinary rule (same subnet, or an answer within 3 s on another subnet). If the check fails, the app chooses the cloud. A working session and the cloud itself are left alone. |
| **Cloud name via the network itself** | If the ordinary name resolution fails or returns 0.0.0.0/loopback, and a VPN is on, the app looks up `it4wifi.cloud...` with the resolver of the Wi-Fi or the mobile network. Without a VPN nothing has changed. |
| **Status bar and diagnosis know about the cloud** | "Accessory online · cloud" when the app connects through the cloud; no more "Turn on Wi-Fi" when the connection simply works away from home (nx5 reported that wrongly). The diagnosis measures the cloud (name, TCP 7890), shows which route the app chose, and names App split tunneling when a VPN seems to be the cause. |
| **Automatic recovery with a VPN or without Wi-Fi** | Check again (the app then picks local or cloud itself) instead of a reconnect that fixes nothing. |
| **LOG with timestamps** | Every line now starts with hh:mm:ss, so that events (`newStateHandler ... obstruct ...`) can be matched to a time. |

## What came in nx5 (all networks)

| Change | What it does |
|---|---|
| **Status bar leads with reachability** | "Other Wi-Fi" and "No Wi-Fi" used to hide whether the accessory was reachable. Now what the app itself knows comes first; the network is only given as the reason ("Accessory not reachable · other Wi-Fi, VPN, mobile"). |
| **Diagnosis without assuming you are at home** | On another Wi-Fi network of the same router: "All fine, that makes no difference". No Wi-Fi but a VPN: the measurement runs over the default route (the VPN) and the explanation names the route to the home network. |
| **The IP safety net no longer blocks the cloud** | The app first chooses a local connection (mDNS), then the IP safety net from nx3, and only then the Nice cloud. As a result the safety net passed on the home address even away from home, after which the cloud was never tried again. Now the app only gets the address if it fits the network: the Wi-Fi is on the same subnet (the usual case), a VPN has a route to it, or the address answers within 3 s. Otherwise the app falls back to the cloud, like the original. |
| **10-minute cloud skip** | After a single failed HTTP call to `niceappdomain.com` (push and IFTTT, not the connection to the accessory), later calls were skipped for 24 hours. That is now 10 minutes, so that a failure on one network does not linger on another network. |
| **Recovery only where it can work** | Automatic recovery does not run without Wi-Fi, nor on a network with a completely different /24 than the accessory's address (at someone else's house there is nothing to recover). |

## What came in nx4 (VPN and mobile data)

What prompted it: "Not usable" while the accessory had 3 green LEDs, with 5G and a VPN (Tailscale) on; with both off it worked.
Two bugs in nx3 and a behavior of the original app turned out to play a part. Which of them was decisive in your case cannot be
determined without the phone; that is why nx4 measures it too (see "Diagnosis").

| Change | What it does |
|---|---|
| **A VPN is not Wi-Fi** | On modern Android versions, a VPN running over Wi-Fi itself also reports "Wi-Fi" (TRANSPORT_WIFI); I could not verify this on a phone, but the code is set up for it. My network choice in nx3 (the status measurement and the binding to Wi-Fi without internet) could therefore take the VPN network for "the Wi-Fi". Now VPN networks are skipped everywhere. |
| **No false "Wi-Fi gone"** | The app reports "wifi-disconnected" as soon as the *active* network is not Wi-Fi. With a VPN (or mobile data on a Wi-Fi without internet) that is the case, even when the phone is simply on the Wi-Fi; the app then set every accessory to "Not usable". Now the rule is: as long as a real Wi-Fi is connected, it counts as "Wi-Fi". |
| **Cold start** | The first check after startup ran before my helper layer (saved addresses, retries). Now there is a hook right after the definition of the check in the app, with the old poll as a safety net. |
| **Automatic recovery** | If the app reports "not reachable" while the accessory does answer on both TCP and TLS over Wi-Fi, nx4 rebuilds the connection itself (at most three times per fault, at least 45 s apart, never in the first 12 s after startup or while the app itself is running a check). If the accessory does not answer, it does nothing and the diagnosis says where the problem lies. |
| **Diagnosis** | Tap the status bar. Besides the old lines, there are now: what Android sees as the active network, whether the VPN has a route to the accessory's address (and which), the measurement over Wi-Fi and, with a VPN or mobile data, also over Android's default route. The conclusion names a VPN that sends the traffic to the accessory into the tunnel. The text is also in the LOG panel, and there is a **Copy** button. |
| **Status bar** | "Accessory not reachable · VPN, mobile" names what else is switched on. |
| **LOG** | The app's Wi-Fi reports and nx4's decisions are now in the LOG (lines with `Wi-Fi event`, `network report`, `auto-recovery`). |

### What nx4 could not do (and what has turned out since)
nx4 assumed that a VPN only catches the app's traffic for which it has a route, and that the app could keep binding its connection to the
Wi-Fi. The latter is not true: a VPN that cannot be bypassed does not let an app bind its socket to another network at all (EPERM), and the
original app did that on every connection. That has been handled since nx7 (see "Tailscale always on"). If a VPN does have the accessory's
address in its routes (a subnet route or exit node), that traffic still goes into the tunnel; the diagnosis reports the route, and the
solution is then in the VPN app (App split tunneling, or subnet routes/exit node off).

## What already came in nx3

| Change | What it does |
|---|---|
| **Connecting to the accessory Wi-Fi automatically** | In the wizard, tap the accessory: Android shows "Connect to device" (WifiNetworkSpecifier, the recommended way on Android 10+). Choose Connect. After configuring, the app releases that connection and the phone returns to your home network by itself. Manual connecting (first in the Wi-Fi settings, then tapping) keeps working as a fallback. |
| **Longer timeouts** | Connecting to the accessory: 12 s instead of 5 s. The TLS handshake now has a timeout of 15 s; an accessory that accepts TCP but no longer answers on TLS used to block the whole connection layer forever. |
| **Safety net for "Not usable"** | The app only knows accessories that mDNS finds. If mDNS did not find the accessory, it fell back to the (unreachable) Nice cloud and reported "Not usable". Now it tries the accessory's saved IP address next. After that come two extra attempts of the reachability check. |
| **Status bar** (bottom right) | Shows "Accessory online", "Accessory not reachable", "No Wi-Fi", "Other Wi-Fi" or "Accessory Wi-Fi". Tap it for a diagnosis (network, TCP and TLS time to the accessory, app session, and a conclusion), with buttons **Reconnect** and **New users**. |
| **Approving a new user** | The app did not listen for new users; you had to open the Users screen yourself. Now a popup "X asks for access, allow?" appears (on a new request, on resume, or via the button). |
| **Double tap on Next** | A second configuration within 2 minutes is ignored (a second one threw the wizard back three pages). |
| **Clear error messages** | Instead of "A network error occurred" the app says what is wrong and what you can do. |
| **Skipping a dead cloud** | After a single failed call to `niceappdomain.com`, later calls are skipped immediately (24 hours in nx3 and nx4, 10 minutes since nx5). |
| **LOG panel without secrets** | Passwords, setup codes and tokens are replaced by `***` the moment they are recorded. The little log line that showed Wi-Fi passwords has been removed. |

## If something does not work: what I need

Open the app and tap the chip under the title (the connection status), wait until the sheet has finished measuring, and choose
**Technical details** and **Copy**. For the app's log: tap the small bug icon (LOG) above the tab bar, then **clear**, do the thing that
goes wrong, tap LOG again and **copy**. Lines with `[nx]` come from the new layer and say what happened (for example "request to connect
to NiceIT4WIFI… sent" or "requestNetwork failed"). Passwords are masked, but check the text yourself before you share anything.

## What is and is not tested

**Tested** (without a phone): the build and signing; that every call between the new code and the app/Cordova exists with exactly the
same signature; the logic of the new code on a plain JVM (81 checks, among them the calculation rule for the network range); the JS in
a simulated environment (183 checks, in which the new behaviors were also checked with deliberately introduced faults), the masking
(13 checks) and the CSS itself (19 checks); the decompiled result of the three patched places in the app; and that the patched
`app.min.js` is valid JavaScript.

**Not tested** (can only be tested on a phone):
- the automatic connecting itself (the Android dialog, `onAvailable`, binding to the network, mDNS on the accessory network) and the
  IP safety net in practice; if creating the connection request fails, the app falls back to the old manual route;
- the behavior under a real VPN or with real mobile data (the route check and the measurement over the default route only run on
  a phone);
- any Wi-Fi other than HomeWifi (for example HomeWifi-5G) and any use away from home, also with Tailscale on (the measurement, the
  fallback to the cloud and the name resolution via the network only run on a phone);
- the automatic recovery with a real accessory.

## Back to the original app

The accessory simply stays paired and online. After removing this app (and installing the official one) you select the accessory
again and enter the setup code on its back. Use the same user name as before (here `homeuser`) and it will probably work; with a
different name the accessory asks the administrator for permission, and that is you, with a lost password. Then all that remains
is a reset of the accessory.

## Building and the files

See [README.md](../README.md) for the steps (`./get-tools.sh`, then `./build.sh <original.apk>`). The script unpacks the original APK,
applies `patch-01-wifi-binding.py` through `patch-15-state.py`, builds the Java layer (`java/src/com/nice/patch`) into `classes2.dex`,
adds it, aligns, signs with your key in `keys/` and checks the result (`verify-apk.py`, if `androguard` and `loguru` are installed).
Every patch checks that its anchor text occurs exactly once, so a different APK version is not silently patched wrongly.

| File | Contents |
|---|---|
| `patch-01-wifi-binding.py`, `patch-02-already-connected.py` | older hooks (binding to Wi-Fi without internet; skips the self-connect that Android refuses when the phone is already on the SSID, and then waits for the home network) |
| `patch-03-home-network-and-log.py`, `patch-04-continue-after-discovery.py` | fill in the home network when Android no longer provides the list of known networks; continue after the accessory has been found |
| `patch-05-native-hooks.py` | hooks into the new layer (WifiWizard, JmDNS, ConnectionsManager), manifest, `config.xml`, version number |
| `patch-06-js-layer.py` | `nx-patch.js` in the app and the patch points in `app.min.js` |
| `patch-10-skin.py` | nx9: the skin (`skin/nx-expressive.css`), the font (`skin/fonts-nx`) and the `<link>` in `index.html` |
| `patch-11-checking-state.py` | nx11: "Checking…" instead of a premature "Not usable" in the app's lists (six templates; they ask `nxCheck` from `nx-patch.js`) |
| `patch-12-extra-commands.py` | nx12: the ticked commands as buttons on the accessory screen and a list with ticks instead of the radio list (two templates; they ask `nxExtra` and `nxQuickToggle` from `nx-patch.js`) |
| `patch-13-theme.py` | nx12: `nx-theme.js` in `index.html` and the row *Appearance > Theme* in the settings (Auto, Light, Dark) |
| `patch-14-activity.py` | nx14: `nx-activity.js` in the app (loaded before `nx-patch.js`) and the line on the accessory screen that opens the activity sheet |
| `patch-15-state.py` | nx15: the state text and icon of the accessory screen ask `nxState` and `nxIcon` (the state settled from the log), a note under the state, and the pill of a blocked gate |
| `patch-09-socket-fallback.py` | nx7: `socketFor` in `_openSocket` (EPERM fallback) and the VPN guard in both `bindNiceWifi` copies |
| `patch-08-route-choice.py` | nx6: hooks in `ConnectionsManager`: `vetLocal` (vetting the local address), `noteRoute` (remembering the chosen route), `socketAddress` (name resolution with a fallback) |
| `patch-07-vpn-binding.py` | nx4: skipping VPN networks in the bind loop, `Nx.wifiType`/`Nx.ctx` in the Wi-Fi receiver, the `__nxWrapVerify` hook in `app.min.js` |
| `java/src/com/nice/patch` | `Nx` (helper functions), `NxWifi` (connecting via WifiNetworkSpecifier), `NxPlugin` (bridge to the JS) |
| `java/stubs` | only signatures of app and Cordova classes that the code is compiled against; they do not end up in the dex |
| `nx-patch.js`, `nx-theme.js`, `nx-activity.js`, `debuglog.js` | the JS improvements (nx9: also the status chip and the status sheet; nx12: the extra buttons and the theme; nx14: the activity sheet) with the early theme script, and the LOG panel |
| `skin/` | `nx-expressive.css` (the result that goes into the app) and `fonts-nx/`; the source is in `skin/src/`: `skin.css` (the app), `status.css` (the status sheet), `activity.css` (the activity sheet and its line), `tokens.css` (colors and spring curves, generated by `src/tools/build-tokens.mjs`), `shapes.json` (the polygons for the shapes, all 144 points), `build-css.py` assembles them. Edit the source and run `python3 skin/src/build-css.py`, never edit the result |
| `harness/` | `screens.cjs` runs the real app (unpacked from the APK: `unzip -o <apk> "assets/www/*"`, next to the script as a folder `www`) in headless Chromium with a simulated Cordova bridge (`shim.js`) and takes screenshots of every page (light, and with `COLOR_SCHEME=dark` also dark, `PRE=` for an action such as `NX.diagnose()`, `CFG=` for a different network state); `sweep.sh` does 25 screens and makes a contact sheet; `make-screenshots.py` redoes the pictures in `docs/screenshots`. Requires Node with `playwright` and Python with PIL |
| `get-tools.sh`, `test-all.sh` | downloading the tools with a SHA-256 check, and all tests in one go |
| `test/` and `java/test/` | the tests (jsdom: `NODE_PATH=<folder with node_modules/jsdom> node test/nxpatch.test.js`, 256 checks; `node test/masker.test.js`; `node test/activity.test.js`, 256 checks of the activity statistics, the state, the readings in the background and the sheet; `node test/skin.test.js` checks the CSS itself: no placeholders, braces, every variable defined, all shapes with the same number of points, icons, font and prefix) |

## Signing key

The first build creates a key of its own in `keys/` (`mynice.jks`, alias `mynice`) with a random password in `keys/password.txt`.
**Keep that folder safe, never share it and do not put it in git** (`.gitignore` excludes it). Whoever has the key can make an APK that
installs as an update over your installed app and can get at that app's data, including the pairing with your accessory. Without the
same key a new version cannot be installed over the previous one and the app's data is lost. You use an existing key with
`KS=/path/to/key.jks KSPASS=password ./build.sh ...`.

## Security

- The measurement behind the status chip (TLS handshake to the accessory) accepts any certificate, just as the app itself does for the
  accessory, and sends no data. It is only a timing measurement.
- The app itself still keeps all Wi-Fi passwords and pairing passwords locally, unchanged from the original.
