// SCRIPT=steps-stale.cjs: a Block that this phone gave hours ago ("Open and Block", kept by the app in localStorage), which someone released with
// another app; after that the accessory restarted and forgot its log. Home Assistant then opens the gate and the gate closes by itself (the controller
// reports both). A blocked gate does not move, so the screen must not say "Blocked" (nx17); nx15 and nx16 kept saying "Blocked? since ..." (the question
// mark is the restart). Prints what the screen and the sheet say, and takes the screen and the top of the sheet.
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  await page.evaluate((m) => {
    const now = Date.now(), MIN = 60000;
    localStorage.setItem('nxBlock', JSON.stringify({ [m]: { blocked: true, at: now - 180 * MIN, code: 'MDBk', who: 'homeuser' } }));
    const e = (source, type, time, device, n) => ({ deviceId: device ? '1' : '', source, type, time, idx: String(n), id: String(n) });
    window.__logsOverride = {
      interfaceLogs: [e('boot', 'Power ON', now - 60 * MIN, false, 1), e('boot', 'T4 device not found', now - 60 * MIN + 30000, false, 2), e('boot', 'T4 device found', now - 60 * MIN + 31000, false, 3)],
      deviceLogs: [e('busT4', 'stop', now - 60 * MIN + 32000, true, 4),                    // the controller tells its state while the accessory starts
        e('HA-CONTROLLER-9', 'open', now - 4 * MIN, true, 5), e('busT4', 'open', now - 4 * MIN + 1000, true, 6),     // Home Assistant opens the gate
        e('busT4', 'close', now - 90000, true, 7)]                                          // ...and the controller closes it by itself
    };
  }, M);
  await goto('#/tabs/favorites-device-detail/1/' + M, 5200);
  console.log('pill :', JSON.stringify(await text('.nx-block')));
  console.log('line :', JSON.stringify(await text('.nx-last-text')));
  console.log('store:', JSON.stringify(await page.evaluate((m) => { const r = JSON.parse(localStorage.getItem('nxBlock') || '{}')[m] || {}; return { blocked: r.blocked, code: r.code, inferred: r.inferred || false }; }, M)));
  await shot('stale');
  await page.locator('.nx-last').tap();
  await wait(1800);
  console.log('sheet:', JSON.stringify(await page.evaluate(() => { const b = document.querySelector('#nx-activity .nx-act-block'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; })));
  await shot('stale-sheet');
};
