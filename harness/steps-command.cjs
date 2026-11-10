// SCRIPT=steps-command.cjs  PART=A|B|C   (nx23 command: command feedback, Stop, a tap on an accessory that does not answer)
//
//   A  what a tap says: sending, sent (via cloud), no report, not sent / no answer, the extra buttons, the toast rules, the page of other commands   (I-03)
//   B  Stop is never dropped: Open, then Stop within 500 ms; double tap; Stop on an accessory that does not answer; keyboard-free geometry         (I-09)
//   C  the accessory does not answer: the cause and Reconnect in the line, the pad loses colour (Stop does not), a tap waits and says so          (I-04)
//
// The status line: the element .nx-line belongs to the layout workstream (patch-18). This script injects a THROWAWAY copy of it, compiled by Angular with exactly the bindings of the
// contract, so that the functions of nx-patch.js are tested through the real digest: it is a test aid, not a part of the app. It reserves the 48 px of the real one.
//
// CFG for A and B:  '{"secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]}'   (extra buttons)  and  "trustTimes":{"SilentMs":2000}  (a shorter wait for the report)
// CFG for C:        '{"reachable":false,"verifyFail":true,"statusFail":true,"activity":"error","secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"],"net":{"version":"nx-28","sdk":37,"wifi":true,"ssid":"GuestWifi","ip":"192.168.50.12","validated":true,"cellular":false,"vpn":false,"module":false,"defaultType":"wifi","route":"local","routeAgeSeconds":4}}'
// Run one process at a time: VIEW=360x640 COLOR_SCHEME=dark PART=A CFG='...' SCRIPT=steps-command.cjs node screens.cjs command-a '#/tabs/favorites'
const M = '00:0B:6C:AA:BB:CC', DETAIL = '#/tabs/favorites-device-detail/1/' + M, COMMANDS = '#/tabs/favorites-device-commands/1/' + M;

const BOX = 'html:root body[data-ng-app] .nx-line { box-sizing: border-box; height: 48px; overflow: hidden; margin: 0 16px 8px; padding: 4px 16px; border-radius: 16px; display: flex; align-items: center; ' +
  'font: 500 14px/20px var(--nx-font, sans-serif); color: var(--md-sys-color-on-surface-variant); flex: 0 0 auto; } .nx-line-text { flex: 1 1 auto; }';
const TEMPLATE = '<div class="nx-line" role="status" aria-live="polite" data-nx-kind="{{nxLineKind ? nxLineKind(data.device) : \'\'}}" data-nx-trust="{{nxTrust ? nxTrust(data.device) : \'\'}}" ' +
  'data-nx-unsure="{{nxUnsure && nxUnsure(data.device) ? \'1\' : \'\'}}"><span class="nx-line-text">{{nxLine ? nxLine(data.device) : \'\'}}</span>' +
  '<button type="button" class="nx-line-act" data-ng-if="nxLineAct && nxLineAct(data.device)" data-ng-click="nxLineDo(data.device)">{{nxLineAct(data.device)}}</button></div>';

