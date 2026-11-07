// Test of nx-patch.js in jsdom, with a simulated Angular, Cordova and native layer (Nx).
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nxpatch.test.js
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'nx-patch.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

function device(extra) {
  return Object.assign({ mac: '00:0B:6C:AA:BB:CC', address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', homeId: 1,
    pairingUsername: 'homeuser', pairingPassword: 'secret' }, extra || {});
}
function home(devices) {
  return { homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: devices };
}

// scen: { homes, net, probe, reachable: [sequence], reachableDefault, waiting, approveOk, loadCloud,
//         graceMs (auto-recovery; off by default), lateVerify (verify only exists later), verifyMs, preXhr(w) }
async function environment(scen) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const logs = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  w.localStorage.setItem('keyHomes', JSON.stringify(scen.homes));

  const native = [];
  w.cordova = {
    exec(okCb, failCb, svc, action, args) {
      native.push({ svc, action, args });
      setTimeout(() => {
        switch (action) {
          case 'netState': return okCb(scen.net);
          case 'probe': return okCb(scen.probe || { ok: true, tcpMs: 120, tlsMs: 900 });
          case 'version': return okCb('nx-test');
          case 'reconnect': case 'release': case 'setHints': case 'checkSucceeded': case 'checkFailed': return okCb();
          default: return;
        }
      }, 0);
    }
  };

  // --- simulated Angular
  const handlers = {};
  const HS = { homes: JSON.parse(w.localStorage.getItem('keyHomes')) };
  HS.updateDevice = function () { w.localStorage.setItem('keyHomes', JSON.stringify(HS.homes)); };
  const verifyLog = [];
  const $rootScope = {
    $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    verifyDeviceRecheability: verifyReal
  };
  function verifyReal(dev) {
    const d = {};
    d.promise = new Promise((res) => setTimeout(() => {
      const seq = scen.reachable || [];
      dev.reachable = seq.length ? seq.shift() : !!scen.reachableDefault;
      verifyLog.push(dev.mac + '=' + dev.reachable);
      HS.updateDevice(dev.homeId, dev);
      res(dev);
    }, scen.verifyMs || 5));
    return d;
  }
  if (scen.lateVerify) delete $rootScope.verifyDeviceRecheability;
  const popups = [];
  const approvals = [];
  const NHK = {
    config() { return Promise.reject({ code: 'X' }); },
    pairings(dev) { return Promise.resolve({ activeUsers: [], waitingUsers: scen.waiting || [] }); },
    userApproved(dev, id, name) {
      approvals.push({ mac: dev.mac, id, name });
      return scen.approveOk === false ? Promise.reject({ code: 11 }) : Promise.resolve();
    }
  };
  const $q = { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } };
  const $timeout = (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30));
  const $ionicPopup = { confirm(opts) { popups.push(opts); return Promise.resolve(scen.popupAnswer !== false); } };
  const services = { $rootScope, $q, $timeout, NHKPluginService: NHK, HomeService: HS, $ionicPopup };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };

  w.__nxGraceMs = scen.graceMs != null ? scen.graceMs : 1e9;   // auto-recovery is off by default in the tests
  if (scen.preXhr) scen.preXhr(w);
  w.eval(SRC);
  await sleep(800);   // on startup it checks every 500 ms whether Angular is there
  return { w, logs, native, handlers, $rootScope, NHK, HS, popups, approvals, verifyLog, document: w.document,
    defineVerify() { $rootScope.verifyDeviceRecheability = verifyReal; } };
}

// nx9: the status chip is a line under the title (CSS variables) plus a bottom sheet; #nx-status is the invisible element
// with the same text, a click on which opens the sheet; #nx-sheet-text holds the text of the diagnosis (under "Technical details").
function chip(env) { return env.document.getElementById('nx-status'); }
function details(env) { return env.document.getElementById('nx-sheet-text'); }
function sheet(env) { return env.document.getElementById('nx-sheet'); }

