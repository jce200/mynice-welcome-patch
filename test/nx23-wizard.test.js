// Test of the setup wizard of nx23 (workstream "Setup wizard"): patch-20-wizard.py on an invented app tree, the English wording in skin/copy/wizard.json (through patch-21-copy.py),
// the CSS of the wizard, and the wizard section of nx-patch.js (the waits, the popups, the redirect of a full accessory) in jsdom with a simulated Angular, Cordova and native layer.
// All data is made up. Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-wizard.test.js
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
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('note: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom): the checks of nx-patch.js are skipped'); }

(async function () {
  // ------------------------------------------------------------------------------------------------ patch-20-wizard.py on a made-up app tree
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiz20-'));
    const fsd = path.join(tmp, 'assets', 'www', 'templates', 'first_setup');
    fs.mkdirSync(fsd, { recursive: true });
    const T = {
      'benvenuto.html': '<div class="area info">\n    <h2 translate="BENVENUTO"></h2>\n    <p translate="BENVENUTO_SPIEGA"></p>\n</div>\n<div class="conferma"></div>\n',
      'rete_wifi.html': '<div class="area info">\n    <h2 translate="RETE_WIFI"></h2>\n    <p ng-if="data.currentSsid">x</p>\n    <p ng-if="!data.currentSsid" translate="CHECK_WIFI_COLLEGAMENTO_ASSENTE"></p>\n</div>\n',
      'accendi_dispositivo.html': '<div class="area info">\n        <h2 translate="ACCENDI_DEVICE_TITLE"></h2>\n        <p translate="ACCENDI_DEVICE_TEXT"></p>\n    </div>\n',
      'bridge_rilevati.html': '<div class="area info">\n  <div class="top-bianco"><h2 translate="BRIDGE_LIST_TITLE"></h2></div>\n  <!--p translate="BRIDGE_FOUND_TEXT"></p-->\n  <ion-radio data-ng-repeat="item in data.networks"></ion-radio>\n</div>\n',
      'configura_bridge.html': '<div class="area info area_no_scroll">\n    <h2><span translate="CONFIGURAZIONE"></span><br>{{data.name}}</h2>\n    <p><span translate="WIFI_PASSWORD"></span><strong> {{ data.ssid }}</strong></p>\n\n    <div class="list">\n        <form novalidate="">\n            <br>\n        </form>\n    </div>\n\n</div>\n',
      'start_email.html': '<div class="item item-text-wrap last text_h_auto">\n  <span class="item-nota" translate="INFO_SIGN_UP"></span>\n</div>\n'
    };
    const w = (rel, text) => fs.writeFileSync(path.join(fsd, rel), text);
    const r = (rel) => fs.readFileSync(path.join(fsd, rel), 'utf8');
    Object.keys(T).forEach((k) => w(k, T[k]));
    const run = () => cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-20-wizard.py'), tmp], { encoding: 'utf8' });
    const res = run();
    ok('patch-20: it runs and says what it patched', res.status === 0 && /patched \(nx23 wizard\): 6 templates, 2 new/.test(res.stdout), res.stdout + res.stderr);
    ok('patch-20: Welcome says what you need and that Android will ask to connect, after the explanation and before the button',
      /BENVENUTO_SPIEGA"><\/p>\n {4}<div class="nx-wz-note">Have your home Wi-Fi password ready\. Android will ask to connect to the accessory's Wi-Fi network: tap <b>Connect<\/b>\.<\/div>\n/.test(r('benvenuto.html')) && r('benvenuto.html').indexOf('nx-wz-note') < r('benvenuto.html').indexOf('conferma'));
    ok('patch-20: the Wi-Fi step names the 2.4 GHz limit (only with a network) and warns when the phone is on the accessory\'s own network',
      /nx-wz-warn" ng-if="data\.currentSsid\.indexOf\('NiceIT4WIFI'\) === 0">This is the accessory's own network, not your home Wi-Fi\./.test(r('rete_wifi.html')) && /nx-wz-note" ng-if="data\.currentSsid">The accessory works on 2\.4 GHz only\./.test(r('rete_wifi.html')));
    ok('patch-20: Turn on the accessory says that Android\'s dialog comes after the search', /After the search, Android will ask to connect to the accessory's Wi-Fi network: tap <b>Connect<\/b>/.test(r('accendi_dispositivo.html')));
    ok('patch-20: Accessories detected says: tap one, then Connect (only when there are accessories), and keeps the commented line',
      /<!--p translate="BRIDGE_FOUND_TEXT"><\/p-->\n {2}<div class="nx-wz-note" data-ng-if="data\.networks\.length > 0">Tap your accessory\./.test(r('bridge_rilevati.html')));
    const cfg = r('configura_bridge.html');
    ok('patch-20: the password step is titled "Home Wi-Fi password" and not with the raw name of the accessory', /<h2>Home Wi-Fi password<\/h2>/.test(cfg) && !/CONFIGURAZIONE/.test(cfg) && !/<h2>[^<]*\{\{data\.name\}\}/.test(cfg));
    ok('patch-20: ...and says why the password must be exact, after the form and inside the same column', /<\/form>\n {4}<\/div>\n {4}<div class="nx-wz-note">The accessory joins this network by itself, so the password must be exact\.<\/div>/.test(cfg));
    ok('patch-20: the sign-up page says who sees the two details', /INFO_SIGN_UP"><\/span>\n {2}<span class="item-nota nx-wz-more">The accessory's administrator sees both\.<\/span>/.test(r('start_email.html')));
    for (const n of ['user_pairing_max_user_reached.html', 'user_pairing_request_max_user_reached.html']) {
      const t = r(n);
      ok('patch-20: ' + n + ' exists: the warning stage, "Accessory is full", the app\'s sentence, what to do and where (Users management), no button that needs a controller',
        /bg-img-attenzione/.test(t) && /<h2>Accessory is full<\/h2>/.test(t) && /translate="USER_PAIRING_MAX_USER_REACHED_MESSAGE"/.test(t) && /Ask an administrator of the accessory to remove a user who no longer needs access/.test(t) &&
        /'HOME_SETTINGS_BUTTON_USERS' \| translate/.test(t) && !/ng-click/.test(t) && /^<ion-view /.test(t) && /<\/ion-view>\n$/.test(t), t.slice(0, 80));
    }
    ok('patch-20: the two pages are the same (the route of Settings has no controller either)', r('user_pairing_max_user_reached.html') === r('user_pairing_request_max_user_reached.html'));
    const after = {};
    Object.keys(T).concat(['user_pairing_max_user_reached.html']).forEach((k) => { after[k] = r(k); });
    const res2 = run();
    ok('patch-20: a second run stops ("already patched") and changes nothing', res2.status !== 0 && /already patched/.test(res2.stdout + res2.stderr) && Object.keys(after).every((k) => r(k) === after[k]));
    // all or nothing: one anchor missing, or occurring twice: nothing is written
    const bad = (rel, text, expectText) => {
      Object.keys(T).forEach((k) => w(k, T[k]));
      fs.rmSync(path.join(fsd, 'user_pairing_max_user_reached.html'), { force: true });
      fs.rmSync(path.join(fsd, 'user_pairing_request_max_user_reached.html'), { force: true });
      w(rel, text);
      const x = run();
      const untouched = Object.keys(T).every((k) => r(k) === (k === rel ? text : T[k])) && !fs.existsSync(path.join(fsd, 'user_pairing_max_user_reached.html')) && !fs.existsSync(path.join(fsd, 'user_pairing_request_max_user_reached.html'));
      return { x, untouched, said: expectText.test(x.stdout + x.stderr) };
    };
    const noAnchor = bad('start_email.html', T['start_email.html'].replace('INFO_SIGN_UP', 'OTHER'), /start_email\.html: expected 1 occurrence/);
    ok('patch-20: with an anchor missing in the last template it stops, names the file and writes nothing (not even the first templates)', noAnchor.x.status !== 0 && noAnchor.said && noAnchor.untouched, noAnchor.x.stdout + noAnchor.x.stderr);
    const twice = bad('accendi_dispositivo.html', T['accendi_dispositivo.html'] + T['accendi_dispositivo.html'], /accendi_dispositivo\.html: expected 1 occurrence/);
    ok('patch-20: an anchor that occurs twice stops it as well', twice.x.status !== 0 && twice.said && twice.untouched);
    const noForm = bad('configura_bridge.html', T['configura_bridge.html'].replace('</form>', ''), /configura_bridge\.html: expected 1 match/);
    ok('patch-20: the pattern anchor of the password page must match exactly once too', noForm.x.status !== 0 && noForm.said && noForm.untouched);
    fs.rmSync(path.join(fsd, 'start_email.html'));
    Object.keys(T).forEach((k) => { if (k !== 'start_email.html') w(k, T[k]); });
    const missing = run();
    ok('patch-20: a template that is not there stops it', missing.status !== 0 && /not found: templates\/first_setup\/start_email\.html/.test(missing.stdout + missing.stderr));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------------------------------------ skin/copy/wizard.json through patch-21-copy.py
  {
    const wiz = JSON.parse(fs.readFileSync(path.join(ROOT, 'skin', 'copy', 'wizard.json'), 'utf8'));
    const keys = Object.keys(wiz).filter((k) => !k.startsWith('_'));
    ok('wizard.json: a flat object of non-empty strings (' + keys.length + ' texts)', keys.length >= 8 && keys.every((k) => typeof wiz[k] === 'string' && wiz[k].trim()));
    ok('wizard.json: ERR_TIMEOUT_RETRY is not reworded (the app shows it for sensors and remote controls too; nx-patch.js words it for the Wi-Fi configuration only)', !('ERR_TIMEOUT_RETRY' in wiz));
    ok('wizard.json: no garbled leftovers of the original (an username, " e ", Italian)', keys.every((k) => !/an username| e Description|TOGLIMI/.test(wiz[k])));
    ok('wizard.json: "Accessory not found" names the cause (the accessory is not powered or too far) and one action, in two sentences', /^[^.]+\.\s[^.]+\.$/.test(wiz.BRIDGE_NOT_FOUND_TEXT) && /powered on/.test(wiz.BRIDGE_NOT_FOUND_TEXT) && /within a few metres/.test(wiz.BRIDGE_NOT_FOUND_TEXT));
    ok('wizard.json: Add accessory says what to check (Wi-Fi, Location, VPN, mobile data) and when to use New accessory', /Location on/.test(wiz.ADD_DEVICE_LABEL_INFO_NO_DEVICES) && /VPN and mobile data off/.test(wiz.ADD_DEVICE_LABEL_INFO_NO_DEVICES) && /New accessory only for an accessory that is new or was reset/.test(wiz.ADD_DEVICE_LABEL_INFO_NO_DEVICES));
    ok('wizard.json: the code page no longer promises a photo', !/photo/i.test(wiz.DEVICE_CODE_TEXT));
    ok('wizard.json: the wrong-password error says the cause and what to do', /wrong password/.test(wiz['NHK_ERROR-13']) && /Check the password and try again\./.test(wiz['NHK_ERROR-13']));
    ok('wizard.json: the wrong-network text still ends with a space, because the app appends the name of the network to it', / $/.test(wiz.ALERT_MESSAGE_WIFI_WRONG));
    // patch-21 on an invented locale-en.json that has these keys
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiz21-'));
    const i18n = path.join(tmp, 'assets', 'www', 'i18n');
    fs.mkdirSync(i18n, { recursive: true });
    const en = {}; keys.forEach((k) => { en[k] = 'old text of ' + k; });
    en.ERR_TIMEOUT_RETRY = 'Error, please go back and try again.';
    fs.writeFileSync(path.join(i18n, 'locale-en.json'), JSON.stringify(en, null, 2) + '\n');
    const onlyWizard = fs.mkdtempSync(path.join(os.tmpdir(), 'wiz21d-'));
    fs.copyFileSync(path.join(ROOT, 'skin', 'copy', 'wizard.json'), path.join(onlyWizard, 'wizard.json'));   // the other workstreams have their own files in skin/copy
    const res = cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-21-copy.py'), tmp], { encoding: 'utf8', env: Object.assign({}, process.env, { NX_COPY_DIR: onlyWizard }) });
    const out = JSON.parse(fs.readFileSync(path.join(i18n, 'locale-en.json'), 'utf8'));
    ok('wizard.json: patch-21-copy.py puts every text in locale-en.json and leaves ERR_TIMEOUT_RETRY alone', res.status === 0 && keys.every((k) => out[k] === wiz[k]) && out.ERR_TIMEOUT_RETRY === en.ERR_TIMEOUT_RETRY, res.stdout + res.stderr);
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(onlyWizard, { recursive: true, force: true });
  }

  // ------------------------------------------------------------------------------------------------ the CSS
  {
    const css = fs.readFileSync(path.join(ROOT, 'skin', 'nx-expressive.css'), 'utf8');
    const part = fs.readFileSync(path.join(ROOT, 'skin', 'src', 'nx23-wizard.css'), 'utf8');
    const classes = ['nx-wz-lead', 'nx-wz-sub', 'nx-wz-progress', 'nx-wz-late', 'nx-wz-note', 'nx-wz-warn', 'nx-wz-more', 'nx-wz-whys', 'nx-wz-why', 'nx-wz-details'];
    ok('css: every class of the wizard (' + classes.length + ') has a rule in the built stylesheet', classes.every((c) => new RegExp('\\.' + c + '(?![\\w-])').test(css)), classes.filter((c) => !new RegExp('\\.' + c + '(?![\\w-])').test(css)).join(', '));
    ok('css: the text of the loading overlay gets a color role with !important (style.css makes it black: 1.1:1 on the dark theme)', /\.loading-container \.popUp p \{ color: var\(--md-sys-color-on-surface-variant\) !important; \}/.test(css));
    ok('css: the camera button of the code page is hidden (the camera plugin is not in the app)', /\.photo_button \{ display: none !important; \}/.test(css));
    ok('css: the stage of the overlay is shorter than the original 46 %, so that the added words have room at 360x640', /\.loading-container \.area\.bg-black-one \{ flex: 0 0 auto; height: clamp\(168px, 30vh, 300px\); \}/.test(css));
    ok('css: the details of a popup have a summary of at least 48 dp', /\.popup-body \.nx-wz-details summary \{ min-height: 48px;/.test(css));
    ok('css: the part file has no colors of its own (only tokens)', !/#[0-9a-fA-F]{3,8}\b/.test(part.replace(/\/\*[\s\S]*?\*\//g, '')) && !/\brgba?\(/.test(part.replace(/\/\*[\s\S]*?\*\//g, '')));
    ok('css: no new animation (the progress is the wavy indicator of m3e.css, which stands still with reduced motion)', !/@keyframes/.test(part));
  }

  // ------------------------------------------------------------------------------------------------ nx-patch.js: the wizard section
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8'), all = fs.readFileSync(path.join(ROOT, 'test-all.sh'), 'utf8');
  ok('build.sh runs patch-20-wizard.py before patch-21-copy.py, and test-all.sh runs the nx23-* tests', /patch-19-lists\.py patch-20-wizard\.py (patch-22-diagnostic\.py )?patch-21-copy\.py/.test(build) && /test\/nx23-\*\.test\.js/.test(all));
  ok('nx-patch.js: the wizard section is delimited and small', /\/\/ ---- nx23 wizard: begin/.test(SRC) && /\/\/ ---- nx23 wizard: end/.test(SRC) &&
    SRC.slice(SRC.indexOf('// ---- nx23 wizard: begin'), SRC.indexOf('// ---- nx23 wizard: end')).split('\n').length < 180);

  if (!JSDOM) {
    console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks; the jsdom checks were skipped)');
    process.exit(failures ? 1 : 0);
  }

  const DICT = { BRIDGE_SEARCH_TITLE: 'Search for accessories', BRIDGE_SEARCH_TITLE_SINGLE: 'Accessory identification', CONFIGURAZIONE: 'Configuration', DEVICE_USERS_ASSOCIATION_STATUS_WAITING: 'Waiting for confirm',
    ONGOING_DETECTION: 'Devices being detected...', BRIDGE_NOT_FOUND_TITLE: 'Accessory not found', BRIDGE_NOT_FOUND_TEXT: 'No accessory Wi-Fi network was found. Check that the accessory is powered on and within a few metres of the phone.',
    ERR_TIMEOUT_RETRY: 'Error, please go back and try again.', ALERT_TITLE_WARNING: 'Attention', COMMON_MSG_LOADING: 'Loading...' };

  // scen: { net, location (true/false/undefined: no plugin), noTranslate, stateName, preLoading (the app defines showLoadingAction before the patch starts) }
  async function environment(scen) {
    scen = scen || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const logs = [];
    w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
    w.localStorage.setItem('keyHomes', JSON.stringify([{ homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: [] }]));
    const native = [];
    w.cordova = { exec(okCb, failCb, svc, action) { native.push(action); setTimeout(() => { if (action === 'netState') return scen.netFails ? failCb('boom') : okCb(scen.net || { wifi: true, ssid: 'HomeWifi', vpn: false, cellular: false }); if (/^(version|reconnect|release|setHints)$/.test(action)) okCb(); }, 0); } };
    if (scen.location !== undefined) w.WifiWizard = { isLocalizationEnabled(win) { setTimeout(() => win(scen.location), 0); } };
    const handlers = {};
    const popups = { show: [], alert: [] };
    const $ionicPopup = {
      show(o) { popups.show.push(o); return Promise.resolve(); },
      alert(o) { popups.alert.push(o); return Promise.resolve(); },
      confirm(o) { return Promise.resolve(true); }
    };
    const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {} };
    // the loader of the app (app.js showLoadingAction + $ionicLoading): the overlay is built a moment after the call; a second call replaces its content
    const shown = [];
    function loader(message, isCommand, duration, infoText) {
      shown.push({ message, isCommand, duration, infoText });
      setTimeout(() => {
        let c = w.document.querySelector('.loading-container');
        if (!c) { c = w.document.createElement('div'); c.className = 'loading-container visible active'; c.innerHTML = '<div class="loading"></div>'; w.document.body.appendChild(c); }
        c.firstChild.innerHTML = '<div class="full-container"><div class="area info popUp"><h2>' + message + '</h2>' + (infoText ? '<p>' + infoText + '</p>' : '') + '</div></div>';
      }, 5);
    }
    if (scen.preLoading) $rootScope.showLoadingAction = loader;
    const services = { $rootScope, $q: { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } }, $timeout: (fn, ms) => setTimeout(fn, ms || 0),
      NHKPluginService: { config: () => Promise.reject({}), pairings: () => Promise.resolve({ waitingUsers: [] }) }, HomeService: { homes: JSON.parse(w.localStorage.getItem('keyHomes')), updateDevice() {} }, $ionicPopup };
    if (!scen.noTranslate) services.$translate = { instant: (k) => DICT[k] || k };
    if (scen.stateName) services.$state = { current: { name: scen.stateName } };
    const injector = { has: (n) => n in services, get: (n) => services[n] };
    w.angular = { element: () => ({ injector: () => injector }) };
    w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
    if (scen.lateMs) w.__nxWzLateMs = scen.lateMs;
    w.eval(SRC);
    await sleep(800);
    if (!scen.preLoading) $rootScope.showLoadingAction = loader;      // as the app does when Ionic is ready: after the patch has started
    return { w, logs, native, handlers, $rootScope, popups, shown, $ionicPopup, doc: w.document, host: () => w.document.querySelector('.loading-container .popUp') };
  }

  // ---- the waits
  {
    const e = await environment({ lateMs: 120 });
    ok('wait: showLoadingAction, assigned by the app after the patch started, still calls the app\'s function', typeof e.$rootScope.showLoadingAction === 'function' && e.$rootScope.showLoadingAction !== undefined);
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'The accessory is being identified.');
    await sleep(80);
    ok('wait: the app\'s call goes through unchanged (title, duration, text)', e.shown.length === 1 && e.shown[0].message === DICT.BRIDGE_SEARCH_TITLE_SINGLE && e.shown[0].duration === 60000 && e.shown[0].infoText === 'The accessory is being identified.');
    const host = e.host();
    ok('wait: the identification says before it happens that Android will ask to connect, and to tap Connect', !!host && /Android will ask to connect to the accessory's Wi-Fi network\. Tap <b>Connect<\/b>\./.test(host.innerHTML), host && host.innerHTML);
    ok('wait: ...says that the phone may leave the home Wi-Fi and comes back by itself', /may leave your home Wi-Fi for a minute and returns to it by itself/.test(host.innerHTML));
    ok('wait: ...and shows the indeterminate progress (decorative), after the text of the app', /m3e-progress m3e-indet" aria-hidden="true"><i><\/i><b><\/b>/.test(host.innerHTML) && host.innerHTML.indexOf('<p>') < host.innerHTML.indexOf('nx-wz-lead'));
    ok('wait (nx23 QA): the words of the wait are added to a polite live region, so that a screen reader reads that Android will ask to connect (the overlay of the app has no role of its own)', host.getAttribute('role') === 'status' && host.getAttribute('aria-live') === 'polite');
    const late = host.querySelector('.nx-wz-late');
    ok('wait: there is a line for "taking long", empty at first, a polite status for screen readers', !!late && late.textContent === '' && late.getAttribute('role') === 'status');
    await sleep(160);
    ok('wait: after the time (here 120 ms; in the app 20 s) it says that Android\'s Connect dialog is still waited for', /Still waiting for Android's Connect dialog/.test(host.querySelector('.nx-wz-late').textContent), host.querySelector('.nx-wz-late').textContent);
    ok('wait: the overlay is decorated once (not again on every look)', host.querySelectorAll('.nx-wz-lead').length === 1 && host.querySelectorAll('.nx-wz-progress').length === 1);

    // the search, then a second call 10 ms later (the auto-join of the app: 100 ms, then 60 s): the overlay that stays is decorated with its own words
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE, false, 60000, 'We are looking for the accessories.');
    await sleep(80);
    ok('wait: the search says that Android will ask to connect when the accessory is found, and how long it takes at most', /When the accessory is found, Android will ask to connect to its Wi-Fi network: tap <b>Connect<\/b>\./.test(e.host().innerHTML) && /up to a minute/.test(e.host().innerHTML));
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 100, 'x');
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'The accessory is being identified.');
    await sleep(120);
    ok('wait: when the app replaces the overlay by a second call at once, the new overlay has the words (once)', e.host().querySelectorAll('.nx-wz-lead').length === 1 && /Android will ask to connect to the accessory's Wi-Fi network\. Tap/.test(e.host().innerHTML));
    await sleep(160);
    ok('wait: ...and the "taking long" line of an overlay that was replaced does not write into the new one twice', e.host().querySelectorAll('.nx-wz-late').length === 1);

    e.$rootScope.showLoadingAction(DICT.CONFIGURATION || DICT.CONFIGURAZIONE, false, 150000, 'We are connecting your accessory to your home WiFi network. This could take a few minutes.');
    await sleep(60);
    ok('wait: the configuration says to keep the app open and that it can take up to 2½ minutes', /Keep the app open\. This can take up to 2½ minutes\./.test(e.host().innerHTML));
    await sleep(160);
    ok('wait: ...and after a while that the Wi-Fi password and the 2.4 GHz band are the usual causes', /Taking long\? If it fails, check the Wi-Fi password and that the network is 2\.4 GHz\./.test(e.host().querySelector('.nx-wz-late').textContent));

    e.$rootScope.showLoadingAction(DICT.DEVICE_USERS_ASSOCIATION_STATUS_WAITING, false, 300000);
    await sleep(60);
    ok('wait: the pairing request (no text of the app) says what is sent and that the app gives up after 5 minutes, and has no "taking long" text', /Sending your request to the accessory\. Keep the app open: it gives up after 5 minutes\./.test(e.host().innerHTML) && e.host().querySelector('.nx-wz-late').textContent === '');
    e.$rootScope.showLoadingAction(DICT.ONGOING_DETECTION, false, 300000);
    await sleep(60);
    ok('wait: the detection after the configuration says what it waits for', /Waiting for the accessory to appear on your Wi-Fi/.test(e.host().innerHTML));

    // other overlays are left alone: a command, "Loading...", another language's title
    e.$rootScope.showLoadingAction(DICT.COMMON_MSG_LOADING, false, 60000);
    await sleep(60);
    ok('wait: "Loading..." and the other waits of the app are left as they are', !e.host().querySelector('.nx-wz-lead'));
    e.$rootScope.showLoadingAction('close', true, 1000);
    await sleep(60);
    ok('wait: a command (isCommand) is left alone', !e.host().querySelector('.nx-wz-lead'));
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'x');
    e.$rootScope.showLoadingAction(DICT.COMMON_MSG_LOADING, false, 60000);
    await sleep(120);
    ok('wait: a later overlay of another kind is not decorated with the words of an earlier one', !e.host().querySelector('.nx-wz-lead'));
  }
  {
    // the app defined showLoadingAction before the patch started (Ionic was ready first)
    const e = await environment({ preLoading: true });
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'x');
    await sleep(80);
    ok('wait: also when the app had defined showLoadingAction before the patch started', e.shown.length === 1 && /Tap <b>Connect<\/b>/.test(e.host().innerHTML));
  }
  {
    // without $translate (an old build, a test page) nothing is decorated and nothing breaks
    const e = await environment({ noTranslate: true });
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'x');
    await sleep(80);
    ok('wait: without $translate the overlay is the app\'s own and nothing is thrown', e.shown.length === 1 && !e.host().querySelector('.nx-wz-lead') && !e.logs.some((l) => /wizard/.test(l) && /Error|TypeError/.test(l)), e.logs.join(' | '));
  }

  // ---- "Accessory not found": the lines that appear only when they are true
  const notFound = (extra) => Object.assign({ title: DICT.BRIDGE_NOT_FOUND_TITLE, template: DICT.BRIDGE_NOT_FOUND_TEXT, buttons: [{ text: 'Close' }, { text: 'Try again' }] }, extra || {});
  {
    const e = await environment({ net: { wifi: true, vpn: true, cellular: true }, location: false });
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE, false, 60000, 'x');       // the facts are read when the search starts
    await sleep(80);
    const opts = notFound();
    e.$ionicPopup.show(opts);
    const got = e.popups.show[0];
    ok('popup: the original options are passed on as a copy (the app\'s object is not changed), with the buttons', got !== opts && opts.template === DICT.BRIDGE_NOT_FOUND_TEXT && got.buttons === opts.buttons && got.title === opts.title);
    ok('popup: the text of the app is kept, after the lines', got.template.endsWith(DICT.BRIDGE_NOT_FOUND_TEXT) && got.template.indexOf('nx-wz-whys') === 5 || /^<div class="nx-wz-whys">/.test(got.template));
    ok('popup: Location off, a VPN and mobile data are each named, cause first, with one action', /<b>Location is off\.<\/b> Android hides nearby Wi-Fi networks from apps while it is off\. Turn it on and try again\./.test(got.template) &&
      /<b>A VPN is on\.<\/b> Turn it off for the setup, then try again\./.test(got.template) && /<b>Mobile data is on\.<\/b> Turn it off for the setup, then try again\./.test(got.template));
    e.doc.body.innerHTML = '<div class="popup-container"><div class="popup-body"><div class="nx-wz-whys"></div></div></div>';
    e.$ionicPopup.show(notFound());
    await sleep(120);
    ok('popup: the facts are read again when the popup opens, and the lines are put in the popup that is on screen', /Location is off/.test(e.doc.querySelector('.popup-body .nx-wz-whys').innerHTML), e.doc.body.innerHTML);
  }
  {
    const e = await environment({ net: { wifi: true, vpn: false, cellular: false }, location: true });
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE, false, 60000, 'x');
    await sleep(80);
    e.$ionicPopup.show(notFound());
    ok('popup: with Location on, no VPN and no mobile data there are no lines (only the text of the app)', e.popups.show[0].template === '<div class="nx-wz-whys"></div>' + DICT.BRIDGE_NOT_FOUND_TEXT, e.popups.show[0].template);
    const other = { title: 'Something else', template: 'Text' };
    e.$ionicPopup.show(other);
    e.$ionicPopup.alert(other);
    ok('popup: any other popup or alert reaches the app\'s function as the very same options', e.popups.show[1] === other && e.popups.alert[0] === other);
  }
  {
    const e = await environment({ netFails: true });
    e.$ionicPopup.show(notFound());
    ok('popup: when the native layer cannot say anything, the popup is the text of the app with an empty slot (and nothing is thrown)', /^<div class="nx-wz-whys"><\/div>/.test(e.popups.show[0].template));
  }

  // ---- the timeout of the Wi-Fi configuration
  {
    for (const [name, expectNew] of [['configura-bridge', true], ['tabsController.settings-configura-bridge', true], ['start-add-device-setup-waiting', true], ['tabsController.settings-add-device-settings', true], ['tabsController.settings-add-remotecontrol-verify', false], ['tabsController.settings-add-monoSensor-setup', false]]) {
      const e = await environment({ stateName: name });
      e.$ionicPopup.alert({ title: DICT.ALERT_TITLE_WARNING, template: DICT.ERR_TIMEOUT_RETRY });
      const t = e.popups.alert[0].template;
      ok('timeout: on ' + name + ' the app\'s one text for every timeout is ' + (expectNew ? 'replaced by the cause and the action of the configuration' : 'left as it is'),
        expectNew ? t === 'The accessory did not join your Wi-Fi. Check the password and that the network is 2.4 GHz, then start again.' : t === DICT.ERR_TIMEOUT_RETRY, t);
    }
  }

  // ---- the messages of the Wi-Fi steps
  {
    const e = await environment({ net: { wifi: true, vpn: true } });
    const m = e.w.__nxMsg;
    const unavailable = m('WIFI_UNAVAILABLE', 'F');
    ok('msg: WIFI_UNAVAILABLE: the cause first (the Android dialog was canceled or timed out), one action, the rest under Technical details',
      /^The phone did not join the accessory's Wi-Fi: Android's Connect dialog was canceled or timed out\. Tap the accessory again and choose <b>Connect<\/b>\.<details class="nx-wz-details"><summary>Technical details<\/summary>WIFI_UNAVAILABLE:/.test(unavailable), unavailable);
    ok('msg: the other known errors are as before', /Could not connect to "NiceIT4WIFIAABBCC" automatically/.test(m('WIFI_MISMATCH current="HomeWifi" requested="NiceIT4WIFIAABBCC"', 'F')) && m('WIFI_RELEASED', 'F') === 'The connection to the accessory was released. Try again.');
    ok('msg: an unknown error without facts is the fallback of the app, unchanged', m('something else', 'FALLBACK') === 'FALLBACK' && m(undefined, 'FALLBACK') === 'FALLBACK');
    e.$rootScope.showLoadingAction(DICT.BRIDGE_SEARCH_TITLE_SINGLE, false, 60000, 'x');
    await sleep(80);
    const withVpn = m('something else', 'FALLBACK');
    ok('msg: an unknown error gets the line about the VPN once the phone is known to have one', /^FALLBACK<div class="nx-wz-whys"><div class="nx-wz-why"><b>A VPN is on\.<\/b>/.test(withVpn), withVpn);
    ok('msg: a known error does not get the lines', m('WIFI_RELEASED', 'F') === 'The connection to the accessory was released. Try again.');
  }

  // ---- a full accessory in Settings
  {
    const e = await environment();
    const h = e.handlers['$stateNotFound'] || [];
    ok('state: the patch listens for $stateNotFound', h.length === 1);
    const unfound = { to: 'tabsController.settings-user-pairing-max-user-reached', toParams: { homeId: 1 }, options: {} };
    h[0]({ defaultPrevented: false }, unfound);
    ok('state: the state that the app names for a full accessory (it does not exist) is redirected to the one that does (with "settings" twice), the parameters stay', unfound.to === 'tabsController.settings-settings-user-pairing-max-user-reached' && unfound.toParams.homeId === 1);
    const other = { to: 'tabsController.settings-nothing', toParams: {}, options: {} };
    h[0]({}, other);
    h[0]({}, undefined);
    ok('state: any other state that is not found is left alone (and an empty call does not throw)', other.to === 'tabsController.settings-nothing');
  }

  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
