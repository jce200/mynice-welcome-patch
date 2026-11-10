// nx23 status: steps for the status chip and the status sheet (the connection sheet).
//
//   cd harness
//   CFG="$(node -e "console.log(JSON.stringify(require('./steps-sheet.cjs').STATES.vpn))")" STEP=open WAIT=6500 VIEW=360x640 \
//     SCRIPT=steps-sheet.cjs node screens.cjs status-vpn '#/tabs/favorites'
//
// STEP (what the script does after the route is open; the pictures are named after it):
//   open        taps the chip (a real touch), waits for the measurement, takes 'sheet' (the first view) and 'sheet-end' (scrolled to the end); prints the
//               numbers: where the diagram ends and the footer begins, the size of every button, the words of the verdict
//   reopen      I-06: taps the chip, dismisses the sheet at +0.9 s (a tap on the scrim) while it measures, waits until the measurement is over and says
//               whether the sheet stayed closed and what a tap on Open, Stop and Close would hit (the page, not the sheet)
//   reconnect   I-06/I-23: opens, waits for the verdict, taps Reconnect, takes 'reconnecting', dismisses at +0.5 s, waits, says whether it stayed closed
//   busy        takes 'busy' one second after the tap (the check takes 6 s in the state `busy`): "Checking…", the diagram where it will stay, Reconnect dimmed
//   reconnecting  opens, waits for the verdict, taps Reconnect and takes 'reconnecting' half a second later: the old verdict is gone, the button turns
//   requests    I-23: somebody waits for approval (CFG.waiting): taps "Check requests" and says whether the sheet is gone and the popup is on top
// States for CFG are in module.exports.STATES (the invented Wi-Fi HomeWifi, accessory AABBCC). Failing states need WAIT of 6500 ms or more before the chip says
// "Not reachable" (the app checks three times, 2.5 s apart).
const NET = { version: 'nx-23', sdk: 37, wifi: true, ssid: 'HomeWifi', ip: '192.168.1.172', validated: true, cellular: false, vpn: false, module: false, defaultType: 'wifi', route: 'local', routeAgeSeconds: 4 };
const CLOUD_OK = { ok: true, dns: '63.182.6.157', dnsMs: 12, tcpMs: 60 };
const NONET = Object.assign({}, NET, { wifi: false, ssid: '', ip: '', cellular: false, vpn: false, defaultType: 'none', route: undefined });
const STATES = {
  online: {},
  checking: { verifyDelay: 60000, reachable: false },
  setup: { net: Object.assign({}, NET, { module: true, ssid: 'NiceIT4WIFIAABBCC' }) },
  // the app is connected through the Nice cloud (away from home, mobile data and a VPN); the direct probe fails by design, and says nothing about why
  cloud: { net: Object.assign({}, NET, { wifi: false, ssid: '', ip: '10.8.0.5', cellular: true, vpn: true, defaultType: 'vpn', route: 'cloud', routeAgeSeconds: 3 }),
    probe: { ok: false, tcpMs: null, bound: false, cloud: CLOUD_OK } },
  // the same, with an error in the probe (what the native layer says)
  cloudErr: { net: Object.assign({}, NET, { wifi: false, ssid: '', ip: '10.8.0.5', cellular: true, vpn: true, defaultType: 'vpn', route: 'cloud', routeAgeSeconds: 3 }),
    probe: { ok: false, tcpMs: null, error: 'ETIMEDOUT', bound: false, std: { ok: false, error: 'ETIMEDOUT' }, cloud: CLOUD_OK } },
  // not reachable on another Wi-Fi (a guest network)
  guest: { verifyFail: true, net: Object.assign({}, NET, { ssid: 'GuestWifi' }), probe: { ok: false, tcpMs: null, bound: true, cloud: { ok: false } } },
  // not reachable, on the Wi-Fi with mobile data also on
  mobile: { verifyFail: true, net: Object.assign({}, NET, { cellular: true }), probe: { ok: false, tcpMs: null, error: 'ETIMEDOUT', bound: true, cloud: { ok: false } } },
  // a VPN with a route into its tunnel: the accessory is not reached locally, the Nice cloud is
  vpn: { verifyFail: true, net: Object.assign({}, NET, { vpn: true, vpnRoute: '192.168.1.0/24 via tun0', defaultType: 'wifi' }),
    probe: { ok: false, tcpMs: null, error: 'ETIMEDOUT', bound: true, std: { ok: false, error: 'ETIMEDOUT' }, cloud: { ok: true, dns: '63.182.6.157', dnsMs: 12, tcpMs: 20 } } },
  // the accessory takes the connection but not the secure handshake
  hung: { verifyFail: true, probe: { ok: false, tcpMs: 35, error: 'TLS_TIMEOUT', bound: true, cloud: { ok: false } } },
  // no network at all: the app's flag says reachable but nothing carries it ("No Wi-Fi"); with verifyFail the check fails too ("Not reachable . no Wi-Fi")
  nowifi: { net: NONET, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: false, dnsError: 'UnknownHostException' } } },
  nonet: { verifyFail: true, net: NONET, probe: { ok: false, error: 'NO_WIFI', cloud: { ok: false, dnsError: 'UnknownHostException' } } },
  // the check of the app takes 6 s (to look at the sheet while it measures)
  busy: { verifyDelay: 6000 },
  // somebody waits for approval (for the "Check requests" step)
  waiting: { waiting: [{ id: 2, username: 'Home assistant' }] }
};

