// nx23 (dialogs): SCRIPT=steps-log.cjs. The Debug log (debuglog.js): a bottom sheet, half the screen high, Clear / Copy / Done, closed by Back, Escape, Done, the scrim and a change of
// page; it never traps the person over the gate controls. And its button: hidden on every screen of an app that has an accessory, docked in the header (48 dp hit area) in the setup wizard.
//   CFG='{"state":"opening"}' VIEW=360x640 SCRIPT=steps-log.cjs node screens.cjs dlg-log '#/tabs/favorites'      (also "obstruct":"1", "activity":"blocked")
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  let fails = 0, total = 0;
  const ok = (name, cond, extra) => { total++; if (!cond) fails++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
  const commands = () => page.evaluate(() => (window.__calls || []).filter((c) => /^nhk\.execute(Primary|Secondary)Command$/.test(c.key)).length);
  const hash = () => page.evaluate(() => location.hash);
  const isOpen = () => page.evaluate(() => window.__nxLogIsOpen());
  const leaked = () => page.evaluate(() => document.querySelectorAll('[inert]:not([data-nx-cached])').length);
  const open = async () => { await page.evaluate(() => window.__nxLogShow()); await wait(900); };
  const stopWorks = async (label) => {
    const n = await commands();
    await page.locator('.device-commands .command:has([translate$="_stop"])').tap(); await wait(800);
    ok(label + ': a real tap on Stop sends the command', (await commands()) === n + 1, [n, await commands()]);
  };
  const back = () => page.evaluate(() => cordova.fireDocumentEvent('backbutton'));

  await goto('#/tabs/favorites-device-detail/1/' + M, 2500);
  const h0 = await hash();
  ok('the button is not shown on the accessory screen of an app that has an accessory', await page.evaluate(() => getComputedStyle(document.getElementById('nx-log-button')).display === 'none'));
  ok('the API is there: __nxLogShow, __nxLogHide, __nxLogIsOpen, #nx-log-button, #nx-log-panel with a <pre>', await page.evaluate(() => typeof window.__nxLogShow === 'function' && typeof window.__nxLogHide === 'function' && typeof window.__nxLogIsOpen === 'function' && !!document.getElementById('nx-log-button') && !!document.querySelector('#nx-log-panel pre')));

  // ------------------------------------------------------------------ the status sheet's own button opens it (touch), the sheet closes
  await page.evaluate(() => window.NX.open()); await wait(900);
  await page.locator('#nx-sheet .nx-more button', { hasText: /^(Debug )?[Ll]og$/ }).tap(); await wait(1300);
  ok('the button of the status sheet opens the log and the sheet is gone', await isOpen() && await page.evaluate(() => !document.querySelector('#nx-sheet.nx-open')));
  const m = await page.evaluate(() => {
    const p = document.getElementById('nx-log-panel'), r = p.getBoundingClientRect(), pre = p.querySelector('pre'), cs = getComputedStyle(pre);
    const bs = Array.from(p.querySelectorAll('.nx-footer button')).map((b) => { const q = b.getBoundingClientRect(); return { t: b.textContent, w: Math.round(q.width * 10) / 10, h: Math.round(q.height * 10) / 10 }; });
    const stop = document.querySelector('.device-commands .command:has([translate$="_stop"])').getBoundingClientRect();
    const hit = document.elementFromPoint(stop.x + stop.width / 2, stop.y + stop.height / 2);
    return { top: Math.round(r.top), h: Math.round(r.height), vh: innerHeight, font: cs.fontSize, lh: cs.lineHeight, color: cs.color, bg: cs.backgroundColor, bs, title: p.querySelector('h2').textContent, sub: p.querySelector('.nx-log-sub').textContent, role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), name: p.getAttribute('aria-labelledby'), lang: p.getAttribute('lang'), stopCovered: !!hit && !!hit.closest('#nx-log-panel, .nx-scrim'), focus: document.activeElement && document.activeElement.id };
  });
  ok('it is a dialog named "Debug log", English, half the screen high (50 dvh)', m.role === 'dialog' && m.modal === 'true' && m.name === 'nx-log-title' && m.title === 'Debug log' && m.lang === 'en' && Math.abs(m.h - m.vh / 2) <= 2, m);
  ok('its three buttons Clear, Copy, Done are 48 high or more', m.bs.map((b) => b.t).join() === 'Clear,Copy,Done' && m.bs.every((b) => b.h >= 48), m.bs);
  ok('the lines are 12 px monospace in on-surface-variant (not green on black)', m.font === '12px' && !/rgb\(0, 255, 0\)/.test(m.color) && m.bg !== 'rgb(0, 0, 0)', [m.font, m.color, m.bg]);
  ok('the sub line says how many lines, that secrets are masked and to check before sharing', /^[\d,]+ lines?, secrets are masked, check before you share$/.test(m.sub), m.sub);
  ok('the focus is in the sheet', m.focus === 'nx-log-panel' || await page.evaluate(() => !!document.activeElement.closest('#nx-log-panel')));
  await shot('log-open-' + (process.env.SHOTSUFFIX || 'x'));
  const lines = await page.evaluate(() => document.querySelector('#nx-log-panel pre').textContent.split('\n').length);
  ok('it shows the log', lines > 5, lines);

  // ------------------------------------------------------------------ the five ways out
  await back(); await wait(900);
  ok('Back closes it and the page is not left (hash unchanged)', !(await isOpen()) && (await hash()) === h0 && (await leaked()) === 0, [await isOpen(), await hash(), await leaked()]);
  await stopWorks('after Back');
  await open(); await page.keyboard.press('Escape'); await wait(900);
  ok('Escape closes it, the hash is unchanged', !(await isOpen()) && (await hash()) === h0 && (await leaked()) === 0, [await isOpen(), await hash()]);
  await open(); await page.locator('#nx-log-panel .nx-footer button', { hasText: 'Done' }).tap(); await wait(900);
  ok('Done closes it (touch)', !(await isOpen()) && (await leaked()) === 0);
  // (one gesture each: since the scrim of the log is no longer data-tap-disabled, Ionic's own click closes it, and a closing scrim takes no touch, so a second tap would land on the page: at (200, 40) on the chip)
  await open(); await page.touchscreen.tap(180, 110); await wait(900);
  ok('a touch on the scrim (outside the sheet) closes it, and nothing under the finger is pressed', !(await isOpen()) && (await leaked()) === 0 && !(await page.evaluate(() => !!document.querySelector('#nx-sheet.nx-open, #nx-activity.nx-open'))));
  await open(); await page.mouse.click(180, 110); await wait(900);
  ok('a mouse click on the scrim (outside the sheet) closes it', !(await isOpen()) && (await leaked()) === 0);
  await stopWorks('after the scrim');
  await open(); await page.evaluate(() => { location.hash = '#/tabs/favorites'; }); await wait(1200);
  ok('a change of page closes it', !(await isOpen()));
  await goto('#/tabs/favorites-device-detail/1/' + M, 2200);

  // ------------------------------------------------------------------ Copy and Clear
  await open();
  await page.evaluate(() => { window.__copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { window.__copied.push(t.length); return Promise.resolve(); } } }); });
  await page.locator('#nx-log-panel .nx-footer button', { hasText: 'Copy' }).tap(); await wait(500);
  const sub1 = await page.evaluate(() => document.querySelector('#nx-log-panel .nx-log-sub').textContent);
  const copied = await page.evaluate(() => ({ web: window.__copied, plugin: (window.__calls || []).filter((c) => /lipboard/.test(c.key)).map((c) => c.key + ':' + String(c.args[0]).length) }));
  ok('Copy says "Copied N lines" and put the whole log on the clipboard once (the app\'s clipboard plugin, else the browser)', /^Copied [\d,]+ lines?$/.test(sub1) && (copied.web.length + copied.plugin.length) === 1, [sub1, copied]);
  await wait(2800);
  ok('...and the line goes back to its normal text after a moment', /secrets are masked/.test(await page.evaluate(() => document.querySelector('#nx-log-panel .nx-log-sub').textContent)));
  const before = await page.evaluate(() => document.querySelector('#nx-log-panel pre').textContent.length);
  await page.locator('#nx-log-panel .nx-footer button', { hasText: 'Clear' }).tap(); await wait(400);
  const armed = await page.evaluate(() => ({ label: document.querySelector('#nx-log-panel .nx-footer button').textContent, len: document.querySelector('#nx-log-panel pre').textContent.length }));
  ok('the first tap on Clear only asks ("Clear all?"); nothing is deleted', armed.label === 'Clear all?' && armed.len === before, [armed, before]);
  await wait(3300);
  ok('...and it gives up asking after 3 s', (await page.evaluate(() => document.querySelector('#nx-log-panel .nx-footer button').textContent)) === 'Clear');
  await page.locator('#nx-log-panel .nx-footer button', { hasText: 'Clear' }).tap(); await wait(300);
  await page.locator('#nx-log-panel .nx-footer button', { hasText: 'Clear all?' }).tap(); await wait(500);
  const cleared = await page.evaluate(() => ({ sub: document.querySelector('#nx-log-panel .nx-log-sub').textContent, len: document.querySelector('#nx-log-panel pre').textContent.length }));
  ok('the second tap clears the log and says "Cleared"', cleared.sub === 'Cleared' && cleared.len < before / 4, cleared);
  await page.keyboard.press('Escape'); await wait(800);
  await stopWorks('after Copy and Clear');

  // ------------------------------------------------------------------ the button: docked in the setup wizard only
  await page.evaluate(() => { localStorage.setItem('keyHomes', '[]'); localStorage.removeItem('keyIsFirstSetupCompleted'); });
  await page.reload({ waitUntil: 'load' }); await wait(3000);
  const dock = await page.evaluate(() => {
    const b = document.getElementById('nx-log-button'), cs = getComputedStyle(b), r = b.getBoundingClientRect();
    return { hash: location.hash, chip: document.documentElement.getAttribute('data-nx-chip'), display: cs.display, pos: cs.position, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), name: b.getAttribute('aria-label'), tag: b.tagName };
  });
  ok('without an accessory the button is docked in the header: a real <button> named "Debug log", 48x48 at 100,16', dock.chip === '0' && dock.display !== 'none' && dock.pos === 'fixed' && dock.tag === 'BUTTON' && dock.name === 'Debug log' && dock.w === 48 && dock.h === 48 && dock.x === 100 && dock.y === 16, dock);
  const vis = await page.evaluate(() => { const b = document.getElementById('nx-log-button'); const cs = getComputedStyle(b); return { radius: cs.borderTopLeftRadius, bg: cs.backgroundClip, border: cs.borderTopWidth }; });
  ok('it looks 32 dp (an 8 dp transparent border) in a 48 dp hit area', vis.border === '8px' && vis.bg === 'padding-box', vis);
  await shot('docked-' + (process.env.SHOTSUFFIX || 'x'));
  await page.locator('#nx-log-button').tap(); await wait(1200);
  ok('a tap on the docked button opens the log', await isOpen());
  await page.keyboard.press('Escape'); await wait(800);
  ok('...and Escape closes it and gives the focus back to the button', !(await isOpen()) && await page.evaluate(() => document.activeElement && document.activeElement.id === 'nx-log-button'));
  const overlaps = [];
  for (const r of ['#/start-home', '#/start-email', '#/benvenuto/1', '#/connetti-IT4WIFI', '#/rete-wifi', '#/ricerca-dispositivo', '#/accendi-dispositivo', '#/scelta-accessorio']) {
    await goto(r, 1500);
    const o = await page.evaluate(() => {
      const b = document.getElementById('nx-log-button'), br = b.getBoundingClientRect(), shown = getComputedStyle(b).display !== 'none';
      const hits = [];
      Array.from(document.querySelectorAll('.bar .button, .bar .title, input, .item, .button')).forEach((e) => {
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('#nx-log-button, [inert]')) return;
        let q; if (e.classList.contains('title')) { if (!(e.textContent || '').trim()) return; const rg = document.createRange(); rg.selectNodeContents(e); q = rg.getBoundingClientRect(); } else q = e.getBoundingClientRect();
        if (q.width > 0 && q.height > 0 && Math.min(q.right, br.right) - Math.max(q.left, br.left) > 1 && Math.min(q.bottom, br.bottom) - Math.max(q.top, br.top) > 1) hits.push(e.className.toString().slice(0, 30));
      });
      return { shown, hits };
    });
    if (o.shown && o.hits.length) overlaps.push(r + ' ' + o.hits.join(','));
  }
  ok('docked on the setup pages: it covers no button, title or input there (a page without room hides it)', overlaps.length === 0, overlaps);
  console.log(fails ? 'FAILED ' + fails + ' of ' + total : 'ALL OK (' + total + ' checks)');
};
