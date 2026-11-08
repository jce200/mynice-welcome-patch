// Test of brand/res (the icon, the small icon of the notifications and the splash screen of patch-16-brand.py, built by brand/build-brand.py): what the app gets is
// complete, has the sizes of the original app, is made of the colors of the skin, is exact (the edges of the boards fall on whole units, and on whole pixels in the
// PNG files), and the patch script and the generator agree. No browser: the generated files are read, and the PNG files are decoded here.
// Run:  node test/brand.test.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'brand', 'res');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
const read = (p) => fs.readFileSync(path.join(RES, p), 'utf8');

// ---- a PNG decoder for what Chromium writes (8 bits, RGB or RGBA, no interlacing)
function decode(p) {
  const b = fs.readFileSync(path.join(RES, p));
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(p + ' is not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), kind = b.slice(off + 4, off + 8).toString('latin1'), data = b.slice(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; inter = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || inter !== 0) throw new Error(p + ': unsupported PNG (depth ' + depth + ', type ' + type + ', interlace ' + inter + ')');
  const bpp = type === 6 ? 4 : 3, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = (x >= bpp && y) ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c), pr = pa <= pb && pa <= pc ? a : (pb <= pc ? up : c); v += pr; }
      px[y * stride + x] = v & 255;
    }
  }
  const at = (x, y) => { const i = y * stride + x * bpp; return { r: px[i], g: px[i + 1], b: px[i + 2], a: bpp === 4 ? px[i + 3] : 255 }; };
  return { w, h, at };
}
// the runs along a row: [{ start, len }] of the pixels for which `pred` holds
function runs(img, y, pred) {
  const out = [];
  let s = -1;
  for (let x = 0; x <= img.w; x++) {
    const on = x < img.w && pred(img.at(x, y));
    if (on && s < 0) s = x;
    if (!on && s >= 0) { out.push({ start: s, len: x - s }); s = -1; }
  }
  return out;
}
const white = (c) => c.a > 0 && c.r > 240 && c.g > 240 && c.b > 240;

