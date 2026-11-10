// nx23 gate: the accessory screen in every state it can be in, at several screen sizes, with measurements. (harness/steps-gate.cjs)
//
//   node steps-gate.cjs <tag> [scenario,scenario,...|all]
//
// writes harness/shots/gate-<tag>-<WxH>/<scenario>-<light|dark>.png and prints one JSON line per scenario and size:
//   { scenario, view, series: [{ t, open, close, stop, state, line, hero }], final: { ...rects and texts... } }
// series: where Open, Close and Stop are (their top edge, in CSS px) and how tall the state block, the status line and the hero are, every SAMPLE_MS
// from the moment the screen is entered, so that a row that arrives late (the Blocked pill, a note, an obstruction) shows up as a jump.
// Environment: WWW (the app to show: a folder, relative to harness/ or absolute; default www), VIEWS (default 412x915,360x640), SCHEMES (default light,dark),
// SAMPLE_MS (250), RUN_MS (how long the screen is watched after entering it, default 6500), REDUCE=1 (prefers-reduced-motion), SERIES=0 (no series: only the end).
// Invented data only (the shim of the harness): accessory AABBCC, module 00:0B:6C:AA:BB:CC.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const MAC = '00:0B:6C:AA:BB:CC';
const ROUTE = '#/tabs/favorites-device-detail/1/' + MAC;
const EXTRAS = { secondary: ['MDBk', 'MDFh', 'MDBl', 'MDEw', 'MDEx'], fourth: 'MDBk' };
const MIN = 60000;

// a log relative to "now", for the states that need one (set before the app starts: window.__logsOverride is read by the shim)
function logInit(deviceEvents, moduleEvents) {
  return '(function(){var now=Date.now(),M=60000,n=0;function e(s,t,at,d){n++;return{deviceId:d?"1":"",source:s,type:t,time:now-at*M,idx:String(n),id:String(n)};}' +
    'window.__logsOverride={interfaceLogs:' + moduleEvents + ',deviceLogs:' + deviceEvents + '};})();';
}
// Blocked by "Open and Block" 20 minutes ago (the real log of the maintainer's case); the module restarted 10 minutes ago: "Maybe blocked"
const BLOCK_LOG = '[e("CTRL-ANNA-0001","MDBk",20,1),e("busT4","open",19.98,1)]';
const RESTART_LOG = '[e("boot","Power ON",10,0),e("boot","T4 device not found",9.5,0),e("boot","T4 device found",9.48,0)]';
// the gate was opened twenty minutes ago and the accessory still says "opening": the state is settled from the log (a note, no Block)
const OPENED_LOG = '[e("CTRL-ANNA-0001","open",20,1),e("busT4","open",19.98,1)]';

