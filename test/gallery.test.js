// Test of nx-gallery.js (nx22: Settings > Design, the reference page of Material 3 Expressive) and of patch-17-gallery.py, which puts it in the app.
// The page is built in jsdom (no CSS, so only structure and behavior are checked; what it looks like is checked with the screenshots of harness/). All data is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/gallery.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom)');
  process.exit(0);
}
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'nx-gallery.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

function environment(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app">the app</div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const logs = [];
  w.console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')); };
  if (opts.NX) w.NX = opts.NX(w);
  w.eval(SRC);
  const q = (sel) => w.document.querySelector(sel);
  const qa = (sel) => Array.from(w.document.querySelectorAll(sel));
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { dom, w, logs, q, qa, click, doc: w.document, root: w.document.documentElement };
}

(async function () {
  const shapesJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'skin', 'src', 'shapes.json'), 'utf8'));
  const patchJs = fs.readFileSync(path.join(ROOT, 'nx-patch.js'), 'utf8');
  const PARTS = ['shapes', 'motion', 'buttons', 'icons', 'groups', 'split', 'fab', 'progress', 'sliders', 'switches', 'toolbars', 'lists', 'type', 'color'];

  // ------------------------------------------------------------------------------------------------ what the module offers, and that it keeps to itself
  {
    const e = environment();
    const G = e.w.NxGallery;
    ok('window.NxGallery offers open, close and isOpen', G && typeof G.open === 'function' && typeof G.close === 'function' && typeof G.isOpen === 'function' && G.isOpen() === false);
    ok('loading it adds nothing to the page (the overlay is built the first time it is opened)', !e.q('#nx-gallery') && e.doc.body.children.length === 1);
    const names = Object.keys(shapesJson).filter((k) => !['cookie', 'sun', 'star'].includes(k));
    ok('it lists the 35 shapes of the skin (shapes.json without the old names)', G.shapes.length === 35 && G.shapes.slice().sort().join() === names.slice().sort().join(), G.shapes.join());
    const ids = Array.from(((patchJs.match(/var PALETTES = \[((?:\['[a-z]+', '[^']+'\](?:, )?)+)\];/) || [])[1] || '').matchAll(/\['([a-z]+)'/g)).map((m) => m[1]);
    ok('it lists the palettes of nx-patch.js, in the same order', G.palettes.join() === ids.join() && ids.length === 7, G.palettes.join());
    ok('it has the fourteen parts', G.parts.join() === PARTS.join(), G.parts.join());
  }

  // ------------------------------------------------------------------------------------------------ opening and closing
  {
    const closes = [];
    const e = environment({ NX: () => ({ close: () => closes.push('close') }) });
    const G = e.w.NxGallery;
    G.open();
    const p = e.q('#nx-gallery');
    ok('open() builds the overlay on <body>: a dialog with a bar and a scrolling part', !!p && p.parentNode === e.doc.body && p.getAttribute('role') === 'dialog' && p.getAttribute('aria-modal') === 'true' && !!p.querySelector('.nx-gal-bar') && !!p.querySelector('.nx-gal-scroll'));
    ok('...it is shown, and Ionic leaves its taps alone (data-tap-disabled)', p.style.display === 'flex' && G.isOpen() && p.getAttribute('data-tap-disabled') === 'true');
    ok('...the status sheet is closed first (one sheet at a time)', closes.length === 1);
    ok('...the finger that opened it is still down: for a moment it takes no touches (a second click of Ionic must not reach the page)', p.style.pointerEvents === 'none');
    await sleep(120);
    ok('...it fades in (class nx-open after two frames)', p.classList.contains('nx-open'));
    await sleep(450);
    ok('...and then it takes touches', p.style.pointerEvents === '');
    ok('the title of the bar says Design, with a back button', /Design/.test(p.querySelector('.nx-gal-title h1').textContent) && p.querySelector('.nx-gal-back').getAttribute('aria-label') === 'Back');
    G.open();
    ok('a second open() changes nothing (one overlay, and it does not stop taking touches again)', e.qa('#nx-gallery').length === 1 && G.isOpen() && p.style.pointerEvents === '' && closes.length === 1);
    e.click(p.querySelector('.nx-gal-back'));
    ok('the back button closes it', !G.isOpen() && !p.classList.contains('nx-open'));
    await sleep(500);
    ok('...and it is gone from the screen a moment later (no animations keep running in the background)', p.style.display === 'none');
    G.open();
    await sleep(60);
    ok('it opens again, from the top', G.isOpen() && p.style.display === 'flex' && p.querySelector('.nx-gal-scroll').scrollTop === 0 && e.qa('#nx-gallery').length === 1);
    // Android's back button: closes the page first, in the capture phase, so that the app's own handler does not also run
    let appHeard = 0;
    e.doc.addEventListener('backbutton', () => { appHeard++; });
    const ev = new e.w.Event('backbutton', { bubbles: false, cancelable: true });
    e.doc.dispatchEvent(ev);
    ok('the back button of the phone closes the page and the app does not hear it', !G.isOpen() && appHeard === 0 && ev.defaultPrevented);
    const ev2 = new e.w.Event('backbutton', { bubbles: false, cancelable: true });
    e.doc.dispatchEvent(ev2);
    ok('...with the page closed it is left for the app', appHeard === 1 && !ev2.defaultPrevented);
    await sleep(450);
  }
  {
    // without nx-patch.js (no window.NX): the page works on its own
    const e = environment();
    e.w.NxGallery.open();
    ok('it works without window.NX (a test page, an old build)', !!e.q('#nx-gallery') && e.logs.filter((l) => /failed/.test(l)).length === 0, e.logs.join(' | '));
  }
  {
    // an error while building is logged, not thrown at the app
    const e = environment();
    const orig = e.doc.createElement.bind(e.doc);
    e.doc.createElement = () => { throw new Error('boom'); };
    let thrown = null;
    try { e.w.NxGallery.open(); } catch (x) { thrown = x; }
    e.doc.createElement = orig;
    ok('a failure while building does not reach the app (it is logged)', thrown === null && e.logs.some((l) => /open failed/.test(l) && /boom/.test(l)), e.logs.join(' | '));
  }

  // ------------------------------------------------------------------------------------------------ the page
  const e = environment({ NX: (w) => { const s = { theme: 'auto', palette: 'midnight', calls: [] }; w.__nx = s; return { close() {}, theme(m) { if (m) { s.theme = m; s.calls.push('theme ' + m); } return s.theme; }, palette(i) { if (i) { s.palette = i; s.calls.push('palette ' + i); } return s.palette; } }; } });
  const G = e.w.NxGallery;
  G.open();
  await sleep(100);
  const page = e.q('#nx-gallery');
  {
    const ids = e.qa('.nx-gal-sec').map((s) => s.id.replace('nx-gal-', ''));
    ok('there is a section for every part, in order', ids.join() === PARTS.join(), ids.join());
    ok('every section has a title, an explanation and at least one example with a line of numbers under it', e.qa('.nx-gal-sec').every((s) => s.querySelector('h2').textContent.length >= 3 && s.querySelector('.nx-gal-blurb').textContent.length > 30 && s.querySelectorAll('.nx-gal-card').length >= 1 &&
      Array.from(s.querySelectorAll('.nx-gal-card')).every((c) => !!c.querySelector('.nx-gal-spec'))));
    const jump = e.qa('.nx-gal-jump .m3e-chip');
    ok('the chips at the top: one per part', jump.length === 14);
    let target = null;
    e.doc.getElementById('nx-gal-fab').scrollIntoView = function () { target = 'fab'; };
    e.click(jump[6]);
    ok('...and a tap scrolls to that part', target === 'fab', jump[6].textContent);
    ok('the page ends with where the numbers come from (Apache License 2.0)', /Apache License 2\.0/.test(e.q('.nx-gal-credit').textContent) && /NOTICE/.test(e.q('.nx-gal-credit').textContent));
  }
  {
    // theme and colors: through nx-patch.js (window.NX), the same choices as the settings
    const s = e.w.__nx;
    const radios = e.qa('.nx-gal-intro [aria-label="Theme"] button');
    ok('theme: Auto, Light and Dark, the current one pressed', radios.map((b) => b.textContent).join() === 'Auto,Light,Dark' && radios[0].getAttribute('aria-pressed') === 'true' && radios[1].getAttribute('aria-pressed') === 'false');
    e.click(radios[2]);
    ok('theme: a tap goes through NX.theme and moves the selection', s.theme === 'dark' && radios[2].getAttribute('aria-pressed') === 'true' && radios[0].getAttribute('aria-pressed') === 'false', JSON.stringify(s.calls));
    const sw = e.qa('.nx-gal-intro .nx-swatch');
    ok('colors: seven swatches in the markup of Settings (data-nx-pal), the current one marked', sw.length === 7 && sw.map((x) => x.getAttribute('data-nx-pal')).join() === G.palettes.join() && sw[0].classList.contains('nx-on') && sw.filter((x) => x.classList.contains('nx-on')).length === 1);
    e.click(sw[4]);
    ok('colors: a tap goes through NX.palette and moves the mark', s.palette === 'violet' && sw[4].classList.contains('nx-on') && !sw[0].classList.contains('nx-on') && sw[4].getAttribute('aria-checked') === 'true' && sw.filter((x) => x.classList.contains('nx-on')).length === 1, JSON.stringify(s.calls));
    // the same without nx-patch.js: the attributes on <html>
    const e2 = environment();
    e2.w.NxGallery.open();
    const r2 = e2.qa('.nx-gal-intro [aria-label="Theme"] button'), s2 = e2.qa('.nx-gal-intro .nx-swatch');
    e2.click(r2[1]);
    ok('theme without nx-patch.js: data-nx-theme on <html>', e2.root.getAttribute('data-nx-theme') === 'light');
    e2.click(r2[0]);
    ok('...Auto removes it again', !e2.root.hasAttribute('data-nx-theme'));
    e2.click(s2[2]);
    ok('colors without nx-patch.js: data-nx-palette on <html>', e2.root.getAttribute('data-nx-palette') === 'graphite');
    e2.click(s2[0]);
    ok('...the first palette removes it again', !e2.root.hasAttribute('data-nx-palette'));
  }
  {
    // shapes
    const grid = e.qa('#nx-gal-shapes .nx-gal-shape');
    const big = e.q('#nx-gal-shapes .nx-gal-bigshape'), code = e.q('#nx-gal-shapes .nx-gal-code');
    ok('shapes: 35 buttons, each with a name for screen readers, one selected (the cookie)', grid.length === 35 && grid.every((b) => b.getAttribute('aria-label').length > 2) && grid.filter((b) => b.getAttribute('aria-selected') === 'true').length === 1 && /cookie9/.test(big.getAttribute('style')));
    e.click(grid[15]);
    ok('shapes: a tap morphs the big one (its clip-path becomes the variable of that shape) and names it', /var\(--nx-v-sunny\)/.test(big.getAttribute('style')) && code.textContent === '--nx-v-sunny' && grid[15].getAttribute('aria-selected') === 'true' && grid.filter((b) => b.getAttribute('aria-selected') === 'true').length === 1, big.getAttribute('style'));
    const play = e.q('#nx-gal-shapes .m3e-btn');
    e.click(play);
    ok('shapes: Play is a toggle', play.getAttribute('aria-pressed') === 'true');
    const before = big.getAttribute('style');
    await sleep(1300);
    ok('shapes: while it plays the big shape goes through the shapes by itself', big.getAttribute('style') !== before, before + ' -> ' + big.getAttribute('style'));
    e.click(play);
    const frozen = big.getAttribute('style');
    await sleep(1300);
    ok('shapes: Play again stops it', big.getAttribute('style') === frozen);
  }
  {
    // motion: six springs, and Play sends them off
    const rows = e.qa('#nx-gal-motion .nx-gal-spring');
    ok('motion: six springs, each with its own transition (the token of the spring and its duration)', rows.length === 6 && rows.every((r) => /transition-duration:\s*var\(--nx-[a-z-]+-ms\)/.test(r.querySelector('.nx-gal-ball').getAttribute('style')) && /transition-timing-function:\s*var\(--nx-[a-z-]+\)/.test(r.querySelector('.nx-gal-ball').getAttribute('style'))));
    ok('motion: three spatial and three effects springs, and the damping and stiffness are written down', rows.slice(0, 3).every((r) => !r.querySelector('.nx-gal-fade')) && rows.slice(3).every((r) => !!r.querySelector('.nx-gal-fade')) &&
      rows.map((r) => /\d\.\d \/ \d+/.test(r.textContent)).every(Boolean), rows.map((r) => r.textContent).join(' | '));
    const play = e.q('#nx-gal-motion .m3e-btn');
    e.click(play);
    ok('motion: Play sets them all off, and the next tap sends them back', rows.every((r) => r.classList.contains('nx-go')));
    e.click(play);
    ok('...', rows.every((r) => !r.classList.contains('nx-go')));
  }
  {
    // buttons: sizes, styles, toggles
    const sec = e.q('#nx-gal-buttons');
    const sizes = e.qa('#nx-gal-buttons .nx-gal-card:first-of-type .m3e-btn');
    ok('buttons: one button per size, XS to XL', sizes.length === 5 && ['xs', 's', 'm', 'l', 'xl'].every((z, i) => sizes[i].classList.contains('m3e-' + z)), sizes.map((b) => b.className).join(' | '));
    ok('buttons: the five styles and the error style', ['m3e-filled', 'm3e-tonal', 'm3e-elevated', 'm3e-outlined', 'm3e-text', 'm3e-error'].every((c) => !!sec.querySelector('.' + c)));
    const tog = Array.from(sec.querySelectorAll('.m3e-btn[aria-pressed]'));
    ok('buttons: two toggle buttons (one off, one on), each a real <button>', tog.length === 2 && tog[0].tagName === 'BUTTON' && tog[0].getAttribute('aria-pressed') === 'false' && tog[1].getAttribute('aria-pressed') === 'true');
    e.click(tog[0]); e.click(tog[1]);
    ok('buttons: a tap flips the toggle (the CSS morphs the corners)', tog[0].getAttribute('aria-pressed') === 'true' && tog[1].getAttribute('aria-pressed') === 'false');
    ok('buttons: every button has a type (no submit) and an icon is hidden from screen readers', e.qa('#nx-gallery button').every((b) => b.getAttribute('type') === 'button') && e.qa('#nx-gallery .m3e-i').every((i) => i.getAttribute('aria-hidden') === 'true'));
    // icon buttons
    const ib = e.qa('#nx-gal-icons .m3e-icon-btn');
    ok('icon buttons: every one has a label for screen readers', ib.length >= 15 && ib.every((b) => (b.getAttribute('aria-label') || '').length > 1));
    ok('icon buttons: sizes XS to XL and the widths narrow and wide', ['m3e-xs', 'm3e-s', 'm3e-m', 'm3e-l', 'm3e-xl', 'm3e-narrow', 'm3e-wide'].every((c) => !!e.q('#nx-gal-icons .' + c)));
  }
  {
    // groups
    const groups = e.qa('#nx-gal-groups .m3e-group');
    ok('groups: standard, connected (one selected), connected (several selected) and the large one of the accessory screen', groups.length === 4 && !groups[0].classList.contains('m3e-connected') && groups.slice(1).every((g) => g.classList.contains('m3e-connected')));
    const seg = groups[1].children;
    ok('groups: Day | Week | Month, Week selected', Array.from(seg).map((b) => b.textContent).join() === 'Day,Week,Month' && seg[1].getAttribute('aria-pressed') === 'true' && seg[0].getAttribute('aria-pressed') === 'false');
    e.click(seg[0].querySelector('span') || seg[0]);
    ok('groups: a tap on a button (or its label) selects that one and deselects the other', seg[0].getAttribute('aria-pressed') === 'true' && seg[1].getAttribute('aria-pressed') === 'false' && seg[2].getAttribute('aria-pressed') === 'false');
    e.click(groups[0]);
    ok('groups: a tap on the group itself changes nothing', seg[0].getAttribute('aria-pressed') === 'true');
    const multi = groups[2].children;
    e.click(multi[1]);
    ok('groups: with several selected, each button toggles by itself', multi[0].getAttribute('aria-pressed') === 'true' && multi[1].getAttribute('aria-pressed') === 'true' && multi[2].getAttribute('aria-pressed') === 'false');
    const big = groups[3].children;
    ok('groups: the large group has Open and Close at size L, one selected', big.length === 2 && big[0].classList.contains('m3e-l') && big[1].getAttribute('aria-pressed') === 'true');
  }
  {
    // split button and its menu
    const more = e.q('#nx-gal-split .m3e-split .m3e-btn:last-child'), menu = e.q('#nx-gal-split .m3e-menu'), main = e.q('#nx-gal-split .m3e-split .m3e-btn:first-child');
    ok('split: the trailing button has a label and says it opens a menu; the menu is closed', more.getAttribute('aria-label') === 'More' && more.getAttribute('aria-haspopup') === 'menu' && more.getAttribute('aria-expanded') === 'false' && !menu.classList.contains('m3e-open'));
    e.click(more);
    ok('split: a tap opens the menu (aria-expanded and m3e-open)', more.getAttribute('aria-expanded') === 'true' && menu.classList.contains('m3e-open'));
    e.click(more);
    ok('split: the next tap closes it', more.getAttribute('aria-expanded') === 'false' && !menu.classList.contains('m3e-open'));
    e.click(more);
    e.click(menu.querySelector('button'));
    ok('split: choosing an item closes it', !menu.classList.contains('m3e-open') && more.getAttribute('aria-expanded') === 'false');
    e.click(more);
    e.click(e.q('#nx-gal-split .nx-gal-blurb'));
    ok('split: a tap somewhere else closes it', !menu.classList.contains('m3e-open'));
    e.click(more);
    e.click(main);
    ok('split: the main button leaves the menu alone', menu.classList.contains('m3e-open') === true);
    e.click(e.q('#nx-gal-fab .nx-gal-blurb'));
    ok('split: a tap on another part of the page closes it', !menu.classList.contains('m3e-open'));
  }
  {
    // FAB menu
    const fm = e.q('#nx-gal-fab .m3e-fabm'), fab = fm.querySelector(':scope > .m3e-fab'), items = fm.querySelectorAll('.m3e-fabm-item');
    ok('FAB menu: a button and three items (with their order in --k), closed', fm.getAttribute('aria-expanded') === 'false' && items.length === 3 && Array.from(items).map((i) => i.getAttribute('style')).join() === '--k:0,--k:1,--k:2' && fab.getAttribute('aria-label') === 'Menu');
    e.click(fab);
    ok('FAB menu: a tap unfolds it and the button says it closes', fm.getAttribute('aria-expanded') === 'true' && fab.getAttribute('aria-label') === 'Close menu');
    e.click(items[1]);
    ok('FAB menu: choosing an item closes it', fm.getAttribute('aria-expanded') === 'false' && fab.getAttribute('aria-label') === 'Menu');
    e.click(fab);
    e.click(e.q('#nx-gal-fab .nx-gal-blurb'));
    ok('FAB menu: a tap somewhere else closes it', fm.getAttribute('aria-expanded') === 'false');
    ok('FAB: four sizes, three extended', e.qa('#nx-gal-fab .m3e-fab').length === 8 && !!e.q('#nx-gal-fab .m3e-fab-s') && !!e.q('#nx-gal-fab .m3e-fab-m') && !!e.q('#nx-gal-fab .m3e-fab-l') && e.qa('#nx-gal-fab .m3e-ext').length === 3);
  }
  {
    // loading and progress, and the slider that drives it
    ok('loading: the indicator contained and not, with the shape inside', e.qa('#nx-gal-progress .m3e-loader').length === 3 && e.qa('#nx-gal-progress .m3e-loader.m3e-contained').length === 2 && e.qa('#nx-gal-progress .m3e-loader > i').length === 3);
    const det = e.q('#nx-gal-progress .m3e-progress:not(.m3e-flat):not(.m3e-indet)'), flat = e.q('#nx-gal-progress .m3e-progress.m3e-flat'), indet = e.q('#nx-gal-progress .m3e-progress.m3e-indet');
    ok('progress: determinate, flat and indeterminate (two lines), with the role progressbar', !!det && !!flat && !!indet && indet.querySelectorAll('i, b').length === 2 && [det, flat].every((p) => p.getAttribute('role') === 'progressbar' && p.getAttribute('aria-valuenow') === '60') && indet.getAttribute('role') === 'progressbar');
    const sl = e.q('#nx-gal-progress .m3e-slider');
    sl.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 44, right: 300, bottom: 44 });
    const down = new e.w.Event('pointerdown', { bubbles: true }); down.clientX = 130; down.pointerId = 1;
    sl.dispatchEvent(down);
    ok('progress: the slider drives both bars (--p and aria-valuenow follow it)', det.style.getPropertyValue('--p') === '0.15' && flat.style.getPropertyValue('--p') === '0.15' && det.getAttribute('aria-valuenow') === '15' && sl.classList.contains('m3e-drag'), det.getAttribute('style'));
    const up = new e.w.Event('pointerup', { bubbles: true }); sl.dispatchEvent(up);
  }
  {
    // sliders
    const sls = e.qa('#nx-gal-sliders .m3e-slider');
    ok('sliders: five sizes (the track of 16, 24, 40, 56 and 96 dp)', sls.length === 5 && ['', 'm3e-s', 'm3e-m', 'm3e-l', 'm3e-xl'].every((c, i) => c === '' ? !/m3e-(s|m|l|xl)\b/.test(sls[i].className) : sls[i].classList.contains(c)));
    ok('sliders: role slider, focusable, with a range and a value', sls.every((s) => s.getAttribute('role') === 'slider' && s.getAttribute('tabindex') === '0' && s.getAttribute('aria-valuemin') === '0' && s.getAttribute('aria-valuemax') === '100' && /^\d+$/.test(s.getAttribute('aria-valuenow'))));
    const s = sls[2];
    s.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 52, right: 200, bottom: 52 });
    const out = s.querySelector('output');
    const mk = (type, x) => { const ev = new e.w.Event(type, { bubbles: true }); ev.clientX = x; ev.pointerId = 7; return ev; };
    s.dispatchEvent(mk('pointerdown', 150));
    ok('sliders: pressing sets the value from the place of the finger, shows it in the bubble and thins the handle (m3e-drag)', s.style.getPropertyValue('--v') === '0.75' && out.textContent === '75' && s.getAttribute('aria-valuenow') === '75' && s.classList.contains('m3e-drag'));
    s.dispatchEvent(mk('pointermove', 400));
    ok('sliders: dragging beyond the end stays at 100', s.style.getPropertyValue('--v') === '1' && out.textContent === '100');
    s.dispatchEvent(mk('pointermove', -50));
    ok('sliders: and before the start at 0', s.style.getPropertyValue('--v') === '0' && out.textContent === '0');
    s.dispatchEvent(mk('pointerup', 0));
    s.dispatchEvent(mk('pointermove', 100));
    ok('sliders: letting go ends the drag (moving afterwards changes nothing)', !s.classList.contains('m3e-drag') && s.style.getPropertyValue('--v') === '0');
    const key = (k) => { const ev = new e.w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); s.dispatchEvent(ev); return ev; };
    key('ArrowRight'); key('ArrowRight');
    ok('sliders: the arrow keys move it by 5 %', Math.abs(parseFloat(s.style.getPropertyValue('--v')) - 0.1) < 1e-9 && out.textContent === '10', s.style.getPropertyValue('--v'));
    key('End');
    ok('sliders: End and Home go to the ends', out.textContent === '100' && (key('Home'), out.textContent === '0'));
    ok('sliders: the arrows do not go beyond 0 and 100', (key('ArrowLeft'), out.textContent === '0') && (key('End'), key('ArrowUp'), out.textContent === '100'));
  }
  {
    // switches and chips
    const sws = e.qa('#nx-gal-switches .m3e-switch');
    ok('switches: off, on and disabled, each with role switch and a label', sws.length === 3 && sws.every((s) => s.getAttribute('role') === 'switch' && s.getAttribute('aria-label').length > 1) && sws[0].getAttribute('aria-checked') === 'false' && sws[1].getAttribute('aria-checked') === 'true' && sws[2].hasAttribute('disabled'));
    e.click(sws[0]); e.click(sws[1]); e.click(sws[2]);
    ok('switches: a tap flips a switch, the disabled one stays', sws[0].getAttribute('aria-checked') === 'true' && sws[1].getAttribute('aria-checked') === 'false' && sws[2].getAttribute('aria-checked') === 'true');
    const chips = e.qa('#nx-gal-switches .m3e-chip');
    ok('chips: assist, two filter chips (with a check that the CSS shows when selected), input and suggestion', chips.length === 5 && e.qa('#nx-gal-switches .m3e-chip .m3e-chk').length === 2 && chips[1].getAttribute('aria-pressed') === 'true' && chips[2].getAttribute('aria-pressed') === 'false');
    e.click(chips[2]);
    ok('chips: a tap on a filter chip selects it', chips[2].getAttribute('aria-pressed') === 'true' && chips[1].getAttribute('aria-pressed') === 'true');
  }
  {
    // toolbars
    const tbs = e.qa('#nx-gal-toolbars .m3e-toolbar');
    ok('toolbars: floating (standard and vibrant) with the role toolbar and a FAB at the end, and the docked one', tbs.length === 2 && tbs[1].classList.contains('m3e-vibrant') && tbs.every((t) => t.getAttribute('role') === 'toolbar' && !!t.querySelector('.m3e-fab')) && !!e.q('#nx-gal-toolbars .m3e-docked[role="toolbar"]'));
    const bold = tbs[0].querySelector('.m3e-icon-btn');
    e.click(bold);
    ok('toolbars: the buttons that format are toggles', bold.getAttribute('aria-pressed') === 'false');
  }
  {
    // lists
    const items = e.qa('#nx-gal-lists .m3e-li');
    ok('lists: four items in a listbox, one selected, each with an avatar, a headline and a line of support', items.length === 4 && items.filter((i) => i.getAttribute('aria-selected') === 'true').length === 1 && items.every((i) => !!i.querySelector('.m3e-lead .m3e-i') && !!i.querySelector('.m3e-title-m') && !!i.querySelector('.m3e-sup')) && e.q('#nx-gal-lists .m3e-list').getAttribute('role') === 'listbox');
    e.click(items[3].querySelector('.m3e-txt'));
    ok('lists: a tap selects that item (also on its text) and deselects the other', items[3].getAttribute('aria-selected') === 'true' && items[1].getAttribute('aria-selected') === 'false' && items.filter((i) => i.getAttribute('aria-selected') === 'true').length === 1);
  }
  {
    // type and color
    const rows = e.qa('#nx-gal-type .nx-gal-type');
    ok('type: the 15 roles of the scale, each with its size, line height and weight written down', rows.length === 15 && rows.every((r) => /\d+\/\d+ · \d{3}$/.test(r.querySelector('small').textContent)) && rows[0].firstChild.className === 'm3e-display-l' && rows[14].firstChild.className === 'm3e-label-s', rows[0].firstChild.className);
    const sw = e.q('#nx-gal-type .m3e-switch');
    e.click(sw);
    ok('type: the switch makes every sample emphasized (m3e-emph), and back', sw.getAttribute('aria-checked') === 'true' && rows.every((r) => r.firstChild.classList.contains('m3e-emph')) && (e.click(sw), rows.every((r) => !r.firstChild.classList.contains('m3e-emph'))));
    const roles = e.qa('#nx-gal-color .nx-gal-role');
    ok('color: 16 roles, each as the role and the on-role that is read on it', roles.length === 16 && roles.every((r) => /background:var\(--md-sys-color-[a-z-]+\);color:var\(--md-sys-color-[a-z-]+\)/.test(r.getAttribute('style'))), roles[0].getAttribute('style'));
  }
  {
    // closing stops what runs
    G.close();
    await sleep(500);
    ok('closing hides the page and stops the loops', !G.isOpen() && page.style.display === 'none');
  }

  // ------------------------------------------------------------------------------------------------ nx-patch.js offers the function to the Settings page only when the module is there
  ok('nx-patch.js: $rootScope.nxGallery exists only when window.NxGallery does', /if \(window\.NxGallery && typeof window\.NxGallery\.open === 'function'\) \{\s*\$rootScope\.nxGallery = function \(\)/.test(patchJs));

  // ------------------------------------------------------------------------------------------------ patch-17-gallery.py on a made-up app tree
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gal17-'));
    const www = path.join(tmp, 'assets', 'www');
    fs.mkdirSync(path.join(www, 'js'), { recursive: true });
    fs.mkdirSync(path.join(www, 'templates', 'settings'), { recursive: true });
    const INDEX = '<html><body>\n        <script src="js/nx-activity.js"></script>\n        <script src="js/nx-patch.js"></script>\n</body></html>\n';
    const SETTINGS = '<div class="list">\n    <div class="item item-divider" data-ng-if="nxSetTheme">Appearance</div>\n    <div class="item nx-palette-row" data-ng-if="nxSetPalette"></div>\n\n' +
      '    <div class="item item-divider" translate="SETTINGS_PAGE_LABEL_MORE"></div>\n      <div class="item item-icon-right" data-ng-click="gotoDemo()"></div>\n</div>\n';
    const w = (rel, text) => fs.writeFileSync(path.join(www, rel), text);
    const r = (rel) => fs.readFileSync(path.join(www, rel), 'utf8');
    w('index.html', INDEX); w('templates/settings/settings.html', SETTINGS);
    const run = () => cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-17-gallery.py'), tmp], { encoding: 'utf8' });
    const res = run();
    const idx = r('index.html'), set = r('templates/settings/settings.html');
    ok('patch-17: it runs and says what it patched', res.status === 0 && /patched \(nx22 design\)/.test(res.stdout), res.stdout + res.stderr);
    ok('patch-17: js/nx-gallery.js is the file of the kit', fs.existsSync(path.join(www, 'js', 'nx-gallery.js')) && r('js/nx-gallery.js') === SRC);
    ok('patch-17: index.html loads it before nx-patch.js (and after nx-activity.js)', idx.indexOf('js/nx-activity.js') < idx.indexOf('js/nx-gallery.js') && idx.indexOf('js/nx-gallery.js') < idx.indexOf('js/nx-patch.js') && (idx.match(/nx-gallery\.js/g) || []).length === 1);
    ok('patch-17: settings.html gets the row Design, behind the rows of Theme and Colors and before "More", only when nxGallery exists', set.indexOf('nx-palette-row') < set.indexOf('nx-design-row') && set.indexOf('nx-design-row') < set.indexOf('SETTINGS_PAGE_LABEL_MORE') &&
      /data-ng-if="nxGallery" data-ng-click="nxGallery\(\)"/.test(set) && /<span>Design<\/span>/.test(set) && /Material 3 Expressive/.test(set) && /ion-ios-arrow-forward/.test(set));
    const res2 = run();
    ok('patch-17: a second run stops ("already patched") and changes nothing', res2.status !== 0 && /already patched/.test(res2.stdout + res2.stderr) && r('index.html') === idx && r('templates/settings/settings.html') === set);
    // all or nothing
    const bad = (idxText, setText) => {
      fs.rmSync(path.join(www, 'js', 'nx-gallery.js'), { force: true });
      w('index.html', idxText); w('templates/settings/settings.html', setText);
      const x = run();
      return { x, untouched: r('index.html') === idxText && r('templates/settings/settings.html') === setText && !fs.existsSync(path.join(www, 'js', 'nx-gallery.js')) };
    };
    const noAnchor = bad('<html></html>', SETTINGS);
    ok('patch-17: without the nx-patch.js line in index.html it stops and writes nothing', noAnchor.x.status !== 0 && /nx-patch\.js/.test(noAnchor.x.stdout + noAnchor.x.stderr) && noAnchor.untouched);
    const noDivider = bad(INDEX, SETTINGS.replace(/.*SETTINGS_PAGE_LABEL_MORE.*\n/, ''));
    ok('patch-17: without the "More" divider it stops and writes nothing', noDivider.x.status !== 0 && /divider/.test(noDivider.x.stdout + noDivider.x.stderr) && noDivider.untouched);
    const noRows = bad(INDEX, SETTINGS.replace('nxSetPalette', 'nothing'));
    ok('patch-17: without the Appearance rows of patch-13 it stops (the row would stand alone) and writes nothing', noRows.x.status !== 0 && /patch-13/.test(noRows.x.stdout + noRows.x.stderr) && noRows.untouched);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  {
    // build.sh and test-all.sh run it
    const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8'), all = fs.readFileSync(path.join(ROOT, 'test-all.sh'), 'utf8');
    ok('build.sh runs patch-17-gallery.py after patch-16-brand.py, and test-all.sh runs this test', /patch-16-brand\.py patch-17-gallery\.py; do/.test(build) && /test\/gallery\.test\.js/.test(all));
  }

  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
