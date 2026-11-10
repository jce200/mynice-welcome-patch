// nx23 qa (command): the state could not be read at all (the request for it fails): the screen must say so, and Refresh must work once the accessory answers
//   CFG='{"statusFail":true,"state":"open"}' VIEW=360x640 SCRIPT=steps-qa-neverread.cjs node screens.cjs qa-gate-neverread '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { activate, state, reporter, DETAIL, calls } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  if (process.env.HUNG) {
    // the request for the state never comes back (CFG statusDelay 100000): checking, "still checking" and, after 45 s, not silent
    await goto(DETAIL, 3000);
    let h = await state(page);
    R.check('3 s: checking', h.trust === 'checking' && h.text === 'Checking the gate\u2026', h);
    await wait(9000);
    h = await state(page);
    R.check('12 s: "Still checking. The accessory is slow to answer."', h.text === 'Still checking. The accessory is slow to answer.', h);
    await wait(36000);
    h = await state(page);
    console.log('HUNG 48 s ' + JSON.stringify(h));
    R.check('48 s: stale ("State not read. Showing the stored one." + Refresh), not an empty line over the stored state', h.trust === 'stale' && h.text === 'State not read. Showing the stored one.' && h.act === 'Refresh', h);
    await shot('h1-hung');
    R.done();
    return;
  }
  await goto(DETAIL, 3500);
  let s = await state(page);
  const chip = await page.evaluate(() => document.documentElement.style.getPropertyValue('--nx-sub'));
  console.log('NEVERREAD ' + JSON.stringify(s) + ' chip ' + chip);
  R.check('the request for the state failed: stale, "State not read. Showing the stored one." with Refresh', s.trust === 'stale' && s.kind === 'warn' && s.text === 'State not read. Showing the stored one.' && s.act === 'Refresh', s);
  const word = await page.evaluate(() => Array.from(document.querySelectorAll('[nav-view="active"] .nx-state strong')).filter((e) => !e.classList.contains('ng-hide')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join('/'));
  console.log('WORD ' + word);
  await shot('n1-neverread');
  // the accessory answers now
  await page.evaluate(() => { window.__NATIVE['nhk.status'] = () => ({ interface: { settings: [{ value: 'AABBCC' }] }, devices: [{ properties: [{ value: 'closing' }, { value: '0' }] }] }); });
  const n0 = (await calls(page, 'nhk.status')).length;
  await activate(page);
  await wait(900);
  s = await state(page);
  R.check('Refresh: one request, the state is read: live, the hero says Closing, the line is empty', (await calls(page, 'nhk.status')).length === n0 + 1 && s.trust === 'live' && s.text === '', [s, await calls(page, 'nhk.status')]);
  await shot('n2-read');
  R.done();
};
