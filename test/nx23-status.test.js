// nx23 status: the status chip and the status sheet in nx-patch.js (section 6), in jsdom with a simulated Angular, Cordova and native layer.
//   NODE_PATH=<folder with node_modules/jsdom> node test/nx23-status.test.js
// What it checks: the sheet never opens by itself (I-06), the verdict is short and cause first (I-15), the chip is a real button with at most one tag (I-17),
// the route and the facts do not contradict the verdict (I-18, I-19), and the buttons of the sheet (I-23).
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('skipped (jsdom is not installed)'); process.exit(0); }
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
  return Object.assign({ mac: '00:0B:6C:AA:BB:CC', address: '192.168.1.72', name: 'NiceIT4WIFIAABBCC', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'secret' }, extra || {});
}
function home(devices) { return { homeId: 1, name: 'Home', networkSsid: 'HomeWifi', devices: devices }; }

// scen: { homes, net, probe, reachableDefault, verifyMs, hash (the route), trust (window.__nxTrust), waiting, header (html put in the page before the patch starts) }
async function environment(scen) {
  const dom = new JSDOM('<!doctype html><html><body>' + (scen.header || '') + '</body></html>', { url: 'http://localhost/' + (scen.hash || ''), runScripts: 'outside-only', pretendToBeVisual: true });
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
          case 'probe': return scen.probeNever ? undefined : okCb(scen.probe || { ok: true, tcpMs: 120, tlsMs: 900 });
          case 'version': return okCb('nx-test');
          case 'reconnect': return scen.reconnectFails ? failCb('boom') : okCb();
          case 'release': case 'setHints': case 'checkSucceeded': case 'checkFailed': return okCb();
          default: return;
        }
      }, 0);
    }
  };
  const handlers = {};
  const HS = { homes: JSON.parse(w.localStorage.getItem('keyHomes')) };
  HS.updateDevice = function () { w.localStorage.setItem('keyHomes', JSON.stringify(HS.homes)); };
  const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability: verifyReal };
  function verifyReal(dev) {
    const d = {};
    d.promise = new Promise((res) => setTimeout(() => { dev.reachable = !!scen.reachableDefault; HS.updateDevice(dev.homeId, dev); res(dev); }, scen.verifyMs || 5));
    return d;
  }
  const popups = [];
  const NHK = { config() { return Promise.reject({ code: 'X' }); }, pairings() { pairingCalls.n++; return Promise.resolve({ activeUsers: [], waitingUsers: scen.waiting || [] }); }, userApproved() { return Promise.resolve(); } };
  const pairingCalls = { n: 0 };
  const $q = { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } };
  const $timeout = (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30));
  const $ionicPopup = { confirm(opts) { popups.push(opts); w.document.body.classList.add('popup-open'); return new Promise(() => {}); } };
  const services = { $rootScope, $q, $timeout, NHKPluginService: NHK, HomeService: HS, $ionicPopup };
  const injector = { has: (n) => n in services, get: (n) => services[n] };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(SRC);
  await sleep(800);
  // nx-patch.js offers window.__nxTrust itself (workstream command): the value of the scenario goes in after the patch has started
  if (scen.trust !== undefined) { w.__nxTrust = typeof scen.trust === 'function' ? scen.trust : () => scen.trust; if (w.NX && w.NX.refresh) { w.NX.refresh(); await sleep(60); } }
  return { w, logs, native, handlers, $rootScope, HS, popups, pairingCalls, document: w.document, dom };
}
const chip = (env) => env.document.getElementById('nx-status');
const details = (env) => env.document.getElementById('nx-sheet-text');
const sheet = (env) => env.document.getElementById('nx-sheet');
const text = (env, id) => env.document.getElementById(id).textContent;
const isOpen = (env) => sheet(env).classList.contains('nx-open');
const NET = { wifi: true, ssid: 'HomeWifi', ip: '192.168.1.50', validated: true, route: 'local', routeAgeSeconds: 4 };
const HEADER = '<div class="bar bar-header"><div class="title"><span class="nav-bar-title">AABBCC</span></div><div class="buttons buttons-right"></div></div>';

