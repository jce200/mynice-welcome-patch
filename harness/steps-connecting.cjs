// SCRIPT=steps-connecting.cjs: "Connecting..." while the app tries again (nx18). Needs a check that fails and takes a moment, for example
// CFG='{"verifyScript":["fail","fail","fail","fail","fail","fail","ok"],"verifyDelay":1500}': the first check of the session fails (three attempts), a second
// one fails too, the third succeeds. The script prints what the state line and the chip say at each moment and takes a screenshot of the new attempt.
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC', DETAIL = '#/tabs/favorites-device-detail/1/' + M;
  const say = async (what) => {
    const r = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('.nx-state strong')).filter((e) => !e.classList.contains('ng-hide'));
      const root = document.documentElement;
      return { state: vis.map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' / '), cls: vis.map((e) => e.className.replace(/\s*ng-[a-z-]+/g, '').trim()).join(' / '),
        chip: root.style.getPropertyValue('--nx-sub').replace(/^"|"$/g, ''), level: root.getAttribute('data-nx-status') };
    });
    console.log(what.padEnd(40), '| state:', JSON.stringify(r.state), '| chip:', JSON.stringify(r.chip), '(' + r.level + ')');
  };
  await goto(DETAIL, 900);
  await say('1. the first check of the session');
  await wait(14000);
  await say('2. three attempts have failed');
  await goto('#/tabs/favorites', 600);
  await goto(DETAIL, 900);
  await say('3. the screen is entered again: a new check');
  await shot('connecting');
  await wait(13000);
  await say('4. that one failed too');
  await goto('#/tabs/favorites', 600);
  await goto(DETAIL, 900);
  await say('5. and once more');
  await wait(9000);
  await say('6. it succeeded');
  await shot('connected');
};
