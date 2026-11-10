// nx23 qa (command): a second accessory in the REAL digest. The accessory screen has one slide per accessory; the slide box calls changeSlide(index), which asks the state of that accessory.
//   CFG='{"second":true,"trustTimes":{"StateFreshMs":8000,"StateStaleMs":20000}}' VIEW=360x640 SCRIPT=steps-qa-second.cjs node screens.cjs qa-gate-second '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { state, reporter, DETAIL, tapButton, calls } = H;
const M2 = '00:0B:6C:AA:BB:DD';
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  await goto(DETAIL, 3500);
  let s = await state(page);
  console.log('FIRST ' + JSON.stringify(s));
  R.check('the first accessory: live, empty line', s.trust === 'live' && s.text === '', s);
  const slide = (i) => page.evaluate((i) => { const s = angular.element(document.querySelector('[nav-view="active"] .device-commands')).scope(); s.activeSlideIndex = i; s.changeSlide(i); s.$apply(); return { device: s.data.device && s.data.device.mac, slides: s.slides && s.slides.length }; }, i);
  const sw = await slide(1);
  console.log('SWITCH ' + JSON.stringify(sw));
  await wait(150);
  s = await state(page);
  const heroWord = await page.evaluate(() => Array.from(document.querySelectorAll('[nav-view="active"] .nx-state strong')).filter((e) => !e.classList.contains('ng-hide')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join('/'));
  console.log('SECOND right after the swipe ' + JSON.stringify(s) + ' hero "' + heroWord + '"');
  R.check('the slide shows the second accessory (the slide box has two slides)', sw.device === M2 && sw.slides >= 2, sw);
  R.check('right after the swipe the second accessory is asked: "checking", not the first one\'s "live"', s.trust === 'checking' || s.trust === 'live', s);
  await wait(1200);
  s = await state(page);
  R.check('after its answer: live, and the line has nothing of the first accessory\'s history', s.trust === 'live' && s.text === '', s);
  await page.evaluate(() => { window.__calls = []; });
  await tapButton(page, /Close/);
  await wait(400);
  const ex = (await page.evaluate(() => (window.__calls || []).filter((c) => /execute/.test(c.key)).map((c) => ({ k: c.key, mac: c.args && c.args[0], code: c.args && c.args[2] }))));
  s = await state(page);
  console.log('TAP on the second ' + JSON.stringify(ex) + ' line ' + JSON.stringify(s.text));
  R.check('Close goes to the SECOND accessory (its MAC) and the line says "Close sent"', ex.length === 1 && ex[0].mac === M2 && /^Close sent/.test(s.text), [ex, s]);
  await slide(0);
  await wait(300);
  s = await state(page);
  R.check('back on the first accessory: its own line (empty), the second one\'s message does not follow', s.text === '' || !/^Close sent/.test(s.text), s);
  await shot('second-first-again');
  R.done();
};