(async function () {
  // ---------------------------------------------------------------- I-06: the sheet opens only when the person asks for it
  {
    // the diagnosis is still running when the sheet is dismissed: its end must not open the sheet again over Open, Stop and Close
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true, verifyMs: 600 });
    chip(env).click(); await sleep(100);
    ok('I-06: the chip opens the sheet and the diagnosis starts', isOpen(env) && sheet(env).classList.contains('nx-busy'));
    env.w.NX.close(); await sleep(1800);
    ok('I-06: dismissed while measuring: the end of the measurement does not open the sheet again', !isOpen(env) && sheet(env).style.display === 'none', sheet(env).className + ' ' + sheet(env).style.display);
    ok('I-06: ...the result is stored for the next time (Technical details)', /App connection to the accessory: ok/.test(details(env).textContent), details(env).textContent);
    ok('I-06: ...and the chip shows the result', chip(env).textContent === 'Accessory online');
    ok('I-06: ...the busy state is over (Reconnect usable)', !Array.from(sheet(env).querySelectorAll('button')).some((b) => b.disabled));
    env.w.NX.open(); await sleep(60);
    ok('I-06: ...and the sheet that the person opens next shows the result, not "Checking…"', !sheet(env).classList.contains('nx-busy') && /Connected to the accessory over your Wi-Fi/.test(text(env, 'nx-sheet-explanation')), text(env, 'nx-sheet-explanation'));
  }
  {
    // the same through Reconnect (needs about 2.5 s: the native reconnect, 1.5 s of waiting, the measurement)
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true, verifyMs: 300 });
    env.w.NX.reconnect(); await sleep(60);
    ok('I-06: NX.reconnect() opens the sheet (the person asked)', isOpen(env));
    env.w.NX.close(); await sleep(3200);
    ok('I-06: dismissed while reconnecting: the sheet stays closed', !isOpen(env) && sheet(env).style.display === 'none');
    ok('I-06: ...and the reconnect did finish its measurement', /App connection to the accessory: ok/.test(details(env).textContent) && env.native.some((c) => c.action === 'reconnect'));
  }
  {
    // NX.open() only shows the sheet, NX.diagnose() also measures
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true });
    env.w.NX.open(); await sleep(150);
    ok('I-06: NX.open() opens the sheet without a measurement', isOpen(env) && !env.native.some((c) => c.action === 'probe'));
    env.w.NX.close(); await sleep(500);
    env.w.NX.diagnose(); await sleep(400);
    ok('I-06: NX.diagnose() opens the sheet and measures', isOpen(env) && env.native.some((c) => c.action === 'probe'));
  }
  {
    // dismiss and open again while the first run is still measuring: only the newest run counts
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: true, tcpMs: 40, tlsMs: 400 }, reachableDefault: true, verifyMs: 500 });
    chip(env).click(); await sleep(100);
    env.w.NX.close(); await sleep(500);
    chip(env).click(); await sleep(150);
    ok('I-06: the second run is busy', isOpen(env) && sheet(env).classList.contains('nx-busy'));
    await sleep(1300);
    ok('I-06: the second run ends once: one "Network:" block, not busy, the sheet stays open', (details(env).textContent.match(/Network:/g) || []).length === 1 && !sheet(env).classList.contains('nx-busy') && isOpen(env), details(env).textContent);
  }
  {
    // a measurement that never ends does not leave the sheet on "Checking..." for ever (30 s watchdog)
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true, probeNever: true });
    chip(env).click(); await sleep(300);
    ok('I-06: a probe that does not answer: the sheet is busy (Reconnect dimmed)', sheet(env).classList.contains('nx-busy'));
    ok('I-06: ...and the watchdog is in the code (30 s)', /30000/.test(SRC) && /did not finish/.test(SRC));
  }

  // ---------------------------------------------------------------- I-15: the verdict (cause first, then one action; no protocol terms)
  const SCEN = [
    ['setup network', { reach: true, net: { wifi: true, ssid: 'NiceIT4WIFIAABBCC', module: true }, probe: null }],
    ['away, via the Nice cloud', { reach: true, net: { wifi: false, cellular: true, vpn: false, route: 'cloud' }, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: true, tcpMs: 90 } } }],
    ['at home, VPN, via the cloud', { reach: true, net: { wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: '192.168.1.0/24 via tun0', route: 'cloud' }, probe: { ok: false, error: 'ETIMEDOUT', cloud: { ok: true, tcpMs: 110 } } }],
    ['hung, via the cloud', { reach: true, net: { wifi: true, ssid: 'HomeWifi', route: 'cloud' }, probe: { ok: false, error: 'TLS_TIMEOUT', tcpMs: 14, cloud: { ok: true, tcpMs: 20 } } }],
    ['no network', { reach: false, net: { wifi: false, cellular: false, vpn: false }, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: false, dnsError: 'UnknownHostException' } } }],
    ['mobile data, the cloud answers, no session', { reach: false, net: { wifi: false, cellular: true, vpn: false }, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: true, tcpMs: 80 } } }],
    ['VPN without Wi-Fi: nothing answers', { reach: false, net: { wifi: false, vpn: true, vpnRoute: '192.168.1.0/24 via tun0' }, probe: { ok: false, error: 'NO_WIFI', std: { ok: false, error: 'ETIMEDOUT' }, cloud: { ok: false } } }],
    ['VPN routes the address, no answer', { reach: false, net: { wifi: false, vpn: true, vpnRoute: '192.168.1.0/24 via tun0' }, probe: { ok: false, error: 'NO_WIFI', std: { ok: false, error: 'ETIMEDOUT' } } }],
    ['VPN without a route to home', { reach: false, net: { wifi: false, vpn: true, vpnRoute: null }, probe: { ok: false, error: 'NO_WIFI', std: { ok: false, error: 'ETIMEDOUT' } } }],
    ['hung (TCP yes, TLS no)', { reach: false, net: NET, probe: { ok: false, error: 'SocketTimeoutException: Read timed out', tcpMs: 9, cloud: { ok: true, tcpMs: 30 } } }],
    ['the VPN sends it into the tunnel', { reach: false, net: { wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: '192.168.1.0/24 via tun0' }, probe: { ok: false, error: 'ETIMEDOUT' } }],
    ['VPN, nothing answers', { reach: false, net: { wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: null }, probe: { ok: false, error: 'ETIMEDOUT', cloud: { ok: false, dnsError: 'UnknownHostException' } } }],
    ['another Wi-Fi, no answer', { reach: false, net: { wifi: true, ssid: 'GuestWifi' }, probe: { ok: false, error: 'EHOSTUNREACH' } }],
    ['the Wi-Fi of the accessory, no answer', { reach: false, net: NET, probe: { ok: false, error: 'EHOSTUNREACH' } }],
    ['guest network: only the default route reaches it', { reach: false, net: NET, probe: { ok: false, error: 'ETIMEDOUT', std: { ok: true, tcpMs: 30 } } }],
    ['answers, but no session', { reach: false, net: NET, probe: { ok: true, tcpMs: 80, tlsMs: 700 } }],
    ['slow', { reach: true, net: NET, probe: { ok: true, tcpMs: 2300, tlsMs: 8000 } }],
    ['another Wi-Fi, works', { reach: true, net: { wifi: true, ssid: 'HomeWifi-5G' }, probe: { ok: true, tcpMs: 40, tlsMs: 400 } }],
    ['fine', { reach: true, net: NET, probe: { ok: true, tcpMs: 30, tlsMs: 300 } }]
  ];
  const words = (t) => (t.match(/\S+/g) || []).length;
  const sentences = (t) => t.split(/(?<=[.!?])\s+/).filter(Boolean);
  const JARGON = /undefined|TCP|TLS|subnet|exit node|Exception|\bE[A-Z]{5,}\b|\d+ ms|handshake|tunnel route|\bnull\b/;
  {
    const seenCauses = new Set();
    for (const [name, s] of SCEN) {
      const env = await environment({ homes: [home([device({ reachable: s.reach })])], net: s.net, probe: s.probe || undefined, reachableDefault: s.reach });
      chip(env).click(); await sleep(350);
      const verdict = text(env, 'nx-sheet-explanation'), todo = text(env, 'nx-sheet-todo'), more = Array.from(env.document.querySelectorAll('#nx-sheet-todo li')).map((l) => l.textContent);
      const ss = sentences(verdict);
      ok('I-15 [' + name + ']: at most two sentences of at most 25 words, cause first', ss.length >= 1 && ss.length <= 2 && ss.every((x) => words(x) <= 25), verdict);
      ok('I-15 [' + name + ']: no protocol terms, numbers or exception names in the verdict and in what to try', !JARGON.test(verdict) && !JARGON.test(todo), verdict + ' | ' + todo);
      ok('I-15 [' + name + ']: at most three things to try, each a short sentence or two', more.length <= 3 && more.every((x) => words(x) <= 30), more.join(' | '));
      ok('I-15 [' + name + ']: the long text is still under Technical details (nothing is lost)', details(env).textContent.indexOf(verdict) >= 0 && /Network: /.test(details(env).textContent) && /\d+ ms|Network:/.test(details(env).textContent));
      seenCauses.add(ss[0]);
    }
    ok('I-15: the table tells the cases apart (' + seenCauses.size + ' different causes for ' + SCEN.length + ' cases)', seenCauses.size >= SCEN.length - 3, String(seenCauses.size));
  }
  {
    // the numbers and names of the measurements are all still there, for a copy to someone who can read them
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: true, ssid: 'HomeWifi', vpn: true, vpnRoute: '192.168.1.0/24 via tun0', cellular: true, defaultType: 'vpn' },
      probe: { ok: false, error: 'ETIMEDOUT', std: { ok: false, error: 'ETIMEDOUT' }, cloud: { ok: true, dns: '34.1.2.3', dnsMs: 10, tcpMs: 100 } }, reachableDefault: false });
    chip(env).click(); await sleep(350);
    const t = details(env).textContent;
    ok('I-15: Technical details keep the measurements and the options of the VPN (subnet routes, exit node)', /no answer \(ETIMEDOUT\)/.test(t) && /TCP 7890 100 ms/.test(t) && /Use Tailscale subnets/.test(t) && /exit node/.test(t) && /Android API/.test(t), t);
  }

  // ---------------------------------------------------------------- I-17: the chip (a real button; at most one tag; sure or unsure)
  {
    const tags = [
      ['no Wi-Fi comes first', { wifi: false, cellular: true, vpn: true }, 'Not reachable · no Wi-Fi'],
      ['then the VPN', { wifi: true, ssid: 'GuestWifi', vpn: true, cellular: true }, 'Not reachable · VPN'],
      ['then another Wi-Fi', { wifi: true, ssid: 'GuestWifi', cellular: true }, 'Not reachable · other Wi-Fi'],
      ['then mobile data', { wifi: true, ssid: 'HomeWifi', cellular: true }, 'Not reachable · mobile data'],
      ['and nothing else', { wifi: true, ssid: 'HomeWifi' }, 'Not reachable']
    ];
    for (const [name, net, expected] of tags) {
      const env = await environment({ homes: [home([device({ reachable: false })])], net: net, reachableDefault: false });
      env.w.NX.refresh(); await sleep(60);
      ok('I-17 chip: ' + name, chip(env).textContent === expected && (chip(env).textContent.match(/ · /g) || []).length <= 1, chip(env).textContent);
    }
    const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: false, cellular: true, route: 'cloud' }, reachableDefault: true });
    env.w.NX.refresh(); await sleep(60);
    ok('I-17 chip: online through the cloud', chip(env).textContent === 'Accessory online · cloud', chip(env).textContent);
    ok('I-17: #nx-status is not a second button and does not announce by itself (the accessibility layer says the chip once, through #nx-live)', chip(env).getAttribute('role') === 'status' && chip(env).getAttribute('aria-live') === 'off' && !chip(env).hasAttribute('tabindex'));
  }
  {
    // the real button: the last child of every header title, a name that contains the visible text, put back when Ionic rewrites the title
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true, header: HEADER });
    env.w.NX.refresh(); await sleep(100);
    const title = () => env.document.querySelector('.bar-header .title');
    const c = () => title().querySelector('.nx-chip');
    ok('I-17 button: a <button type="button"> that is the last child of the title', !!c() && c().tagName === 'BUTTON' && c().type === 'button' && title().lastElementChild === c());
    ok('I-17 button: it says what it is (aria-haspopup=dialog) and has one verdict, one tag', c().getAttribute('aria-haspopup') === 'dialog' && c().children[0].textContent === 'Accessory online' && c().children[1].textContent === '');
    ok('I-17 button: the accessible name contains the visible text and says what a tap does', c().getAttribute('aria-label') === 'Accessory online. Opens connection details', c().getAttribute('aria-label'));
    title().innerHTML = '<span class="nav-bar-title">Favorites</span>';           // what Ionic does when the view changes
    await sleep(120);
    ok('I-17 button: put back after Ionic has rewritten the title, still the last child, only one', title().querySelectorAll('.nx-chip').length === 1 && title().lastElementChild.classList.contains('nx-chip'), title().innerHTML);
    // the observer ends: a quiet page makes no mutations of the chip
    let mutations = 0;
    const mo = new env.w.MutationObserver((l) => { mutations += l.length; });
    mo.observe(c(), { childList: true, subtree: true, attributes: true, characterData: true });
    mo.observe(title(), { childList: true });
    await sleep(400);
    ok('I-17 button: nothing is rewritten while nothing changes (no observer loop)', mutations === 0, String(mutations));
    mo.disconnect();
    // a tap on the title text does nothing, a tap on the chip opens the sheet
    title().querySelector('.nav-bar-title').click(); await sleep(250);
    ok('I-17 button: a tap on the title text does not open the sheet', !isOpen(env));
    c().click(); await sleep(250);
    ok('I-17 button: a tap on the chip opens the sheet', isOpen(env));
    env.w.NX.close(); await sleep(500);
    // the room for the buttons on the right of the header
    const right = env.document.querySelector('.buttons-right');
    right.getBoundingClientRect = () => ({ width: 77, left: 283, right: 360, top: 0, bottom: 48, height: 48 });
    env.w.NX.refresh(); await sleep(100);
    ok('I-17 button: the chip leaves room for the buttons on the right (their width and 8 dp)', c().style.getPropertyValue('--nx-chip-reserve') === '85px', c().getAttribute('style'));
    // a second (hidden) header block has its own chip
    env.document.body.insertAdjacentHTML('beforeend', HEADER); await sleep(120);
    ok('I-17 button: every header has exactly one', Array.from(env.document.querySelectorAll('.bar-header .title')).every((t) => t.querySelectorAll('.nx-chip').length === 1));
  }
  {
    const env = await environment({ homes: [home([])], net: NET, header: HEADER });
    env.w.NX.refresh(); await sleep(100);
    const c = env.document.querySelector('.nx-chip');
    ok('I-17 button: hidden while there is no accessory', !c || c.hidden === true, c && c.outerHTML);
  }
  {
    // the chip says "not confirmed" while the state on the accessory screen is being checked (window.__nxTrust of the command workstream); without it nothing changes
    const route = '#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC';
    const on = async (extra) => { const env = await environment(Object.assign({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true }, extra)); env.w.NX.refresh(); await sleep(60); return env; };
    let env = await on({ hash: route });
    ok('I-17 trust: without window.__nxTrust the accessory is online', chip(env).textContent === 'Accessory online');
    env = await on({ hash: route, trust: 'checking' });
    ok('I-17 trust: on the accessory screen, state being checked -> "Accessory: checking…" at the level unknown', chip(env).textContent === 'Accessory: checking…' && chip(env).getAttribute('data-level') === 'unknown' && env.document.documentElement.getAttribute('data-nx-status') === 'unknown', chip(env).textContent);
    env = await on({ hash: '#/tabs/favorites', trust: 'checking' });
    ok('I-17 trust: on another screen it does not count', chip(env).textContent === 'Accessory online');
    for (const t of ['live', 'aging', 'stale', '']) { env = await on({ hash: route, trust: t }); ok('I-17 trust: "' + t + '" leaves the chip online', chip(env).textContent === 'Accessory online', chip(env).textContent); }
    env = await on({ hash: route, trust: () => { throw new Error('x'); } });
    ok('I-17 trust: a throwing function is ignored', chip(env).textContent === 'Accessory online');
    env = await environment({ homes: [home([device({ reachable: false })])], net: NET, reachableDefault: false, hash: route, trust: 'checking' });
    env.w.NX.refresh(); await sleep(60);
    ok('I-17 trust: it never hides a failure ("Not reachable" stays)', chip(env).textContent === 'Not reachable', chip(env).textContent);
    // and it asks again until the state is confirmed
    let state = 'checking';
    env = await environment({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true, hash: route, trust: () => state });
    env.w.NX.refresh(); await sleep(60);
    state = 'live'; await sleep(1800);
    ok('I-17 trust: while it is being confirmed the chip asks again by itself (no waiting for the next round)', chip(env).textContent === 'Accessory online', chip(env).textContent);
  }

  // ---------------------------------------------------------------- I-19 and I-18: the route and the facts agree with the verdict
  {
    // the Nice cloud carries the app, the direct probe fails by design: no red row under the green headline
    for (const probe of [{ ok: false, tcpMs: null, bound: false, cloud: { ok: true, tcpMs: 60 } }, { ok: false, error: 'ETIMEDOUT', tcpMs: null, std: { ok: false, error: 'ETIMEDOUT' }, cloud: { ok: true, tcpMs: 60 } }]) {
      const env = await environment({ homes: [home([device({ reachable: true })])], net: { wifi: false, cellular: true, vpn: true, route: 'cloud', routeAgeSeconds: 3 }, probe: probe, reachableDefault: true });
      chip(env).click(); await sleep(350);
      const facts = env.document.getElementById('nx-sheet-facts');
      ok('I-19 cloud: no failed row and no failed badge under the green headline' + (probe.error ? ' (probe with an error)' : ' (probe without an error)'), !facts.querySelector('.nx-s-fail') && !/failed/.test(facts.textContent) && sheet(env).classList.contains('nx-l-ok'), facts.textContent);
      ok('I-19 cloud: the direct connection is neutral, with its reason', /Direct connection/.test(facts.textContent) && /not available from here, the app uses the Nice cloud/.test(facts.textContent) && !facts.querySelector('.nx-s-ok em'), facts.textContent);
      const nodes = env.document.querySelectorAll('#nx-sheet-route .nx-node .nx-nodeicon');
      ok('I-19 cloud: the three nodes are green (a measurement never overrules a working session)', nodes.length === 3 && Array.from(nodes).every((n) => n.classList.contains('nx-s-ok')), Array.from(nodes).map((n) => n.className).join(' | '));
      ok('I-18 cloud: three nodes (nx-three), the carrier in the caption of the phone, the first link says only how fast, the second says nothing', env.document.getElementById('nx-sheet-route').classList.contains('nx-three') &&
        /Mobile data \+ VPN/.test(env.document.querySelector('#nx-sheet-route .nx-node small').textContent) && /^60 ms$/.test(env.document.querySelectorAll('#nx-sheet-route .nx-link small')[0].textContent) && env.document.querySelectorAll('#nx-sheet-route .nx-link small').length === 1);
    }
  }
  {
    // no network: the phone is red, the glyph is the phone's, nothing is a "check"
    const env = await environment({ homes: [home([device({ reachable: false })])], net: { wifi: false, cellular: false, vpn: false }, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: false, dnsError: 'UnknownHostException' } }, reachableDefault: false });
    chip(env).click(); await sleep(350);
    const first = env.document.querySelector('#nx-sheet-route .nx-nodeicon');
    ok('I-19 no network: the phone node is red', first.classList.contains('nx-s-fail'), first.className);
    ok('I-19 no network: the header glyph is the phone\'s (wifi-off: nx-k-phone)', sheet(env).classList.contains('nx-k-phone') && !sheet(env).classList.contains('nx-k-accessory'));
    const facts = env.document.getElementById('nx-sheet-facts');
    ok('I-19: a failed row never has the check mark, it has the warning glyph', !facts.querySelector('.nx-s-fail .nx-i-check') && !!facts.querySelector('.nx-s-fail .nx-i-warn'), facts.innerHTML);
    ok('I-19: "No network" has the wifi-off glyph in the facts too', !!facts.querySelector('.nx-fi.nx-i-wifi-off'));
  }
  {
    // the accessory is the problem (the phone is fine): the error glyph, the diagram shows the accessory red and the phone green
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: false, error: 'TLS_TIMEOUT', tcpMs: 14 }, reachableDefault: false });
    chip(env).click(); await sleep(350);
    ok('I-19 accessory side: nx-k-accessory (the error mark, not wifi-off)', sheet(env).classList.contains('nx-k-accessory') && !sheet(env).classList.contains('nx-k-phone'));
    const icons = env.document.querySelectorAll('#nx-sheet-route .nx-nodeicon');
    ok('I-19 accessory side: phone green, accessory red', icons[0].classList.contains('nx-s-ok') && icons[1].classList.contains('nx-s-fail'));
    const facts = env.document.getElementById('nx-sheet-facts');
    ok('I-18: a failing sheet lists every row, the failed ones included (nothing is folded away)', facts.querySelectorAll('.nx-fact').length >= 4 && !!facts.querySelector('.nx-s-fail') && !facts.querySelector('.nx-fact-sum'), facts.textContent);
    ok('I-18: the headline never carries the tag, and the diagram is a single line "Wi-Fi" for two nodes', text(env, 'nx-sheet-title') === 'Accessory not reachable' && env.document.querySelectorAll('#nx-sheet-route .nx-link').length === 1 && !env.document.querySelector('#nx-sheet-route .nx-link br'));
    ok('I-18: what to try is a list under the diagram, only when there is something to try', !env.document.getElementById('nx-sheet-todo').hasAttribute('hidden'));
  }
  {
    // healthy: one line for what is routine
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, probe: { ok: true, tcpMs: 30, tlsMs: 300, cloud: { ok: false, error: 'ETIMEDOUT' } }, reachableDefault: true });
    chip(env).click(); await sleep(350);
    const facts = env.document.getElementById('nx-sheet-facts');
    ok('I-18 healthy: one summary line, the cloud that is not needed is no failure', facts.querySelectorAll('.nx-fact').length === 1 && !!facts.querySelector('.nx-fact-sum') && !/failed/.test(facts.textContent), facts.textContent);
    ok('I-18 healthy: no "what to try"', env.document.getElementById('nx-sheet-todo').innerHTML === '');
  }
  {
    // a verdict that no longer matches the chip is measured again, once
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: false, error: 'EHOSTUNREACH' }, reachableDefault: false });
    chip(env).click(); await sleep(350);
    ok('I-18 stale: first the verdict of the measurement', /does not answer on your Wi-Fi/.test(text(env, 'nx-sheet-explanation')));
    const probes = () => env.native.filter((c) => c.action === 'probe').length, before = probes();
    env.HS.homes[0].devices[0].reachable = true; env.w.localStorage.setItem('keyHomes', JSON.stringify(env.HS.homes));
    env.w.NX.refresh(); await sleep(500);
    ok('I-18 stale: the state changed under the open sheet: it measures again (once)', probes() === before + 1, probes() + ' vs ' + before);
  }

  // ---------------------------------------------------------------- I-23: the actions of the sheet
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, probe: { ok: true, tcpMs: 30, tlsMs: 300 }, reachableDefault: true, verifyMs: 200 });
    chip(env).click(); await sleep(500);
    const label = (b) => b.textContent;
    const row = Array.from(sheet(env).querySelectorAll('.nx-more button')).map(label), footer = Array.from(sheet(env).querySelectorAll('.nx-footer button')).map(label), under = Array.from(sheet(env).querySelectorAll('.nx-details-act button')).map(label);
    ok('I-23 buttons: the row has "Check requests" and "Debug log"; "Copy details" is under the details; the footer has Done (left) and Reconnect (right)', row.join() === 'Check requests,Debug log' && under.join() === 'Copy details' && footer.join() === 'Done,Reconnect', row + ' / ' + under + ' / ' + footer);
    ok('I-23 buttons: nothing is called Close, Log, New users or Copy any more', !/^(Close|Log|New users|Copy)$/.test(row.concat(under, footer).join('\n')) && !/\b(Close|New users)\b/.test(sheet(env).textContent.replace(/Debug log/, '')));
    const done = sheet(env).querySelector('.nx-footer button.nx-done'), rec = sheet(env).querySelector('.nx-footer button.nx-reconnect');
    ok('I-23 buttons: Done has a name that contains its text; the classes that the style rules use', done.getAttribute('aria-label') === 'Done, close the status details' && done.classList.contains('nx-text') && rec.classList.contains('nx-primary'));
    ok('I-23 buttons: a healthy sheet (nx-l-ok) is the case in which the style rules make Done the filled button', sheet(env).classList.contains('nx-l-ok'));
    // Reconnect: the old verdict goes at once, the sheet says "Reconnecting…", the button too
    rec.click(); await sleep(30);
    ok('I-23 Reconnect: the old verdict is gone at once and the sheet says "Reconnecting…"', text(env, 'nx-sheet-title') === 'Reconnecting…' && /Rebuilding the connection/.test(text(env, 'nx-sheet-explanation')) && !/Connected to the accessory/.test(text(env, 'nx-sheet-explanation')), text(env, 'nx-sheet-title') + ' | ' + text(env, 'nx-sheet-explanation'));
    ok('I-23 Reconnect: the button says "Reconnecting…" and turns (nx-spin), not dimmed away', rec.textContent === 'Reconnecting…' && rec.classList.contains('nx-spin') && sheet(env).classList.contains('nx-busy-reconnect') && rec.disabled);
    await sleep(2600);
    ok('I-23 Reconnect: afterwards the new verdict and the label "Reconnect"', rec.textContent === 'Reconnect' && !rec.classList.contains('nx-spin') && !rec.disabled && /Connected to the accessory over your Wi-Fi/.test(text(env, 'nx-sheet-explanation')), rec.textContent + ' | ' + text(env, 'nx-sheet-explanation'));
  }
  {
    // a failing reconnect is measured anyway, and the failure is in the details
    const env = await environment({ homes: [home([device({ reachable: false })])], net: NET, probe: { ok: false, error: 'EHOSTUNREACH' }, reachableDefault: false, reconnectFails: true });
    env.w.NX.reconnect(); await sleep(700);
    ok('I-23 Reconnect fails: the sheet still shows a verdict and says why in Technical details', /does not answer on your Wi-Fi/.test(text(env, 'nx-sheet-explanation')) && /^Reconnecting failed: boom/.test(details(env).textContent), details(env).textContent);
  }
  {
    // "Check requests" closes the sheet first and asks the accessory; a popup that opens while the sheet is open closes the sheet (the popup lies under it otherwise)
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, probe: { ok: true, tcpMs: 30, tlsMs: 300 }, reachableDefault: true, waiting: [{ id: 2, username: 'Home assistant' }] });
    chip(env).click(); await sleep(400);
    const btn = Array.from(sheet(env).querySelectorAll('.nx-more button')).find((b) => b.textContent === 'Check requests');
    btn.click(); await sleep(20);
    ok('I-23 Check requests: the sheet is on its way out at once', !isOpen(env));
    await sleep(900);
    ok('I-23 Check requests: the accessory was asked and the popup came, with the sheet gone', env.pairingCalls.n >= 1 && env.popups.length === 1 && sheet(env).style.display === 'none', env.pairingCalls.n + ' ' + env.popups.length + ' ' + sheet(env).style.display);
  }
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, probe: { ok: true, tcpMs: 30, tlsMs: 300 }, reachableDefault: true });
    chip(env).click(); await sleep(400);
    env.document.body.classList.add('popup-open'); await sleep(50);
    ok('I-23 popup: whatever popup of the app opens while the sheet is open, the sheet gives way', !isOpen(env));
    env.document.body.classList.remove('popup-open'); await sleep(500);
    let shown = 0;
    env.w.__nxLogShow = () => { shown++; };
    chip(env).click(); await sleep(400);
    Array.from(sheet(env).querySelectorAll('.nx-more button')).find((b) => b.textContent === 'Debug log').click(); await sleep(50);
    ok('I-23 Debug log: closes the sheet and shows the LOG panel', !isOpen(env) && shown === 1);
  }

  // ---------------------------------------------------------------- the numbers of the style rules (the layout itself is measured in the harness: harness/steps-sheet.cjs)
  {
    const status = fs.readFileSync(path.join(__dirname, '..', 'skin', 'src', 'status.css'), 'utf8'), skin = fs.readFileSync(path.join(__dirname, '..', 'skin', 'src', 'skin.css'), 'utf8');
    ok('css: the chip is a 32 dp pill in a hit area of 48 dp (--nx-chip-h, --nx-chip-hit), the title rule that it needs is repeated for .bar.bar-dark', /--nx-chip-h: 32px; --nx-chip-hit: 48px/.test(status) && /min-height: var\(--nx-chip-hit\)/.test(status) && /\.bar\.bar-dark \.title > \.nx-chip/.test(status));
    ok('css: the tag gives way before the verdict does (the verdict keeps a shrink factor of 1: below 1 it would not shrink at all once the tag is gone)', /\.nx-chip-text \{ flex: 0 1 auto; \}/.test(status) && /\.nx-chip-tag \{ flex: 0 1000000 auto; \}/.test(status));
    ok('css: Done is the filled button of a healthy sheet and Reconnect the tonal one, and the other way round otherwise', /\.nx-sheet\.nx-l-ok \.nx-footer button\.nx-done[\s\S]*?\{ --_bg: var\(--md-sys-color-primary\)/.test(status) && /\.nx-sheet\.nx-l-ok \.nx-footer button\.nx-reconnect[\s\S]*?\{ --_bg: var\(--md-sys-color-surface-container-high\)/.test(status) && /\.nx-footer button\.nx-primary \{ --_bg: var\(--md-sys-color-primary\)/.test(status));
    ok('css: the buttons of the row are 48 dp; the old pseudo-element chip steps aside when the button is there', /\.nx-sheet \.nx-more button[\s\S]*?\{ --_h: 48px; \}/.test(status) && /\.bar \.title:has\(> \.nx-chip:not\(\[hidden\]\)\)::after \{ content: none/.test(skin));
    ok('css: what turns or beats has its reduced-motion twin (the dot of "Connecting…", the spinner of Reconnect)', /prefers-reduced-motion[^{]*\{[^}]*nx-chip::before \{ animation: none/.test(status) && /prefers-reduced-motion[^\n]*nx-spin:before \{ animation: none/.test(status));
  }

  // ---------------------------------------------------------------- what the other workstreams rely on
  {
    const env = await environment({ homes: [home([device({ reachable: true })])], net: NET, reachableDefault: true });
    ok('hooks: #nx-sheet is a dialog with a name; #nx-sheet-title, -explanation, -route, .nx-scrim exist', sheet(env).getAttribute('role') === 'dialog' && !!sheet(env).getAttribute('aria-label') && sheet(env).getAttribute('aria-modal') === 'true' &&
      ['nx-sheet-title', 'nx-sheet-explanation', 'nx-sheet-route'].every((id) => !!env.document.getElementById(id)) && !!env.document.querySelector('.nx-scrim'));
    ok('hooks: --nx-sub, --nx-dot and data-nx-status are still set (the fallback chip and verify-apk)', /--nx-sub/.test(SRC) && /--nx-dot/.test(SRC) && /data-nx-status/.test(SRC) && /Connecting to the accessory/.test(SRC));
  }

  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });
