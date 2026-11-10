// nx23 (dialogs): SCRIPT=steps-dialogs.cjs. The dialog manager in the real app (the real cordova.js and Ionic): for the status sheet, the Activity sheet, the Design page,
// the pairing popup and the Debug log: it opens by keyboard and by touch; the focus goes into it; the page behind it is inert and gone from the accessibility tree; Tab stays
// inside; Back (cordova.fireDocumentEvent('backbutton')) and Escape each close it WITHOUT leaving the page (the hash does not change); the focus returns to the opener; nothing is
// left inert; and a real tap on Stop sends the command afterwards.
//   CFG='{"waiting":[{"id":2,"username":"Home assistant","description":"Pixel 7"}]}' VIEW=360x640 SCRIPT=steps-dialogs.cjs node screens.cjs dlg-dialogs '#/tabs/favorites'
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  let fails = 0, total = 0;
  const ok = (name, cond, extra) => { total++; if (!cond) fails++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
  const cdp = await page.context().newCDPSession(page);
  const axNames = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter((n) => !n.ignored).map((n) => (n.name && n.name.value) || '');
  const commands = () => page.evaluate(() => (window.__calls || []).filter((c) => /^nhk\.execute(Primary|Secondary)Command$/.test(c.key)).length);
  const hash = () => page.evaluate(() => location.hash);
  const leaked = () => page.evaluate(() => document.querySelectorAll('[inert]:not([data-nx-cached])').length + document.querySelectorAll('[data-nx-inert]').length);
  const inDialog = (sel) => page.evaluate((s) => { const a = document.activeElement, d = document.querySelector(s); return !!a && !!d && d.contains(a); }, sel);
  const back = () => page.evaluate(() => cordova.fireDocumentEvent('backbutton'));
  const stopWorks = async (label) => {
    const n = await commands();
    let tapped = true;
    try { await page.locator('.device-commands .command:has([translate$="_stop"])').tap({ timeout: 4000 }); } catch (e) { tapped = false; }
    await wait(800);
    ok(label + ': a real tap on Stop sends the command', tapped && (await commands()) === n + 1, [tapped, n, await commands(), await hash()]);
  };

  const CHIP = '.nx-chip:visible';       // the status chip: a real button in the title of the header (#nx-status is only a hidden live region); the DOM holds four (two nav-bars x active/cached), one has a box
  // each case: where it lives, how it is opened (key: by keyboard from the opener; touch), the dialog's selector, what shows that it is closed
  const CASES = [
    { name: 'status sheet', route: '#/tabs/favorites-device-detail/1/' + M, sel: '#nx-sheet', opener: '.nx-chip', key: async () => { await page.locator(CHIP).evaluate((e) => e.focus()); await page.keyboard.press('Enter'); }, touch: async () => { await page.locator(CHIP).tap(); }, pad: true },
    { name: 'Activity sheet', route: '#/tabs/favorites-device-detail/1/' + M, sel: '#nx-activity', opener: '.nx-last', key: async () => { await page.locator('.nx-last').evaluate((e) => e.focus()); await page.keyboard.press('Enter'); }, touch: async () => { await page.locator('.nx-last').tap(); }, pad: true },
    { name: 'Design page', route: '#/tabs/settings/false', sel: '#nx-gallery', opener: '.nx-design-row', key: async () => { await page.locator('.nx-design-row').evaluate((e) => e.focus()); await page.keyboard.press('Enter'); }, touch: async () => { await page.locator('.nx-design-row').tap(); } },
    { name: 'Debug log', route: '#/tabs/favorites-device-detail/1/' + M, sel: '#nx-log-panel', opener: '.nx-chip', key: async () => { await page.locator(CHIP).evaluate((e) => e.focus()); await page.evaluate(() => window.__nxLogShow()); }, touch: async () => { await page.evaluate(() => window.NX.open()); await wait(900); await page.locator('#nx-sheet .nx-more button', { hasText: /^(Debug )?[Ll]og$/ }).tap(); }, pad: true },
    { name: 'pairing popup', route: '#/tabs/settings/false', sel: '.popup-container.popup-showing', opener: null, key: async () => { await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant' }))); await wait(2200); }, touch: null }
  ];

  for (const c of CASES) {
    for (const how of ['key', 'back', 'escape']) {
      await goto(c.route, 2000);
      await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} });
      const h0 = await hash();
      const n0 = await commands();
      // keyboard opening for 'key', 'back' and 'escape' (touch is a separate case below)
      await c.key();
      await wait(1300);
      const open = await page.evaluate((s) => { const d = document.querySelector(s); return !!d && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden'; }, c.sel);
      ok(c.name + ' (' + how + '): it is open', open);
      if (how === 'key') {
        const act = await page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.className || a.tagName) + ' / ' + (a.textContent || '').trim().slice(0, 20) : ''; });
        ok(c.name + ': the focus is in the dialog' + (c.name === 'pairing popup' ? ' (on "Not now", never on "Allow")' : ''), await inDialog(c.sel) && (c.name !== 'pairing popup' || /Not now/.test(act)), act);
        ok(c.name + ': it has a role, a modal flag and a name', await page.evaluate((s) => { const d = document.querySelector(s); const p = d.classList.contains('popup-container') ? d.querySelector('.popup') : d; return /dialog/.test(p.getAttribute('role') || '') && p.getAttribute('aria-modal') === 'true' && !!(p.getAttribute('aria-label') || p.getAttribute('aria-labelledby')); }, c.sel));
        const inert = await page.evaluate(() => document.querySelectorAll('[data-nx-inert]').length);
        ok(c.name + ': the page behind it is inert', inert > 0, inert);
        const names = await axNames();
        ok(c.name + ': the page behind it is not in the accessibility tree', c.pad ? !names.includes('Open the gate') && !names.includes('Stop the gate') : !names.includes('Favorites') && !names.includes('Demo') && !names.some((n) => /^Visit Nice/.test(n)), names.slice(0, 12));   // exact names of the Settings rows: the Design page has its own text "Demo only. …"
        let outside = 0;
        for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (!(await inDialog(c.sel)) && (await page.evaluate(() => document.activeElement !== document.body))) outside++; }
        ok(c.name + ': Tab stays inside the dialog (12 presses)', outside === 0, outside);
        await shot('dialog-' + c.name.replace(/\W+/g, '-'));
      }
      if (how === 'back') await back(); else if (how === 'escape') await page.keyboard.press('Escape'); else { await back(); }
      await wait(1100);
      const closed = await page.evaluate((s) => { const d = document.querySelector(s); return !d || getComputedStyle(d).display === 'none' || getComputedStyle(d).visibility === 'hidden' || (!d.classList.contains('nx-open') && !d.classList.contains('popup-showing')) || d.classList.contains('popup-hidden'); }, c.sel);
      ok(c.name + ' (' + how + '): ' + (how === 'escape' ? 'Escape' : 'Back') + ' closes it', closed);
      ok(c.name + ' (' + how + '): and the page is not left (the hash is the same)', (await hash()) === h0, [h0, await hash()]);
      ok(c.name + ' (' + how + '): nothing is left inert', (await leaked()) === 0, await leaked());
      if (c.opener && how !== 'key') {
        ok(c.name + ' (' + how + '): the focus is back on the opener', await page.evaluate((o) => { const a = document.activeElement; return !!a && a.matches(o); }, c.opener), await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.className || document.activeElement.tagName)));
      }
      if (c.pad) await stopWorks(c.name + ' (' + how + ')');
      if (c.name === 'pairing popup' && how === 'escape') ok('pairing popup: Escape is "Not now" and snoozes the request', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('nxSnooze') || '{}')).length === 1));
    }
    // by touch
    if (c.touch) {
      await goto(c.route, 2000);
      await c.touch();
      await wait(1400);
      ok(c.name + ' (touch): a real tap opens it and the focus is in it', await inDialog(c.sel));
      await back(); await wait(1100);
      ok(c.name + ' (touch): Back closes it and nothing is left inert', (await leaked()) === 0);
      if (c.pad) await stopWorks(c.name + ' (touch)');
    }
  }

  // "New users" in the status sheet (a check that the person asked for): the sheet closes and the popup opens over the page, so that Back closes the popup only
  await goto('#/tabs/favorites-device-detail/1/' + M, 2000);
  await page.evaluate(() => { try { localStorage.removeItem('nxSnooze'); } catch (e) {} window.NX.open(); });
  await wait(1200);
  await page.evaluate(() => window.NX.checkWaitingUsers(true)); await wait(2500);
  const z = await page.evaluate(() => { const p = document.querySelector('.popup-container.popup-showing'); if (!p) return null; const r = p.querySelector('.popup-buttons button').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { popupOnTop: !!e && !!e.closest('.popup-container'), sheetOpen: !!document.querySelector('#nx-sheet.nx-open'), top: window.__nxA11y.top() && window.__nxA11y.top().className.slice(0, 40) }; });
  ok('New users in the sheet: the popup is on top and the sheet has closed', !!z && z.popupOnTop && !z.sheetOpen && /popup/.test(z.top), z);
  await back(); await wait(1000);
  ok('New users in the sheet: Back closes the popup, the page stays, nothing is inert', await page.evaluate(() => !document.querySelector('.popup-container.popup-showing')) && /device-detail/.test(await hash()) && (await leaked()) === 0, [await hash(), await leaked()]);

  // safety net: a page that is inert without an open dialog is freed within 1.3 s, and by the first touch
  await page.evaluate(() => { const r = document.querySelector('ion-nav-view') || document.querySelector('.pane'); r.setAttribute('inert', ''); r.setAttribute('data-nx-inert', '1'); });
  await wait(1400);
  ok('watchdog: an inert page without a dialog is freed within 1.3 s', (await leaked()) === 0, await leaked());
  await stopWorks('after the watchdog');

  // the explanation of the status sheet is spoken once per real change (the sheet writes the same text again every 20 s)
  await page.evaluate(() => { window.__live = []; new MutationObserver(() => window.__live.push(document.getElementById('nx-live').textContent)).observe(document.getElementById('nx-live'), { childList: true, characterData: true, subtree: true }); });
  await page.evaluate(() => { window.NX.open(); }); await wait(700);
  await page.evaluate(() => { window.NX.diagnose(); }); await wait(2600);
  const spoken = await page.evaluate(() => window.__live.filter((t) => t));
  await page.evaluate(() => { window.NX.refresh(); window.NX.refresh(); }); await wait(900);   // the same text again: nothing new is said
  const spoken2 = await page.evaluate(() => window.__live.filter((t) => t));
  ok('announcements: the diagnosis is spoken (at least once) and an identical render adds nothing', spoken.length >= 1 && spoken2.length === spoken.length, [spoken, spoken2]);
  await back(); await wait(900);

  console.log(fails ? 'FAILED ' + fails + ' of ' + total : 'ALL OK (' + total + ' checks)');
};