// the answers of these calls of the simulated bridge come after 30 s (the app is waiting for the accessory: nothing is confirmed yet)
function slow(keys) {
  return '(function(){var N=window.__NATIVE;' + JSON.stringify(keys) + '.forEach(function(k){var o=N[k];N[k]=function(a){return {delay:30000,then:o(a)};};});})();';
}
// name -> { cfg, init (script before the app starts), run (async (page, h) => ... replaces entering the screen), runMs, shotAt }
const SCENARIOS = {
  closed: { cfg: {} },
  open: { cfg: { state: 'open' } },
  opening: { cfg: { state: 'opening', activity: 'none' } },
  closing: { cfg: { state: 'closing', activity: 'none' } },
  stopped: { cfg: { state: 'stopped' } },
  obstructed: { cfg: { obstruct: '1' } },
  'obstructed-open': { cfg: { state: 'open', obstruct: '1' } },
  blocked: { cfg: { state: 'open', activity: 'blocked' } },
  'blocked-opening': { cfg: { state: 'opening', activity: 'blocked' } },
  maybe: { cfg: { state: 'open' }, init: logInit(BLOCK_LOG, RESTART_LOG) },
  settled: { cfg: { state: 'opening' }, init: logInit(OPENED_LOG, '[]') },
  unknown: { cfg: { state: 'unknown' } },
  partial: { cfg: { state: 'partial' } },
  nostate: { cfg: { state: '' } },
  unusable: { cfg: { reachable: false, verifyFail: true }, runMs: 17000 },
  checking: { cfg: { reachable: false, verifyDelay: 30000 }, init: slow(['nhk.connect', 'nhk.status']), runMs: 4000 },
  hold: { cfg: { verifyDelay: 30000 }, runMs: 4000 },        // stored "reachable", the check of this session is still running: the state of the last session shows
  connecting: { cfg: { verifyScript: ['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'ok'], verifyDelay: 1500 }, run: connecting },
  // the Activity sheet while the log is being read (the wavy progress bar along its top): with REDUCE=1 it must be a bar that stands still, not an empty track
  'busy-sheet': { cfg: { activity: 'slow' }, run: async (page, h) => { await h.enter(1500); await page.evaluate(() => window.NX.activity()); await page.waitForTimeout(1500); } },
  extras2: { cfg: Object.assign({ quick: ['MDBk', 'MDFh'] }, EXTRAS) },
  extras3: { cfg: Object.assign({ quick: ['MDBk', 'MDFh', 'MDBl'] }, EXTRAS) },
  extras4: { cfg: Object.assign({ quick: ['MDBk', 'MDFh', 'MDBl', 'MDEw'] }, EXTRAS) },
  extras6: { cfg: Object.assign({ quick: ['MDBk', 'MDFh', 'MDBl', 'MDEw', 'MDEx'] }, EXTRAS) },
  'extras-none': { cfg: Object.assign({ quick: [] }, EXTRAS) },           // the accessory offers commands, none ticked: only the link
  // the worst case of the brief: two extras, the Blocked pill (and the note) and an obstruction
  worst: { cfg: Object.assign({ state: 'opening', obstruct: '1', activity: 'blocked', quick: ['MDBk', 'MDFh'] }, EXTRAS) },
  'worst-unusable': { cfg: Object.assign({ obstruct: '1', reachable: false, verifyFail: true, quick: ['MDBk', 'MDFh'] }, EXTRAS), runMs: 17000 },
};

// "Connecting...": the first check of the session fails (three attempts), the screen is entered again and a new attempt runs (see steps-connecting.cjs)
async function connecting(page, h) {
  await h.enter(900);
  await page.waitForTimeout(14000);
  await h.leave(600);
  await h.enter(1300);
}

// what the page tells (run in the browser)
function measure() {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, left: Math.round(b.left * 10) / 10, right: Math.round(b.right * 10) / 10, h: Math.round(b.height * 10) / 10, w: Math.round(b.width * 10) / 10 }; };
  const vis = (el) => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const text = (el) => el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : null;   // innerText: what is shown (display:none and ng-hide are left out)
  const dc = document.querySelector('.device-commands');
  const cmd = (key) => dc ? Array.from(dc.querySelectorAll(':scope > .command')).find((a) => !!a.querySelector('[translate$="_' + key + '"]')) : null;
  const open = cmd('open'), close = cmd('close'), stop = cmd('stop');
  const tabs = document.querySelector('.tabs'), bar = document.querySelector('.bar-header');
  const hero = document.querySelector('.device-icon');
  const stateBlock = document.querySelector('.nx-state') || Array.from(document.querySelectorAll('.device-info .device-row')).find(vis);
  const line = document.querySelector('.nx-line');
  const chip = document.querySelector('.nx-last');
  const cs = (el, p) => el ? getComputedStyle(el)[p] : null;
  const heroI = hero ? hero.querySelector('i') : null;
  const visStrongs = Array.from(document.querySelectorAll('.device-info strong')).filter(vis).map(text);
  const extras = Array.from(document.querySelectorAll('.nx-extras .command')).map((e) => ({ t: text(e), r: r(e) }));
  const edit = document.querySelector('.nx-extra-edit');
  const rects = { hero: r(hero), state: r(stateBlock), chip: r(chip), line: r(line), open: r(open), close: r(close), stop: r(stop) };
  // overlaps between the blocks that must not overlap (a sanity check of the layout)
  const names = Object.keys(rects).filter((k) => rects[k] && rects[k].h > 0);
  const overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = rects[names[i]], b = rects[names[j]];
    if (a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5 && a.left < b.right - 0.5 && b.left < a.right - 0.5 && !(names[i] === 'open' && names[j] === 'close')) overlaps.push(names[i] + '/' + names[j]);
  }
  const tabsTop = tabs ? tabs.getBoundingClientRect().top : window.innerHeight;
  const barBottom = bar ? bar.getBoundingClientRect().bottom : 0;
  const sr = stop ? stop.getBoundingClientRect() : null;
  return {
    vw: window.innerWidth, vh: window.innerHeight, tabsTop: Math.round(tabsTop), barBottom: Math.round(barBottom),
    rects, extras, edit: r(edit), editText: text(edit), caption: text(document.querySelector('.nx-extras-cap')),
    commands: dc ? Object.assign(r(dc), { scrollH: dc.scrollHeight, clientH: dc.clientHeight }) : null,
    stopVisible: !!sr && sr.bottom <= tabsTop + 0.5 && sr.top >= barBottom - 0.5,
    stopBg: cs(stop, 'backgroundColor'), stopFg: cs(stop, 'color'), stopShadow: cs(stop, 'boxShadow'),
    openBg: cs(open, 'backgroundColor'), openRadius: cs(open, 'borderRadius'), closeRadius: cs(close, 'borderRadius'),
    states: visStrongs, stateText: text(stateBlock), lineText: text(line), lineAttrs: line ? { kind: line.getAttribute('data-nx-kind'), trust: line.getAttribute('data-nx-trust'), unsure: line.getAttribute('data-nx-unsure') } : null,
    lineH: line ? Math.round(line.getBoundingClientRect().height * 10) / 10 : null,
    chipText: text(chip), chipH: chip ? Math.round(chip.getBoundingClientRect().height * 10) / 10 : null,
    heroClass: heroI ? heroI.className.replace(/\s*ng-[a-z-]+/g, '').trim() : null, heroBg: hero ? getComputedStyle(hero, '::before').backgroundColor : null,
    heroClip: hero ? getComputedStyle(hero, '::before').clipPath.slice(0, 30) : null,
    heroAnim: document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.device-icon') && a.constructor.name === 'CSSAnimation').map((a) => a.animationName).join(','),
    overlaps, chrome: chromeInfo(),
  };
  function chromeInfo() { const root = document.documentElement; return { status: root.getAttribute('data-nx-status'), chip: (root.style.getPropertyValue('--nx-sub') || '').replace(/^"|"$/g, '') }; }
}

