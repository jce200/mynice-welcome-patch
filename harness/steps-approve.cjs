// SCRIPT=steps-approve.cjs: the approval of a new user in the real app (needs CFG with "waiting", see README.md).
// A user asks for access, the popup shows, Allow is tapped (a real tap: Ionic ignores a synthetic click), and the script prints what the
// user sees and what the LOG panel got.
module.exports = async (page, { goto, wait, shot }) => {
  await goto('#/tabs/favorites', 1500);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('newUser'), { username: 'Home assistant' })));
  await wait(2500);
  await shot('popup');
  await page.locator('.popup-buttons button', { hasText: 'Allow' }).tap();
  await wait(900);
  await shot('after-allow');
  console.log('on screen:', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('.nx-snack')).map((e) => e.textContent))));
  console.log('native calls:', JSON.stringify(await page.evaluate(() => (window.__calls || []).filter((c) => /pairings|userNew/.test(c.key)))));
  await page.evaluate(() => window.__nxLogShow());
  await wait(500);
  const text = await page.evaluate(() => document.getElementById('nx-log-panel').querySelector('pre').textContent);
  text.split('\n').filter((l) => /\[NX\] (new user|waiting users|newUser)/.test(l)).forEach((l) => console.log('log:', l));
};
