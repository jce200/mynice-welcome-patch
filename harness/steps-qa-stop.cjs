// nx23 qa (gate + command): Stop on the MERGED build in the three modes of STOP_BYPASS ('guard' default, 'always', 'off'). Prints what reaches the (simulated) accessory and when.
//   PART=S  an accessory that answers: Open then Stop at +120/+250/+450 ms, a double tap, Stop after Stop, Stop then Open, no confirmation / popup after a tap
//   PART=U  the app calls the accessory "not usable" (its stored flag, the check takes 4 s): Stop at 1.5 s after the start, then a check that fails
//   PART=V  never covered: a toast, the snack of the pairing request, the line, the dimmed pad: what is on top of Stop (elementFromPoint at five points) and its look in each state
//   STOPMODE is only a label here: the mode itself is set by CFG '{"stopBypass":"always"}'
//   VIEW=360x640 COLOR_SCHEME=dark PART=S CFG='{"stopBypass":"guard","secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]}' SCRIPT=steps-qa-stop.cjs node screens.cjs qa-gate-stop-s '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { state, execs, calls, hero, reporter, tapButton, DETAIL } = H;
const stopRect = (page) => page.evaluate(() => { const a = Array.from(document.querySelectorAll('[nav-view="active"] .device-commands .command')).find((x) => /Stop/.test(x.textContent)); const b = a.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
// what is topmost at five points of Stop (its centre and four points 8 px inside the corners): Stop itself (or something inside it) must be, everywhere
const covered = (page) => page.evaluate(() => {
  const stop = Array.from(document.querySelectorAll('[nav-view="active"] .device-commands .command')).find((x) => /Stop/.test(x.textContent)), b = stop.getBoundingClientRect(), out = [];
  [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]].forEach(([fx, fy]) => {
    const x = b.left + b.width * fx, y = b.top + b.height * fy, el = document.elementFromPoint(x, y);
    if (!el || !(el === stop || stop.contains(el))) out.push({ at: [Math.round(x), Math.round(y)], top: el ? (el.tagName + '.' + String(el.className).slice(0, 40)) : null });
  });
  return out;
});
const stopLook = (page) => page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('[nav-view="active"] .device-commands .command')).find((x) => /Stop/.test(x.textContent)), c = getComputedStyle(a);
  return { bg: c.backgroundColor, fg: c.color, shadow: c.boxShadow.slice(0, 60), filter: c.filter, opacity: c.opacity };
});

