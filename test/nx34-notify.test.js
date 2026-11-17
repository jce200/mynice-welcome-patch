// nx34: a notification of Android when the gate moves (Settings > Notifications).
//   * patch-25-notify.py on an invented settings page; the manifest lines of patch-05; what the native layer promises (read from its source: it cannot run here)
//   * nx-patch.js in jsdom: the switch asks the native layer, every state that is learned is passed on, and the connection is checked while the app is in the background
// The decision what to tell (NxWatch.decide) and the reading of an event are tested on a JVM: java/test/com/nice/patch/NxTest.java.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx34-notify.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
}
const MAC = '00:0B:6C:AA:BB:CC';

// ====================================================================================================== patch-25-notify.py
{
  const PAGE = ['<ion-view>', '    <div class="item item-divider">Homes</div>', '    <div class="item item-divider" data-ng-if="nxSetTheme">Appearance</div>', '    <div class="item nx-theme-row"></div>', '</ion-view>', ''].join('\n');
  const mk = (text) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx34-'));
    const f = path.join(dir, 'assets', 'www', 'templates', 'settings', 'settings.html');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    return { dir, f };
  };
  const run = (dir) => spawnSync('python3', ['-I', path.join(ROOT, 'patch-25-notify.py'), dir], { encoding: 'utf8' });
  const a = mk(PAGE), r1 = run(a.dir), out = fs.readFileSync(a.f, 'utf8');
  ok('patch-25: applies after patch-13 (the heading Appearance is its anchor)', r1.status === 0, r1.stderr || r1.stdout);
  ok('patch-25: a group "Notifications" before Appearance, only with nx-patch.js', /data-ng-if="nxSetNotify">Notifications<\/div>/.test(out) && out.indexOf('>Notifications<') < out.indexOf('>Appearance<') && out.indexOf('>Homes<') < out.indexOf('>Notifications<'));
  ok('patch-25: the switch is a named checkbox that shows nxNotify and asks nxSetNotify for the opposite', /class="item item-toggle nx-notify-row" data-ng-if="nxSetNotify"/.test(out) &&
    /<input type="checkbox" aria-label="Notify when the gate moves" data-ng-checked="nxNotify\(\)" data-ng-click="nxSetNotify\(!nxNotify\(\)\)">/.test(out));
  ok('patch-25: it says what it costs (awake in the background, a permanent notification, battery) and what ends it', /nx-notify-note"[^>]*>[^<]*stays awake in the background[^<]*permanent notification[^<]*battery[^<]*Swiping the app away stops it\./.test(out));
  ok('patch-25: the two rows to the settings of Android are only there while it is on and Android stands in the way', /nx-notify-fix" data-ng-if="nxSetNotify && nxNotify\(\) && nxNotifyInfo\(\)\.allowed === false" data-ng-click="nxNotifySettings\('notifications'\)"/.test(out) &&
    /nx-notify-fix" data-ng-if="nxSetNotify && nxNotify\(\) && nxNotifyInfo\(\)\.battery === false" data-ng-click="nxNotifySettings\('battery'\)"/.test(out));
  ok('patch-25: nothing else changed', PAGE.split('\n').every((l) => out.split('\n').indexOf(l) >= 0) && out.replace(/    <div class="item item-divider" data-ng-if="nxSetNotify">[\s\S]*?(?=    <div class="item item-divider" data-ng-if="nxSetTheme">)/, '') === PAGE);
  const r2 = run(a.dir);
  ok('patch-25: a second run refuses and leaves the file as it is', r2.status !== 0 && /already patched/.test(r2.stderr + r2.stdout) && fs.readFileSync(a.f, 'utf8') === out);
  const b = mk(PAGE.replace('Appearance', 'Looks')), r3 = run(b.dir);
  ok('patch-25: without its anchor the file is not touched', r3.status !== 0 && fs.readFileSync(b.f, 'utf8') === PAGE.replace('Appearance', 'Looks'));
  fs.rmSync(a.dir, { recursive: true, force: true }); fs.rmSync(b.dir, { recursive: true, force: true });
  ok('build.sh: patch-25-notify.py runs after patch-13-theme.py and before patch-21-copy.py', /patch-13-theme\.py[^;]*patch-25-notify\.py patch-21-copy\.py; do/.test(read('build.sh')));
  const css = read('skin/src/nx34-notify.css');
  ok('css: every class of the new rows has a rule', ['nx-notify-row', 'nx-notify-note', 'nx-notify-fix'].every((c) => css.indexOf('.' + c) >= 0));
}

// ====================================================================================================== the manifest and the native layer (their source)
{
  const p5 = read('patch-05-native-hooks.py');
  ok('manifest: the service is declared, not exported', /<service android:exported="false" android:name="com\.nice\.patch\.NxWatchService"\/>/.test(p5));
  ok('manifest: the permissions for a foreground service, for notifying (Android 13) and for asking to run while the phone sleeps', ['FOREGROUND_SERVICE', 'POST_NOTIFICATIONS', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'].every((x) => p5.indexOf('android.permission.' + x + '"/>') >= 0));
  const svc = read('java/src/com/nice/patch/NxWatchService.java'), w = read('java/src/com/nice/patch/NxWatch.java'), plug = read('java/src/com/nice/patch/NxPlugin.java'), nx = read('java/src/com/nice/patch/Nx.java');
  ok('service: it becomes a foreground service at once, and a failure there ends it instead of the app', /onCreate\(\) \{\s*super\.onCreate\(\);\s*try \{\s*startForeground\(NxWatch\.ID_WATCH, NxWatch\.watching\(this\)\);\s*\} catch \(Throwable t\) \{[^}]*stopSelf\(\);/.test(svc));
  ok('service: Android does not restart it by itself, and it ends when the app is swiped away (nothing could be heard then)', /return START_NOT_STICKY;/.test(svc) && /onTaskRemoved\(Intent rootIntent\) \{[\s\S]*stopSelf\(\);/.test(svc) && !/START_STICKY/.test(svc));
  ok('native: nothing is notified while the app is on the screen or the switch is off; the state is remembered all the same', /e\.apply\(\);\s*Notice n = decide\(prev, prevObst, state, obst\);\s*if \(n == null \|\| appVisible \|\| !p\.getBoolean\("on", false\)\) return;/.test(w));
  ok('native: the plugin follows the life of the activity, and starts the service again with the app when the switch is on', /onPause\(boolean multitasking\) \{ NxWatch\.appVisible = false; \}/.test(plug) && /onResume\(boolean multitasking\) \{ NxWatch\.appVisible = true; \}/.test(plug) &&
    /if \(NxWatch\.enabled\(ctx\)\) NxWatch\.setEnabled\(ctx, true\);/.test(plug));
  ok('native: every event of the accessory passes NxWatch before anything else, and that never throws', /public static void noteEvent\(String xml\) \{\s*NxWatch\.fromEvent\(xml\);/.test(nx) && /static void fromEvent\(String xml\) \{\s*try \{[\s\S]*?\} catch \(Throwable ignored\) \{ \}\s*\}/.test(w));
  ok('native: a notification that asks for attention replaces the one that is shown with a sound (cancel, then notify); a quiet one only alerts once', /\.setOnlyAlertOnce\(!n\.alert\)/.test(w) && /if \(n\.alert\) nm\.cancel\(id\);[^\n]*\n\s*nm\.notify\(id, b\.build\(\)\);/.test(w));
  ok('native: the icon of a notification always exists (the one of the kit, else the icon of the app), and the intent cannot be changed by others', /getIdentifier\("nx_stat", "drawable"/.test(w) && /return ctx\.getApplicationInfo\(\)\.icon;/.test(w) && /PendingIntent\.FLAG_IMMUTABLE/.test(w));
  ok('native: the actions of the plugin', ['"watch"', '"watchState"', '"gateState"', '"openSettings"'].every((a) => plug.indexOf(a + '.equals(action)') >= 0));
}

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom); ' + total + ' checks without it ' + (failures ? 'FAILED' : 'passed'));
  process.exit(failures ? 1 : 0);
}

// ====================================================================================================== nx-patch.js in jsdom
async function environment(scen) {
  scen = scen || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.log = () => {};
  const device = { mac: MAC, address: '10.0.0.20', name: 'NiceIT4WIFIAABBCC', description: 'Front gate', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret', reachable: true, favorites: true,
    permissions: { isAdmin: true, isUser: true }, properties: [{ value: 'closed' }, { value: '0' }], automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'], secondaryCommands: [] }] };
  const HS = { homes: [{ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: [device] }], updateDevice() {} };
  w.localStorage.setItem('keyHomes', JSON.stringify(HS.homes));
  const env = { w, native: [], verifies: 0, info: Object.assign({ on: false, allowed: true, battery: true }, scen.info || {}), status: { state: 'closed', obstruct: '0' } };
  w.cordova = { exec(okCb, failCb, svc, action, args) {
    env.native.push({ action, args });
    setTimeout(() => { switch (action) {
      case 'netState': return okCb({ wifi: true, ssid: 'HomeWifi', ip: '10.0.0.5', validated: true });
      case 'probe': return okCb({ ok: true, tcpMs: 20, tlsMs: 100 });
      case 'version': return okCb('nx-test');
      case 'watchState': return okCb(env.info);
      case 'watch': if (scen.watchFails) return failCb('no'); env.info = Object.assign({}, env.info, { on: args[0] === true }); return okCb(env.info);
      case 'logStream': return;
      default: return okCb(); } }, 0);
  } };
  const NHK = {
    setAccessoryType() {}, connect: () => Promise.resolve(), verify: () => Promise.resolve({ isAdmin: true, isUser: true }),
    status() { return scen.statusFails ? Promise.reject({ code: '7' }) : Promise.resolve({ devices: [{ properties: [{ value: env.status.state }, { value: env.status.obstruct }] }] }); },
    logs: () => Promise.resolve({ deviceLogs: [], interfaceLogs: [] }), pairings: () => Promise.resolve({ activeUsers: [], waitingUsers: [] }),
    executePrimaryCommand: () => Promise.resolve({}), executeSecondaryCommand: () => Promise.resolve({})
  };
  const handlers = {};
  const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability(d) { env.verifies++; return { promise: Promise.resolve(d) }; } };
  const services = { $rootScope, $q: { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } }, $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)),
    NHKPluginService: NHK, HomeService: HS, $ionicPopup: { confirm: () => Promise.resolve(true) }, $translate: { instant: (k) => k }, $state: { current: { name: 'tabsController.settings' }, go() {} } };
  w.angular = { element: () => ({ injector: () => ({ has: (n) => n in services, get: (n) => services[n] }) }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9; w.__nxNotifyTickMs = 80;
  w.eval(read('nx-patch.js'));
  await sleep(700);
  env.r = $rootScope; env.NHK = NHK; env.device = device;
  env.calls = (action) => env.native.filter((c) => c.action === action);
  env.fire = (name) => w.document.dispatchEvent(new w.Event(name));
  return env;
}

(async () => {
  {
    const env = await environment(), r = env.r;
    ok('start: the native layer is asked whether it is on (it keeps that), and nothing is switched', env.calls('watchState').length === 1 && env.calls('watch').length === 0 && r.nxNotify() === false && r.nxNotifyInfo().allowed === true);
    r.nxSetNotify(true);
    ok('switch: on at once for the eye', r.nxNotify() === true);
    await sleep(30);
    ok('switch: the native layer is told, and its answer is what the page shows', env.calls('watch').length === 1 && env.calls('watch')[0].args[0] === true && r.nxNotify() === true && r.nxNotifyInfo().on === true);
    r.nxSetNotify('yes'); await sleep(30);
    ok('switch: anything but true is off', env.calls('watch')[1].args[0] === false && r.nxNotify() === false);
    r.nxNotifySettings('battery'); r.nxNotifySettings('notifications'); r.nxNotifySettings('rm -rf');
    ok('settings: only the two pages of Android can be asked for', env.calls('openSettings').map((c) => c.args[0]).join() === 'battery,notifications,notifications');

    // every state that is learned goes to the native layer, which drops what it knew
    const before = env.calls('gateState').length;
    env.w.dispatchEvent(Object.assign(new env.w.Event('newDeviceState'), { mac: MAC, state: 'opening', obstruct: '0' }));
    const g = env.calls('gateState').slice(before);
    ok('state: an event of the accessory is passed on with the name of the gate', g.length === 1 && g[0].args.join('|') === MAC + '|Front gate|opening|0', g.map((c) => c.args));
    env.w.dispatchEvent(Object.assign(new env.w.Event('newDeviceState'), { mac: '', state: 'open' }));
    env.w.dispatchEvent(Object.assign(new env.w.Event('newDeviceState'), { mac: MAC }));
    ok('state: an event without an accessory or without a state is not', env.calls('gateState').length === before + 1);
    env.status = { state: 'open', obstruct: '1' };
    const n1 = env.calls('gateState').length;
    const res = await env.NHK.status(env.device);
    await sleep(20);
    const last = env.calls('gateState').slice(-1)[0];
    ok('state: the answer to a request for the state is passed on too, and the caller still gets the answer', last.args.join('|') === MAC + '|Front gate|open|1' && res.devices[0].properties[0].value === 'open', last.args);
    ok('state: one answer is passed on once (the wrappers of the patch do not stack)', env.calls('gateState').length === n1 + 1, env.calls('gateState').length - n1);
  }
  {
    const env = await environment({ info: { on: true, allowed: false, battery: false } }), r = env.r;
    ok('start: on from the last time, with what Android does not allow', r.nxNotify() === true && r.nxNotifyInfo().allowed === false && r.nxNotifyInfo().battery === false && env.calls('watch').length === 0);
    // the connection is checked while the app is in the background, and only then
    const v0 = env.verifies;
    await sleep(260);
    ok('background: no check while the app is on the screen (the app does that itself)', env.verifies === v0, env.verifies - v0);
    env.fire('pause');
    await sleep(300);
    const v1 = env.verifies;
    ok('background: in the background the connection is checked again and again', v1 - v0 >= 2, v1 - v0);
    env.info = { on: true, allowed: true, battery: true };
    env.fire('resume');
    await sleep(40);
    ok('resume: what Android allows is asked again (the user may have been in its settings)', env.calls('watchState').length === 2 && r.nxNotifyInfo().allowed === true);
    const v2 = env.verifies;
    await sleep(260);
    ok('resume: the checks of the background stop', env.verifies === v2, env.verifies - v2);
    r.nxSetNotify(false); await sleep(30);
    env.fire('pause');
    const v3 = env.verifies;
    await sleep(260);
    ok('background: no check while the switch is off', env.verifies === v3, env.verifies - v3);
  }
  {
    const env = await environment({ watchFails: true, statusFails: true }), r = env.r;
    r.nxSetNotify(true); await sleep(30);
    ok('switch: when the native layer refuses, the switch goes back', r.nxNotify() === false);
    const n0 = env.calls('gateState').length;
    await env.NHK.status(env.device).catch(() => {});
    await sleep(20);
    ok('state: a request that failed says nothing about the gate', env.calls('gateState').length === n0);
  }
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
