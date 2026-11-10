// nx23 QA round, workstreams "gate" and "command" on the MERGED build: what the two could not see alone.
//   * one name for the feature everywhere ("Extra buttons"), the line is a live region that is assertive for a failure
//   * the ledger of nx-patch.js (section 9) under adversarial use: a double tap, a check of the app that never comes back, a stale tap that must not take a later send, hooks that throw,
//     a second accessory, a resume, memory and timers; the width of the screen decides whether a button fits next to a text
// nx-patch.js runs in jsdom with a simulated Angular, Cordova and service as in test/nx23-command.test.js (the app's runCommand is simulated with its real rules).
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-qa-gate.test.js
const fs = require('fs');
const path = require('path');
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

// ====================================================================================================== one name, one live region (no DOM needed)
{
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const product = ['patch-12-extra-commands.py', 'patch-18-accessory-layout.py', 'nx-patch.js', 'nx-activity.js', 'nx-gallery.js', 'skin/copy/command.json', 'skin/copy/lists.json', 'skin/copy/copy.json']
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  const visible = [];
  // the words that a person can read or hear: string literals and attributes (comments and docstrings may say "commands")
  product.forEach((f) => { let doc = false; read(f).split('\n').forEach((line, i) => {
    if (f.endsWith('.py') && (line.match(/"""/g) || []).length % 2 === 1) { doc = !doc; return; }       // (the docstring of a script explains the old names)
    if (doc || /^\s*"_about"/.test(line)) return;
    const code = f.endsWith('.py') ? line.replace(/#.*$/, '') : line.replace(/\/\/.*$/, '');
    if (/(["'>])(Extra commands|Optional command|Choose commands|Edit extra commands)\b/.test(code) || /aria-label=\\?"Extra commands\\?"/.test(code)) visible.push(f + ':' + (i + 1) + ' ' + line.trim().slice(0, 100));
  }); });
  ok('wording: no visible "Extra commands", "Optional command" or "Choose commands" is left in what the patches add (the feature is "Extra buttons")', visible.length === 0, visible);
  const p18 = read('patch-18-accessory-layout.py');
  ok('wording: the caption over the extras and the name of the group for a screen reader both say "Extra buttons"', />Extra buttons<\/div>/.test(p18) && /aria-label="Extra buttons"/.test(p18));
  const p12 = read('patch-12-extra-commands.py');
  ok('wording: the link says "Edit extra buttons" / "Add extra buttons" (patch-12) and the page is named "Extra buttons" (copy)', /Edit extra buttons/.test(p12) && /Add extra buttons/.test(p12) &&
    JSON.parse(read('skin/copy/command.json')).SETTINGS_DEVICE_4TH_BUTTON_PAGE_TITLE === 'Extra buttons');
  ok('live region: the line follows nxLineLive (assertive for a failure, guarded so that the template works without nx-patch.js), role status stays', /aria-live="\{\{\{\{ nxLineLive \? nxLineLive\(data\.device\) : 'polite' \}\}\}\}"/.test(p18) && /role="status"/.test(p18));
  const css = read('skin/src/nx23-command.css');
  ok('css: the glyph before the text of the line does not add to the height of the line (two lines of 20 dp must fit the 40 dp box)', /margin: -4px 8px -4px 0; vertical-align: baseline/.test(css) && !/margin: 0 8px 0 0; vertical-align: -4px/.test(css));
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
  // ---------------------------------------------------------------- the line is a live region that is assertive for a failure
  {
    const env = await environment(), r = env.$rootScope, d = env.dev(), app = env.app(d);
    ok('live: nothing to say -> polite; a command on its way -> polite', r.nxLineLive(d) === 'polite');
    env.ctl.exec = { delay: 40 };
    env.tap(d, 'open', true, app);
    ok('live: "Sending Open…" is polite', r.nxLineLive(d) === 'polite' && r.nxLineKind(d) === 'busy');
    await sleep(90);
    env.ctl.exec = { fail: { code: 'TIMEOUT' } };
    await sleep(520);
    env.tap(d, 'close', true, app); await sleep(60);
    ok('live: a failure ("No answer to Close...") is assertive', r.nxLineKind(d) === 'bad' && r.nxLineLive(d) === 'assertive', [r.nxLine(d), r.nxLineLive(d)]);
    const env2 = await environment(), d2 = env2.dev(), r2 = env2.$rootScope;
    env2.report(MAC, 'closed'); env2.clock.off += 31000;
    ok('live: the plain "Updated hh:mm" that appears 30 s after every report of the state is not announced (aria-live off): it is there to be read', /^Updated \d\d:\d\d$/.test(r2.nxLine(d2)) && r2.nxLineKind(d2) === '' && r2.nxLineLive(d2) === 'off', [r2.nxLine(d2), r2.nxLineLive(d2)]);
    ok('live: it gives a string (a template binding must not get an object)', typeof r.nxLineLive(d) === 'string' && typeof r.nxLineLive(undefined) === 'string' && r.nxLineLive(undefined) === 'polite');
  }

  // ---------------------------------------------------------------- a double tap is one command, and the line says what became of it
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope, app = env.app(d);
    env.ctl.exec = { delay: 120 };
    env.tap(d, 'close', true, app); await sleep(100);
    env.tap(d, 'close', true, app);
    ok('double tap on Close: one command went out', env.codes() === 'close', env.codes());
    ok('... and the line does not say that it was not sent: it is about the first tap (sending)', r.nxLine(d) === 'Sending Close…' && r.nxLineKind(d) === 'busy', [r.nxLine(d), r.nxLineKind(d)]);
    await sleep(160);
    ok('... then "Close sent hh:mm:ss" (the second tap leaves nothing in the line)', /^Close sent \d\d:\d\d:\d\d$/.test(r.nxLine(d)), r.nxLine(d));
    const led = env.w.NX.ledger()[MAC].cmds;
    ok('... the ledger marks the repeat as skipped and done', led.length === 2 && led[1].phase === 'skipped' && led[1].done === true, led.map((c) => c.code + ':' + c.phase));
    env.ctl.exec = {};
    env.tap(d, 'close', true, app); await sleep(30);
    // (a different command inside the guard is still said to be not sent)
    const env2 = await environment(), d2 = env2.dev(), r2 = env2.$rootScope, app2 = env2.app(d2);
    env2.tap(d2, 'open', true, app2); await sleep(80);
    env2.tap(d2, 'close', true, app2);
    ok('Open, then Close inside the guard: Close is not sent and the line says so (this is not a repeat)', env2.codes() === 'open' && r2.nxLine(d2) === 'Too soon after the last command. Close not sent: tap again.', [env2.codes(), r2.nxLine(d2)]);
    // (Stop is untouched by this: a second Stop inside the guard but after the double-tap window is sent)
    const env3 = await environment(), d3 = env3.dev(), app3 = env3.app(d3);
    env3.tap(d3, 'stop', true, app3); await sleep(200); env3.tap(d3, 'stop', true, app3);
    ok('Stop twice 200 ms apart: both are sent (a repeat is never swallowed for Stop)', env3.codes() === 'stop,stop', env3.codes());
    // a block command tapped twice
    const env4 = await environment(), d4 = env4.dev(), r4 = env4.$rootScope, app4 = env4.app(d4);
    env4.tap(d4, 'MDBk', false, app4); await sleep(100); env4.tap(d4, 'MDBk', false, app4);
    ok('an extra button tapped twice: one call, the line is about the first', env4.codes() === 'MDBk' && !/not sent/.test(r4.nxLine(d4)), [env4.codes(), r4.nxLine(d4)]);
  }

  // ---------------------------------------------------------------- a check of the app that never comes back
  {
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope, app = env.app(d);
    env.ctl.verify = 'hold';
    env.tap(d, 'open', true, app); await sleep(30);
    ok('waiting: "Waiting for the accessory…" while the check runs', r.nxLine(d) === 'Waiting for the accessory. Open is not sent if it stays silent.' && r.nxLineKind(d) === 'busy');
    env.clock.off += 12000;
    ok('... after 10 s "Still waiting."', /^Still waiting\./.test(r.nxLine(d)) && r.nxLineKind(d) === 'busy', r.nxLine(d));
    env.clock.off += 40000;
    ok('... after 45 s it is no longer a busy loader: it says what is true (it may still be sent, late)', r.nxLineKind(d) === 'warn' && r.nxLine(d) === 'No answer from the accessory yet. Open may still be sent: check the gate.', [r.nxLineKind(d), r.nxLine(d)]);
    env.clock.off += 100000;
    ok('... after 2 minutes the line has the accessory\'s own state again (it does not answer: the cause and Reconnect)', r.nxLine(d) === 'The accessory does not answer.' && r.nxLineAct(d) === 'Reconnect' && r.nxLineKind(d) === 'bad', [r.nxLine(d), r.nxLineAct(d)]);
    env.verifyResolve(); await sleep(40);
    ok('... and when the check comes back after all, the command is sent and the line says so (a new command: nothing is hidden)', env.codes() === 'open' && /^(Sending Open|Open sent)/.test(r.nxLine(d)), [env.codes(), r.nxLine(d)]);
  }
  {
    // a tap that waited for a check that never came back must not take the send of a later tap
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope, app = env.app(d);
    env.ctl.verify = 'hold';
    env.tap(d, 'open', true, app); await sleep(30);
    d.reachable = true; env.clock.off += 5000;
    env.tap(d, 'open', true, app); await sleep(30);
    ok('a later tap of the same command is the one that is sent (not "not sent: tap again")', env.codes() === 'open' && /^(Sending Open|Open sent)/.test(r.nxLine(d)) && !/not sent/.test(r.nxLine(d)), [env.codes(), r.nxLine(d)]);
    const ph = env.w.NX.ledger()[MAC].cmds.map((c) => c.phase);
    ok('... the ledger gives the send to the new tap', ph[ph.length - 1] === 'sent' || ph[ph.length - 1] === 'sending', ph);
  }

  // ---------------------------------------------------------------- the room for a button depends on the width of the screen
  {
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope;
    env.w.NX.refresh && 0;
    // "The phone is on another Wi-Fi than the accessory." is 49 characters and has Reconnect
    env.net.ssid = 'GuestWifi'; await env.refresh();
    const wide = [r.nxLine(d), r.nxLineAct(d)];
    ok('360 dp or more (jsdom: 1024): the 49 characters keep their button', wide[0] === 'The phone is on another Wi-Fi than the accessory.' && wide[1] === 'Reconnect', wide);
    env.w.innerWidth = 320;
    const narrow = [r.nxLine(d), r.nxLineAct(d)];
    ok('320 dp: only about 35 characters fit next to a button (measured): the text stays whole, the button goes (the chip and its sheet have Reconnect)', narrow[0] === wide[0] && narrow[1] === '', narrow);
    env.w.innerWidth = 360;
    ok('360 dp: it is back', r.nxLineAct(d) === 'Reconnect');
    env.w.innerWidth = 320;
    ok('320 dp: a short text keeps its button ("Last confirmed 12:03" + Refresh is the stale line; here "The accessory does not answer.")', (function () { env.net.ssid = 'HomeWifi'; return true; })() && (env.refresh(), true));
    await sleep(40);
    ok('... "The accessory does not answer." (30) still has Reconnect at 320 dp', r.nxLine(d) === 'The accessory does not answer.' && r.nxLineAct(d) === 'Reconnect', [r.nxLine(d), r.nxLineAct(d)]);
  }

  // ---------------------------------------------------------------- hooks that throw: the app's own service call is never prevented
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope, app = env.app(d);
    r.nxState = function () { throw new Error('hook broken'); };       // nx-activity.js broke
    let threw = false;
    try { env.tap(d, 'open', true, app); } catch (e) { threw = true; }
    ok('nxState throws: the tap still reaches the app, the service is called, nothing is thrown at the template', !threw && app.calls === 1 && env.codes() === 'open', [threw, app.calls, env.codes()]);
    ok('... and the line functions never throw (they answer with an empty line)', (function () { try { return typeof r.nxLine(d) === 'string' && typeof r.nxLineKind(d) === 'string' && typeof r.nxTrust(d) === 'string'; } catch (e) { return false; } })());
    const env2 = await environment(), d2 = env2.dev();
    env2.w.localStorage.getItem = function () { throw new Error('storage broken'); };
    env2.w.document.querySelector = function () { throw new Error('dom broken'); };
    let ret, threw2 = false;
    try { ret = env2.NHK.executePrimaryCommand(d2, '1', 'open'); } catch (e) { threw2 = true; }
    ok('the DOM and the storage throw: the wrapper of the service still returns the service\'s own promise', !threw2 && ret === env2.lastPromise && env2.codes() === 'open');
    const env3 = await environment(), d3 = env3.dev();
    const orig = env3.NHK.executePrimaryCommand;
    env3.ctl.exec = {};
    let got = 'none';
    try { got = await env3.NHK.executePrimaryCommand(d3, '1', 'close'); } catch (e) { got = 'threw'; }
    ok('a result goes on unchanged (resolved with the service\'s value)', got && typeof got === 'object');
    // a service that throws synchronously: the exception is the app's own, the ledger says it failed
    const env4 = await environment(), d4 = env4.dev(), r4 = env4.$rootScope;
    const base = env4.NHK.executePrimaryCommand.__nxCmd;
    ok('(the wrappers are installed once: __nxCmd)', base === true);
    // the app's runCommand that is not a function at all
    ok('nxRun without a function of the app does nothing and does not throw', r4.nxRun(d4, 'open', true, null) === undefined && r4.nxRun(undefined, 'open', true, function () { return 7; }) === 7);
    // a device without a mac, without automations, a string instead of a device
    ok('odd devices: the line functions answer with empty strings', [undefined, null, {}, { mac: 'x' }, 'x', 5].every((x) => { try { return r4.nxLine(x) === '' && r4.nxLineKind(x) === '' && r4.nxLineAct(x) === '' && typeof r4.nxTrust(x) === 'string'; } catch (e) { return false; } }));
    ok('odd devices: nxRun passes the tap on to the app (the device is the app\'s business)', r4.nxRun({}, 'open', true, function (c, p) { return c + String(p); }) === 'opentrue');
  }

  // ---------------------------------------------------------------- a second accessory has its own ledger; nothing of the first leaks over
  {
    const env = await environment(), d1 = env.dev(), r = env.$rootScope;
    const d2 = env.add('00:0B:6C:AA:BB:DD', { properties: [{ value: 'open' }, { value: '0' }] });
    env.ctl.exec = { delay: 30 };
    env.tap(d1, 'close', true, env.app(d1)); await sleep(60);
    ok('a second accessory: the first one\'s command is not on its line', /^Close sent/.test(r.nxLine(d1)) && r.nxLine(d2) === '' && r.nxLineKind(d2) === '' && r.nxTrust(d2) === '', [r.nxLine(d1), r.nxLine(d2)]);
    env.report('00:0B:6C:AA:BB:DD', 'closing');
    ok('... a report of the state of the second one does not clear the first one\'s line, and gives the second its trust', /^Close sent/.test(r.nxLine(d1)) && r.nxTrust(d2) === 'live' && r.nxTrust(d1) === '', [r.nxLine(d1), r.nxTrust(d1), r.nxTrust(d2)]);
    d2.reachable = false;
    ok('... a second accessory that has just answered is not marked as silent (the app\'s flag is out of date until it checks again)', r.nxUnsure(d2) === '' && r.nxLine(d2) === 'The accessory answered a moment ago.', [r.nxUnsure(d2), r.nxLine(d2)]);
    env.clock.off += 20000;
    ok('... 20 s later it is: the cause and Reconnect on its line, the pad dimmed; the first accessory is not touched', r.nxUnsure(d2) === '1' && r.nxLineAct(d2) === 'Reconnect' && r.nxUnsure(d1) === '' && !/does not answer/.test(r.nxLine(d1)), [r.nxUnsure(d1), r.nxUnsure(d2), r.nxLine(d1), r.nxLine(d2)]);
    ok('... and Stop is the same call for both: the service gets the device that was tapped', (function () { env.ctl.exec = {}; env.tap(d1, 'stop', true, env.app(d1)); const c = env.calls.filter((x) => x.code === 'stop'); return c.length === 1; })());
  }

  // ---------------------------------------------------------------- a resume: the app marks the accessory not reachable until it has checked again
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    env.report(MAC, 'closed');
    ok('before the resume: live', r.nxTrust(d) === 'live');
    env.clock.off += 3000;
    d.reachable = false;                                          // what the app does to every accessory on resume
    env.w.document.dispatchEvent(new env.w.Event('resume'));
    ok('right after a resume the old state is not "live" any more, and the red "does not answer" is held back as "checking" for a few seconds', r.nxTrust(d) !== 'live' && r.nxLine(d) === 'Checking the gate…' && r.nxLineKind(d) === 'busy' && r.nxUnsure(d) === '', [r.nxTrust(d), r.nxLine(d), r.nxUnsure(d)]);
    env.clock.off += 20000;
    ok('... after 8 s without an answer the hold ends: the accessory does not answer (said, with Reconnect)', r.nxLine(d) === 'The accessory does not answer.' && r.nxLineAct(d) === 'Reconnect' && r.nxUnsure(d) === '1', [r.nxLine(d), r.nxUnsure(d)]);
    env.report(MAC, 'open');
    ok('... a report after the resume makes it live again', r.nxTrust(d) === 'live');
  }

  // ---------------------------------------------------------------- memory and timers: nothing grows with use
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    let intervals = 0;
    const realSetInterval = env.w.setInterval.bind(env.w);
    env.w.setInterval = function () { intervals++; return realSetInterval.apply(null, arguments); };
    env.timers.length = 0;
    for (let i = 0; i < 300; i++) env.report(MAC, i % 2 ? 'opening' : 'closing');
    ok('300 reports of the state start no interval (the only interval of section 9 is the one that was started once, every 5 s on the accessory screen)', intervals === 0, intervals);
    ok('... each report asks for two redraws at most (when the state turns old: 30 s, 75 s): 600 one-shot timers, none repeating', env.timers.length <= 2 * 300 + 40, env.timers.length);
    for (let i = 0; i < 100; i++) { env.ctl.exec = {}; env.tap(d, i % 2 ? 'open' : 'close', true, env.app(d)); }
    const led = env.w.NX.ledger()[MAC];
    ok('100 taps: the list of commands of an accessory keeps at most 8', led.cmds.length <= 8, led.cmds.length);
    ok('... the ledger is one entry per accessory (nothing per tap or per report)', Object.keys(env.w.NX.ledger()).length === 1, Object.keys(env.w.NX.ledger()));
    // digests: the functions of the line give the same strings for the same moment (a template binding that changed on every call would never settle)
    const a = [r.nxLine(d), r.nxLineKind(d), r.nxLineAct(d), r.nxLineLive(d), r.nxTrust(d), r.nxUnsure(d)].join('|'), b = [r.nxLine(d), r.nxLineKind(d), r.nxLineAct(d), r.nxLineLive(d), r.nxTrust(d), r.nxUnsure(d)].join('|');
    ok('the line functions are pure for one moment: two calls, the same strings', a === b, [a, b]);
  }
  // ---------------------------------------------------------------- a request for the state that never comes back (no answer and no error): after the time of a check it is not "nothing known"
  {
    const env = await environment(), d = env.dev(), r = env.$rootScope;
    env.ctl.status = { hold: true };
    (env.handlers['$stateChangeSuccess'] || []).forEach((h) => h({}, { name: 'tabsController.favorites-device-detail' }, { mac: MAC }));
    env.NHK.status(d);
    ok('a request for the state is out: "Checking the gate…"', r.nxTrust(d) === 'checking' && r.nxLine(d) === 'Checking the gate…');
    env.clock.off += 23000;
    ok('... after 10 s: "Still checking. The accessory is slow to answer."', r.nxLine(d) === 'Still checking. The accessory is slow to answer.');
    env.clock.off += 30000;
    ok('... after 45 s with no answer and no error it is stale, not silent: "State not read. Showing the stored one." with Refresh (the stored state of the last session is not shown as if it were live)',
      r.nxTrust(d) === 'stale' && r.nxLineKind(d) === 'warn' && r.nxLine(d) === 'State not read. Showing the stored one.' && r.nxLineAct(d) === 'Refresh', [r.nxTrust(d), r.nxLine(d), r.nxLineAct(d)]);
    env.clock.off += 600000;
    ok('... and it stays so (10 minutes later)', r.nxTrust(d) === 'stale' && r.nxLineAct(d) === 'Refresh');
    env.ctl.status = {}; env.NHK.status(d); await sleep(40);
    ok('a new request that is answered makes it live again', r.nxTrust(d) === 'live' && r.nxLine(d) === '', [r.nxTrust(d), r.nxLine(d)]);
    // the same after a state was read: the last report is what the line says
    const env2 = await environment(), d2 = env2.dev(), r2 = env2.$rootScope;
    env2.report(MAC, 'open'); env2.clock.off += 100000;
    env2.ctl.status = { hold: true }; env2.NHK.status(d2);
    env2.clock.off += 50000;
    ok('a state was read, the next request never comes back: "Last confirmed hh:mm" with Refresh', r2.nxTrust(d2) === 'stale' && /^Last confirmed \d\d:\d\d$/.test(r2.nxLine(d2)) && r2.nxLineAct(d2) === 'Refresh', [r2.nxTrust(d2), r2.nxLine(d2)]);
  }

  // ---------------------------------------------------------------- the button of the line goes away when the line changes: the keyboard focus stays in the line
  {
    const env = await environment({ reachable: false }), d = env.dev(), r = env.$rootScope, doc = env.w.document;
    doc.body.innerHTML = '<div class="nx-line"><button class="nx-line-act">Reconnect</button></div><button id="other">other</button>';
    const btn = doc.querySelector('.nx-line-act'), line = doc.querySelector('.nx-line');
    btn.focus();
    ok('the accessory does not answer: the line offers Reconnect, and the button has the focus', r.nxLineAct(d) === 'Reconnect' && doc.activeElement === btn);
    r.nxLineDo(d);
    ok('after the button was used the focus is on the line itself (tabindex -1: reachable by script, not a new tab stop)', doc.activeElement === line && line.getAttribute('tabindex') === '-1', [doc.activeElement && doc.activeElement.className]);
    doc.querySelector('#other').focus();
    r.nxLineDo(d);
    ok('a use of the action while the focus is somewhere else (a touch) does not take the focus', doc.activeElement === doc.querySelector('#other'));
    ok('css: a ring says where the focus is (the line is not a control: only :focus-visible, inside the 4 dp that the pad keeps clear)', /\.nx-line:focus-visible \{ outline: 2px solid var\(--md-sys-color-secondary\); outline-offset: 0; \}/.test(fs.readFileSync(path.join(ROOT, 'skin/src/nx23-gate.css'), 'utf8')));
  }
  ok('no promise of the code under test was left without a handler', unhandled === 0, unhandled);
  finish();
})();
