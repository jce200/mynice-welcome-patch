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
  // set on <html> by nx-patch.js (with a fallback in the CSS itself)
  const external = new Set(['--nx-sub', '--nx-dot']);
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
  // shapes: every polygon has the same number of points, otherwise clip-path jumps instead of morphing
  const shapes = {};
  for (const m of bare.matchAll(/--nx-v-([a-z]+)\s*:\s*polygon\(([^)]*)\)/g)) shapes[m[1]] = m[2].split(',').length;
  const names = Object.keys(shapes);
  ok('five shapes present', names.length === 5, names.join(','));
  ok('all shapes have the same number of points', new Set(Object.values(shapes)).size === 1, JSON.stringify(shapes));
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
  for (const m of rest.matchAll(/([^{}]+)\{[^{}]*\}/g)) selectors.push(...m[1].split(',').map((s) => s.trim()).filter(Boolean));
  // (the token blocks of the two dark variants are :root as well, with the theme attribute)
  const without = selectors.filter((s) => !/^(html:root|html\[data-nx-status)/.test(s) && s !== ':root' && !/^:root(:not\(\[data-nx-theme="light"\]\)|\[data-nx-theme="dark"\])$/.test(s));
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
  const notStyleClasses = new Set(['nx-patch', 'nx-theme', 'nx-activity', 'nx-expressive', 'nx-cloud-skipped', 'nx-via-local', 'nx-sheet-title', 'nx-sheet-explanation', 'nx-sheet-route', 'nx-sheet-facts', 'nx-sheet-text']);
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
  const patches = ['patch-11-checking-state.py', 'patch-12-extra-commands.py', 'patch-13-theme.py', 'patch-14-activity.py', 'patch-15-state.py'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));
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

console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