async function injectLine(page) {
  await page.waitForSelector('.device-commands', { state: 'attached', timeout: 10000 });
  // nx23 qa (gate): on the merged build the real element is in the template (patch-18): nothing is injected, the real bindings are tested.
  // INJECT=1 forces the throwaway copy (a build without patch-18).
  if (!process.env.INJECT && await page.evaluate(() => !!document.querySelector('.nx-line'))) return;
  await page.evaluate(([css, tpl]) => {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const inj = angular.element(document.body).injector(), $compile = inj.get('$compile');
    const pad = document.querySelector('.device-commands'), row = pad.closest('.row.flex-3'), scope = angular.element(pad).scope();
    const el = $compile(tpl)(scope);
    row.parentNode.insertBefore(el[0], row);
    scope.$apply();
  }, [BOX, TEMPLATE]);
}
const state = (page) => page.evaluate(() => {
  // (Ionic keeps cached views: the line of the visible screen)
  const ls = Array.from(document.querySelectorAll('.nx-line')), l = ls.find((x) => x.closest('[nav-view="active"]')) || ls[0];
  if (!l) return null;
  const act = l.querySelector('.nx-line-act'), tx = l.querySelector('.nx-line-text'), rest = l.querySelector('.nx-pill, .nx-unknown, .nx-settled');
  const box = l.getBoundingClientRect(), want = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nx-line-h')) || 48;
  const txH = tx ? tx.getBoundingClientRect().height : 0;
  const inside = (e) => { if (!e) return true; const r = e.getBoundingClientRect(); return r.top >= box.top - 0.6 && r.bottom <= box.bottom + 0.6; };   // (the hit area of a button reaches 4 dp beyond the box on purpose: scrollHeight is no test)
  return { kind: l.getAttribute('data-nx-kind'), trust: l.getAttribute('data-nx-trust'), unsure: l.getAttribute('data-nx-unsure'), live: l.getAttribute('aria-live'), text: tx ? tx.textContent.trim() : '', rest: rest ? rest.textContent.replace(/\s+/g, ' ').trim() : '',
    act: act ? act.textContent.trim() : '', boxH: +box.height.toFixed(1), fits: Math.abs(box.height - want) <= 0.6 && inside(tx) && inside(act), lines: Math.round(txH / 20) };
});
const rect = (page, sel, nth) => page.evaluate(([s, n]) => { const e = document.querySelectorAll(s)[n || 0]; if (!e) return null; const b = e.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), left: +b.left.toFixed(1), right: +b.right.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; }, [sel, nth]);
const cmd = (page, re) => page.evaluate((r) => { const a = Array.from(document.querySelectorAll('.device-commands .command')).find((x) => new RegExp(r).test(x.textContent)); const b = a.getBoundingClientRect(); const c = getComputedStyle(a); return { top: +b.top.toFixed(1), h: +b.height.toFixed(1), filter: c.filter, opacity: c.opacity }; }, re);
const execs = (page) => page.evaluate(() => (window.__calls || []).filter((c) => /execute/.test(c.key)).map((c) => ({ k: c.key.replace('nhk.execute', '') + ':' + (c.args && c.args[2]), t: c.t })));
const calls = (page, re) => page.evaluate((r) => (window.__calls || []).filter((c) => new RegExp(r).test(c.key)).map((c) => ({ k: c.key, t: c.t })), re);
const hero = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.device-info .nx-state strong')).filter((e) => !e.classList.contains('ng-hide')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' / '));
// nx23 qa: the button of the line is pressed with a real tap, or with the keyboard (KEY=enter|space: the button is focused first, as Tab would do)
const activate = async (page) => { if (process.env.KEY) { await page.focus('.nx-line-act'); await page.keyboard.press(process.env.KEY === 'space' ? 'Space' : 'Enter'); } else await page.locator('.nx-line-act').tap(); };
const tapButton = (page, re, nth) => page.locator('.device-commands .command', { hasText: re }).nth(nth || 0).tap();

function reporter() {
  const r = { total: 0, failed: 0, widest: 0 };
  r.check = (name, cond, extra) => { r.total++; if (!cond) r.failed++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)))); };
  r.done = () => console.log('STEPS: ' + r.total + ' checks, ' + r.failed + ' failed');
  return r;
}
const pads = (page) => page.evaluate(() => { const pad = document.querySelector('.device-commands'); const t = (re) => { const a = Array.from(document.querySelectorAll('.device-commands .command')).find((x) => re.test(x.textContent)); return a ? +(a.getBoundingClientRect().top + pad.scrollTop).toFixed(1) : null; }; return { open: t(/Open/), stop: t(/Stop/) }; });   // (in the content of the pad: at 360x640 with extra buttons it scrolls, and a tap scrolls a button into view)

