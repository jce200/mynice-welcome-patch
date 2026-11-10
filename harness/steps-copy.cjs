// nx23 copy: SCRIPT=steps-copy.cjs: what a screen SAYS, not how it looks. For every route it writes the text of the page (the title in the header, every
// visible text node of the active view, the placeholders and the title of the next-to-title divider) to harness/shots/<folder>/text.json, so that the English
// wording of two builds can be compared line by line (before / after of the copy workstream) and a raw id as a title is easy to see.
//   COPY_ROUTES='#/tabs/favorites,#/start' SCRIPT=steps-copy.cjs node screens.cjs copy-text-after '#/tabs/favorites'
// Without COPY_ROUTES it visits the 25 routes of sweep.sh. Also: COPY_FAIL='TIMEOUT' makes the accessory fail every Open, Close and Stop with that code and taps Open
// (then it takes "alert.png" and prints the text of the popup): the failure texts of commands, as the person sees them.
const fs = require('fs'), path = require('path');
const M = '00:0B:6C:AA:BB:CC';
const ROUTES = [
  '#/tabs/favorites', '#/tabs/controls', '#/tabs/controls-home/1', '#/tabs/favorites-device-detail/1/' + M, '#/tabs/settings/false',
  '#/tabs/settings-home/1', '#/tabs/settings-device-setup/1/' + M, '#/tabs/settings-about/1/' + M, '#/tabs/settings-all-logs/1', '#/tabs/settings-connection-mode',
  '#/tabs/settings-add-device/1', '#/tabs/settings-add-new-device/1', '#/tabs/settings-user-pairing-request/1', '#/tabs/settings-triggers/1/' + M, '#/tabs/device-users/1/' + M,
  '#/start', '#/start-home', '#/start-email', '#/benvenuto/1', '#/connetti-IT4WIFI', '#/rete-wifi', '#/ricerca-dispositivo', '#/accendi-dispositivo', '#/scelta-accessorio', '#/start-add-device-setup-name',
];
module.exports = async (page, { goto, wait, shot }) => {
  const out = path.join(__dirname, 'shots', process.argv[2] || 'copy-text');
  fs.mkdirSync(out, { recursive: true });
  if (process.env.COPY_FAIL) {
    // every primary and secondary command fails with this code (a number when it looks like one; 'undefined' = an error without a code)
    const code = /^(0|[1-9]\d*)$/.test(process.env.COPY_FAIL) ? Number(process.env.COPY_FAIL) : (process.env.COPY_FAIL === 'undefined' ? undefined : process.env.COPY_FAIL);   // '007' stays a string, as the accessory reports it
    await page.evaluate((c) => {
      window.__NATIVE['nhk.executePrimaryCommand'] = function () { return { fail: c === undefined ? {} : { code: c } }; };
      window.__NATIVE['nhk.executeSecondaryCommand'] = window.__NATIVE['nhk.executePrimaryCommand'];
    }, code);
    await goto('#/tabs/favorites-device-detail/1/' + M, 2500);
    await page.locator('a.command', { hasText: /^\s*Open\s*$/ }).first().tap();
    await wait(1200);
    await shot('alert');
    const popup = await page.evaluate(() => {
      const p = document.querySelector('.popup');
      return p ? { title: (p.querySelector('.popup-title') || {}).textContent, body: (p.querySelector('.popup-body') || {}).textContent.replace(/\s+/g, ' ').trim(), buttons: Array.from(p.querySelectorAll('.popup-buttons button')).map((b) => b.textContent.trim()) } : null;
    });
    console.log('popup:', JSON.stringify(popup));
    return;
  }
  const routes = process.env.COPY_ROUTES ? process.env.COPY_ROUTES.split(',') : ROUTES;
  const result = {};
  for (const r of routes) {
    await goto(r, 1300);
    result[r] = await page.evaluate(() => {
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const title = Array.from(document.querySelectorAll('.nav-bar-block[nav-bar="active"] .title, .nav-bar-block[nav-bar="active"] ion-nav-title, .bar .title')).filter(visible).map((e) => norm(e.textContent)).filter(Boolean)[0] || '';
      const views = Array.from(document.querySelectorAll('ion-view[nav-view="active"]')).filter((v) => v.getBoundingClientRect().width > 0);
      const view = views[views.length - 1] || document.body;   // the innermost active view that is on screen (the outer ones are empty containers)
      const texts = [];
      const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const t = norm(n.nodeValue);
        if (!t || !n.parentElement || !visible(n.parentElement)) continue;
        if (/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) continue;
        texts.push(t);
      }
      const plh = Array.from(view.querySelectorAll('input[placeholder]')).filter(visible).map((e) => 'placeholder: ' + norm(e.getAttribute('placeholder')));
      const tabs = Array.from(document.querySelectorAll('.tab-item')).filter(visible).map((e) => norm(e.textContent));
      return { title, texts: texts.concat(plh), tabs };
    });
  }
  fs.writeFileSync(path.join(out, 'text.json'), JSON.stringify(result, null, 1));
  console.log('text of ' + routes.length + ' routes -> ' + path.join(out, 'text.json'));
};
