// Test of what the QA of the chrome (status chip and sheet, dialogs, Debug log, accessibility) found in the MERGED build (nx23). jsdom for the attributes of the accessibility layer; the rest
// reads the sources (CSS, debuglog.js) because the geometry and the real touch are proved in Chromium: harness/steps-qa-chrome.cjs (taps, areas, overlays, toast, live), steps-a11y.cjs, audit-a11y.cjs.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-qa-chrome.test.js
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom)');
  process.exit(0);
}
const SRC = fs.readFileSync(path.join(__dirname, '..', 'nx-patch.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
}
const MAC = '00:0B:6C:AA:BB:CC';
const device = (extra) => Object.assign({ mac: MAC, address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret' }, extra || {});
const home = (devices) => ({ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices });

// scen: { homes, waiting, hash (location.hash before the patch starts), lang ($translate.use()), popupAnswer, approveErr, names, body (html of the page), storageThrows (setItem of this key throws) }
async function environment(scen) {
  const dom = new JSDOM('<!doctype html><html><head></head><body>' + (scen.body || '') + '</body></html>', { url: 'http://localhost/' + (scen.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const logs = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  w.localStorage.setItem('keyHomes', JSON.stringify(scen.homes));
  if (scen.storageThrows) { const set = w.Storage.prototype.setItem; w.Storage.prototype.setItem = function (k, v) { if (k === scen.storageThrows) throw new Error('quota'); return set.call(this, k, v); }; }
  const native = [];
  w.cordova = {
    exec(okCb, failCb, svc, action) {
      native.push(action);
      setTimeout(() => { if (action === 'netState') okCb({ wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true }); else if (/^(reconnect|release|setHints|checkSucceeded|checkFailed)$/.test(action)) okCb(); }, 0);
    },
    fireDocumentEvent(type) { w.__fired = (w.__fired || []).concat(type); }
  };
  const handlers = {};
  const HS = { homes: JSON.parse(w.localStorage.getItem('keyHomes')), updateDevice() {} };
  const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability: (dev) => ({ promise: Promise.resolve(dev) }) };
  const popups = [], approvals = [], backActions = [];
  const NHK = {
    config() { return Promise.reject({ code: 'X' }); },
    pairings() { return Promise.resolve({ activeUsers: [], waitingUsers: scen.waiting || [] }); },
    userApproved(dev, id, name) { approvals.push({ id, name }); return scen.approveErr !== undefined ? Promise.reject(scen.approveErr) : Promise.resolve(); }
  };
  const $ionicPopup = { confirm(opts) { popups.push(opts); return Promise.resolve(scen.popupAnswer !== false); } };
  const $ionicPlatform = { registerBackButtonAction(fn, priority) { const a = { fn, priority, off: false }; backActions.push(a); return () => { a.off = true; }; } };
  const $translate = { instant: (k) => (scen.names || {})[k] || k, use: () => scen.lang || 'en' };
  const services = { $rootScope, $q: { when: (v) => Promise.resolve(v) }, $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)), NHKPluginService: NHK, HomeService: HS, $ionicPopup, $ionicPlatform, $translate };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(SRC);
  await sleep(800);
  const doc = w.document;
  return { w, doc, logs, native, handlers, $rootScope, popups, approvals, backActions, services, A: w.__nxA11y,
    q: (s) => doc.querySelector(s), qa: (s) => Array.from(doc.querySelectorAll(s)),
    snack: () => Array.from(doc.querySelectorAll('.nx-snack')),
    live: () => (doc.getElementById('nx-live') || { textContent: '' }).textContent,
    newUser: (name) => w.dispatchEvent(Object.assign(new w.Event('newUser'), { username: name || 'Home assistant' })),
    stateChange: (name) => (handlers['$stateChangeSuccess'] || []).forEach((f) => f({}, { name: name || 'tabsController.favorites' })) };
}

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async function () {
  // ================================================================================== the heading of a page and the status chip (since the merge the chip is a button inside the header title)
  const CHIP = '<button type="button" class="nx-chip" aria-haspopup="dialog" aria-label="Accessory online. Opens connection details"><span class="nx-chip-text">Accessory online</span><span class="nx-chip-tag"></span></button>';
  const WIZARD = '<ion-nav-bar><div class="nav-bar-block" nav-bar="active"><div class="bar bar-header"><div class="title">' + CHIP + '</div><div class="buttons-right"><button class="button ion-ios-arrow-forward">Next</button></div></div></div></ion-nav-bar>' +
    '<ion-view><div class="scroll"><h2>Name of your Home</h2><p>Give it a name.</p></div></ion-view>';
  {
    const env = await environment({ homes: [home([device()])], body: WIZARD, hash: '#/start-home' });
    const d = env.doc, A = env.A;
    Object.defineProperty(env.w.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });      // jsdom has no layout: everything is "shown"
    // (the patch has put its own chip text in by now; make sure that the chip says something, as it does in the app: this is what the old rule counted as the title)
    const chip0 = d.querySelector('.nx-chip'); chip0.hidden = false; chip0.children[0].textContent = 'Accessory online';
    A.pass();
    const title = d.querySelector('.bar .title'), h2 = d.querySelector('ion-view h2');
    ok('(the chip has text, so the title box has text)', (title.textContent || '').trim() === 'Accessory online', title.textContent);
    ok('a bar with no title of its own (the chip alone in it) is not a heading', title.getAttribute('role') === null && title.getAttribute('aria-level') === null, [title.getAttribute('role'), title.getAttribute('aria-level')]);
    ok('...the heading of such a page is its first h2, level 1', h2.getAttribute('aria-level') === '1', h2.getAttribute('aria-level'));
    ok('the chip is English text in a page of any language: lang=en', d.querySelector('.nx-chip').getAttribute('lang') === 'en');
  }
  {
    const TITLED = '<ion-nav-bar><div class="nav-bar-block" nav-bar="active"><div class="bar bar-header"><div class="title"><span class="nav-bar-title">AABBCC</span>' + CHIP + '</div></div></div></ion-nav-bar>' +
      '<ion-view><div class="device-info"><div class="nx-state"><strong>Closed</strong></div><button type="button" class="nx-last" data-ng-click="x()"><span class="nx-last-text">Last: Close</span></button></div><div class="row"><div class="nx-line" role="status"><span class="nx-line-text">Checking the gate…</span></div></div><h2>Not a title</h2></ion-view>';
    const env = await environment({ homes: [home([device()])], body: TITLED, hash: '#/tabs/favorites-device-detail/1/' + MAC });
    const d = env.doc, A = env.A;
    Object.defineProperty(env.w.HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentElement; } });
    A.pass();
    const title = d.querySelector('.bar .title');
    ok('a titled bar (the title and the chip) is the level-1 heading', title.getAttribute('role') === 'heading' && title.getAttribute('aria-level') === '1');
    ok('...and the h2 of the page does not become a second level-1 heading', d.querySelector('ion-view h2').getAttribute('aria-level') === null, d.querySelector('ion-view h2').getAttribute('aria-level'));
    ok('the status line and the Activity entry (English words of the patches) say so: lang=en', d.querySelector('.nx-line').getAttribute('lang') === 'en' && d.querySelector('.nx-last').getAttribute('lang') === 'en');
    ok('the state word (translated by the app) is left alone: no lang', d.querySelector('.nx-state').getAttribute('lang') === null);
    // the title text is read without the chip
    title.querySelector('.nav-bar-title').textContent = '';
    A.pass();
    ok('when the title text goes (the chip stays), the heading role goes with it', title.getAttribute('role') === null && title.getAttribute('aria-level') === null, [title.getAttribute('role')]);
  }

  // ================================================================================== the snack of a request for access: Review by key press / TalkBack, and with a sheet open
  {
    const env = await environment({ homes: [home([device()])], waiting: [{ id: 2, username: 'Home assistant', description: 'Pixel 7' }], hash: '#/tabs/favorites-device-detail/1/' + MAC });
    const d = env.doc, w = env.w;
    env.newUser(); await sleep(1700);
    const btn = d.querySelector('.nx-snack button');
    ok('a request that arrives on the accessory screen shows the snack with Review', !!btn && /Review/.test(btn.textContent));
    const seen = [];
    d.addEventListener('click', (e) => seen.push([e.target.tagName, e.detail, e.isIonicTap === true]), true);      // Ionic's gate is on document, after the window's capture
    btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    ok('Review: a click with detail 0 (Enter, TalkBack) is let through Ionic\'s tap gate (the snack is in GATE_SCOPE); it was dropped before', seen.length === 1 && seen[0][2] === true, seen);
    ok('...and it takes the person to Settings', /settings/.test(w.location.hash), w.location.hash);
  }
  {
    const env = await environment({ homes: [home([device()])], waiting: [{ id: 2, username: 'Home assistant', description: 'Pixel 7' }], hash: '#/tabs/favorites-device-detail/1/' + MAC });
    const d = env.doc, w = env.w;
    w.NX.open(); await sleep(400);
    ok('(a status sheet is open on the accessory screen)', env.q('#nx-sheet').classList.contains('nx-open'));
    env.newUser(); await sleep(1700);
    ok('a request that arrives while the sheet is open waits (no popup over the sheet) and shows the snack', env.popups.length === 0 && !!d.querySelector('.nx-snack button'), env.popups.length);
    d.querySelector('.nx-snack button').click(); await sleep(400);
    ok('Review closes the sheet that lies under the snack (it stayed open over Settings, and the popup could not follow while it was)', /settings/.test(w.location.hash) && !env.q('#nx-sheet').classList.contains('nx-open'), [w.location.hash, env.q('#nx-sheet').className]);
  }

  // ================================================================================== a tap that opens the Debug log must not close it again
  {
    const dl = read('debuglog.js');
    ok('the scrim of the Debug log is not data-tap-disabled (the browser\'s click after the tap on the Settings row would land on it and close the log; only Ionic\'s gate keeper stops that click)',
      /scrim = el\('div', 'nx-scrim', \{ 'aria-hidden': 'true' \}\)/.test(dl) && !/nx-scrim'[^)]*data-tap-disabled/.test(dl));
    ok('the panel and the docked button still are (their own clicks arrive as plain clicks)', /id: 'nx-log-button'[^}]*'data-tap-disabled': 'true'/.test(dl) && /id: 'nx-log-panel'[^}]*'data-tap-disabled': 'true'/.test(dl));
  }

  // ================================================================================== the sources of the CSS
  {
    const status = read('skin/src/status.css'), gate = read('skin/src/nx23-gate.css'), dialogs = read('skin/src/nx23-dialogs.css');
    ok('a sheet and its scrim that are closing take no touch (the class nx-open is gone, the box is displayed for 350 to 420 ms more): Stop under them is the person\'s at once',
      /\.nx-scrim:not\(\.nx-open\), \{\{P\}\} \.nx-sheet:not\(\.nx-open\)(, \{\{P\}\} \.nx-gal:not\(\.nx-open\))? \{ pointer-events: none; \}/.test(status));      // (the same rule was also found by another QA, with the Design page added: both forms are right)
    ok('the hit area of the Activity entry grows upwards only (8 dp into the state word) and the visible entry is above the control of the status line under it',
      /\{\{P\}\} \.nx-last \{ z-index: 1; \}/.test(gate) && /\.nx-last:after \{ content: ''; position: absolute; inset: -8px 0 0; \}/.test(gate) && !/\.nx-last::after/.test(dialogs));
  }
  console.log(failures ? 'FAILED ' + failures + ' of ' + total : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
