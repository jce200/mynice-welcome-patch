// nx23 qa (gate): the Blocked pill opens the Activity sheet at its Blocked card, the Activity chip has its spoken name, the order of the Tab key on the accessory screen
//   CFG='{"state":"open","activity":"blocked","secondary":["MDBk","MDFh"],"fourth":"MDBk","quick":["MDBk","MDFh"]}' VIEW=360x640 SCRIPT=steps-qa-misc.cjs node screens.cjs qa-gate-misc '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { reporter, DETAIL } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  await goto(DETAIL, 4500);
  const names = await page.evaluate(() => {
    const act = document.querySelector('[nav-view="active"]');
    const q = (s) => act.querySelector(s);
    return { chip: q('.nx-last') && { name: q('.nx-last').getAttribute('aria-label'), text: q('.nx-last').textContent.replace(/\s+/g, ' ').trim(), role: q('.nx-last').tagName, popup: q('.nx-last').getAttribute('aria-haspopup'), h: q('.nx-last').getBoundingClientRect().height, hit: getComputedStyle(q('.nx-last'), '::after').top + '/' + getComputedStyle(q('.nx-last'), '::after').bottom },
      pill: q('.nx-pill') && { name: q('.nx-pill').getAttribute('aria-label'), text: q('.nx-pill').textContent.replace(/\s+/g, ' ').trim(), tag: q('.nx-pill').tagName }, line: q('.nx-line') && { role: q('.nx-line').getAttribute('role'), live: q('.nx-line').getAttribute('aria-live') },
      extras: q('.nx-extras') && { role: q('.nx-extras').getAttribute('role'), label: q('.nx-extras').getAttribute('aria-label'), cap: q('.nx-extras-cap').textContent } };
  });
  console.log('NAMES ' + JSON.stringify(names));
  R.check('the Activity chip is a button with the spoken name "Activity. Last command: ..."', names.chip && names.chip.role === 'BUTTON' && /^Activity\. Last command: .*Opens the history\.$/.test(names.chip.name || ''), names.chip);
  R.check('the Blocked pill is a button with a name that says where it goes', names.pill && names.pill.tag === 'BUTTON' && /^Blocked · since .*Opens the history\.$/.test(names.pill.name || ''), names.pill);
  R.check('the extras are a group named "Extra buttons" with the caption "Extra buttons" (one name)', names.extras && names.extras.label === 'Extra buttons' && /^Extra buttons$/.test(names.extras.cap.trim()), names.extras);
  // Tab order from the top of the page
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  const order = [];
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const t = (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28); return e.tagName.toLowerCase() + '.' + String(e.className).split(' ').filter((c) => /nx-|command|back|chip|tab-item|icon-occhio/.test(c)).slice(0, 2).join('.') + ' "' + t + '"'; });
    order.push(d);
  }
  console.log('TABORDER ' + order.join('  >  '));
  const ix = (re) => order.findIndex((x) => re.test(x));
  R.check('Tab order: Back, the chip, More commands, the tabs, then Activity, the pill of the line, then the pad (Open, Stop, Close: the order of the app\'s own markup) and the extras', ix(/"Back"/) === 0 && ix(/nx-chip/) === 1 && ix(/More commands/) === 2 && ix(/tab-item/) === 3 && ix(/nx-last/) > ix(/tab-item\.tab-item "Settings"/) && ix(/nx-pill/) > ix(/nx-last/) && ix(/Open the gate/) > ix(/nx-pill/) && ix(/Stop the gate/) > ix(/Open the gate/) && ix(/Close the gate/) > ix(/Stop the gate/) && ix(/nx-extra/) > ix(/Close the gate/), order);
  // the pill: a real tap opens the Activity sheet, the first card is the Blocked card
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await page.locator('[nav-view="active"] .nx-pill').first().tap();
  await wait(1200);
  const sheet = await page.evaluate(() => { const s = document.querySelector('.nx-sheet.nx-open, .nx-sheet[aria-hidden="false"]'); return s ? { text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 240), open: true } : { open: false }; });
  console.log('SHEET ' + JSON.stringify(sheet));
  R.check('a tap on the Blocked pill opens the Activity sheet with the Blocked card first', sheet.open && /Blocked/.test(sheet.text.slice(0, 160)), sheet);
  await shot('misc-sheet');
  // by the keyboard: Escape closes the sheet; Enter on the pill and Space on the Activity chip open it again (through Ionic's tap gate: our own native buttons)
  const open = () => page.evaluate(() => { const s = document.querySelector('.nx-sheet.nx-open, .nx-sheet[aria-hidden="false"]'); return !!s && getComputedStyle(s).visibility !== 'hidden'; });
  await page.keyboard.press('Escape'); await wait(900);
  R.check('Escape closes the sheet', !(await open()));
  await page.focus('[nav-view="active"] .nx-pill'); await page.keyboard.press('Enter'); await wait(1100);
  R.check('Enter on the Blocked pill opens the Activity sheet', await open());
  await page.keyboard.press('Escape'); await wait(900);
  await page.focus('[nav-view="active"] .nx-last'); await page.keyboard.press('Space'); await wait(1100);
  R.check('Space on the Activity chip opens the Activity sheet', await open());
  R.done();
};
