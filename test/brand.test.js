// Test of brand/res (the icon and the splash screen of patch-16-brand.py, drawn by brand/build-brand.py): what the app gets is complete, has the sizes of the
// original app, is made of the colors of the skin, and the patch script and the generator agree. No browser: the generated files are read.
// Run:  node test/brand.test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'brand', 'res');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
const read = (p) => fs.readFileSync(path.join(RES, p), 'utf8');
const png = (p) => { const b = fs.readFileSync(path.join(RES, p)); return { sig: b.slice(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }; };
const PNG_SIG = '89504e470d0a1a0a';

{
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else files.push(path.relative(RES, f)); } })(RES);
  ok('brand/res has the 24 files that the patch puts in the app (run brand/build-brand.py if not)', files.length === 24, String(files.length));
  const noV4 = files.filter((f) => /-v4\//.test(f));
  ok('the folders are named as apktool decodes them (no -v4: that would be a second copy of the same resource)', noV4.length === 0, noV4.join(', '));
}
{
  // the icon of Android 7 and older, and the splash screens: valid PNG files of the size of the original app
  const legacy = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  const bad = [];
  for (const [d, px] of Object.entries(legacy)) { const i = png('mipmap-' + d + '/ic_launcher.png'); if (i.sig !== PNG_SIG || i.w !== px || i.h !== px) bad.push(d + ' ' + i.w + 'x' + i.h); }
  ok('the icons for older Android are PNG files of 36, 48, 72, 96, 144 and 192 px', bad.length === 0, bad.join(', '));
  const splash = { ldpi: [240, 320], mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  const bad2 = [];
  for (const [d, [w, h]] of Object.entries(splash)) {
    for (const [o, ww, hh] of [['port', w, h], ['land', h, w]]) {
      const i = png('drawable-' + o + '-' + d + '/screen.png');
      if (i.sig !== PNG_SIG || i.w !== ww || i.h !== hh || i.bytes < 1500 || i.bytes > 120000) bad2.push(o + '-' + d + ' ' + i.w + 'x' + i.h + ' ' + i.bytes + ' bytes');
    }
  }
  ok('the splash screens have the sizes of the original app (portrait and landscape), and are small (a plain field and a logo)', bad2.length === 0, bad2.join(', '));
}
{
  // the colors: the field is tone 20 of the ramp, the cookie the primary color of the skin
  const tokens = fs.readFileSync(path.join(ROOT, 'skin', 'src', 'tokens.css'), 'utf8');
  const primary = (tokens.match(/--md-sys-color-primary:\s*(#[0-9a-f]{6})/i) || [])[1];
  const fg = read('drawable/ic_launcher_foreground.xml'), bg = read('drawable/ic_launcher_background.xml'), mono = read('drawable/ic_launcher_monochrome.xml');
  const fills = (x) => Array.from(x.matchAll(/android:fillColor="(#[0-9a-fA-F]+)"/g)).map((m) => m[1].toUpperCase());
  ok('the cookie of the icon is the primary color of the skin', !!primary && fills(fg)[0] === primary.toUpperCase(), fills(fg)[0] + ' vs ' + primary);
  ok('the gate is white, the field is tone 20 (#003547)', fills(fg)[1] === '#FFFFFF' && fills(bg)[0] === '#003547', fills(fg).join(' ') + ' | ' + fills(bg).join(' '));
  ok('the monochrome layer is the gate alone, in one color', fills(mono).length === 1 && /pathData="M/.test(mono));
  for (const [n, x] of [['foreground', fg], ['background', bg], ['monochrome', mono]]) {
    ok('the ' + n + ' layer is a vector of 108 x 108 with data for its paths', /<vector /.test(x) && /viewportWidth="108"/.test(x) && /viewportHeight="108"/.test(x) && /pathData="M[^"]{6,}"/.test(x) && (x.match(/</g) || []).length === (x.match(/>/g) || []).length);
  }
  const num = /(-?\d+(?:\.\d+)?)/g;
  const coords = Array.from(fg.matchAll(/pathData="([^"]+)"/g)).flatMap((m) => Array.from(m[1].matchAll(num)).map((n) => Number(n[1])));
  ok('the artwork of the icon stays in the canvas (a path that runs out of it would be cut)', coords.length > 200 && coords.every((v) => v > -1 && v < 109), String(Math.max.apply(null, coords)));
  ok('only path commands that Android knows (M, L, H, V, C, A, Z)', Array.from(fg.matchAll(/pathData="([^"]+)"/g)).every((m) => /^[MLHVCAZ0-9.,\s-]+$/.test(m[1])));
}
{
  // the adaptive icon, the theme, and the agreement with patch-16-brand.py
  const ai = read('mipmap-anydpi-v26/ic_launcher.xml');
  ok('the adaptive icon has a background, a foreground and a monochrome layer, all drawables of the app', /<adaptive-icon /.test(ai) && /<background android:drawable="@drawable\/ic_launcher_background"/.test(ai) &&
    /<foreground android:drawable="@drawable\/ic_launcher_foreground"/.test(ai) && /<monochrome android:drawable="@drawable\/ic_launcher_monochrome"/.test(ai));
  const v = read('values/nx_brand.xml'), v31 = read('values-v31/nx_brand.xml');
  ok('the theme NxTheme is the old one (Theme.DeviceDefault.NoActionBar) with the field as the color of the window', /<style name="NxTheme" parent="@android:style\/Theme\.DeviceDefault\.NoActionBar">/.test(v) &&
    /<color name="nx_splash_field">#003547<\/color>/.test(v) && /windowBackground">@color\/nx_splash_field/.test(v));
  ok('from Android 12 the splash screen of the system has the same field and the icon', /NxTheme" parent="@android:style\/Theme\.DeviceDefault\.NoActionBar"/.test(v31) &&
    /windowSplashScreenBackground">@color\/nx_splash_field/.test(v31) && /windowSplashScreenAnimatedIcon">@drawable\/ic_launcher_foreground/.test(v31));
  const patch = fs.readFileSync(path.join(ROOT, 'patch-16-brand.py'), 'utf8');
  ok('the patch script points the activity at NxTheme and keeps the splash picture from being stretched', /NEW_THEME = 'android:theme="@style\/NxTheme"'/.test(patch) && /SplashMaintainAspectRatio" value="true"/.test(patch));
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  ok('build.sh runs patch-16-brand.py after the others', /patch-15-state\.py patch-16-brand\.py; do/.test(build));
  const gen = fs.readFileSync(path.join(ROOT, 'brand', 'build-brand.py'), 'utf8');
  ok('the generator and the theme agree on the field', /FIELD = '#003547'/.test(gen));
}
console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