module.exports = async function (page, { wait, shot }) {
  const step = process.env.STEP || 'open';
  const out = {};
  const hit = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e ? (e.closest('#nx-sheet') ? 'SHEET' : (e.id || e.className || e.tagName)) : null;
  }, sel);
  const numbers = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s), r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
    const sheet = q('#nx-sheet'), route = q('#nx-sheet-route'), footer = q('#nx-sheet .nx-footer'), todo = q('#nx-sheet-todo');
    return { open: !!sheet && sheet.classList.contains('nx-open'), display: sheet && sheet.style.display, title: q('#nx-sheet-title').textContent, verdict: q('#nx-sheet-explanation').textContent,
      verdictWords: (q('#nx-sheet-explanation').textContent.match(/\S+/g) || []).length, verdictPx: Math.round(q('#nx-sheet-explanation').getBoundingClientRect().height),
      todo: todo ? todo.textContent : '', route: r(route), footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null, routeBottom: route ? Math.round(route.getBoundingClientRect().bottom) : null,
      diagramFits: !!(route && footer) && route.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 0.5, scrollHeight: sheet && sheet.scrollHeight, clientHeight: sheet && sheet.clientHeight,
      buttons: Array.from(document.querySelectorAll('#nx-sheet button')).map((b) => b.textContent + ':' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height) + (b.disabled ? ':disabled' : '')),
      facts: Array.from(document.querySelectorAll('#nx-sheet-facts .nx-fact')).map((f) => f.textContent.replace(/\s+/g, ' ').trim()),
      links: Array.from(document.querySelectorAll('#nx-sheet-route .nx-link small')).map((l) => l.textContent + (l.scrollWidth > l.clientWidth + 1 ? ' [CUT]' : '')), nodes: Array.from(document.querySelectorAll('#nx-sheet-route .nx-node')).map((n) => n.textContent.trim().replace(/\s+/g, ' ')) };
  });
  const chip = page.locator('.nx-chip:visible').first();
  out.chip = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('.nx-chip')).filter((x) => x.getBoundingClientRect().width > 0); const x = c[0]; const b = x && x.getBoundingClientRect(); return { visible: c.length, text: x && x.textContent, label: x && x.getAttribute('aria-label'), box: b && [b.left, b.top, b.width, b.height].map(Math.round) }; });
  if (step === 'open') {
    await chip.tap(); await wait(Number(process.env.OPENWAIT || 8000));
    await shot('sheet');
    out.sheet = await numbers();
    await page.evaluate(() => { const s = document.getElementById('nx-sheet'); s.scrollTop = s.scrollHeight; }); await wait(300); await shot('sheet-end');
  } else if (step === 'reopen') {
    await chip.tap(); await wait(900); await shot('1-open-measuring');
    out.measuring = await numbers();
    await page.touchscreen.tap(180, 60); await wait(700); await shot('2-dismissed');       // the scrim above the sheet
    out.dismissed = await numbers();
    await wait(Number(process.env.OPENWAIT || 8000)); await shot('3-after-measurement');
    out.after = await numbers();
    // what a tap on Open, Close and Stop would hit now: the page (good) or the sheet or its scrim (the sheet came back uninvited)
    out.hits = await page.evaluate(() => Array.from(document.querySelectorAll('a.command')).filter((e) => e.getBoundingClientRect().width > 0).map((e) => {
      const r = e.getBoundingClientRect(), x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return (e.textContent || e.className).trim().slice(0, 10) + ':' + (x ? (x.closest('#nx-sheet') ? 'SHEET' : x.closest('.nx-scrim') ? 'SCRIM' : 'page') : 'none');
    }));
  } else if (step === 'reconnect') {
    await chip.tap(); await wait(Number(process.env.OPENWAIT || 8000)); await shot('1-verdict'); out.verdict = await numbers();
    await page.locator('.nx-footer button.nx-reconnect').tap(); await wait(400); await shot('2-reconnecting'); out.reconnecting = await numbers();
    await page.touchscreen.tap(180, 60); await wait(600);
    out.dismissed = await numbers();
    await wait(Number(process.env.OPENWAIT || 9000)); await shot('3-after'); out.after = await numbers();
  } else if (step === 'busy') {
    await chip.tap(); await wait(1000); await shot('busy'); out.sheet = await numbers();
  } else if (step === 'reconnecting') {
    await chip.tap(); await wait(Number(process.env.OPENWAIT || 8000));
    await page.locator('.nx-footer button.nx-reconnect').tap(); await wait(500); await shot('reconnecting'); out.sheet = await numbers();
  } else if (step === 'requests') {
    await chip.tap(); await wait(Number(process.env.OPENWAIT || 8000));
    await page.locator('.nx-more button', { hasText: 'Check requests' }).tap(); await wait(1500); await shot('1-after-tap');
    out.after = await page.evaluate(() => { const p = document.querySelector('.popup-container.active .popup, .popup-container .popup'); const allow = Array.from(document.querySelectorAll('.popup button')).find((b) => /Allow/.test(b.textContent));
      const r = allow && allow.getBoundingClientRect(); const e = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { sheetOpen: document.getElementById('nx-sheet').classList.contains('nx-open'), sheetDisplay: document.getElementById('nx-sheet').style.display, popup: !!p, popupOpenClass: document.body.classList.contains('popup-open'), allowHit: e ? (e.closest('#nx-sheet') ? 'SHEET' : e.closest('.popup') ? 'POPUP' : e.className) : null }; });
    await wait(600);
  }
  console.log('STEP ' + step + ' ' + JSON.stringify(out, null, 1));
};
module.exports.STATES = STATES;
