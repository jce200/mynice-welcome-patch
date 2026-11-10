// Test of the workstream "Lists, settings, Favorites and Design page" of nx23: the functions of nx-patch.js that the lists ask for (the state of an accessory on its card, the gate state only when it is
// confirmed, the tap on a row, the groups of Other commands, the Debug log), patch-19-lists.py and patch-17-gallery.py on an invented app tree, the page Design reference (nx-gallery.js) in jsdom, and the CSS
// (static: the numbers that this workstream promised, the contrast of the colors it uses in all seven palettes).
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-lists.test.js      All data is made up (Anna, AABBCC, 00:0B:6C:AA:BB:CC).
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { /* the parts that need jsdom are skipped */ }

// ---------------------------------------------------------------------------------------------------------------- nx-patch.js in a simulated Angular
const PATCH = read('nx-patch.js');
async function environment(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const logs = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  const homes = [{ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: [{ mac: '00:0B:6C:AA:BB:CC', address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret', reachable: true }] }];
  w.localStorage.setItem('keyHomes', JSON.stringify(homes));
  w.cordova = { exec(okCb, failCb, svc, action) { setTimeout(() => { if (action === 'netState') okCb({ wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true }); else if (action !== 'logStream') okCb(); }, 0); } };
  const handlers = {}, digests = { n: 0 };
  const HS = { homes, updateDevice() {} };
  const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() { digests.n++; }, verifyDeviceRecheability() { return { promise: Promise.resolve() }; } };
  if (opts.rootScope) opts.rootScope($rootScope);
  const services = { $rootScope, $q: { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } },
    $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)), NHKPluginService: {}, HomeService: HS, $ionicPopup: { confirm: () => Promise.resolve(false) } };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  if (opts.tickMs) w.__nxFavTickMs = opts.tickMs;
  if (opts.pre) opts.pre(w);
  w.eval(PATCH);
  await sleep(800);   // it looks for Angular every 500 ms
  return { w, $rootScope, digests, logs, document: w.document };
}
const dev = (extra) => Object.assign({ mac: '00:0B:6C:AA:BB:CC', homeId: 1, reachable: true, permissions: { isAdmin: true }, properties: [{ value: 'closed' }, { value: '0' }] }, extra || {});

async function nxPatchTests() {
  if (!JSDOM) { console.log('skipped: jsdom is missing (the functions of nx-patch.js, the page Design reference)'); return; }
  const env = await environment();
  const R = env.$rootScope, w = env.w;
  for (const n of ['nxFavState', 'nxFavGate', 'nxFavObst', 'nxRowTap', 'nxCmdGap', 'nxLogOpen']) ok('nx-patch.js offers $rootScope.' + n, typeof R[n] === 'function');
  // the state on the card or the row: the flag of the app (verifyDevice) and nxCheck, nothing of its own
  const usable = { v: true }, check = { v: '' };
  R.verifyDevice = () => usable.v;
  R.nxCheck = () => check.v;
  const st = (u, c) => { usable.v = u; check.v = c; return R.nxFavState(dev()); };
  ok('state: usable and confirmed = online (also while a check runs after a good one: hold)', st(true, '') === 'online' && st(true, 'hold') === 'online');
  ok('state: the flag says usable but this session has no result yet = checking (the flag may be what the last session left)', st(true, 'checking') === 'checking');
  ok('state: not usable and a new attempt runs = connecting', st(false, 'retry') === 'connecting');
  ok('state: not usable and no result yet, or a re-check after a good result = checking', st(false, 'checking') === 'checking' && st(false, 'hold') === 'checking');
  ok('state: not usable and nothing is tried = offline ("Not reachable")', st(false, '') === 'offline');
  delete R.verifyDevice; delete R.nxCheck;
  ok('state: without the functions of the app it uses the flag of the device (and is never an object)', R.nxFavState(dev({ reachable: true })) === 'online' && R.nxFavState(dev({ reachable: false })) === 'offline' && R.nxFavState(null) === 'offline');
  R.verifyDevice = () => usable.v; R.nxCheck = () => check.v;
  usable.v = true; check.v = '';
  // the gate state: only while window.__nxTrust says live
  delete w.__nxTrust;   // with the command workstream nx-patch.js offers it: the card has to work without it as well
  ok('gate: without window.__nxTrust there is no state on the card', typeof w.__nxTrust === 'undefined' && R.nxFavGate(dev()) === '' && R.nxFavObst(dev({ properties: [{ value: 'closed' }, { value: '1' }] })) === false);
  const trust = { v: 'live' };
  w.__nxTrust = () => trust.v;
  ok('gate: live and online = the state of the device', R.nxFavGate(dev()) === 'closed' && R.nxFavGate(dev({ properties: [{ value: 'opening' }, { value: '0' }] })) === 'opening');
  ok('gate: checking, aging and stale are not live: no state', ['checking', 'aging', 'stale', ''].every((t) => { trust.v = t; return R.nxFavGate(dev()) === ''; }));
  trust.v = 'live';
  usable.v = false; check.v = '';
  ok('gate: live but the accessory is not usable: no state', R.nxFavGate(dev()) === '');
  usable.v = true;
  ok('gate: a value that has no word (unknown, nothing) is not shown', R.nxFavGate(dev({ properties: [{ value: 'unknown' }, { value: '0' }] })) === '' && R.nxFavGate(dev({ properties: [] })) === '' && R.nxFavGate(dev({ properties: undefined })) === '');
  R.nxState = () => 'open';
  ok('gate: it is the state that the accessory screen shows (nxState: settled from the log) when that function exists', R.nxFavGate(dev()) === 'open');
  delete R.nxState;
  ok('obstruction: only with a confirmed state, and only when the device says 1', R.nxFavObst(dev({ properties: [{ value: 'closed' }, { value: '1' }] })) === true && R.nxFavObst(dev({ properties: [{ value: 'closed' }, { value: 1 }] })) === true && R.nxFavObst(dev()) === false &&
    (trust.v = 'aging', R.nxFavObst(dev({ properties: [{ value: 'closed' }, { value: '1' }] })) === false));
  trust.v = 'live';
  w.__nxTrust = () => { throw new Error('boom'); };
  ok('gate: a failing trust function gives no state, not an error in the digest', R.nxFavGate(dev()) === '');
  delete w.__nxTrust;
  // the tap on a row
  const calls = [];
  w.NX.open = () => calls.push('open'); w.NX.diagnose = () => calls.push('diagnose');
  const go = (h, m) => calls.push('go ' + h + ' ' + m);
  usable.v = true;
  R.nxRowTap(dev(), go);
  ok('tap: a usable accessory goes to its screen (the app\'s own function), the sheet stays closed', calls.join() === 'go 1 00:0B:6C:AA:BB:CC');
  calls.length = 0; usable.v = false;
  R.nxRowTap(dev(), go);
  ok('tap: an accessory that is not usable: the app\'s function runs as before (it sets the type and does nothing else), and the status sheet opens with the diagnosis', calls.join() === 'go 1 00:0B:6C:AA:BB:CC,open,diagnose', calls.join());
  calls.length = 0;
  R.nxRowTap(dev(), () => { throw new Error('the app failed'); });
  ok('tap: an error of the app\'s function does not keep the sheet from opening', calls.join() === 'open,diagnose');
  calls.length = 0;
  let threw = false;
  try { R.nxRowTap(dev()); R.nxRowTap(null, go); const o = w.NX.open; w.NX.open = undefined; R.nxRowTap(dev(), go); w.NX.open = o; } catch (e) { threw = true; }
  ok('tap: without go, without a device or without the sheet nothing is thrown', !threw);
  // the groups of Other commands
  const C = (codes) => codes.map((c) => ({ code: c }));
  const list = C(['MDAx', 'MDBk', 'MDBl', 'MDBm', 'MDEw', 'MDE5', 'MDFh', 'MDEx', 'MDEy', 'Rule']);
  ok('commands: a gap in front of the first row of a new group (moves, blocks, releases, light, other), none inside a group, none in front of the first row',
    list.map((c, i) => R.nxCmdGap(list, i) ? 1 : 0).join('') === '0100100101', list.map((c, i) => R.nxCmdGap(list, i) ? 1 : 0).join(''));
  ok('commands: whatever the order, a row that has another group than the one above it starts a group', R.nxCmdGap(C(['MDFh', 'MDBk', 'MDFh']), 1) === true && R.nxCmdGap(C(['MDFh', 'MDBk', 'MDFh']), 2) === true && R.nxCmdGap(C(['MDFh', 'MDE5']), 1) === false);
  ok('commands: not an array, a gap past the end or an item without a code: false and no error', R.nxCmdGap(true, 1) === false && R.nxCmdGap(undefined, 0) === false && R.nxCmdGap(C(['MDAx']), 5) === false && R.nxCmdGap([null, null], 1) === false);
  // Debug log
  let shown = 0;
  w.__nxLogShow = () => { shown++; };
  R.nxLogOpen();
  ok('Debug log: the row opens the LOG panel (window.__nxLogShow); without the panel it does nothing', shown === 1 && (delete w.__nxLogShow, R.nxLogOpen(), true));
  // the card looks again while a state is on it
  const e3 = await environment({ tickMs: 40 });
  await sleep(150);
  const before = e3.digests.n;
  await sleep(150);
  ok('tick: no gate state on the page = no digest of its own', e3.digests.n === before);
  const span = e3.document.createElement('span'); span.className = 'nx-fav-gate'; e3.document.body.appendChild(span);
  const mid = e3.digests.n;
  await sleep(200);
  ok('tick: while a gate state is on the card the page looks again every few seconds (a state that is not confirmed any more must go)', e3.digests.n > mid, mid + ' -> ' + e3.digests.n);
}

// ---------------------------------------------------------------------------------------------------------------- patch-19-lists.py and patch-17-gallery.py on an invented app tree
const FAV = `<ion-view id="favorites">
    <ion-content scroll="true" class="has-header">
    \t<div class="list" ng-if="(favorites.length + favorites_scenes.length) != 0">

            <span class="item item-divider" data-ng-show="editFavorites == false" translate="FAVORITES_LABEL_FAVORITES"></span>
            <span class="item item-divider" data-ng-show="editFavorites == true" translate="FAVORITES_LABEL_EDIT"></span>

            <a class="item item-favorites item-icon-right"
               ng-click="goToDettaglio(favorite.homeId,favorite.mac)"
               ng-repeat="favorite in favorites" data-ng-show="editFavorites == false">
                <span>{{ favorite.description }}</span>
\t\t        <i class="icon ion-ios-arrow-forward"></i>
                <span class="item-nota">{{ favorite.homeName }}</span>
                <span class="item-nota" data-ng-show="!verifyDevice(favorite) && !nxCheck(favorite)" translate="CONTROLS_DEVICE_NOT_READY"></span><span class="item-nota nx-checking" data-ng-show="!verifyDevice(favorite) && nxCheck(favorite) === 'checking'">Checking&hellip;</span><span class="item-nota nx-checking nx-connecting" data-ng-show="!verifyDevice(favorite) && nxCheck(favorite) === 'retry'">Connecting&hellip;</span>
\t\t    </a>

            <form novalidate>
                <ion-checkbox data-ng-model="deviceChk[favorite.mac]" class="item-checkbox-right fakeradio" data-ng-repeat="favorite in favorites" ng-show="editFavorites == true">{{ favorite.description }}
                    <span class="item-nota">{{ favorite.homeName }}</span>
                </ion-checkbox>
            </form>
        </div>
        <div class="list" ng-if="favorite_automations.length > 0">
            <a class="item item-icon-right" ng-click="goToAutomBridgePlay(favorite.name)" ng-repeat="favorite in favorite_automations">
                <span>{{ favorite.name }}</span>
                <i class="icon ion-ios-arrow-forward"></i>
                <span class="item-nota">{{ favorite.homeName }}</span>
            </a>
        </div>
    </ion-content>
</ion-view>
`;
const CMD = `<ion-view class="light" hide-back-button="true">
  <ion-content scroll="true">
    <div class="list commands">
      <div class="item item-divider"><span translate="DEVICE_COMMANDS_LABEL_OTHER_COMMANDS"></span></div>

      <a class="item item-icon-right command bg-white-{{ $index < 12 ? $index+1 : 12 }}" data-ng-repeat="item in commands track by $index"
         data-ng-click="runCommand(item.code)">
        <span translate="{{ 'DEVICE_COMMAND_'+item.code }}"></span>
        <i class="icon icon-play"></i>
      </a>
    <div class="spacer last"></div>
    </div>
  </ion-content>
</ion-view>
`;
const SETTINGS = `<div class="list">
    <div class="item item-divider" data-ng-if="nxSetTheme">Appearance</div>
    <div class="item nx-palette-row" data-ng-if="nxSetPalette"></div>

    <div class="item item-divider" translate="SETTINGS_PAGE_LABEL_MORE"></div>
      <div class="item item-icon-right" data-ng-click="gotoDemo()"></div>
      <div class="item item-icon-right" data-ng-click="openNiceSite()"></div>

    <div class="spacer bordo_filetto_grigio">
      <span translate="SETTINGS_PAGE_APP_VERSION" translate-values='{ version: APP_VERSION }' ></span>
    </div>
      <div class="spacer bordo_filetto_grigio">
        <span translate="USERNAME"></span> {{currentUser}}
      </div>
</div>
`;
const INDEX = '<html><body>\n        <script src="js/nx-activity.js"></script>\n        <script src="js/nx-patch.js"></script>\n</body></html>\n';

