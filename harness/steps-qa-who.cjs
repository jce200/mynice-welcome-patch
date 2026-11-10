// nx23 qa: who asks for digests (empty $evalAsync = digestSoon of nx-patch.js) while nothing happens: stacks, grouped by the caller below digestSoon
//   SCREEN=list|detail  VIEW=360x640 SCRIPT=steps-qa-who.cjs node screens.cjs qa-gate-who '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { DETAIL } = H;
module.exports = async (page, { goto, wait }) => {
  await goto(process.env.SCREEN === 'detail' ? DETAIL : '#/tabs/favorites', 3000);
  await page.evaluate(() => {
    window.__who = {};
    const rs = angular.element(document.body).injector().get('$rootScope'), orig = rs.$evalAsync;
    rs.$evalAsync = function (fn) {
      if (typeof fn === 'function' && /^function\s*\(\s*\)\s*\{\s*\}$/.test(fn.toString())) {
        const st = (new Error().stack || '').split('\n').slice(2, 7).map((l) => l.replace(/^\s*at\s+/, '').replace(/http:\/\/127\.0\.0\.1:\d+\//, '')).join(' < ');
        window.__who[st] = (window.__who[st] || 0) + 1;
      }
      return orig.apply(this, arguments);
    };
  });
  await wait(15000);
  const who = await page.evaluate(() => window.__who);
  Object.entries(who).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log('WHO ' + v + 'x ' + k.slice(0, 330)));
};
