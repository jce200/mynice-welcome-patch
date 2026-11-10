// nx23 QA (chrome): guards for the merged build that no builder could write alone. STEP=taps|areas|overlays|toast|live|trust  (the default runs all of them one after the other, except trust, which only prints)
//   CFG='{"secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"],"activity":"blocked"}' VIEW=360x640 SCRIPT=steps-qa-chrome.cjs STEP=taps node screens.cjs qa-chrome-taps '#/tabs/favorites'
// It prints one line per check ("ok" / "FAIL") and ends with a count. Real touch taps (page.tap: touchstart + touchend, so Ionic's tap handling runs), key presses and click()
// (detail 0: what TalkBack makes).
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  const DETAIL = '#/tabs/favorites-device-detail/1/' + M;
  let fails = 0, total = 0;
  const ok = (name, cond, extra) => { total++; if (!cond) fails++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
  const STEP = process.env.STEP || 'all';
  const want = (s) => (STEP === 'all' && s !== 'trust') || STEP.split(',').includes(s);
  const commands = () => page.evaluate(() => (window.__calls || []).filter((c) => /^nhk\.execute(Primary|Secondary)Command$/.test(c.key)).length);
  const hash = () => page.evaluate(() => location.hash);
  const pad = (key) => page.locator('.device-commands .command:has([translate$="_' + key + '"])');
  const chip = () => page.locator('.nx-chip:visible').first();
  const sheetOpen = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.classList.contains('nx-open') && getComputedStyle(e).display !== 'none'; }, '#nx-sheet');
  const openDialogs = () => page.evaluate(() => Array.from(document.querySelectorAll('.nx-sheet,.nx-gal')).filter((d) => d.classList.contains('nx-open') && getComputedStyle(d).display !== 'none').map((d) => d.id || d.className));
  const closeAll = async () => { await page.evaluate(() => { try { window.NX.close(); } catch (e) {} try { window.NX.closeActivity(); } catch (e) {} try { window.__nxLogHide(); } catch (e) {} try { NxGallery.close(); } catch (e) {} }); await wait(600); };
  // a logger of every click: at the window (capture: all of them, before Ionic's gate keeper) and at the document (bubble: those that the gate keeper let through)
  const install = () => page.evaluate(() => {
    if (window.__clkInstalled) { window.__clk = []; return; }
    window.__clkInstalled = 1; window.__clk = [];
    const d = (t) => t && t.tagName ? t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + '.' + String(typeof t.className === 'string' ? t.className : '').trim().split(/\s+/).slice(0, 2).join('.') : String(t);
    window.addEventListener('click', (e) => window.__clk.push({ ph: 'cap', t: d(e.target), detail: e.detail, pt: e.pointerType, trusted: e.isTrusted, ionic: !!e.isIonicTap }), true);
    document.addEventListener('click', (e) => window.__clk.push({ ph: 'bub', t: d(e.target), detail: e.detail, pt: e.pointerType, ionic: !!e.isIonicTap, prevented: e.defaultPrevented }), false);
  });
  const clicks = () => page.evaluate(() => { const c = window.__clk || []; return { cap: c.filter((x) => x.ph === 'cap').length, bub: c.filter((x) => x.ph === 'bub').length, all: c }; });
  const reset = () => page.evaluate(() => { window.__clk = []; });

  const innerHeightOf = (g) => g.vh;
  // ------------------------------------------------------------------ taps: one action per tap, never two, never zero
  if (want('taps')) {
    await goto(DETAIL, 2500);
    await install();
    const t = async (label, loc, effect, how) => {
      await reset();
      const before = await effect();
      if (how === 'tap') await loc.tap(); else if (how === 'enter') { await loc.evaluate((e) => e.focus()); await page.keyboard.press('Enter'); } else if (how === 'space') { await loc.evaluate((e) => e.focus()); await page.keyboard.press('Space'); } else if (how === 'click') await loc.evaluate((e) => e.click());
      await wait(900);
      const c = await clicks(), after = await effect();
      return { label, how, before, after, cap: c.cap, bub: c.bub, all: c.all };
    };
    const report = (r, expectDelta) => ok(r.label + ' (' + r.how + '): exactly one action', r.bub === 1 && r.after - r.before === expectDelta, [r.before, r.after, r.cap, r.bub, JSON.stringify(r.all.map((x) => x.ph + ':' + x.detail + ':' + x.pt + ':' + (x.ionic ? 'I' : '-')))]);
    // the pad and the extras: the number of commands sent
    for (const [key, name] of [['open', 'Open'], ['stop', 'Stop'], ['close', 'Close']]) {
      for (const how of ['tap', 'enter', 'space', 'click']) { report(await t(name, pad(key), commands, how), 1); await wait(250); }
    }
    for (const how of ['tap', 'enter', 'click']) {
      report(await t('extra "Open and Block"', page.locator('.device-commands .nx-extra').first(), commands, how), 1); await wait(250);
    }
    // the chip: the status sheet is opened once (the number of times that the click handler ran is the number of clicks that arrived)
    for (const how of ['tap', 'enter', 'space', 'click']) {
      const r = await t('chip', chip(), async () => (await sheetOpen()) ? 1 : 0, how);
      ok('chip (' + how + '): the sheet is open after one click, exactly one click arrived', r.after === 1 && r.bub === 1, [r.after, r.cap, r.bub, JSON.stringify(r.all.map((x) => x.ph + ':' + x.detail + ':' + x.pt + ':' + (x.ionic ? 'I' : '-')))]);
      await closeAll();
    }
    // the title text above the chip is not a control (nx22: a tap on it opened the sheet): a touch on it does nothing, a touch on the empty part of the header neither
    {
      await goto(DETAIL, 1500); await closeAll(); await reset();
      const pt = await page.evaluate(() => { const t = Array.from(document.querySelectorAll('.bar .title .nav-bar-title')).find((e) => e.getBoundingClientRect().width > 0 && !e.closest('[inert]')); if (!t) return null; const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 8 }; });
      if (pt) { await page.touchscreen.tap(pt.x, pt.y); await wait(1000); }
      ok('a touch on the title text (above the chip) opens nothing', !!pt && !(await sheetOpen()) && (await openDialogs()).length === 0, [pt, await openDialogs()]);
    }
    // the Activity entry
    for (const how of ['tap', 'enter', 'space', 'click']) {
      const r = await t('Activity entry', page.locator('.nx-last'), async () => (await page.evaluate(() => { const a = document.querySelector('#nx-activity'); return a && a.classList.contains('nx-open') ? 1 : 0; })), how);
      ok('Activity entry (' + how + '): the sheet is open after one click, exactly one click arrived', r.after === 1 && r.bub === 1, [r.after, r.cap, r.bub, JSON.stringify(r.all.map((x) => x.ph + ':' + x.detail + ':' + x.pt + ':' + (x.ionic ? 'I' : '-')))]);
      await closeAll();
    }
    // the tabs: one navigation
    const tabs = [['Settings', 'settings'], ['System', 'controls'], ['Favorites', 'favorites']];
    for (const [name, frag] of tabs) {
      for (const how of ['tap', 'enter']) {
        await goto(DETAIL, 1800); await reset();
        let n0 = await page.evaluate(() => history.length);
        const loc = page.locator('.tabs .tab-item', { hasText: name }).first();
        if (how === 'tap') await loc.tap(); else { await loc.evaluate((e) => e.focus()); await page.keyboard.press('Enter'); }
        await wait(1100);
        const c = await clicks(), h = await hash(), n1 = await page.evaluate(() => history.length);
        ok('tab ' + name + ' (' + how + '): goes there once (hash, one history entry, one click)', h.indexOf(frag) >= 0 && c.bub === 1 && n1 - n0 <= 1, [h, c.cap, c.bub, n1 - n0]);
      }
    }
    // a real touch at the middle of the visible header button with this name (the DOM holds several, one has a box)
    const headerButton = (label) => page.evaluate((l) => { const b = Array.from(document.querySelectorAll('button[aria-label="' + l + '"]')).find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest('[inert]'); }); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, label);
    // Back: one page back, not two (the history is list -> detail; one Back leaves the detail and shows the list)
    for (const how of ['tap', 'enter']) {
      await goto('#/tabs/favorites', 1500); await goto(DETAIL, 1800); await reset();
      const pt = await headerButton('Back');
      if (how === 'tap') { if (pt) await page.touchscreen.tap(pt.x, pt.y); } else { await page.evaluate((l) => { const b = Array.from(document.querySelectorAll('button[aria-label="' + l + '"]')).find((e) => e.getBoundingClientRect().width > 0 && !e.closest('[inert]')); b.focus(); }, 'Back'); await page.keyboard.press('Enter'); }
      await wait(1200);
      const c = await clicks();
      ok('Back (' + how + '): goes one page back, once', !!pt && /#\/tabs\/favorites$/.test(await hash()) && c.bub === 1, [pt, await hash(), c.cap, c.bub]);
    }
    // More commands (the eye): one page forward
    for (const how of ['tap', 'enter']) {
      await goto(DETAIL, 1800); await reset();
      const pt = await headerButton('More commands');
      if (how === 'tap') { if (pt) await page.touchscreen.tap(pt.x, pt.y); } else { await page.evaluate((l) => { const b = Array.from(document.querySelectorAll('button[aria-label="' + l + '"]')).find((e) => e.getBoundingClientRect().width > 0 && !e.closest('[inert]')); b.focus(); }, 'More commands'); await page.keyboard.press('Enter'); }
      await wait(1200);
      const c = await clicks();
      ok('More commands (' + how + '): opens the page once', !!pt && /settings-device-setup|device-setup|commands/i.test(await hash()) && c.bub === 1, [pt, await hash(), c.cap, c.bub]);
    }
    // Settings rows: the Design page and the Debug log each open once
    for (const how of ['tap', 'enter', 'space']) {
      await goto('#/tabs/settings/false', 1800); await reset();
      const loc = page.locator('.nx-design-row');
      if (how === 'tap') await loc.tap(); else { await loc.evaluate((e) => e.focus()); await page.keyboard.press(how === 'enter' ? 'Enter' : 'Space'); }
      await wait(1100);
      const c = await clicks(), open = await openDialogs();
      ok('Settings > Design row (' + how + '): opens the page once', open.join() === 'nx-gallery' && c.bub === 1, [open, c.cap, c.bub]);
      await closeAll();
    }
    for (const how of ['tap', 'enter', 'space']) {
      await goto('#/tabs/settings/false', 1800); await reset();
      const loc = page.locator('[data-ng-click="nxLogOpen()"], .item:has-text("Debug log")').first();
      if (how === 'tap') await loc.tap(); else { await loc.evaluate((e) => e.focus()); await page.keyboard.press(how === 'enter' ? 'Enter' : 'Space'); }
      await wait(1100);
      const c = await clicks(), open = await openDialogs();
      ok('Settings > Debug log row (' + how + '): opens the log once', open.join() === 'nx-log-panel' && c.bub === 1, [open, c.cap, c.bub]);
      await closeAll();
    }
    // label.item-radio and label.toggle: a tap on the row changes the choice once (GATE_SCOPE lets the click of the label through; the browser then clicks the input by itself)
    {
      await goto('#/tabs/settings-connection-mode', 2000);
      await page.evaluate(() => { window.__chg = []; if (!window.__chgOn) { window.__chgOn = 1; document.addEventListener('change', (e) => window.__chg.push((e.target.type || e.target.tagName) + ':' + (e.target.checked === undefined ? '' : e.target.checked)), true); } });
      const rows = page.locator('label.item-radio');
      const n = await rows.count();
      const before = await page.evaluate(() => Array.from(document.querySelectorAll('label.item-radio input')).findIndex((i) => i.checked));
      const target = before === 0 ? 1 : 0;
      await page.evaluate(() => { window.__chg = []; });
      await rows.nth(target).tap(); await wait(900);
      const after = await page.evaluate(() => ({ idx: Array.from(document.querySelectorAll('label.item-radio input')).findIndex((i) => i.checked), chg: window.__chg }));
      ok('Connection mode: a touch on a radio row selects it with one change (' + n + ' rows)', after.idx === target && after.chg.length === 1, [before, target, after]);
      await rows.nth(before).tap(); await wait(900);      // put it back
      await goto('#/tabs/settings-4th-button/1/' + M, 2000);
      await page.evaluate(() => { window.__chg = []; });      // (the listener of the radio block is still there: one listener only, or every change counts twice)
      const sw0 = await page.evaluate(() => document.querySelector('label.toggle input').checked);
      await page.locator('label.toggle').first().tap(); await wait(900);
      const sw1 = await page.evaluate(() => ({ on: document.querySelector('label.toggle input').checked, chg: window.__chg, aria: document.querySelector('label.toggle').getAttribute('aria-checked') }));
      ok('Optional command: a touch on the switch flips it once (not twice, not zero)', sw1.on === !sw0 && sw1.chg.length === 1 && sw1.aria === String(sw1.on), [sw0, sw1]);
      await page.locator('label.toggle').first().tap(); await wait(900);      // put it back
    }
    // the snack's Review button: one touch, one key press, one click() each take the person to Settings (once)
    for (const how of ['tap', 'enter', 'click']) {
      await goto(DETAIL, 1800);
      await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} window.__CFG.waiting = [{ id: 2, username: 'Home assistant', description: 'Pixel 7' }]; });
      await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant' }))); await wait(2600);
      await reset();
      const btn = page.locator('.nx-snack button', { hasText: 'Review' });
      if (!(await btn.count())) { ok('Review (' + how + '): the snack is there', false); continue; }
      if (how === 'tap') await btn.tap(); else if (how === 'enter') { await btn.evaluate((e) => e.focus()); await page.keyboard.press('Enter'); } else await btn.evaluate((e) => e.click());
      await wait(1500);
      const c = await clicks();
      ok('Review (' + how + '): takes the person to Settings once (the popup then opens there)', /settings/.test(await hash()) && c.bub === 1, [await hash(), c.cap, c.bub]);
      await page.evaluate(() => { window.__CFG.waiting = []; const b = document.querySelector('.popup-container.popup-showing .popup-buttons button'); if (b) b.click(); });      // "Not now" of the popup that follows on Settings
      await wait(1000);
    }
    await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} window.__CFG.waiting = []; });
    // the sheet's own buttons (Done closes once; a second click would reach the page behind it)
    await goto(DETAIL, 2000);
    await chip().tap(); await wait(900); await reset();
    await page.locator('#nx-sheet button.nx-done').tap(); await wait(900);
    let c = await clicks();
    ok('status sheet: Done closes it with one click (nothing reaches the page behind)', !(await sheetOpen()) && c.bub === 1, [c.cap, c.bub, JSON.stringify(c.all)]);
  }

  // ------------------------------------------------------------------ areas: the hit area of the Activity entry (grows 4 dp each way) against the button and the pill of the line directly under it
  if (want('areas')) {
    await goto(DETAIL, 2500);
    const geo = await page.evaluate(() => {
      const R = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map((v) => Math.round(v * 10) / 10); };
      const q = (s) => document.querySelector(s);
      const out = { vw: innerWidth, vh: innerHeight };
      const last = q('.nx-last'); out.last = last && R(last);
      const line = q('.nx-line'); out.line = line && R(line);
      const act = q('.nx-line-act'); out.act = act && R(act);
      const pill = q('.nx-pill'); out.pill = pill && R(pill);
      const ea = (e, pseudo) => { if (!e) return null; const cs = getComputedStyle(e, pseudo), b = e.getBoundingClientRect(); const top = parseFloat(cs.top), h = parseFloat(cs.height); return cs.content === 'none' ? null : [Math.round(b.top + (isNaN(top) ? 0 : top)), Math.round(b.top + (isNaN(top) ? 0 : top) + h)]; };
      out.lastAfter = ea(last, '::after'); out.actAfter = ea(act, '::after'); out.pillAfter = ea(pill, '::after');
      return out;
    });
    console.log('areas geometry', JSON.stringify(geo));
    // walk down the middle of the Activity entry, 1 px at a time, from its top edge to the bottom of the line, and say which control each y belongs to
    const walk = await page.evaluate(() => {
      const last = document.querySelector('.nx-last'), line = document.querySelector('.nx-line');
      const lb = last.getBoundingClientRect(), nb = line.getBoundingClientRect();
      // the middle of the stretch where the Activity entry and the control of the line (the action button, else the Blocked pill) share their columns
      const other = document.querySelector('.nx-line-act') || document.querySelector('.nx-pill'), ob = other && other.getBoundingClientRect();
      const x = ob ? Math.round((Math.max(lb.left, ob.left) + Math.min(lb.right, ob.right)) / 2) : Math.round(lb.left + lb.width / 2);
      const kind = (e) => !e ? '-' : e.closest('.nx-last') ? 'LAST' : e.closest('.nx-line-act') ? 'LINE-ACT' : e.closest('.nx-pill') ? 'PILL' : e.closest('.nx-line') ? 'line' : e.closest('.device-commands') ? 'pad' : e.className && String(e.className).slice(0, 14) || e.tagName;
      const segs = []; let cur = null;
      for (let y = Math.floor(lb.top) - 10; y <= Math.ceil(nb.bottom) + 10; y++) {
        const k = kind(document.elementFromPoint(x, y));
        if (!cur || cur.k !== k) { cur = { k, from: y, to: y }; segs.push(cur); } else cur.to = y;
      }
      return { x, lastTop: Math.round(lb.top), lastBottom: Math.round(lb.bottom), lineTop: Math.round(nb.top), lineBottom: Math.round(nb.bottom), segs: segs.map((s) => s.k + ' ' + s.from + '..' + s.to) };
    });
    console.log('areas walk (x = where the Activity entry and the line control share their columns)', JSON.stringify(walk));
    // the visible Activity entry must not lose any pixel to the control under it, and the visible control not to the Activity entry (taps must go to the right control)
    ok('taps on the visible Activity entry go to it (every y of its box)', walk.segs.filter((x) => /^LAST /.test(x)).length === 1 && (() => { const m = /^LAST (\d+)\.\.(\d+)/.exec(walk.segs.find((x) => /^LAST /.test(x))); return +m[1] <= walk.lastTop + 1 && +m[2] >= walk.lastBottom - 2; })(), walk);
    ok('taps on the visible line control (the action button or the pill) go to it (every y of its box)', walk.segs.every((x) => !/^(LINE-ACT|PILL) /.test(x)) || (() => { const m = /^(LINE-ACT|PILL) (\d+)\.\.(\d+)/.exec(walk.segs.find((x) => /^(LINE-ACT|PILL) /.test(x))); return +m[2] <= walk.lineTop + 8 && +m[3] >= walk.lineBottom - 8; })(), walk);
    // the button of the status line (only while the accessory does not answer): one touch, one key press, one click() each make one Reconnect, and the taps above reach it where it is drawn
    if (geo.act) {
      await install();
      for (const how of ['tap', 'enter', 'click']) {
        await page.evaluate("(function(){var h=JSON.parse(localStorage.getItem('keyHomes'));h[0].devices[0].reachable=false;localStorage.setItem('keyHomes',JSON.stringify(h));NX.refresh();})()");
        for (let i = 0; i < 16 && !(await page.locator('.nx-line-act').count()); i++) await wait(500);      // the app checks again for a few seconds before it says that the accessory does not answer
        if (!(await page.locator('.nx-line-act').count())) { ok('line action (' + how + '): the button is there', false); continue; }
        await wait(300);
        await reset();
        const n0 = await page.evaluate(() => (window.__calls || []).filter((c) => /^Nx\.reconnect$/.test(c.key)).length);
        const pt = await page.evaluate(() => { const r = document.querySelector('.nx-line-act').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        if (how === 'tap') await page.touchscreen.tap(pt.x, pt.y); else if (how === 'enter') { await page.locator('.nx-line-act').evaluate((e) => e.focus()); await page.keyboard.press('Enter'); } else await page.locator('.nx-line-act').evaluate((e) => e.click());
        await wait(1200);
        const c = await clicks(), n1 = await page.evaluate(() => (window.__calls || []).filter((c) => /^Nx\.reconnect$/.test(c.key)).length);
        ok('line action "Reconnect" (' + how + '): one click arrives, one reconnect is started', c.bub === 1 && n1 - n0 === 1, [c.cap, c.bub, n1 - n0]);
        await wait(5000);      // the attempt runs (about 3 s) before the next one may start
      }
    }
    ok('the whole visible Activity entry belongs to the Activity entry', await page.evaluate(() => { const l = document.querySelector('.nx-last'), b = l.getBoundingClientRect(); for (let y = Math.ceil(b.top) + 1; y < b.bottom - 1; y += 2) { const e = document.elementFromPoint(b.left + b.width / 2, y); if (!e || !e.closest('.nx-last')) return false; } return true; }));
  }

  // ------------------------------------------------------------------ overlays: z-order, one Back closes one thing, focus, inert, and Stop right after a sheet is closed
  if (want('overlays')) {
    const back = () => page.evaluate(() => cordova.fireDocumentEvent('backbutton'));
    const stopCenterHit = () => page.evaluate(() => { const r = document.querySelector('.device-commands .command:has([translate$="_stop"])').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && e.closest('.device-commands .command:has([translate$="_stop"])') ? 'STOP' : (e ? (e.id || String(e.className).slice(0, 24) || e.tagName) : 'none'); });
    const leaked = () => page.evaluate(() => document.querySelectorAll('[data-nx-inert]').length);
    const focusIn = () => page.evaluate(() => { const a = document.activeElement, d = a && a.closest && a.closest('.nx-sheet,.nx-gal,.popup-container'); return d ? (d.id || d.className.toString().slice(0, 20)) : (a ? (a.id || a.tagName) : 'none'); });
    await goto(DETAIL, 2500);
    // the z-order of everything that can lie over the pad
    const z = await page.evaluate(() => {
      const g = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).zIndex : null; };
      const order = Array.from(document.body.children).map((e, i) => ({ i, id: e.id || '', c: String(e.className).slice(0, 18), z: getComputedStyle(e).zIndex })).filter((x) => /nx-|popup|backdrop/.test(x.id + x.c));
      return { sheet: g('#nx-sheet'), activity: g('#nx-activity'), log: g('#nx-log-panel'), logButton: g('#nx-log-button'), popup: g('.popup-container'), gal: g('.nx-gal'), scrims: Array.from(document.querySelectorAll('.nx-scrim')).map((e) => getComputedStyle(e).zIndex).join(), order };
    });
    console.log('z-order', JSON.stringify(z));
    // (two sheets at once can only be made by code, never by a person: the page behind a sheet is inert, and the status sheet closes itself before it opens the Debug log or the popup.
    // What a person can combine is a sheet with the snack of a request for access, below.)
    if (process.env.WAITING) {
      // a request for access arrives while a sheet is open: its snack lies above the sheet (it takes no touch but its Review button), Review closes the sheet, goes to Settings, the popup follows there
      for (const opener of ['status sheet', 'Activity sheet']) {
        await goto(DETAIL, 2000); await closeAll();
        await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} });
        if (opener === 'status sheet') await chip().tap(); else await page.locator('.nx-last').tap();
        await wait(900);
        await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant' }))); await wait(2600);
        const snack = await page.evaluate(() => { const s = document.querySelector('.nx-snack'); if (!s) return null; const b = s.querySelector('button'), r = b && b.getBoundingClientRect(); const e = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { hasReview: !!b, review: r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], hit: e ? (e.closest('.nx-snack') ? 'SNACK' : (e.id || String(e.className).slice(0, 20))) : 'none', popup: !!document.querySelector('.popup-container.popup-showing') }; });
        ok(opener + ' open + a request arrives: no popup over it, the snack is there and its Review button is what is hit at its middle', !!snack && snack.hasReview && snack.hit === 'SNACK' && !snack.popup, snack);
        await shot('review-over-' + opener.split(' ')[0]);
        const review = page.locator('.nx-snack button', { hasText: 'Review' });
        if (await review.count()) { await review.tap(); await wait(2500); }
        const st = await page.evaluate(() => ({ hash: location.hash, popup: !!document.querySelector('.popup-container.popup-showing'), dialogs: Array.from(document.querySelectorAll('.nx-sheet,.nx-gal')).filter((d) => d.classList.contains('nx-open') && getComputedStyle(d).display !== 'none').map((d) => d.id), inert: document.querySelectorAll('[data-nx-inert]').length }));
        ok(opener + ' open, Review tapped: the sheet is gone, Settings is shown, the popup is open over it, the page behind the popup is inert', /settings/.test(st.hash) && st.popup && st.dialogs.length === 0, st);
        await back(); await wait(1000);
        const st2 = await page.evaluate(() => ({ hash: location.hash, popup: !!document.querySelector('.popup-container.popup-showing'), inert: document.querySelectorAll('[data-nx-inert]').length }));
        ok(opener + ': Back closes the popup only (Settings stays), nothing is left inert', /settings/.test(st2.hash) && !st2.popup && st2.inert === 0, st2);
      }
    }

    // Stop right after a sheet is closed: nothing may keep the screen for a moment (the scrim stays displayed 350-420 ms after the class is gone)
    const closers = {
      'status sheet, Back': { open: () => page.evaluate(() => window.NX.open()), close: () => back() },
      'status sheet, Done': { open: () => page.evaluate(() => window.NX.open()), close: () => page.locator('#nx-sheet button.nx-done').tap() },
      'status sheet, scrim': { open: () => page.evaluate(() => window.NX.open()), close: () => page.touchscreen.tap(200, 30) },
      'Activity sheet, Back': { open: () => page.locator('.nx-last').tap(), close: () => back() },
      'Debug log, Escape': { open: () => page.evaluate(() => window.__nxLogShow()), close: () => page.keyboard.press('Escape') }
    };
    for (const name of Object.keys(closers)) {
      await goto(DETAIL, 1500); await closeAll();
      await closers[name].open(); await wait(1000);
      const n0 = await commands();
      await closers[name].close();
      // as soon as the close call has returned: what is under the middle of Stop, at once and 100, 200, 300, 400 ms later (measured in the page)
      const hits = await page.evaluate(() => new Promise((res) => {
        const hit = () => { const r = document.querySelector('.device-commands .command:has([translate$="_stop"])').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && e.closest('.command') ? 'STOP' : (e ? (e.id || String(e.className).slice(0, 18)) : 'none'); };
        const out = [hit()]; [100, 200, 300, 400, 500].forEach((ms) => setTimeout(() => { out.push(ms + ':' + hit()); if (ms === 500) res(out); }, ms));
      }));
      // (the first sample may be taken while the page is still inert for one frame: elementFromPoint then says <html>; from 100 ms on it must be Stop)
      ok('Stop is reachable 100 ms after "' + name + '" and from then on (what is under it: ' + hits.join(' ') + ')', hits.slice(1).every((h) => /STOP$/.test(h)), hits);
    }
    // a tap that dismisses a sheet must not also press what is under the finger (the scrim lets the browser's click through to the page as soon as the sheet is closing: Ionic's gate keeper has to stop it)
    {
      await goto(DETAIL, 1500); await closeAll();
      await page.evaluate(() => window.__nxLogShow()); await wait(1000);
      await install();
      const pt = await page.evaluate(() => { const r = document.querySelector('.nx-last').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: document.getElementById('nx-log-panel').getBoundingClientRect().top }; });
      await reset();
      if (pt.y < pt.top) { await page.touchscreen.tap(pt.x, pt.y); await wait(1200); }
      const c = await clicks();
      ok('a touch on the scrim over the Activity entry closes the Debug log and does not open the Activity sheet (' + (pt.y < pt.top ? 'entry at y ' + Math.round(pt.y) + ', sheet at ' + Math.round(pt.top) : 'the entry is under the sheet: not applicable') + ')',
        pt.y >= pt.top || (!(await page.evaluate(() => window.__nxLogIsOpen())) && !(await page.evaluate(() => { const a = document.querySelector('#nx-activity'); return !!a && a.classList.contains('nx-open'); })) && c.bub === 1), [c.cap, c.bub, JSON.stringify(c.all)]);
      await closeAll();
    }
    // and a real tap 120 ms after the close (a person who dismissed the sheet and hits Stop at once)
    for (const name of ['status sheet, Back', 'status sheet, scrim', 'status sheet, Done', 'Activity sheet, Back', 'Debug log, Escape']) {
      await goto(DETAIL, 1500); await closeAll();
      await closers[name].open(); await wait(1000);
      const n0 = await commands();
      const pt = await page.evaluate(() => { const r = document.querySelector('.device-commands .command:has([translate$="_stop"])').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await closers[name].close();
      await wait(40);
      await page.touchscreen.tap(pt.x, pt.y);       // a finger: no waiting for the page to be ready (locator.tap() waits until nothing covers the target, which hides the very thing that is measured)
      await wait(800);
      ok('a real touch on Stop about 100 ms after "' + name + '" sends the command', (await commands()) === n0 + 1, [n0, await commands()]);
    }
  }

  // ------------------------------------------------------------------ toast: never on the pad, never on the status line (two workstreams place it: :has(.device-commands) and data-nx-at="top")
  if (want('toast')) {
    const snackGeo = () => page.evaluate(() => {
      const s = document.querySelector('.nx-snack'); if (!s) return null;
      const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width && b.height ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null; };
      const sb = s.getBoundingClientRect();
      const over = {};
      [['state', '.nx-state'], ['icon', '.device-icon'], ['last', '.nx-last'], ['line', '.nx-line'], ['pad', '.device-commands'], ['stop', '.device-commands .command:has([translate$="_stop"])'], ['tabs', '.tabs']].forEach(([k, q]) => {
        const e = Array.from(document.querySelectorAll(q)).find((x) => x.getBoundingClientRect().width > 0); if (!e) return;
        const b = e.getBoundingClientRect(); const ov = Math.min(sb.bottom, b.bottom) - Math.max(sb.top, b.top);
        if (ov > 0 && Math.min(sb.right, b.right) - Math.max(sb.left, b.left) > 0) over[k] = Math.round(ov);
      });
      return { text: s.textContent.slice(0, 70), rect: R(s), at: s.getAttribute('data-nx-at'), top: Math.round(sb.top), bottom: Math.round(sb.bottom), vh: innerHeight, over, pe: getComputedStyle(s).pointerEvents };
    });
    // 1. a message created on the accessory screen (data-nx-at="top"): where is it, what does it cover
    await goto(DETAIL, 2500);
    await page.evaluate(() => window.NX.checkWaitingUsers(true)); await wait(900);
    let g = await snackGeo();
    console.log('toast on the accessory screen', JSON.stringify(g));
    ok('a toast on the accessory screen hangs under the header and covers neither the pad nor the status line nor the Activity entry', !!g && g.top >= 88 && !g.over.pad && !g.over.line && !g.over.stop && !g.over.last && !g.over.tabs, g);
    await wait(3600);
    // 2. the longest message and the Review snack (a button) on the accessory screen
    await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} window.__CFG.waiting = [{ id: 2, username: 'Home assistant with a rather long name that goes on', description: 'Pixel 7' }]; });
    await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant with a rather long name that goes on' }))); await wait(2600);
    g = await snackGeo();
    console.log('Review snack on the accessory screen', JSON.stringify(g));
    ok('the Review snack (a long name) hangs under the header and covers neither the pad nor the status line nor the Activity entry', !!g && g.top >= 88 && !g.over.pad && !g.over.line && !g.over.stop && !g.over.last && !g.over.tabs, g);
    await shot('toast-review-' + (process.env.SHOTSUFFIX || 'x'));
    await wait(8200);
    // 3. a message created on the list and the person goes to the accessory screen before it is gone
    await page.evaluate(() => { window.__CFG.waiting = []; });
    await goto('#/tabs/favorites', 1800);
    await page.evaluate(() => window.NX.checkWaitingUsers(true)); await wait(500);
    const gl = await snackGeo();
    await goto(DETAIL, 300);
    g = await snackGeo();
    console.log('toast made on the list: before / after the person goes to the accessory screen', JSON.stringify([gl && gl.top, gl && gl.at, g && g.top, g && g.over]));
    ok('a toast made on the list that is still there on the accessory screen does not cover the pad or the status line', !g || (!g.over.pad && !g.over.line && !g.over.stop), g);
    await wait(3600);
    // 4. the accessory screen has been visited: a toast on Settings must still be where toasts are on Settings (the cached view of the pad stays in the DOM)
    await goto('#/tabs/settings/false', 1800);
    await page.evaluate(() => window.NX.checkWaitingUsers(true)); await wait(700);
    g = await snackGeo();
    console.log('toast on Settings after the accessory screen was visited', JSON.stringify(g));
    ok('a toast on Settings, after the accessory screen was visited, is at the bottom (above the tab bar), not under the header', !!g && g.top > innerHeightOf(g) / 2, g);
    await wait(3600);
  }

  // ------------------------------------------------------------------ live: what a screen reader would say, region by region (aria-live off is not spoken), and nothing twice
  if (want('live')) {
    await goto('#/tabs/favorites', 1500);
    await page.evaluate(() => {
      window.__spoken = []; const t0 = performance.now();
      const region = (n) => { for (let e = n.nodeType === 1 ? n : n.parentElement; e && e !== document.body; e = e.parentElement) { const al = e.getAttribute('aria-live'), role = e.getAttribute('role'); if (al === 'off') return null; if (al === 'polite' || al === 'assertive' || role === 'status' || role === 'alert' || role === 'log') return e; } return null; };
      new MutationObserver((muts) => {
        const seen = new Set();
        muts.forEach((m) => { const r = region(m.target); if (!r || seen.has(r)) return; seen.add(r); const text = (r.textContent || '').replace(/\s+/g, ' ').trim(); if (!text) return; window.__spoken.push({ t: Math.round(performance.now() - t0), who: (r.id ? '#' + r.id : '') + '.' + String(r.className).trim().split(/\s+/).slice(0, 2).join('.') + '[' + (r.getAttribute('aria-live') || r.getAttribute('role')) + ']', text: text.slice(0, 90) }); });
      }).observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    const dump = async (label) => { const sp = await page.evaluate(() => { const o = window.__spoken; window.__spoken = []; return o; }); console.log('--- spoken: ' + label); sp.forEach((x) => console.log('   +' + x.t + ' ms  ' + x.who + '  "' + x.text + '"')); return sp; };
    await goto(DETAIL, 6000);
    const sp1 = await dump('entering the accessory screen (6 s)');
    await pad('open').tap(); await wait(5000);
    const sp2 = await dump('Open tapped (5 s)');
    await page.evaluate(() => window.NX.refresh()); await page.evaluate(() => window.NX.refresh()); await wait(1500);
    const sp3 = await dump('two refreshes of the chip (identical text: nothing may be said)');
    ok('identical refreshes of the chip say nothing', !sp3.some((x) => /nx-live/.test(x.who)), sp3);
    const statusLive = await page.evaluate(() => { const e = document.getElementById('nx-status'); return e ? [e.getAttribute('aria-live'), e.getAttribute('role'), e.textContent] : null; });
    ok('#nx-status is role=status with aria-live=off (the a11y layer speaks the chip once through #nx-live)', !!statusLive && statusLive[0] === 'off' && statusLive[1] === 'status', statusLive);
    // the same text in two regions within 2 s is said twice
    const all = sp1.concat(sp2);
    const twice = [];
    all.forEach((a, i) => all.forEach((b, j) => { if (j > i && a.text === b.text && a.who !== b.who && Math.abs(a.t - b.t) < 2000) twice.push(a.text + ' | ' + a.who + ' + ' + b.who); }));
    ok('no text is spoken by two regions at once', twice.length === 0, twice);
  }

  // ------------------------------------------------------------------ trust: what the chip, the line and the live region say while the state of the gate is confirmed, ages or goes stale (prints; no checks)
  //   CFG='{"statusDelay":4000}' STEP=trust ...                                   the state is being confirmed for 4 s: chip "Checking…", name "Accessory: checking…. Opens ..."
  //   CFG='{"statusFail":true,"trustTimes":{"StateFreshMs":2000,"StateStaleMs":5000}}' STEP=trust ...     the request for the state fails: trust "stale" and the chip is still "Accessory online"
  if (want('trust')) {
    await goto('#/tabs/favorites', 1500);
    await page.evaluate(() => {
      window.__spoken = []; const t0 = performance.now();
      const region = (n) => { for (let e = n.nodeType === 1 ? n : n.parentElement; e && e !== document.body; e = e.parentElement) { const al = e.getAttribute('aria-live'), role = e.getAttribute('role'); if (al === 'off') return null; if (al === 'polite' || al === 'assertive' || role === 'status' || role === 'alert' || role === 'log') return e; } return null; };
      new MutationObserver((muts) => { const seen = new Set(); muts.forEach((m) => { const r = region(m.target); if (!r || seen.has(r)) return; seen.add(r); const text = (r.textContent || '').replace(/\s+/g, ' ').trim(); if (text) window.__spoken.push({ t: Math.round(performance.now() - t0), who: (r.id ? '#' + r.id : '') + '.' + String(r.className).trim().split(/\s+/).slice(0, 2).join('.'), text: text.slice(0, 90) }); }); }).observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    await page.evaluate((h) => { location.hash = h; }, DETAIL);
    const t0 = Date.now();
    for (let i = 0; i < Number(process.env.SECONDS || 12); i++) {
      const r = await page.evaluate(() => {
        const c = Array.from(document.querySelectorAll('.nx-chip')).find((x) => x.getBoundingClientRect().width > 0), d = window.NX.line ? window.NX.line() : null, st = document.getElementById('nx-status');
        return { chip: c && c.children[0].textContent + (c.children[1].textContent ? ' | ' + c.children[1].textContent : ''), name: c && c.getAttribute('aria-label'), status: st && st.textContent, live: st && st.getAttribute('aria-live'), trust: window.NX.trust(), line: d && d.text, kind: d && d.kind, level: document.documentElement.getAttribute('data-nx-status') };
      });
      console.log('trust ' + (Date.now() - t0) + ' ms ' + JSON.stringify(r));
      await wait(1000);
    }
    console.log('trust SPOKEN ' + JSON.stringify(await page.evaluate(() => window.__spoken)));
  }

  // ------------------------------------------------------------------ the end
  if (STEP === 'all' || STEP.indexOf(',') >= 0 || ['taps', 'areas', 'overlays', 'toast', 'live'].includes(STEP)) console.log(fails ? 'FAILED ' + fails + ' of ' + total : 'ALL OK (' + total + ' checks)');
};
