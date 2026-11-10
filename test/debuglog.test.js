// Test of debuglog.js (the Debug log) in jsdom: the sheet (its parts and names), opening and closing (Done, scrim, Escape, hashchange, the DOM backbutton event), Copy (the three ways and what it
// says), Clear (asks again), that the redraw leaves a selection alone, and that the masking of secrets and the left-out noise are as before. Layout is not tested here (jsdom has none):
// harness/steps-log.cjs checks the sheet (50 % high, 48 dp buttons, 12 px lines), the docked button and the five ways out in Chromium. All data is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/debuglog.test.js
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('skipped: jsdom is missing (npm install, or point NODE_PATH at a folder with node_modules/jsdom)');
  process.exit(0);
}
const SRC = fs.readFileSync(path.join(__dirname, '..', 'debuglog.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))));
}
function environment(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><body><div id="app">the app</div></body></html>', { url: 'http://localhost/#/start', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const timers = [];
  if (opts.captureTimers) { const st = w.setTimeout; w.setTimeout = function (fn, ms) { timers.push({ fn, ms }); return st.call(w, fn, ms); }; }
  ['log', 'info', 'warn', 'error'].forEach((k) => { w.console[k] = function () {}; });      // the module passes every line on to the console: not into the report of the test
  if (opts.setup) opts.setup(w);
  w.eval(SRC);
  const doc = w.document;
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));      // jsdom has not finished loading at this point; the module builds the sheet when it has (build() is idempotent)
  return { w, doc, timers, q: (s) => doc.querySelector(s), qa: (s) => Array.from(doc.querySelectorAll(s)), btn: (t) => Array.from(doc.querySelectorAll('#nx-log-panel button')).find((b) => b.textContent === t) };
}

