// Usage: node screens.cjs <folder> [list of routes]  (takes screenshots of the real app; SCRIPT=steps.cjs runs your own steps afterwards)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const WWW = path.join(__dirname, process.env.WWW || 'www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (process.env.NOSKIN && /nx-expressive\.css$/.test(p)) { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end(''); }
  const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const outDir = path.join(__dirname, 'shots', process.argv[2] || 'base'); fs.mkdirSync(outDir, { recursive: true });
  const cfg = JSON.parse(process.env.CFG || '{}');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number((process.env.VIEW || '412x915').split('x')[0]), height: Number((process.env.VIEW || '412x915').split('x')[1]) }, deviceScaleFactor: Number(process.env.DSF || 2), isMobile: true, hasTouch: true,
    colorScheme: process.env.COLOR_SCHEME || 'light',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  await ctx.addInitScript('window.__CFG=' + JSON.stringify(cfg) + ';');
  await ctx.addInitScript({ path: path.join(__dirname, 'shim.js') });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { const t = m.text(); if (/error|Error|undefined is not|Cannot/.test(t)) problems.push('console: ' + t.slice(0, 200)); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const routes = process.argv.slice(3).length ? process.argv.slice(3) : ['#/tabs/favorites'];
  for (const r of routes) {
    await page.evaluate((h) => { location.hash = h; }, r);
    await page.waitForTimeout(Number(process.env.WAIT || 1800));
    if (process.env.PRE) { await page.evaluate(process.env.PRE); await page.waitForTimeout(Number(process.env.PREWAIT || 900)); }
    const name = r.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'start';
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    console.log('screenshot', name, '->', await page.evaluate(() => location.hash));
  }
  if (process.env.SCRIPT) {   // a script with its own steps:  module.exports = async (page, { goto, wait, shot }) => { ... }
    const steps = require(path.resolve(process.env.SCRIPT));
    await steps(page, {
      goto: async (h, ms) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(ms || 1500); },
      wait: (ms) => page.waitForTimeout(ms),
      shot: (name) => page.screenshot({ path: path.join(outDir, name + '.png') }),
    });
  }
  if (process.env.JS) { console.log('JS:', JSON.stringify(await page.evaluate(process.env.JS))); }
  console.log('problems (' + problems.length + '):'); problems.slice(0, 15).forEach((m) => console.log('  ' + m));
  console.log('native calls:', JSON.stringify(await page.evaluate(() => (window.__nativeLog || []).slice(0, 40))));
  await browser.close(); server.close();
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });
