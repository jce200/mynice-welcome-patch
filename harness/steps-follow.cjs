// SCRIPT=steps-follow.cjs: the pill and the line follow what ANOTHER app does with the gate (nx16). Needs CFG='{"activity":"blocked"}': the last
// thing in the log is an "Open and Block" of 20 minutes ago. The script then plays the other app: it puts commands into the log of the
// simulated accessory (window.__extraLogs) and, as the accessory and the phone would, sends a report of the state or the "resume" of the app.
// It counts how often the log is read (nhk.logs) and prints what the screen says after each step.
// FAST=1 waits only as long as the shortened times of the readings need (CFG activityTimes, e.g. {"ResumeMs":500,"PollMs":3000}); without it the real times
// are used (the timer is 30 s, so that step takes more than half a minute).
module.exports = async (page, { goto, wait, shot }) => {
  const lines = [];
  page.on('console', (m) => { const t = m.text(); if (/^\[NX\] (activity|block|state):/.test(t)) lines.push(t.replace(/^\[NX\] /, '')); });
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  const reads = () => page.evaluate(() => (window.__calls || []).filter((c) => c.key === 'nhk.logs').length);
  const users = () => page.evaluate(() => (window.__calls || []).filter((c) => c.key === 'nhk.pairings').length);
  const show = async (what) => console.log(what.padEnd(46), '| pill:', JSON.stringify(await text('.nx-block')), '| line:', JSON.stringify(await text('.nx-last-text')), '| reads:', await reads(), 'users:', await users());
  const other = (type, source, extra) => page.evaluate(([t, s, x]) => {
    window.__extraLogs = (window.__extraLogs || []).concat([{ deviceId: '1', source: s, type: t, time: Date.now(), idx: String(900 + (window.__extraLogs || []).length), id: 'x' }].concat(x || []));
  }, [type, source, extra]);
  const fast = !!process.env.FAST;

  await goto('#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC', 5200);
  await show('1. screen opened (the Block of 20 min ago)');
  await shot('follow-1-blocked');

  // 2. the user leaves this app for a while, the official app gives a plain "Release" (the gate does not move, so the accessory reports nothing),
  //    and coming back to this app is the moment (a reading of less than 5 seconds ago is not repeated: wait for that first)
  await wait(5500);
  await other('MDEw', 'CTRL-ANNA-0001');
  await show('2. other app: Release (nothing told this app)');
  await page.evaluate(() => cordova.fireDocumentEvent('resume'));       // as Cordova does it (a plain DOM event does not reach the handlers that cordova.js keeps)
  await wait(fast ? 3500 : 4500);
  await show('   ...this app comes back to the front (resume)');
  await shot('follow-2-released');

  // 3. another phone blocks it (a plain Block): nothing moves, nothing is reported; only the timer on the screen can see it
  await other('MDBm', 'CTRL-BEN-00002');
  await show('3. other phone: Block (nothing told this app)');
  await wait(fast ? 4500 : 34000);
  await show('   ...the screen stays open (timer)');
  await shot('follow-3-blocked-again');

  // 4. the official app gives "Release and Close": the gate moves, the accessory reports it, and the log has the command
  await other('MDFh', 'CTRL-ANNA-0001', [{ deviceId: '1', source: 'busT4', type: 'close', time: Date.now() + 500, idx: '950', id: 'y' }]);
  await page.evaluate(() => { const e = new Event('newDeviceState'); e.mac = '00:0B:6C:AA:BB:CC'; e.deviceId = '1'; e.state = 'closing'; e.obstruct = '0'; window.dispatchEvent(e); });
  await show('4. other app: Release and Close (a report: closing)');
  await wait(5200);
  await show('   ...4 seconds after the report');
  await shot('follow-4-closed');

  console.log('--- LOG lines of this run (activity / block / state), without the state requests');
  lines.filter((l) => !/^state: (status of|the accessory declares)/.test(l)).forEach((l) => console.log('  ' + l));
};