function patchTests() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lists19-'));
  const www = path.join(tmp, 'assets', 'www');
  fs.mkdirSync(path.join(www, 'js'), { recursive: true });
  for (const d of ['favorites', 'system', 'settings']) fs.mkdirSync(path.join(www, 'templates', d), { recursive: true });
  const files = { fav: 'templates/favorites/favorites.html', cmd: 'templates/system/device_commands.html', set: 'templates/settings/settings.html', idx: 'index.html' };
  const w = (rel, text) => fs.writeFileSync(path.join(www, rel), text);
  const r = (rel) => fs.readFileSync(path.join(www, rel), 'utf8');
  const reset = (over) => { over = over || {}; w(files.fav, over.fav || FAV); w(files.cmd, over.cmd || CMD); w(files.set, over.set || SETTINGS); w(files.idx, INDEX); fs.rmSync(path.join(www, 'js', 'nx-gallery.js'), { force: true }); };
  const run = (script) => cp.spawnSync('python3', ['-I', path.join(ROOT, script), tmp], { encoding: 'utf8' });
  const snapshot = () => [files.fav, files.cmd, files.set].map(r).join('\u0000');

  reset();
  const g = run('patch-17-gallery.py');
  const res = run('patch-19-lists.py');
  const fav = r(files.fav), cmd = r(files.cmd), set = r(files.set);
  ok('patch-19: after patch-17 it runs and says what it patched', g.status === 0 && res.status === 0 && /patched \(nx23 lists\)/.test(res.stdout), g.stderr + res.stdout + res.stderr);
  // Favorites
  ok('favorites: the divider "Favorites" that repeats the title is gone, the divider of the edit mode stays', !/translate="FAVORITES_LABEL_FAVORITES"/.test(fav) && /translate="FAVORITES_LABEL_EDIT"/.test(fav));
  ok('favorites: the row has a role and a tab stop, is a card when there is exactly one favorite, and the tap goes through nxRowTap with the app\'s own function as a fallback',
    /<a class="item item-favorites item-icon-right" role="button" tabindex="0" data-ng-class="\{ 'nx-fav-card': favorites\.length === 1 \}"/.test(fav) &&
    /ng-click="nxRowTap \? nxRowTap\(favorite, goToDettaglio\) : goToDettaglio\(favorite\.homeId,favorite\.mac\)"/.test(fav));
  ok('favorites: the name and the home of the row have a class each (only the first row: the automations below and the edit list are left alone)', (fav.match(/nx-fav-name/g) || []).length === 1 && (fav.match(/nx-fav-home/g) || []).length === 1 &&
    /<span class="item-nota">\{\{ favorite\.homeName \}\}<\/span>\s*<\/ion-checkbox>/.test(fav) && /<span>\{\{ favorite\.name \}\}<\/span>/.test(fav));
  ok('favorites: the labels of patch-11 stay (verify-apk.py asks for them), for the case that nxFavState does not exist',
    /<span class="nx-fav-legacy" data-ng-if="!nxFavState"><span class="item-nota" data-ng-show="!verifyDevice\(favorite\) && !nxCheck\(favorite\)"/.test(fav) && /nxCheck\(favorite\) === 'retry'">Connecting&hellip;<\/span><\/span>/.test(fav));
  ok('favorites: the line of the accessory has the four states in words (Online, Checking..., Connecting..., Not reachable), asked of nxFavState, and the state of the gate with the obstruction',
    /<span class="nx-fav-status" data-ng-if="nxFavState">/.test(fav) && ['online', 'checking', 'connecting', 'offline'].every((s) => fav.includes("nxFavState(favorite) === '" + s + "'")) &&
    />Online<\/span>/.test(fav) && />Not reachable<\/span>/.test(fav) && /data-ng-if="nxFavGate\(favorite\)" translate="\{\{ 'DEVICE_STATE_' \+ nxFavGate\(favorite\) \}\}"/.test(fav) && /data-ng-if="nxFavObst\(favorite\)" translate="DEVICE_STATE_OBSTRUCTED"/.test(fav));
  // Other commands
  ok('commands: a line that says that a tap runs the command at once, under the header', cmd.indexOf('DEVICE_COMMANDS_LABEL_OTHER_COMMANDS') < cmd.indexOf('Tap a command to run it at once.') && cmd.indexOf('Tap a command to run it at once.') < cmd.indexOf('data-nx-gap'));
  ok('commands: the row asks nxCmdGap for its group and keeps the app\'s own tap and its classes', /data-nx-gap="\{\{ nxCmdGap && nxCmdGap\(commands, \$index\) \? '1' : '' \}\}"/.test(cmd) && /data-ng-click="runCommand\(item\.code\)"/.test(cmd) && /bg-white-\{\{ \$index < 12/.test(cmd));
  // Settings: Design reference, then Debug log, at the end of OTHER
  const iMore = set.indexOf('SETTINGS_PAGE_LABEL_MORE'), iSite = set.indexOf('openNiceSite'), iDesign = set.indexOf('Design reference'), iLog = set.indexOf('Debug log'), iVer = set.indexOf('SETTINGS_PAGE_APP_VERSION');
  ok('settings: the rows of OTHER end with Design reference and Debug log, in front of the version', iMore > 0 && iMore < iSite && iSite < iDesign && iDesign < iLog && iLog < iVer, [iMore, iSite, iDesign, iLog, iVer].join());
  ok('settings: Debug log is shown only where nxLogOpen exists, and runs it', /<div class="item item-icon-right" role="button" tabindex="0" data-ng-if="nxLogOpen" data-ng-click="nxLogOpen\(\)">\s*<span>Debug log<\/span>\s*<i class="icon ion-ios-arrow-forward"><\/i>/.test(set));
  ok('settings: Design reference is a plain row (no avatar, no second line) that needs nxGallery', /data-ng-if="nxGallery" data-ng-click="nxGallery\(\)">\s*<span>Design reference<\/span>\s*<i class="icon ion-ios-arrow-forward"><\/i>\s*<\/div>/.test(set));
  // idempotent and all or nothing
  const snap = snapshot();
  const again = run('patch-19-lists.py');
  ok('patch-19: a second run stops ("already patched") and changes nothing', again.status !== 0 && /already patched/.test(again.stdout + again.stderr) && snapshot() === snap);
  const broken = (what, over) => { reset(over); const before = snapshot(); const x = run('patch-19-lists.py'); return { x, untouched: snapshot() === before, msg: x.stdout + x.stderr }; };
  const nb1 = broken('divider', { fav: FAV.replace(/\s*<span class="item item-divider" data-ng-show="editFavorites == false"[^\n]*\n/, '\n') });
  const nb2 = broken('row', { fav: FAV.replace('goToDettaglio(favorite.homeId,favorite.mac)', 'somethingElse()') });
  const nb3 = broken('labels', { fav: FAV.replace('Connecting&hellip;', 'Connecting...') });
  const nb4 = broken('header', { cmd: CMD.replace('DEVICE_COMMANDS_LABEL_OTHER_COMMANDS', 'SOMETHING_ELSE') });
  const nb5 = broken('row of a command', { cmd: CMD.replace('data-ng-click="runCommand(item.code)"', 'data-ng-click="run(item)"') });
  const nb6 = broken('version', { set: SETTINGS.replace('SETTINGS_PAGE_APP_VERSION', 'SOMETHING_ELSE') });
  ok('patch-19: when an anchor is missing (the divider, the row, the labels of patch-11, the header or a row of Other commands, the line of the version) it stops with a message and writes nothing',
    [nb1, nb2, nb3, nb4, nb5, nb6].every((b) => b.x.status !== 0 && b.untouched && b.msg.length > 10), [nb1, nb2, nb3, nb4, nb5, nb6].map((b) => b.x.status + ':' + b.untouched).join(' '));
  ok('patch-19: two favorites in the invented template would make the anchor of the home name ambiguous: it asks for exactly one', (() => { reset({ fav: FAV.replace('<form novalidate>', FAV.match(/<a class="item item-favorites[\s\S]*?<\/a>/)[0] + '\n<form novalidate>') }); const b = snapshot(); const x = run('patch-19-lists.py'); return x.status !== 0 && snapshot() === b; })());
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------------------------------------------- the page Design reference
async function galleryTests() {
  if (!JSDOM) return;
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app">the app</div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.log = function () {};
  w.eval(read('nx-gallery.js'));
  w.NxGallery.open();
  await sleep(100);
  const d = w.document, q = (s) => d.querySelector(s), qa = (s) => Array.from(d.querySelectorAll(s));
  const page = q('#nx-gallery');
  ok('design: the dialog and its title are "Design reference" (it is a reference page, not a setting)', page.getAttribute('aria-label') === 'Design reference' && q('.nx-gal-title h1').textContent === 'Design reference');
  const banner = q('.nx-gal-demo');
  ok('design: a banner says "Demo only. Nothing on this page controls your gate." and sits between the bar and the scrolling part (it does not scroll away)',
    !!banner && banner.textContent === 'Demo only. Nothing on this page controls your gate.' && banner.parentNode === page && banner.previousElementSibling === q('.nx-gal-bar') && banner.nextElementSibling === q('.nx-gal-scroll') && banner.getAttribute('role') === 'note');
  ok('design: the pair of large buttons that looks like Open and Close says "(demo)" on the buttons, for screen readers too, and the card is called Large buttons (demo)',
    qa('#nx-gal-groups .nx-gal-demobtn').length === 2 && qa('#nx-gal-groups .nx-gal-demobtn').every((b) => /\(demo\)/.test(b.textContent) && /\(demo\)$/.test(b.getAttribute('aria-label'))) && /Large buttons \(demo\)/.test(q('#nx-gal-groups').textContent));
  const names = qa('#nx-gal-lists .m3e-li').map((i) => i.textContent).join(' | ');
  ok('design: the example list has neutral names and no state of a gate', qa('#nx-gal-lists .m3e-li').length === 4 && /Example item 1/.test(names) && !/gate|garage|door|closed|open|usable|checking|driveway/i.test(names), names);
  const chips = qa('#nx-gal-switches .m3e-chip').map((c) => c.textContent).join('|');
  ok('design: the chips have neutral names too (no name of a person, no time, no gate)', !/Anna|Garage|Gate|8:00/.test(chips), chips);
  // the class names and the numbers are developer notes
  const specs = qa('.nx-gal-spec'), codes = qa('.nx-gal-code');
  ok('design: every line of class names and numbers, and the name of the token of a shape, is a developer note (.nx-gal-dev)', specs.length > 20 && specs.every((s) => s.classList.contains('nx-gal-dev')) && codes.length === 1 && codes[0].classList.contains('nx-gal-dev'));
  const leaks = qa('.nx-gal *').filter((e) => e.children.length === 0 && /(^|[\s(])\.m3e-|--nx-|var\(--/.test(e.textContent) && !e.closest('.nx-gal-dev'));
  ok('design: no text outside the developer notes names a class or a token', leaks.length === 0, leaks.slice(0, 3).map((e) => e.textContent.slice(0, 40)).join(' | '));
  const sw = q('.nx-gal-intro [aria-label="Developer notes"]');
  ok('design: the switch "Developer notes" is off at first and the page is not .nx-dev', !!sw && sw.getAttribute('role') === 'switch' && sw.getAttribute('aria-checked') === 'false' && !page.classList.contains('nx-dev'));
  sw.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('design: switching it on marks the page .nx-dev (the CSS then shows the notes), off again takes it away', sw.getAttribute('aria-checked') === 'true' && page.classList.contains('nx-dev') && (sw.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), !page.classList.contains('nx-dev') && sw.getAttribute('aria-checked') === 'false'));
  const grid = qa('#nx-gal-shapes .nx-gal-shape');
  grid[15].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('design: a shape has a name for people ("Sunny") next to the token', q('#nx-gal-shapes .nx-gal-shapename').textContent === 'Sunny' && q('#nx-gal-shapes .nx-gal-code').textContent === '--nx-v-sunny');
  w.NxGallery.close();
  await sleep(500);
}

// ---------------------------------------------------------------------------------------------------------------- the CSS (static)
function cssTests() {
  const css = read('skin/nx-expressive.css');
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (sel) => { const i = bare.indexOf(sel + ' {'); return i < 0 ? '' : bare.slice(i, bare.indexOf('}', i)); };
  const P = 'html:root body[data-ng-app] ';
  ok('css: the button of the accessory screen that opens Other commands shows the tune glyph, not the eye', /\.bar \.button\.icon-occhio:before \{ -webkit-mask-image: var\(--nx-i-tune\); mask-image: var\(--nx-i-tune\); \}/.test(bare) && !/icon-occhio:before \{[^}]*visibility/.test(bare));
  const div = rule(P + '.list .item-divider, ' + P + '.item-divider');
  ok('css: a section header is 12 px / 600, tracked, in capitals through CSS (it also covers the strings that the patches add)', /text-transform:\s*uppercase !important/.test(div) && /font-size:\s*12px/.test(div) && /font-weight:\s*600/.test(div) && /letter-spacing:\s*0\.5px/.test(div), div);
  ok('css: the legacy colors of style.css are replaced: .btn-text-blue/black/grey take the color of the variant, green is ok, red is error, no gray border, no negative margin, the bars of .btn-border-* are gone',
    /\.button\.btn-text-blue, [^{]*\.button\.btn-text-black, [^{]*\.button\.btn-text-grey \{ color: var\(--_fg\) !important; border: 0; margin: 0; \}/.test(bare) &&
    /\.button\.btn-text-green \{ --_bg: var\(--nx-ok-container\); --_fg: var\(--nx-on-ok-container\);/.test(bare) && /\.button\.btn-text-red \{ --_bg: var\(--md-sys-color-error-container\); --_fg: var\(--md-sys-color-on-error-container\);/.test(bare) &&
    /\.button\.btn-border-bottom, [^{]*\.button\.btn-border-topBottom \{ border: 0 !important; \}/.test(bare));
  ok('css: the page Add accessory does not repeat its title as a heading (the bar has it)', /\.top-bianco h2\[translate="ADD_DEVICE"\] \{ display: none; \}/.test(bare));
  ok('css: a button that is an item is at least as high as a button (the old rule for items made "New accessory" 24 px high)', /\.button\.item \{ height: auto !important; min-height: var\(--_h\);/.test(bare));
  ok('css: "New accessory" is the filled primary button and "Demo" a text button, found by what they do', /\.button\.btn-text-blue\[data-ng-click="addNewDevice\(\)"\] \{ --_bg: var\(--md-sys-color-primary\); --_fg: var\(--md-sys-color-on-primary\); \}/.test(bare) && /\.button\.btn-text-blue\[ng-click="gotoDemo\(\)"\]/.test(bare));
  ok('css: Theme is 48 dp high (a touch target)', /\.nx-seg-btn \{\s*--_h:\s*48px/.test(bare));
  ok('css: a row with a button and a chevron is a row (64 dp), the button covers it so that the chevron stands where it does in other lists', /\.item\.item-button-right \{ flex-direction: row;[^}]*min-height: 64px; \}/.test(bare) && /\.item\.item-button-right > \.button\.button-clear \{\s*position: absolute; inset: 0;[^}]*max-height: none;/.test(bare));
  ok('css: an empty value in About says "Not reported"; a disabled field is dimmed like a disabled switch', /\.spacer \.item-note:empty:after \{ content: 'Not reported'; \}/.test(bare) && /\.item-input:has\(input:disabled:not\(\[data-ng-disabled="true"\]\), select:disabled, textarea:disabled\), [^{]*\.checkbox:has\(input:disabled\) \{ opacity: \.38; \}/.test(bare));
  ok('css: the swatches (48 dp hit areas) wrap as 4 and 3 on a narrow phone (not 6 and 1)', /\.nx-swatches \{[^}]*grid-template-columns: repeat\(auto-fill, var\(--nx-hit\)\)/.test(bare) && /@media \(max-width: 400px\) \{[^}]*\.nx-swatches \{ grid-template-columns: repeat\(4, var\(--nx-hit\)\)/.test(bare));
  ok('css: Other commands: the play glyph in place of the chevron, the first row of a group is 12 dp lower and round at the top, the last of a group round at the bottom', /\.list\.commands \.item \.icon\.icon-play:before \{ -webkit-mask-image: var\(--nx-i-play\)/.test(bare) &&
    /\.list\.commands \.item\[data-nx-gap="1"\] \{ margin-top: 12px !important; \}/.test(bare) && /\.item:has\(\+ \.item\[data-nx-gap="1"\]\)/.test(bare));
  ok('css: Favorites: with one favorite the row is a card of 28 dp corners with a neutral shape of 96 dp (cookie 9, secondary container) and the gate in it; the four states are pills with a dot',
    /\.nx-fav-card \{\s*display: grid; grid-template-columns: 96px/.test(bare) && /border-radius: 28px !important/.test(rule(P + '.list a.item.item-favorites.nx-fav-card')) && /width: 96px; height: 96px;[^}]*clip-path: var\(--nx-v-cookie9\); background: var\(--md-sys-color-secondary-container\)/.test(rule(P + '.list a.item.item-favorites.nx-fav-card:before')) &&
    /\.nx-online \{ background: var\(--nx-ok-container\)/.test(bare) && /\.nx-offline \{ background: var\(--md-sys-color-error-container\)/.test(bare));
  ok('css: the design page: the banner, and the developer notes that are hidden until the page is .nx-dev', /\.nx-gal-demo \{[^}]*tertiary-container/.test(bare) && /\.nx-gal:not\(\.nx-dev\) \.nx-gal-dev \{ display: none; \}/.test(bare));
  ok('css: the stage of "Accessory ready" is the deep green of the ok container in the dark theme (both ways of being dark), the check is white on it',
    /@media \(prefers-color-scheme: dark\) \{\s*html:root:not\(\[data-nx-theme="light"\]\) body\[data-ng-app\] \.setup-wifi-bridge \.area\.bg-verde[^{]*\{ background-color: var\(--nx-ok-container\) !important; \}/.test(bare) &&
    /html:root\[data-nx-theme="dark"\] body\[data-ng-app\] \.setup-wifi-bridge \.area\.bg-verde[^{]*\{ background-color: var\(--nx-ok-container\) !important; \}/.test(bare));
  // numbers from the tokens, in all seven palettes
  const NAMES = ((css.match(/^\/\* Generated by build-tokens\.mjs: \d+ palettes \(([^)]*)\)/) || [])[1] || '').split(';').map((x) => x.replace(/, the default/, '').trim()).filter(Boolean);
  const blockOf = (selector) => { const i = bare.indexOf(selector + ' {'); if (i < 0) return null; const map = new Map(); for (const m of bare.slice(i + selector.length + 2, bare.indexOf('}', i)).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim()); return map; };
  const sel = (name, kind) => name === NAMES[0] ? (kind === 'light' ? ':root' : ':root:not([data-nx-theme="light"])') : (kind === 'light' ? ':root[data-nx-palette="' + name + '"]' : ':root[data-nx-palette="' + name + '"]:not([data-nx-theme="light"])');
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const mix = (fg, bg, a) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(fg.substr(i, 2), 16) * a + parseInt(bg.substr(i, 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('');
  const M = '--md-sys-color-';
  const low = [];
  let leastStage = 99, leastHint = 99;
  for (const n of NAMES) for (const kind of ['light', 'dark']) {
    const b = blockOf(sel(n, kind));
    if (!b) { low.push(n + '/' + kind + ' block missing'); continue; }
    const stage = contrast('#ffffff', kind === 'dark' ? b.get('--nx-ok-container') : b.get('--nx-ok'));      // the check on the stage: dark uses the container, light the ok color
    const hint = contrast(mix(b.get(M + 'on-surface-variant'), b.get(M + 'surface-container-low'), 0.85), b.get(M + 'surface-container-low'));   // a hint inside a field, on the card
    leastStage = Math.min(leastStage, stage); leastHint = Math.min(leastHint, hint);
    if (stage < 4.5) low.push(n + '/' + kind + ' white on the stage ' + stage.toFixed(2));
    if (hint < 4.5) low.push(n + '/' + kind + ' hint ' + hint.toFixed(2));
  }
  ok('css: in all ' + NAMES.length + ' palettes and both themes the white check on the stage is at least 4.5:1 (was 1.7:1 in dark; lowest now ' + leastStage.toFixed(1) + ':1) and a hint in a field is at least 4.5:1 (was 4.05:1; lowest now ' + leastHint.toFixed(1) + ':1)', NAMES.length === 7 && low.length === 0, low.join(' | '));
  ok('css: the placeholder is the on-surface-variant color at 85 % (the outline color was 4.05:1)', /::placeholder, [^{]*::placeholder \{ color: color-mix\(in srgb, var\(--md-sys-color-on-surface-variant\) 85%, transparent\) !important; opacity: 1; \}/.test(bare));
}

// ---------------------------------------------------------------------------------------------------------------- build and verification
function buildTests() {
  const build = read('build.sh'), verify = read('verify-apk.py');
  ok('build.sh runs patch-19-lists.py after patch-18 and before patch-20', /patch-18-accessory-layout\.py patch-19-lists\.py patch-20-wizard\.py/.test(build));
  ok('patch-13 and patch-17 run before patch-19 (the rows of Settings exist when it adds its own)', build.indexOf('patch-13-theme.py') < build.indexOf('patch-17-gallery.py') && build.indexOf('patch-17-gallery.py') < build.indexOf('patch-19-lists.py'));
  ok('verify-apk.py has the checks of this workstream behind its marker', /# nx23 \(lists, settings, Favorites\)[^\n]*\n[\s\S]*?nxFavState[\s\S]*?Design reference[\s\S]*?# nx23 \(setup wizard\)/.test(verify));
  ok('...and still asks for what the other patches need (the labels of patch-11 in favorites.html, nx-design-row behind nx-palette-row)', /'favorites\/favorites\.html'/.test(verify) && /'nx-design-row' not in set22/.test(verify));
}

(async function () {
  await nxPatchTests();
  patchTests();
  await galleryTests();
  cssTests();
  buildTests();
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