(async function () {
  // ------------------------------------------------------------------------------------------------ what it builds
  {
    const e = environment();
    const p = e.q('#nx-log-panel'), b = e.q('#nx-log-button');
    ok('the ids that verify-apk.py and the harness use are still there: #nx-log-button, #nx-log-panel with a <pre>, window.__nxLogShow', !!p && !!b && !!p.querySelector('pre') && typeof e.w.__nxLogShow === 'function');
    ok('the API is __nxLogShow, __nxLogHide and __nxLogIsOpen; closed to begin with', typeof e.w.__nxLogHide === 'function' && typeof e.w.__nxLogIsOpen === 'function' && e.w.__nxLogIsOpen() === false);
    ok('the button is a real button with a name, and Ionic leaves its taps alone', b.tagName === 'BUTTON' && b.type === 'button' && b.getAttribute('aria-label') === 'Debug log' && b.getAttribute('data-tap-disabled') === 'true' && b.getAttribute('style') === null);
    ok('the panel is a sheet like the others (class nx-sheet) and a modal dialog named by its title, English, focusable by script', p.classList.contains('nx-sheet') && p.getAttribute('role') === 'dialog' && p.getAttribute('aria-modal') === 'true' && p.getAttribute('aria-labelledby') === 'nx-log-title' && e.q('#nx-log-title').textContent === 'Debug log' && p.getAttribute('lang') === 'en' && p.getAttribute('tabindex') === '-1' && p.getAttribute('data-tap-disabled') === 'true');
    ok('the panel is hidden to begin with (display:none from the safety net)', p.style.display === 'none' && e.q('.nx-scrim').style.display === 'none');
    ok('it has a scrim, a handle, a status line (role status), the lines in a focusable region, and three real buttons Clear, Copy, Done', !!e.q('.nx-scrim') && !!p.querySelector('.nx-handle') && p.querySelector('.nx-log-sub').getAttribute('role') === 'status' && p.querySelector('pre').getAttribute('role') === 'region' && p.querySelector('pre').getAttribute('tabindex') === '0' && Array.from(p.querySelectorAll('.nx-footer button')).map((x) => x.textContent + ':' + x.type).join() === 'Clear:button,Copy:button,Done:button');
    ok('nothing is built twice (the 2 s timer is only a safety net)', e.qa('#nx-log-panel').length === 1 && e.qa('#nx-log-button').length === 1);
  }
  // ------------------------------------------------------------------------------------------------ opening and the ways out
  {
    const e = environment();
    e.w.console.log('first line');
    e.w.__nxLogShow();
    const p = e.q('#nx-log-panel');
    ok('__nxLogShow opens it: displayed at once, the line is in it', p.style.display === 'flex' && e.w.__nxLogIsOpen() && /first line/.test(p.querySelector('pre').textContent), p.querySelector('pre').textContent);
    await sleep(120);
    ok('...and after two frames it has the open class (the slide-in), scrim too', p.classList.contains('nx-open') && e.q('.nx-scrim').classList.contains('nx-open') && e.q('.nx-scrim').style.display === 'block');
    ok('the status line says how many lines, that secrets are masked and to check before sharing', /^\d+ lines?, secrets are masked, check before you share$/.test(e.q('.nx-log-sub').textContent), e.q('.nx-log-sub').textContent);
    e.btn('Done').click();
    ok('Done closes it', !e.w.__nxLogIsOpen() && !p.classList.contains('nx-open') && !e.q('.nx-scrim').classList.contains('nx-open'));
    await sleep(420);
    ok('...and it is hidden again after the slide-out (no animation keeps running)', p.style.display === 'none' && e.q('.nx-scrim').style.display === 'none');
    e.w.__nxLogShow(); await sleep(120);
    e.q('.nx-scrim').click();
    ok('a tap on the scrim closes it', !e.w.__nxLogIsOpen());
    e.w.__nxLogShow(); await sleep(120);
    e.doc.body.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ok('Escape closes it, wherever the focus is (also without nx-patch.js)', !e.w.__nxLogIsOpen());
    e.w.__nxLogShow(); await sleep(120);
    e.w.location.hash = '#/tabs/favorites'; await sleep(60);
    ok('a change of page closes it (it must never stay over the next screen)', !e.w.__nxLogIsOpen());
    e.w.__nxLogShow(); await sleep(120);
    e.doc.dispatchEvent(new e.w.Event('backbutton', { cancelable: true }));
    ok('the DOM backbutton event closes it (the fallback when nx-patch.js has not started)', !e.w.__nxLogIsOpen());
    e.w.__nxLogShow(); e.w.__nxLogShow(); await sleep(120);
    e.w.__nxLogHide(); e.w.__nxLogHide();
    ok('a second __nxLogShow or __nxLogHide changes nothing', !e.w.__nxLogIsOpen() && e.qa('#nx-log-panel').length === 1);
    e.q('#nx-log-button').click(); await sleep(120);
    ok('the button opens it too', e.w.__nxLogIsOpen());
  }
  // ------------------------------------------------------------------------------------------------ Copy
  {
    const writes = [];
    const e = environment({ setup: (w) => { Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: (t) => { writes.push(t); return Promise.resolve(); } } }); } });
    e.w.console.log('a'); e.w.console.log('b');
    e.w.__nxLogShow(); await sleep(60);
    e.btn('Copy').click(); await sleep(50);
    ok('Copy puts every line on the clipboard (navigator.clipboard) and says "Copied N lines"', writes.length === 1 && /a\n.*b/.test(writes[0]) && /^Copied \d+ lines?$/.test(e.q('.nx-log-sub').textContent), [writes, e.q('.nx-log-sub').textContent]);
    await sleep(2700);
    ok('...for 2.5 seconds, then the normal line is back', /secrets are masked/.test(e.q('.nx-log-sub').textContent), e.q('.nx-log-sub').textContent);
  }
  {
    const plugin = [];
    const e = environment({ setup: (w) => { w.cordova = { plugins: { clipboard: { copy: (t) => plugin.push(t) } } }; } });
    e.w.__nxLogShow(); await sleep(60);
    e.btn('Copy').click();
    ok('the Cordova clipboard plugin is used first (as before)', plugin.length === 1 && /Copied/.test(e.q('.nx-log-sub').textContent), [plugin.length, e.q('.nx-log-sub').textContent]);
  }
  {
    const e = environment({ setup: (w) => { Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); w.document.execCommand = () => false; } });
    e.w.__nxLogShow(); await sleep(60);
    e.btn('Copy').click(); await sleep(80);
    ok('when nothing can copy it says so and what to do: "Copy failed: select the text yourself"', e.q('.nx-log-sub').textContent === 'Copy failed: select the text yourself', e.q('.nx-log-sub').textContent);
  }
  {
    const e = environment({ setup: (w) => { w.document.execCommand = () => true; } });
    e.w.__nxLogShow(); await sleep(60);
    e.btn('Copy').click(); await sleep(60);
    ok('the last way is a text area and execCommand (and the text area is removed again)', /^Copied/.test(e.q('.nx-log-sub').textContent) && e.qa('textarea').length === 0, e.q('.nx-log-sub').textContent);
  }
  // ------------------------------------------------------------------------------------------------ Clear asks again
  {
    const e = environment();
    for (let i = 0; i < 5; i++) e.w.console.log('line ' + i);
    e.w.__nxLogShow(); await sleep(60);
    const pre = e.q('#nx-log-panel pre');
    e.btn('Clear').click();
    ok('the first tap on Clear only asks ("Clear all?"); the lines stay', e.btn('Clear all?') && /line 4/.test(pre.textContent) && e.btn('Clear all?').classList.contains('nx-confirm'), pre.textContent);
    await sleep(3200);
    ok('...and it gives up asking after 3 seconds', !!e.btn('Clear') && !e.btn('Clear all?'));
    e.btn('Clear').click(); e.btn('Clear all?').click();
    ok('the second tap clears, says "Cleared" and the sheet shows an empty log', e.q('.nx-log-sub').textContent === 'Cleared' && !/line 4/.test(pre.textContent) && !!e.btn('Clear'), [e.q('.nx-log-sub').textContent, pre.textContent]);
    e.w.console.log('after the clear'); await sleep(320);
    ok('new lines come in after it', /after the clear/.test(pre.textContent), pre.textContent);
    e.btn('Clear').click(); e.w.__nxLogHide();
    ok('closing the sheet resets the question', !!e.btn('Clear') && !e.btn('Clear all?'));
  }
  // ------------------------------------------------------------------------------------------------ the redraw
  {
    const e = environment();
    e.w.console.log('one');
    e.w.__nxLogShow(); await sleep(60);
    const pre = e.q('#nx-log-panel pre');
    pre.textContent = 'a selection that the reader is making';
    await sleep(600);
    ok('nothing new: the text is not rewritten (a selection stays)', pre.textContent === 'a selection that the reader is making', pre.textContent);
    e.w.console.log('two'); await sleep(320);
    ok('a new line: redrawn within 250 ms, all lines in it', /one\n.*two/.test(pre.textContent), pre.textContent);
    ok('a line has the time in front of it and the 700 character limit', /^\d\d:\d\d:\d\d  ?one/.test(pre.textContent.split('\n')[0]) || /^\d\d:\d\d:\d\d /.test(pre.textContent), pre.textContent.split('\n')[0]);
  }
  // ------------------------------------------------------------------------------------------------ what did not change: masking, noise, the 1500 lines
  {
    const e = environment();
    e.w.console.log('password: hunter2 and "token":"abcdefghijklmnop" and setupcode: 12345678');
    e.w.console.log('scene getHome {"x":1}');
    e.w.console.log('scene getHome {"x":2}');
    e.w.__nxLogShow(); await sleep(60);
    const t = e.q('#nx-log-panel pre').textContent;
    ok('secrets are masked before they are stored', !/hunter2|abcdefghijklmnop|12345678/.test(t) && /\*\*\*/.test(t), t);
    ok('the Nice app\'s own repetitive lines are left out and counted', !/scene getHome/.test(t) && /\(2 repetitive debug lines of the Nice app left out\)/.test(t), t);
    for (let i = 0; i < 1600; i++) e.w.console.log('n' + i);
    await sleep(300);
    ok('at most 1500 lines are kept (the oldest go first)', !/n0\b/.test(e.q('#nx-log-panel pre').textContent) && /n1599/.test(e.q('#nx-log-panel pre').textContent) && /1,500 lines/.test(e.q('.nx-log-sub').textContent), e.q('.nx-log-sub').textContent);
  }
  {
    const m = require(path.join(__dirname, '..', 'debuglog.js'));
    ok('required from node (no browser) it still offers mask and isNoise (test/masker.test.js)', typeof m.mask === 'function' && typeof m.isNoise === 'function' && /\*\*\*/.test(m.mask('password: abc')));
  }
  // ------------------------------------------------------------------------------------------------ the docked button needs data-nx-chip: if nx-patch.js never sets it, debuglog.js does after 6 s
  {
    const e = environment({ captureTimers: true });
    const t6 = e.timers.find((t) => t.ms === 6000);
    ok('after 6 seconds without nx-patch.js the log takes the place of the chip itself (data-nx-chip=0: the button is docked)', !!t6 && !e.doc.documentElement.hasAttribute('data-nx-chip') && (t6.fn(), e.doc.documentElement.getAttribute('data-nx-chip') === '0'));
    const e2 = environment({ captureTimers: true });
    e2.doc.documentElement.setAttribute('data-nx-chip', '1');
    e2.timers.find((t) => t.ms === 6000).fn();
    ok('...but never when nx-patch.js has said that there is an accessory', e2.doc.documentElement.getAttribute('data-nx-chip') === '1');
    // a page that rebuilds <body> does not take the log with it
    const e3 = environment();
    e3.q('#nx-log-panel').remove(); e3.q('#nx-log-button').remove();
    e3.w.__nxLogShow();
    ok('a panel that was removed from the page comes back when it is opened', e3.qa('#nx-log-panel').length === 1 && e3.qa('#nx-log-button').length === 1 && e3.w.__nxLogIsOpen());
  }
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);      // the interval of the module keeps node alive
})();
