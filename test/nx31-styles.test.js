// nx31 (a test): two other styles as a layer over the skin, "Mono" and "Carbon" (Settings > Appearance > Style).
//   * the colors (styles.json) and the generated sheet: a style has every token that a palette has, three times (light, dark by the phone, dark by choice), stronger than a palette
//   * every rule of a style is behind data-nx-style on <html>, so the skin without a style is what it was
//   * the fonts and their licenses are in the kit, and patch-10-skin.py copies them
//   * nx-patch.js and nx-theme.js in jsdom: the choice is saved, applied before the first paint, and anything else changes nothing
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx31-styles.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
}
const STYLES = ['mono', 'carbon'];

// ====================================================================================================== the colors
{
  const data = JSON.parse(read('skin/src/styles.json'));
  const tokens = read('skin/src/tokens.css');
  const base = Array.from(new Set((tokens.slice(0, tokens.indexOf('}')).match(/--(?:md-sys-color|nx-(?:ok|on-ok|warn|on-warn|brand|stage))[a-z-]*(?=:)/g) || [])));
  ok('colors: the tokens of a palette were found (the list this test compares with)', base.length >= 40, base.length);
  STYLES.forEach((s) => {
    const d = data[s] || {};
    ['light', 'dark'].forEach((mode) => {
      const missing = base.filter((t) => !(d[mode] && /^#[0-9a-f]{6}$/.test(d[mode][t] || '')));
      ok('colors: ' + s + ' ' + mode + ' has every token of a palette, as a hex color', missing.length === 0, missing);
    });
    ok('colors: ' + s + ' has the same tokens in light and in dark', JSON.stringify(Object.keys(d.light || {}).sort()) === JSON.stringify(Object.keys(d.dark || {}).sort()));
  });
  // contrast of the pairs that carry text (WCAG 2: 4.5:1)
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const PAIRS = [['--md-sys-color-on-surface', '--md-sys-color-surface'], ['--md-sys-color-on-surface-variant', '--md-sys-color-surface'], ['--md-sys-color-on-surface', '--md-sys-color-surface-container-high'],
    ['--md-sys-color-on-primary', '--md-sys-color-primary'], ['--md-sys-color-on-error-container', '--md-sys-color-error-container'], ['--md-sys-color-error', '--md-sys-color-surface'],
    ['--nx-ok', '--md-sys-color-surface'], ['--nx-warn', '--md-sys-color-surface'], ['--nx-on-ok-container', '--nx-ok-container'], ['--nx-on-warn-container', '--nx-warn-container'],
    ['--md-sys-color-inverse-on-surface', '--md-sys-color-inverse-surface']];
  const low = [];
  STYLES.forEach((s) => ['light', 'dark'].forEach((mode) => PAIRS.forEach(([fg, bg]) => {
    if (s === 'carbon' && mode === 'dark' && fg === '--md-sys-color-on-primary') return;      // Carbon's interactive blue of the dark theme with white is for large text and icons (3.4:1); buttons use --cb-button-primary
    const r = ratio(data[s][mode][fg], data[s][mode][bg]);
    if (r < 4.5) low.push(s + ' ' + mode + ' ' + fg + ' on ' + bg + ' ' + r.toFixed(2));
  })));
  ok('colors: text on its ground is 4.5:1 or more in both styles and both themes', low.length === 0, low);
  const cb = data.carbon;
  ok('colors: the buttons of Carbon (white on the primary, the secondary and the danger color) are 4.5:1 or more in both themes',
    ['light', 'dark'].every((m) => ['--cb-button-primary', '--cb-button-danger'].every((t) => ratio('#ffffff', cb[m][t]) >= 4.5)) && ratio('#ffffff', cb.light['--cb-button-secondary']) >= 4.5 && ratio('#ffffff', cb.dark['--cb-button-secondary']) >= 4.5,
    ['light', 'dark'].map((m) => ['--cb-button-primary', '--cb-button-secondary', '--cb-button-danger'].map((t) => ratio('#ffffff', cb[m][t]).toFixed(2))));
  ok('colors: Carbon is the White and the Gray 100 theme (background, text, the blue of a button)', cb.light['--md-sys-color-surface'] === '#ffffff' && cb.dark['--md-sys-color-surface'] === '#161616' &&
    cb.light['--md-sys-color-on-surface'] === '#161616' && cb.dark['--md-sys-color-on-surface'] === '#f4f4f4' && cb.light['--cb-button-primary'] === '#0f62fe' && cb.dark['--cb-button-primary'] === '#0f62fe');
}

// ====================================================================================================== the generated sheet and the rules
{
  const css = read('skin/nx-expressive.css');
  STYLES.forEach((s) => {
    const root = 'html:root[data-nx-style="' + s + '"][data-nx-style][data-nx-style][data-nx-style][data-nx-style]';
    const esc = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    ok('sheet: ' + s + ' has its colors for light, for dark by the phone and for dark by choice', new RegExp('\\n' + esc + ' \\{\\n  --md-sys-color-primary:').test(css) &&
      new RegExp('@media \\(prefers-color-scheme: dark\\) \\{\\n  ' + esc + ':not\\(\\[data-nx-theme="light"\\]\\) \\{').test(css) && new RegExp('\\n' + esc + '\\[data-nx-theme="dark"\\] \\{').test(css));
    const P = '@P@';      // the placeholder of the style ({{M}} or {{C}}), without braces so that the rules can be split
    const src = read('skin/src/nx31-' + s + '.css').replace(/\/\*[\s\S]*?\*\//g, '').split(s === 'mono' ? '{{M}}' : '{{C}}').join(P);
    // every selector of a rule (outside @font-face and @keyframes) starts with the prefix of the style, or is the <html> rule of the style
    const bad = [];
    src.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, '').replace(/@media[^{]*\{/g, '').split('}').forEach((chunk) => {
      const i = chunk.indexOf('{');
      if (i < 0) return;
      const list = []; let depth = 0, cur = '';      // the selectors of the rule: split at the commas that are not inside :is( ) or :not( )
      for (const ch of chunk.slice(0, i)) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { list.push(cur); cur = ''; } else cur += ch; }
      list.push(cur);
      list.map((x) => x.trim()).filter(Boolean).forEach((sel) => {
        if (sel.indexOf(P) !== 0 && sel !== 'html:root[data-nx-style="' + s + '"]') bad.push(sel.slice(0, 70));
      });
    });
    ok('rules: every rule of ' + s + ' is behind data-nx-style="' + s + '" (without the style the skin is what it was)', bad.length === 0, bad.slice(0, 5));
    ok('rules: ' + s + ' has its own typeface, no backdrop, and does not offer the palette and the backdrop of Expressive', /--nx-font: '(Geist|IBM Plex Sans)'/.test(src) &&
      src.indexOf(P + ' .item.nx-palette-row, ' + P + ' .item.nx-bg-row:not(.nx-style-row) { display: none !important; }') >= 0 && /background-image: none !important/.test(src));
    ok('rules: ' + s + ' draws the hero and the shape of the status sheet without the shapes of Material', new RegExp(P + ' \\.device-icon:before \\{\\s*clip-path: none !important').test(src) &&
      new RegExp(P + ' \\.nx-shape:before \\{ clip-path: none !important').test(src));
    ok('rules: ' + s + ' keeps Stop solid whenever it may be needed and quiet only at confirmed rest', new RegExp(P + ' \\.device-commands \\.command:has\\(\\[translate\\$="_stop"\\]\\) \\{[^}]*--_bg: (#e5484d|var\\(--cb-button-danger\\))').test(src) &&
      new RegExp(P + ' \\.full-container:has\\(\\.device-icon i:is\\(\\.open, \\.closed\\)\\.status-0\\)[^{]*_stop"\\]\\) \\{ --_bg: transparent;').test(src));
  });
  const carbon = read('skin/src/nx31-carbon.css').split('{{C}}').join('@P@'), mono = read('skin/src/nx31-mono.css').split('{{M}}').join('@P@').replace(/\n/g, ' ');
  ok('rules: Carbon has no rounded corner but a tag and a toggle; Mono has one corner of 10 px and none on what fills the window', /@P@ \*, @P@ \*:before, @P@ \*:after \{ border-radius: 0 !important; \}/.test(carbon) &&
    /@P@ \.nx-chip:before \{ border-radius: 16px !important; \}/.test(carbon) && /@P@ \*, @P@ \*:before, @P@ \*:after \{ border-radius: 10px !important; \}/.test(mono) &&
    /@P@ \.tabs,[^{]*\{ border-radius: 0 !important; \}/.test(mono) && /@P@ \.nx-sheet, @P@ \.nx-sheet > \.nx-handle \{ border-radius: 16px 16px 0 0 !important; \}/.test(mono));
  ok('rules: Mono on the rest of the app (nx33): a ring for every spinner and loader, a straight line for progress, popups with ink for the answer that goes on, the wizard picture in a plate',
    /@P@ ion-spinner:before \{\s*clip-path: none !important;[^}]*nx-mono-turn/.test(mono) && /@P@ \.m3e-loader > i, @P@ \.m3e-morphing \{\s*clip-path: none !important;/.test(mono) &&
    /@P@ \.m3e-progress > i::before, @P@ \.m3e-progress > b::before \{[^}]*mask: none !important/.test(mono) && /@P@ \.popup-buttons \.button\.button-positive,[^{]*\{\s*--_bg: var\(--md-sys-color-primary\)/.test(mono) &&
    /@P@ \.setup-wifi-bridge \.area\.bg-black-one,[^{]*\{\s*margin: 8px 16px 0 !important;/.test(mono) && /@media \(prefers-reduced-motion: reduce\) \{ @P@ \.m3e-loader > i, @P@ \.m3e-morphing, @P@ ion-spinner:before \{ animation: none !important; \} \}/.test(mono));
  ok('sheet: no placeholder of a style is left, and the prefix of a style is heavier than the one of the skin', !/\{\{[MC]\}\}/.test(css) &&
    css.indexOf('html:root[data-nx-style="carbon"][data-nx-style][data-nx-style][data-nx-style][data-nx-style] body[data-ng-app][data-ng-app][data-ng-app] ') >= 0);
  // the fonts
  const fonts = ['geist-latin.woff2', 'ibm-plex-sans-latin-300.woff2', 'ibm-plex-sans-latin-400.woff2', 'ibm-plex-sans-latin-600.woff2'];
  ok('fonts: the files are woff2, the sheet points to each of them, and the license texts sit next to them', fonts.every((f) => fs.readFileSync(path.join(ROOT, 'skin/fonts-nx', f)).slice(0, 4).toString() === 'wOF2' && css.indexOf("url('../fonts-nx/" + f + "')") >= 0) &&
    /SIL Open Font License/.test(read('skin/fonts-nx/GEIST-LICENSE.txt')) && /SIL Open Font License/.test(read('skin/fonts-nx/IBM-PLEX-SANS-LICENSE.txt')));
  ok('fonts: patch-10-skin.py copies every font of the kit with its license, and NOTICE.md names them', /for name in sorted\(os\.listdir\(os\.path\.join\(SKIN, "fonts-nx"\)\)\):/.test(read('patch-10-skin.py')) && /IBM Plex Sans/.test(read('NOTICE.md')) && /Geist/.test(read('NOTICE.md')));
  ok('settings: the row "Style" is a choice of one, before the theme, and only there with nx-patch.js', /nx-style-row" data-ng-if="nxSetStyle">/.test(read('patch-13-theme.py')) && /role="radiogroup" aria-label="Style"/.test(read('patch-13-theme.py')) &&
    read('patch-13-theme.py').indexOf('nx-style-row') < read('patch-13-theme.py').indexOf('nx-theme-row'));
}

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom); ' + total + ' checks without it ' + (failures ? 'FAILED' : 'passed'));
  process.exit(failures ? 1 : 0);
}

// ====================================================================================================== nx-theme.js and nx-patch.js in jsdom
(async () => {
  const theme = (stored) => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    if (stored !== undefined) dom.window.localStorage.setItem('nxStyle', stored);
    dom.window.eval(read('nx-theme.js'));
    return dom.window.document.documentElement.getAttribute('data-nx-style');
  };
  ok('nx-theme.js: a saved style is on <html> before the first paint; nothing, "expressive" or anything else sets nothing', theme('mono') === 'mono' && theme('carbon') === 'carbon' && theme(undefined) === null && theme('expressive') === null && theme('lava') === null);

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.log = () => {};
  w.localStorage.setItem('keyHomes', '[]');
  w.cordova = { exec(okCb, failCb, svc, action) { setTimeout(() => { if (action === 'netState') okCb({ wifi: true, ssid: 'HomeWifi', ip: '10.0.0.5', validated: true }); else if (action === 'version') okCb('nx-test'); else okCb(); }, 0); } };
  const handlers = {};
  const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() {}, verifyDeviceRecheability(d) { return { promise: Promise.resolve(d) }; } };
  const services = { $rootScope, $q: { when: (v) => Promise.resolve(v), defer() { const d = {}; d.promise = new Promise((a, b) => { d.resolve = a; d.reject = b; }); return d; } }, $timeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 30)),
    NHKPluginService: { verify: () => Promise.resolve({}), status: () => Promise.resolve({ devices: [{ properties: [] }] }), connect: () => Promise.resolve(), logs: () => Promise.resolve({}), pairings: () => Promise.resolve({}),
      executePrimaryCommand: () => Promise.resolve({}), executeSecondaryCommand: () => Promise.resolve({}), setAccessoryType() {} },
    HomeService: { homes: [], updateDevice() {} }, $ionicPopup: { confirm: () => Promise.resolve(true) }, $translate: { instant: (k) => k }, $state: { current: { name: 'tabsController.settings' } } };
  w.angular = { element: () => ({ injector: () => ({ has: (n) => n in services, get: (n) => services[n] }) }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(read('nx-patch.js'));
  await sleep(700);
  const r = $rootScope, root = w.document.documentElement;
  ok('style: functions and the list for the settings page (Expressive first: the skin as it is)', typeof r.nxStyle === 'function' && typeof r.nxSetStyle === 'function' && r.nxStyles.map((s) => s.id).join() === 'expressive,mono,carbon' && r.nxStyles.every((s) => s.label));
  ok('style: nothing chosen -> expressive, nothing on <html>, nothing saved', r.nxStyle() === 'expressive' && !root.hasAttribute('data-nx-style') && w.localStorage.getItem('nxStyle') === null);
  r.nxSetStyle('carbon');
  ok('style: carbon -> saved and on <html>', r.nxStyle() === 'carbon' && root.getAttribute('data-nx-style') === 'carbon' && w.localStorage.getItem('nxStyle') === 'carbon');
  r.nxSetStyle('lava'); r.nxSetStyle(undefined); r.nxSetStyle({});
  ok('style: something else changes nothing', r.nxStyle() === 'carbon' && root.getAttribute('data-nx-style') === 'carbon');
  ok('style: NX.style() reads and sets', (w.NX.style('mono'), w.NX.style() === 'mono' && root.getAttribute('data-nx-style') === 'mono' && w.localStorage.getItem('nxStyle') === 'mono'));
  r.nxSetPalette && r.nxSetPalette('paper');
  ok('style: the palette and the backdrop are kept while a style is chosen (they are back with Expressive)', !r.nxSetPalette || (w.localStorage.getItem('nxPalette') === 'paper' && root.getAttribute('data-nx-palette') === 'paper'));
  r.nxSetStyle('expressive');
  ok('style: expressive -> nothing saved and nothing on <html> again', r.nxStyle() === 'expressive' && !root.hasAttribute('data-nx-style') && w.localStorage.getItem('nxStyle') === null);
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
})();
