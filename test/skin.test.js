// Static check of skin/nx-expressive.css (what patch-10-skin.py puts into the app). No browser needed:
//   node test/skin.test.js
// The word "ok" here only means that the CSS is consistent in itself; whether it looks right is checked in harness/ (screenshots).
const fs = require('fs');
const path = require('path');
const SKIN = path.join(__dirname, '..', 'skin');
const css = fs.readFileSync(path.join(SKIN, 'nx-expressive.css'), 'utf8');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// without comments: the placeholders and braces in the explanations do not count
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');

ok('no placeholders ({{...}}) left', !/\{\{|\}\}/.test(css));
{
  // braces balanced (the icons' data URIs contain none)
  let depth = 0, min = 0;
  for (const c of bare) { if (c === '{') depth++; else if (c === '}') { depth--; if (depth < min) min = depth; } }
  ok('braces balanced', depth === 0 && min === 0, 'final depth ' + depth + ', lowest ' + min);
}
{
  // every var(--x) without a fallback points to a property that is defined somewhere
  const defined = new Set((bare.match(/(--[a-z0-9-]+)\s*:/g) || []).map((m) => m.replace(/\s*:$/, '')));
  // set on <html> by nx-patch.js (with a fallback in the CSS itself); --i (the icon) and --v (the value of a slider) are set on the elements by nx-gallery.js
  const external = new Set(['--nx-sub', '--nx-dot', '--i', '--v']);
  const undefinedVars = new Set();
  for (const m of bare.matchAll(/var\(\s*(--[a-z0-9-]+)\s*([,)])/g)) {
    if (m[2] === ',') continue;
    if (!defined.has(m[1]) && !external.has(m[1])) undefinedVars.add(m[1]);
  }
  ok('every var(--x) is defined', undefinedVars.size === 0, Array.from(undefinedVars).join(', '));
}
{
  // the color roles the skin uses all come from the tokens, light and dark
  const roles = new Set((bare.match(/var\((--md-sys-color-[a-z-]+)/g) || []).map((m) => m.slice(4)));
  const light = bare.slice(0, bare.indexOf('@media (prefers-color-scheme: dark)'));
  const dark = bare.slice(bare.indexOf('@media (prefers-color-scheme: dark)'));
  const missing = [];
  for (const r of roles) {
    if (!new RegExp(r + '\\s*:').test(light)) missing.push('light ' + r);
    if (!new RegExp(r + '\\s*:').test(dark)) missing.push('dark ' + r);
  }
  ok('every color role is defined for light and dark (' + roles.size + ' roles)', missing.length === 0, missing.join(', '));
  const nx = new Set((bare.match(/var\((--nx-(?:ok|warn)[a-z-]*)/g) || []).map((m) => m.slice(4)));
  const missing2 = [];
  for (const r of nx) { if (!new RegExp(r + '\\s*:').test(light) || !new RegExp(r + '\\s*:').test(dark)) missing2.push(r); }
  ok('the custom ok and warning colors exist in both themes', missing2.length === 0, missing2.join(', '));
}
{
  // shapes: the 35 shapes of Material 3 Expressive (MaterialShapes, tools/build-shapes.py), every polygon with the same number of points (144), otherwise clip-path jumps instead of morphing
  const shapes = {}, polys = {};
  for (const m of bare.matchAll(/--nx-v-([a-z0-9]+)\s*:\s*polygon\(([^)]*)\)/g)) { shapes[m[1]] = m[2].split(',').length; polys[m[1]] = m[2].split(',').map((p) => p.trim()); }
  const names = Object.keys(shapes);
  const gallery = fs.readFileSync(path.join(__dirname, '..', 'nx-gallery.js'), 'utf8');
  const listed = Array.from(((gallery.match(/var SHAPES = \[([\s\S]*?)\];/) || [])[1] || '').matchAll(/\['([a-z0-9]+)', '[^']+'\]/g)).map((m) => m[1]);
  ok('the 35 shapes of Material 3 Expressive are there', names.length === 35, names.length + ': ' + names.join(','));
  ok('all shapes have the same number of points (144)', new Set(Object.values(shapes)).size === 1 && names.every((n) => shapes[n] === 144), JSON.stringify(shapes));
  // shapes.json is what tools/build-shapes.py makes (it is not edited by hand): the generator is deterministic
  {
    const cp = require('child_process'), os = require('os');
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shapes-')), 'shapes.json');
    const r = cp.spawnSync('python3', ['-I', path.join(SKIN, 'src', 'tools', 'build-shapes.py'), '--out', tmp], { encoding: 'utf8' });
    ok('shapes.json is exactly what tools/build-shapes.py makes', r.status === 0 && fs.readFileSync(tmp, 'utf8') === fs.readFileSync(path.join(SKIN, 'src', 'shapes.json'), 'utf8'), (r.stderr || '').slice(0, 200));
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
  ok('every point is two percentages inside the box', names.every((n) => polys[n].every((p) => /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test(p) && p.split(' ').every((v) => parseFloat(v) >= 0 && parseFloat(v) <= 100))));
  ok('the gallery shows exactly these shapes', listed.slice().sort().join() === names.slice().sort().join(), listed.join(','));
  const used = new Set(Array.from(bare.matchAll(/var\(--nx-v-([a-z0-9]+)\)/g)).map((m) => m[1]));
  ok('every shape that the CSS uses is defined, and none has an old name (cookie, sun, star)', Array.from(used).every((n) => n in shapes) && !('cookie' in shapes) && !('sun' in shapes) && !('star' in shapes), Array.from(used).filter((n) => !(n in shapes)).join(','));
  // the loading indicator goes through seven shapes in the order of LoadingIndicator.kt, a quarter turn at a time, 28 steps
  const kf = (bare.match(/@keyframes m3e-morph\s*\{([\s\S]*?)\n\}/) || [])[1] || '';
  const steps = Array.from(kf.matchAll(/([\d.]+)%\s*\{\s*clip-path:\s*var\(--nx-v-([a-z0-9]+)\);\s*transform:\s*rotate\((\d+)deg\)/g));
  const SEQ = ['softburst', 'cookie9', 'pentagon', 'pill', 'sunny', 'cookie4', 'oval'];
  ok('the loading indicator: 29 keyframes (28 steps), the seven shapes in order, 90 degrees more every step', steps.length === 29 && steps.every((m, i) => m[2] === SEQ[i % 7] && +m[3] === 90 * i && Math.abs(+m[1] - 100 * i / 28) < 0.001), steps.length + ' ' + steps.slice(0, 3).map((m) => m[2]).join());
  ok('...and it ends where it began (7 x 360 degrees, the first shape)', steps.length === 29 && +steps[28][3] === 2520 && steps[28][2] === steps[0][2]);
}
{
  // icons: every mask in use exists and is a valid data URI with a path
  const used = new Set((bare.match(/var\((--nx-i-[a-z-]+)\)/g) || []).map((m) => m.slice(4, -1)));
  const defs = {};
  for (const m of bare.matchAll(/(--nx-i-[a-z-]+)\s*:\s*url\("data:image\/svg\+xml,([^"]*)"\)/g)) defs[m[1]] = decodeURIComponent(m[2]);
  const missing = Array.from(used).filter((k) => !(k in defs));
  ok('every icon in use is defined (' + used.size + ')', missing.length === 0, missing.join(', '));
  const broken = Object.keys(defs).filter((k) => !/^<svg [^>]*viewBox='0 0 24 24'[^>]*><path d='[^']+'\/><\/svg>$/.test(defs[k]));
  ok('every icon is a 24 x 24 SVG with a path', broken.length === 0, broken.join(', '));
}
{
  // the font: the file exists and the path in the CSS points to it (css/ -> ../fonts-nx/)
  const m = /url\('\.\.\/fonts-nx\/([^']+)'\)/.exec(css);
  ok('@font-face points to ../fonts-nx/', !!m);
  const font = m && path.join(SKIN, 'fonts-nx', m[1]);
  ok('the font file exists and is woff2', !!font && fs.existsSync(font) && fs.readFileSync(font).slice(0, 4).toString() === 'wOF2');
  ok('the font license sits next to it', fs.existsSync(path.join(SKIN, 'fonts-nx', 'ROBOTO-FLEX-LICENSE.txt')));
}
{
  // specificity: every rule outside :root, @font-face, @property and @keyframes starts with the prefix (otherwise style.css wins)
  const withoutBlocks = bare.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').replace(/@font-face\s*\{[^}]*\}/g, '').replace(/@property[^{]*\{[^}]*\}/g, '');
  const selectors = [];
  let rest = withoutBlocks;
  // top-level rules and rules inside @media
  rest = rest.replace(/@media[^{]*\{/g, '').replace(/\}\s*\}/g, '}');
  const splitTop = (text) => { const out = []; let depth = 0, cur = ''; for (const c of text) { if (c === '(') depth++; if (c === ')') depth--; if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
  for (const m of rest.matchAll(/([^{}]+)\{[^{}]*\}/g)) selectors.push(...splitTop(m[1]).map((s) => s.trim()).filter(Boolean));
  // (the token blocks of the dark variants and of the palettes are :root as well, with the theme and palette attributes)
  const without = selectors.filter((s) => !/^(html:root|html\[data-nx-status)/.test(s) && !/^:root(\[data-nx-palette="[a-z]+"\])?(:not\(\[data-nx-theme="light"\]\)|\[data-nx-theme="dark"\])?$/.test(s));
  ok('every selector starts with html:root (or is :root itself)', without.length === 0, without.slice(0, 5).join(' | '));
}
{
  // the connection status: the CSS variables that nx-patch.js sets are actually used, and the JS does set them
  const js = fs.readFileSync(path.join(__dirname, '..', 'nx-patch.js'), 'utf8');
  ok('the CSS reads --nx-sub and --nx-dot', /content:\s*var\(--nx-sub/.test(css) && /var\(--nx-dot/.test(css));
  ok('nx-patch.js sets --nx-sub, --nx-dot and data-nx-status', /--nx-sub/.test(js) && /--nx-dot/.test(js) && /data-nx-status/.test(js));
  // every class the JS puts on the status sheet has a rule in the CSS
  const classes = new Set();
  for (const m of js.matchAll(/(?<![-\w])nx-[a-z]+(?:-[a-z]+)*-?/g)) classes.add(m[0]);
  // not styling classes: file names, a dummy URL path, element ids (nx-sheet-*) and the state marker nx-via-local (only nx-via-cloud has a rule)
  const notStyleClasses = new Set(['nx-patch', 'nx-theme', 'nx-activity', 'nx-gallery', 'nx-expressive', 'nx-cloud-skipped', 'nx-via-local', 'nx-sheet-title', 'nx-sheet-explanation', 'nx-sheet-route', 'nx-sheet-facts', 'nx-sheet-text']);
  // a name that ends in a hyphen in the JS is a prefix with a value appended to it: then at least one class starting with it must exist
  const withoutRule = Array.from(classes).filter((k) => !notStyleClasses.has(k) && !new RegExp('[.#]' + k + (k.endsWith('-') ? '' : '(?![\\w-])')).test(css));
  ok('every nx class from the JS appears in the CSS', withoutRule.length === 0, withoutRule.join(', '));
  // the same for the activity sheet (nx-activity.js); its element ids (nx-activity, nx-act-sub, nx-act-body) are no classes, and a few
  // classes are only hooks for the JS or a name for a tile (no style of their own)
  const actJs = fs.readFileSync(path.join(__dirname, '..', 'nx-activity.js'), 'utf8');
  const actClasses = new Set();
  for (const m of actJs.matchAll(/(?<![-\w])nx-[a-z]+(?:-[a-z]+)*-?/g)) actClasses.add(m[0]);
  const notActClasses = new Set(['nx-activity', 'nx-act-sub', 'nx-act-body', 'nx-patch', 'nx-t-count', 'nx-t-obst', 'nx-act-copy', 'nx-act-close', 'nx-act-retry']);
  const actWithout = Array.from(actClasses).filter((k) => !notActClasses.has(k) && !new RegExp('[.#]' + k + (k.endsWith('-') ? '' : '(?![\\w-])')).test(css));
  ok('every nx class from nx-activity.js appears in the CSS (' + actClasses.size + ' names)', actClasses.size > 30 && actWithout.length === 0, actWithout.join(', '));
}

{
  // the classes that the template patches (patch-11 "Checking...", patch-12 extra buttons, patch-13 theme, patch-14 activity, patch-15 state) put in the app
  // have a rule, and nx-patch.js and nx-activity.js offer every function that those templates ask for
  const js = fs.readFileSync(path.join(__dirname, '..', 'nx-patch.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'nx-activity.js'), 'utf8');
  const patches = ['patch-11-checking-state.py', 'patch-12-extra-commands.py', 'patch-13-theme.py', 'patch-14-activity.py', 'patch-15-state.py', 'patch-17-gallery.py'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
  const classes = Array.from(new Set(patches.flatMap((t) => Array.from(t.matchAll(/class=\\?"([^"\\]*nx-[^"\\]*)\\?"/g)).flatMap((m) => m[1].split(/\s+/)).filter((k) => /^nx-[a-z-]+$/.test(k)))));
  const without = classes.filter((k) => !new RegExp('\\.' + k + '(?![\\w-])').test(css));
  ok('the classes of the template patches have a rule (' + classes.join(', ') + ')', classes.length >= 8 && without.length === 0, without.join(', '));
  const asked = Array.from(new Set(patches.flatMap((t) => Array.from(t.matchAll(/\b(nx[A-Z][A-Za-z]*)\b/g)).map((m) => m[1]))));
  const offered = asked.filter((n) => !new RegExp('\\$(?:rootScope|rs)\\.' + n + '\\s*=').test(js));
  ok('nx-patch.js and nx-activity.js offer what the patched templates ask (' + asked.join(', ') + ')', asked.length >= 15 && offered.length === 0, offered.join(', '));
  ok('the "Checking..." animations stand still with reduced motion', /prefers-reduced-motion[^{]*\{[^}]*nx-checking:before[^}]*animation:\s*none/.test(css) && /prefers-reduced-motion[^{]*\{[^}]*nx-checking-text[^}]*animation:\s*none/.test(css));
  // nx18: "Connecting..." (a new attempt after "Not usable"): the chip, the labels, and the chip that stops before the buttons on the right
  ok('"Connecting..." has its chip level, with a dot that beats (and stands still with reduced motion)', /html\[data-nx-status="connecting"\][^{]*\.bar \.title::after\s*\{[^}]*animation:\s*nx-dot-beat/.test(css) &&
    /@keyframes nx-dot-beat/.test(css) && /@property --nx-dot-r/.test(css) && /prefers-reduced-motion[^{]*\{[^}]*data-nx-status="connecting"[^}]*animation:\s*none/.test(css));
  ok('"Connecting..." has its label in the lists and on the accessory screen', /\.item-nota\.nx-checking\.nx-connecting\s*\{/.test(css) && /strong\.nx-checking-text\.nx-connecting\s*\{/.test(css));
  ok('the chip uses the radius of the dot with a fallback (without @property it is as before)', /var\(--nx-dot-r, 4\.5px\)/.test(css));
  ok('the chip stops before the buttons on the right', /\.bar:has\(\.right-buttons > \*\) \.title::after\s*\{\s*max-width:\s*calc\(100% - 48px\)/.test(css));
}
{
  // the theme: the dark tokens exist twice (what the WebView reports, unless light was chosen; and dark chosen) and are the same
  const props = (block) => new Set((block.match(/--[a-z0-9-]+(?=\s*:)/g) || []));
  const iLight = bare.indexOf(':root {'), iMedia = bare.indexOf('@media (prefers-color-scheme: dark)'), iForced = bare.indexOf(':root[data-nx-theme="dark"]');
  ok('the tokens have a light block, a media block and a block for dark chosen', iLight >= 0 && iMedia > iLight && iForced > iMedia);
  ok('the media block steps aside when light was chosen', /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-nx-theme="light"\]\)\s*\{/.test(bare));
  const media = bare.slice(iMedia, iForced), forced = bare.slice(iForced, bare.indexOf('\n}\n', iForced) + 3);
  const a = props(media), b = props(forced);
  const onlyA = Array.from(a).filter((k) => !b.has(k)), onlyB = Array.from(b).filter((k) => !a.has(k));
  ok('both dark blocks define the same properties (' + a.size + ')', a.size > 30 && onlyA.length === 0 && onlyB.length === 0, onlyA.concat(onlyB).join(', '));
  ok('the WebView is never told that the page is light only (that would invite it to darken the page by itself)', !/color-scheme:\s*light\s*;/.test(bare));
}

{
  // the palettes (nx21): the default on :root, the others on data-nx-palette; each has its three blocks (light, dark as the WebView reports it, dark chosen) with the
  // same properties as the default, colors that are plain #rrggbb, and text that can be read on its background in every theme
  const NAMES = ((css.match(/^\/\* Generated by build-tokens\.mjs: \d+ palettes \(([^)]*)\)/) || [])[1] || '').split(';').map((x) => x.replace(/, the default/, '').trim()).filter(Boolean);
  const DEFAULT = NAMES[0];
  ok('tokens.css says which palettes it has: seven, the default first', NAMES.length === 7 && DEFAULT === 'midnight', NAMES.join(','));
  const blockOf = (selector) => {
    const i = bare.indexOf(selector + ' {');
    if (i < 0) return null;
    const body = bare.slice(i + selector.length + 2, bare.indexOf('}', i));
    const map = new Map();
    for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
    return map;
  };
  const sel = (name, kind) => {
    const root = name === DEFAULT ? ':root' : ':root[data-nx-palette="' + name + '"]';
    if (kind === 'light') return root;
    if (kind === 'media') return name === DEFAULT ? ':root:not([data-nx-theme="light"])' : root + ':not([data-nx-theme="light"])';
    return name === DEFAULT ? ':root[data-nx-theme="dark"]' : root + '[data-nx-theme="dark"]';
  };
  const blocks = {};
  for (const n of NAMES) blocks[n] = { light: blockOf(sel(n, 'light')), dark: blockOf(sel(n, 'media')), forced: blockOf(sel(n, 'forced')) };
  const missing = [];
  for (const n of NAMES) for (const k of ['light', 'dark', 'forced']) if (!blocks[n][k]) missing.push(n + '/' + k);
  ok('every palette has its three blocks (light, dark as the WebView reports it, dark chosen)', missing.length === 0, missing.join(', '));
  const colorKeys = (m) => Array.from(m.keys()).filter((k) => /^--(md-sys-color-|nx-(ok|on-ok|warn|on-warn|brand|stage))/.test(k)).sort();
  const base = colorKeys(blocks[DEFAULT].light), diffKeys = [], notHex = [], notSame = [];
  for (const n of NAMES) for (const k of ['light', 'dark', 'forced']) {
    const m = blocks[n][k];
    if (!m) continue;
    const keys = colorKeys(m);
    if (keys.join() !== base.join()) diffKeys.push(n + '/' + k + ' ' + keys.length);
    for (const key of keys) if (!/^#[0-9a-f]{6}$/.test(m.get(key))) notHex.push(n + '/' + k + ' ' + key + '=' + m.get(key));
  }
  for (const n of NAMES) if (blocks[n].dark && blocks[n].forced && Array.from(blocks[n].dark).join('|') !== Array.from(blocks[n].forced).join('|')) notSame.push(n);
  ok('every block has the same ' + base.length + ' color properties as the default, all #rrggbb', diffKeys.length === 0 && notHex.length === 0 && base.length >= 40, diffKeys.concat(notHex).slice(0, 4).join(' | '));
  ok('the two dark blocks of a palette are the same', notSame.length === 0, notSame.join(', '));
  const get = (n, k, key) => blocks[n][k].get(key);
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const M = '--md-sys-color-';
  // [foreground, background, the least contrast]: what the skin puts on what
  const PAIRS = [
    [M + 'on-surface', M + 'surface', 7], [M + 'on-surface', M + 'surface-container-low', 7], [M + 'on-surface', M + 'surface-container-highest', 4.5],
    [M + 'on-surface-variant', M + 'surface', 4.5], [M + 'on-surface-variant', M + 'surface-container-low', 4.5],
    [M + 'on-primary', M + 'primary', 4.5], [M + 'on-primary-container', M + 'primary-container', 4.5], [M + 'primary', M + 'surface', 4.5], [M + 'primary', M + 'surface-container-low', 4.5],
    [M + 'on-secondary-container', M + 'secondary-container', 4.5], [M + 'on-tertiary-container', M + 'tertiary-container', 4.5],
    [M + 'on-error-container', M + 'error-container', 4.5], [M + 'on-error', M + 'error', 4.5], [M + 'error', M + 'surface', 4.5],
    ['--nx-on-ok', '--nx-ok', 4.5], ['--nx-on-ok-container', '--nx-ok-container', 4.5], ['--nx-ok', M + 'surface', 3], ['--nx-ok', M + 'surface-container-low', 3],
    ['--nx-on-warn', '--nx-warn', 4.5], ['--nx-on-warn-container', '--nx-warn-container', 4.5], ['--nx-warn', M + 'surface', 3],
    // the wizard screens: white text (fixed in style.css) on the brand surface
    ['#ffffff', '--nx-brand', 4.5],
  ];
  const low = [];
  let least = 99;
  for (const n of NAMES) for (const k of ['light', 'dark']) for (const [fg, bg, min] of PAIRS) {
    const f = fg[0] === '#' ? fg : get(n, k, fg), b = get(n, k, bg), c = contrast(f, b);
    if (c < least) least = c;
    if (c < min) low.push(n + '/' + k + ' ' + fg.replace(M, '') + ' on ' + bg.replace(M, '') + ' ' + c.toFixed(2) + ' < ' + min);
  }
  ok('text can be read on its background in every palette and theme (' + PAIRS.length + ' pairs; the lowest is ' + least.toFixed(1) + ':1)', low.length === 0, low.slice(0, 6).join(' | '));
  // the error container: Material's dark one is a saturated deep red (#93000A); here it is a wine red that does not dominate the screen
  const strong = NAMES.filter((n) => { const h = get(n, 'dark', M + 'error-container'), v = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)); return v[0] > 130 && v[1] < 60; });
  ok('the error container of the dark themes is not the saturated deep red of Material (Stop, the red chip and the star would shout)', strong.length === 0, strong.join(', '));
  // swatches in the settings
  const lacking = NAMES.filter((n) => !new RegExp('--nx-swatch-' + n + '\\s*:\\s*linear-gradient\\(135deg, #[0-9a-f]{6} 0 50%, #[0-9a-f]{6} 50% 100%\\)').test(bare) ||
    !new RegExp('\\.nx-swatch\\[data-nx-pal="' + n + '"\\]\\s*\\{\\s*--sw:\\s*var\\(--nx-swatch-' + n + '\\)').test(bare));
  ok('every palette has a swatch (its colors in :root, a rule for .nx-swatch)', lacking.length === 0, lacking.join(', '));
  ok('the swatch is the primary color of the light theme against the dark surface of the palette', NAMES.every((n) => {
    const m = bare.match(new RegExp('--nx-swatch-' + n + '\\s*:\\s*linear-gradient\\(135deg, (#[0-9a-f]{6}) 0 50%, (#[0-9a-f]{6}) 50% 100%\\)'));
    return m && m[1] === get(n, 'light', M + 'primary') && m[2] === get(n, 'dark', M + 'surface');
  }));
  // the JS knows the same palettes: the list of the settings (nx-patch.js) and the early script (nx-theme.js)
  const patchJs = fs.readFileSync(path.join(__dirname, '..', 'nx-patch.js'), 'utf8'), themeJs = fs.readFileSync(path.join(__dirname, '..', 'nx-theme.js'), 'utf8');
  const ids = Array.from(((patchJs.match(/var PALETTES = \[((?:\['[a-z]+', '[^']+'\](?:, )?)+)\];/) || [])[1] || '').matchAll(/\['([a-z]+)'/g)).map((m) => m[1]);
  ok('nx-patch.js lists the palettes of tokens.css, in the same order (the default first)', ids.join() === NAMES.join(), ids.join());
  const early = ((themeJs.match(/\/\^\(([a-z|]+)\)\$\/\.test\(p\)/) || [])[1] || '').split('|');
  ok('nx-theme.js knows all palettes except the default (that one is never set)', early.slice().sort().join() === NAMES.slice(1).sort().join(), early.join());
}

{
  // Material 3 Expressive (nx22): the numbers in m3e.css are those of the official tokens (androidx.compose.material3, Apache License 2.0; NOTICE.md). Changing one is a
  // decision, so it is written down here. Dimensions are in dp (= CSS px).
  const P = 'html:root body\\[data-ng-app\\] ';
  // the declarations of the first rule whose selector (the last part, after the prefix) is exactly `sel`
  const decls = (sel, at) => {
    const m = new RegExp('(?:^|[}\\s])' + P + esc(sel) + '\\s*\\{([^}]*)\\}', 'm').exec(at === undefined ? bare : bare.slice(at));
    const map = new Map();
    if (m) for (const d of m[1].matchAll(/(?:^|[;\s])(-{0,2}[a-z_][a-z0-9_-]*)\s*:\s*([^;]+);/g)) map.set(d[1], d[2].trim());
    return m ? map : null;
  };
  const px = (v) => (v === undefined ? NaN : parseFloat(v));

  // buttons: size, space at the start and the end, icon, space between icon and label, corner of the square shape, corner when pressed, outline, label
  const SIZES = { xs: [32, 16, 8, 20, 12, 8, 1, 14, 20], s: [40, 16, 8, 20, 12, 8, 1, 14, 20], m: [56, 24, 8, 24, 16, 12, 1, 16, 24], l: [96, 48, 12, 32, 28, 16, 2, 24, 32], xl: [136, 64, 16, 40, 28, 16, 3, 32, 40] };
  const bad = [];
  for (const [k, v] of Object.entries(SIZES)) {
    const d = decls('.m3e-' + k);
    if (!d) { bad.push(k + ': no rule'); continue; }
    const got = ['--_h', '--_pad', '--_gap', '--_icon', '--_sq', '--_pr', '--_ol', '--_fs', '--_lh'].map((n) => px(d.get(n)));
    if (got.join() !== v.join()) bad.push(k + ' ' + got.join('/') + ' != ' + v.join('/'));
  }
  ok('buttons: XS, S, M, L, XL are 32, 40, 56, 96 and 136 dp, with the space, icon, corners and label of the tokens', bad.length === 0, bad.join(' | '));
  const fonts = Object.keys(SIZES).map((k) => (decls('.m3e-' + k) || new Map()).get('--_fw'));
  ok('buttons: the label is medium (500) up to size M and regular (400) from size L', fonts.join() === '500,500,500,400,400', fonts.join());
  ok('buttons: round is half the height, pressed and selected change the corner variable (the shape morphs with a spring)', /--_round:\s*calc\(var\(--_h\) \/ 2\)/.test(bare) &&
    /border-radius var\(--nx-spatial-fast-ms\) var\(--nx-spatial-fast\)/.test(bare) && /\.m3e-square\[aria-pressed="true"\]\)\s*\{\s*--_r:\s*var\(--_round\)/.test(bare) && /\[aria-pressed="true"\]\)\s*\{\s*--_r:\s*var\(--_sq\)/.test(bare));
  const veils = Array.from(bare.matchAll(/color-mix\(in srgb, currentColor (\d+)%, transparent\)/g)).map((m) => m[1]);
  ok('buttons: the state layer is an inset shadow of the text color (10 % when pressed, everywhere), not a pseudo-element', veils.length >= 2 && veils.every((v) => v === '10') && /inset 0 0 0 100vmax var\(--_veil, transparent\)/.test(bare), veils.join());
  // every element of the app that gets a button by selector (BUTTONS in build-css.py) has its size declared in skin.css, status.css or activity.css
  const build = fs.readFileSync(path.join(SKIN, 'src', 'build-css.py'), 'utf8');
  const list = Array.from(((build.match(/BUTTONS = \[([\s\S]*?)\]/) || [])[1] || '').matchAll(/'([^']+)'/g)).map((m) => m[1]);
  const lacking = list.filter((sel) => !/^\.m3e-/.test(sel) && !new RegExp('(?:^|[}\\s,])' + P + esc(sel) + '(?::[a-z-]+)*(?:\\s|,)[^{]*\\{[^}]*--_h:', 'm').test(bare) &&
    !new RegExp(P + '[^{}]*' + esc(sel) + '[^{}]*\\{[^}]*--_h:').test(bare));
  ok('the elements of the app that are buttons all declare their size (' + list.length + ': ' + list.join(' ') + ')', list.length >= 9 && lacking.length === 0, lacking.join(', '));
  // icon buttons: sizes and the three widths
  const IB = { xs: [32, 28, 40], s: [40, 32, 52], m: [56, 48, 72], l: [96, 64, 128], xl: [136, 104, 184] };
  const ibBad = [];
  for (const [k, v] of Object.entries(IB)) {
    const def = decls('.m3e-icon-btn.m3e-' + k), nar = decls('.m3e-icon-btn.m3e-' + k + '.m3e-narrow'), wide = decls('.m3e-icon-btn.m3e-' + k + '.m3e-wide');
    const got = [def && px(def.get('--_w')), nar && px(nar.get('--_w')), wide && px(wide.get('--_w'))];
    if (got.join() !== v.join()) ibBad.push(k + ' ' + got.join('/') + ' != ' + v.join('/'));
  }
  ok('icon buttons: five sizes, each in three widths (default, narrow, wide)', ibBad.length === 0, ibBad.join(' | '));
  // groups: 12 dp apart (18 with XS), connected 2 dp, 8 dp inside, 4 dp when pressed, the selected one round
  ok('button groups: standard 12 dp apart (18 for XS), connected 2 dp apart with 8 dp inside and 4 dp when pressed', px((decls('.m3e-group') || new Map()).get('gap')) === 12 && px((decls('.m3e-group.m3e-xs-gap') || new Map()).get('gap')) === 18 &&
    px((decls('.m3e-group.m3e-connected') || new Map()).get('gap')) === 2 && /\.m3e-connected > \.m3e-btn, [^{]*\{\s*--_in:\s*8px/.test(bare) && /\.m3e-connected > \.m3e-btn:active[^{]*\{\s*--_in:\s*4px/.test(bare) &&
    /\.m3e-connected > \[aria-pressed="true"\][^{]*\{[^}]*--_rl:\s*var\(--_round\);\s*--_rr:\s*var\(--_round\)/.test(bare));
  // split button: 2 dp apart, 4 dp at the inside; FAB: 40, 56, 80, 96 dp with the corners 12, 16, 20, 28
  ok('split button: 2 dp apart, 4 dp at the inside, the menu button round while it is open', px((decls('.m3e-split') || new Map()).get('gap')) === 2 && /\.m3e-split > \.m3e-btn \{\s*--_in:\s*4px/.test(bare) &&
    /\.m3e-split > \.m3e-btn:last-child\[aria-expanded="true"\]\s*\{\s*--_rl:\s*var\(--_round\)/.test(bare));
  const FAB = { '': [56, 16], '.m3e-fab-s': [40, 12], '.m3e-fab-m': [80, 20], '.m3e-fab-l': [96, 28] };
  const fabBad = Object.entries(FAB).filter(([k, v]) => { const d = k ? decls('.m3e-fab' + k) : decls('.m3e-fab'); return !d || px(d.get('--_h')) !== v[0] || px(d.get('--_r')) !== v[1]; }).map(([k]) => k || 'default');
  ok('FAB: 40, 56, 80 and 96 dp with the corners 12, 16, 20 and 28 dp', fabBad.length === 0, fabBad.join(', '));
  ok('FAB menu: the items are 56 dp high, 4 dp apart, and unfold one after the other (32 ms)', /\.m3e-fabm-items\s*\{[^}]*gap:\s*4px/.test(bare) && /\.m3e-fabm-item\s*\{[^}]*height:\s*56px/.test(bare) && /transition-delay:\s*calc\(var\(--k, 0\) \* 32ms\)/.test(bare));
  // loading indicator: 48 dp container, the shape 38 dp (79.17 %), 650 ms per step (18200 / 28), one turn in 4666 ms
  ok('loading indicator: container 48 dp, shape 38/48, 28 steps of 650 ms (18200 ms), one turn in 4666 ms', /\.m3e-loader\s*\{\s*--s:\s*48px/.test(bare) && /calc\(var\(--s\) \* \.7917\)/.test(bare) && /animation:\s*m3e-morph 18200ms var\(--nx-loader-spring\) infinite,\s*m3e-turn 4666ms linear infinite/.test(bare) &&
    /@keyframes m3e-turn\s*\{\s*to\s*\{\s*rotate:\s*360deg/.test(bare));
  // ...and everything that uses the loading indicator (the loader, the hero, the spinners, the busy sheet) runs it at the same speed
  const turns = Array.from(bare.matchAll(/m3e-turn (\d+)ms/g)).map((m) => m[1]), morphs = Array.from(bare.matchAll(/m3e-morph (\d+)ms/g)).map((m) => m[1]);
  ok('the loading indicator runs at the same speed everywhere (' + turns.length + ' places)', turns.length >= 4 && turns.every((t) => t === '4666') && morphs.length === turns.length && morphs.every((t) => t === '18200'), turns.join() + ' / ' + morphs.join());
  // wavy progress: 10 dp high (4 dp thick + 2 x 3 dp amplitude), 4 dp track and stop, wavelength 40 dp (20 indeterminate) moving one wavelength per second, the cycle of 1750 ms
  const wave40 = (bare.match(/--nx-wave-40:\s*url\("data:image\/svg\+xml,([^"]*)"\)/) || [])[1], wave20 = (bare.match(/--nx-wave-20:\s*url\("data:image\/svg\+xml,([^"]*)"\)/) || [])[1];
  const svgOk = (u, w) => { const t = u && decodeURIComponent(u); return !!t && new RegExp("^<svg xmlns='http://www.w3.org/2000/svg' width='" + w + "' height='10' viewBox='0 0 " + w + " 10'><path d='M-[\\d.]+,5(C[-\\d.,]+)+' fill='none' stroke='black' stroke-width='4'/></svg>$").test(t); };
  ok('wavy progress: the masks are SVG waves of 4 dp thick, 10 dp high, five wavelengths (200 and 100 dp) wide', svgOk(wave40, 200) && svgOk(wave20, 100));
  // the wave itself: half-waves from the midline (y = 5) to the midline, an amplitude of 3 dp (the control points of a cubic that follows a sine are at 1.337 x the amplitude), a wavelength of 40 and 20 dp
  const waveShape = (u) => {
    const d = (decodeURIComponent(u).match(/ d='([^']+)'/) || [])[1] || '';
    const segs = Array.from(d.matchAll(/C([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/g)).map((m) => m.slice(1).map(Number));
    const dev = Math.max(...segs.map((q) => Math.max(Math.abs(q[1] - 5), Math.abs(q[3] - 5))));
    const half = segs.length > 1 ? segs[1][4] - segs[0][4] : NaN;
    const ends = segs.every((q) => q[5] === 5);
    const alt = segs.every((q, i) => Math.sign(q[1] - 5) === (i % 2 ? 1 : -1));
    return { dev, half, ends, alt, n: segs.length };
  };
  const w40 = waveShape(wave40), w20 = waveShape(wave20);
  ok('wavy progress: the amplitude is 3 dp, the wavelength 40 dp (20 dp indeterminate), every half-wave ends on the midline and the waves alternate',
    Math.abs(w40.dev - 4.011) < 0.01 && Math.abs(w20.dev - 4.011) < 0.01 && w40.half === 20 && w20.half === 10 && w40.ends && w20.ends && w40.alt && w20.alt && w40.n === 12 && w20.n === 12, JSON.stringify([w40, w20]));
  ok('wavy progress: 10 dp high, a track of 4 dp with the end 4 dp from the wave, one wavelength per second', px((decls('.m3e-progress') || new Map()).get('height')) === 10 && /\.m3e-progress::before \{[^}]*calc\(var\(--p\) \* 100% \+ 4px\)[^}]*height:\s*4px/.test(bare) &&
    /@keyframes m3e-wave \{\s*from \{\s*transform:\s*translateX\(-40px\)/.test(bare) && /@keyframes m3e-wave20 \{\s*from \{\s*transform:\s*translateX\(-20px\)/.test(bare) && /m3e-wave 1s linear infinite/.test(bare));
  // the percentages of the keyframes (what stands before a brace), in order: m3e-r1 -> [0, 57.14, 100]
  const pct = (name) => { const body = (bare.match(new RegExp('@keyframes ' + name + ' \\{([^\\n]*)\\}\\n')) || [])[1] || ''; return Array.from(body.matchAll(/((?:[\d.]+%\s*,?\s*)+)\{/g)).flatMap((m) => Array.from(m[1].matchAll(/([\d.]+)%/g)).map((x) => +x[1])); };
  const t1 = (x) => Math.round(x * 17.5);
  ok('indeterminate progress: line 1 head 0 to 1000 ms, tail 250 to 1250 ms; line 2 head 650 to 1500 ms, tail 900 to 1750 ms (cycle 1750 ms, emphasized accelerate)',
    t1(pct('m3e-r1')[1]) === 1000 && t1(pct('m3e-l1')[1]) === 250 && t1(pct('m3e-l1')[2]) === 1250 && t1(pct('m3e-r2')[1]) === 650 && t1(pct('m3e-r2')[2]) === 1500 && t1(pct('m3e-l2')[1]) === 900 && pct('m3e-l2')[2] === 100 &&
    (bare.match(/cubic-bezier\(\.3, 0, \.8, \.15\)/g) || []).length === 4 && (bare.match(/1750ms linear infinite/g) || []).length >= 6);
  // slider: tracks of 16, 24, 40, 56 and 96 dp, a handle of 4 dp (2 dp pressed), a gap of 6 dp around it
  const SL = { '': 16, '.m3e-s': 24, '.m3e-m': 40, '.m3e-l': 56, '.m3e-xl': 96 };
  const slBad = Object.entries(SL).filter(([k, v]) => { const d = decls('.m3e-slider' + k); return !d || px(d.get('--track')) !== v; }).map(([k]) => k || 'default');
  const sl0 = decls('.m3e-slider') || new Map();
  ok('slider: tracks of 16, 24, 40, 56 and 96 dp, a handle of 4 dp (2 dp while it is pressed) with 6 dp around it', slBad.length === 0 && px(sl0.get('--hw')) === 4 && px(sl0.get('--gap')) === 6 && /\.m3e-slider\.m3e-drag > \.h \{\s*--hw:\s*2px/.test(bare), slBad.join(', '));
  // switch: 52 x 32 dp, the thumb 16 dp off, 24 dp on, 28 dp pressed
  const sw = (bare.match(/\.m3e-switch, [^{]*\.toggle \.track \{([^}]*)\}/) || [])[1] || '';
  ok('switch: 52 x 32 dp, the thumb 16 dp (off), 24 dp (on) and 28 dp (pressed)', /width:\s*52px;\s*height:\s*32px/.test(sw) && /\.m3e-switch > i, [^{]*\.handle \{[^}]*width:\s*16px;\s*height:\s*16px/.test(bare) &&
    /\[aria-checked="true"\] > i, [^{]*\.handle \{[^}]*width:\s*24px;\s*height:\s*24px/.test(bare) && /:active > i, [^{]*\.handle \{\s*width:\s*28px;\s*height:\s*28px/.test(bare));
  // chips: 32 dp high, 8 dp corners; toolbars 64 dp; segmented list 2 dp apart, 4 dp inside, 16 dp at the ends, 16 dp when pressed or selected; navigation bar: indicator 56 x 32
  ok('chip: 32 dp high with 8 dp corners', /\.m3e-chip \{[^}]*height:\s*32px[^}]*border-radius:\s*8px/.test(bare));
  ok('toolbars: floating and docked are 64 dp high', /\.m3e-toolbar \{[^}]*height:\s*64px/.test(bare) && /\.m3e-docked \{[^}]*height:\s*64px/.test(bare));
  const li = decls('.m3e-li') || new Map();
  ok('segmented list (m3e.css): 2 dp apart, 4 dp inside, 16 dp at the ends, 16 dp pressed or selected, an avatar of 40 dp', px((decls('.m3e-list') || new Map()).get('gap')) === 2 && px(li.get('border-radius')) === 4 &&
    /\.m3e-li:first-child \{[^}]*border-top-left-radius:\s*16px/.test(bare) && /\.m3e-li:active, [^{]*\.m3e-li\[aria-selected="true"\] \{\s*border-radius:\s*16px/.test(bare) && /\.m3e-li > \.m3e-lead \{[^}]*width:\s*40px;\s*height:\s*40px/.test(bare));
  ok('the lists of the app are segmented the same way (--nx-gap 2, --nx-r-s 4, --nx-r-l 16, --nx-r-m 16)', /--nx-gap:\s*2px/.test(bare) && /--nx-r-s:\s*4px/.test(bare) && /--nx-r-l:\s*16px/.test(bare) && /--nx-r-m:\s*16px/.test(bare));
  ok('navigation bar: the indicator is 56 x 32 dp', /\.tab-item \.icon \{\s*width:\s*56px;\s*height:\s*32px/.test(bare));
  // the motion scheme: three spatial springs (overshoot) and three effects springs (none), slow to fast; the loader has its own
  const ms = (n) => px(((bare.match(new RegExp('--nx-' + n + '-ms:\\s*([\\d.]+)ms')) || [])[1]));
  const peak = (n) => Math.max(...((bare.match(new RegExp('--nx-' + n + ':\\s*linear\\(([^)]*)\\)')) || [])[1] || '0').split(',').map((x) => parseFloat(x)));
  ok('motion: six springs with a duration, from fast to slow (spatial 350, 420, 570 ms; effects 140, 220, 300 ms)', ms('spatial-fast') === 350 && ms('spatial') === 420 && ms('spatial-slow') === 570 && ms('effects-fast') === 140 && ms('effects') === 220 && ms('effects-slow') === 300,
    ['spatial-fast', 'spatial', 'spatial-slow', 'effects-fast', 'effects', 'effects-slow'].map(ms).join());
  ok('motion: the spatial springs overshoot, the effects springs do not', ['spatial-fast', 'spatial', 'spatial-slow'].every((n) => peak(n) > 1.01) && ['effects-fast', 'effects', 'effects-slow'].every((n) => peak(n) <= 1.0001) && peak('loader-spring') > 1.05,
    ['spatial-fast', 'spatial', 'spatial-slow', 'effects-fast', 'effects', 'effects-slow', 'loader-spring'].map((n) => peak(n).toFixed(3)).join());
  ok('motion: no spring of before nx22 is left (--nx-spring)', !/--nx-spring/.test(bare));
  // the type scale of M3 and the emphasized styles
  const TYPE = { 'display-l': [57, 64, 400], 'display-m': [45, 52, 400], 'display-s': [36, 44, 400], 'headline-l': [32, 40, 400], 'headline-m': [28, 36, 400], 'headline-s': [24, 32, 400], 'title-l': [22, 28, 400], 'title-m': [16, 24, 500], 'title-s': [14, 20, 500],
    'body-l': [16, 24, 400], 'body-m': [14, 20, 400], 'body-s': [12, 16, 400], 'label-l': [14, 20, 500], 'label-m': [12, 16, 500], 'label-s': [11, 16, 500] };
  const tBad = Object.entries(TYPE).filter(([k, v]) => { const d = decls('.m3e-' + k); return !d || px(d.get('font-size')) !== v[0] || px(d.get('line-height')) !== v[1] || px(d.get('font-weight')) !== v[2]; }).map(([k]) => k);
  ok('type: the 15 roles of the scale of M3 (size, line height, weight)', tBad.length === 0, tBad.join(', '));
  ok('type: the emphasized styles are one weight heavier (400 to 500, 500 to 700)', /\.m3e-title-m\.m3e-emph[^{]*\{\s*font-weight:\s*700/.test(bare) && /\.m3e-body-m\.m3e-emph[^{]*\{\s*font-weight:\s*500/.test(bare));
  ok('elevation: levels 1 to 3 as shadows', /--nx-elev-1:/.test(bare) && /--nx-elev-2:/.test(bare) && /--nx-elev-3:/.test(bare));
  ok('what moves stands still with reduced motion (the loader, the wave, the spinners, the hero)', /prefers-reduced-motion[^{]*\{[^}]*\.m3e-loader > i[^}]*animation:\s*none/.test(bare) && /prefers-reduced-motion[^{]*\{[^}]*\.m3e-progress > i::before[^}]*animation:\s*none/.test(bare) &&
    /prefers-reduced-motion[^{]*\{[^}]*ion-spinner:before[^}]*animation:\s*none/.test(bare) && /prefers-reduced-motion[^{]*\{[^}]*\.device-icon:before[^}]*animation:\s*none/.test(bare));
}
{
  // the hero of the accessory screen and the app's spinners use the loading indicator; Open and Close are a connected group with the state selected
  ok('hero: closed = cookie 9, open = flower, stopped = clover 4, obstructed = burst; moving or connecting = the loading indicator', /\.device-icon:before \{[^}]*clip-path:\s*var\(--nx-v-cookie9\)/.test(bare) && /\.device-icon:has\(i\.open\):before \{[^}]*var\(--nx-v-flower\)/.test(bare) &&
    /\.device-icon:has\(i\.stopped\):before \{[^}]*var\(--nx-v-clover4\)/.test(bare) && /\.device-icon:has\(i\.status-1\):before \{[^}]*var\(--nx-v-burst\)/.test(bare) &&
    /\.device-icon:has\(i\.opening\):before, [^{]*\.device-icon:has\(i\.closing\):before, [^{]*\{\s*clip-path:\s*var\(--nx-v-softburst\);\s*animation:\s*m3e-morph/.test(bare));
  ok('hero: "Connecting..." counts only while that text is shown (the template always contains it, hidden by ng-hide)', /:has\(strong\.nx-checking-text:not\(\.ng-hide\)\) \.device-icon:before/.test(bare) && !/:has\(strong\.nx-checking-text\) \.device-icon/.test(bare));
  ok('Open and Close: a connected group of size L (96 dp; 136 dp on a tall screen), the state of the accessory selected (round all over), the pressed one grows', /\.device-commands a\.command \{[^}]*--_h:\s*96px/.test(bare) && /@media \(min-height: 840px\)/.test(bare) && /--_h:\s*136px/.test(bare) &&
    /\.device-commands:has\(\.command:has\(\[translate\$="_open"\]\):active\)[^{]*\{\s*grid-template-columns:\s*1\.3fr 1fr/.test(bare) && /i\.open\) \.device-commands \.command:has\(\[translate\$="_open"\]\),\s*html:root body\[data-ng-app\] \.full-container:has\(\.device-icon i\.closed\) \.device-commands \.command:has\(\[translate\$="_close"\]\) \{ --_rl: var\(--_round\); --_rr: var\(--_round\); \}/.test(bare) &&
    /column-gap:\s*2px/.test(bare));
  ok('spinners: every ion-spinner is the loading indicator (the svg stays, invisible, for its size)', /ion-spinner svg \{ visibility:\s*hidden/.test(bare) && /ion-spinner:before \{[^}]*clip-path:\s*var\(--nx-v-softburst\);\s*animation:\s*m3e-morph/.test(bare));
  ok('the busy status sheet: the wavy progress along the top and the loading indicator as the shape', /\.nx-progress\.m3e-progress \{/.test(bare) && /\.nx-l-busy \.nx-shape:before \{[^}]*animation:\s*m3e-morph/.test(bare));
  // the gallery: every class that nx-gallery.js puts on an element is in the CSS, and every icon it uses is defined
  const gal = fs.readFileSync(path.join(__dirname, '..', 'nx-gallery.js'), 'utf8');
  const used = new Set();
  for (const m of gal.matchAll(/(?<![-\w.])((?:m3e|nx-gal)-[a-z0-9]+(?:-[a-z0-9]+)*)/g)) used.add(m[1]);
  const notClasses = new Set(['nx-gallery']);
  const noRule = Array.from(used).filter((k) => !notClasses.has(k) && !new RegExp('\\.' + esc(k) + '(?![\\w-])').test(bare));
  ok('every class of nx-gallery.js has a rule in the CSS (' + used.size + ' names)', used.size > 80 && noRule.length === 0, noRule.join(', '));
  const iconsUsed = new Set([...gal.matchAll(/(?:icon|ibtn)\('([a-z-]+)'/g)].map((m) => m[1]).concat([...gal.matchAll(/btn\('[^']*', '[^']*', '([a-z-]+)'/g)].map((m) => m[1]), [...gal.matchAll(/--nx-i-([a-z-]+)/g)].map((m) => m[1]),
    [...gal.matchAll(/\[icon\('([a-z-]+)'\)|\['(copy|share|delete)'/g)].map((m) => m[1] || m[2])));
  const iconsMissing = Array.from(iconsUsed).filter((n) => !new RegExp('--nx-i-' + n + '\\s*:').test(bare));
  ok('every icon that the gallery uses is defined (' + iconsUsed.size + ')', iconsUsed.size >= 20 && iconsMissing.length === 0, iconsMissing.join(', ') + ' / ' + Array.from(iconsUsed).join(','));
}

console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
