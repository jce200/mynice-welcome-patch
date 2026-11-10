// Test of nx23 copy: the wording of failures (skin/copy/copy.json) and the wrapper in nx-patch.js (section "nx23 copy") that gives a sentence to a failure code that the app has no
// text for. All data is made up. Part A needs jsdom (without it, only part B runs).
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-copy.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('skipped: part A (the wrapper in nx-patch.js) needs jsdom (npm install, or point NODE_PATH at a folder with node_modules/jsdom); part B runs'); }
const SRC = fs.readFileSync(path.join(ROOT, 'nx-patch.js'), 'utf8');

// a $translate like the real one: the key is trimmed, a missing key comes back as it is
function fakeTranslate(table) {
  const t = { calls: [], instant(id) {
    t.calls.push(Array.prototype.slice.call(arguments));
    if (id == null || typeof id !== 'string') return id;
    const k = id.replace(/^\s+|\s+$/g, '');
    return Object.prototype.hasOwnProperty.call(table, k) ? table[k] : k;
  } };
  return t;
}
// nx-patch.js in a window that has the pieces of Angular that it looks at when it loads
function load(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, logs = [], blocks = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  const injector = { has: (n) => n in (opts.services || {}), get: (n) => opts.services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  if (opts.module === 'throws') w.angular.module = () => { throw new Error('Module "app" is not available'); };
  else if (opts.module) w.angular.module = (name) => ({ config: (arr) => { blocks.push({ name, arr }); } });
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(SRC);
  return { w, logs, blocks };
}
const TABLE = { ALERT_TITLE_WARNING: 'Attention', 'NHK_ERROR-3': 'a text for three', SOME_KEY: 'some text' };

(async function () {
  // ------------------------------------------------------------------------------------------------ A. the wrapper
  if (JSDOM) {
    ok('nx-patch.js has one delimited section "nx23 copy"', (SRC.match(/\/\/ ---- nx23 copy: begin/g) || []).length === 1 && (SRC.match(/\/\/ ---- nx23 copy: end/g) || []).length === 1 && SRC.indexOf('nx23 copy: begin') < SRC.indexOf('nx23 copy: end'));
    {
      const e = load({ module: true });
      const b = e.blocks[0];
      ok('before the app starts, a config block is added to the module "app"', e.blocks.length === 1 && b.name === 'app' && Array.isArray(b.arr) && b.arr[0] === '$provide' && typeof b.arr[1] === 'function');
      const decorators = {};
      b.arr[1]({ decorator: (n, arr) => { decorators[n] = arr; } });
      const T = fakeTranslate(TABLE), orig = T.instant;
      ok('the block decorates $translate and gives back the same service', Array.isArray(decorators.$translate) && decorators.$translate[0] === '$delegate' && decorators.$translate[1](T) === T);
      ok('the decorated instant is the wrapper, and it knows the function that it wraps', T.instant !== orig && T.instant.__nxCopy === true && T.instant.raw === orig);
    }
    {
      const T = fakeTranslate(TABLE);
      load({ services: { $translate: T } });
      await sleep(450);
      ok('without a decorator (or after the start of the app) the wrapper is installed through the injector', T.instant.__nxCopy === true);
    }
    {
      const e = load({ module: 'throws', services: {} });
      ok('without the module "app" nothing throws, and the log says that there is no decorator', typeof e.w.__nxCopy.wrap === 'function' && e.logs.some((l) => /copy: no decorator/.test(l)), e.logs.join('|'));
      const e2 = load({});
      ok('without Angular\'s module() (the tests of nx-patch.js) it is quiet too', e2.blocks.length === 0 && e2.logs.every((l) => !/no decorator/.test(l)));
    }
    {
      const e = load({ services: {} });
      const wrap = e.w.__nxCopy.wrap;
      ok('it does not wrap what is no $translate (nothing throws)', wrap(null) === false && wrap(undefined) === false && wrap({}) === false && wrap({ instant: 5 }) === false);
      const T = fakeTranslate(TABLE), orig = T.instant;
      ok('wrapping says yes once, and a second wrap changes nothing', wrap(T) === true && wrap(T) === false && T.instant.raw === orig && T.instant.raw.__nxCopy === undefined);
      // the app builds its alert as showAlert($ionicPopup, instant('ALERT_TITLE_WARNING'), instant('NHK_ERROR-' + code)): the arguments are asked for one after the other
      const alertText = (code) => { const args = [T.instant('ALERT_TITLE_WARNING'), T.instant('NHK_ERROR-' + code)]; return args[1]; };
      ok('a code that has no text becomes a sentence in the alert of the app', alertText(12) === 'The accessory reported error 12. Check the gate.', alertText(12));
      ok('a code of letters does too (an error name the app does not know)', alertText('SOCKET_CLOSED') === 'The accessory reported error SOCKET_CLOSED. Check the gate.');
      ok('so does a code with a dot, a hyphen and an underscore (24 characters at most)', alertText('A.B-C_1') === 'The accessory reported error A.B-C_1. Check the gate.' && /error A{24}\./.test(alertText('A'.repeat(24))));
      ok('no code at all ("undefined", "null", empty) says that an error was reported, without a code', ['undefined', 'null', 'NaN', ''].every((c) => alertText(c) === 'The accessory reported an error. Check the gate.'), ['undefined', 'null', 'NaN', ''].map(alertText).join('|'));
      ok('a code that is not a plain word is not put in the text (no markup, no long strings, no spaces)', ['<b>x</b>', '{{1+1}}', 'a b', 'A'.repeat(25), '12;drop'].every((c) => alertText(c) === 'The accessory reported an error. Check the gate.'), ['<b>x</b>', '{{1+1}}', 'a b'].map(alertText).join('|'));
      ok('the key is trimmed as instant() does', (() => { T.instant('ALERT_TITLE_WARNING'); return T.instant('NHK_ERROR-12 ') === 'The accessory reported error 12. Check the gate.'; })());
      ok('a code that has a text keeps it', alertText(3) === 'a text for three');
      ok('the title and every other key are what they were', T.instant('ALERT_TITLE_WARNING') === 'Attention' && (T.instant('ALERT_TITLE_WARNING'), T.instant('SOME_KEY')) === 'some text' && (T.instant('ALERT_TITLE_WARNING'), T.instant('NOT_A_KEY')) === 'NOT_A_KEY');
      // the helpers of nx-patch.js and nx-activity.js ask for the same keys outside the alert and compare the answer with the key: they still get the key
      ok('outside the alert (no title just before) a key without a text comes back as the key', (T.instant('SOME_KEY'), T.instant('NHK_ERROR-12')) === 'NHK_ERROR-12' && T.instant('NHK_ERROR-timeout') === 'NHK_ERROR-timeout' && T.instant('NHK_ERROR-undefined') === 'NHK_ERROR-undefined');
      ok('and it does not stay: the sentence is for the call right after the title only', (T.instant('ALERT_TITLE_WARNING'), T.instant('NHK_ERROR-12'), T.instant('NHK_ERROR-12')) === 'NHK_ERROR-12');
      ok('the function that was wrapped answers with the key, also right after the title', (T.instant('ALERT_TITLE_WARNING'), T.instant.raw.call(T, 'NHK_ERROR-12')) === 'NHK_ERROR-12');
      T.calls.length = 0;
      const r = T.instant('SOME_KEY', { a: 1 }, 'x', 'en');
      ok('every argument reaches the wrapped function, and other values (a list, nothing) pass through', r === 'some text' && JSON.stringify(T.calls[0]) === '["SOME_KEY",{"a":1},"x","en"]' && T.instant(null) === null && T.instant(undefined) === undefined && T.instant(['SOME_KEY']).length === 1);
      ok('the LOG says which code had no text', e.logs.some((l) => l === '[NX] copy: no text for NHK_ERROR-12'), e.logs.join('|'));
    }
    // the toast of the approval popup (a helper of nx-patch.js) with a code the app has no text for: still "Could not allow the user (12)."
    {
      const popups = [], handlers = {};
      const w0 = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true }).window;
      w0.localStorage.setItem('keyHomes', JSON.stringify([{ homeId: 1, name: 'Home', devices: [{ mac: '00:0B:6C:AA:BB:CC', address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', homeId: 1, pairingUsername: 'u', pairingPassword: 'p' }] }]));
      w0.cordova = { exec(okCb, failCb, svc, action) { setTimeout(() => { if (action === 'netState') okCb({ wifi: true, ssid: 'HomeWifi' }); else if (action === 'version') okCb('nx-test'); else if (/^(reconnect|release|setHints|checkSucceeded|checkFailed)$/.test(action)) okCb(); }, 0); } };
      const HS = { homes: JSON.parse(w0.localStorage.getItem('keyHomes')), updateDevice() {} };
      const NHK = { config: () => Promise.reject({ code: 'X' }), pairings: () => Promise.resolve({ activeUsers: [], waitingUsers: [{ id: 2, username: 'Ben' }] }), userApproved: () => Promise.reject({ code: 12 }) };
      const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability() { return { promise: Promise.resolve() }; } };
      const T = fakeTranslate(TABLE);
      const services = { $rootScope, $q: { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } }, $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)),
        NHKPluginService: NHK, HomeService: HS, $ionicPopup: { confirm(o) { popups.push(o); return Promise.resolve(true); } }, $translate: T };
      w0.angular = { element: () => ({ injector: () => ({ has: (n) => n in services, get: (n) => services[n] }) }) };
      w0.console.log = function () {};
      w0.__nxGraceMs = 1e9; w0.__nxFirstWaitMs = 0; w0.__nxKickoffMs = 1e9;
      w0.eval(SRC);
      await sleep(800);
      w0.dispatchEvent(new w0.Event('newUser'));
      await sleep(1500);
      const snacks = Array.from(w0.document.querySelectorAll('.nx-snack')).map((e) => e.textContent);
      ok('the wrapper is on while the helper runs, and the toast of a failed approval is as before for a code without a text', T.instant.__nxCopy === true && snacks.join('|') === '“Ben” was not allowed (12).', snacks.join('|'));
    }
  }

  // ------------------------------------------------------------------------------------------------ B. the wording in skin/copy/copy.json
  {
    const copy = JSON.parse(fs.readFileSync(path.join(ROOT, 'skin', 'copy', 'copy.json'), 'utf8'));
    const T = {};
    for (const [k, v] of Object.entries(copy)) if (!k.startsWith('_')) T[k.replace(/^\+/, '')] = v;
    const keys = Object.keys(T);
    const JOINS = ['BRIDGE_INVID_TXT1', 'BRIDGE_INVID_TXT2'];       // the two halves of a sentence around the name of a network: they keep their spaces
    ok('copy.json: every text is a string, without spaces at the ends (but the two halves of a sentence)', keys.length > 40 && keys.every((k) => typeof T[k] === 'string' && T[k].length > 1 && (JOINS.includes(k) || T[k] === T[k].trim())), keys.filter((k) => typeof T[k] !== 'string' || (!JOINS.includes(k) && T[k] !== T[k].trim())).join(', '));
    ok('copy.json: the ellipsis is one character and Wi-Fi has its hyphen', keys.every((k) => !/\.\.\./.test(T[k]) && !/WiFi/.test(T[k])), keys.filter((k) => /\.\.\.|WiFi/.test(T[k])).join(', '));
    ok('copy.json: the old words are gone (not usable, historian, users management, go ahead, central, sign not valid, "an username", " e ")', keys.every((k) => !/Not usable|Historian|Users management|Go ahead|\bCentral\b|Sign not valid|an username| e Description|for confirm(?!ation)/i.test(T[k]) || /^_/.test(k)), keys.filter((k) => /Not usable|Historian|Users management|Go ahead|\bCentral\b|Sign not valid|an username| e Description|for confirm(?!ation)/i.test(T[k])).join(', '));
    const tags = (s) => Array.from(s.matchAll(/<[^>]*>/g)).map((m) => m[0]);
    const allowed = ['<br>', '<b>', '</b>', "<i class='icon-spinner spinner-ani'>", '</i>'];
    ok('copy.json: the markup is the markup of the original (br, b, the spinner), and every <b> is closed', keys.every((k) => tags(T[k]).every((t) => allowed.includes(t)) && tags(T[k]).filter((t) => t === '<b>').length === tags(T[k]).filter((t) => t === '</b>').length), keys.filter((k) => tags(T[k]).some((t) => !allowed.includes(t))).join(', '));
    ok('copy.json: nothing in a text can be taken for an expression of Angular', keys.every((k) => !/[{}]/.test(T[k])));
    ok('"unreachable" has one word in the lists and on the accessory screen (the three keys)', ['FAVORITES_DEVICE_NOT_READY', 'CONTROLS_DEVICE_NOT_READY', 'HOME_SETTINGS_DEVICE_NOT_READY'].every((k) => T[k] === 'Not reachable'));
    ok('the two tab roots have their own names (they were both "Nice")', T.CONTROLS_PAGE_TITLE === 'System' && T.SETTINGS_PAGE_TITLE === 'Settings' && T.CONTROLS_PAGE_TITLE !== T.SETTINGS_PAGE_TITLE);
    ok('the control that the rewritten texts name is the control that is called that (User management)', T.HOME_SETTINGS_BUTTON_USERS === 'User management' && /Settings > User management,/.test(T['NHK_ERROR-NO-OTHER-ADMIN-FOUND']) && !/Users management/.test(T['NHK_ERROR-NO-OTHER-ADMIN-FOUND']));
    ok('the pairing text points at the back arrow, not at a symbol', /tap the back arrow\./.test(T.USER_PAIRING_REQUEST_MESSAGE) && !/&lt|<b>&/.test(T.USER_PAIRING_REQUEST_MESSAGE));

    // the failure texts: what is said about the command has to be what is known
    const F = keys.filter((k) => /^NHK_ERROR-(TIMEOUT|BAD_RESPONSE|COMM_ERR|3|NOT_CONNECTED|NO_SESSION|4|007|8|11)$/.test(k));
    ok('the failure texts: ten codes (the ones that a command can end in, and "the accessory is full")', F.length === 10, F.join(', '));
    const sentences = (s) => (s.match(/[.!?](\s|$)/g) || []).length;
    ok('every failure text is two sentences at most (cause, then what to do) and not longer than 160 characters', F.every((k) => sentences(T[k]) <= 2 && T[k].length <= 160), F.map((k) => k + ':' + sentences(T[k]) + '/' + T[k].length).join(' '));
    ok('every failure text names the accessory and says what to do', F.every((k) => /accessory/.test(T[k]) && /(try again|check the gate|Ask an administrator)/.test(T[k])), F.filter((k) => !/accessory/.test(T[k])).join(', '));
    const MAY = ['NHK_ERROR-TIMEOUT', 'NHK_ERROR-BAD_RESPONSE', 'NHK_ERROR-COMM_ERR'];        // the command may or may not have arrived: say neither that it did nor that it did not
    const LOST = ['NHK_ERROR-3', 'NHK_ERROR-NOT_CONNECTED', 'NHK_ERROR-NO_SESSION'];          // the connection is gone: no confirmation, which is all that is known
    const REFUSED = ['NHK_ERROR-4', 'NHK_ERROR-007'];                                         // the accessory answered with an error: the command was not carried out
    ok('a timeout (or an answer that cannot be read) says the command MAY have arrived (as the line on the accessory screen does: "It may have arrived: check the gate"), and claims nothing else', MAY.every((k) => /it may have arrived/.test(T[k]) && !/may not have arrived|not carried out|was not sent|not confirmed|did arrive|was carried out/.test(T[k])));
    ok('a lost connection says the command was not confirmed, and does not say it was not carried out', LOST.every((k) => /it was not confirmed/.test(T[k]) && !/not carried out|may not have arrived/.test(T[k])));
    ok('an error that the accessory answered with says the command was not carried out', REFUSED.every((k) => /it was not carried out/.test(T[k]) && !/may not have arrived|not confirmed/.test(T[k])));
    ok('every failure after which the gate may have moved says to check the gate (one verb: the line on the accessory screen says it too)', MAY.concat(LOST, ['NHK_ERROR-007', 'NHK_ERROR-8']).every((k) => /check the gate/.test(T[k])) && !Object.keys(T).some((k) => /look at the gate/.test(T[k])));
    ok('"central" is the gate controller (the term that the app already uses for the module health)', /gate controller/.test(T['NHK_ERROR-007']) && !/control unit/.test(T['NHK_ERROR-007']));
    ok('an error without a claim (the generic one) claims nothing about the command', !/not carried out|may not have arrived|not confirmed/.test(T['NHK_ERROR-8']));
    ok('the full accessory says who can help', /administrator/.test(T['NHK_ERROR-11']) && /maximum number of users/.test(T['NHK_ERROR-11']));
    ok('the sentence for an unknown code is in nx-patch.js, with the words that were asked for', /'The accessory reported error ' \+ code \+ '\. Check the gate\.'/.test(SRC));
  }

  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
