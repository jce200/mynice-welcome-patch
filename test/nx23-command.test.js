// Test of nx23 "command feedback and trust" (section 9 of nx-patch.js, patch-12-extra-commands.py, skin/copy/command.json, the part of the skin in nx23-command.css).
// nx-patch.js runs in jsdom with a simulated Angular, Cordova and service; the app's runCommand is simulated with its real rules (the guard of 500 ms, the check of an
// accessory that it calls "not usable" first, and no failure branch there). The clock is moved with a fake Date.now, so that thresholds of seconds take milliseconds.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-command.test.js          (the checks that need no DOM run without jsdom; the rest says "skipped")
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'nx-patch.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
}
function finish() {
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
}

const MAC = '00:0B:6C:AA:BB:CC';
let unhandled = 0;
process.on('unhandledRejection', () => { unhandled++; });
const produced = [], withAct = [];                                     // every text of the status line that a check has looked at (their length is checked at the end)

// ====================================================================================================== the DOM-free checks
{
  // the table of the commands that move the gate agrees with the one of nx-activity.js (the kinds of the Activity sheet)
  const act = require(path.join(ROOT, 'nx-activity.js'));
  const table = (name) => Object.keys(eval('(' + (SRC.match(new RegExp('var ' + name + ' = (\\{[^}]*\\});')) || [])[1] + ')'));
  const bad = [];
  [['MOVE_OPEN', 'open'], ['MOVE_CLOSE', 'close'], ['MOVE_STEP', 'step']].forEach(([n, kind]) => table(n).forEach((c) => { if (act.kindOf(c) !== kind) bad.push(n + ' ' + c + ' is ' + act.kindOf(c)); }));
  const known = new Set(['open', 'close', 'step']);
  ['open', 'close', 'step'].forEach((kind) => {
    const names = { open: 'MOVE_OPEN', close: 'MOVE_CLOSE', step: 'MOVE_STEP' };
    ['open', 'MDAz', 'MDA1', 'MDA2', 'MDA3', 'MDBk', 'MDE5', 'MDE0', 'MDE3', 'close', 'MDA0', 'MDBl', 'MDFh', 'MDE1', 'MDE4', 'MDAx', 'MDBi', 'MDBj', 'MDEz', 'MDE2']
      .filter((c) => act.kindOf(c) === kind && known.has(kind)).forEach((c) => { if (table(names[kind]).indexOf(c) < 0) bad.push(names[kind] + ' lacks ' + c); });
  });
  ok('movement table: the codes that move the gate are the ones that nx-activity.js calls open, close and step', bad.length === 0, bad);
  ok('movement table: Block, Release, the light and the stop codes are not in it', ['MDBm', 'MDEw', 'MDEx', 'MDEy', 'stop', 'MDAy'].every((c) => !table('MOVE_OPEN').concat(table('MOVE_CLOSE'), table('MOVE_STEP')).includes(c)));
  ok('I-09: the bypass of the app\'s guard is one constant with three values, "guard" by default', /var STOP_BYPASS = \(window\.__nxStopBypass === 'always' \|\| window\.__nxStopBypass === 'off'\) \? window\.__nxStopBypass : 'guard';/.test(SRC));
  ok('the false "<command>: sent" message of the extra buttons is gone for good', !/nxSent|quickSent/.test(SRC));
  ok('the service is only ever called for Stop from the bypass (one place), and with the command "stop"', (SRC.match(/NHK\.executePrimaryCommand\(device, a\.id, 'stop'\)/g) || []).length === 1);
}

// ====================================================================================================== patch-12 on an invented app tree
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd12-'));
  const www = path.join(tmp, 'assets', 'www');
  fs.mkdirSync(path.join(www, 'templates', 'system'), { recursive: true });
  fs.mkdirSync(path.join(www, 'templates', 'settings'), { recursive: true });
  const DETAIL = '<div class="device-commands">\n' +
    '                        <a class="command bg-blue-{{ $index+1 }}"\n                           data-ng-repeat="item in data.device.automations[0].primaryCommands track by $index"\n' +
    '                           data-ng-click="runCommand(item, true)">\n                            <span translate="{{ \'DEVICE_COMMAND_\'+item }}"></span>\n                        </a>\n\n' +
    '                        <a class="command bg-blue-4"\n                           data-ng-click="runCommand(data.device.automations[0].fourthButton.code, false)"\n' +
    '                           data-ng-if="data.device.automations[0].fourthButtonEnabled && data.device.automations[0].fourthButton">\n' +
    '                            <span translate="{{ \'DEVICE_COMMAND_\'+data.device.automations[0].fourthButton.code }}"></span>\n                        </a>\n</div>\n';
  const PICK = '<div class="list">\n          <ion-toggle ng-model="data.device.automations[0].fourthButtonEnabled" toggle-class="toggle-calm"\n' +
    '                      data-ng-change="toggle4thButton()"><span translate="SETTINGS_DEVICE_4TH_BUTTON_LABEL_ENABLE"></span></ion-toggle>\n' +
    '        <div class="item item-divider" data-ng-show="data.device.automations[0].fourthButtonEnabled"></div>\n      <div data-ng-show="data.device.automations[0].fourthButtonEnabled">\n' +
    '        <ion-radio class="item-checkbox-right" collection-repeat="item in data.secondaryCommands" data-ng-model="data.fourthButton" data-ng-value="item.code" data-ng-click="saveConfiguration(item.code)">\n' +
    '          <span translate="{{ \'DEVICE_COMMAND_\'+item.code }}"></span>\n        </ion-radio>\n      </div>\n</div>\n';
  const dp = path.join(www, 'templates', 'system', 'device_detail.html'), pp = path.join(www, 'templates', 'settings', 'device_4th_button.html');
  const put = (d, p) => { fs.writeFileSync(dp, d); fs.writeFileSync(pp, p); };
  const run = () => cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-12-extra-commands.py'), tmp], { encoding: 'utf8' });
  put(DETAIL, PICK);
  const r1 = run(), d1 = fs.readFileSync(dp, 'utf8'), p1 = fs.readFileSync(pp, 'utf8');
  ok('patch-12: it runs on the templates of the app', r1.status === 0 && /patched \(nx12 extra buttons\)/.test(r1.stdout), r1.stdout + r1.stderr);
  ok('patch-12: Open, Close and Stop go through nxRun with the app\'s runCommand, and fall back to it without nx-patch.js', d1.indexOf('data-ng-click="nxRun ? nxRun(data.device, item, true, runCommand) : runCommand(item, true)"') > -1 && !/data-ng-click="runCommand\(item, true\)"/.test(d1));
  ok('patch-12: so do the extra buttons, and nothing says "sent" at the tap any more', d1.indexOf('data-ng-click="nxRun ? nxRun(data.device, code, false, runCommand) : runCommand(code, false)"') > -1 && !/nxSent/.test(d1) && !/nxSent/.test(fs.readFileSync(path.join(ROOT, 'patch-12-extra-commands.py'), 'utf8')));
  ok('patch-12: the link says "Edit extra buttons" (and "Add extra buttons" while none is ticked)', /\{\{ nxExtra\(data\.device\)\.length \? 'Edit extra buttons' : 'Add extra buttons' \}\}/.test(d1) && !/Choose commands/.test(d1));
  ok('patch-12: the hint under the switch is always there (outside of the part that only shows with the switch on)', /<\/ion-toggle>\n\s*<div class="nx-pick-hint" data-ng-if="nxQuickToggle">Shows extra buttons on the accessory screen\.<\/div>/.test(p1));
  ok('patch-12: the list says what each tick does and what Block does (should: it was not tried on the gate)', /Each ticked command becomes a button under Open, Close and Stop\./.test(p1) && /Block: the gate should ignore commands until you Release it\./.test(p1));
  const second = run();
  ok('patch-12: a second run stops ("already patched") and changes nothing', second.status !== 0 && /already patched/.test(second.stdout + second.stderr) && fs.readFileSync(dp, 'utf8') === d1 && fs.readFileSync(pp, 'utf8') === p1);
  put(DETAIL.replace('data-ng-click="runCommand(item, true)"', 'data-ng-click="runCommand(item)"'), PICK);
  const before = fs.readFileSync(dp, 'utf8'), r3 = run();
  ok('patch-12: when the button of the pad is not found it stops and writes nothing (not even the other template)', r3.status !== 0 && /primary command button/.test(r3.stdout + r3.stderr) && fs.readFileSync(dp, 'utf8') === before && fs.readFileSync(pp, 'utf8') === PICK, r3.stdout + r3.stderr);
  fs.rmSync(tmp, { recursive: true, force: true });
}
{
  // the English wording of the page (patch-21 puts it in locale-en.json)
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'skin', 'copy', 'command.json'), 'utf8'));
  const keys = Object.keys(j).filter((k) => !k.startsWith('_'));
  ok('copy: six texts, one name for the feature everywhere ("Extra buttons"), no "optional command" left', keys.length === 6 && keys.every((k) => typeof j[k] === 'string' && j[k].trim() && !/optional/i.test(j[k])) &&
    j.SETTINGS_DEVICE_DETAIL_BTN_PROG_4_BUTTON === 'Extra buttons' && j.SETTINGS_DEVICE_4TH_BUTTON_PAGE_TITLE === 'Extra buttons' && j.SETTINGS_DEVICE_4TH_BUTTON_LABEL_ENABLE === 'Show extra buttons', keys);
  ok('copy: the popup that blocks leaving the page says what to do', j.SETTINGS_DEVICE_4TH_BUTTON_NO_SELECTION === 'Tick at least one button, or switch extra buttons off.');
}

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom); ' + total + ' checks without it ' + (failures ? 'FAILED' : 'passed'));
  process.exit(failures ? 1 : 0);
}