(async () => {
  const tag = process.argv[2] || 'run';
  const want = (process.argv[3] || 'all').split(',');
  const names = want[0] === 'all' ? Object.keys(SCENARIOS) : want;
  const views = (process.env.VIEWS || '412x915,360x640').split(',');
  const schemes = (process.env.SCHEMES || 'light,dark').split(',');
  const sampleMs = Number(process.env.SAMPLE_MS || 250);
  const WWW = path.resolve(__dirname, process.env.WWW || 'www');
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WWW, p);
    if (!f.startsWith(WWW) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch();
  for (const view of views) {
    const [w, h] = view.split('x').map(Number);
    const outDir = path.join(__dirname, 'shots', 'gate-' + tag + '-' + view); fs.mkdirSync(outDir, { recursive: true });
    for (const name of names) {
      const sc = SCENARIOS[name];
      if (!sc) { console.log('unknown scenario ' + name); continue; }
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DSF || 2), isMobile: true, hasTouch: true, colorScheme: schemes[0],
        reducedMotion: process.env.REDUCE ? 'reduce' : 'no-preference',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
      await ctx.addInitScript('window.__CFG=' + JSON.stringify(sc.cfg || {}) + ';');
      await ctx.addInitScript({ path: path.join(__dirname, 'shim.js') });
      if (sc.init) await ctx.addInitScript(sc.init);
      const page = await ctx.newPage();
      const problems = [];
      page.on('pageerror', (e) => problems.push('pageerror: ' + String(e).slice(0, 200)));
      await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
      await page.waitForTimeout(Number(process.env.BOOT_MS || 2500));
      const series = [];
      const helpers = {
        enter: async (ms) => { await page.evaluate((x) => { location.hash = x; }, ROUTE); await page.waitForTimeout(ms || 900); },
        leave: async (ms) => { await page.evaluate(() => { location.hash = '#/tabs/favorites'; }); await page.waitForTimeout(ms || 600); },
      };
      const t0 = Date.now();
      const sample = async () => {
        const m = await page.evaluate(measure);
        series.push({ t: Date.now() - t0, open: m.rects.open && m.rects.open.top, close: m.rects.close && m.rects.close.top, stop: m.rects.stop && m.rects.stop.top, state: m.rects.state && m.rects.state.h, line: m.rects.line && m.rects.line.h,
          chip: m.rects.chip && m.rects.chip.h, hero: m.rects.hero && m.rects.hero.h });
        return m;
      };
      if (sc.run) {
        // the scenario enters the screen by itself; the series is taken only after it
        await sc.run(page, helpers);
        const until = Date.now() + 2500;
        while (Date.now() < until && process.env.SERIES !== '0') { await sample(); await page.waitForTimeout(sampleMs); }
      } else {
        await page.evaluate((x) => { location.hash = x; }, ROUTE);
        const until = Date.now() + (sc.runMs || Number(process.env.RUN_MS || 6500));
        if (process.env.SERIES === '0') await page.waitForTimeout(until - Date.now());
        else while (Date.now() < until) { await page.waitForTimeout(sampleMs); await sample(); }
      }
      const final = await page.evaluate(measure);
      for (let i = 0; i < schemes.length; i++) {
        if (i > 0) { await page.emulateMedia({ colorScheme: schemes[i] }); await page.waitForTimeout(500); }
        await page.screenshot({ path: path.join(outDir, name + '-' + schemes[i] + '.png') });
      }
      // the jumps: how far the top of Open, Close and Stop moved over the whole series
      const span = (k) => { const v = series.map((s) => s[k]).filter((x) => typeof x === 'number'); return v.length ? Math.round((Math.max(...v) - Math.min(...v)) * 10) / 10 : null; };
      console.log('SCEN ' + JSON.stringify({ scenario: name, view, moved: { open: span('open'), close: span('close'), stop: span('stop') }, problems: problems.slice(0, 3), series: compress(series), final }));
      await ctx.close();
    }
  }
  await browser.close(); server.close();
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(1); });

// only the changes of the series
function compress(series) {
  const out = []; let prev = '';
  for (const s of series) { const key = [s.open, s.stop, s.state, s.line, s.chip, s.hero].join('/'); if (key !== prev) { out.push(s); prev = key; } }
  return out;
}
