// Test of nx23 "Dialogs, LOG and accessibility" in nx-patch.js (jsdom, with a simulated Angular, Ionic and Cordova): the pairing popup (never over the accessory screen, snooze, content), the
// accessibility layer (roles, names, tab stops, language, live state, the click filter for Ionic's tap gate, the keyboard) and the dialog manager (focus, inert, Escape, Back, the watchdog).
// jsdom has no layout, no real focus order and no real inert: it asserts attributes, the active element and what the code calls; harness/steps-a11y.cjs, steps-dialogs.cjs, steps-log.cjs and
// steps-approve-pad.cjs check the same things in Chromium with the real app. All data is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-dialogs.test.js
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
const WAITING = [{ id: 2, username: 'Home assistant', description: 'Pixel 7' }];

(async function () {
  // ================================================================================== the pairing popup (I-05, I-20)
  {
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/favorites-device-detail/1/' + MAC });
    env.newUser(); await sleep(1700);
    ok('I-05: on the accessory screen no popup opens (no modal over the gate)', env.popups.length === 0, env.popups.length);
    const s = env.snack();
    ok('I-05: a snack says who wants access and offers Review (8 s)', s.length === 1 && /^Home assistant wants access/.test(s[0].textContent) && s[0].querySelector('button') && s[0].querySelector('button').textContent === 'Review', s.map((x) => x.textContent));
    ok('I-05: html[data-nx-pending] counts the waiting requests', env.doc.documentElement.getAttribute('data-nx-pending') === '1');
    ok('I-05: the snack is announced once through the live region', /Home assistant wants access/.test(env.live()), env.live());
    env.newUser(); await sleep(1500);
    ok('I-05: the same request does not make a second snack or a popup', env.popups.length === 0 && env.snack().length <= 1 && env.doc.documentElement.getAttribute('data-nx-pending') === '1');
    // leaving the accessory screen releases it
    env.w.location.hash = '#/tabs/favorites';
    env.stateChange('tabsController.favorites');
    await sleep(1200);
    ok('I-05: when the person has left the accessory screen the popup opens (one request at a time)', env.popups.length === 1, env.popups.length);
    ok('I-05: ...and the marker is gone', !env.doc.documentElement.hasAttribute('data-nx-pending'));
    const p = env.popups[0] || {};
    ok('I-20: title "Allow access?", buttons "Not now" and "Allow", the class that styles it', p.title === 'Allow access?' && p.cancelText === 'Not now' && p.okText === 'Allow' && p.cssClass === 'nx-popup', p);
    ok('I-20: the body names the user and the phone (description in brackets), the accessory by its description, and warns', p.template === '<b>Home assistant</b> (Pixel 7) wants to open and close “AABBCC”. Only allow people you know.', p.template);
    ok('I-20: no inline centring (the body is left-aligned by the skin)', !/text-align/.test(p.template || ''));
    ok('I-20: the popup is answered with "Allow": one approval, and the toast says who can open and close the gate', env.approvals.length === 1 && env.snack().some((x) => x.textContent === '“Home assistant” can now open and close the gate.'), [env.approvals, env.snack().map((x) => x.textContent)]);
  }
  {
    // the six route names that contain device-detail (and so keep the popup away); every other route lets it open
    const names = ['controls-device-detail', 'controls-device-detail-bridge', 'favorites-device-detail-bridge', 'controls-device-detail-bidi-bridge', 'favorites-device-detail-bidi-bridge', 'favorites-device-detail'];
    const results = [];
    for (const n of names.slice(0, 3)) {
      const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/' + n + '/1/' + MAC });
      env.newUser(); await sleep(1300);
      results.push(n + ':' + env.popups.length);
    }
    ok('I-05: controls-device-detail, ...-bridge and favorites-device-detail-bridge all count as the accessory screen', results.every((r) => /:0$/.test(r)), results);
    const rest = [];
    for (const n of names.slice(3)) {
      const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/' + n + '/1/' + MAC });
      env.newUser(); await sleep(1300);
      rest.push(n + ':' + env.popups.length);
    }
    ok('I-05: and so do the two bidi-bridge variants', rest.every((r) => /:0$/.test(r)), rest);
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/settings/false' });
    env.newUser(); await sleep(1300);
    ok('I-05: on any other screen (Settings) the popup opens at once', env.popups.length === 1, env.popups.length);
  }
  {
    // "Not now": 24 hours; the checks that the person asks for ignore it; storage that throws does not break anything
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/favorites', popupAnswer: false });
    env.newUser(); await sleep(1500);
    const kept = JSON.parse(env.w.localStorage.getItem('nxSnooze') || '{}');
    ok('I-05: "Not now" snoozes for 24 hours (nxSnooze in storage)', env.popups.length === 1 && Object.keys(kept).length === 1 && Math.abs(Object.values(kept)[0] - Date.now() - 86400000) < 5000, kept);
    env.newUser(); await sleep(1500);
    env.w.document.dispatchEvent(new env.w.Event('resume'));
    await sleep(300);
    ok('I-05: no second popup for the same request at the next newUser', env.popups.length === 1 && env.logs.some((l) => /new user: snoozed/.test(l)), env.popups.length);
    env.w.NX.checkWaitingUsers(true); await sleep(1200);
    ok('I-05: a check that the person asks for ignores the snooze', env.popups.length === 2, env.popups.length);
    const k = Object.keys(JSON.parse(env.w.localStorage.getItem('nxSnooze')))[0];
    env.w.localStorage.setItem('nxSnooze', JSON.stringify({ [k]: Date.now() - 1 }));
    env.newUser(); await sleep(1500);
    ok('I-05: after the 24 hours the request is offered again', env.popups.length === 3, env.popups.length);
    env.w.localStorage.setItem('nxSnooze', '{not json');
    env.newUser(); await sleep(1500);
    ok('I-05: a damaged snooze entry is ignored', env.popups.length === 4, env.popups.length);
  }
  {
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/favorites', popupAnswer: false, storageThrows: 'nxSnooze' });
    env.newUser(); await sleep(1500);
    ok('I-05: storage that cannot be written (the snooze is lost) breaks nothing; the log says so', env.popups.length === 1 && env.logs.some((l) => /snooze: not saved/.test(l)), env.logs.filter((l) => /snooze/.test(l)));
  }
  {
    // a dialog that is open (the status sheet) keeps the popup away too, and the sheet closes for a check that the person asked for
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/settings/false' });
    env.w.NX.open(); await sleep(250);
    env.newUser(); await sleep(1500);
    ok('I-05: while the status sheet is open, a request waits (no popup over a sheet)', env.popups.length === 0 && env.doc.documentElement.getAttribute('data-nx-pending') === '1', env.popups.length);
    env.w.NX.close(); await sleep(1600);
    ok('I-05: when the sheet is closed the request opens', env.popups.length === 1, env.popups.length);
    const e2 = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/settings/false', popupAnswer: false });
    e2.w.NX.open(); await sleep(250);
    e2.w.NX.checkWaitingUsers(true); await sleep(1200);
    ok('I-05: "New users" in the status sheet closes the sheet and opens the popup over the page', e2.popups.length === 1 && !e2.q('#nx-sheet').classList.contains('nx-open'), e2.popups.length);
  }
  {
    // the Review action
    const env = await environment({ homes: [home([device()])], waiting: WAITING, hash: '#/tabs/favorites-device-detail/1/' + MAC });
    env.newUser(); await sleep(1500);
    env.q('.nx-snack button').click();
    ok('I-05: Review goes to Settings and the snack is gone', /#\/tabs\/settings\/false$/.test(env.w.location.hash) && env.snack().length === 0, env.w.location.hash);
  }
  {
    // content: a long description is cut, HTML is escaped, the name falls back to name and mac
    const long = 'x'.repeat(60);
    const env = await environment({ homes: [home([device({ description: undefined })])], waiting: [{ id: 5, username: '<i>Ben</i>', description: long }], hash: '#/tabs/settings/false' });
    env.newUser('Ben'); await sleep(1300);
    const t = (env.popups[0] || {}).template || '';
    ok('I-20: the phone description is cut at 40 characters and the name is escaped', /\(x{40}\)/.test(t) && !/x{41}/.test(t) && /&lt;i&gt;Ben&lt;\/i&gt;/.test(t) && !/<i>/.test(t), t);
    ok('I-20: without a description the accessory is called by its name', /“NiceIT4WIFIAABBCC”/.test(t), t);
    const e2 = await environment({ homes: [home([device({ description: undefined, name: undefined })])], waiting: [{ id: 6, username: 'Anna' }], hash: '#/tabs/settings/false' });
    e2.newUser('Anna'); await sleep(1300);
    ok('I-20: ...and by its MAC address if it has neither; no brackets without a phone', /“00:0B:6C:AA:BB:CC”/.test((e2.popups[0] || {}).template || '') && !/\(/.test((e2.popups[0] || {}).template || ''), (e2.popups[0] || {}).template);
    const e3 = await environment({ homes: [home([device()])], waiting: [{ id: 7, username: 'Anna', description: 'Anna' }], hash: '#/tabs/settings/false' });
    e3.newUser('Anna'); await sleep(1300);
    ok('I-20: a phone description that repeats the name is not repeated', !/\(/.test((e3.popups[0] || {}).template || ''), (e3.popups[0] || {}).template);
  }
  {
    // the failure toasts: cause first, with the name of the person
    const run = async (err, names) => { const env = await environment({ homes: [home([device()])], waiting: [{ id: 2, username: 'X' }], hash: '#/tabs/settings/false', approveErr: err, names }); env.newUser('X'); await sleep(1300); return env.snack().map((s) => s.textContent).join('|'); };
    ok('I-20: code 11: the accessory has reached its maximum number of users', await run({ code: 11 }) === '“X” was not allowed: the accessory has reached its maximum number of users.');
    ok('I-20: a code the app explains: cause and code', await run({ code: 6 }, { 'NHK_ERROR-6': 'Value not valid' }) === '“X” was not allowed: Value not valid (6).');
    ok('I-20: a code the app does not explain: the code only', await run({ code: 7 }) === '“X” was not allowed (7).');
    ok('nx23 QA: the app\'s text for a failure ends with the sentence about "a command that was just sent" (skin/copy/copy.json): an approval is not a command, so only the cause is said', await run({ code: 3 }, { 'NHK_ERROR-3': 'The connection to the accessory was lost. If you just sent a command, it was not confirmed: check the gate, then try again.' }) === '“X” was not allowed: The connection to the accessory was lost (3).');
    ok('I-20: plain text from the native layer', await run('timeout') === '“X” was not allowed: timeout.');
    ok('I-20: nothing to say: the accessory did not answer', await run({}) === '“X” was not allowed: the accessory did not answer.');
  }

  // ================================================================================== the accessibility layer (I-21, I-33)
  const PAGE = '<ion-nav-bar><div class="nav-bar-block" nav-bar="cached"><div class="bar bar-header"><div class="title">Old</div><button class="button back-button ion-ios-arrow-back"></button></div></div>' +
    '<div class="nav-bar-block" nav-bar="active"><div class="bar bar-header"><button class="button back-button ion-ios-arrow-back"></button><div class="title">AABBCC</div><div class="right-buttons"><button class="button icon-occhio back-button"></button><button class="button ion-android-add"></button></div></div></div></ion-nav-bar>' +
    '<ion-view><div class="device-info"><div class="device-row"><span translate="DEVICE_DETAIL_LABEL_STATE"></span><strong>Closed</strong></div><div class="device-row nx-last-row"><a class="nx-last" data-ng-click="nxActivity(d)"><span>Close</span></a></div></div>' +
    '<div class="device-commands"><a class="command" data-ng-click="run(\'open\')"><span translate="DEVICE_COMMAND_open">Open</span></a><a class="command" data-ng-click="run(\'stop\')"><span translate="DEVICE_COMMAND_stop">Stop</span></a>' +
    '<a class="command" data-ng-click="run(\'close\')"><span translate="DEVICE_COMMAND_close">Close</span></a><div class="nx-extras"><a class="command nx-extra" data-ng-click="x()"><span>Open and Block</span></a><a class="nx-extra-edit" data-ng-click="y()">Choose commands</a></div></div>' +
    '<div class="list"><div class="item" data-ng-click="gotoDemo()"><span>Demo</span></div><a class="item" href="#/x" data-ng-click="z()">Link</a><button class="item item-button" data-ng-click="add()">Add Home...</button>' +
    '<div class="item item-icon-right" data-ng-click="row()"><span>Scelta</span><button class="button button-clear"><i class="icon ion-ios-arrow-forward"></i></button></div>' +
    '<ion-toggle class="item item-toggle"><span>Enable the optional command</span><label class="toggle"><input type="checkbox"><div class="track"><div class="handle"></div></div></label></ion-toggle>' +
    '<div class="nx-seg" role="radiogroup"><a class="nx-seg-btn" role="radio" tabindex="0" aria-checked="false" data-ng-click="t(\'auto\')">Auto</a><a class="nx-seg-btn" role="radio" tabindex="0" aria-checked="true" data-ng-click="t(\'light\')">Light</a><a class="nx-seg-btn" role="radio" tabindex="0" aria-checked="false" data-ng-click="t(\'dark\')">Dark</a></div>' +
    '<ion-tab data-ng-click="selectTab(1)"></ion-tab></div></ion-view>' +
    '<div class="tabs"><a class="tab-item tab-item-active" data-ng-click="s(1)"><i class="icon icon-casa"></i><span>Favorites</span></a><a class="tab-item" data-ng-click="s(2)"><span>System</span></a><a class="tab-item" data-ng-click="s(3)"><i class="icon icon-settings"></i><span>Settings</span></a></div>' +
    '<div class="bar-footer bridge_stepper"><div class="stepper" style="width: 25%"></div></div><form><button type="submit" style="opacity: 0; position: absolute"></button></form>';
  {
    const env = await environment({ homes: [home([device()])], body: PAGE, hash: '#/tabs/favorites-device-detail/1/' + MAC });
    const d = env.doc, A = env.A, at = (s, k) => (d.querySelector(s) || { getAttribute: () => 'NOEL' }).getAttribute(k);
    A.pass();
    ok('I-21: the pad is three buttons with a tab stop and a name that says what it does', ['open', 'stop', 'close'].every((k, i) => { const e = d.querySelectorAll('.device-commands > a.command')[i]; return e.getAttribute('role') === 'button' && e.getAttribute('tabindex') === '0' && e.getAttribute('aria-label') === { open: 'Open the gate', stop: 'Stop the gate', close: 'Close the gate' }[k] && e.hasAttribute('data-nx-act'); }));
    ok('I-21: an extra command and "Choose commands" are buttons (they keep their own text as the name)', ['.nx-extra', '.nx-extra-edit'].every((s) => at(s, 'role') === 'button' && at(s, 'tabindex') === '0' && at(s, 'aria-label') === null), 'x');
    ok('I-21: the line of the last movement is a button that opens a dialog', at('.nx-last', 'role') === 'button' && at('.nx-last', 'aria-haspopup') === 'dialog');
    ok('I-21: the eye is named "More commands" (it also has the class of a back button), Back is named, Add is named', at('.icon-occhio', 'aria-label') === 'More commands' && at('.nav-bar-block[nav-bar=active] .ion-ios-arrow-back', 'aria-label') === 'Back' && at('.ion-android-add', 'aria-label') === 'Add');
    ok('I-21: a row with a click handler is a button with a tab stop; a link, a native button and an ion-tab are left alone', at('.item[data-ng-click="gotoDemo()"]', 'role') === 'button' && at('a.item', 'role') === null && at('button.item-button', 'role') === null && at('ion-tab', 'role') === null && at('ion-tab', 'tabindex') === null);
    ok('I-21: a row whose only button is its arrow is the button, and the arrow leaves the tree', at('.item[data-ng-click="row()"]', 'role') === 'button' && at('.item[data-ng-click="row()"] button', 'aria-hidden') === 'true' && at('.item[data-ng-click="row()"] button', 'tabindex') === '-1');
    ok('I-21: the hidden submit button of a form is not a control', at('button[type=submit]', 'aria-hidden') === 'true' && at('button[type=submit]', 'tabindex') === '-1');
    ok('I-21: the switch of Ionic: the label is a switch with a name, a tab stop and aria-checked', at('label.toggle', 'role') === 'switch' && at('label.toggle', 'aria-label') === 'Enable the optional command' && at('label.toggle', 'tabindex') === '0' && at('label.toggle', 'aria-checked') === 'false');
    d.querySelector('label.toggle input').checked = true; d.querySelector('label.toggle input').dispatchEvent(new env.w.Event('change', { bubbles: true }));
    ok('I-21: ...and aria-checked follows the input', at('label.toggle', 'aria-checked') === 'true');
    ok('I-21: a radio group has one tab stop: the radio that is checked', Array.from(d.querySelectorAll('.nx-seg-btn')).map((e) => e.getAttribute('tabindex')).join() === '-1,0,-1');
    ok('I-21: the screen of a view that was left has its bar inert (no second Back, no second eye)', at('.nav-bar-block[nav-bar=cached]', 'inert') === '' && at('.nav-bar-block[nav-bar=active]', 'inert') === null);
    ok('I-21: #nx-status comes right behind the header in the Tab order', env.q('#nx-status').previousElementSibling === d.querySelector('ion-nav-bar'), env.q('#nx-status').previousElementSibling && env.q('#nx-status').previousElementSibling.tagName);
    ok('I-33: the title is a level-1 heading', at('.nav-bar-block[nav-bar=active] .title', 'role') === 'heading' && at('.nav-bar-block[nav-bar=active] .title', 'aria-level') === '1');
    ok('I-33: the tab bar is a tab list; the active tab is aria-current=page and selected; the others are not', at('.tabs', 'role') === 'tablist' && Array.from(d.querySelectorAll('.tab-item')).map((e) => e.getAttribute('role') + ':' + e.getAttribute('aria-selected') + ':' + e.getAttribute('aria-current')).join() === 'tab:true:page,tab:false:null,tab:false:null');
    d.querySelectorAll('.tab-item')[0].classList.remove('tab-item-active'); d.querySelectorAll('.tab-item')[1].classList.add('tab-item-active'); A.pass();
    ok('I-33: ...and it follows the tab that is chosen', d.querySelectorAll('.tab-item')[1].getAttribute('aria-current') === 'page' && d.querySelectorAll('.tab-item')[0].getAttribute('aria-current') === null);
    ok('I-33: the state of the gate is a live region (polite)', at('.device-info .device-row', 'role') === 'status' && at('.device-info .device-row', 'aria-live') === 'polite' && at('.device-info .device-row', 'aria-atomic') === 'true');
    d.querySelector('.device-info .device-row').innerHTML += '<span class="status-1">Obstruction</span>'; A.pass();
    ok('I-33: ...and assertive while an obstruction is shown', at('.device-info .device-row', 'aria-live') === 'assertive');
    ok('I-33: the wizard progress strip is a progress bar with the width as its value', at('.bridge_stepper', 'role') === 'progressbar' && at('.bridge_stepper', 'aria-valuenow') === '25' && at('.bridge_stepper', 'aria-valuemax') === '100' && at('.bridge_stepper', 'aria-label') === 'Setup progress');
    d.querySelector('.stepper').style.width = '60%'; A.pass();
    ok('I-33: ...and follows the width', at('.bridge_stepper', 'aria-valuenow') === '60');
    ok('I-33: html has a language, and the Debug log button hides while the app has an accessory (data-nx-chip=1)', d.documentElement.getAttribute('lang') === 'en' && d.documentElement.getAttribute('data-nx-chip') === '1');
    ok('I-21: the layer reported no error', A.errors.length === 0, A.errors);
    // the language follows $translate.use(); the English names of the pad give way to the visible words in another language
    env.services.$translate.use = () => 'de'; A.pass();
    ok('I-33: html lang follows $translate.use() (de); the pad keeps its own visible word as the name in another language', d.documentElement.getAttribute('lang') === 'de' && d.querySelector('.device-commands > a.command').getAttribute('aria-label') === null);
    env.services.$translate.use = () => 'pt_BR'; A.pass();
    ok('I-33: pt_BR becomes pt-BR', d.documentElement.getAttribute('lang') === 'pt-BR');
    env.services.$translate.use = () => 'x'; A.pass();
    ok('I-33: a key that is no language tag becomes en, and the English names return', d.documentElement.getAttribute('lang') === 'en' && d.querySelector('.device-commands > a.command').getAttribute('aria-label') === 'Open the gate');
    env.w.localStorage.setItem('keyHomes', '[]'); A.pass();
    ok('I-14: without an accessory data-nx-chip is 0 (the Debug log button is docked in the header)', d.documentElement.getAttribute('data-nx-chip') === '0');
  }
  {
    const env = await environment({ homes: [home([device()])], body: '<ion-nav-bar><div class="nav-bar-block" nav-bar="active"><div class="bar bar-header"><div class="title"></div></div></div></ion-nav-bar><ion-view><h2>Sign up</h2><h2>More</h2></ion-view>' });
    env.A.pass();
    const h = Array.from(env.doc.querySelectorAll('h2')).map((e) => e.getAttribute('aria-level'));
    ok('I-33: a page without a title in its bar (the setup wizard) gets its first h2 as the level-1 heading (jsdom has no layout: offsetParent is null, so only the rule is checked)', h.length === 2 && (h[0] === null || h[0] === '1'));
  }

  // ---------------------------------------------------------------------------------- Ionic's tap gate and the keyboard
  {
    const env = await environment({ homes: [home([device()])], body: PAGE });
    const d = env.doc, w = env.w, A = env.A;
    A.pass();
    const seen = [];
    d.addEventListener('click', (e) => seen.push([e.target.className || e.target.tagName, e.isIonicTap === true]), true);   // Ionic's gate is on document, after the window's capture
    const click = (el, detail) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: detail }));
    click(d.querySelector('.device-commands > a.command'), 0);
    click(d.querySelector('.device-commands > a.command'), 1);
    click(d.querySelector('.nx-extra'), 0);
    click(d.querySelector('.list .item[data-ng-click="gotoDemo()"]'), 0);
    click(d.querySelector('h2') || d.querySelector('.tabs'), 0);
    ok('I-21: a click with detail 0 (a key press, el.click(), TalkBack) inside a control of ours is let through Ionic\'s gate (isIonicTap)', seen[0][1] === true, seen);
    ok('I-21: a touch click (detail 1) is not touched: Ionic still makes the one click of a tap and stops the other', seen[1][1] === false, seen);
    ok('I-21: extras and rows are in the scope too; a click on something that is not a control is not', seen[2][1] === true && seen[3][1] === true && seen[4][1] === false, seen);
    // QA review: our own native buttons (the chip, the Activity entry, the button of the status line, the pill) have no data-nx-act: a key press on them has to pass the gate by their class (GATE_SCOPE)
    const mine = ['nx-chip', 'nx-last', 'nx-line-act', 'nx-pill nx-block', 'button nx-x'].map((c) => { const b = d.createElement('button'); b.className = c; d.body.appendChild(b); return b; });
    const other = d.createElement('button'); other.className = 'button item-button'; d.body.appendChild(other);
    seen.length = 0;
    mine.forEach((b) => click(b, 0)); click(other, 0); click(mine[0], 1);
    ok('QA review: a click with detail 0 on our own native buttons (.nx-chip, .nx-last, .nx-line-act, .nx-pill) passes Ionic\'s gate; on a button of the app it does not; a touch click (detail 1) is never touched',
      mine.every((b, i) => seen[i][1] === true) && seen[mine.length][1] === false && seen[mine.length + 1][1] === false, seen);
    // the keyboard
    const clicks = [];
    d.querySelectorAll('.device-commands > a.command').forEach((a, i) => a.addEventListener('click', () => clicks.push(i)));
    const key = (el, k, extra) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})); el.dispatchEvent(e); return e; };
    const open = d.querySelector('.device-commands > a.command');
    key(open, 'Enter'); key(open, ' ');
    ok('I-21: Enter and Space press a control that is only a click handler (one click each)', clicks.join() === '0,0', clicks);
    key(open, 'Enter', { repeat: true });
    ok('I-21: a held key does not queue commands (repeat is ignored)', clicks.length === 2, clicks);
    const e = key(open, 'Enter', { ctrlKey: true });
    ok('I-21: Enter with Ctrl is not ours', clicks.length === 2 && !e.defaultPrevented);
    const nativeClicks = []; const nb = d.querySelector('button.item-button'); nb.addEventListener('click', () => nativeClicks.push(1));
    key(nb, 'Enter');
    ok('I-21: a native button is left to the browser (no second click from us)', nativeClicks.length === 0);
    const radios = Array.from(d.querySelectorAll('.nx-seg-btn')), rc = [];
    radios.forEach((r, i) => r.addEventListener('click', () => rc.push(i)));
    radios[1].focus(); key(radios[1], 'ArrowRight');
    ok('I-21: ArrowRight in a radio group focuses and presses the next radio; the tab stop moves with it', rc.join() === '2' && d.activeElement === radios[2] && radios[2].getAttribute('tabindex') === '0' && radios[1].getAttribute('tabindex') === '-1', [rc, radios.map((r) => r.getAttribute('tabindex'))]);
    key(radios[2], 'ArrowRight'); key(radios[0], 'End'); key(radios[2], 'Home');
    ok('I-21: ...it wraps round, and End and Home go to the last and the first', rc.join() === '2,0,2,0', rc);
  }

  // ================================================================================== the dialog manager (I-22)
  {
    const env = await environment({ homes: [home([device()])], body: PAGE, hash: '#/tabs/favorites-device-detail/1/' + MAC });
    const d = env.doc, w = env.w, A = env.A;
    A.pass();
    const opener = d.querySelector('.nx-last'); opener.focus();
    const sheet = env.q('#nx-sheet');
    ok('I-22: the status sheet has a name from its own title, a lang and no busy flag', sheet.getAttribute('aria-labelledby') === 'nx-sheet-title' && sheet.getAttribute('lang') === 'en' && sheet.getAttribute('aria-busy') === 'false' && env.q('.nx-scrim').getAttribute('aria-hidden') === 'true');
    w.NX.open(); await sleep(250);
    ok('I-22: opening a sheet moves the focus into it (the container, tabindex -1)', d.activeElement === sheet && sheet.getAttribute('tabindex') === '-1', d.activeElement && d.activeElement.tagName);
    ok('I-22: ...the page behind it is inert (and only that; the scrim, the snack and the live region are not)', env.qa('[data-nx-inert]').length > 0 && env.qa('[data-nx-inert]').every((e) => e.hasAttribute('inert') && !e.contains(sheet) && !e.classList.contains('nx-scrim') && e.id !== 'nx-live') && !sheet.hasAttribute('inert') && !env.q('.nx-scrim').hasAttribute('inert'), env.qa('[data-nx-inert]').map((e) => e.tagName));
    ok('I-22: Ionic\'s back action is registered while a dialog is open, with priority 350 (above modal 200 and action sheet 300, below popup 400)', env.backActions.length === 1 && env.backActions[0].priority === 350 && !env.backActions[0].off, env.backActions.map((a) => a.priority));
    ok('I-22: ...and it closes the dialog on top (the status sheet)', (env.backActions[0].fn(), !sheet.classList.contains('nx-open')));
    await sleep(80);
    ok('I-22: closed: nothing is inert, the action is gone again, the focus is back on the opener', env.qa('[inert]:not([data-nx-cached])').length === 0 && env.backActions[0].off === true && d.activeElement === opener, [env.qa('[inert]:not([data-nx-cached])').length, env.backActions[0].off, d.activeElement && d.activeElement.className]);
    // Escape closes a sheet directly (a queued backbutton would arrive after the dialog is gone and the app would also go back)
    w.NX.open(); await sleep(250);
    const ev = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    sheet.dispatchEvent(ev);
    await sleep(80);
    ok('I-22: Escape closes the sheet, without firing a backbutton', ev.defaultPrevented && !sheet.classList.contains('nx-open') && !(w.__fired || []).includes('backbutton'), w.__fired);
    ok('I-22: ...and gives the focus back, leaving nothing inert', d.activeElement === opener && env.qa('[inert]:not([data-nx-cached])').length === 0);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok('I-22: Escape without a dialog does nothing', !(w.__fired || []).includes('backbutton'));
    // the popup: Ionic closes it itself (priority 400); our action is not registered for it; Escape goes through Ionic's back
    const before = env.backActions.length;
    d.body.insertAdjacentHTML('beforeend', '<div class="popup-container popup-showing active"><div class="popup"><div class="popup-head"><h3 class="popup-title">Allow access?</h3></div><div class="popup-body">Anna wants</div><div class="popup-buttons"><button class="button">Not now</button><button class="button button-positive">Allow</button></div></div></div>');
    await sleep(200);
    const pc = d.querySelector('.popup-container'), pop = d.querySelector('.popup');
    ok('I-22: a popup is an alertdialog with a name and a description, English, and the focus goes to "Not now" (never to "Allow")', pop.getAttribute('role') === 'alertdialog' && pop.getAttribute('aria-modal') === 'true' && pop.getAttribute('aria-labelledby') === 'nx-popup-title' && pop.getAttribute('aria-describedby') === 'nx-popup-body' && pop.getAttribute('lang') === 'en' && d.activeElement.textContent === 'Not now', d.activeElement && d.activeElement.textContent);
    ok('I-22: ...no back action of ours for a popup (Ionic\'s own closes it)', env.backActions.length === before);
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok('I-22: Escape on a popup goes through Ionic\'s back button', (w.__fired || []).includes('backbutton'));
    pc.classList.remove('popup-showing'); pc.classList.add('popup-hidden'); await sleep(80);
    ok('I-22: when the popup is hidden nothing is left inert', env.qa('[inert]:not([data-nx-cached])').length === 0);
    pc.remove();
    // the watchdog: an inert page without a dialog is freed within 1.2 s, and a touch frees it too
    const root = d.querySelector('ion-view'); root.setAttribute('inert', ''); root.setAttribute('data-nx-inert', '1');
    d.dispatchEvent(new w.Event('touchstart', { bubbles: true }));
    ok('I-22: the first touch frees a page that is inert without a dialog', !root.hasAttribute('inert') && !root.hasAttribute('data-nx-inert'));
    root.setAttribute('inert', ''); root.setAttribute('data-nx-inert', '1');
    await sleep(1300);
    ok('I-22: and so does the timer, within 1.3 s', !root.hasAttribute('inert'));
    ok('I-22: the layer reported no error, and the watchdog had to clear exactly the one inert page that this test left on purpose (by touch)', A.errors.length === 0 && A.events.length === 1, [A.errors, A.events]);
  }
  {
    // two dialogs: the one on top is the last; closing it makes the other the one on top again; the log is closed through its own function
    const env = await environment({ homes: [home([device()])], body: PAGE, hash: '#/tabs/settings/false' });
    const d = env.doc, w = env.w;
    let hidden = 0; w.__nxLogHide = () => { hidden++; };
    d.body.insertAdjacentHTML('beforeend', '<div class="nx-scrim"></div><div id="nx-log-panel" class="nx-sheet nx-log nx-open" style="display:flex" tabindex="-1"></div>');
    await sleep(1200);
    ok('I-22: the Debug log is one of the dialogs: the focus goes into it, Back closes it with window.__nxLogHide()', d.activeElement === d.getElementById('nx-log-panel') && env.backActions.length >= 1 && (env.backActions[env.backActions.length - 1].fn(), hidden === 1), hidden);
    d.body.insertAdjacentHTML('beforeend', '<div id="nx-gallery" class="nx-gal nx-open" style="display:flex"></div>');
    let closedGal = 0; w.NxGallery = { close: () => { closedGal++; } };
    await sleep(1200);
    ok('I-22: the Design page on top of the log is the dialog on top, and Back closes that one', w.__nxA11y.top().id === 'nx-gallery' && (w.__nxA11y.closeTop(), closedGal === 1));
    d.getElementById('nx-gallery').remove(); d.getElementById('nx-log-panel').remove();
    await sleep(1200);
    ok('I-22: when the dialogs are removed from the page nothing stays inert', env.qa('[inert]:not([data-nx-cached])').length === 0);
  }
  {
    // announcements
    const env = await environment({ homes: [home([device()])], body: PAGE });
    const d = env.doc, w = env.w;
    env.A.pass();
    await sleep(1800);      // the first refreshes of the chip (at 1.5 s) are over: from here on only this test writes to it
    const chip = env.q('#nx-status');
    ok('I-33: the chip is not a live region of its own (it is rewritten every 20 s, also with the same text): no aria-live, or aria-live off because role=status would make it one', !chip.hasAttribute('aria-live') || chip.getAttribute('aria-live') === 'off');
    const said = []; env.A.announce('(start)'); await sleep(150); new w.MutationObserver(() => { if (env.live()) said.push(env.live()); }).observe(d.getElementById('nx-live'), { childList: true, characterData: true, subtree: true });
    chip.setAttribute('data-level', 'ok'); chip.textContent = 'Accessory online'; await sleep(1000);
    const n1 = said.filter((t) => t === 'Accessory online').length;
    chip.textContent = 'Accessory online'; await sleep(1000);
    ok('I-33: a confirmed status is spoken once, after 0.7 s; the same text written again is not spoken again', n1 === 1 && said.filter((t) => t === 'Accessory online').length === 1, said);
    chip.setAttribute('data-level', 'unknown'); chip.textContent = 'Accessory: checking…'; await sleep(900);
    ok('I-33: "checking" is not spoken at once (the start-up sequence would be read three times)', !said.includes('Accessory: checking…'), said);
    chip.setAttribute('data-level', 'bad'); chip.textContent = 'Accessory not reachable'; await sleep(1000);
    ok('I-33: and the status that follows it is spoken', said.includes('Accessory not reachable'), said);
    // the explanation of the sheet
    const ex = env.q('#nx-sheet-explanation');
    ex.textContent = 'Everything is fine.'; await sleep(200);
    ok('I-22: a new explanation in the status sheet is spoken', said.includes('Everything is fine.'), said);
    const k = said.length; ex.textContent = 'Everything is fine.'; await sleep(200);
    ok('I-22: the same explanation written again is not', said.length === k);
    // the route diagram has a text equivalent
    env.q('#nx-sheet-route').innerHTML = '<div class="nx-node"><b>Phone</b><small>Wi-Fi HomeWifi</small></div><div class="nx-link nx-s-ok"><small>Wi-Fi<br>14 ms</small><i></i></div><div class="nx-node"><b>Accessory</b><small>192.168.1.72</small></div>';
    await sleep(200);
    const rt = env.q('#nx-sheet-route');
    ok('I-22: the route is an image with a label made of its parts and the state of the link', rt.getAttribute('role') === 'img' && rt.getAttribute('aria-label') === 'Route: Phone (Wi-Fi HomeWifi), connected via Wi-Fi 14 ms, Accessory (192.168.1.72)', rt.getAttribute('aria-label'));
    env.q('#nx-sheet-route').innerHTML = '<div class="nx-node"><b>Phone</b></div><div class="nx-link nx-s-fail"><small>Wi-Fi</small><i></i></div><div class="nx-link nx-s-unknown"><small>cloud</small><i></i></div><div class="nx-node"><b>Accessory</b></div>';
    await sleep(200);
    ok('I-22: ...failed and not checked links are told apart', /failed via Wi-Fi, not checked via cloud/.test(rt.getAttribute('aria-label')), rt.getAttribute('aria-label'));
  }
  {
    const env = await environment({ homes: [home([device()])], waiting: [], hash: '#/tabs/settings/false' });
    const w = env.w;
    w.NX.checkWaitingUsers(true); await sleep(300);
    ok('toast: "No users waiting." is a snack without a button, spoken through the live region', env.snack().length === 1 && env.snack()[0].querySelector('button') === null && /No users waiting/.test(env.live()) && env.snack()[0].getAttribute('role') === null, [env.snack().map((s) => s.outerHTML.slice(0, 80)), env.live()]);
  }
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);      // the timers of the patch keep node alive
})();
