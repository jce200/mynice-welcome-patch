// Test of patch-16-brand.py (nx20) with brand/logo.py and brand/assets.py: the logo of Nice as an adaptive icon, a small icon for the notifications and a splash screen.
// There is no Nice artwork in this repository, so the test makes an app tree of its own with an invented logo (another shape, another color, another N than the real one,
// but with the same properties: a smooth gradient at 45 degrees, a white N that reaches the lower edge, anti-aliased edges with the light fringe that the real file has),
// runs the patch script on it, and decodes what comes out (a PNG decoder of its own, so that the Python encoder is not checked by the Python decoder).
// What is checked: the files that are added and replaced, the originals that must stay, the sizes, the safe zone, the N as a cut-out, how sharp an edge is after an
// enlargement of 2.7 times, that the shape keeps its proportions and its colors, the colors of the skin, and that the script stops without writing when something is wrong.
// Run:  node test/brand.test.js        (needs python3; takes about 15 seconds)
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const cp = require('child_process');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

// ---- PNG: an encoder (for the invented files) and a decoder (8 bits, RGB or RGBA, no interlacing)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const b = Buffer.alloc(12 + data.length);
  b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(crc32(b.slice(4, 8 + data.length)), 8 + data.length);
  return b;
}
function encodePng(w, h, rgba) {
  const stride = w * 4, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function decode(b, name) {
  if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(name + ' is not a PNG');
  let off = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0;
  const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), kind = b.slice(off + 4, off + 8).toString('latin1'), data = b.slice(off + 8, off + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; inter = data[12]; }
    if (kind === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || inter !== 0) throw new Error(name + ': unsupported PNG (depth ' + depth + ', type ' + type + ', interlace ' + inter + ')');
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
  return { w, h, type, at };
}
const size = (b) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

// ---- the invented logo: a house with a white N, 192 x 192. The gradient is teal, dark at the lower left (45 degrees); the N reaches the lower edge, which is at y = 186.4
const HOUSE = [[20, 186.4], [172, 186.4], [172, 80], [96, 6], [20, 80]];
const N_SHAPES = [[[50, 92], [76, 92], [76, 186.4], [50, 186.4]], [[116, 92], [142, 92], [142, 186.4], [116, 186.4]], [[50, 92], [78, 92], [142, 186.4], [114, 186.4]]];
const N_STEM = 26, HOUSE_W = 152, HOUSE_H = 186.4 - 6;
function inPoly(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) if ((p[i][1] > y) !== (p[j][1] > y) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
  return inside;
}
function grad(x, y) {                                                       // the gradient: color at a point of the 192 x 192 source (floats)
  const t = Math.pow(Math.min(1, Math.max(0, (x - y + 192) / 384)), 0.9);
  return [8 + 38 * t, 92 + 68 * t, 122 + 70 * t];
}
function makeLogo(withN) {
  const S = 8, n = 192, px = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let hc = 0, nc = 0;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const sx = x + (i + 0.5) / S, sy = y + (j + 0.5) / S;
      if (inPoly(HOUSE, sx, sy)) { hc++; if (withN && N_SHAPES.some((s) => inPoly(s, sx, sy))) nc++; }
    }
    if (!hc) continue;
    const a = hc / (S * S), q = nc / hc, g = grad(x + 0.5, y + 0.5), halo = (1 - a) * 0.8, o = (y * n + x) * 4;
    for (let k = 0; k < 3; k++) { const c = g[k] * (1 - q) + 255 * q; px[o + k] = Math.round(c * (1 - halo) + 255 * halo); }    // the light fringe of the real file
    px[o + 3] = Math.round(255 * a);
  }
  return encodePng(n, n, px);
}
function enclosingCircle(pts) {                                             // the smallest circle around a few points: brute force over pairs and triples
  const inside = (c, p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= c[2] + 1e-9, cands = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    cands.push([(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) / 2]);
    for (let k = j + 1; k < pts.length; k++) {
      const [ax, ay] = pts[i], [bx, by] = pts[j], [cx, cy] = pts[k], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-9) continue;
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      cands.push([ux, uy, Math.hypot(ax - ux, ay - uy)]);
    }
  }
  return cands.filter((c) => pts.every((p) => inside(c, p))).sort((a, b) => a[2] - b[2])[0];
}
const CIRCLE = enclosingCircle(HOUSE);                                      // [cx, cy, r] in source pixels

