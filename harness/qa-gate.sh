#!/bin/bash
# nx23 QA (gate + command): every harness check of the QA round on the MERGED build, one Chromium at a time (about 20 minutes).
#   ./qa-gate.sh [tag]      logs: shots/qa-gate-<tag>-<name>.log, pictures: shots/qa-gate-<tag>-<name>/
# Each log ends with "STEPS: n checks, m failed" (the steps-*.cjs scripts) or has its own lines (SCEN / FIT / RESULT / MONITOR). Invented data only (the shim).
cd "$(dirname "$0")"
T="${1:-run}"
X='"secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]'                       # the maintainer's case: two extra buttons
C_CFG='{"reachable":false,"verifyFail":true,"statusFail":true,"activity":"error","secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"],"net":{"version":"nx-24","sdk":37,"wifi":true,"ssid":"GuestWifi","ip":"192.168.50.12","validated":true,"cellular":false,"vpn":false,"module":false,"defaultType":"wifi","route":"local","routeAgeSeconds":4}}'
TR='"trustTimes":{"StateFreshMs":3000,"StateStaleMs":7000}'
run() {   # name view scheme cfg script [env...]   (screens.cjs runs SCRIPT after the first page)
  local n="$1" v="$2" s="$3" c="$4" sc="$5"; shift 5
  env "$@" VIEW="$v" COLOR_SCHEME="$s" WAIT=300 CFG="$c" SCRIPT="$sc" node screens.cjs "qa-gate-$T-$n" '#/tabs/favorites' > "shots/qa-gate-$T-$n.log" 2>&1
}
# 1. the line, the real template, the real digest: Open never moves, the box never changes; every occupant and its colours (MONITOR line); keyboard and tap
for v in 360x640:dark 412x915:light; do
  run cmdA-${v%%:*} "${v%%:*}" "${v##*:}" "{\"trustTimes\":{\"SilentMs\":2000},$X}" steps-qa-run.cjs RUN=command PART=A
  run cmdB-${v%%:*} "${v%%:*}" "${v##*:}" "{\"trustTimes\":{\"SilentMs\":2000},$X}" steps-qa-run.cjs RUN=command PART=B
done
run cmdC-360-enter 360x640 light "$C_CFG" steps-qa-run.cjs RUN=command PART=C KEY=enter       # Reconnect by the keyboard
run cmdC-412 412x915 dark "$C_CFG" steps-qa-run.cjs RUN=command PART=C                        # Reconnect by a real tap
run trustA 360x640 dark '{"state":"closed","statusState":"open","statusDelay":3000}' steps-qa-run.cjs RUN=trust PART=A
run trustB-space 360x640 dark "{$TR,\"activityTimes\":{\"PollMs\":0,\"PrefetchMs\":100000000}}" steps-qa-run.cjs RUN=trust PART=B KEY=space     # Refresh by the keyboard
run trustB-412 412x915 light "{$TR,\"activityTimes\":{\"PollMs\":0,\"PrefetchMs\":100000000}}" steps-qa-run.cjs RUN=trust PART=B
run trustC 360x640 dark "{$TR,\"activityTimes\":{\"PollMs\":3000,\"MinGapMs\":500}}" steps-qa-run.cjs RUN=trust PART=C
run trustD 360x640 dark '{"sqliteBackup":true,"verifyDelay":2500,"statusDelay":3500,"state":"closed","statusState":"open"}' steps-qa-run.cjs RUN=trust PART=D   # a resume
run trustD-412 412x915 light '{"sqliteBackup":true,"verifyDelay":2500,"statusDelay":3500,"state":"closed","statusState":"open"}' steps-qa-run.cjs RUN=trust PART=D
run prio 360x640 light '{"activity":"blocked","state":"opening","trustTimes":{"StateFreshMs":4500,"StateStaleMs":7000},"activityTimes":{"PollMs":0}}' steps-qa-priority.cjs
run neverread 360x640 light '{"statusFail":true,"state":"open"}' steps-qa-neverread.cjs
run hung 360x640 light '{"statusDelay":100000,"state":"open"}' steps-qa-neverread.cjs HUNG=1      # a request for the state that never comes back (50 s)
run homes 360x640 light '{}' steps-qa-homes.cjs
run refresh 360x640 light "{$TR,\"activityTimes\":{\"PollMs\":0,\"PrefetchMs\":100000000},\"secondary\":[\"MDBk\"],\"fourth\":\"MDBk\"}" steps-qa-refresh.cjs
run second 360x640 light '{"second":true,"trustTimes":{"StateFreshMs":8000,"StateStaleMs":20000}}' steps-qa-second.cjs
run focus 360x640 light "$C_CFG" steps-qa-focus.cjs
run misc 360x640 light "{\"state\":\"open\",\"activity\":\"blocked\",$X}" steps-qa-misc.cjs
run contrast 360x640 light '{}' steps-qa-contrast.cjs
run who-detail 360x640 light "{$X}" steps-qa-who.cjs SCREEN=detail
# 2. Stop in the three modes of STOP_BYPASS: an accessory that answers (S), the app calls it not usable and its check takes 4 s / fails (U), what is on top of Stop (V)
for m in guard always off; do
  run stop-s-$m 360x640 dark "{\"stopBypass\":\"$m\",$X}" steps-qa-stop.cjs PART=S
  run stop-u-$m 360x640 dark "{\"stopBypass\":\"$m\",$X}" steps-qa-stop.cjs PART=U UANSWER=ok UCHECK=4000
  run stop-uf-$m 360x640 dark "{\"stopBypass\":\"$m\",$X}" steps-qa-stop.cjs PART=U UANSWER=fail UCHECK=2500
done
run stop-v 360x640 dark "{\"waiting\":[{\"id\":2,\"username\":\"Home assistant\"}],$X}" steps-qa-stop.cjs PART=V
# 3. how much text the line holds (the real css and font), at four screen sizes
for v in 360x640 360x800 320x568 412x915; do run fit-$v $v light "{$X}" steps-qa-fit.cjs; done
# 4. every state of the screen, both sizes, light and dark, with the series of the top of Open (25 scenarios: about 12 minutes)
SCHEMES=light,dark node steps-gate.cjs "$T" all > "shots/qa-gate-$T-steps-gate.log" 2>&1
echo done > "shots/qa-gate-$T-done.txt"