module.exports = async (page, { goto, wait, shot }) => {
  const part = String(process.env.PART || 'A').toUpperCase(), R = reporter();
  const seen = [];
  const st = async () => { const x = await state(page); if (x) seen.push(x); return x; };
  const NATIVE = (key, fn) => page.evaluate(([k, src]) => { window.__NATIVE[k] = eval('(' + src + ')'); }, [key, fn.toString()]);
  await page.evaluate(() => { document.addEventListener('touchstart', () => { window.__tapT = Date.now(); }, true); });
  await goto(DETAIL, part === 'C' ? 6500 : 4500);
  await injectLine(page);
  await wait(300);
  const base = await pads(page);
  const sameGeometry = async (what) => { const g = await pads(page); R.check('geometry: ' + what + ' (Open and Stop tops unchanged)', Math.abs(g.open - base.open) <= 0.5 && Math.abs(g.stop - base.stop) <= 0.5, [base, g]); };

  if (part === 'A') {
    R.check('the line is empty and neutral at rest', (await st()).kind === '' && (await st()).text === '', await st());
    // (a) the call takes 1.5 s: sending, then sent; the state report replaces it
    await NATIVE('nhk.executePrimaryCommand', function () { return { delay: 1500, then: {} }; });
    await tapButton(page, /Open/);
    await wait(250);
    let s = await st();
    R.check('0.2 s after the tap: busy, "Sending Open…"', s.kind === 'busy' && s.text === 'Sending Open\u2026', s);
    R.check('exactly one execute call', (await execs(page)).length === 1, await execs(page));
    await shot('a1-sending'); await sameGeometry('sending');
    await wait(1700);
    s = await st();
    R.check('after the call came back: ok, "Open sent hh:mm:ss"', s.kind === 'ok' && /^Open sent \d\d:\d\d:\d\d$/.test(s.text), s);
    await shot('a2-sent'); await sameGeometry('sent');
    await wait(2300);   // SilentMs 2000 (trustTimes): the gate should be moving and nothing was reported
    s = await st();
    R.check('no report of the state: warn "No report from the gate yet. Check it."', s.kind === 'warn' && s.text === 'No report from the gate yet. Check it.', s);
    await shot('a3-silence'); await sameGeometry('no report');
    await page.evaluate(() => { const e = new Event('newDeviceState'); e.mac = '00:0B:6C:AA:BB:CC'; e.deviceId = '1'; e.state = 'opening'; e.obstruct = '0'; window.dispatchEvent(e); });
    await wait(400);
    s = await st();
    R.check('the state is reported: the line is empty, the hero says Opening', s.text === '' && /Opening/.test(await hero(page)), [s, await hero(page)]);
    await shot('a4-reported');
    // (b) via the cloud
    await wait(700);
    await page.evaluate(() => { window.__netState0 = window.__NATIVE['Nx.netState']; window.__NATIVE['Nx.netState'] = () => ({ version: 'nx-28', sdk: 37, wifi: false, ssid: '', ip: '', validated: false, cellular: true, vpn: false, module: false, defaultType: 'cell', route: 'cloud', routeAgeSeconds: 3 }); NX.refresh(); });
    await wait(600);
    await NATIVE('nhk.executePrimaryCommand', function () { return { delay: 300, then: {} }; });
    await tapButton(page, /Close/);
    await wait(800);
    s = await st();
    R.check('via the cloud the line says so', /^Close sent \d\d:\d\d:\d\d \u00b7 via cloud$/.test(s.text), s);
    await shot('a5-cloud');
    await page.evaluate(() => { window.__NATIVE['Nx.netState'] = window.__netState0; NX.refresh(); });
    // (c) failures: no answer (it may have arrived), refused, no connection
    await wait(700);
    await NATIVE('nhk.executePrimaryCommand', function () { return { fail: { code: 'TIMEOUT' } }; });
    await tapButton(page, /Close/);
    await wait(700);
    s = await st();
    R.check('TIMEOUT: bad "No answer to Close. It may have arrived: check the gate." (no button: the words need the two lines)', s.kind === 'bad' && s.text === 'No answer to Close. It may have arrived: check the gate.' && s.act === '' && s.fits, s);
    R.check('the app\'s own popup is still the app\'s (it is not held here)', await page.evaluate(() => document.querySelectorAll('.popup').length) === 1);
    R.check('a failure is an assertive live region (it is read at once), the line of a success was polite', s.live === 'assertive' && seen.filter((x) => x.kind !== 'bad' && !(x.kind === '' && x.text)).every((x) => x.live === 'polite'), [s.live, seen.map((x) => x.kind + ':' + x.live)]);
    await shot('a6-no-answer');
    await page.locator('.popup-buttons button').first().tap();
    await wait(700);
    await NATIVE('nhk.executePrimaryCommand', function () { return { fail: { code: 5 } }; });
    await tapButton(page, /Close/);
    await wait(700);
    s = await st();
    R.check('code 5: "Command not allowed. Close not sent." and no Reconnect', s.kind === 'bad' && s.text === 'Command not allowed. Close not sent.' && s.act === '', s);
    await page.locator('.popup-buttons button').first().tap();
    await wait(700);
    await NATIVE('nhk.executePrimaryCommand', function () { return { fail: { code: 'NOT_CONNECTED' } }; });
    await tapButton(page, /Close/);
    await wait(700);
    s = await st();
    R.check('NOT_CONNECTED: "No connection to the accessory. Close not sent." with Reconnect', s.kind === 'bad' && s.text === 'No connection to the accessory. Close not sent.' && s.act === 'Reconnect', s);
    await page.locator('.popup-buttons button').first().tap();
    await wait(500);
    await NATIVE('nhk.executePrimaryCommand', function () { return { delay: 300, then: {} }; });
    await tapButton(page, /Open/);
    await wait(150);
    R.check('a following tap works and replaces the failure', (await st()).kind === 'busy' && /^Sending Open/.test((await st()).text), await st());
    // (d) the extra buttons: no toast on the pad, an honest line
    await wait(700);
    await NATIVE('nhk.executeSecondaryCommand', function () { return { delay: 400, then: {} }; });
    await page.locator('.nx-extras .command', { hasText: 'Open and Block' }).first().tap();
    await wait(200);
    R.check('an extra button: busy "Sending Open and Block…" and no toast', (await st()).text === 'Sending Open and Block\u2026' && (await page.evaluate(() => document.querySelectorAll('.nx-snack').length)) === 0, await st());
    await wait(600);
    s = await st();
    R.check('an extra button: "Open and Block sent hh:mm:ss" (nothing before it was sent)', /^Open and Block sent \d\d:\d\d:\d\d$/.test(s.text) && (await execs(page)).filter((e) => /Secondary/.test(e.k)).length === 1, [s, await execs(page)]);
    await shot('a7-extra');
    // (e) toasts: they take no tap and stay away from the pad
    await page.evaluate(() => NX.checkWaitingUsers(true));
    await wait(500);
    const toast = await page.evaluate(() => { const e = document.querySelector('.nx-snack'); if (!e) return null; const b = e.getBoundingClientRect(); return { pe: getComputedStyle(e).pointerEvents, at: e.getAttribute('data-nx-at'), top: b.top, bottom: b.bottom, text: e.textContent }; });
    const cmds = await page.evaluate(() => Array.from(document.querySelectorAll('.device-commands .command, .device-commands .nx-extra-edit')).map((a) => { const b = a.getBoundingClientRect(); return [b.top, b.bottom]; }));
    R.check('a toast on the accessory screen: pointer-events none, under the header, off the pad', toast && toast.pe === 'none' && toast.at === 'top' && cmds.every((c) => toast.bottom <= c[0] || toast.top >= c[1]), [toast, cmds]);
    await shot('a8-toast');
    await wait(3600);
    // (f) the page of other commands has no line: the messages are toasts, a failure stays longer
    await goto(COMMANDS, 2500);
    await NATIVE('nhk.executeSecondaryCommand', function () { return { delay: 200, then: {} }; });
    await page.locator('.item.command', { hasText: 'Release and Close' }).first().tap();
    await wait(700);
    let t2 = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-snack')).map((e) => e.textContent));
    R.check('other commands: "Release and Close sent hh:mm:ss" as a toast', t2.length === 1 && /^Release and Close sent \d\d:\d\d:\d\d$/.test(t2[0]), t2);
    await shot('a9-other-commands');
    await wait(3600);
    await NATIVE('nhk.executeSecondaryCommand', function () { return { fail: { code: 'TIMEOUT' } }; });
    await page.locator('.item.command', { hasText: 'Open and Block' }).first().tap();
    await wait(700);
    t2 = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-snack')).map((e) => e.textContent));
    R.check('other commands: a failure is a toast with the same words', t2.length === 1 && t2[0] === 'No answer to Open and Block. It may have arrived: check the gate.', t2);
    await wait(4500);
    R.check('... and it is still there after 5 s (9 s for a failure)', (await page.evaluate(() => document.querySelectorAll('.nx-snack').length)) === 1);
  }

  if (part === 'B') {
    const exec = (re) => execs(page).then((a) => a.filter((e) => !re || re.test(e.k)));
    const stopAfterOpen = async (gap, label) => {
      await page.evaluate(() => { window.__calls = []; });
      await wait(700);
      await tapButton(page, /Open/);
      await wait(gap);
      await tapButton(page, /Stop/);
      await wait(900);
      const e = await exec(); const tap = await page.evaluate(() => window.__tapT);
      R.check('Open, then Stop ' + label + ' later: both reach the accessory (' + e.map((x) => x.k).join(', ') + ')', e.map((x) => x.k).join() === 'PrimaryCommand:open,PrimaryCommand:stop', e);
      const stop = e.find((x) => /stop/.test(x.k));
      R.check('... and Stop leaves within 100 ms of its tap (' + (stop ? stop.t - tap : '?') + ' ms)', stop && stop.t - tap >= 0 && stop.t - tap <= 100, [stop && stop.t, tap]);
    };
    await stopAfterOpen(120, '120 ms');
    await stopAfterOpen(250, '250 ms');
    await stopAfterOpen(450, '450 ms');
    await shot('b1-stop-after-open');
    await page.evaluate(() => { window.__calls = []; });
    await wait(900);
    await tapButton(page, /Open/); await wait(900); await tapButton(page, /Stop/); await wait(700);
    R.check('Open, then Stop 900 ms later (the app\'s own path): one Stop', (await exec(/stop/)).length === 1, await exec());
    R.check('... and the line says what happened to it', /^Stop sent \d\d:\d\d:\d\d$/.test((await st()).text), await st());
    // Open, then Close within 500 ms: Close is not sent, and the line says so
    await wait(700);
    await page.evaluate(() => { window.__calls = []; });
    await tapButton(page, /Open/); await wait(250); await tapButton(page, /Close/); await wait(500);
    let s = await st();
    R.check('Open, then Close 250 ms later: Close is not sent and the line says so', (await exec()).map((x) => x.k).join() === 'PrimaryCommand:open' && s.kind === 'warn' && s.text === 'Too soon after the last command. Close not sent: tap again.', [await exec(), s]);
    await shot('b2-dropped'); await sameGeometry('dropped');
    // a double tap on Stop: one call
    await wait(900);
    await page.evaluate(() => { window.__calls = []; });
    const sr = await rect(page, '.device-commands .command', 2);
    const sc = await page.evaluate(() => { const a = Array.from(document.querySelectorAll('.device-commands .command')).find((x) => /Stop/.test(x.textContent)); const b = a.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
    await page.touchscreen.tap(sc[0], sc[1]); await page.touchscreen.tap(sc[0], sc[1]); await wait(800);
    R.check('a double tap on Stop (within about 100 ms): one Stop', (await exec(/stop/)).length === 1, await exec());
    // a failure of Stop: it is said loudly, the pad still works
    await wait(900);
    await NATIVE('nhk.executePrimaryCommand', function () { return { fail: { code: 'TIMEOUT' } }; });
    await tapButton(page, /Stop/); await wait(700);
    s = await st();
    R.check('Stop fails with a timeout: bad "Stop not confirmed. The gate may move: use the remote." (and the app\'s popup is the app\'s)', s.kind === 'bad' && s.text === 'Stop not confirmed. The gate may move: use the remote.', s);
    await shot('b3-stop-failed');
    await page.locator('.popup-buttons button').first().tap();
    await wait(500);
    const g = await cmd(page, 'Stop');
    R.check('Stop is never dimmed: filter none, opacity 1', g.filter === 'none' && g.opacity === '1', g);
    await sameGeometry('Stop failed');
  }

  if (part === 'C') {
    let s = await st();
    R.check('the accessory does not answer: bad, assertive, the cause, and Reconnect', s.kind === 'bad' && s.live === 'assertive' && s.unsure === '1' && s.act === 'Reconnect' && s.text === 'The phone is on another Wi-Fi than the accessory.', s);
    R.check('the hero says "Not reachable" (nx23 copy: the app\'s "Not usable")', /Not (reachable|usable)/.test(await hero(page)), await hero(page));
    const ar = await rect(page, '.nx-line-act');
    R.check('Reconnect is at least 48 x 48 dp with its hit area', ar && ar.h + 8 >= 48 && ar.w >= 48, ar);
    const open = await cmd(page, 'Open'), close = await cmd(page, 'Close'), stop = await cmd(page, 'Stop');
    R.check('Open and Close lose colour (saturate .3), Stop does not', /saturate\(0\.3\)/.test(open.filter) && /saturate\(0\.3\)/.test(close.filter) && stop.filter === 'none' && stop.opacity === '1', [open, close, stop]);
    const extra = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-extras .command')).map((a) => getComputedStyle(a).filter));
    R.check('the extra buttons lose colour too', extra.length > 0 && extra.every((f) => /saturate\(0\.3\)/.test(f)), extra);
    await shot('c1-unreachable');
    // contrast of the labels of the dimmed buttons in every palette, light and dark
    const worst = await page.evaluate(() => {
      const root = document.documentElement, pals = ['midnight', 'nice', 'graphite', 'paper', 'violet', 'pine', 'ember'];
      const parse = (c) => { const p = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2] }; };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      const sat = (c, s) => { const cl = (v) => Math.max(0, Math.min(255, v)); return { r: cl((0.213 + 0.787 * s) * c.r + (0.715 - 0.715 * s) * c.g + (0.072 - 0.072 * s) * c.b), g: cl((0.213 - 0.213 * s) * c.r + (0.715 + 0.285 * s) * c.g + (0.072 - 0.072 * s) * c.b), b: cl((0.213 - 0.213 * s) * c.r + (0.715 - 0.715 * s) * c.g + (0.072 + 0.928 * s) * c.b) }; };
      let worst = { v: 99 };
      for (const theme of ['light', 'dark']) for (const p of pals) {
        root.setAttribute('data-nx-theme', theme); if (p === 'midnight') root.removeAttribute('data-nx-palette'); else root.setAttribute('data-nx-palette', p);
        for (const a of document.querySelectorAll('.device-commands .command')) {
          if (/Stop/.test(a.textContent)) continue;
          const cs = getComputedStyle(a), v = ratio(sat(parse(cs.color), 0.3), sat(parse(cs.backgroundColor), 0.3));
          if (v < worst.v) worst = { v: +v.toFixed(2), at: theme + '/' + p + '/' + a.textContent.trim() };
        }
      }
      root.removeAttribute('data-nx-theme'); root.removeAttribute('data-nx-palette');
      return worst;
    });
    R.check('the dimmed labels keep 4.5:1 in every palette, light and dark (worst ' + worst.v + ' at ' + worst.at + ')', worst.v >= 4.5, worst);
    // a tap while it does not answer: waiting, then "not sent"; the app's own check is the only call
    await page.evaluate(() => { window.__calls = []; window.__NATIVE['nhk.verify'] = () => ({ delay: 1800, then: { fail: 'timeout' } }); });
    await tapButton(page, /Open/);
    await wait(500);
    s = await st();
    R.check('a tap on Open: "Waiting for the accessory. Open is not sent if it stays silent."', s.kind === 'busy' && s.text === 'Waiting for the accessory. Open is not sent if it stays silent.', s);
    R.check('... one check of the accessory, nothing was sent', (await calls(page, 'nhk.verify')).length === 1 && (await execs(page)).length === 0, [await calls(page, 'nhk.verify'), await execs(page)]);
    await shot('c2-waiting'); await sameGeometry('waiting');
    await wait(2000);
    s = await st();
    R.check('the check failed: bad "The accessory did not answer. Open not sent." with Reconnect', s.kind === 'bad' && s.text === 'The accessory did not answer. Open not sent.' && s.act === 'Reconnect', s);
    await shot('c3-not-sent'); await sameGeometry('not sent');
    // Reconnect from that line: no sheet over the pad, "Connecting…", then the result
    await page.evaluate(() => { window.__calls = []; window.__NATIVE['nhk.verify'] = () => ({ delay: 1200, then: { fail: 'timeout' } }); });
    await activate(page);
    await wait(600);
    s = await st();
    R.check('Reconnect: busy "Connecting to the accessory…", one Nx.reconnect, no sheet over the pad', s.kind === 'busy' && /^Connecting to the accessory/.test(s.text) && s.act === '' && (await calls(page, 'Nx.reconnect')).length === 1 &&
      (await page.evaluate(() => !document.querySelector('.nx-sheet.nx-open'))), [s, await calls(page, 'Nx.reconnect')]);
    R.check('... and the chip says it too ("Connecting…" since the status workstream)', /Connecting/.test(await page.evaluate(() => document.documentElement.style.getPropertyValue('--nx-sub'))), await page.evaluate(() => document.documentElement.style.getPropertyValue('--nx-sub')));
    await shot('c4-connecting');
    await wait(4600);
    s = await st();
    R.check('it did not help: "Still no answer. Tap the status for details." (and Reconnect again)', s.kind === 'bad' && s.text === 'Still no answer. Tap the status for details.' && s.act === 'Reconnect', s);
    await shot('c5-still-no-answer');
    // the same tap when the check succeeds after 1.5 s: the command leaves then
    await page.evaluate(() => { window.__calls = []; window.__NATIVE['nhk.verify'] = () => ({ delay: 1500, then: { isAdmin: true, isUser: true } }); window.__NATIVE['nhk.executePrimaryCommand'] = () => ({ delay: 400, then: {} }); });
    await tapButton(page, /Open/);
    await wait(400);
    R.check('waiting again', (await st()).kind === 'busy' && /^Waiting for the accessory/.test((await st()).text), await st());
    await wait(1400);
    s = await st();
    R.check('the check answered: "Sending Open…" and the command goes out once', s.text === 'Sending Open\u2026' && (await execs(page)).length === 1, [s, await execs(page)]);
    await wait(600);
    R.check('... then "Open sent hh:mm:ss"', /^Open sent \d\d:\d\d:\d\d$/.test((await st()).text), await st());
    // the app's flag still says "not reachable", but the accessory has just answered: the line does not claim that it does not
    await page.evaluate(() => { const e = new Event('newDeviceState'); e.mac = '00:0B:6C:AA:BB:CC'; e.deviceId = '1'; e.state = 'opening'; e.obstruct = '0'; window.dispatchEvent(e); });
    await wait(500);
    s = await st();
    R.check('the accessory answered a moment ago: neutral line, the pad has its colour back', s.kind === '' && s.text === 'The accessory answered a moment ago.' && !s.unsure, s);
    await shot('c6-answered');
  }
  const tooBig = seen.filter((x) => !x.fits || x.lines > 2);
  R.check('every message fits the two lines of the reserved row at this width (' + seen.length + ' states seen)', tooBig.length === 0, tooBig.map((x) => x.text + ' [' + x.lines + ' lines, ' + (x.act || 'no action') + ']'));
  R.done();
};
module.exports.helpers = { activate, injectLine, state, rect, cmd, execs, calls, hero, reporter, pads, tapButton, DETAIL, COMMANDS, M };