// ---- an app tree as apktool decodes it, as far as patch-16 looks at it
const DENSITIES = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const SCREENS = { ldpi: [240, 320], mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const LOGO = makeLogo(true);
function makeTree(dir, opts) {
  opts = opts || {};
  const put = (rel, data) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
  put('AndroidManifest.xml', '<?xml version="1.0" encoding="utf-8" standalone="no"?><manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app">' +
    '<application android:icon="@mipmap/ic_launcher" android:label="Example"><activity android:name=".MainActivity" android:theme="@android:style/Theme.DeviceDefault.NoActionBar"/>' +
    '<activity android:name=".Other" android:theme="@android:style/Theme.Translucent.NoTitleBar"/></application></manifest>');
  put('res/xml/config.xml', '<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<widget id="com.example.app" version="1.0">\n    <preference name="SplashScreenDelay" value="3000" />\n' +
    '    <preference name="Other" value="1" />\n</widget>\n');
  put('assets/www/js/app.min.js', 'var a=1;function f(){PushNotification.init({android:{senderID:PUSH_SENDER_ID},ios:{alert:true}})}\n');
  const logoPng = opts.icon || LOGO;
  for (const d of Object.keys(DENSITIES)) put('res/mipmap-' + d + '/ic_launcher.png', d === 'xxxhdpi' ? logoPng : Buffer.concat([Buffer.from('legacy icon of ' + d + ' '), crypto.randomBytes(40)]));
  for (const [d, [w, h]] of Object.entries(SCREENS)) {
    for (const [o, ww, hh] of [['port', w, h], ['land', h, w]]) {
      const px = Buffer.alloc(ww * hh * 4); for (let i = 3; i < px.length; i += 4) px[i] = 255;          // black
      put('res/drawable-' + o + '-' + d + (opts.v4 && d === 'mdpi' ? '-v4' : '') + '/screen.png', encodePng(ww, hh, px));
    }
  }
}
function snapshot(dir) {
  const out = {};
  (function walk(d) { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) walk(f); else out[path.relative(dir, f)] = crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'); } })(dir);
  return out;
}
function run(dir) {
  const r = cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-16-brand.py'), dir], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-test-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* the system cleans /tmp */ } });
const keys = (o) => Object.keys(o).sort();

// ---- the main run
const A = path.join(tmp, 'a');
makeTree(A);
const before = snapshot(A);
const t0 = Date.now();
const res = run(A);
const after = snapshot(A);
console.log('      (the patch took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
ok('the patch script runs on the invented tree and reports the nx20 brand patch', res.status === 0 && /patched \(nx20 brand\)/.test(res.out), res.out.slice(0, 300));

const added = keys(after).filter((f) => !(f in before)), changed = keys(after).filter((f) => f in before && after[f] !== before[f]);
const D5 = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
const expectedAdded = [].concat(
  D5.map((d) => 'res/mipmap-' + d + '/ic_launcher_foreground.png'), D5.map((d) => 'res/mipmap-' + d + '/ic_launcher_monochrome.png'),
  D5.map((d) => 'res/drawable-' + d + '/nx_stat.png'), D5.map((d) => 'res/drawable-' + d + '/nx_splash_icon.png'),
  Object.keys(SCREENS).map((d) => 'res/drawable-port-night-' + d + '/screen.png'), Object.keys(SCREENS).map((d) => 'res/drawable-land-night-' + d + '/screen.png'),
  ['res/mipmap-anydpi-v26/ic_launcher.xml', 'res/values/nx_brand.xml', 'res/values-night/nx_brand.xml', 'res/values-v31/nx_brand.xml']).sort();
const expectedChanged = [].concat(Object.keys(SCREENS).map((d) => 'res/drawable-port-' + d + '/screen.png'), Object.keys(SCREENS).map((d) => 'res/drawable-land-' + d + '/screen.png'),
  ['AndroidManifest.xml', 'assets/www/js/app.min.js', 'res/xml/config.xml']).sort();
ok('it adds exactly 36 files: the layers of the adaptive icon, the small icon, the splash icon, the night splash screens, the adaptive icon and 3 value files', added.join() === expectedAdded.join(),
  'extra: ' + added.filter((f) => expectedAdded.indexOf(f) < 0).join(', ') + ' missing: ' + expectedAdded.filter((f) => added.indexOf(f) < 0).join(', '));
ok('...and changes exactly these 15: the 12 splash pictures of the app, the manifest, the config and app.min.js', changed.join() === expectedChanged.join(),
  'extra: ' + changed.filter((f) => expectedChanged.indexOf(f) < 0).join(', ') + ' missing: ' + expectedChanged.filter((f) => changed.indexOf(f) < 0).join(', '));
ok('the launcher icons of Android 7 and older, the original logo, are not touched (byte for byte)', Object.keys(DENSITIES).every((d) => after['res/mipmap-' + d + '/ic_launcher.png'] === before['res/mipmap-' + d + '/ic_launcher.png']));
ok('the new folders are named as apktool decodes them (no -v4: that would be a second copy of the same resource)', added.every((f) => !/^res\/(drawable|mipmap)-(?!anydpi)[a-z0-9-]*-v\d+\//.test(f)));

const read = (rel) => fs.readFileSync(path.join(A, rel));
const img = (rel) => decode(read(rel), rel);
const alphaBox = (im, min) => {
  let x0 = im.w, x1 = -1, y0 = im.h, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.at(x, y).a >= min) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, x1: x1 + 1, y0, y1: y1 + 1, w: x1 + 1 - x0, h: y1 + 1 - y0 };
};
const reach = (im, min, cx, cy) => { let m = 0; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.at(x, y).a >= min) m = Math.max(m, Math.hypot(x + 0.5 - cx, y + 0.5 - cy)); return m; };
const SCALE = (r) => r / (CIRCLE[2] + 0.5);                                // source pixels -> pixels, when the circle around the logo gets radius r (the script adds half a pixel for the edge pixels)

// ---- the adaptive icon: foreground and monochrome layers
{
  const bad = [], far = [], notCentered = [], big = [];
  for (const d of D5) {
    const k = DENSITIES[d], fg = img('res/mipmap-' + d + '/ic_launcher_foreground.png'), c = 54 * k;
    if (fg.w !== 108 * k || fg.h !== 108 * k) bad.push(d + ' ' + fg.w + 'x' + fg.h);
    const r = reach(fg, 128, fg.w / 2, fg.h / 2);
    if (r > 33 * k + 0.5) far.push(d + ': ' + r.toFixed(1) + ' > ' + (33 * k));
    if (r < 29 * k) big.push(d + ': ' + r.toFixed(1));
    const b = alphaBox(fg, 128), ex = SCALE(31 * k) * HOUSE_W;
    if (Math.abs((b.x0 + b.x1) / 2 - c) > 1 || Math.abs(b.w - ex) > 0.015 * ex + 1) notCentered.push(d + ': box ' + b.x0 + '-' + b.x1 + ' width ' + b.w + ' (expected ' + ex.toFixed(1) + ')');
  }
  ok('the foreground layers are 108 dp on mdpi, hdpi, xhdpi, xxhdpi and xxxhdpi (108, 162, 216, 324 and 432 px)', bad.length === 0, bad.join(', '));
  ok('...the logo is inside the safe zone of Android (a circle of 66 dp around the middle: 33 dp)', far.length === 0, far.join(', '));
  ok('...and not smaller than needed: it touches a circle of 31 dp (the roof and the lower corners are on it)', big.length === 0, big.join(', '));
  ok('...horizontally in the middle, and as wide as the circle of 31 dp makes the invented house (152 px of the source)', notCentered.length === 0, notCentered.join(' | '));
  const fg = img('res/mipmap-xxxhdpi/ic_launcher_foreground.png'), mono = img('res/mipmap-xxxhdpi/ic_launcher_monochrome.png');
  let whiteOpaque = 0, opaque = 0, odd = 0, nCut = 0, bodyFull = 0;
  for (let y = 0; y < fg.h; y++) for (let x = 0; x < fg.w; x++) {
    const c = fg.at(x, y), m = mono.at(x, y);
    if (c.a === 255) { opaque++; if (c.r > 250 && c.g > 250 && c.b > 250) { whiteOpaque++; if (m.a === 0) nCut++; } else if (m.a === 255) bodyFull++; }
    if (m.a > 0 && (m.r || m.g || m.b)) odd++;
  }
  ok('the foreground has the white N inside the house: opaque white pixels, about a third of the house', whiteOpaque > 0.2 * opaque && whiteOpaque < 0.45 * opaque, String(whiteOpaque / opaque));
  ok('the monochrome layer is the house with the N cut out: transparent where the foreground has the N, opaque where it has the blue, black (the launcher colors it)',
    nCut > 0.97 * whiteOpaque && bodyFull > 0.93 * (opaque - whiteOpaque) && odd === 0, nCut + ' of ' + whiteOpaque + ', ' + bodyFull + ' of ' + (opaque - whiteOpaque) + ', odd ' + odd);
  const bf = alphaBox(fg, 128), bm = alphaBox(mono, 128);
  ok('...and the two layers have the same outline', Math.abs(bf.x0 - bm.x0) <= 1 && Math.abs(bf.x1 - bm.x1) <= 1 && Math.abs(bf.y0 - bm.y0) <= 1 && Math.abs(bf.y1 - bm.y1) <= 1);
}

// ---- the small icon of the notifications
{
  const sizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 }, bad = [], notWhite = [], notFit = [], noCut = [];
  for (const [d, px] of Object.entries(sizes)) {
    const i = img('res/drawable-' + d + '/nx_stat.png'), k = DENSITIES[d];
    if (i.w !== px || i.h !== px) bad.push(d + ' ' + i.w + 'x' + i.h);
    let odd = 0, cut = 0;
    for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) { const c = i.at(x, y); if (c.a > 0 && (c.r < 253 || c.g < 253 || c.b < 253)) odd++; }
    if (odd) notWhite.push(d + ': ' + odd);
    const b = alphaBox(i, 128);
    if (Math.abs(b.h - 20 * k) > 1.01 || Math.abs((b.y0 + b.y1) / 2 - 12 * k) > 1 || Math.abs((b.x0 + b.x1) / 2 - 12 * k) > 1) notFit.push(d + ': box ' + b.x0 + ',' + b.y0 + ' ' + b.w + 'x' + b.h);
    // the N is cut out: in the middle of the house, in the lower part, there are transparent pixels between opaque ones
    const y = Math.round(b.y0 + b.h * 0.75);
    let state = 0; for (let x = b.x0; x < b.x1; x++) { const a = i.at(x, y).a; if (state === 0 && a > 200) state = 1; else if (state === 1 && a < 50) state = 2; else if (state === 2 && a > 200) state = 3; }
    if (state !== 3) noCut.push(d);
  }
  ok('the small icons are 24 dp: 24, 36, 48, 72 and 96 px', bad.length === 0, bad.join(', '));
  ok('...white on transparent, nothing else (a colored one would be a gray blot in the status bar)', notWhite.length === 0, notWhite.join(', '));
  ok('...the house is 20 dp high and in the middle of the 24 dp (2 dp of air above and below)', notFit.length === 0, notFit.join(' | '));
  ok('...with the N cut out (a line across the lower part goes opaque, transparent, opaque)', noCut.length === 0, noCut.join(', '));
}

// ---- the splash icon of Android 12 and up
{
  const bad = [], far = [];
  for (const d of D5) {
    const k = DENSITIES[d], i = img('res/drawable-' + d + '/nx_splash_icon.png');
    if (i.w !== 288 * k || i.h !== 288 * k) bad.push(d + ' ' + i.w + 'x' + i.h);
    const r = reach(i, 128, i.w / 2, i.h / 2);
    if (r > 96 * k * 0.9 || r < 70 * k) far.push(d + ': ' + r.toFixed(1));
  }
  ok('the splash icons are 288 dp (288, 432, 576, 864 and 1152 px)', bad.length === 0, bad.join(', '));
  ok('...the logo is inside the circle of 96 dp that Android 12 shows of it, with room to spare (circle of 76 dp around the logo)', far.length === 0, far.join(', '));
}

// ---- the splash screens: the sizes of the original app, light and dark, the logo in the middle
// the field of the splash screens is the surface of the DEFAULT palette of the skin: the first light block and the first dark block of tokens.css (the other palettes
// come after those and are chosen in the app; the native splash screen cannot know the choice)
const TOKENS = fs.readFileSync(path.join(ROOT, 'skin', 'src', 'tokens.css'), 'utf8'), MEDIA = TOKENS.indexOf('@media (prefers-color-scheme: dark)');
const surfaceOf = (text) => ((text.match(/--md-sys-color-surface:\s*#([0-9a-f]{6})/i) || [])[1] || '').toUpperCase();
const LIGHT_HEX = '#' + surfaceOf(TOKENS.slice(0, MEDIA)), DARK_HEX = '#' + surfaceOf(TOKENS.slice(MEDIA));
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
const LIGHT = rgbOf(LIGHT_HEX), DARK = rgbOf(DARK_HEX);
{
  const badSize = [], badColor = [], badLogo = [], tooBig = [];
  for (const [d, [w, h]] of Object.entries(SCREENS)) for (const [o, ww, hh] of [['port', w, h], ['land', h, w]]) {
    for (const [night, col] of [['', LIGHT], ['-night', DARK]]) {
      const name = 'res/drawable-' + o + night + '-' + d + '/screen.png', buf = read(name), sz = size(buf);
      if (sz.w !== ww || sz.h !== hh) badSize.push(name + ' ' + sz.w + 'x' + sz.h);
      if (buf.length > 90000) tooBig.push(name + ' ' + buf.length);
      if (d === 'ldpi' || d === 'xxhdpi' || (d === 'xxxhdpi' && o === 'port')) {
        const i = decode(buf, name);
        const corners = [i.at(0, 0), i.at(i.w - 1, 0), i.at(0, i.h - 1), i.at(i.w - 1, i.h - 1)];
        if (i.type !== 2 || corners.some((c) => c.r !== col[0] || c.g !== col[1] || c.b !== col[2])) badColor.push(name + ' type ' + i.type + ' ' + JSON.stringify(corners[0]));
        // the logo: the pixels that are not the background; its height is 27 % of the shorter side, and it is in the middle
        let x0 = i.w, x1 = -1, y0 = i.h, y1 = -1;
        for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) { const c = i.at(x, y); if (Math.abs(c.r - col[0]) + Math.abs(c.g - col[1]) + Math.abs(c.b - col[2]) > 90) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        const lh = y1 + 1 - y0, want = 0.27 * Math.min(i.w, i.h);
        if (Math.abs(lh - want) > 0.03 * want + 1 || Math.abs((x0 + x1 + 1) / 2 - i.w / 2) > 1.5) badLogo.push(name + ': logo ' + (x1 + 1 - x0) + 'x' + lh + ', want height ' + want.toFixed(0) + ', middle ' + (x0 + x1 + 1) / 2 + ' of ' + i.w / 2);
      }
    }
  }
  ok('the 12 splash pictures have the sizes of the originals, and so do their 12 night variants (portrait and landscape, six densities)', badSize.length === 0, badSize.join(' | '));
  ok('...they are small (a plain field and a logo)', tooBig.length === 0, tooBig.join(', '));
  ok('...the field is the surface of the light theme of the default palette (' + LIGHT_HEX + '), and ' + DARK_HEX + ' for the night mode, in all four corners; RGB, no alpha', /^#[0-9A-F]{6}$/.test(LIGHT_HEX) && /^#[0-9A-F]{6}$/.test(DARK_HEX) && badColor.length === 0, badColor.join(' | '));
  ok('...the logo is in the middle and 27 % of the shorter side high, also in landscape', badLogo.length === 0, badLogo.join(' | '));
  const day = decode(read('res/drawable-port-xxhdpi/screen.png'), 'day'), night = decode(read('res/drawable-port-night-xxhdpi/screen.png'), 'night');
  let same = 0, opaque = 0;
  for (let y = 0; y < day.h; y += 3) for (let x = 0; x < day.w; x += 3) { const c = day.at(x, y), n = night.at(x, y); if (Math.abs(c.r - 0xF6) + Math.abs(c.g - 0xFA) + Math.abs(c.b - 0xFE) > 120) { opaque++; if (c.r === n.r && c.g === n.g && c.b === n.b) same++; } }
  ok('the logo is the same on the light and the dark field (where it covers the pixel fully)', opaque > 500 && same > 0.9 * opaque, same + ' of ' + opaque);
}

// ---- quality: sharp edges after an enlargement, no halo, proportions, colors
{
  const i = img('res/drawable-xxxhdpi/nx_splash_icon.png'), k = 4, s = SCALE(76 * k);              // s is about 2.8: the source is enlarged 2.8 times
  const b = alphaBox(i, 128), rowY = Math.round(b.y0 + b.h * (86 - 6) / HOUSE_H);                   // a row through the walls of the house, below the eaves and above the N (y = 86 of the source)
  const row = []; for (let x = 0; x < i.w; x++) row.push(i.at(x, rowY));
  const partial = row.filter((c) => c.a > 8 && c.a < 247);
  ok('an edge is sharp: across the walls of the house at ' + s.toFixed(1) + ' times the source, at most 4 pixels of a row are partly covered, two walls with one or two each (plain resampling of the source leaves 5 or more per wall)', partial.length <= 4, String(partial.length));
  const ex = partial.filter((c) => c.a > 100 && c.a < 247);
  const inner = row[b.x0 + Math.round(8 * s)];
  const lighter = ex.map((c) => Math.max(c.r - inner.r, c.g - inner.g, c.b - inner.b));
  ok('...and has no halo: the color of a half-covered pixel at the edge is the color of the house (the source has a light fringe of up to 60 levels there)', Math.max.apply(null, lighter.concat([0])) <= 14, lighter.join());
  // proportions: the stem of the N against the width of the house, on a row through the lower part (where the stems and the diagonal are separate shapes)
  const yy = Math.round(b.y0 + b.h * ((140 - 6) / HOUSE_H)), whites = [], starts = [];
  let start = -1; for (let x = 0; x <= i.w; x++) { const c = x < i.w ? i.at(x, yy) : { a: 0 }, w = c.a > 250 && c.r > 235 && c.g > 235 && c.b > 235; if (w && start < 0) start = x; if (!w && start >= 0) { whites.push(x - start); starts.push(start); start = -1; } }
  const want = N_STEM / HOUSE_W, got = whites.length ? whites[0] / b.w : 0;
  ok('the shapes keep their proportions: the stem of the N is ' + (want * 100).toFixed(1) + ' % of the width of the house (here ' + (got * 100).toFixed(1) + ' %), with the N as three white runs on that row', whites.length === 3 && Math.abs(got - want) < 0.012, whites.join());
  // the N is open at the bottom (white on white): where a stem reaches the lower edge of the house it is white up to the last row, not blue
  const sx = starts[0] + Math.floor(whites[0] / 2); let yb = i.h - 1; while (yb > 0 && i.at(sx, yb).a < 128) yb--;
  const low = i.at(sx, yb);
  ok('the N goes on to the lower edge of the house: the last row of a stem is white (not a blue line under it)', low.r > 225 && low.g > 225 && low.b > 225, JSON.stringify(low));
  // the gradient: dark at the lower left, light at the upper right, and the colors of the source
  const lum = (c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b, blue = (c) => c.a === 255 && !(c.r > 200 && c.g > 200 && c.b > 200);
  const mean = (x0, x1, y0, y1) => { let t = 0, n = 0; for (let y = Math.round(y0); y < Math.round(y1); y++) for (let x = Math.round(x0); x < Math.round(x1); x++) { const c = i.at(x, y); if (blue(c)) { t += lum(c); n++; } } return n ? t / n : -1; };
  const ll = mean(b.x0, b.x0 + b.w / 3, b.y0 + b.h / 2, b.y1), ur = mean(b.x0 + b.w * 2 / 3, b.x1, b.y0, b.y0 + b.h / 2);
  ok('the gradient runs from dark at the lower left to light at the upper right, as in the source', ll > 0 && ur - ll > 25, ll.toFixed(0) + ' / ' + ur.toFixed(0));
  const mid = i.at(Math.round(b.x0 + b.w * 0.5), Math.round(b.y0 + b.h * 0.12)), at = grad(96, 20);
  ok('...and the colors are those of the source (a point near the roof: ' + at.map(Math.round).join(',') + ' in the source, ' + [mid.r, mid.g, mid.b].join(',') + ' here)',
    Math.abs(mid.r - at[0]) <= 8 && Math.abs(mid.g - at[1]) <= 8 && Math.abs(mid.b - at[2]) <= 8);
}

// ---- the XML, the manifest, the config, the colors of the skin and the push options
{
  const ai = read('res/mipmap-anydpi-v26/ic_launcher.xml').toString(), v = read('res/values/nx_brand.xml').toString(), vn = read('res/values-night/nx_brand.xml').toString(), v31 = read('res/values-v31/nx_brand.xml').toString();
  ok('the adaptive icon has a background (a color), and a foreground and a monochrome layer (both mipmaps of the app)', /<adaptive-icon /.test(ai) && /<background android:drawable="@color\/nx_icon_background"\/>/.test(ai) &&
    /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/.test(ai) && /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/.test(ai));
  const surfaces = [LIGHT_HEX, DARK_HEX];
  ok('the colors of the field are the surface colors of the default palette of the skin: ' + surfaces.join(' and ') + ' (light and dark; the first blocks of skin/src/tokens.css)',
    new RegExp('<color name="nx_splash_field">' + surfaces[0] + '</color>').test(v) && new RegExp('<color name="nx_splash_field">' + surfaces[1] + '</color>').test(vn), surfaces.join());
  ok('the background of the adaptive icon is white (the logo is made for it)', /<color name="nx_icon_background">#FFFFFF<\/color>/.test(v));
  ok('the theme NxTheme is the old one (Theme.DeviceDefault.NoActionBar) with the field as the color of the window', /<style name="NxTheme" parent="@android:style\/Theme\.DeviceDefault\.NoActionBar">/.test(v) && /windowBackground">@color\/nx_splash_field/.test(v));
  ok('from Android 12 the splash screen of the system has the same field and the logo (nx_splash_icon)', /NxTheme" parent="@android:style\/Theme\.DeviceDefault\.NoActionBar"/.test(v31) &&
    /windowSplashScreenBackground">@color\/nx_splash_field/.test(v31) && /windowSplashScreenAnimatedIcon">@drawable\/nx_splash_icon</.test(v31));
  const man = read('AndroidManifest.xml').toString(), cfg = read('res/xml/config.xml').toString(), js = read('assets/www/js/app.min.js').toString();
  ok('only the theme of MainActivity is NxTheme now: the other activity keeps its own', (man.match(/@style\/NxTheme/g) || []).length === 1 && /Theme\.Translucent\.NoTitleBar/.test(man) && /MainActivity" android:theme="@style\/NxTheme"/.test(man));
  ok('the splash picture is no longer stretched (SplashMaintainAspectRatio right after the delay), the rest of the config is as it was',
    /SplashScreenDelay" value="3000" \/>\n    <preference name="SplashMaintainAspectRatio" value="true" \/>\n    <preference name="Other" value="1" \/>/.test(cfg));
  const m = js.match(/PushNotification\.init\(\{android:\{senderID:PUSH_SENDER_ID,icon:"nx_stat",iconColor:"#([0-9A-F]{6})"\},ios:\{alert:true\}\}\)/);
  const g = grad(CIRCLE[0], CIRCLE[1]), got = m ? [0, 2, 4].map((o) => parseInt(m[1].substr(o, 2), 16)) : [];
  ok('the push plugin gets the small icon and the blue of the logo (iconColor: the gradient in the middle of the logo, ' + g.map(Math.round).join(',') + ' in the source)', !!m && got.every((c, k) => Math.abs(c - g[k]) <= 8), js.slice(0, 160));
  ok('...and nothing else of app.min.js changes', js.replace(/,icon:"nx_stat",iconColor:"#[0-9A-F]{6}"/, '') === 'var a=1;function f(){PushNotification.init({android:{senderID:PUSH_SENDER_ID},ios:{alert:true}})}\n');
}

// ---- when something is wrong the script stops and writes nothing; it is deterministic; a second run refuses
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const second = run(A);
  ok('a second run says "already patched" and changes nothing', second.status !== 0 && /already patched/.test(second.out) && same(snapshot(A), after), second.out.slice(0, 200));

  const noise = path.join(tmp, 'noise'), px = crypto.randomBytes(192 * 192 * 4);
  makeTree(noise, { icon: encodePng(192, 192, px) });
  const snap1 = snapshot(noise), r1 = run(noise);
  ok('an icon that is not a gradient with a white shape (noise) is refused, with a message about the icon, and nothing is written', r1.status !== 0 && /ic_launcher\.png/.test(r1.out) && same(snapshot(noise), snap1), r1.out.slice(0, 200));

  const plain = path.join(tmp, 'plain');
  makeTree(plain, { icon: makeLogo(false) });
  const snap2 = snapshot(plain), r2 = run(plain);
  ok('a house without the white N is refused too (it is not the logo that this patch is for)', r2.status !== 0 && /N/.test(r2.out) && same(snapshot(plain), snap2), r2.out.slice(0, 200));

  const noAnchor = path.join(tmp, 'anchor');
  makeTree(noAnchor);
  fs.writeFileSync(path.join(noAnchor, 'res/xml/config.xml'), '<widget></widget>\n');
  const snap3 = snapshot(noAnchor), r3 = run(noAnchor);
  ok('a config.xml without the anchor is refused, and nothing is written (all or nothing)', r3.status !== 0 && /config\.xml/.test(r3.out) && same(snapshot(noAnchor), snap3), r3.out.slice(0, 200));

  const v4 = path.join(tmp, 'v4');
  makeTree(v4, { v4: true });
  const snap4 = snapshot(v4), r4 = run(v4);
  ok('a splash folder with another name (-v4) is refused: the old picture would stay next to the new one', r4.status !== 0 && /screen\.png/.test(r4.out) && same(snapshot(v4), snap4), r4.out.slice(0, 200));

  const B = path.join(tmp, 'b');
  makeTree(B);
  const rb = run(B), sb = snapshot(B);
  const differ = expectedAdded.concat(expectedChanged).filter((f) => sb[f] !== after[f]);
  ok('the result is deterministic: a second tree with the same input gets the same 51 files, byte for byte', rb.status === 0 && differ.length === 0, differ.join(', ') + ' ' + rb.out.slice(0, 200));
}

// ---- wiring
{
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8'), all = fs.readFileSync(path.join(ROOT, 'test-all.sh'), 'utf8');
  ok('build.sh runs patch-16-brand.py after the others, and test-all.sh runs this test', /patch-15-state\.py patch-16-brand\.py patch-17-gallery\.py/.test(build) && /node test\/brand\.test\.js/.test(all));
  ok('the repository has no Nice artwork: brand/ holds only code (logo.py, assets.py), no picture', fs.readdirSync(path.join(ROOT, 'brand')).filter((f) => !/\.(py)$|^__pycache__$/.test(f)).length === 0, fs.readdirSync(path.join(ROOT, 'brand')).join());
}
console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
