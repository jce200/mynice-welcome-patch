// nx23 lists: steps for the screens of the workstream "Lists, settings, Favorites and Design page".  Usage (from harness/):
//   STEP=fav-tap CFG='{"verifyFail":true,"reachable":false}' SCRIPT=steps-lists.cjs node screens.cjs lists-x '#/tabs/favorites'
//   STEP=fav-tap-ok                  a tap on a usable accessory goes to its screen
//   STEP=settings-bottom             Settings scrolled to its end (the rows of OTHER) and the tap on "Debug log"
//   STEP=gallery                     the page Design reference: the top and a picture of every part (SEC=<id> for one part)
//   STEP=measure-gallery             numbers of the page Design reference, printed as JSON
// All data is made up (the harness).
module.exports = async (page, { goto, wait, shot }) => {
  const step = process.env.STEP || '';
  const q = (sel) => page.locator(sel);
  if (step === 'fav-tap') {
    await wait(300);
    await q('.item-favorites').first().tap();
    await wait(1200);
    await shot('after-tap');
    console.log('hash after tap:', await page.evaluate(() => location.hash), '| sheet open:', await page.evaluate(() => { const s = document.getElementById('nx-sheet'); return !!s && s.style.display !== 'none' && s.classList.contains('nx-open'); }));
  } else if (step === 'fav-tap-ok') {
    await wait(300);
    await q('.item-favorites').first().tap();
    await wait(1500);
    await shot('after-tap');
    console.log('hash after tap:', await page.evaluate(() => location.hash));
  } else if (step === 'settings-bottom') {
    await page.evaluate(() => { const sc = document.querySelector('ion-view[nav-view="active"] .scroll-content') || document.querySelector('.scroll-content'); if (sc) { sc.scrollTop = 0; } });
    await page.evaluate(() => { try { angular.element(document.querySelector('ion-view[nav-view="active"] ion-content')).controller('$ionicScroll').scrollView.scrollTo(0, 99999, false); } catch (e) { /* no scroll view */ } });
    await wait(600);
    await shot('bottom');
    if (process.env.TAP_LOG) {
      await q('.item[data-ng-click="nxLogOpen()"]').tap();
      await wait(900);
      await shot('debug-log');
    }
  } else if (step === 'gallery') {
    await page.evaluate(() => NxGallery.open());
    await wait(1200);
    await shot('gallery-top');
    const secs = process.env.SEC ? process.env.SEC.split(',') : ['shapes', 'motion', 'buttons', 'icons', 'groups', 'split', 'fab', 'progress', 'sliders', 'switches', 'toolbars', 'lists', 'type', 'color'];
    for (const id of secs) {
      await page.evaluate((x) => { const s = document.getElementById('nx-gal-' + x); const sc = document.querySelector('.nx-gal-scroll'); sc.scrollTop = s.offsetTop - 8; }, id);
      await wait(350);
      await shot('gallery-' + id);
    }
  } else if (step === 'measure-gallery') {
    await page.evaluate(() => NxGallery.open());
    await wait(1200);
    console.log('MEASURE', JSON.stringify(await page.evaluate(() => {
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      const demo = document.querySelector('.nx-gal-demo');
      return { demo: r(demo), demoText: demo && demo.textContent, bar: r(document.querySelector('.nx-gal-bar')), scroll: r(document.querySelector('.nx-gal-scroll')), title: document.querySelector('.nx-gal-title').textContent,
        specsVisible: Array.from(document.querySelectorAll('.nx-gal-spec')).filter((e) => e.offsetParent !== null).length, specs: document.querySelectorAll('.nx-gal-spec').length };
    })));
  }
};
