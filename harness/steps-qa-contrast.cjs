// nx23 QA (screens): SCRIPT=steps-qa-contrast.cjs. (1) text contrast of every visible text element of the 25 routes (+ extras with XR=1), computed from the final colors (canvas-normalised), against the
// first opaque background up the tree; (2) interactive elements smaller than 48 dp ANYWHERE in the active view (also below the fold), with the same exclusions as audit-a11y.cjs.
//   XR=1 VIEW=360x640 COLOR_SCHEME=dark SCRIPT=steps-qa-contrast.cjs node screens.cjs qa-contrast-x '#/tabs/favorites'     (XR=1 adds 11 more routes; WWW=<other www> for another build)
// Output lines: "## <route> {n, low:[...], small:[...]}" and a "## SUMMARY".
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  const ROUTES = ['#/tabs/favorites', '#/tabs/controls', '#/tabs/controls-home/1', '#/tabs/favorites-device-detail/1/' + M, '#/tabs/settings/false',
    '#/tabs/settings-home/1', '#/tabs/settings-device-setup/1/' + M, '#/tabs/settings-about/1/' + M, '#/tabs/settings-all-logs/1', '#/tabs/settings-connection-mode',
    '#/tabs/settings-add-device/1', '#/tabs/settings-add-new-device/1', '#/tabs/settings-user-pairing-request/1', '#/tabs/settings-triggers/1/' + M, '#/tabs/device-users/1/' + M,
    '#/start', '#/start-home', '#/start-email', '#/benvenuto/1', '#/connetti-IT4WIFI', '#/rete-wifi', '#/ricerca-dispositivo', '#/accendi-dispositivo', '#/scelta-accessorio', '#/start-add-device-setup-name'];
  const EXTRA = ['#/tabs/favorites-device-commands/1/' + M, '#/tabs/settings-4th-button/1/' + M, '#/tabs/settings-ifttt/1/' + M, '#/tabs/settings-trigger-edit/1/' + M + '/0',
    '#/start-add-device/', '#/bridge-rilevati', '#/configura-bridge', '#/start-add-device-setup-code/1', '#/start-add-device-setup-finish/1/' + M, '#/start-user-pairing-max-user-reached', '#/demo/demo-home'];
  const routes = process.env.XR ? ROUTES.concat(EXTRA) : ROUTES;
  let totLow = 0, totSmall = 0, totText = 0;
  for (const route of routes) {
    await goto(route, 1500);
    const d = await page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const p = cx.getImageData(0, 0, 1, 1).data; return [p[0], p[1], p[2], p[3] / 255]; };
      const over = (top, bot) => { const a = top[3] + bot[3] * (1 - top[3]); if (!a) return [0, 0, 0, 0]; return [0, 1, 2].map((i) => (top[i] * top[3] + bot[i] * bot[3] * (1 - top[3])) / a).concat([a]); };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
      const inView = (e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
      const skip = (e) => e.closest('[inert], .nx-sheet, .nx-gal, #nx-log-panel, .popup-container, .nav-bar-block[nav-bar="cached"], .nav-bar-block[nav-bar="stage"], ion-view[nav-view="cached"], [nav-view="cached"], .ng-hide, [aria-hidden="true"]');
      const views = Array.from(document.querySelectorAll('ion-view[nav-view="active"]')).filter((v) => v.getBoundingClientRect().width > 0);
      const roots = views.length ? [views[views.length - 1], document.querySelector('.bar') || document.body] : [document.body];
      const low = [], seen = new Set(); let n = 0;
      roots.forEach((root) => {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let t;
        while ((t = w.nextNode())) {
          const txt = t.nodeValue.replace(/\s+/g, ' ').trim();
          const e = t.parentElement;
          if (!txt || !e || seen.has(e) || /^(SCRIPT|STYLE|OPTION)$/.test(e.tagName) || !vis(e) || !inView(e) || skip(e)) continue;
          seen.add(e); n++;
          const cs = getComputedStyle(e);
          let op = 1, p = e; while (p && p.nodeType === 1) { op *= parseFloat(getComputedStyle(p).opacity); p = p.parentElement; }
          const fg0 = rgba(cs.color);
          let bg = [0, 0, 0, 0], q = e, unknown = false;
          while (q && q.nodeType === 1 && bg[3] < 0.999) {
            const s = getComputedStyle(q);
            if (s.backgroundImage && s.backgroundImage !== 'none') unknown = true;
            const c = rgba(s.backgroundColor);
            if (c[3] > 0) bg = over(bg, c);
            q = q.parentElement;
          }
          // composite: collect from the leaf up; the result above is approximate when several translucent layers stack (rare here)
          if (bg[3] < 0.999) bg = over(bg, [255, 255, 255, 1]);
          const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
          const r = ratio(fg, bg);
          const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
          const large = fs >= 24 || (fs >= 18.66 && bold);
          const need = large ? 3 : 4.5;
          if (r < need) low.push({ t: txt.slice(0, 28), r: Math.round(r * 100) / 100, need, fs: Math.round(fs), op: Math.round(op * 100) / 100, cls: (e.className && e.className.baseVal === undefined ? String(e.className) : '').replace(/\s*ng-[\w-]+|\s*ion-[\w-]+/g, '').trim().slice(0, 30), unknown });
        }
      });
      // interactive elements under 48 dp anywhere in the active view (not only on screen)
      const q = 'a,button,input,select,textarea,summary,[role=button],[role=radio],[role=checkbox],[role=switch],[role=tab],[ng-click],[data-ng-click],.tab-item,label.toggle,label.item-radio';
      const small = [], scope = roots.concat([document.querySelector('.tabs')]).filter(Boolean);
      const done = new Set();
      scope.forEach((root) => root.querySelectorAll(q).forEach((e) => {
        if (done.has(e)) return; done.add(e);
        if (!vis(e) || skip(e) || e.id === 'nx-log-button' || e.id === 'nx-status') return;
        if (e.tagName === 'INPUT' && /^(text|password|email|number|tel|radio|checkbox|hidden)$/.test(e.type)) return;
        const r = e.getBoundingClientRect(); let h = Math.round(r.height);
        const af = getComputedStyle(e, '::after');
        if (af.content !== 'none' && af.position === 'absolute' && parseFloat(af.height) > h) h = Math.round(parseFloat(af.height));
        if (Math.min(Math.round(r.width), h) < 47.5) small.push(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).filter((c) => !/^(ng-|ion-|button$|buttons$|header-item|icon$)/.test(c)).slice(0, 2).join('.') : '') + ' ' + Math.round(r.width) + 'x' + h + ' "' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 14) + '"');
      }));
      return { n, low, small };
    });
    totLow += d.low.length; totSmall += d.small.length; totText += d.n;
    console.log('## ' + route + ' ' + JSON.stringify({ n: d.n, low: d.low.slice(0, 6), small: d.small.slice(0, 8), nLow: d.low.length, nSmall: d.small.length }));
  }
  console.log('## SUMMARY ' + JSON.stringify({ routes: routes.length, textElements: totText, lowContrast: totLow, small48: totSmall }));
};