module.exports = async (page, { goto, wait, shot }) => {
  const part = String(process.env.PART || 'S').toUpperCase(), R = reporter();
  const mode = await page.evaluate(() => window.__nxStopBypass || 'guard');
  console.log('MODE ' + mode + ' PART ' + part);
  await page.evaluate(() => { document.addEventListener('touchstart', () => { window.__tapT = Date.now(); }, true); });
  const exec = () => execs(page);
  const keys = async () => (await exec()).map((x) => x.k.replace('PrimaryCommand:', '').replace('SecondaryCommand:', 'sec:')).join(',');

  if (part === 'S') {
    await goto(DETAIL, 4500);
    for (const gap of [120, 250, 450]) {
      await page.evaluate(() => { window.__calls = []; });
      await wait(900);
      await tapButton(page, /Open/); await wait(gap); await tapButton(page, /Stop/); await wait(700);
      const k = await keys(), tap = await page.evaluate(() => window.__tapT), stop = (await exec()).find((e) => /stop/.test(e.k));
      console.log('RESULT mode=' + mode + ' Open then Stop +' + gap + ' ms: calls [' + k + ']' + (stop ? ' stop left ' + (stop.t - tap) + ' ms after its tap' : ' (no stop call)'));
      if (mode === 'off') R.check('off: ' + gap + ' ms: Stop is the app\'s own (dropped inside 500 ms: the taps are about 70 ms longer apart than the gap), and the line says so', gap < 400 ? (k === 'open' && /^Too soon after the last command\. Stop not sent: tap again\.$/.test((await state(page)).text)) : true, [k, await state(page)]);   // (450 ms + the time of the tap: the app's own 500 ms may have passed: either is fine)
      else R.check(mode + ': Open then Stop ' + gap + ' ms later: both reach the accessory, Stop within 100 ms of its tap', k === 'open,stop' && stop && stop.t - tap <= 100, [k, stop && stop.t - tap]);
    }
    // double tap on Stop
    await wait(900); await page.evaluate(() => { window.__calls = []; });
    const r = await stopRect(page), cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
    await page.touchscreen.tap(cx, cy); await page.touchscreen.tap(cx, cy); await wait(700);
    R.check(mode + ': a double tap on Stop is one Stop', (await exec()).filter((e) => /stop/.test(e.k)).length === 1, await keys());
    // Stop after Stop 300 ms later (a decision, not a double tap)
    await wait(900); await page.evaluate(() => { window.__calls = []; });
    await tapButton(page, /Stop/); await wait(300); await tapButton(page, /Stop/); await wait(700);
    const two = (await exec()).filter((e) => /stop/.test(e.k)).length;
    console.log('RESULT mode=' + mode + ' Stop, then Stop 300 ms later: ' + two + ' Stop call(s)');
    R.check(mode + ': a second Stop 300 ms after the first', mode === 'off' ? two === 1 : two === 2, two);
    // Stop, then Open at +100 ms: does the guard of the app protect the next tap?
    await wait(900); await page.evaluate(() => { window.__calls = []; });
    await tapButton(page, /Stop/); await wait(100); await tapButton(page, /Open/); await wait(700);
    const k2 = await keys();
    console.log('RESULT mode=' + mode + ' Stop, then Open 100 ms later: calls [' + k2 + '] (a Stop that goes through the app\'s runCommand starts its guard of 500 ms)');
    // no confirmation, no popup, nothing between the tap and the call
    await wait(900); await page.evaluate(() => { window.__calls = []; });
    await tapButton(page, /Stop/); await wait(150);
    const shown = () => page.evaluate(() => Array.from(document.querySelectorAll('.popup-container, .popup, [role=dialog], .nx-scrim, .nx-snack')).filter((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none' && getComputedStyle(e).opacity !== '0').map((e) => e.className));
    R.check(mode + ': no confirmation: no popup, no sheet, no dialog, no scrim after a tap on Stop (visible ones: ' + JSON.stringify(await shown()) + ')', (await shown()).filter((c) => !/nx-snack/.test(c)).length === 0, await shown());
    R.check(mode + ': ... and the Stop call is already there', (await exec()).filter((e) => /stop/.test(e.k)).length === 1);
  }

  if (part === 'U') {
    // the state after a resume: the app has marked the accessory "not reachable" and its check takes a while (UCHECK ms, answer UANSWER = ok|fail)
    await goto(DETAIL, 3000);
    const uans = process.env.UANSWER || 'ok', uchk = Number(process.env.UCHECK || 4000);
    await page.evaluate(([ans, ms]) => {
      const inj = angular.element(document.body).injector(), HS = inj.get('HomeService');
      window.__NATIVE['nhk.verify'] = () => ({ delay: ms, then: ans === 'ok' ? { isAdmin: true, isUser: true } : { fail: 'timeout' } });
      HS.homes[0].devices[0].reachable = false;
      inj.get('$rootScope').$apply();
      window.__calls = [];
    }, [uans, uchk]);
    await wait(700);
    const look = await stopLook(page), unusable = await hero(page);
    console.log('STATE before the tap: "' + unusable + '", line ' + JSON.stringify((await state(page)).text) + ', Stop solid ' + (look.bg));
    await tapButton(page, /Stop/);
    const tap = await page.evaluate(() => window.__tapT);
    await wait(400);
    const l1 = (await state(page)).text;
    await wait(uchk + 2500);
    const stop = (await exec()).find((e) => /stop/.test(e.k));
    console.log('RESULT mode=' + mode + ' check=' + uans + '/' + uchk + ' ms: Stop on an accessory the app calls not usable: ' + (stop ? 'left ' + (stop.t - tap) + ' ms after the tap' : 'NEVER sent') + ', check calls ' + (await calls(page, 'nhk.verify')).length + ', calls [' + (await keys()) + '], line at 0.4 s ' + JSON.stringify(l1) + ', at the end ' + JSON.stringify((await state(page)).text));
    R.check('Stop is not dimmed or marked while the pad is dimmed: filter none, opacity 1', (await stopLook(page)).filter === 'none' && (await stopLook(page)).opacity === '1', await stopLook(page));
  }

  if (part === 'V') {
    await goto(DETAIL, 4500);
    R.check('at rest nothing is on top of Stop', (await covered(page)).length === 0, await covered(page));
    // a toast on the accessory screen (a check that the person asks for from the sheet opens the popup by design: here only the automatic check runs, which waits on this screen)
    await page.evaluate(() => NX.checkWaitingUsers(false));
    await wait(900);
    const t1 = await page.evaluate(() => { const e = document.querySelector('.nx-snack'); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), at: e.getAttribute('data-nx-at'), pe: getComputedStyle(e).pointerEvents, text: e.textContent.slice(0, 60) }; });
    R.check('the snack of a pairing request: under the header, no modal over the pad, nothing on top of Stop (its button takes touches, the rest of it none)', !!t1 && t1.at === 'top' && t1.bottom < 200 && (await covered(page)).length === 0, [t1, await covered(page)]);
    // the pairing snack with its button: a user waits for approval (CFG waiting), on the accessory screen (the snack is the one toast above, 8 s)
    const snack = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-snack')).map((e) => { const b = e.getBoundingClientRect(); return { text: e.textContent.replace(/\s+/g, ' ').slice(0, 70), top: Math.round(b.top), bottom: Math.round(b.bottom), at: e.getAttribute('data-nx-at'), btn: !!e.querySelector('button'), pe: getComputedStyle(e).pointerEvents }; }));
    const modal = await page.evaluate(() => !!document.querySelector('.popup-container.popup-showing, .nx-sheet.nx-open') || document.body.classList.contains('popup-open'));
    console.log('SNACK ' + JSON.stringify(snack) + ' modal ' + modal);
    R.check('a pairing request on the accessory screen: no modal over the pad, nothing on top of Stop', !modal && (await covered(page)).length === 0, [snack, modal, await covered(page)]);
    await shot('v1-snack');
    // Stop in every state of the line: never covered, never dimmed
    await wait(4000);
    const look = await stopLook(page);
    console.log('STOPLOOK ' + JSON.stringify(look));
    R.check('Stop is not dimmed (filter none, opacity 1)', look.filter === 'none' && look.opacity === '1', look);
  }
  R.done();
};