{
  const files = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else files.push(path.relative(RES, f)); } })(RES);
  ok('brand/res has the 29 files that the patch puts in the app (run brand/build-brand.py if not)', files.length === 29, String(files.length));
  const noV4 = files.filter((f) => /-v4\//.test(f));
  ok('the folders are named as apktool decodes them (no -v4: that would be a second copy of the same resource)', noV4.length === 0, noV4.join(', '));
}
{
  // the mark in the vector drawables: six boards of 5, gaps of 3, a gap of 6 between the leaves; all vertical edges on whole units; inside the safe zone
  const fg = read('drawable/ic_launcher_foreground.xml'), bg = read('drawable/ic_launcher_background.xml'), mono = read('drawable/ic_launcher_monochrome.xml');
  const fills = (x) => Array.from(x.matchAll(/android:fillColor="(#[0-9a-fA-F]+)"/g)).map((m) => m[1].toUpperCase());
  ok('the foreground is the mark in white, the background the field (tone 20, #003547), the monochrome layer the mark in one color', fills(fg).join() === '#FFFFFF' && fills(bg).join() === '#003547' && fills(mono).length === 1);
  const d = (fg.match(/pathData="([^"]+)"/) || [])[1] || '';
  const starts = Array.from(d.matchAll(/M(\d+(?:\.\d+)?),76\.5V/g)).map((m) => Number(m[1]));
  ok('six boards at x = 30, 38, 46 and 57, 65, 73: whole units (a board is 5, a gap 3, the gap between the leaves 6)', starts.join() === '30,38,46,57,65,73', starts.join());
  ok('...each ends in the arc of one circle of radius 24 (the arch)', (d.match(/A24,24 0 0 1 /g) || []).length === 6);
  const rails = Array.from(d.matchAll(/M(\d+(?:\.\d+)?),61\.5H(\d+(?:\.\d+)?)V64\.5H/g)).map((m) => m[1] + '-' + m[2]);
  ok('one rail of 3 across each leaf, from the first to the last board', rails.join() === '30-51,57-78', rails.join());
  const corners = starts.flatMap((x) => [x, x + 5]).map((x) => Math.hypot(x - 54, 76.5 - 54));
  ok('the mark stays inside the safe zone of an adaptive icon (a circle of 66 around the middle): its corners are at most 32.9 from the center', Math.max.apply(null, corners) <= 33, String(Math.max.apply(null, corners)));
  ok('the mark is centered on (54, 54): left 30, right 78, top 31.5, bottom 76.5', starts[0] + 5 + (108 - (starts[5] + 5)) - starts[0] === 108 - starts[5] - 5 + 5 && 108 - (starts[5] + 5) === starts[0] && (31.5 + 76.5) / 2 === 54);
  ok('only path commands that Android knows (M, H, V, A, Z)', /^[MHVAZ0-9.,\s-]+$/.test(d));
  ok('each layer is a vector of 108 x 108 with one path', [fg, bg, mono].every((x) => /viewportWidth="108"/.test(x) && /viewportHeight="108"/.test(x) && (x.match(/<path /g) || []).length === 1));
}
{
  // the colors: the field is tone 20 of the ramp of the skin, the color of the icon of the notifications the primary color of the skin
  const tokens = fs.readFileSync(path.join(ROOT, 'skin', 'src', 'tokens.css'), 'utf8');
  const primary = (tokens.match(/--md-sys-color-primary:\s*(#[0-9a-f]{6})/i) || [])[1];
  const gen = fs.readFileSync(path.join(ROOT, 'brand', 'build-brand.py'), 'utf8');
  const patch = fs.readFileSync(path.join(ROOT, 'patch-16-brand.py'), 'utf8');
  ok('PRIMARY of the generator and the iconColor of the notifications are the primary color of the skin', !!primary && gen.indexOf("PRIMARY = '" + primary.toUpperCase() + "'") > -1 && patch.indexOf('iconColor:"' + primary + '"') > -1, primary);
  ok('the generator and the theme agree on the field', /FIELD = '#003547'/.test(gen));
}
{
  // the icon of Android 7 and older: a PNG of 36, 48, 72, 96, 144 and 192 px; at 48, 96, 144 and 192 px (1 to 4 pixels per unit of a grid of 48) every board is whole pixels
  const sizes = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }, bad = [];
  for (const [d, px] of Object.entries(sizes)) { const i = decode('mipmap-' + d + '/ic_launcher.png'); if (i.w !== px || i.h !== px) bad.push(d + ' ' + i.w + 'x' + i.h); }
  ok('the icons for older Android have the sizes 36, 48, 72, 96, 144 and 192 px', bad.length === 0, bad.join(', '));
  const badRuns = [];
  for (const [d, m] of [['mdpi', 1], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const i = decode('mipmap-' + d + '/ic_launcher.png'), r = runs(i, 33 * m + (m >> 1), white);
    const lens = r.map((x) => x.len).join(), gaps = r.slice(1).map((x, k) => x.start - (r[k].start + r[k].len)).join();
    if (lens !== [3, 3, 3, 3, 3, 3].map((v) => v * m).join() || gaps !== [1, 1, 2, 1, 1].map((v) => v * m).join()) badRuns.push(d + ': ' + lens + ' / ' + gaps);
  }
  ok('...six boards of 3 units, gaps of 1, 1, 2, 1, 1 units: whole pixels at every one of these sizes', badRuns.length === 0, badRuns.join(' | '));
}
{
  // the small icon of the notifications: white on transparent only (Android shows the shape), 24 / 36 / 48 / 72 / 96 px; at 24, 48, 72 and 96 px the edges are whole pixels
  const sizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }, bad = [], notWhite = [];
  for (const [d, px] of Object.entries(sizes)) {
    const i = decode('drawable-' + d + '/nx_stat.png');
    if (i.w !== px || i.h !== px) bad.push(d + ' ' + i.w + 'x' + i.h);
    let odd = 0;
    for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) { const c = i.at(x, y); if (c.a > 0 && (c.r < 253 || c.g < 253 || c.b < 253)) odd++; }
    if (odd) notWhite.push(d + ': ' + odd);
  }
  ok('the small icons have the sizes 24, 36, 48, 72 and 96 px', bad.length === 0, bad.join(', '));
  ok('...and are white on transparent, nothing else (a colored one would be a gray blot in the status bar)', notWhite.length === 0, notWhite.join(', '));
  const badRuns = [];
  for (const [d, m] of [['mdpi', 1], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
    const i = decode('drawable-' + d + '/nx_stat.png'), r = runs(i, 19 * m + (m >> 1), (c) => c.a === 255);
    const partial = runs(i, 19 * m + (m >> 1), (c) => c.a > 0 && c.a < 255).length;
    const lens = r.map((x) => x.len).join(), gaps = r.slice(1).map((x, k) => x.start - (r[k].start + r[k].len)).join();
    if (partial || lens !== [2, 2, 2, 2, 2, 2].map((v) => v * m).join() || gaps !== [1, 1, 2, 1, 1].map((v) => v * m).join()) badRuns.push(d + ': ' + lens + ' / ' + gaps + ' partial ' + partial);
  }
  ok('...six boards of 2 units, gaps of 1, 1, 2, 1, 1 units, no half-transparent pixel on the edges: exactly whole pixels', badRuns.length === 0, badRuns.join(' | '));
}
{
  // the splash screens: the sizes of the original app, the plain field in the corner, the mark in the middle, at a whole, even number of pixels per unit
  const splash = { ldpi: [240, 320], mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  const bad = [], badMark = [];
  for (const [d, [w, h]] of Object.entries(splash)) {
    for (const [o, ww, hh] of [['port', w, h], ['land', h, w]]) {
      const name = 'drawable-' + o + '-' + d + '/screen.png', i = decode(name), size = fs.statSync(path.join(RES, name)).size;
      const c = i.at(0, 0), c2 = i.at(i.w - 1, i.h - 1);
      if (i.w !== ww || i.h !== hh || size < 1500 || size > 120000 || c.r !== 0 || c.g !== 53 || c.b !== 71 || c2.r !== 0 || c2.g !== 53 || c2.b !== 71) bad.push(name + ' ' + i.w + 'x' + i.h + ' ' + size + ' bytes ' + JSON.stringify(c));
      // the mark: the white pixels; its width is 48 units at k pixels per unit with k even, and it is in the middle
      let x0 = i.w, x1 = -1, y0 = i.h, y1 = -1;
      for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) if (white(i.at(x, y))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const mw = x1 - x0 + 1, k = mw / 48;
      if (!Number.isInteger(k) || k % 2 !== 0 || Math.abs((x0 + x1 + 1) / 2 - i.w / 2) > 0.5) badMark.push(name + ': width ' + mw + ' (k ' + k + '), middle ' + (x0 + x1 + 1) / 2 + ' of ' + i.w / 2);
    }
  }
  ok('the splash screens have the sizes of the original app (portrait and landscape), are small (a plain field and a mark), and the field is the color of the window (#003547)', bad.length === 0, bad.join(' | '));
  ok('...the mark is in the middle and 48 units wide at a whole, even number of pixels per unit (so that its edges, also those at half a unit, are whole pixels)', badMark.length === 0, badMark.join(' | '));
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
  ok('...and tells the push plugin to use the small icon nx_stat (the plugin takes the launcher icon otherwise)', /icon:"nx_stat"/.test(patch) && /PUSH_OLD = 'PushNotification\.init\(\{android:\{senderID:PUSH_SENDER_ID\},ios:'/.test(patch));
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  ok('build.sh runs patch-16-brand.py after the others', /patch-15-state\.py patch-16-brand\.py; do/.test(build));
}
console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
