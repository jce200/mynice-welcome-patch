// nx23 qa (gate + command): where is the keyboard focus after the button of the line is pressed (the button goes away when the line changes)?
//   CFG='{"reachable":false,"verifyFail":true,"statusFail":true}' VIEW=360x640 SCRIPT=steps-qa-focus.cjs node screens.cjs qa-gate-focus '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { reporter, DETAIL, state } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  await goto(DETAIL, 6500);
  let s = await state(page);
  console.log('LINE ' + JSON.stringify(s));
  await page.focus('.nx-line-act');
  const before = await page.evaluate(() => document.activeElement.className);
  await page.keyboard.press('Enter');
  await wait(800);
  const after = await page.evaluate(() => { const e = document.activeElement; return { tag: e.tagName, cls: String(e.className).slice(0, 50), inLine: !!e.closest('.nx-line') }; });
  console.log('FOCUS before ' + before + ' after ' + JSON.stringify(after) + ' line ' + JSON.stringify((await state(page)).text));
  await shot('f1-after-enter');
  R.check('after Enter on the button of the line, the focus is not lost to the page (it stays in the line)', after.tag !== 'BODY' && after.inLine, after);
  R.done();
};
