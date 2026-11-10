// nx23 (dialogs): SCRIPT=steps-approve-pad.cjs. The pairing popup must never open over the accessory screen (Ionic's body.popup-open takes every touch away from the page, Stop
// included). Somebody asks for access while the person is on the accessory screen (the gate may be moving): no popup for 12 seconds, a snack "<name> wants access · Review"
// under the header (not over Open, Close, Stop or the Blocked pill), a dot on the Settings tab, and a real tap on Stop still sends the command. When the person leaves the screen
// the popup opens; "Not now" snoozes the request for 24 hours; a check that the person asks for ignores the snooze; "Allow" approves.
//   CFG='{"waiting":[{"id":2,"username":"Home assistant","description":"Pixel 7"}],"state":"opening"}' VIEW=360x640 SCRIPT=steps-approve-pad.cjs node screens.cjs dlg-pad '#/tabs/favorites'
//   (also with "obstruct":"1", "activity":"blocked", "reachable":false)
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  let fails = 0, total = 0;
  const ok = (name, cond, extra) => { total++; if (!cond) fails++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
  const commands = () => page.evaluate(() => (window.__calls || []).filter((c) => /^nhk\.execute(Primary|Secondary)Command$/.test(c.key)).length);
  const popupShowing = () => page.evaluate(() => !!document.querySelector('.popup-container.popup-showing') || document.body.classList.contains('popup-open'));
  const ask = () => page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant' })));
  await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} });

  // ------------------------------------------------------------------ on the accessory screen
  await goto('#/tabs/favorites-device-detail/1/' + M, 2500);
  await ask();
  await page.evaluate(() => cordova.fireDocumentEvent('resume'));
  let shownEver = false, snackSeen = null, dot = null;
  for (let i = 0; i < 12; i++) {
    await wait(1000);
    if (await popupShowing()) shownEver = true;
    if (i === 2) {
      snackSeen = await page.evaluate(() => {
        const s = document.querySelector('.nx-snack'); if (!s) return null;
        const r = s.getBoundingClientRect();
        const hit = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !(b.right <= r.left || b.left >= r.right || b.bottom <= r.top || b.top >= r.bottom); }).map((e) => e.className.toString().slice(0, 30));
        const btn = s.querySelector('button');
        return { text: s.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), over: hit('.device-commands .command, .nx-block, .nx-pill, .nx-extras'), btn: btn && { w: Math.round(btn.getBoundingClientRect().width), h: Math.round(btn.getBoundingClientRect().height) }, pe: getComputedStyle(s).pointerEvents, pebtn: btn && getComputedStyle(btn).pointerEvents };
      });
      dot = await page.evaluate(() => { const i = document.querySelector('.tab-item .icon-settings'); const cs = i && getComputedStyle(i, '::after'); return { pending: document.documentElement.getAttribute('data-nx-pending'), content: cs && cs.content, w: cs && cs.width, bg: cs && cs.backgroundColor, label: i && i.closest('.tab-item').getAttribute('aria-label') }; });
      await shot('pad-snack');
    }
  }
  ok('on the accessory screen: no popup for 12 s (and body is not popup-open)', !shownEver);
  ok('the snack says who wants access and offers Review', !!snackSeen && /Home assistant wants access/.test(snackSeen.text) && /Review/.test(snackSeen.text), snackSeen);
  ok('the snack hangs under the header (top >= 88) and covers no button of the pad, no Blocked pill', !!snackSeen && snackSeen.top >= 88 && snackSeen.over.length === 0, snackSeen);
  ok('the snack takes no touch itself; its Review button does and is 48 high', !!snackSeen && snackSeen.pe === 'none' && snackSeen.pebtn === 'auto' && snackSeen.btn && snackSeen.btn.h >= 48, snackSeen);
  ok('html[data-nx-pending]=1 and a dot on the Settings tab that says so', !!dot && dot.pending === '1' && dot.content !== 'none' && /Settings, 1 access request/.test(dot.label || ''), dot);
  const n0 = await commands();
  ok('Stop can be hit: the point in the middle of Stop belongs to Stop (not to the snack, not to a dot, not to a popup)', await page.evaluate(() => { const r = document.querySelector('.device-commands .command:has([translate$="_stop"])').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!e && !!e.closest('.device-commands .command:has([translate$="_stop"])'); }));
  await page.locator('.device-commands .command:has([translate$="_stop"])').tap(); await wait(800);
  // (the app itself sends no command while it thinks that the accessory is not reachable: CFG reachable:false; the tap then reaches Stop all the same, as above)
  const reachable = await page.evaluate(() => window.__CFG.reachable !== false);
  ok('a real touch on Stop sends the command while a request waits' + (reachable ? '' : ' (not in the unreachable state: the app sends none, as in nx22)'), !reachable || (await commands()) === n0 + 1, [n0, await commands()]);

  // ------------------------------------------------------------------ leaving the screen opens the popup
  await goto('#/tabs/favorites', 1100);
  await wait(900);
  ok('after leaving the accessory screen the popup opens (within 2 s)', await popupShowing());
  const pop = await page.evaluate(() => {
    const p = document.querySelector('.popup-container.popup-showing .popup'); if (!p) return null;
    const bs = Array.from(p.querySelectorAll('.popup-buttons button')).map((b) => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b); return { t: b.textContent.trim(), x: Math.round(r.x), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, bg: cs.backgroundColor }; });
    const r = p.getBoundingClientRect();
    return { title: p.querySelector('.popup-title').textContent, body: p.querySelector('.popup-body').textContent, align: getComputedStyle(p.querySelector('.popup-body')).textAlign, w: Math.round(r.width), vw: innerWidth, bs, gap: bs.length === 2 ? bs[1].x - (bs[0].x + bs[0].w) : null, role: p.getAttribute('role'), lang: p.getAttribute('lang'), focus: document.activeElement && document.activeElement.textContent.trim() };
  });
  ok('popup: title "Allow access?", the phone in brackets, the accessory by its name (AABBCC, not NiceIT4WIFI), a warning', !!pop && pop.title === 'Allow access?' && /Home assistant \(Pixel 7\) wants to open and close “AABBCC”\. Only allow people you know\./.test(pop.body) && !/NiceIT4WIFI/.test(pop.body), pop);
  ok('popup: left-aligned, at most 88% of the screen wide, alertdialog, English', !!pop && pop.align === 'left' && pop.w <= pop.vw * 0.88 + 1 && pop.role === 'alertdialog' && pop.lang === 'en', pop);
  ok('popup: "Not now" and "Allow", each 48 high, 16 apart, the focus on "Not now"', !!pop && pop.bs.length === 2 && pop.bs[0].t === 'Not now' && pop.bs[1].t === 'Allow' && pop.bs.every((b) => b.h >= 48) && Math.abs(pop.gap - 16) <= 1 && pop.focus === 'Not now', pop);
  ok('popup: "Allow" is tonal (a fill), "Not now" is a text button (no fill)', !!pop && pop.bs[1].bg !== 'rgba(0, 0, 0, 0)' && pop.bs[0].bg === 'rgba(0, 0, 0, 0)', pop && pop.bs);
  await shot('popup');
  await page.locator('.popup-buttons button', { hasText: 'Not now' }).tap(); await wait(900);
  ok('"Not now" closes it and snoozes the request for 24 hours', !(await popupShowing()) && await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('nxSnooze') || '{}'), k = Object.keys(o); return k.length === 1 && Math.abs(o[k[0]] - Date.now() - 86400000) < 10000; }));
  await ask(); await wait(2500);
  ok('the same request does not come back at the next newUser', !(await popupShowing()));
  await page.evaluate(() => cordova.fireDocumentEvent('resume')); await wait(5500);
  ok('...nor at the next opening of the app (resume)', !(await popupShowing()));
  await page.evaluate(() => window.NX.checkWaitingUsers(true)); await wait(1800);
  ok('a check that the person asks for (the sheet\'s "New users") ignores the snooze', await popupShowing());
  await page.locator('.popup-buttons button', { hasText: 'Allow' }).tap(); await wait(1200);
  const calls = await page.evaluate(() => (window.__calls || []).filter((c) => /userNew/.test(c.key)).length);
  const toast = await page.evaluate(() => Array.from(document.querySelectorAll('.nx-snack')).map((e) => e.textContent));
  ok('"Allow" approves (one call) and the toast says who can now open and close the gate', calls === 1 && toast.some((t) => /“Home assistant” can now open and close the gate\./.test(t)), [calls, toast]);
  await shot('after-allow');

  // ------------------------------------------------------------------ Review in the snack
  await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} window.__CFG.waiting = [{ id: 3, username: 'Ben', description: 'Galaxy' }]; });   // somebody else asks
  await goto('#/tabs/favorites-device-detail/1/' + M, 2200);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Ben' }))); await wait(2500);
  const review = page.locator('.nx-snack button', { hasText: 'Review' });
  ok('a new request shows the snack again', await review.count() === 1);
  if (await review.count()) {
    await review.tap(); await wait(2200);
    ok('Review takes the person to Settings and the popup opens there', /settings/.test(await page.evaluate(() => location.hash)) && await popupShowing(), await page.evaluate(() => location.hash));
    await page.locator('.popup-buttons button', { hasText: 'Not now' }).tap(); await wait(600);
  }

  console.log(fails ? 'FAILED ' + fails + ' of ' + total : 'ALL OK (' + total + ' checks)');
};