// ====================================================================================================== nx-patch.js in jsdom
// scen: { stopBypass, route, net, reachable, state }
async function environment(scen) {
  scen = scen || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, logs = [], clock = { off: 0 }, realNow = w.Date.now.bind(w.Date);
  w.Date.now = () => realNow() + clock.off;
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  const timers = [], realSet = w.setTimeout.bind(w);
  w.setTimeout = function (fn, ms) { timers.push(ms); return realSet(fn, ms); };
  const mk = (mac, extra) => Object.assign({ mac, address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret', reachable: scen.reachable !== false,
    properties: [{ value: scen.state || 'closed' }, { value: '0' }], automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'], secondaryCommands: [{ code: 'MDBk' }] }] }, extra || {});
  const env = { w, logs, clock, timers, net: scen.net || { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true }, native: [], calls: [], digests: { n: 0 }, ctl: { exec: {}, connect: {}, verify: 'ok', status: {} },
    verifyWaiters: [], statusWaiters: [], handlers: {}, route: { current: { name: scen.route || 'tabsController.favorites-device-detail' } } };
  const HS = { homes: [{ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: [mk(MAC)] }], updateDevice() { w.localStorage.setItem('keyHomes', JSON.stringify(HS.homes)); } };
  HS.updateDevice();
  env.HS = HS;
  w.cordova = { exec(okCb, failCb, svc, action, args) {
    env.native.push({ svc, action, args });
    setTimeout(() => { switch (action) {
      case 'netState': return okCb(env.net);
      case 'probe': return okCb({ ok: true, tcpMs: 20, tlsMs: 100 });
      case 'version': return okCb('nx-test');
      case 'reconnect': case 'release': case 'setHints': case 'checkSucceeded': case 'checkFailed': return okCb();
      default: return; } }, 0);
  } };
  const later = (ms, fn) => new Promise((res, rej) => realSet(() => { try { res(fn()); } catch (e) { rej(e); } }, ms));
  // the service of the app: every call is made through the object, as the real one does (the executes connect first, through this.connect)
  const NHK = {
    connect(mac) { const c = env.ctl.connect; return new Promise((res, rej) => realSet(() => (c.fail !== undefined ? rej(c.fail) : res()), c.delay || 0)); },
    verify(device) {
      env.calls.push({ name: 'verify', t: Date.now() });
      if (env.ctl.verify === 'hold') return new Promise((res, rej) => env.verifyWaiters.push({ res, rej }));
      return new Promise((res, rej) => realSet(() => (env.ctl.verify === 'fail' ? rej('timeout') : res({ isAdmin: true, isUser: true })), 0));
    },
    status(device) {
      env.calls.push({ name: 'status', t: Date.now() });
      const c = env.ctl.status;
      if (c.hold) return new Promise((res, rej) => env.statusWaiters.push({ res, rej }));
      return new Promise((res, rej) => realSet(() => (c.fail !== undefined ? rej(c.fail) : res({ devices: [{ properties: [{ value: c.state || 'closed' }, { value: '0' }] }] })), 0));
    },
    logs() { return env.ctl.logsFail ? Promise.reject({ code: 3 }) : Promise.resolve({ deviceLogs: [], interfaceLogs: [] }); },
    pairings() { return env.ctl.logsFail ? Promise.reject({ code: 3 }) : Promise.resolve({ activeUsers: [], waitingUsers: [] }); }
  };
  function exec(name, device, id, code) {
    env.calls.push({ name, code, t: Date.now() });
    const c = env.ctl.exec;
    return NHK.connect(device.mac, device.pairingUsername, device.pairingPassword).then(() => new Promise((res, rej) => realSet(() => (c.fail !== undefined ? rej(c.fail) : res({})), c.delay || 0)));
  }
  NHK.executePrimaryCommand = (d, id, code) => (env.lastPromise = exec('primary', d, id, code));
  NHK.executeSecondaryCommand = (d, id, code) => (env.lastPromise = exec('secondary', d, id, code));
  env.NHK = NHK;
  const $rootScope = { $on(ev, fn) { (env.handlers[ev] = env.handlers[ev] || []).push(fn); }, $evalAsync() { env.digests.n++; }, verifyDeviceRecheability(d) { return { promise: Promise.resolve(d) }; } };
  const $q = { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } };
  const names = { DEVICE_COMMAND_MDBk: 'Open and Block', DEVICE_COMMAND_MDFh: 'Release and Close', DEVICE_COMMAND_MDBm: 'Block', DEVICE_STATE_opening: 'Opening', DEVICE_STATE_closing: 'Closing' };
  const services = { $rootScope, $q, $timeout: (fn, ms) => realSet(fn, Math.min(ms || 0, 30)), NHKPluginService: NHK, HomeService: HS, $ionicPopup: { confirm: () => Promise.resolve(true) },
    $translate: { instant: (k) => names[k] || k }, $state: env.route };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  if (scen.stopBypass) w.__nxStopBypass = scen.stopBypass;
  w.eval(SRC);
  await sleep(650);
  env.$rootScope = $rootScope;
  env.dev = (mac) => HS.homes[0].devices.find((d) => d.mac === (mac || MAC));
  env.add = (mac, extra) => { const d = mk(mac, extra); HS.homes[0].devices.push(d); HS.updateDevice(); return d; };
  env.exec = (re) => env.calls.filter((c) => c.name !== 'verify' && c.name !== 'status' && (!re || re.test(c.code)));
  env.codes = () => env.exec().map((c) => c.code).join();
  // the app's runCommand with its real rules (system.js DeviceDetailCtrl): the guard of 500 ms after a command; an accessory that it calls not usable is checked first, and nothing follows a failed check
  env.app = (device) => {
    let enabled = true;
    const app = { calls: 0 };
    app.runCommand = function (commandId, isPrimary) {
      app.calls++;
      if (!device.reachable) NHK.verify(device, device.pairingUsername).then(function () { run(commandId, isPrimary); }, function () { /* the app has no failure branch: nothing follows (here the rejection is only kept from crashing Node) */ });
      else run(commandId, isPrimary);
      function run(c, primary) {
        if (!enabled) return true;
        enabled = false; realSet(() => { enabled = true; }, 500);
        (primary ? NHK.executePrimaryCommand(device, device.automations[0].id, c) : NHK.executeSecondaryCommand(device, device.automations[0].id, c)).then(() => {}, () => {});
      }
    };
    return app;
  };
  env.tap = (d, code, primary, app) => $rootScope.nxRun(d, code, primary !== false, app.runCommand);
  env.line = (d) => { const t = $rootScope.nxLine(d); produced.push(t); if ($rootScope.nxLineAct(d)) withAct.push(t); return t; };
  env.report = (mac, state) => { w.dispatchEvent(Object.assign(new w.Event('newDeviceState'), { mac: mac || MAC, state: state || 'opening', obstruct: '0' })); };
  env.verifyResolve = () => { env.verifyWaiters.splice(0).forEach((x) => x.res({ isAdmin: true, isUser: true })); };
  env.verifyReject = (e) => { env.verifyWaiters.splice(0).forEach((x) => x.rej(e)); };
  env.statusResolve = (state) => { env.statusWaiters.splice(0).forEach((x) => x.res({ devices: [{ properties: [{ value: state || 'closed' }, { value: '0' }] }] })); };
  env.snacks = () => Array.from(w.document.querySelectorAll('.nx-snack')).map((e) => e.textContent);
  env.refresh = async () => { w.NX.refresh(); await sleep(30); };
  return env;
}

(async function () {
  // ---------------------------------------------------------------- what is offered to the template and to the chip
  {
    const env = await environment(), r = env.$rootScope, d = env.dev();
    ok('contract: the functions that the template binds exist, and window.__nxTrust for the chip and the lists', ['nxLine', 'nxLineKind', 'nxLineAct', 'nxLineDo', 'nxLineLive', 'nxTrust', 'nxUnsure', 'nxRun'].every((k) => typeof r[k] === 'function') && typeof env.w.__nxTrust === 'function');
    ok('contract: they give strings (an object per call would make the digest spin)', [r.nxLine(d), r.nxLineKind(d), r.nxLineAct(d), r.nxLineLive(d), r.nxTrust(d), r.nxUnsure(d)].every((v) => typeof v === 'string'));
    ok('contract: an accessory that nothing happened to has an empty line, no kind, no action and no trust', r.nxLine(d) === '' && r.nxLineKind(d) === '' && r.nxLineAct(d) === '' && r.nxTrust(d) === '' && r.nxUnsure(d) === '' && r.nxLine(undefined) === '' && r.nxTrust(null) === '');
    ok('the console has the harness functions (NX.line, NX.ledger, NX.trust)', typeof env.w.NX.line === 'function' && typeof env.w.NX.ledger === 'function' && typeof env.w.NX.trust === 'function');
    ok('without a function to run, nxRun does nothing and throws nothing', r.nxRun(d, 'open', true, undefined) === undefined);
    ok('the wrappers say so, and the old messages of the app\'s service are not replaced', env.NHK.executePrimaryCommand.__nxCmd === true && env.NHK.executeSecondaryCommand.__nxCmd === true && env.NHK.status.__nxCmd === true && env.NHK.verify.__nxCmd === true && env.NHK.connect.__nxCmd === true && r.nxSent === undefined);
  }

  // ---------------------------------------------------------------- I-03: what became of a tap
  {
    const env = await environment(), r = env.$rootScope, d = env.dev(), app = env.app(d);
    const n0 = env.digests.n;
    env.ctl.exec = { delay: 60 };
    env.tap(d, 'open', true, app);
    ok('a tap on Open: "Sending Open…" at once (busy), and the app\'s own runCommand ran once, calling the service once', env.line(d) === 'Sending Open…' && r.nxLineKind(d) === 'busy' && app.calls === 1 && env.codes() === 'open', [env.line(d), env.codes()]);
    ok('... the views are asked to follow', env.digests.n > n0);
    ok('... and nothing is claimed that was not done: no toast', env.snacks().length === 0);
    await sleep(110);
    ok('the call came back: "Open sent hh:mm:ss" (ok)', /^Open sent \d\d:\d\d:\d\d$/.test(env.line(d)) && r.nxLineKind(d) === 'ok' && r.nxLineAct(d) === '', env.line(d));
    ok('the LOG has the tap, the call and the result', ['command: Open tapped', 'command: Open goes to the accessory'].every((m) => env.logs.some((l) => l.indexOf('[NX] ' + m) === 0)) && env.logs.some((l) => /^\[NX\] command: Open sent, the call came back after \d+ ms/.test(l)));
    env.report(MAC, 'opening');
    ok('the state is reported: the line is empty, the hero has the news', env.line(d) === '');
    env.net.route = 'cloud'; await env.refresh();
    env.ctl.exec = {};
    env.tap(d, 'close', true, env.app(d)); await sleep(30);
    ok('via the Nice cloud the line says so', /^Close sent \d\d:\d\d:\d\d · via cloud$/.test(env.line(d)), env.line(d));
    env.net.route = 'local'; await env.refresh();
  }
  {
    // the call goes on unchanged for the app: the same promise, and a rejection still rejects
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    env.ctl.exec = { fail: { code: 'TIMEOUT' } };
    const p = env.NHK.executePrimaryCommand(d, '1', 'close');
    let got = null;
    await p.then(() => { got = 'resolved'; }, (e) => { got = e; });
    ok('the result of the service goes on unchanged (the app\'s own handler still gets the rejection, with its own code)', p === env.lastPromise && got && got.code === 'TIMEOUT');
  }
  {
    // no report of the state
    const env = await environment(), r = env.$rootScope, d = env.dev(), line = () => env.line(d);
    env.w.__nxSilentMs = 120; env.w.__nxFailKeepMs = 400;
    env.tap(d, 'open', true, env.app(d)); await sleep(30);
    ok('Open on a closed gate: sent first', /^Open sent/.test(line()));
    await sleep(160);
    ok('no report of the state after the wait: warn "No report from the gate yet. Check it."', line() === 'No report from the gate yet. Check it.' && r.nxLineKind(d) === 'warn', line());
    env.report(MAC, 'opening');
    ok('... and the report ends it', line() === '');
    const open = env.add('00:0B:6C:AA:BB:01', { properties: [{ value: 'open' }, { value: '0' }] });
    env.tap(open, 'open', true, env.app(open)); await sleep(200);
    ok('Open on a gate that is open already: nothing to report, no warning', env.line(open) === '');
    const blk = env.add('00:0B:6C:AA:BB:02');
    env.tap(blk, 'MDBm', false, env.app(blk)); await sleep(30);
    ok('a name from the app\'s own texts ("Block") in the sentence', /^Block sent \d\d:\d\d:\d\d$/.test(env.line(blk)), env.line(blk));
    await sleep(160);
    ok('Block moves nothing: no warning when no report comes', env.line(blk) === '');
    const mov = env.add('00:0B:6C:AA:BB:03', { properties: [{ value: 'closing' }, { value: '0' }] });
    env.tap(mov, 'stop', true, env.app(mov)); await sleep(200);
    ok('Stop while the gate moves: a report is expected', env.line(mov) === 'No report from the gate yet. Check it.', env.line(mov));
    const rest = env.add('00:0B:6C:AA:BB:04');
    env.tap(rest, 'stop', true, env.app(rest)); await sleep(200);
    ok('Stop at rest: nothing to report', env.line(rest) === '');
    const sec = env.add('00:0B:6C:AA:BB:05');
    env.tap(sec, 'MDBk', false, env.app(sec)); await sleep(30);
    ok('an extra button: "Open and Block sent hh:mm:ss", and the executeSecondaryCommand of the service was called (nothing was claimed before it)', /^Open and Block sent \d\d:\d\d:\d\d$/.test(env.line(sec)) && env.exec().some((c) => c.name === 'secondary' && c.code === 'MDBk'), env.line(sec));
    await sleep(500);
    ok('the warning goes away by itself after the time of a failure', line() === '');
  }
  // failures: what is known, and what is not
  const failure = async (name, exec, code, primary, text, act, kind, setup) => {
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    Object.assign(env.ctl, exec);
    if (setup) setup(env);
    env.tap(d, code, primary !== false, env.app(d)); await sleep(40);
    ok(name, env.line(d) === text && r.nxLineKind(d) === 'bad' && r.nxLineAct(d) === act && r.nxLineLive(d) === 'assertive', [env.line(d), r.nxLineKind(d), r.nxLineAct(d)]);
    return env;
  };
  const envFail = await failure('TIMEOUT: no answer, it may have arrived (delivery unknown); no button (the words need the room)', { exec: { fail: { code: 'TIMEOUT' } } }, 'close', true, 'No answer to Close. It may have arrived: check the gate.', '');
  await failure('an unknown code: the same words (delivery unknown)', { exec: { fail: { code: 99 } } }, 'close', true, 'No answer to Close. It may have arrived: check the gate.', '');
  await failure('a failure without any detail (null): the same words', { exec: { fail: null } }, 'close', true, 'No answer to Close. It may have arrived: check the gate.', '');
  await failure('NOT_CONNECTED: known not to have gone out', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'close', true, 'No connection to the accessory. Close not sent.', 'Reconnect');
  await failure('the service could not connect (a TIMEOUT of the connect, nothing was written): not sent', { connect: { fail: { code: 'TIMEOUT' } } }, 'close', true, 'No connection to the accessory. Close not sent.', 'Reconnect');
  await failure('QA review: on a screen 320 dp wide the same text has no button (it would take three lines and grow over the entry to the Activity sheet)', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'close', true,
    'No connection to the accessory. Close not sent.', '', 'bad', (e) => Object.defineProperty(e.w, 'innerWidth', { value: 320, configurable: true }));
  // nx24 (seen on a phone on mobile data): "No connection to the accessory. Open not sent." stood next to "Opening", and the accessory had logged the Open
  {
    const env = await failure('nx24: through the Nice cloud a failed call is never "not sent" (nobody knows): "No answer ... it may have arrived", no Reconnect', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'open', true,
      'No answer to Open. It may have arrived: check the gate.', '', 'bad', (e) => { e.net.route = 'cloud'; e.w.NX.refresh(); });
    ok('nx24: ...and a refusal through the cloud is still a refusal', (await failure('nx24: code 5 through the cloud', { exec: { fail: { code: 5 } } }, 'close', true, 'Command not allowed. Close not sent.', '', 'bad', (e) => { e.net.route = 'cloud'; e.w.NX.refresh(); })) !== null);
    const e2 = await failure('nx24: on Wi-Fi the call fails as "not sent" (as before)', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'open', true, 'No connection to the accessory. Open not sent.', 'Reconnect');
    const d2 = e2.dev();
    d2.properties[0].value = 'opening'; e2.report(MAC, 'opening');
    ok('nx24: ...but when the gate then reports that it is opening, the line is withdrawn (it would contradict the state on the screen)', e2.line(d2) === '' && e2.$rootScope.nxLineKind(d2) === '' && e2.$rootScope.nxLineAct(d2) === '', e2.line(d2));
    ok('nx24: ...and the LOG says so, once', e2.logs.filter((l) => /command: Open was reported as failed \(notsent\), but the gate reports opening: the line is withdrawn/.test(l)).length === 1 && (e2.line(d2), e2.line(d2), e2.logs.filter((l) => /the line is withdrawn/.test(l)).length === 1));
    const e3 = await failure('nx24: a failed Close', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'close', true, 'No connection to the accessory. Close not sent.', 'Reconnect', 'bad', (e) => { e.dev().properties[0].value = 'open'; });
    const d3 = e3.dev();
    d3.properties[0].value = 'opening'; e3.report(MAC, 'opening');
    ok('nx24: a report that does not agree with the command (the gate opens after a failed Close) leaves the failure where it is', e3.line(d3) === 'No connection to the accessory. Close not sent.', e3.line(d3));
    const e4 = await failure('nx24: a failed Open on a gate that is already open', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'open', true, 'No connection to the accessory. Open not sent.', 'Reconnect', 'bad', (e) => { e.dev().properties[0].value = 'open'; });
    e4.report(MAC, 'open');
    ok('nx24: a gate that was already where the command takes it proves nothing: the failure stays', e4.line(e4.dev()) === 'No connection to the accessory. Open not sent.', e4.line(e4.dev()));
  }
  {
    const gate = fs.readFileSync(path.join(__dirname, '..', 'skin', 'src', 'nx23-gate.css'), 'utf8'), cmd = fs.readFileSync(path.join(__dirname, '..', 'skin', 'src', 'nx23-command.css'), 'utf8');
    ok('nx24 css: a message is a bar that reads from the left (glyph, words, button at the end with 4 dp around it); what the screen says at rest stays in the middle',
      /\.nx-line:is\(\[data-nx-kind="busy"\], \[data-nx-kind="ok"\], \[data-nx-kind="warn"\], \[data-nx-kind="bad"\]\) \{ justify-content: flex-start; gap: 10px; padding: 4px 4px 4px 14px; text-align: left; \}/.test(gate) &&
      /\.nx-line \{[^}]*justify-content: center;[^}]*text-align: center;/.test(gate) && /\.nx-line \.nx-line-act \{[^}]*margin: 0;/.test(cmd));
    ok('nx24 css: one distance in the control block: the line is as far from the pad as the rows of the pad from each other, and never touches the entry to Activity', /\.nx-line \{[^}]*margin: 8px 16px var\(--nx-pad-gap\);/.test(gate) && /row-gap: var\(--nx-pad-gap\)/.test(gate));
    ok('nx24 css: Open and Close are whole pills like Stop (the half-connected shape belonged to a gap of 2 dp), also while pressed',
      /\.command:has\(\[translate\$="_close"\]\) \{ --_rl: var\(--_round\); --_rr: var\(--_round\); \}/.test(gate) && /\.command:has\(\[translate\$="_close"\]\):is\(:active, \.activated\) \{ --_rl: var\(--_pr\); --_rr: var\(--_pr\); \}/.test(gate));
    ok('nx24 css: the status chip of the header is a pill like the entry to Activity', /border-radius: calc\(var\(--nx-chip-h\) \/ 2\);/.test(fs.readFileSync(path.join(__dirname, '..', 'skin', 'src', 'status.css'), 'utf8')));
  }
  await failure('WRITE_ERROR: not sent, and the cause is the writing', { exec: { fail: { code: 'WRITE_ERROR' } } }, 'open', true, 'Writing to the accessory failed. Open not sent.', 'Reconnect');
  await failure('code 5: refused, no Reconnect (it would not help)', { exec: { fail: { code: 5 } } }, 'close', true, 'Command not allowed. Close not sent.', '');
  await failure('code 1: refused (the administrator has not confirmed this user)', { exec: { fail: { code: 1 } } }, 'close', true, 'Not confirmed by the administrator yet. Close not sent.', '');
  await failure('code 15: refused, try again later', { exec: { fail: { code: 15 } } }, 'open', true, 'The accessory is not ready yet. Open not sent.', '');
  await failure('Stop, delivery unknown: the gate may move, use the remote', { exec: { fail: { code: 'TIMEOUT' } } }, 'stop', true, 'Stop not confirmed. The gate may move: use the remote.', '');
  await failure('Stop, known not sent: use the remote', { exec: { fail: { code: 'NOT_CONNECTED' } } }, 'stop', true, 'No connection to the accessory. Stop not sent: use the remote.', '');
  await failure('an extra button that fails says its name (from the app\'s texts)', { exec: { fail: { code: 'TIMEOUT' } } }, 'MDFh', false, 'No answer to Release and Close. It may have arrived: check the gate.', '');
  {
    const env = envFail, d = env.dev(), r = env.$rootScope;
    ok('the failure stays until the next tap', env.line(d) !== '');
    env.ctl.exec = { delay: 40 };
    env.tap(d, 'open', true, env.app(d));
    ok('... and the next tap replaces it', /^Sending Open/.test(env.line(d)));
    await sleep(80);
    env.ctl.exec = { fail: { code: 'TIMEOUT' } };
    env.tap(d, 'close', true, env.app(d)); await sleep(40);
    env.report(MAC, 'closing');
    ok('a delivery that is not known is settled by a report of the state after it', env.line(d) === '');
    env.ctl.exec = { fail: { code: 'NOT_CONNECTED' } };
    env.tap(d, 'close', true, env.app(d)); await sleep(40);
    env.report(MAC, 'closing');
    ok('... but "not sent" is true whatever the state says: it stays', env.line(d) === 'No connection to the accessory. Close not sent.');
    env.w.__nxFailKeepMs = 50; await sleep(80);
    ok('a failure goes away after the time that is set', env.line(d) === '');
  }
  {
    // the clock: a call that takes long, and one that never comes back
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    env.ctl.exec = { delay: 400 };
    env.tap(d, 'open', true, env.app(d));
    env.clock.off += 7000;
    ok('after 6 s: "Sending Open… the accessory is slow to answer."', env.line(d) === 'Sending Open… the accessory is slow to answer.' && r.nxLineKind(d) === 'busy', env.line(d));
    env.clock.off += 14000;
    ok('after 20 s: warn "No answer to Open yet. It may still arrive: check the gate."', env.line(d) === 'No answer to Open yet. It may still arrive: check the gate.' && r.nxLineKind(d) === 'warn', env.line(d));
    await sleep(450);
    ok('when it comes back it is "sent" after all', /^Open sent \d\d:\d\d:\d\d$/.test(env.line(d)), env.line(d));
  }

  // ---------------------------------------------------------------- I-03: the app's guard of 500 ms, said honestly
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope, app = env.app(d);
    env.tap(d, 'open', true, app); await sleep(100);
    env.tap(d, 'close', true, app);
    ok('Close within 500 ms of Open: it did not go out, and the line says so (warn)', env.codes() === 'open' && env.line(d) === 'Too soon after the last command. Close not sent: tap again.' && r.nxLineKind(d) === 'warn', [env.codes(), env.line(d)]);
    env.w.__nxFailKeepMs = 1; await sleep(450);
    env.tap(d, 'close', true, app); await sleep(40);
    ok('after the guard the same tap goes out', env.codes() === 'open,close' && /^Close sent|^Sending Close/.test(env.line(d)), [env.codes(), env.line(d)]);
  }

  // ---------------------------------------------------------------- I-09: Stop is never dropped
  {
    const env = await environment(), d = env.dev(), app = env.app(d);
    env.tap(d, 'open', true, app);
    await sleep(100);
    env.tap(d, 'stop', true, app);
    ok('Open, then Stop 100 ms later: both reach the service, and Stop in the same tick as the tap (no timer, no wait)', env.codes() === 'open,stop', env.codes());
    ok('... the app\'s own runCommand ran for both (it is called first and unchanged)', app.calls === 2);
    await sleep(40);
    ok('... and the line says "Stop sent"', /^Stop sent \d\d:\d\d:\d\d$/.test(env.line(d)), env.line(d));
  }
  {
    const env = await environment(), d = env.dev(), app = env.app(d);
    env.tap(d, 'stop', true, app);
    ok('Stop on its own: exactly one call, through the app\'s own path', env.codes() === 'stop' && app.calls === 1);
    await sleep(60);
    env.tap(d, 'stop', true, app);
    ok('a second Stop 60 ms after the first (a double tap): not sent twice', env.codes() === 'stop');
    await sleep(160);
    env.tap(d, 'stop', true, app);
    ok('a second Stop 220 ms after the first is a decision: it is sent (the app\'s guard would have dropped it)', env.codes() === 'stop,stop', env.codes());
  }
  {
    const env = await environment(), d = env.dev(), app = env.app(d);
    env.tap(d, 'open', true, app); await sleep(100);
    env.tap(d, 'close', true, app);
    ok('only Stop is carried around the guard: Close within 500 ms of Open is not', env.codes() === 'open');
    const app2 = { calls: 0, runCommand() { app2.calls++; throw new Error('the app broke'); } };
    let threw = false;
    try { env.tap(d, 'stop', true, app2); } catch (e) { threw = true; }
    ok('when the app\'s own runCommand breaks, Stop is still sent (and nothing is thrown)', !threw && env.codes() === 'open,stop');
    let threw2 = false;
    try { env.tap(d, 'close', true, app2); } catch (e) { threw2 = true; }
    ok('... but for any other command the exception of the app goes on as before', threw2);
  }
  {
    // the check of an accessory that the app calls "not usable": the command waits for it, and a Stop that the guard then drops is sent
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope, app = env.app(d);
    env.ctl.verify = 'hold';
    env.tap(d, 'open', true, app);
    ok('not reachable: a tap waits for the app\'s check ("Waiting for the accessory…", busy), nothing is sent', env.line(d) === 'Waiting for the accessory. Open is not sent if it stays silent.' && r.nxLineKind(d) === 'busy' && env.codes() === '', [env.line(d), env.codes()]);
    env.tap(d, 'stop', true, app);
    ok('... Stop waits for it as the app does (this is the app\'s own path)', env.codes() === '' && env.calls.filter((c) => c.name === 'verify').length === 2);
    env.verifyResolve(); await sleep(40);
    ok('both checks come back together: Open goes out, the app\'s guard drops Stop, and Stop is sent from here', env.codes() === 'open,stop', env.codes());
    const env2 = await environment({ reachable: false }), d2 = env2.dev(), app2 = env2.app(d2);
    env2.ctl.verify = 'hold';
    env2.tap(d2, 'open', true, app2); env2.tap(d2, 'close', true, app2);
    env2.verifyResolve(); await sleep(40);
    ok('the same for Open and Close: Close is dropped by the app\'s guard, and the line says so (it is not sent)', env2.codes() === 'open' && env2.line(d2) === 'Too soon after the last command. Close not sent: tap again.', [env2.codes(), env2.line(d2)]);
    const env3 = await environment({ reachable: false }), d3 = env3.dev(), app3 = env3.app(d3);
    env3.ctl.verify = 'hold';
    env3.tap(d3, 'open', true, app3);
    env3.verifyReject('timeout'); await sleep(40);
    ok('the check fails: "The accessory did not answer. Open not sent." with Reconnect (the app sends nothing)', env3.line(d3) === 'The accessory did not answer. Open not sent.' && env3.$rootScope.nxLineAct(d3) === 'Reconnect' && env3.codes() === '', env3.line(d3));
    env3.ctl.verify = 'hold'; env3.tap(d3, 'stop', true, app3); env3.verifyReject('timeout'); await sleep(40);
    ok('... for Stop too, it says to use the remote, and there is no button (the words need the room)', env3.line(d3) === 'The accessory did not answer. Stop not sent: use the remote.' && env3.$rootScope.nxLineAct(d3) === '', env3.line(d3));
  }
  {
    const env = await environment({ stopBypass: 'always', reachable: false }), d = env.dev(), app = env.app(d);
    env.ctl.verify = 'hold';
    env.tap(d, 'stop', true, app);
    ok('bypass "always": Stop does not wait for the check of an accessory that is not usable, and the app\'s runCommand is not used for it', env.codes() === 'stop' && app.calls === 0 && env.calls.filter((c) => c.name === 'verify').length === 0, [env.codes(), app.calls]);
    env.tap(d, 'open', true, app);
    ok('... every other command still goes the app\'s way', app.calls === 1 && env.codes() === 'stop');
    await sleep(170);
    env.ctl.exec = { fail: { code: 'TIMEOUT' } }; env.tap(d, 'stop', true, app); await sleep(40);
    ok('... and a Stop that fails is shown (the app\'s path never showed it)', env.line(d) === 'Stop not confirmed. The gate may move: use the remote.');
  }
  {
    const env = await environment({ stopBypass: 'off' }), d = env.dev(), app = env.app(d);
    env.tap(d, 'open', true, app); await sleep(100);
    env.tap(d, 'stop', true, app);
    ok('bypass "off": nothing is carried around the guard, and a Stop that the app ignored is said to be not sent', env.codes() === 'open' && env.line(d) === 'Too soon after the last command. Stop not sent: tap again.', [env.codes(), env.line(d)]);
    const env2 = await environment({ stopBypass: 'maybe' }), d2 = env2.dev(), app2 = env2.app(d2);
    env2.tap(d2, 'open', true, app2); await sleep(100); env2.tap(d2, 'stop', true, app2);
    ok('any other value of the constant means "guard"', env2.codes() === 'open,stop');
  }

  // ---------------------------------------------------------------- I-04: the accessory does not answer
  {
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope;
    const cause = async (net, text, act) => { env.net = net; await env.refresh(); ok('does not answer, ' + JSON.stringify(net).slice(0, 60) + ': ' + text, env.line(d) === text && r.nxLineKind(d) === 'bad' && r.nxLineAct(d) === act && r.nxUnsure(d) === '1', [env.line(d), r.nxLineAct(d), r.nxUnsure(d)]); };
    await cause({ wifi: true, ssid: 'HomeWifi' }, 'The accessory does not answer.', 'Reconnect');
    await cause({ wifi: true, ssid: 'GuestWifi' }, 'The phone is on another Wi-Fi than the accessory.', 'Reconnect');
    await cause({ wifi: false, vpn: false, cellular: true }, 'No Wi-Fi, and the Nice cloud does not answer.', 'Reconnect');
    await cause({ wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: '192.168.1.0/24' }, 'The VPN may be blocking the accessory.', 'Reconnect');
    await cause({ wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: '' }, 'The accessory does not answer.', 'Reconnect');
    await cause({ wifi: true, ssid: 'NiceIT4WIFIAABBCC', module: true }, 'The phone is on the accessory’s setup Wi-Fi.', '');
    d.reachable = true;
    ok('reachable again: the line is empty and the pad has its colour back', env.line(d) === '' && r.nxUnsure(d) === '');
  }
  {
    // Reconnect: no sheet over the pad, the line says what happens, and the automatic attempts are not used up
    const env = await environment({ reachable: false, net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50' } }), d = env.dev(), r = env.$rootScope;
    await env.refresh();
    r.nxLineDo(d);
    await sleep(60);
    ok('Reconnect: one reconnect of the native layer, no probe (that is the automatic recovery), and the sheet of the status did not open', env.native.filter((c) => c.action === 'reconnect').length === 1 && env.native.filter((c) => c.action === 'probe').length === 0 &&
      env.w.document.getElementById('nx-sheet').style.display === 'none');
    ok('... meanwhile "Connecting to the accessory…" (busy) without a button, and the pad stays as it is', env.line(d) === 'Connecting to the accessory…' && r.nxLineKind(d) === 'busy' && r.nxLineAct(d) === '', env.line(d));
    r.nxLineDo(d);
    ok('... a second tap while it runs does nothing', env.native.filter((c) => c.action === 'reconnect').length === 1);
    await sleep(2800);
    ok('it did not help: "Still no answer. Tap the status for details." with Reconnect again', env.line(d) === 'Still no answer. Tap the status for details.' && r.nxLineAct(d) === 'Reconnect', env.line(d));
    ok('the LOG says that the line asked for it', env.logs.some((l) => l === '[NX] reconnect: asked from the status line'));
  }
  {
    // a sign of life: the app\'s flag is out of date
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope;
    await env.NHK.logs(d); await sleep(20);
    ok('the accessory answered a moment ago while the app\'s flag still says not reachable: the line does not claim that it does not answer, and the pad has its colour', env.line(d) === 'The accessory answered a moment ago.' && r.nxLineKind(d) === '' && r.nxUnsure(d) === '', [env.line(d), r.nxUnsure(d)]);
    env.clock.off += 16000;
    ok('... for 15 seconds', env.line(d) === 'The accessory does not answer.' && r.nxUnsure(d) === '1', env.line(d));
  }

  // ---------------------------------------------------------------- I-02: how far the state can be trusted
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope, W = env.w;
    ok('never asked in this session: no verdict (the lists show the state only when it is live)', r.nxTrust(d) === '' && W.__nxTrust(d) === '' && r.nxLine(d) === '');
    env.ctl.status = { hold: true };
    const p = env.NHK.status(d);
    ok('the state is being asked for: checking (busy line, "Checking the gate…")', r.nxTrust(d) === 'checking' && env.line(d) === 'Checking the gate…' && r.nxLineKind(d) === 'busy' && r.nxUnsure(d) === '');
    env.clock.off += 11000;
    ok('... and when it takes long: "Still checking. The accessory is slow to answer."', env.line(d) === 'Still checking. The accessory is slow to answer.');
    env.statusResolve('open'); await p; await sleep(20);
    ok('the answer: live, nothing in the line', r.nxTrust(d) === 'live' && env.line(d) === '' && r.nxLineKind(d) === '');
    ok('window.__nxTrust gives the same for the chip and the lists (also for a mac)', W.__nxTrust(d) === 'live' && W.__nxTrust(d.mac) === 'live' && W.NX.trust(d) === 'live');
    env.clock.off -= 3000;
    ok('QA review: a clock that is corrected by a few seconds does not change the verdict', r.nxTrust(d) === 'live', r.nxTrust(d));
    env.clock.off -= 2 * 3600 * 1000;
    ok('QA review: a clock set back by hours: how old the report is cannot be told, so the state is not live (stale)', r.nxTrust(d) === 'stale' && W.__nxTrust(d) === 'stale', r.nxTrust(d));
    env.clock.off += 2 * 3600 * 1000 + 3000;
    env.clock.off += 31000;
    ok('older than 30 s: aging, "Updated hh:mm" in plain words', r.nxTrust(d) === 'aging' && /^Updated \d\d:\d\d$/.test(env.line(d)) && r.nxLineKind(d) === '' && r.nxLineAct(d) === '', [r.nxTrust(d), env.line(d)]);
    r.nxBlock = () => 'Blocked · since 12:00';
    ok('... but a pill that says the gate is blocked keeps the place (the news is worth more)', env.line(d) === '' && r.nxTrust(d) === 'aging');
    r.nxBlock = undefined;
    env.clock.off += 60000;
    ok('older than 75 s and nothing heard from the accessory: stale, warn "Last confirmed hh:mm" with Refresh', r.nxTrust(d) === 'stale' && /^Last confirmed \d\d:\d\d$/.test(env.line(d)) && r.nxLineKind(d) === 'warn' && r.nxLineAct(d) === 'Refresh', [r.nxTrust(d), env.line(d)]);
    r.nxBlock = () => 'Blocked · since 12:00';
    ok('... and then nothing keeps the place from it', /^Last confirmed/.test(env.line(d)));
    r.nxBlock = undefined;
    ok('stale does not dim the pad (the pad is for the accessory that does not answer)', r.nxUnsure(d) === '');
    const n0 = env.calls.filter((c) => c.name === 'status').length;
    env.ctl.status = { state: 'open' };
    r.nxLineDo(d); await sleep(30);
    ok('Refresh asks for the state once more (the same request as when the screen is entered), and the answer makes it live', env.calls.filter((c) => c.name === 'status').length === n0 + 1 && r.nxTrust(d) === 'live' && env.line(d) === '', [r.nxTrust(d), env.line(d)]);
    ok('... and writes it like the app does', d.properties[0].value === 'open' && d.reachable === true);
  }
  {
    // the accessory answers (a log is read now and then): the state is only told when it changes, so it does not turn stale
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    env.ctl.status = {};
    await env.NHK.status(d); await sleep(20);
    env.clock.off += 70000;
    await env.NHK.logs(d); await sleep(10);
    env.clock.off += 70000;
    ok('140 s since the report, 70 s since the accessory last answered: still aging', r.nxTrust(d) === 'aging' && /^Updated/.test(env.line(d)), [r.nxTrust(d), env.line(d)]);
    env.clock.off += 20000;
    ok('... 90 s since it last answered: stale', r.nxTrust(d) === 'stale', r.nxTrust(d));
    env.w.__nxStateFreshMs = 100; env.w.__nxStateStaleMs = 200;
    const e2 = env.add('00:0B:6C:AA:BB:11');
    await env.NHK.status(e2); await sleep(20);
    ok('the thresholds can be set (window.__nxStateFreshMs, __nxStateStaleMs)', r.nxTrust(e2) === 'live'); await sleep(150);
    ok('... aging after the first', r.nxTrust(e2) === 'aging'); await sleep(250);
    ok('... stale after the second', r.nxTrust(e2) === 'stale');
  }
  {
    const env = await environment(), r = env.$rootScope;
    const a = env.add('00:0B:6C:AA:BB:21');
    env.ctl.status = { fail: 'timeout' };
    await env.NHK.status(a).then(() => {}, () => {}); await sleep(20);
    ok('the request for the state failed: stale, and the state that is shown is said to be the stored one', r.nxTrust(a) === 'stale' && env.line(a) === 'State not read. Showing the stored one.' && r.nxLineAct(a) === 'Refresh', [r.nxTrust(a), env.line(a)]);
    const m = env.add('00:0B:6C:AA:BB:22', { properties: [{ value: 'opening' }, { value: '0' }] });
    env.ctl.status = { state: 'opening' };
    await env.NHK.status(m); await sleep(20);
    env.clock.off += 80000;
    ok('stale while it was moving: "Last report: Opening hh:mm. Check the gate."', /^Last report: Opening \d\d:\d\d\. Check the gate\.$/.test(env.line(m)), env.line(m));
    // entering the screen: checking until the answer
    const e = env.add('00:0B:6C:AA:BB:23');
    env.handlers['$stateChangeSuccess'].forEach((f) => f({}, { name: 'tabsController.favorites-device-detail' }, { homeId: 1, mac: e.mac }));
    ok('entering the accessory screen: checking right away (before the app\'s request is on its way)', r.nxTrust(e) === 'checking' && env.line(e) === 'Checking the gate…');
    env.clock.off += 2000;
    ok('... and not for ever when nothing is asked', r.nxTrust(e) === '');
    // resume: what was confirmed before it is not live any more
    const l = env.add('00:0B:6C:AA:BB:24');
    await env.NHK.status(l); await sleep(20);
    ok('live before the app left', r.nxTrust(l) === 'live');
    env.clock.off += 5;
    env.w.document.dispatchEvent(new env.w.Event('resume'));
    ok('after the app came back, a report from before it is not live any more', r.nxTrust(l) !== 'live', r.nxTrust(l));
    env.ctl.status = { hold: true }; env.NHK.status(l);
    ok('... and while the app asks again it is "checking"', r.nxTrust(l) === 'checking');
  }
  {
    // the resume: the app marks every accessory "not reachable" and checks again; that is not a result
    const env = await environment(), r = env.$rootScope, d = env.dev(), W = env.w;
    ok('nxCheck is untouched when nothing happened', r.nxCheck(d) === '');
    d.reachable = false;
    ok('not reachable, but no resume: the app\'s flag counts (as before)', r.nxCheck(d) === '');
    env.clock.off += 5; W.document.dispatchEvent(new W.Event('resume'));
    ok('right after a resume: "checking" while the app\'s own check has not answered (hero: "Checking…", not a red "Not usable")', r.nxCheck(d) === 'checking' && env.line(d) === 'Checking the gate…', [r.nxCheck(d), env.line(d)]);
    d.reachable = true;
    ok('... the app has checked: nothing is held', r.nxCheck(d) === '');
    d.reachable = false;
    env.clock.off += 5;
    env.handlers['deviceUnreachable'].forEach((f) => f({}, { device: d }));
    ok('... a check that failed ends the wait at once: that is the answer', r.nxCheck(d) === '' && /^The accessory does not answer|^The phone|^The accessory answered/.test(env.line(d)), [r.nxCheck(d), env.line(d)]);
    const e = env.add('00:0B:6C:AA:BB:31', { reachable: false });
    env.clock.off += 20; W.document.dispatchEvent(new W.Event('resume'));
    ok('(a new resume holds again)', r.nxCheck(e) === 'checking');
    env.clock.off += 9000;
    ok('... but not for longer than 8 seconds', r.nxCheck(e) === '');
  }

  // ---------------------------------------------------------------- the messages that are not on the status line: the page of other commands, a scene, a screen without the line
  {
    const env = await environment({ route: 'tabsController.favorites-device-commands' }), d = env.dev(), W = env.w;
    await env.NHK.executeSecondaryCommand(d, '1', 'MDBk'); await sleep(20);
    ok('the page of other commands has no line: "Open and Block sent hh:mm:ss" is a toast', env.snacks().length === 1 && /^Open and Block sent \d\d:\d\d:\d\d$/.test(env.snacks()[0]), env.snacks());
    ok('... shown for 3.5 s', W.document.querySelector('.nx-snack') && env.timers.indexOf(3500) > -1);
    env.ctl.exec = { fail: { code: 'TIMEOUT' } };
    await env.NHK.executeSecondaryCommand(d, '1', 'MDFh').then(() => {}, () => {}); await sleep(20);
    ok('... a failure is a toast too, with the same words, and it stays 9 s (one at a time)', env.snacks().length === 1 && env.snacks()[0] === 'No answer to Release and Close. It may have arrived: check the gate.' && env.timers.indexOf(9000) > -1, [env.snacks(), env.timers.filter((t) => t > 3000)]);
    env.route.current.name = 'tabsController.favorites-scene-play';
    env.ctl.exec = {};
    await env.NHK.executeSecondaryCommand(d, '1', 'MDBk'); await sleep(20);
    ok('a scene that runs commands stays silent', env.snacks().length === 1 && /^No answer/.test(env.snacks()[0]), env.snacks());
    W.document.querySelectorAll('.nx-snack').forEach((n) => n.remove());
    env.route.current.name = 'tabsController.favorites-device-detail';
    await env.NHK.executePrimaryCommand(d, '1', 'close'); await sleep(20);
    ok('the accessory screen without a status line falls back to a toast (nothing is lost), under the header', env.snacks().length === 1 && /^Close sent/.test(env.snacks()[0]), env.snacks());
    W.document.querySelectorAll('.nx-snack').forEach((n) => n.remove());
    const line = W.document.createElement('div'); line.className = 'nx-line'; W.document.body.appendChild(line);
    await env.NHK.executePrimaryCommand(d, '1', 'open'); await sleep(20);
    ok('... with the line in the page there is no toast', env.snacks().length === 0);
    W.location.hash = '#/tabs/favorites-device-detail/1/' + MAC;
    W.document.body.removeChild(line);
    await env.NHK.executePrimaryCommand(d, '1', 'close'); await sleep(20);
    ok('a toast on the accessory screen is marked, so that the skin keeps it off the pad', W.document.querySelector('.nx-snack').getAttribute('data-nx-at') === 'top');
    W.location.hash = '#/tabs/favorites';
    await env.NHK.executePrimaryCommand(d, '1', 'open'); await sleep(20);
    ok('... and elsewhere it is where it always was', !W.document.querySelector('.nx-snack').hasAttribute('data-nx-at'));
  }

  {
    // a look-along must not leave a rejection unhandled (the app's own handler is the one that counts)
    const env = await environment(), d = env.dev();
    env.ctl.logsFail = true; env.ctl.verify = 'fail'; env.ctl.status = { fail: 'timeout' };
    await env.NHK.logs(d).then(() => {}, () => {}); await env.NHK.pairings(d).then(() => {}, () => {}); await env.NHK.verify(d).then(() => {}, () => {}); await env.NHK.status(d).then(() => {}, () => {});
    await sleep(60);
    ok('no wrapper leaves a rejection unhandled (logs, pairings, verify, status)', unhandled === 0, unhandled);
  }

  // ---------------------------------------------------------------- the words
  {
    const primary = produced.filter((t) => !/Open and Block|Release and Close|Block sent/.test(t)), other = produced.filter((t) => /Open and Block|Release and Close/.test(t));
    ok('every failure and status text is English, at most 63 characters for Open, Close and Stop (' + new Set(primary).size + ' texts)', primary.length > 30 && primary.every((t) => t.length <= 63), primary.filter((t) => t.length > 63));
    ok('... and at most 80 with the longest name of an extra button (' + new Set(other).size + ' texts)', other.every((t) => t.length <= 80), other.filter((t) => t.length > 80));
    ok('the room of the line: a text with a button is at most 49 characters (steps-command.cjs checks that it fits two lines at 360 dp), any other text at most 76 (' + new Set(withAct).size + ' with a button)',
      withAct.length >= 6 && withAct.every((x) => x.length <= 49) && produced.every((x) => x.length <= 76), [withAct.filter((x) => x.length > 49), produced.filter((x) => x.length > 76)]);
    {
      // a long text loses its button: the line has no room for both
      const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope;
      env.net = { wifi: false, vpn: false, cellular: true }; await env.refresh();
      ok('the cause with the most words still has its button (45 characters)', r.nxLine(d) === 'No Wi-Fi, and the Nice cloud does not answer.' && r.nxLineAct(d) === 'Reconnect');
      const e2 = await environment(), d2 = e2.dev();
      e2.ctl.connect = { fail: { code: 'TIMEOUT' } };
      e2.tap(d2, 'MDFh', false, e2.app(d2)); await sleep(40);
      ok('a long name makes the text too long for a button: the words stay, the button goes', e2.line(d2) === 'No connection to the accessory. Release and Close not sent.' && e2.$rootScope.nxLineAct(d2) === '', [e2.line(d2), e2.$rootScope.nxLineAct(d2)]);
    }
    ok('no failure text promises what cannot be known ("accepted", "will be sent", "delivered")', produced.every((t) => !/accepted|will be sent|delivered|confirmed by the accessory/i.test(t)));
  }
  finish();
})().catch((e) => { console.log('TEST ERROR ' + (e && e.stack || e)); process.exit(1); });