(async function () {
  // ---------------------------------------------------------------- error messages
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi' } });
    const m = env.w.__nxMsg;
    ok('msg: WIFI_UNAVAILABLE', /canceled/.test(m('WIFI_UNAVAILABLE', 'F')));
    ok('msg: mismatch accessory', /Could not connect to "NiceIT4WIFIAABBCC" automatically.*manually/.test(m('WIFI_MISMATCH current="HomeWifi" requested="NiceIT4WIFIAABBCC"', 'F')), m('WIFI_MISMATCH current="HomeWifi" requested="NiceIT4WIFIAABBCC"', 'F'));
    ok('msg: mismatch home', /did not return to "HomeWifi" \(now: "NiceIT4WIFIAABBCC"\)/.test(m('WIFI_MISMATCH current="NiceIT4WIFIAABBCC" requested="HomeWifi"', 'F')));
    ok('msg: cannot connect', /Android did not allow/.test(m('cannot connect to network', 'F')));
    ok('msg: unknown -> fallback', m('something else', 'FALLBACK') === 'FALLBACK');
    ok('msg: undefined -> fallback', m(undefined, 'FALLBACK') === 'FALLBACK');
  }

  // ---------------------------------------------------------------- status chip
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true } });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: online', chip(env) && chip(env).textContent === 'Accessory online' && chip(env).style.display === 'block', chip(env) && chip(env).textContent);
  }
  {
    // without Wi-Fi and without a VPN a local accessory cannot be reachable, even if the old flag still says "reachable"
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: false, cellular: true, vpn: false } });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: no Wi-Fi (and no VPN)', chip(env).textContent === 'No Wi-Fi', chip(env).textContent);
  }
  {
    // nx5: another Wi-Fi network on the same router (HomeWifi-5G next to HomeWifi) is not an error as long as the accessory is reachable
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi-5G' } });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: other Wi-Fi but reachable -> online', chip(env).textContent === 'Accessory online', chip(env).textContent);
  }
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi-5G' } });   // not checked yet
    env.w.NX.refresh(); await sleep(50);
    ok('chip: other Wi-Fi, still unknown -> warning', chip(env).textContent === 'Other Wi-Fi', chip(env).textContent);
  }
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'NiceIT4WIFIAABBCC', module: true } });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: accessory Wi-Fi', chip(env).textContent === 'Accessory Wi-Fi', chip(env).textContent);
  }
  {
    const env = await environment({ homes: [home([])], net: { wifi: true, ssid: 'HomeWifi' } });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: hidden without an accessory', chip(env).style.display === 'none');
  }
  {
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' }, probe: { ok: false, error: 'SocketTimeoutException' }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('chip: not reachable', chip(env).textContent === 'Accessory not reachable', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('diagnosis: shows network', /Network: Wi-Fi HomeWifi/.test(t), t);
    ok('diagnosis: measurement failed', /no answer \(SocketTimeoutException\)/.test(t), t);
    ok('diagnosis: conclusion says to cut the power', /not responding.*power/.test(t), t);
    ok('diagnosis: hints sent', env.native.some((c) => c.action === 'setHints' && c.args[0][0] && c.args[0][0].address === '192.168.1.72'));
  }
  {
    // accessory reachable (TCP/TLS fine) but the app session fails
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' }, probe: { ok: true, tcpMs: 80, tlsMs: 700 }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('diagnosis: TCP+TLS visible', /TCP 80 ms, TLS 700 ms/.test(t), t);
    ok('diagnosis: advises reconnecting', /Reconnect/.test(t.replace('Reconnecting…', '')), t);
  }
  {
    // slow
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' }, probe: { ok: true, tcpMs: 2300, tlsMs: 8000 }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    ok('diagnosis: slow reported', /slow/.test(details(env).textContent), details(env).textContent);
  }
  {
    // all good
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' }, probe: { ok: true, tcpMs: 30, tlsMs: 300 }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    ok('diagnosis: everything fine', /Everything is fine/.test(details(env).textContent), details(env).textContent);
    ok('diagnosis: reads fresh result back (reachable true)', /App connection to the accessory: ok/.test(details(env).textContent), details(env).textContent);
  }

  // ---------------------------------------------------------------- verify wrapper: hints + new attempts
  {
    const dev = device();
    const env = await environment({ homes: [home([dev])], net: { wifi: true, ssid: 'HomeWifi' }, reachable: [false, false, true] });
    const live = env.HS.homes[0].devices[0];
    const r = env.$rootScope.verifyDeviceRecheability(live);
    ok('verify: returns a deferred with a promise (like the original)', r && r.promise && typeof r.promise.then === 'function');
    await sleep(400);
    ok('verify: third attempt succeeds', live.reachable === true && env.verifyLog.length === 3, env.verifyLog.join(','));
    ok('verify: hints sent', env.native.filter((c) => c.action === 'setHints').length >= 1);
  }
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, reachableDefault: false });
    const live = env.HS.homes[0].devices[0];
    env.$rootScope.verifyDeviceRecheability(live);
    await sleep(500);
    ok('verify: stops after 3 attempts if it keeps failing', env.verifyLog.length === 3 && live.reachable === false, env.verifyLog.join(','));
  }
  {
    // two simultaneous checks on the same accessory do not start double retry loops
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, reachableDefault: false });
    const live = env.HS.homes[0].devices[0];
    env.$rootScope.verifyDeviceRecheability(live);
    env.$rootScope.verifyDeviceRecheability(live);
    await sleep(600);
    ok('verify: no double retry loop (2 starts + 2 retries = 4)', env.verifyLog.length === 4, env.verifyLog.length + ': ' + env.verifyLog.join(','));
  }

  // ---------------------------------------------------------------- new user
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, waiting: [{ id: 2, username: 'Home assistant', controllerID: 'c1' }] });
    env.w.dispatchEvent(Object.assign(new env.w.Event('newUser'), { username: 'Home assistant' }));
    await sleep(1500);
    ok('popup: shown with user name', env.popups.length === 1 && /Home assistant/.test(env.popups[0].template), JSON.stringify(env.popups.map((p) => p.template)));
    ok('popup: contains the name of the accessory', /NiceIT4WIFIAABBCC/.test(env.popups[0].template));
    ok('popup: allow calls userApproved with id and name', env.approvals.length === 1 && env.approvals[0].id === 2 && env.approvals[0].name === 'Home assistant', JSON.stringify(env.approvals));
    // do not offer the same user again once that user has been allowed and the popup is free again
    env.w.dispatchEvent(Object.assign(new env.w.Event('newUser'), { username: 'Home assistant' }));
    await sleep(1500);
    ok('popup: same user not offered again', env.popups.length === 1, String(env.popups.length));
  }
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, waiting: [{ id: 3, username: 'Test' }], popupAnswer: false });
    env.w.dispatchEvent(new env.w.Event('newUser'));
    await sleep(1500);
    ok('popup: "Later" does not approve', env.popups.length === 1 && env.approvals.length === 0);
    env.w.dispatchEvent(new env.w.Event('newUser'));
    await sleep(1500);
    ok('popup: after "Later" the user is offered again at the next check', env.popups.length === 2, String(env.popups.length));
  }
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, waiting: [{ id: 4, username: 'X' }], approveOk: false });
    env.w.dispatchEvent(new env.w.Event('newUser'));
    await sleep(1500);
    const toasts = Array.from(env.document.body.children).map((e) => e.textContent).join('|');
    ok('popup: error 11 (maximum users) is explained', /Maximum number of users/.test(toasts), toasts);
  }
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, waiting: [] });
    env.w.NX.checkWaitingUsers(true); await sleep(300);
    const toasts = Array.from(env.document.body.children).map((e) => e.textContent).join('|');
    ok('manual: "no users waiting"', /No users waiting/.test(toasts), toasts);
  }

  // ---------------------------------------------------------------- double Next
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true } });
    ok('next: not busy at first', env.w.__nxBusyCfg() === false);
    env.NHK.config('mac', 'ssid').then(null, () => {});
    ok('next: busy right after the start', env.w.__nxBusyCfg() === true);
    await sleep(50);   // the simulated config fails at once => free again
    ok('next: free again after an error', env.w.__nxBusyCfg() === false);
    // navigating to the configuration screen resets the protection
    env.w.__nxCfgAt = Date.now();
    env.handlers['$stateChangeSuccess'].forEach((f) => f({}, { name: 'start-add-device-settings' }));
    ok('next: back on the configuration screen resets the protection', env.w.__nxBusyCfg() === false);
  }

  // ---------------------------------------------------------------- navigation releases the accessory Wi-Fi
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true } });
    const before = env.native.filter((c) => c.action === 'release').length;
    env.handlers['$stateChangeSuccess'].forEach((f) => f({}, { name: 'tabsController.favorites' }));
    env.handlers['$stateChangeSuccess'].forEach((f) => f({}, { name: 'tabsController.settings-add-device-settings' }));
    const after = env.native.filter((c) => c.action === 'release').length;
    ok('release: on favorites yes, in the wizard no', after - before === 1, String(after - before));
  }

  // ---------------------------------------------------------------- cloud
  {
    const opened = [];
    const env = await environment({
      homes: [home([device()])], net: { wifi: true },
      preXhr(w) { w.XMLHttpRequest.prototype.open = function (m, u) { opened.push(u); }; }
    });
    const x1 = new env.w.XMLHttpRequest();
    x1.open('GET', 'http://it4wifi.cloud.nice.niceappdomain.com/nhk_cloud/push/registerToken?x=1');
    ok('cloud: first call goes through as normal', /niceappdomain/.test(opened[0]), opened[0]);
    x1.dispatchEvent(new env.w.Event('error'));
    const x2 = new env.w.XMLHttpRequest();
    x2.open('GET', 'http://it4wifi.cloud.nice.niceappdomain.com/nhk_cloud/push/registerToken?x=2');
    ok('cloud: skipped immediately after a failure', /^http:\/\/127\.0\.0\.1:9\//.test(opened[1]), opened[1]);
    const x3 = new env.w.XMLHttpRequest();
    x3.open('GET', 'https://www.niceforyou.com/api/v1/documents');
    ok('cloud: other addresses are left alone', opened[2] === 'https://www.niceforyou.com/api/v1/documents', opened[2]);
    const x4 = new env.w.XMLHttpRequest();
    x4.open('GET', 'http://192.168.1.72:80/configured');
    ok('cloud: the accessory itself is left alone', opened[3] === 'http://192.168.1.72:80/configured', opened[3]);
    // nx5: after 10 minutes the cloud is tried again (previously only after 24 hours)
    env.w.localStorage.setItem('nxCloudDeadSince', String(Date.now() - 11 * 60 * 1000));
    const x5 = new env.w.XMLHttpRequest();
    x5.open('GET', 'http://it4wifi.cloud.nice.niceappdomain.com/nhk_cloud/push/registerToken?x=5');
    ok('cloud: after 11 minutes the cloud is tried again', /niceappdomain/.test(opened[4]), opened[4]);
    env.w.localStorage.setItem('nxCloudDeadSince', String(Date.now() - 5 * 60 * 1000));
    const x6 = new env.w.XMLHttpRequest();
    x6.open('GET', 'http://it4wifi.cloud.nice.niceappdomain.com/nhk_cloud/push/registerToken?x=6');
    ok('cloud: still skipped within 10 minutes', /^http:\/\/127\.0\.0\.1:9\//.test(opened[5]), opened[5]);
  }

  // ---------------------------------------------------------------- nx4: VPN and mobile data
  {
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi', vpn: true, cellular: true }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('nx4 chip: also mentions VPN and mobile', chip(env).textContent === 'Accessory not reachable · VPN, mobile', chip(env).textContent);
    const ns = env.native.find((c) => c.action === 'netState');
    ok('nx4: netState gets the address of the accessory', ns && ns.args[0] === '192.168.1.72', JSON.stringify(ns));
  }
  {
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, cellular: true, defaultType: 'vpn', vpnRoute: '192.168.1.0/24 via tun0', sdk: 34, version: 'nx-4' },
      probe: { ok: false, error: 'SocketTimeoutException', std: { ok: false, error: 'SocketTimeoutException' } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx4 vpn: route to the accessory visible', /VPN route to the accessory: 192\.168\.1\.0\/24 via tun0/.test(t), t);
    ok('nx4 vpn: active network according to Android visible', /Android's active network: vpn \(not the Wi-Fi\)/.test(t), t);
    ok('nx4 vpn: conclusion mentions the tunnel and subnet routes', /into the tunnel, via the route 192\.168\.1\.0\/24 via tun0.*Use Tailscale subnets/.test(t), t);
    ok('nx4 vpn: default route measured and shown', /via Android's default route: no answer \(SocketTimeoutException\)/.test(t), t);
    ok('nx4 vpn: version and Android level at the bottom', /Android API 34 · native layer nx-4/.test(t), t);
    ok('nx4: the diagnosis is also in the LOG', env.logs.some((l) => /^\[NX\] diagnosis\nNetwork: Wi-Fi HomeWifi/.test(l)), env.logs.slice(-2).join('|'));
  }
  {
    // VPN on, but without a route to the accessory: the VPN is then not the cause
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: null },
      probe: { ok: false, error: 'ConnectException' }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx4 vpn without route: reported', /VPN route to the accessory: none \(the VPN does not affect the accessory's address\)/.test(t), t);
    ok('nx4 vpn without route: conclusion does not point at the VPN', /not responding/.test(t) && /Your VPN is on, but does not affect the accessory's address/.test(t) && !/into the tunnel/.test(t), t);
  }
  {
    // no answer over Wi-Fi, but there is via the default route
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', cellular: true },
      probe: { ok: false, error: 'SocketTimeoutException', std: { ok: true, tcpMs: 30 } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx4: Wi-Fi fails but default route works -> guest network/isolation mentioned', /Directly over Wi-Fi the phone does not reach the accessory, but via Android's default route it does/.test(t), t);
  }
  {
    // Wi-Fi without internet + mobile as the default: this is the situation in which the app reported "Wi-Fi gone"
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: false, cellular: true, defaultType: 'mobile' },
      probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx4: Wi-Fi without internet and mobile as active network reported', /no internet/.test(t) && /Android's active network: mobile \(not the Wi-Fi\)/.test(t), t);
  }

  // ---------------------------------------------------------------- nx5: any network that reaches the accessory
  {
    // another Wi-Fi network on the same router, accessory reachable: the diagnosis says that does not matter
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi-5G', ip: '192.168.1.60' },
      probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx5 other Wi-Fi: conclusion says it does not matter', /Everything is fine\. You are on "HomeWifi-5G" instead of "HomeWifi"; that does not matter/.test(t), t);
  }
  {
    // other Wi-Fi and the accessory does not answer: only then the hint about guest network / device isolation
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi-5G', ip: '192.168.1.60' },
      probe: { ok: false, error: 'SocketTimeoutException' }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('nx5 other Wi-Fi + unreachable: chip mentions it', chip(env).textContent === 'Accessory not reachable · other Wi-Fi', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx5 other Wi-Fi + unreachable: guest network/isolation mentioned', /guest network, device isolation.*connect to "HomeWifi"/.test(t), t);
    ok('nx5 other Wi-Fi + unreachable: the accessory conclusion remains', /not responding.*power/.test(t), t);
  }
  {
    // away from home: no Wi-Fi, but a VPN that passes on the home network, and the app has a connection
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: false, cellular: true, vpn: true, defaultType: 'vpn', vpnRoute: '192.168.1.0/24 via tun0' },
      probe: { ok: false, error: 'NO_WIFI', std: { ok: true, tcpMs: 45 } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    ok('nx5 away from home with VPN to home: chip says online', chip(env).textContent === 'Accessory online', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx5 away from home: measurement only via the default route (no "over Wi-Fi" line)', /via Android's default route: TCP 45 ms/.test(t) && !/over Wi-Fi:/.test(t), t);
    ok('nx5 away from home: conclusion mentions the VPN', /Everything works: the connection to the accessory runs via your VPN/.test(t), t);
    ok('nx5 away from home: the probe was called (VPN without Wi-Fi)', env.native.some((c) => c.action === 'probe'));
  }
  {
    // away from home with a VPN, but the VPN does not pass on the home network
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: false, cellular: true, vpn: true, defaultType: 'vpn', vpnRoute: null },
      probe: { ok: false, error: 'NO_WIFI', std: { ok: false, error: 'SocketTimeoutException' } }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('nx5 away from home without route: chip mentions no Wi-Fi and VPN', chip(env).textContent === 'Accessory not reachable · no Wi-Fi, VPN, mobile', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx5 away from home without route: explanation about subnet route', /does not route the accessory's address.*subnet route/.test(t), t);
  }
  {
    // away from home with a VPN route, but the accessory does not answer (switched off at home?)
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: false, vpn: true, vpnRoute: '192.168.1.0/24 via tun0' },
      probe: { ok: false, error: 'NO_WIFI', std: { ok: false, error: 'SocketTimeoutException' } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx5 away from home with route but no answer: explanation', /Your VPN does route the accessory's address \(route 192\.168\.1\.0\/24 via tun0\), but the accessory does not answer/.test(t), t);
  }
  {
    // no Wi-Fi, no VPN, the app is not connected: away from home everything goes through the Nice cloud, and it does not answer
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: false, cellular: true, vpn: false },
      probe: { ok: false, error: 'NO_WIFI', cloud: { ok: false, dnsError: 'UnknownHostException' } }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('nx6 no Wi-Fi, app not connected: chip mentions no Wi-Fi and mobile', chip(env).textContent === 'Accessory not reachable · no Wi-Fi, mobile', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx6 no Wi-Fi: the cloud line is in the diagnosis', /Nice cloud: name not found \(UnknownHostException\); no connection/.test(t), t);
    ok('nx6 no Wi-Fi: explanation mentions the cloud and the Wi-Fi at home', /Away from home, the connection runs via the Nice cloud, and it cannot be reached right now \(the name cannot be found: UnknownHostException\).*"HomeWifi" or another Wi-Fi network on your home network/.test(t), t);
    ok('nx6 no Wi-Fi: the probe was called with the cloud flag and without a Wi-Fi line', env.native.some((c) => c.action === 'probe' && c.args[4] === true) && !/over Wi-Fi:/.test(t));
  }
  {
    // away from home without a VPN, the app connected via the Nice cloud (as on 5G in practice): no more "turn on Wi-Fi"
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: false, cellular: true, vpn: false, route: 'cloud', routeAgeSeconds: 3 },
      probe: { ok: false, error: 'NO_WIFI', cloud: { ok: true, dns: '34.1.2.3', dnsMs: 20, tcpMs: 90 } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    ok('nx6 away from home via the cloud: chip says online · cloud', chip(env).textContent === 'Accessory online · cloud', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx6 away from home via the cloud: conclusion is right (no "turn on Wi-Fi")', /Everything works: away from home, the connection to the accessory runs via the Nice cloud/.test(t) && !/turn on Wi-Fi/i.test(t), t);
    ok('nx6 away from home via the cloud: cloud line with address and times', /Nice cloud: name → 34\.1\.2\.3 \(20 ms\); TCP 7890 90 ms/.test(t), t);
    ok('nx6 away from home via the cloud: chosen route is included (once)', /The app connect(s|ed) to the accessory via the Nice cloud/.test(t) && (t.match(/The app connect(s|ed) to the accessory via/g) || []).length === 1, t);
  }
  {
    // an old "reachable" flag without the app having chosen the cloud (outdated) does not count without a network
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: false, cellular: false, vpn: false, route: 'local' } });
    env.w.NX.refresh(); await sleep(50);
    ok('nx6: outdated flag without network and without cloud choice -> No Wi-Fi', chip(env).textContent === 'No Wi-Fi', chip(env).textContent);
  }
  {
    // Tailscale on, at home on Wi-Fi, local route closed, the app chose the cloud: works, and the explanation mentions App split tunneling
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, vpnRoute: '192.168.1.0/24 via tun0', route: 'cloud', routeAgeSeconds: 2 },
      probe: { ok: false, error: 'SocketTimeoutException', std: { ok: false, error: 'SocketTimeoutException' }, cloud: { ok: true, dns: '34.1.2.3', dnsMs: 30, tcpMs: 110 } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    ok('nx6 VPN + cloud: chip online · cloud', chip(env).textContent === 'Accessory online · cloud', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx6 VPN + cloud: conclusion explains why the cloud and mentions App split tunneling', /via the Nice cloud instead of directly.*Your VPN is on.*App split tunneling.*Excluded apps/.test(t), t);
  }
  {
    // Tailscale on and the cloud cannot be reached either: the VPN takes over the traffic or the name resolution
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, vpnRoute: null },
      probe: { ok: false, error: 'SocketTimeoutException', cloud: { ok: false, dnsError: 'UnknownHostException' } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx6 VPN, accessory and cloud unreachable: points to the VPN and App split tunneling', /neither the accessory nor the Nice cloud can be reached \(the name cannot be found: UnknownHostException\)\. Try switching the VPN off briefly.*App split tunneling/.test(t), t);
  }
  {
    // the VPN intercepts the accessory's address, cloud reachable, app not connected yet: tip to reconnect
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, vpnRoute: '192.168.1.0/24 via tun0' },
      probe: { ok: false, error: 'SocketTimeoutException', cloud: { ok: true, dns: '34.1.2.3', dnsMs: 10, tcpMs: 100 } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx6 VPN intercepts the accessory address, cloud reachable: "Reconnect" gets the app onto the cloud', /App split tunneling/.test(t) && /The Nice cloud is reachable, though: tap "Reconnect"/.test(t), t);
  }

  {
    // automatic recovery does happen on another Wi-Fi network of the same home network (same /24)
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi-5G', ip: '192.168.1.60' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, reachable: [true] });
    env.w.NX.refresh(); await sleep(3600);
    ok('nx5 recovery: also on another Wi-Fi network of the same router', env.native.filter((c) => c.action === 'reconnect').length === 1 &&
      env.HS.homes[0].devices[0].reachable === true, String(env.native.filter((c) => c.action === 'reconnect').length));
  }
  {
    // ... but not on a completely different network (at someone else's home): the accessory is not there
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'FriendsWifi', ip: '10.0.0.5' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, reachableDefault: false });
    env.w.NX.refresh(); await sleep(500);
    ok('nx5 recovery: not on a different network (different /24)', !env.native.some((c) => c.action === 'probe' || c.action === 'reconnect'),
      JSON.stringify(env.native.map((c) => c.action)));
  }
  {
    // without Wi-Fi (VPN only): no LAN measurement and no reconnect, but do check again: the app chooses by itself (cloud)
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: false, vpn: true, vpnRoute: '192.168.1.0/24 via tun0' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, reachableDefault: false });
    env.w.NX.refresh(); await sleep(600);
    ok('nx6 recovery without Wi-Fi: no LAN measurement and no reconnect', !env.native.some((c) => c.action === 'probe' || c.action === 'reconnect'),
      JSON.stringify(env.native.map((c) => c.action)));
    ok('nx6 recovery without Wi-Fi: checked again (the app chooses by itself)', env.verifyLog.length >= 1, env.verifyLog.join(','));
    ok('nx6 recovery without Wi-Fi: is in the LOG', env.logs.some((l) => /auto-recovery 1\/3: no Wi-Fi/.test(l)), env.logs.slice(-3).join('|'));
  }
  {
    // VPN on with Wi-Fi, the accessory does not answer locally: check again (the app now chooses the cloud), no reconnect
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, vpnRoute: '192.168.1.0/24 via tun0' },
      probe: { ok: false, error: 'SocketTimeoutException' }, graceMs: 0, reachable: [true] });
    env.w.NX.refresh(); await sleep(700);
    ok('nx6 recovery with VPN: no reconnect', env.native.filter((c) => c.action === 'reconnect').length === 0);
    ok('nx6 recovery with VPN: checked again and reachable', env.HS.homes[0].devices[0].reachable === true && env.verifyLog.length >= 1, env.verifyLog.join(','));
    ok('nx6 recovery with VPN: is in the LOG', env.logs.some((l) => /auto-recovery 1\/3: the accessory does not respond locally.*the VPN is on/.test(l)), env.logs.slice(-3).join('|'));
  }

  // ---------------------------------------------------------------- nx7: Android refuses to bind to the Wi-Fi under a VPN (EPERM)
  {
    // the user's diagnosis with Tailscale on: binding to the network fails, the accessory does not answer locally
    // (EHOSTUNREACH), the app connects via the cloud and that now works thanks to the normal connection
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.172', vpn: true, cellular: true, defaultType: 'vpn', vpnRoute: null, route: 'cloud', routeAgeSeconds: 1 },
      probe: { ok: false, error: 'ConnectException: EHOSTUNREACH (No route to host)', bound: false,
        cloud: { ok: true, dns: '63.182.6.157', dnsMs: 13, tcpMs: 70, bound: false } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    ok('nx7 VPN + EPERM, connected via the cloud: chip online · cloud', chip(env).textContent === 'Accessory online · cloud', chip(env).textContent);
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx7: the diagnosis says the VPN does not allow binding to the Wi-Fi (EPERM)', /The VPN does not allow the app to bind its connection to the Wi-Fi network \(EPERM\); the app then uses a normal connection\./.test(t), t);
    ok('nx7: the accessory line says normal connection instead of "over Wi-Fi"', /Accessory 192\.168\.1\.72 \(normal connection\): no answer \(ConnectException: EHOSTUNREACH/.test(t) && !/over Wi-Fi:/.test(t), t);
    ok('nx7: the conclusion says the accessory does not answer locally and that the cloud works', /Everything works, but via the Nice cloud instead of directly: the local route to the accessory did not work \(the accessory does not answer on the local network: ConnectException: EHOSTUNREACH/.test(t), t);
    ok('nx7: no false "the VPN takes over the traffic" claim', !/probably takes over/.test(t), t);
  }
  {
    // without EPERM (no VPN) nothing changes in the lines
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50' },
      probe: { ok: true, tcpMs: 40, tlsMs: 400, bound: true }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx7: a normally bound connection stays "over Wi-Fi" and no EPERM line', /over Wi-Fi: TCP 40 ms/.test(t) && !/EPERM/.test(t), t);
  }

  // ---------------------------------------------------------------- nx8: the accessory hangs (TCP ok, TLS not) and local/cloud switching
  {
    // the user's diagnosis with Tailscale on: TCP to the accessory works, the TLS handshake gets stuck; the cloud works
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.172', vpn: true, cellular: true, defaultType: 'vpn', vpnRoute: null, route: 'cloud', routeAgeSeconds: 4 },
      probe: { ok: false, error: 'SocketTimeoutException: Read timed out', tcpMs: 14, bound: false,
        cloud: { ok: true, dns: '63.182.6.157', dnsMs: 0, tcpMs: 20, bound: false } }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx8 hung: the measurement shows TCP and TLS separately', /Accessory 192\.168\.1\.72 \(normal connection\): TCP 14 ms, but no answer on TLS \(SocketTimeoutException: Read timed out\)/.test(t), t);
    ok('nx8 hung: the conclusion says the accessory has hung and not the VPN', /Everything works via the Nice cloud\. The accessory accepts the connection \(TCP 14 ms\) but does not answer the secure handshake.*it has hung\. The network and your VPN are fine\. Cut the power to the accessory for half a minute/.test(t), t);
    ok('nx8 hung: no more advice to switch off the VPN or exclude the app', !/switching (it|the VPN) off/.test(t) && !/App split tunneling/.test(t), t);
    ok('nx8: the chosen route appears only once', (t.match(/The app connect(s|ed) to the accessory via/g) || []).length === 1, t);
  }
  {
    // the same situation without a VPN: "the network is fine" without the VPN clause, and the app is not connected yet
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50' },
      probe: { ok: false, error: 'SocketTimeoutException: Read timed out', tcpMs: 9, cloud: { ok: true, dns: '63.182.6.157', dnsMs: 5, tcpMs: 30 } }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx8 hung without VPN: conclusion mentions the hang and the reachable cloud', /it has hung\. The network is fine\./.test(t) && !/your VPN/i.test(t) && /The Nice cloud is reachable, though: tap "Reconnect"/.test(t), t);
  }
  {
    // without a TCP connection (accessory really unreachable) it is not "hung"
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50' },
      probe: { ok: false, error: 'ConnectException: EHOSTUNREACH' }, reachableDefault: false });
    chip(env).click(); await sleep(300);
    const t = details(env).textContent;
    ok('nx8: without a TCP answer no "hung" conclusion', !/it has hung/.test(t) && /The accessory is not responding/.test(t), t);
  }
  {
    // the wrapper reports every outcome to the native layer, so that it switches route when a check fails
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, reachable: [false, true] });
    const live = env.HS.homes[0].devices[0];
    env.$rootScope.verifyDeviceRecheability(live);
    await sleep(400);
    const actions = env.native.filter((c) => c.action === 'checkFailed' || c.action === 'checkSucceeded').map((c) => c.action);
    ok('nx8: failed, then succeeded is reported in that order', actions.length === 2 && actions[0] === 'checkFailed' && actions[1] === 'checkSucceeded', actions.join(','));
  }
  {
    // the remaining priority of the cloud is in the diagnosis
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', route: 'cloud', routeAgeSeconds: 2, cloudPreference: 95 },
      probe: { ok: true, tcpMs: 20, tlsMs: 300 }, reachableDefault: true });
    chip(env).click(); await sleep(300);
    ok('nx8: the priority of the cloud is shown', /The local connection just failed; the app gives the cloud priority for another 95 s\./.test(details(env).textContent), details(env).textContent);
  }

  // ---------------------------------------------------------------- nx4: wrapper right after the definition (cold start)
  {
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, lateVerify: true, reachableDefault: true });
    ok('hook: without a verify function there is nothing to wrap', env.$rootScope.verifyDeviceRecheability === undefined);
    env.defineVerify();                                   // the app defines it in the ready callback ...
    const before = env.native.filter((c) => c.action === 'setHints').length;
    env.w.__nxWrapVerify(env.$rootScope);                 // ... and calls the hook right after
    ok('hook: verify is wrapped immediately', env.$rootScope.verifyDeviceRecheability.__nx === true);
    const live = env.HS.homes[0].devices[0];
    env.$rootScope.verifyDeviceRecheability(live);
    const after = env.native.filter((c) => c.action === 'setHints').length;
    ok('hook: the very first check sends the hints to the native layer first', after === before + 1, before + ' -> ' + after);
    const f = env.$rootScope.verifyDeviceRecheability;
    env.w.__nxWrapVerify(env.$rootScope);
    ok('hook: calling it again does not wrap twice', f === env.$rootScope.verifyDeviceRecheability);
    await sleep(100);
  }
  {
    // without the hook (different order): the poll wraps it anyway
    const env = await environment({ homes: [home([device()])], net: { wifi: true, ssid: 'HomeWifi' }, lateVerify: true });
    env.defineVerify();
    await sleep(700);
    ok('poll: verify is also wrapped without the hook', env.$rootScope.verifyDeviceRecheability.__nx === true);
  }
  {
    // the app's Wi-Fi events are in the LOG
    const env = await environment({ homes: [home([device()])], net: { wifi: true } });
    env.w.dispatchEvent(Object.assign(new env.w.Event('WiFiConnectionStatusChanged'), { eventType: 'wifi-disconnected' }));
    ok('Wi-Fi event is in the LOG', env.logs.some((l) => /Wi-Fi event wifi-disconnected/.test(l)), env.logs.slice(-2).join('|'));
  }

  // ---------------------------------------------------------------- nx4: automatic recovery
  {
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, reachable: [true] });
    env.w.NX.refresh();
    await sleep(3600);   // probe, reconnect, wait 2.5 s, check
    ok('recovery: exactly one reconnect', env.native.filter((c) => c.action === 'reconnect').length === 1, String(env.native.filter((c) => c.action === 'reconnect').length));
    ok('recovery: then checked and reachable', env.HS.homes[0].devices[0].reachable === true && env.verifyLog.length >= 1, env.verifyLog.join(','));
    ok('recovery: status chip shows online', chip(env).textContent === 'Accessory online', chip(env).textContent);
    ok('recovery: is in the LOG', env.logs.some((l) => /auto-recovery 1\/3/.test(l)));
  }
  {
    // if the accessory does not answer, there is nothing to repair in the app
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' },
      probe: { ok: false, error: 'SocketTimeoutException' }, graceMs: 0, reachableDefault: false });
    env.w.NX.refresh(); await sleep(500);
    ok('recovery: no reconnect if the accessory itself does not answer', env.native.filter((c) => c.action === 'reconnect').length === 0);
    ok('recovery: that is in the LOG', env.logs.some((l) => /auto-recovery: the accessory does not respond/.test(l)), env.logs.slice(-3).join('|'));
  }
  {
    // at least 45 s between two attempts
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, reachableDefault: false });
    env.w.NX.refresh(); await sleep(3600);
    env.w.NX.refresh(); await sleep(500);
    env.w.NX.refresh(); await sleep(500);
    ok('recovery: the second attempt waits 45 s', env.native.filter((c) => c.action === 'reconnect').length === 1, String(env.native.filter((c) => c.action === 'reconnect').length));
  }
  {
    // not while the app itself is checking
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 0, verifyMs: 300, reachableDefault: false });
    env.$rootScope.verifyDeviceRecheability(env.HS.homes[0].devices[0]);
    env.w.NX.refresh(); await sleep(150);
    ok('recovery: waits until the app has finished checking', env.native.filter((c) => c.action === 'probe').length === 0, String(env.native.filter((c) => c.action === 'probe').length));
    await sleep(1500);
  }
  {
    // in the quiet period after startup it does nothing
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi' },
      probe: { ok: true, tcpMs: 60, tlsMs: 500 }, graceMs: 60000, reachableDefault: false });
    env.w.NX.refresh(); await sleep(400);
    ok('recovery: nothing in the first seconds after startup', env.native.filter((c) => c.action === 'probe' || c.action === 'reconnect').length === 0);
  }

  // ---------------------------------------------------------------- nx4: copy button
  {
    let copied = null;
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50' },
      probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true,
      preXhr(w) { Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { copied = t; return Promise.resolve(); } } }); } });
    chip(env).click(); await sleep(300);
    const button = Array.from(sheet(env).querySelectorAll('button')).find((b) => b.textContent === 'Copy');
    ok('copy: button exists', !!button);
    if (button) { button.click(); await sleep(50); }
    ok('copy: the text of the details is on the clipboard', copied && /Network: Wi-Fi HomeWifi/.test(copied) && /Everything is fine/.test(copied), String(copied));
  }

  // ---------------------------------------------------------------- nx9: status line under the title and bottom sheet
  {
    const env = await environment({ homes: [home([device({ reachable: true })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true, route: 'local', routeAgeSeconds: 4 },
      probe: { ok: true, tcpMs: 40, tlsMs: 400, cloud: { ok: true, tcpMs: 22 } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    const r = env.w.document.documentElement;
    ok('nx9 header: --nx-sub contains the status as a CSS string', r.style.getPropertyValue('--nx-sub') === '"Accessory online"', r.style.getPropertyValue('--nx-sub'));
    ok('nx9 header: --nx-dot follows the level', /--nx-ok/.test(r.style.getPropertyValue('--nx-dot')), r.style.getPropertyValue('--nx-dot'));
    ok('nx9 header: data-nx-status on <html>', r.getAttribute('data-nx-status') === 'ok');
    ok('nx9 sheet: starts closed', sheet(env).style.display === 'none' && !sheet(env).classList.contains('nx-open'));
    chip(env).click(); await sleep(500);
    ok('nx9 sheet: opens after a click on the status', sheet(env).style.display === 'block' && sheet(env).classList.contains('nx-open'));
    ok('nx9 sheet: the heading shows the status', env.document.getElementById('nx-sheet-title').textContent === 'Accessory online', env.document.getElementById('nx-sheet-title').textContent);
    ok('nx9 sheet: the explanation is the outcome of the diagnosis', /Everything is fine/.test(env.document.getElementById('nx-sheet-explanation').textContent), env.document.getElementById('nx-sheet-explanation').textContent);
    ok('nx9 sheet: shape and color follow the state', sheet(env).classList.contains('nx-l-ok') && sheet(env).classList.contains('nx-via-local') && !sheet(env).classList.contains('nx-busy'));
    const nodes = env.document.querySelectorAll('#nx-sheet-route .nx-node'), links = env.document.querySelectorAll('#nx-sheet-route .nx-link');
    ok('nx9 route: local is phone - accessory with a successful link', nodes.length === 2 && links.length === 1 && links[0].classList.contains('nx-s-ok') && /40 ms/.test(links[0].textContent), links[0] && links[0].textContent);
    const facts = env.document.getElementById('nx-sheet-facts').textContent;
    ok('nx9 facts: Wi-Fi, route, accessory, cloud and app connection', /Wi-Fi HomeWifi/.test(facts) && /Local connection/.test(facts) && /TCP 40 ms · TLS 400 ms/.test(facts) && /Nice cloud/.test(facts) && /App connection/.test(facts), facts);
    const buttons = Array.from(sheet(env).querySelectorAll('button')).map((b) => b.textContent);
    ok('nx9 actions: five buttons', ['New users', 'Copy', 'Log', 'Close', 'Reconnect'].every((t) => buttons.indexOf(t) >= 0), buttons.join('|'));
    ok('nx9 details: the text for sharing is under "Technical details"', /Network: Wi-Fi HomeWifi/.test(details(env).textContent) && details(env).closest('details'));
    Array.from(sheet(env).querySelectorAll('button')).find((b) => b.textContent === 'Close').click(); await sleep(600);
    ok('nx9 sheet: closes with the Close button', !sheet(env).classList.contains('nx-open') && sheet(env).style.display === 'none');
    // a tap on the title also opens the sheet
    const header = env.document.createElement('div'); header.className = 'bar bar-header'; header.innerHTML = '<h1 class="title">Favorites</h1>';
    env.document.body.appendChild(header);
    header.querySelector('.title').click(); await sleep(500);
    ok('nx9 header: a tap on the title opens the sheet', sheet(env).classList.contains('nx-open'));
    // Android's back button closes the sheet and leaves the app alone
    let appReceived = false;
    env.document.addEventListener('backbutton', () => { appReceived = true; }, false);
    env.document.dispatchEvent(new env.w.Event('backbutton', { cancelable: true })); await sleep(600);
    ok('nx9 back button: closes the sheet', !sheet(env).classList.contains('nx-open'));
    ok('nx9 back button: the app itself does not receive the back button then', !appReceived);
    env.document.dispatchEvent(new env.w.Event('backbutton', { cancelable: true }));
    ok('nx9 back button: with a closed sheet it simply goes through to the app', appReceived);
  }
  {
    // away from home: without Wi-Fi and without a VPN everything goes through the Nice cloud (three nodes, two links)
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: false, cellular: true, vpn: false, route: 'cloud', routeAgeSeconds: 12 },
      probe: { ok: false, error: 'NO_WIFI', cloud: { ok: true, tcpMs: 30 } }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(50);
    ok('nx9 cloud: the line under the title says online - cloud', env.w.document.documentElement.style.getPropertyValue('--nx-sub') === '"Accessory online · cloud"', env.w.document.documentElement.style.getPropertyValue('--nx-sub'));
    chip(env).click(); await sleep(500);
    ok('nx9 cloud: the sheet picks the cloud shape', sheet(env).classList.contains('nx-via-cloud') && sheet(env).classList.contains('nx-l-ok'));
    const nodes = env.document.querySelectorAll('#nx-sheet-route .nx-node'), links = env.document.querySelectorAll('#nx-sheet-route .nx-link');
    ok('nx9 cloud: route phone - cloud - accessory with two successful links', nodes.length === 3 && links.length === 2 && links[0].classList.contains('nx-s-ok') && links[1].classList.contains('nx-s-ok'), links.length + ' links');
    ok('nx9 cloud: the link to the cloud mentions mobile and the measurement', /mobile/.test(links[0].textContent) && /30 ms/.test(links[0].textContent), links[0].textContent);
  }
  {
    // fault: the accessory does not answer, the VPN is on; the link has failed and the text says what to do
    const env = await environment({ homes: [home([device({ reachable: false })])],
      net: { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', vpn: true, cellular: true, validated: true, vpnRoute: null },
      probe: { ok: false, error: 'TIMEOUT', cloud: { ok: false, error: 'ECONNREFUSED' } }, reachableDefault: false });
    env.w.NX.refresh(); await sleep(50);
    ok('nx9 fault: the header says not reachable with the cause', env.w.document.documentElement.style.getPropertyValue('--nx-sub') === '"Accessory not reachable · VPN, mobile"', env.w.document.documentElement.style.getPropertyValue('--nx-sub'));
    ok('nx9 fault: data-nx-status is bad', env.w.document.documentElement.getAttribute('data-nx-status') === 'bad');
    chip(env).click(); await sleep(600);
    ok('nx9 fault: the sheet picks the fault shape', sheet(env).classList.contains('nx-l-bad'));
    const links = env.document.querySelectorAll('#nx-sheet-route .nx-link');
    ok('nx9 fault: the link to the accessory has failed', links.length === 1 && links[0].classList.contains('nx-s-fail'), links.length + ' links');
    const facts = env.document.getElementById('nx-sheet-facts').textContent;
    ok('nx9 fault: VPN and failed measurements appear as facts', /VPN on/.test(facts) && /failed/.test(facts) && /no answer \(TIMEOUT\)/.test(facts), facts);
    ok('nx9 fault: the explanation mentions the VPN solution', /App split tunneling/.test(env.document.getElementById('nx-sheet-explanation').textContent), env.document.getElementById('nx-sheet-explanation').textContent);
  }
  {
    // without an accessory in the app: no status line, no sheet, a tap on the title does nothing
    const env = await environment({ homes: [home([])], net: { wifi: true, ssid: 'HomeWifi' } });
    env.w.NX.refresh(); await sleep(50);
    ok('nx9 empty: no status line', env.w.document.documentElement.style.getPropertyValue('--nx-sub') === 'none' && !env.w.document.documentElement.getAttribute('data-nx-status'), env.w.document.documentElement.style.getPropertyValue('--nx-sub'));
    const header = env.document.createElement('div'); header.className = 'bar bar-header'; header.innerHTML = '<h1 class="title">Start</h1>';
    env.document.body.appendChild(header);
    header.querySelector('.title').click(); await sleep(400);
    ok('nx9 empty: a tap on the title opens nothing', !sheet(env).classList.contains('nx-open') && sheet(env).style.display === 'none');
  }
  {
    // Android's status bar: whatever the app calls per page (black, green, blue) becomes the color of the surface
    const calls = [];
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: true, ssid: 'HomeWifi' },
      preXhr(w) {
        w.StatusBar = { backgroundColorByHexString(c) { calls.push('color ' + c); }, styleLightContent() { calls.push('light'); }, styleDefault() { calls.push('dark'); } };
        w.document.documentElement.style.setProperty('--md-sys-color-surface', '#faf8ff');
      } });
    calls.length = 0;
    env.w.StatusBar.backgroundColorByHexString('#000000');
    env.w.StatusBar.styleLightContent();
    ok('nx9 status bar: black from the app no longer comes through', calls.indexOf('color #000000') < 0, calls.join(','));
    ok('nx9 status bar: the icons follow the theme (light theme: dark icons)', calls.indexOf('dark') >= 0 && calls.indexOf('light') < 0, calls.join(','));
  }

  // ---------------------------------------------------------------- robustness: no Angular / broken storage
  {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/', runScripts: 'outside-only' });
    const w = dom.window;
    w.console.log = () => {};
    w.localStorage.setItem('keyHomes', '{broken');
    let threw = false;
    try { w.eval(SRC); } catch (e) { threw = true; }
    await sleep(100);
    ok('robust: loading without Angular/Cordova throws nothing', !threw);
    ok('robust: __nxMsg exists immediately', typeof w.__nxMsg === 'function');
  }

  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
