// SCRIPT=steps-activity.cjs: the activity sheet in the real app. Opens the accessory screen, waits for the line with the last command,
// taps it (a real tap: Ionic ignores a synthetic click), and takes the sheet from the top down in three screenshots.
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  await goto('#/tabs/favorites-device-detail/1/' + M, 5200);       // the log is read a moment after the screen has opened
  console.log('line:', JSON.stringify(await page.evaluate(() => (document.querySelector('.nx-last-text') || {}).textContent)));
  await shot('device');
  await page.locator('.nx-last').tap();
  await wait(1800);
  await shot('sheet-1');
  const scroll = (f) => page.evaluate((fr) => { const p = document.getElementById('nx-activity'); p.scrollTop = Math.round((p.scrollHeight - p.clientHeight) * fr); }, f);
  await scroll(0.45); await wait(400); await shot('sheet-2');
  await scroll(1); await wait(400); await shot('sheet-3');
  console.log('sheet:', JSON.stringify(await page.evaluate(() => {
    const p = document.getElementById('nx-activity');
    return { open: p.classList.contains('nx-open'), tiles: Array.from(p.querySelectorAll('.nx-tile')).map((t) => t.innerText.replace(/\n/g, ' / ')),
      bars: p.querySelectorAll('.nx-col').length, who: Array.from(p.querySelectorAll('.nx-whos li')).map((l) => l.innerText.replace(/\n/g, ' ')),
      health: Array.from(p.querySelectorAll('.nx-fact')).map((l) => l.innerText.replace(/\n/g, ' / ')), rows: p.querySelectorAll('.nx-tl-row').length,
      sub: (document.getElementById('nx-act-sub') || {}).textContent };
  })));
};
