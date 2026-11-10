// nx23 qa (gate): how much text the status line holds. The functions of the line are replaced (in the page) by ones that return a text of a given length, so that the REAL template,
// the REAL css and the real font decide. Prints, for every kind of line (text only, text + a button), the longest text (words of the real messages) that stays in the reserved box.
//   VIEW=360x640 SCRIPT=steps-qa-fit.cjs node screens.cjs qa-gate-fit '#/tabs/favorites'
const M = '00:0B:6C:AA:BB:CC', DETAIL = '#/tabs/favorites-device-detail/1/' + M;
const WORDS = 'No answer to Release and Close yet it may have arrived check the gate The accessory is not ready Waiting for sent if stays silent Too soon after the last command tap again'.split(' ');
module.exports = async (page, { goto, wait, shot }) => {
  await goto(DETAIL, 3500);
  const res = await page.evaluate(async () => {
    const act = document.querySelector('[nav-view="active"]') || document;
    const line = Array.from(document.querySelectorAll('.nx-line')).find((l) => l.closest('[nav-view="active"]'));
    const root = angular.element(document.body).injector().get('$rootScope');
    const want = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nx-line-h'));
    const WORDS = 'No answer to Release and Close yet it may have arrived check the gate The accessory is not ready Waiting for sent if stays silent Too soon after the last command tap again'.split(' ');
    function textOf(n) { let s = ''; let i = 0; while (s.length < n) { s += (s ? ' ' : '') + WORDS[i++ % WORDS.length]; } return s.slice(0, n).trim(); }
    const dc = document.querySelector('[nav-view="active"] .device-commands');
    const open = Array.from(dc.querySelectorAll(':scope > .command')).find((a) => a.querySelector('[translate$="_open"]'));
    const out = { want, w: window.innerWidth, h: window.innerHeight, fonts: getComputedStyle(line).fontFamily.slice(0, 60), fontSize: getComputedStyle(line).fontSize, rows: [] };
    const openTop0 = open.getBoundingClientRect().top;
    for (const kind of ['bad', 'busy']) for (const withAct of [false, true]) {
      let best = 0, firstBad = 0, hs = {};
      for (let n = 10; n <= 110; n += 1) {
        const txt = textOf(n);
        root.nxLine = () => txt; root.nxLineKind = () => kind; root.nxLineAct = () => withAct ? 'Reconnect' : '';
        root.$apply();
        await new Promise((r) => requestAnimationFrame(r));
        const h = line.getBoundingClientRect().height, tx = line.querySelector('.nx-line-text'), ot = open.getBoundingClientRect().top;
        const lines = Math.round(tx.getBoundingClientRect().height / 20);
        hs[n] = [h, lines, ot - openTop0];
        if (lines <= 2) best = n; else if (!firstBad) firstBad = n;
      }
      out.rows.push({ kind, withAct, longest2Lines: best, firstBad, heightAt: { [best]: hs[best], 49: hs[49], 76: hs[76] }, box1line: hs[20], box2lines: hs[Math.min(best, 76)] });
    }
    return out;
  });
  console.log('FIT ' + JSON.stringify(res));
};
