// nx23 (dialogs): SCRIPT=steps-a11y.cjs. The semantic layer in the real app: roles, names, tab stops, headings, the language, and the keyboard.
//   CFG='{"secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]}' VIEW=360x640 SCRIPT=steps-a11y.cjs node screens.cjs dlg-a11y '#/tabs/favorites'
// It prints one line per check ("ok" / "FAIL") and ends with a count; a hook that another workstream renames fails here, loudly.
// Key presses wait 700 ms between commands: the app's own runCommand ignores a command within 500 ms of the one before.
// A touch is a real tap (page.tap: touchstart, touchend); a click() is what a key press or TalkBack's double tap makes. Both must send exactly one command.
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  let fails = 0, total = 0;
  const ok = (name, cond, extra) => { total++; if (!cond) fails++; console.log((cond ? 'ok    ' : 'FAIL  ') + name + (cond || extra === undefined ? '' : '  -> ' + JSON.stringify(extra))); };
  const cdp = await page.context().newCDPSession(page);
  const ax = async () => {
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    return nodes.filter((n) => !n.ignored).map((n) => ({ role: n.role && n.role.value, name: (n.name && n.name.value) || '', value: n.value && n.value.value, props: Object.fromEntries((n.properties || []).map((p) => [p.name, p.value && p.value.value])) }));
  };
  const commands = () => page.evaluate(() => (window.__calls || []).filter((c) => /^nhk\.execute(Primary|Secondary)Command$/.test(c.key)).map((c) => c.key + ':' + JSON.stringify(c.args).slice(0, 60)));
  const focusedName = () => page.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute('aria-label') || (a.textContent || '').replace(/\s+/g, ' ').trim() || a.tagName).slice(0, 40) : ''; });
  const pad = (key) => page.locator('.device-commands .command:has([translate$="_' + key + '"])');

  // ------------------------------------------------------------------ the accessory screen
  await goto('#/tabs/favorites-device-detail/1/' + M, 2500);
  let nodes = await ax();
  const buttons = nodes.filter((n) => n.role === 'button' || n.role === 'link');
  ok('accessory: no button without a name', buttons.every((b) => b.name), buttons.filter((b) => !b.name));
  const names = buttons.map((b) => b.name);
  ok('accessory: Back and More commands are named', names.includes('Back') && names.includes('More commands'), names);
  ok('accessory: the pad is three named buttons', ['Open the gate', 'Stop the gate', 'Close the gate'].every((n) => nodes.some((x) => x.role === 'button' && x.name === n)), names);
  ok('accessory: the line of the last movement is a button (it opens a dialog)', await page.evaluate(() => { const l = document.querySelector('.nx-last'); const native = !!l && l.tagName === 'BUTTON' && !l.disabled; return !!l && (native || (l.getAttribute('role') === 'button' && l.getAttribute('tabindex') === '0')) && l.getAttribute('aria-haspopup') === 'dialog'; }), names);
  ok('accessory: a tab list with the page as the current tab', nodes.some((n) => n.role === 'tablist') && nodes.filter((n) => n.role === 'tab').length === 3, nodes.filter((n) => /tab/.test(n.role)).map((n) => n.role + ':' + n.name));
  const heads = nodes.filter((n) => n.role === 'heading');
  ok('accessory: one level-1 heading, with the status in its name', heads.filter((h) => h.props.level === 1).length === 1 && /Accessory|checking|Connecting|online|AABBCC/i.test(heads[0].name), heads);
  ok('accessory: the active tab is aria-current=page, the others are not', await page.evaluate(() => Array.from(document.querySelectorAll('.tab-item')).filter((t) => t.getAttribute('aria-current') === 'page').length === 1 && document.querySelector('.tab-item-active').getAttribute('aria-current') === 'page'));
  ok('accessory: the language of the page is set', await page.evaluate(() => /^[a-z]{2}(-|$)/.test(document.documentElement.lang)), await page.evaluate(() => document.documentElement.lang));
  ok('accessory: the state of the gate is a live region (status)', nodes.some((n) => n.role === 'status' && /Closed|Open|Stop|Checking|Connecting|Not/i.test(n.name)) || await page.evaluate(() => { const r = document.querySelector('.device-info .device-row:first-child, .nx-state'); return !!r && r.getAttribute('role') === 'status'; }));
  ok('accessory: the screens that were left have no Back or eye button in the page', names.filter((n) => n === 'More commands').length === 1 && names.filter((n) => n === 'Back').length <= 1, names);
  ok('accessory: the layer reported no error', await page.evaluate(() => (window.__nxA11y && window.__nxA11y.errors || []).length === 0), await page.evaluate(() => window.__nxA11y && window.__nxA11y.errors));
  await shot('a11y-accessory');

  // ------------------------------------------------------------------ the Tab order
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); document.body.focus(); });
  const order = [];
  for (let i = 0; i < 16; i++) { await page.keyboard.press('Tab'); order.push(await focusedName()); }
  console.log('tab order:', JSON.stringify(order));
  const at = (n) => order.findIndex((x) => x.indexOf(n) === 0);
  ok('tab order: Back, then the status chip, then More commands, then the tabs, then the Activity entry, then the pad (Open, Stop, Close)',
    at('Back') >= 0 && at('Back') < at('Accessory') && at('Accessory') < at('More commands') && at('More commands') < at('Favorites') && at('Favorites') < at('Activity') && at('Activity') < at('Open the gate') && at('Open the gate') < at('Stop the gate') && at('Stop the gate') < at('Close the gate'), order);
  ok('tab order: Stop is the second stop of the pad, never first (nothing autofocuses a command)', at('Stop the gate') === at('Open the gate') + 1 && (await page.evaluate(() => (window.__calls || []).filter((c) => /execute/.test(c.key)).length)) === 0);

  // ------------------------------------------------------------------ the gate by keyboard and by touch: one command each, never two
  const n0 = (await commands()).length;
  await pad('open').evaluate((e) => e.focus());
  await page.keyboard.press('Enter'); await wait(700);
  ok('keyboard: Enter on Open sends one command', (await commands()).length === n0 + 1, await commands());
  await pad('stop').evaluate((e) => e.focus());
  await page.keyboard.press('Space'); await wait(700);
  ok('keyboard: Space on Stop sends one command', (await commands()).length === n0 + 2, await commands());
  await pad('close').evaluate((e) => e.focus());
  await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter'); await wait(700);
  ok('keyboard: a held Enter sends one command (no queue of commands)', (await commands()).length === n0 + 3, await commands());
  await pad('open').tap(); await wait(700);
  ok('touch: a real tap on Open sends exactly one command (the click filter does not double it)', (await commands()).length === n0 + 4, await commands());
  await pad('stop').tap(); await wait(700);
  ok('touch: a real tap on Stop sends exactly one command', (await commands()).length === n0 + 5, await commands());
  await pad('close').tap(); await wait(700);
  ok('touch: a real tap on Close sends exactly one command', (await commands()).length === n0 + 6, await commands());
  const viaClick = await page.evaluate(() => new Promise((res) => {
    const before = (window.__calls || []).filter((c) => /execute/.test(c.key)).length;
    document.querySelector('.device-commands .command:not(.nx-extra)').click();     // what TalkBack's double tap does: a click with detail 0
    setTimeout(() => res((window.__calls || []).filter((c) => /execute/.test(c.key)).length - before), 400);
  }));
  ok('click(): a click with detail 0 on the pad sends one command (Ionic would drop it without the filter)', viaClick === 1, viaClick);
  await wait(700);

  // ------------------------------------------------------------------ Activity by keyboard
  await page.locator('.nx-last').evaluate((e) => e.focus());
  await page.keyboard.press('Enter'); await wait(1200);
  ok('keyboard: Enter on the Activity line opens the sheet and the focus is in it', await page.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#nx-activity'); }), await focusedName());
  await page.keyboard.press('Escape'); await wait(900);
  ok('keyboard: Escape closes it and the focus returns to the line', await page.evaluate(() => !document.querySelector('#nx-activity.nx-open') && document.activeElement && document.activeElement.classList.contains('nx-last')), await focusedName());

  // ------------------------------------------------------------------ Settings: tabs, the theme group, the swatches, the Design row, a switch
  await goto('#/tabs/settings/false', 2000);
  nodes = await ax();
  const sb = nodes.filter((n) => n.role === 'button' || n.role === 'link');
  ok('settings: no button without a name', sb.every((b) => b.name), sb.filter((b) => !b.name));
  ok('settings: no Back or More commands of the previous page in the tree', !nodes.some((n) => n.name === 'More commands') && nodes.filter((n) => n.name === 'Back').length === 0, nodes.filter((n) => /Back|More/.test(n.name)));
  ok('settings: exactly one level-1 heading', nodes.filter((n) => n.role === 'heading' && n.props.level === 1).length === 1, nodes.filter((n) => n.role === 'heading'));
  ok('settings: the Settings tab is current', await page.evaluate(() => { const t = document.querySelector('.tab-item.tab-item-active'); return !!t && t.getAttribute('aria-current') === 'page' && !!t.querySelector('.icon-settings'); }));
  ok('settings: the theme and the colors are radio groups with one tab stop each', await page.evaluate(() => Array.from(document.querySelectorAll('[role=radiogroup]')).every((g) => g.querySelectorAll('[role=radio][tabindex="0"]').length === 1)));
  const themeBefore = await page.evaluate(() => window.NX.theme());
  await page.locator('.nx-seg [role=radio][tabindex="0"]').first().evaluate((e) => e.focus());
  await page.keyboard.press('ArrowRight'); await wait(400);
  const themeAfter = await page.evaluate(() => window.NX.theme());
  ok('keyboard: ArrowRight in the theme group changes the theme and moves the focus', themeAfter !== themeBefore && await page.evaluate(() => document.activeElement.getAttribute('role') === 'radio' && document.activeElement.getAttribute('aria-checked') === 'true'), [themeBefore, themeAfter]);
  await page.keyboard.press('Space'); await wait(200);
  await page.evaluate(() => window.NX.theme('auto'));
  ok('keyboard: the swatches are reachable (a radio per palette, named)', await page.evaluate(() => Array.from(document.querySelectorAll('.nx-swatch')).length === 7 && Array.from(document.querySelectorAll('.nx-swatch')).every((s) => s.getAttribute('aria-label'))));
  await page.locator('.nx-swatch[tabindex="0"]').first().evaluate((e) => e.focus());
  await page.keyboard.press('ArrowRight'); await wait(300);
  ok('keyboard: ArrowRight in the colors picks the next palette', await page.evaluate(() => window.NX.palette()) !== 'midnight', await page.evaluate(() => window.NX.palette()));
  await page.evaluate(() => window.NX.palette('midnight'));
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.list .item[data-ng-click], .list .item[ng-click]')).filter((r) => !/^(BUTTON|INPUT)$/.test(r.tagName) && !(r.tagName === 'A' && r.hasAttribute('href'))).map((r) => [r.getAttribute('role'), r.getAttribute('tabindex')].join('|')));
  ok('settings: every row with a click handler is a button with a tab stop', rows.length > 3 && rows.every((r) => r === 'button|0'), rows);
  await page.locator('.nx-design-row').evaluate((e) => e.focus());
  await page.keyboard.press('Enter'); await wait(1200);
  ok('keyboard: Enter on the Design row opens the page and the focus is in it', await page.evaluate(() => !!document.activeElement.closest('#nx-gallery')), await focusedName());
  await page.keyboard.press('Escape'); await wait(900);
  ok('keyboard: Escape closes the Design page, the hash is still Settings', await page.evaluate(() => !document.querySelector('#nx-gallery.nx-open') && /settings/.test(location.hash)), await page.evaluate(() => location.hash));

  // ------------------------------------------------------------------ the optional-command switch and a native radio
  await goto('#/tabs/settings-4th-button/1/' + M, 2000);
  const sw = await page.evaluate(() => { const l = document.querySelector('label.toggle'); return l && { role: l.getAttribute('role'), tab: l.getAttribute('tabindex'), name: l.getAttribute('aria-label'), checked: l.getAttribute('aria-checked') }; });
  ok('switch: the optional-command toggle is a switch with a name and a tab stop', !!sw && sw.role === 'switch' && sw.tab === '0' && /extra|optional|enable/i.test(sw.name || ''), sw);
  if (sw) {
    await page.locator('label.toggle').evaluate((e) => e.focus());
    const before = await page.evaluate(() => document.querySelector('label.toggle input').checked);
    await page.keyboard.press('Space'); await wait(500);
    const after = await page.evaluate(() => ({ checked: document.querySelector('label.toggle input').checked, aria: document.querySelector('label.toggle').getAttribute('aria-checked') }));
    ok('keyboard: Space toggles the switch and aria-checked follows', after.checked !== before && after.aria === String(after.checked), [before, after]);
  }
  await goto('#/tabs/settings-connection-mode', 2000);
  const r0 = await page.evaluate(() => Array.from(document.querySelectorAll('label.item-radio input')).map((i) => i.checked));
  await page.locator('label.item-radio input').nth(r0.indexOf(true) === 0 ? 1 : 0).evaluate((e) => e.focus());
  await page.keyboard.press('Space'); await wait(500);
  const r1 = await page.evaluate(() => Array.from(document.querySelectorAll('label.item-radio input')).map((i) => i.checked));
  ok('keyboard: Space on a native radio of Connection mode selects it (Ionic would swallow the click)', JSON.stringify(r0) !== JSON.stringify(r1), [r0, r1]);

  // ------------------------------------------------------------------ a wizard page: progress, no heading from the chip
  await page.evaluate(() => { localStorage.setItem('keyHomes', '[]'); localStorage.removeItem('keyIsFirstSetupCompleted'); });
  await page.reload({ waitUntil: 'load' }); await wait(2500);
  await goto('#/connetti-IT4WIFI', 2200);
  nodes = await ax();
  const pb = nodes.find((n) => n.role === 'progressbar');
  ok('wizard: the progress strip is a progress bar with a value', !!pb && +pb.value > 0 && /progress/i.test(pb.name), pb);
  ok('wizard: html[data-nx-chip] is 0 without an accessory', await page.evaluate(() => document.documentElement.getAttribute('data-nx-chip')) === '0');
  const hs = nodes.filter((n) => n.role === 'heading' && n.props.level === 1);
  ok('wizard: no level-1 heading made of the chip alone', hs.every((h) => h.name && !/^Accessory (online|checking)/.test(h.name)), hs);
  await goto('#/ricerca-dispositivo', 1800);
  ok('wizard: the page with the search is aria-busy while the spinner runs', await page.evaluate(() => !!document.querySelector('ion-spinner') ? !!document.querySelector('[aria-busy="true"]') : true));

  // ------------------------------------------------------------------ the focus ring: pictures of a focused pad button, the chip, a tab, a row, a swatch (a keyboard has been used, so :focus-visible shows)
  await page.evaluate(() => { localStorage.setItem('keyHomes', JSON.stringify([{ homeId: 1, name: 'Home', phoneName: 'Pixel', userName: 'homeuser', networkSsid: 'HomeWifi', networkPassword: 'x', devices: [{ mac: '00:0B:6C:AA:BB:CC', name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', address: '192.168.1.72', homeId: 1, pairingUsername: 'homeuser', pairingPassword: 'x', reachable: true, favorites: true, paired: true, permissions: { isAdmin: true, isUser: true }, properties: [{ value: 'closed' }, { value: '0' }], automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'], properties: [] }] }] }])); localStorage.setItem('keyIsFirstSetupCompleted', 'true'); });
  await page.reload({ waitUntil: 'load' }); await wait(2500);
  await goto('#/tabs/favorites-device-detail/1/' + M, 2200);
  await page.keyboard.press('Shift');
  const ring = async (name, sel) => { await page.locator(sel).first().evaluate((e) => e.focus()); await wait(250); await shot('focus-' + name); return page.evaluate(() => { const e = document.activeElement, cs = getComputedStyle(e); return { outline: cs.outlineStyle + ' ' + cs.outlineWidth }; }); };
  const rOpen = await ring('open', '.device-commands .command:has([translate$="_open"])');
  ok('focus ring: the pad button gets a 3 px outline', /solid 3px/.test(rOpen.outline), rOpen);
  await ring('chip', '.nx-chip:visible');       // a real button in the title of the header; the DOM holds four (two nav-bars x active/cached), only one has a box
  ok('focus ring: the chip shows it (3 px, drawn by the pill, inside the 48 dp hit area)', await page.evaluate(() => { const c = document.activeElement, cs = getComputedStyle(c, '::before'); return c.classList.contains('nx-chip') && c.getBoundingClientRect().height === 48 && cs.outlineStyle === 'solid' && cs.outlineWidth === '3px' && cs.outlineOffset === '-3px'; }));
  const rTab = await ring('tab', '.tab-item[aria-selected="false"]');
  ok('focus ring: a tab', /solid 3px/.test(rTab.outline), rTab);
  await goto('#/tabs/settings/false', 2000);
  await page.keyboard.press('Shift');
  const rRow = await ring('row', '.nx-design-row');
  ok('focus ring: a Settings row', /solid 3px/.test(rRow.outline), rRow);
  await ring('swatch', '.nx-swatch[tabindex="0"]');
  ok('focus ring: the swatch shows a thick rim in the focus color (a clip-path would cut an outline)', await page.evaluate(() => { const s = document.querySelector('.nx-swatch[tabindex="0"]'); const cs = getComputedStyle(s, '::before'); const r = s.getBoundingClientRect(); return r.width === 48 && r.height === 48 && cs.top === '1px' && cs.backgroundColor !== getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-outline-variant'); }));
  await ring('segment', '.nx-seg [role=radio][tabindex="0"]');

  console.log(fails ? 'FAILED ' + fails + ' of ' + total : 'ALL OK (' + total + ' checks)');
};
