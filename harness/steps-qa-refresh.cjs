// nx23 qa (command): Refresh / Reconnect after the person has been on other pages (Ionic keeps cached views: the first .device-commands in the DOM may not be the visible one)
//   CFG='{"trustTimes":{"StateFreshMs":3000,"StateStaleMs":7000},"activityTimes":{"PollMs":0,"PrefetchMs":100000000},"secondary":["MDBk"],"fourth":"MDBk"}' VIEW=360x640 SCRIPT=steps-qa-refresh.cjs node screens.cjs qa-gate-refresh '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { activate, state, calls, reporter, DETAIL, COMMANDS } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  await goto(DETAIL, 1500);
  await goto(COMMANDS, 1500);
  await goto(DETAIL, 1500);
  await goto('#/tabs/settings/false', 1200);
  await goto(DETAIL, 1500);
  const dom = await page.evaluate(() => ({ lines: document.querySelectorAll('.nx-line').length, pads: document.querySelectorAll('.device-commands').length, views: Array.from(document.querySelectorAll('[nav-view]')).map((v) => v.getAttribute('nav-view')).join(',') }));
  console.log('DOM after visiting other pages: ' + JSON.stringify(dom));
  await wait(9000);   // stale after 7 s without news (nothing reads the log: PollMs 0)
  let s = await state(page);
  R.check('stale again after the visits: "Last confirmed hh:mm" with Refresh', s.trust === 'stale' && s.act === 'Refresh', s);
  const n0 = (await calls(page, 'nhk.status')).length;
  await activate(page);
  await wait(900);
  s = await state(page);
  R.check('Refresh asks once and the state is live again (' + n0 + ' -> ' + (await calls(page, 'nhk.status')).length + ' status requests)', (await calls(page, 'nhk.status')).length === n0 + 1 && s.trust === 'live', [s, await calls(page, 'nhk.status')]);
  R.done();
};
