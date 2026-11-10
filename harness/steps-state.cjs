// SCRIPT=steps-state.cjs: the accessory screen when the state is out of date and the gate is blocked, as it was seen on a real accessory:
// the status says "opening" long after the gate opened ("Open and Block"). Needs CFG='{"activity":"blocked","state":"opening"}'.
// Prints what the screen says and takes the screen and the top of the activity sheet.
module.exports = async (page, { goto, wait, shot }) => {
  await goto('#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC', 5500);
  const text = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
  console.log('state    :', JSON.stringify(await page.evaluate(() => { const e = document.querySelector('.nx-state strong.nx-reach span'); return e ? e.textContent.trim() : null; })));
  console.log('note     :', JSON.stringify(await text('.nx-settled')));
  console.log('pill     :', JSON.stringify(await text('.nx-block')));
  console.log('line     :', JSON.stringify(await text('.nx-last-text')));
  console.log('icon     :', JSON.stringify(await page.evaluate(() => { const i = document.querySelector('.device-icon i'); return i ? i.className : null; })));
  console.log('stop fits:', JSON.stringify(await page.evaluate(() => {
    const c = document.querySelector('.device-commands'), cr = c.getBoundingClientRect();
    const stop = Array.from(c.querySelectorAll('.command')).find((a) => /Stop/i.test(a.textContent)), sr = stop.getBoundingClientRect();
    const tabs = document.querySelector('.tabs') ? document.querySelector('.tabs').getBoundingClientRect().top : window.innerHeight;
    return { viewport: window.innerHeight, stopBottom: Math.round(sr.bottom), areaBottom: Math.round(cr.bottom), tabsTop: Math.round(tabs), visible: sr.top >= cr.top && sr.bottom <= cr.bottom && sr.bottom <= tabs };
  })));
  await shot('device');
  await page.locator('.nx-last').tap();
  await wait(1800);
  await shot('sheet');
};
