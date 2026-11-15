// nx30: a calmer accessory screen, and an app that starts on it when there is one accessory.
//   * patch-23-calm.py on an invented template: Activity in the header, the extra buttons behind "More commands", all or nothing, idempotent
//   * the style rules that take the old pill away, fold the extra buttons and hide what one accessory does not need
//   * nx-patch.js in jsdom: no line for a short check, "More commands" is remembered, and with one accessory the app goes from Favorites to its screen (and only then)
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx30-calm.test.js
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

// ====================================================================================================== patch-23-calm.py
{
  const TEMPLATE = [
    '<ion-view>',
    '    <ion-nav-buttons side="left">',
    '        <button class="button back-button buttons button-icon icon header-item ion-ios-arrow-back" data-ng-click="onPressBackFromDeviceDetail()"></button>',
    '    </ion-nav-buttons>',
    '    <ion-nav-buttons side="right">',
    '        <button class="button back-button buttons button-icon icon icon-occhio header-item"',
    '                data-ng-show="!data.confirmationPending" ng-click="goToCommands()"></button>',
    '    </ion-nav-buttons>',
    '                        <a class="command" data-ng-click="x()">Open</a>',
    '                        <div class="nx-extras" data-ng-if="nxExtra(data.device).length" role="group" aria-label="Extra buttons">',
    '                            <div class="nx-extras-cap">Extra buttons</div>',
    '                        </div>',
    '                        <a class="nx-extra-edit" data-ng-if="nxCanQuick && nxCanQuick(data.device)" data-ng-click="nxEditQuick(data.device)">Edit extra buttons</a>',
    '</ion-view>', ''].join('\n');
  const mk = (text) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx30-'));
    const f = path.join(dir, 'assets', 'www', 'templates', 'system', 'device_detail.html');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    return { dir, f };
  };
  const run = (dir) => spawnSync('python3', ['-I', path.join(ROOT, 'patch-23-calm.py'), dir], { encoding: 'utf8' });
  const a = mk(TEMPLATE), r1 = run(a.dir), out = fs.readFileSync(a.f, 'utf8');
  ok('patch-23: applies to the template that the earlier patches leave', r1.status === 0, r1.stderr || r1.stdout);
  ok('patch-23: a button "Activity" in the header, before the one for the other commands, that opens the sheet and is named after the last command for a screen reader',
    /nx-hist" data-ng-if="nxActivity" data-ng-click="nxActivity\(data\.device\)"\s+aria-label="\{\{ nxLastSpoken \? nxLastSpoken\(data\.device\) : 'Activity' \}\}"><\/button>\s+<button class="[^"]*icon-occhio/.test(out));
  ok('patch-23: the back button of this page can be told from the others', /ion-ios-arrow-back nx-back-detail" data-ng-click="onPressBackFromDeviceDetail\(\)"/.test(out));
  ok('patch-23: "More commands" / "Fewer commands" is a real button with aria-expanded, only when there are extra buttons and nx-patch.js is there',
    /<button type="button" class="nx-more" data-ng-if="nxMore && nxExtra\(data\.device\)\.length" data-ng-click="nxMore\(\)" aria-expanded="\{\{ nxMoreOpen\(\) \}\}">/.test(out) && /'Fewer commands' : 'More commands'/.test(out));
  ok('patch-23: the extra buttons and the link to choose them are folded while "More commands" is closed; without nx-patch.js they show as before',
    /class="nx-extras" data-ng-if="nxExtra\(data\.device\)\.length" data-ng-class="\{ 'nx-folded': nxMoreOpen && !nxMoreOpen\(\) \}"/.test(out) &&
    /class="nx-extra-edit" data-ng-class="\{ 'nx-folded': nxMoreOpen && nxExtra\(data\.device\)\.length && !nxMoreOpen\(\) \}"/.test(out));
  ok('patch-23: nothing else changed (the lines it did not touch are the same)', TEMPLATE.split('\n').filter((l) => !/nx-extras"|nx-extra-edit|arrow-back|icon-occhio/.test(l)).every((l) => out.split('\n').indexOf(l) >= 0));
  const r2 = run(a.dir);
  ok('patch-23: a second run refuses and leaves the file as it is', r2.status !== 0 && /already patched/.test(r2.stderr + r2.stdout) && fs.readFileSync(a.f, 'utf8') === out);
  const b = mk(TEMPLATE.replace('class="nx-extra-edit"', 'class="nx-extra-edit2"')), r3 = run(b.dir);
  ok('patch-23: all or nothing: one anchor missing and the file is not touched', r3.status !== 0 && fs.readFileSync(b.f, 'utf8') === TEMPLATE.replace('class="nx-extra-edit"', 'class="nx-extra-edit2"'), r3.stderr);
  fs.rmSync(a.dir, { recursive: true, force: true }); fs.rmSync(b.dir, { recursive: true, force: true });
  const build = read('build.sh');
  ok('build.sh: patch-23-calm.py runs after the patches that make the accessory screen and before patch-21-copy.py', /patch-18-accessory-layout\.py[^;]*patch-23-calm\.py patch-21-copy\.py; do/.test(build));
}

// ====================================================================================================== the style rules
{
  const css = read('skin/src/nx30-calm.css');
  ok('css: the pill with the last command is not shown on the accessory screen any more (its place is the header)', /\.device-detail \.nx-last \{ display: none !important; \}/.test(css) && /\.bar \.button\.nx-hist:before \{[^}]*--nx-i-history/.test(css));
  ok('css: the Activity button is a round tonal button of 48 dp, not the filled pill of a header button with words', /\.bar \.button\.header-item\.nx-hist:not\(\.icon-occhio\):not\(\[class\*="ion-"\]\) \{[^}]*surface-container-high[^}]*width: 48px/.test(css));
  ok('css: Open and Close are 88 dp high and Stop 64 (they were 136 and 96 on a tall phone)', /_open"\]\), .*_close"\]\) \{\s*--_h: 88px;/.test(css) && /_stop"\]\) \{ --_h: 64px;/.test(css));
  ok('css: a folded part takes no room, and the caption is not repeated under "More commands"', /\.nx-folded \{ display: none !important; \}/.test(css) && /\.nx-more ~ \.nx-extras \.nx-extras-cap \{ display: none; \}/.test(css));
  ok('css: "More commands" is 48 dp high to the touch', /\.device-commands \.nx-more \{\s*--_h: 48px;/.test(css));
  const single = css.split('\n').filter((l) => /data-nx-single/.test(l) && /\{/.test(l));
  ok('css: what one accessory changes is behind data-nx-single on <html> (and nothing else is)', single.length >= 5 && single.every((l) => /^html:root\[data-nx-single(-go)?="1"\] body\[data-ng-app\] /.test(l)), single.filter((l) => !/^html:root\[data-nx-single/.test(l)));
  ok('css: with one accessory the tab System is not shown, the first tab is named after the accessory, and the accessory screen has no back button',
    /\.tabs > a\.tab-item:nth-of-type\(2\) \{ display: none !important; \}/.test(css) && /a\.tab-item:first-of-type \.tab-title:after \{ content: var\(--nx-single-label, 'Control'\)/.test(css) && /\.bar \.button\.nx-back-detail \{ display: none !important; \}/.test(css));
  const gate = read('skin/src/nx23-gate.css');
  ok('css: Stop at rest is the error container without an outline around it', /--_bg: var\(--md-sys-color-error-container\); --_fg: var\(--md-sys-color-on-error-container\);\n\}/.test(gate));
  ok('css: the generated sheet has the rules of nx30', /data-nx-single="1"/.test(read('skin/nx-expressive.css')) && /\.nx-more/.test(read('skin/nx-expressive.css')));
}

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom); ' + total + ' checks without it ' + (failures ? 'FAILED' : 'passed'));
  process.exit(failures ? 1 : 0);
}

// ====================================================================================================== nx-patch.js in jsdom
// scen: { devices: [extra, ...] (what differs from an ordinary accessory, one per accessory), scenes, route, more, hold }
async function environment(scen) {
  scen = scen || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, logs = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  const mk = (i, extra) => Object.assign({ mac: i ? MAC.slice(0, -2) + 'D' + i : MAC, address: '10.0.0.' + (20 + i), name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret',
    reachable: true, favorites: true, permissions: { isAdmin: false, isUser: true }, properties: [{ value: 'closed' }, { value: '0' }],
    automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'], secondaryCommands: [{ code: 'MDBk' }] }] }, extra || {});
  const devices = (scen.devices || [{}]).map((x, i) => mk(i, x));
  const HS = { homes: [{ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices }], updateDevice() { w.localStorage.setItem('keyHomes', JSON.stringify(HS.homes)); } };
  HS.updateDevice();
  w.STORAGE_KEYS = { KEY_HOMES: 'keyHomes', KEY_SCENES: 'keyScenes' };
  if (scen.scenes) w.localStorage.setItem('keyScenes', JSON.stringify(scen.scenes));
  if (scen.more) w.localStorage.setItem('nxMore', '1');
  const env = { w, logs, HS, handlers: {}, went: [], types: [], viewOptions: [], statusWaiters: [], route: { current: { name: scen.route || 'tabsController.favorites' } } };
  env.route.go = (name, params) => { env.went.push({ name, params }); env.route.current = { name }; (env.handlers.$stateChangeSuccess || []).forEach((fn) => fn({}, { name })); };
  w.cordova = { exec(okCb, failCb, svc, action) { setTimeout(() => { switch (action) {
    case 'netState': return okCb({ wifi: true, ssid: 'HomeWifi', ip: '10.0.0.5', validated: true });
    case 'probe': return okCb({ ok: true, tcpMs: 20, tlsMs: 100 });
    case 'version': return okCb('nx-test');
    case 'reconnect': case 'release': case 'setHints': case 'checkSucceeded': case 'checkFailed': return okCb();
    default: return; } }, 0); } };
  const NHK = {
    setAccessoryType(t) { env.types.push(t); },
    connect() { return Promise.resolve(); },
    verify() { return Promise.resolve({ isAdmin: false, isUser: true }); },
    status() { return scen.hold ? new Promise((res) => env.statusWaiters.push(res)) : Promise.resolve({ devices: [{ properties: [{ value: 'closed' }, { value: '0' }] }] }); },
    logs() { return Promise.resolve({ deviceLogs: [], interfaceLogs: [] }); },
    pairings() { return Promise.resolve({ activeUsers: [], waitingUsers: [] }); },
    executePrimaryCommand() { return Promise.resolve({}); }, executeSecondaryCommand() { return Promise.resolve({}); }
  };
  const $rootScope = { $on(ev, fn) { (env.handlers[ev] = env.handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability(d) { return { promise: Promise.resolve(d) }; } };
  const $q = { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } };
  const services = { $rootScope, $q, $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)), NHKPluginService: NHK, HomeService: HS, $ionicPopup: { confirm: () => Promise.resolve(true) },
    $translate: { instant: (k) => k }, $state: env.route, $ionicHistory: { nextViewOptions(o) { env.viewOptions.push(o); } } };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(read('nx-patch.js'));
  await sleep(700);
  env.$rootScope = $rootScope;
  env.root = w.document.documentElement;
  env.nav = (name) => { env.route.current = { name }; (env.handlers.$stateChangeSuccess || []).forEach((fn) => fn({}, { name })); };
  return env;
}

(async () => {
  // ---------------------------------------------------------------- one accessory: the app starts on its screen
  {
    const env = await environment();
    const g = env.went[0];
    ok('one accessory: from Favorites the app goes to the screen of that accessory by itself', env.went.length === 1 && g.name === 'tabsController.favorites-device-detail' && g.params.homeId === 1 && g.params.mac === MAC, env.went);
    ok('one accessory: as the tap on the card does, the kind of accessory is set first; the screen becomes the root of its tab without an animation (the back key leaves the app)',
      env.types.join() === 'IT4WIFI' && env.viewOptions.length === 1 && env.viewOptions[0].historyRoot === true && env.viewOptions[0].disableBack === true && env.viewOptions[0].disableAnimate === true, [env.types, env.viewOptions]);
    ok('one accessory: <html> says so, and the first tab is named after the kind of automation ("Gate" for a sliding gate)', env.root.getAttribute('data-nx-single') === '1' && env.root.style.getPropertyValue('--nx-single-label') === "'Gate'" && env.$rootScope.nxSingle() === true);
    await sleep(1100);
    ok('one accessory: the mark that hides the list of Favorites for the moment of the jump is gone after a second', !env.root.hasAttribute('data-nx-single-go'));
    env.nav('tabsController.settings');
    ok('one accessory: another page is left alone', env.went.length === 1);
    await sleep(600);
    env.nav('tabsController.favorites');
    await sleep(80);
    ok('one accessory: the tab "Gate" (the app goes to Favorites) leads to the accessory screen again', env.went.length === 2 && env.went[1].name === 'tabsController.favorites-device-detail', env.went);
    env.nav('tabsController.favorites');
    await sleep(80);
    ok('one accessory: no tug of war: Favorites again within a moment of a jump is left alone (the accessory screen sent the app back itself)', env.went.length === 2 && env.route.current.name === 'tabsController.favorites', env.went.length);
    // a second accessory is added: the app is as it was
    env.HS.homes[0].devices.push(Object.assign({}, env.HS.homes[0].devices[0], { mac: '00:0B:6C:AA:BB:DD' }));
    env.HS.updateDevice();
    await sleep(1600);
    env.nav('tabsController.favorites');
    await sleep(80);
    ok('one accessory: a second accessory ends it (Favorites stays, the mark on <html> and the name of the tab are gone)', env.went.length === 2 && !env.root.hasAttribute('data-nx-single') && env.root.style.getPropertyValue('--nx-single-label') === '' && env.$rootScope.nxSingle() === false,
      [env.went.length, env.root.getAttribute('data-nx-single')]);
  }
  const stays = async (name, scen) => {
    const env = await environment(scen);
    ok('not one plain accessory: ' + name + ': the app stays on Favorites and nothing is hidden', env.went.length === 0 && !env.root.hasAttribute('data-nx-single') && env.$rootScope.nxSingle() === false, [env.went, env.root.getAttribute('data-nx-single')]);
  };
  await stays('two accessories', { devices: [{}, {}] });
  await stays('no accessory', { devices: [] });
  await stays('one accessory and a scene', { scenes: [{ sceneId: 1, name: 'Evening' }] });
  await stays('an accessory that is not a favorite (the accessory screen of Favorites would be empty)', { devices: [{ favorites: false }] });
  await stays('an accessory that waits for permission', { devices: [{ permissions: { isAdmin: false, isUser: false } }] });
  await stays('an accessory without an automation', { devices: [{ automations: [] }] });
  await stays('a Core (it has pages of its own)', { devices: [{ name: 'NiceCORE0001' }] });
  {
    const env = await environment({ route: 'tabsController.settings' });
    ok('one accessory: the app starts on another page (a request for access opened Settings): no jump, the tabs are those of one accessory', env.went.length === 0 && env.root.getAttribute('data-nx-single') === '1');
    const door = await environment({ devices: [{ automations: [{ id: '1', type: 'sectional', primaryCommands: ['open', 'stop', 'close'], secondaryCommands: [] }] }] });
    ok('one accessory: a sectional door is "Door"', door.root.style.getPropertyValue('--nx-single-label') === "'Door'", door.root.style.getPropertyValue('--nx-single-label'));
  }

  // ---------------------------------------------------------------- "More commands"
  {
    const env = await environment({ route: 'tabsController.favorites-device-detail' }), r = env.$rootScope;
    ok('more commands: folded until the user opens it', r.nxMoreOpen() === false);
    r.nxMore();
    ok('more commands: a tap opens it and the choice is kept on the phone', r.nxMoreOpen() === true && env.w.localStorage.getItem('nxMore') === '1');
    r.nxMore();
    ok('more commands: a second tap folds it and nothing is kept', r.nxMoreOpen() === false && env.w.localStorage.getItem('nxMore') === null);
    const again = await environment({ route: 'tabsController.favorites-device-detail', more: true });
    ok('more commands: the next start of the app has it as the user left it', again.$rootScope.nxMoreOpen() === true);
  }

  // ---------------------------------------------------------------- the line: nothing for a short check
  {
    const env = await environment({ route: 'tabsController.favorites-device-detail', hold: true }), r = env.$rootScope, d = env.HS.homes[0].devices[0];
    env.handlers.$stateChangeSuccess.forEach((fn) => fn({}, { name: 'tabsController.favorites-device-detail' }, { homeId: 1, mac: d.mac }));     // entering the screen: checking until the answer
    const trust = r.nxTrust(d);
    ok('line: while the state is being checked there is no line (the chip and the hero say "Checking…"), and its kind is empty so the bar is not drawn', trust === 'checking' && r.nxLine(d) === '' && r.nxLineKind(d) === '', [trust, r.nxLine(d), r.nxLineKind(d)]);
    ok('line: the words for a check that takes long are still there, and the short ones are gone from what the patch can show', /Still checking\. The accessory is slow to answer\./.test(read('nx-patch.js')) && !/'Checking the gate…'/.test(read('nx-patch.js')));
  }
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
