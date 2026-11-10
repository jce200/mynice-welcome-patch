// nx23 qa (gate): "Home: ..." appears only with more than one home (I-26), and Open does not move when it does
//   VIEW=360x640 SCRIPT=steps-qa-homes.cjs node screens.cjs qa-gate-homes '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { reporter, DETAIL } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter();
  await goto(DETAIL, 3500);
  const read = () => page.evaluate(() => { const a = document.querySelector('[nav-view="active"]'), o = Array.from(a.querySelectorAll('.device-commands .command')).find((x) => /Open/.test(x.textContent)), h = a.querySelector('.nx-home'); const b = h && h.getBoundingClientRect(); const c = a.querySelector('.nx-last').getBoundingClientRect(); return { open: o.getBoundingClientRect().top, home: h ? h.textContent.replace(/\s+/g, ' ').trim() : null, homeRect: b && [Math.round(b.top), Math.round(b.bottom)], chipTop: Math.round(c.top), chipBottom: Math.round(c.bottom) }; });
  const one = await read();
  await page.evaluate(() => { const inj = angular.element(document.body).injector(); inj.get('HomeService').homes.push({ homeId: 2, name: 'Cabin', devices: [] }); inj.get('$rootScope').$apply(); });
  await wait(400);
  const two = await read();
  console.log('HOMES one ' + JSON.stringify(one) + ' two ' + JSON.stringify(two));
  R.check('one home: no "Home:" line', one.home === null, one);
  R.check('two homes: "Home: Home" (the name of the home of this accessory) is shown above the chip', two.home && /^Home:\s*Home/.test(two.home), two);
  R.check('... and Open did not move', Math.abs(one.open - two.open) <= 0.5, [one.open, two.open]);
  R.check('... the line does not overlap the chip', two.homeRect && two.homeRect[1] <= two.chipTop + 1, two);
  await shot('homes-two');
  R.done();
};
