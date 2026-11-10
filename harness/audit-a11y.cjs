// nx23 (dialogs): SCRIPT=audit-a11y.cjs. The 25 routes of the app, one after the other, with the numbers of the accessibility lens: is the Debug log button shown (it must not be, in an app
// that has an accessory), which controls are smaller than 48 dp (a text input in a row of 64 dp does not count), which click targets have no keyboard path (no tab stop, no role), which buttons
// have no name in the accessibility tree of Chromium (CDP), and whether the page has exactly one level-1 heading. Baseline of nx22 at 360x640: bug button on 24 of 25 routes, 21 controls under
// 48 dp, 45 unnamed buttons, 67 click targets without a keyboard path.
//   VIEW=360x640 SCRIPT=audit-a11y.cjs node screens.cjs dlg-audit '#/tabs/favorites'
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  const ROUTES = ['#/tabs/favorites', '#/tabs/controls', '#/tabs/controls-home/1', '#/tabs/favorites-device-detail/1/' + M, '#/tabs/settings/false',
    '#/tabs/settings-home/1', '#/tabs/settings-device-setup/1/' + M, '#/tabs/settings-about/1/' + M, '#/tabs/settings-all-logs/1', '#/tabs/settings-connection-mode',
    '#/tabs/settings-add-device/1', '#/tabs/settings-add-new-device/1', '#/tabs/settings-user-pairing-request/1', '#/tabs/settings-triggers/1/' + M, '#/tabs/device-users/1/' + M,
    '#/start', '#/start-home', '#/start-email', '#/benvenuto/1', '#/connetti-IT4WIFI', '#/rete-wifi', '#/ricerca-dispositivo', '#/accendi-dispositivo', '#/scelta-accessorio', '#/start-add-device-setup-name'];
  const cdp = await page.context().newCDPSession(page);
  let bugShown = 0, small = 0, nokey = 0, unnamed = 0, noHeading = 0, multiHeading = 0, chipOnlyH1 = 0;
  for (const route of ROUTES) {
    await goto(route, 1500);
    const d = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && !e.closest('[inert]'); };
      const nat = (e) => (e.tagName === 'A' && e.hasAttribute('href')) || /^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(e.tagName);
      const desc = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).filter((c) => !/^(ng-|ion-|button$|buttons$|header-item|icon$)/.test(c)).slice(0, 2).join('.') : '');
      const q = 'a,button,input,select,textarea,summary,[role=button],[role=radio],[role=checkbox],[role=switch],[role=tab],[ng-click],[data-ng-click],.tab-item,label.toggle,label.item-radio';
      const els = Array.from(document.querySelectorAll(q)).filter((e) => vis(e) && !e.closest('#nx-log-panel') && !e.closest('.popup-container') && e.id !== 'nx-status' && !e.closest('.nx-sheet') && !e.closest('.nx-gal') && e.getAttribute('aria-hidden') !== 'true');
      const smallL = [], nokeyL = [];
      els.forEach((e) => {
        const r = e.getBoundingClientRect(), w = Math.round(r.width);
        let h = Math.round(r.height);
        const af = getComputedStyle(e, '::after');      // a hit area that is drawn by ::after (nx-last: it grows upwards only)
        if (af.content !== 'none' && af.position === 'absolute' && parseFloat(af.height) > h) h = Math.round(parseFloat(af.height));
        if (e.id === 'nx-log-button') return;
        if (Math.min(w, h) < 47.5 && !(e.tagName === 'INPUT' && /^(radio|checkbox)$/.test(e.type) && w < 5) && !(e.tagName === 'INPUT' && /^(text|password|email|number|tel)$/.test(e.type))) smallL.push(desc(e) + ' ' + w + 'x' + h);
        if (!nat(e) && e.getAttribute('tabindex') === null && !e.querySelector('input,select,textarea') && !e.closest('ion-toggle') && !(e.tagName.indexOf('-') > 0)) nokeyL.push(desc(e) + ' "' + (e.textContent || '').trim().slice(0, 18) + '"');
      });
      const b = document.getElementById('nx-log-button');
      return { small: smallL, nokey: nokeyL, bug: b ? getComputedStyle(b).display : 'absent', n: els.length };
    });
    const { nodes } = await cdp.send('Accessibility.getFullAXTree');
    const live = nodes.filter((n) => !n.ignored);
    const unnamedL = live.filter((n) => n.role && /^(button|link|tab|switch|radio|checkbox)$/.test(n.role.value) && !(n.name && n.name.value)).map((n) => n.role.value);
    const heads = live.filter((n) => n.role && n.role.value === 'heading' && (n.properties || []).some((p) => p.name === 'level' && p.value.value === 1));
    if (d.bug !== 'none') bugShown++;
    small += d.small.length; nokey += d.nokey.length; unnamed += unnamedL.length;
    // nx23 (qa chrome): since the merge the status chip is a real button inside the header title: a level-1 heading that holds nothing but the chip is not the heading of the page
    const chipOnly = await page.evaluate(() => Array.from(document.querySelectorAll('[role="heading"][aria-level="1"], h1')).filter((h) => h.getBoundingClientRect().width > 0 && !h.closest('[inert]')).filter((h) => !Array.from(h.childNodes).filter((n) => !(n.classList && n.classList.contains('nx-chip'))).map((n) => n.textContent).join('').trim()).length);
    if (chipOnly) chipOnlyH1++;
    if (!heads.length && route !== '#/start') noHeading++; if (heads.length > 1) multiHeading++;       // #/start is two big start buttons and no text of its own: the original app has no heading there
    console.log('## ' + route + ' ' + JSON.stringify({ bug: d.bug, small: d.small, nokey: d.nokey, unnamed: unnamedL.length, h1: heads.map((h) => (h.name && h.name.value || '').slice(0, 24)) }));
  }
  console.log('## SUMMARY ' + JSON.stringify({ routes: ROUTES.length, bugShown, small, nokey, unnamed, routesWithoutH1: noHeading, routesWithSeveralH1: multiHeading, routesWhoseOnlyH1IsTheChip: chipOnlyH1 }));
};
