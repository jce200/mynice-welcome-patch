// Test of nx-activity.js: the statistics from the accessory's event log (plain functions, no browser) and the sheet (jsdom, with a simulated
// Angular, NHKPluginService and $translate). All the data below is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/activity.test.js
const fs = require('fs');
const path = require('path');
const A = require('../nx-activity.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'nx-activity.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

// "now" is Saturday 7 November 2026, 14:30 in the time zone of whoever runs the test; the times below are built in the same zone
const D = (day, h, m, s) => new Date(2026, 10, day, h, m, s || 0).getTime();
const NOW = D(7, 14, 30);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const USERS = [{ id: 1, controllerID: 'CTRL-ANNA-0001', username: 'Anna' }, { id: 2, controllerID: 'CTRL-BEN-00002', username: 'Ben' }];
const label = (t) => ({ open: 'Open', close: 'Close', obstruction: 'Obstruction', MDBk: 'Open and Block' }[t] || t);

// ------------------------------------------------------------------------------------------------ times, types, who
{
  ok('toMs: epoch milliseconds', A.toMs(D(7, 14, 12), NOW) === D(7, 14, 12));
  ok('toMs: a number as text', A.toMs(String(D(7, 14, 12)), NOW) === D(7, 14, 12));
  ok('toMs: an ISO text', A.toMs('2026-11-07T14:12:00Z', null) === Date.UTC(2026, 10, 7, 14, 12));
  ok('toMs: 0, 1970 and 2000 are no time (a clock that was never set)', A.toMs(0, NOW) === null && A.toMs(1000, NOW) === null && A.toMs(Date.UTC(2000, 0, 1), NOW) === null);
  ok('toMs: no time at all', A.toMs(undefined, NOW) === null && A.toMs(null, NOW) === null && A.toMs('', NOW) === null && A.toMs({}, NOW) === null && A.toMs('nonsense', NOW) === null && A.toMs(NaN, NOW) === null);
  ok('toMs: a clock that is a little ahead is allowed, one that is far ahead is not', A.toMs(NOW + 3600000, NOW) === NOW + 3600000 && A.toMs(NOW + 3 * 86400000, NOW) === null);

  ok('kindOf: door actions', A.kindOf('open') === 'open' && A.kindOf('close') === 'close' && A.kindOf('stop') === 'stop' && A.kindOf('Open') === 'open');
  ok('kindOf: T4 codes of the secondary commands', A.kindOf('MDBk') === 'open' && A.kindOf('MDFh') === 'close' && A.kindOf('MDAx') === 'step' && A.kindOf('MDBm') === 'block' &&
    A.kindOf('MDEw') === 'release' && A.kindOf('MDEy') === 'light' && A.kindOf('MDA2') === 'open' && A.kindOf('MDAy') === 'stop');
  ok('kindOf: obstruction, and what is not known', A.kindOf('obstruction') === 'obstruction' && A.kindOf('Output') === 'other' && A.kindOf(undefined) === 'other' && A.kindOf('') === 'other');
  ok('isCommand: commands yes, obstruction and unknown no', A.isCommand('open') && A.isCommand('step') && A.isCommand('light') && !A.isCommand('obstruction') && !A.isCommand('other'));

  ok('healthKindOf: restarts, Wi-Fi, errors, the gate controller', A.healthKindOf('Power ON') === 'restart' && A.healthKindOf('boot') === 'restart' && A.healthKindOf('wifi loss') === 'wifi' &&
    A.healthKindOf('error') === 'error' && A.healthKindOf('device not found') === 'bus');
  ok('healthKindOf: the rest is no health event', A.healthKindOf('connect') === null && A.healthKindOf('pair') === null && A.healthKindOf('device found') === null && A.healthKindOf(undefined) === null);

  ok('whoOf: the app\'s own rules for busT4, scheduler and input', A.whoOf('busT4', USERS) === 'Automation' && A.whoOf('scheduler', USERS) === 'Schedule' && A.whoOf('input', USERS) === 'Input');
  ok('whoOf: a user by controller ID', A.whoOf('CTRL-ANNA-0001', USERS) === 'Anna' && A.whoOf('CTRL-BEN-00002', USERS) === 'Ben');
  ok('whoOf: a shortened ID (with a dash) is the controller ID without its last five characters', A.whoOf('CTRL-ANNA', USERS) === 'Anna' && A.whoOf('CTRL-BEN-', USERS) === 'Ben');
  ok('whoOf: someone unknown, and no users at all', A.whoOf('ZZZZ1234abcd', USERS) === 'Other (ZZZZ1234)' && A.whoOf('ZZZZ1234abcd') === 'Other (ZZZZ1234)' && A.whoOf('', USERS) === 'Unknown' && A.whoOf(null, USERS) === 'Unknown');
  ok('whoOf: a user without a name', A.whoOf('X1', [{ controllerID: 'X1', desc: 'Old phone' }]) === 'Old phone' && A.whoOf('X1', [{ controllerID: 'X1' }]) === 'User');

  ok('hhmm', A.hhmm(D(7, 7, 5)) === '07:05' && A.hhmm(D(7, 23, 59)) === '23:59');
  ok('when: today', A.when(D(7, 14, 12), NOW) === 'today 14:12' && A.when(NOW - 20000, NOW) === 'just now');
  ok('when: yesterday', A.when(D(6, 22, 0), NOW) === 'yesterday 22:00');
  ok('when: this week with the weekday', A.when(D(4, 7, 31), NOW) === WD[new Date(D(4, 7, 31)).getDay()] + ' 07:31');
  ok('when: a week or more ago has day and month', A.when(new Date(2026, 9, 28, 9, 0).getTime(), NOW) === '28 Oct 09:00');
  ok('when: a clock that is a little ahead is "just now"', A.when(NOW + 600000, NOW) === 'just now');
  ok('dayName', A.dayName(D(7, 1, 0), NOW) === 'Today' && A.dayName(D(6, 23, 0), NOW) === 'Yesterday' && A.dayName(D(3, 12, 0), NOW) === WD[new Date(D(3, 12, 0)).getDay()] + ' 3 Nov');
  // the day count stays right across the clock change (the last Sunday of October)
  ok('when: "yesterday" across a clock change', A.when(new Date(2026, 9, 25, 12, 0).getTime(), new Date(2026, 9, 26, 12, 0).getTime()) === 'yesterday 12:00');
}

// ------------------------------------------------------------------------------------------------ analyze
const LOG = {
  deviceLogs: [
    { deviceId: '1', source: 'CTRL-ANNA-0001', type: 'close', time: D(7, 14, 12), idx: '9', id: '9' },
    { deviceId: '1', source: 'CTRL-ANNA-0001', type: 'open', time: D(7, 14, 10), idx: '8', id: '8' },
    { deviceId: '1', source: 'busT4', type: 'open', time: D(7, 7, 35), idx: '7', id: '7' },
    { deviceId: '1', source: 'scheduler', type: 'close', time: D(6, 22, 0), idx: '6', id: '6' },
    { deviceId: '1', source: 'CTRL-BEN-00002', type: 'MDBk', time: D(5, 17, 40), idx: '5', id: '5' },
    { deviceId: '1', source: 'busT4', type: 'obstruction', time: D(4, 7, 31), idx: '4', id: '4' },
    { deviceId: '1', source: 'CTRL-BEN-00002', type: 'MDFh', time: D(3, 18, 5), idx: '3', id: '3' },
    { deviceId: '1', source: 'CTRL-ANNA-0001', type: 'Scena_Out', time: D(3, 9, 0), idx: '2', id: '2' },       // left out, as in the app
    { deviceId: '1', source: 'CTRL-ANNA-0001', type: 'open', time: 0, idx: '1', id: '1' }                      // no usable time
  ],
  interfaceLogs: [
    { deviceId: '', source: '', type: 'Power ON', time: D(2, 2, 0, 0), idx: '1', id: '1' },
    { deviceId: '', source: '', type: 'boot', time: D(2, 2, 0, 9), idx: '2', id: '2' },                         // the boot after the power-on: one restart
    { deviceId: '', source: '', type: 'boot', time: D(5, 12, 0), idx: '3', id: '3' },
    { deviceId: '', source: '', type: 'wifi loss', time: D(5, 3, 14), idx: '4', id: '4' },
    { deviceId: '', source: '', type: 'wifi loss', time: D(6, 3, 15), idx: '5', id: '5' },
    { deviceId: '', source: '', type: 'connect', time: D(6, 9, 0), idx: '6', id: '6' },
    { deviceId: '', source: '', type: 'device not found', time: D(4, 5, 0), idx: '7', id: '7' },
    { deviceId: '', source: '', type: 'error', time: D(1, 1, 1), idx: '8', id: '8' }
  ]
};
{
  const a = A.analyze(LOG, USERS, NOW);
  ok('analyze: the events, newest first, without Scena_Out and without a usable time', a.events.length === 7 && a.events[0].t === D(7, 14, 12) && a.events.every((e, i) => i === 0 || a.events[i - 1].t >= e.t), String(a.events.length));
  ok('analyze: one entry without a time is counted', a.skipped === 1, String(a.skipped));
  ok('analyze: commands and obstructions apart', a.commands.length === 6 && a.obstructions.length === 1 && a.obstructions[0].t === D(4, 7, 31));
  ok('analyze: totals', a.totals.h24 === 4 && a.totals.d7 === 6 && a.totals.d30 === 6 && a.totals.all === 6, JSON.stringify(a.totals));
  ok('analyze: the last command, the last opening and the last closing', a.last.command.t === D(7, 14, 12) && a.last.open.t === D(7, 14, 10) && a.last.close.t === D(7, 14, 12));
  ok('analyze: who, most first, ties alphabetical', JSON.stringify(a.byWho) === JSON.stringify([{ who: 'Anna', count: 2 }, { who: 'Ben', count: 2 }, { who: 'Automation', count: 1 }, { who: 'Schedule', count: 1 }]), JSON.stringify(a.byWho));
  ok('analyze: the busiest hour', a.peak && a.peak.hour === 14 && a.peak.count === 2 && a.hours.length === 24 && a.hours.reduce((x, y) => x + y, 0) === 6, JSON.stringify(a.peak));
  ok('analyze: fourteen days, today last, consecutive', a.days.length === 14 && a.days.every((d, i) => i === 0 || d.n === a.days[i - 1].n + 1));
  const today = a.days[13], yesterday = a.days[12], d5 = a.days[11];     // 5 November
  ok('analyze: the commands of today and yesterday', today.total === 3 && today.open === 2 && today.close === 1 && yesterday.total === 1 && yesterday.close === 1 && yesterday.open === 0, JSON.stringify([today, yesterday]));
  ok('analyze: an "open and block" counts as opening, the rest of the commands apart', d5.open === 1 && d5.total === 1 && a.days.reduce((s, d) => s + d.total, 0) === 6);
  ok('analyze: restarts (a power-on with its boot count once), Wi-Fi, errors, the gate controller',
    a.health.restart.count === 2 && a.health.restart.last === D(5, 12, 0) && a.health.wifi.count === 2 && a.health.wifi.last === D(6, 3, 15) && a.health.error.count === 1 && a.health.bus.count === 1 && a.hasModuleEvents,
    JSON.stringify(a.health));
  ok('analyze: how far back the log goes', a.span && a.span.oldest === D(1, 1, 1) && a.span.newest === D(7, 14, 12) && a.span.count === 7 + 8 && a.span.days === 7, JSON.stringify(a.span));

  const none = A.analyze(undefined, undefined, NOW), none2 = A.analyze({ deviceLogs: 'x', interfaceLogs: [null, 1, {}] }, [], NOW);
  ok('analyze: no answer at all does not throw and has nothing', none.span === null && none.events.length === 0 && none.peak === null && none.last.command === null && none.days.length === 14);
  ok('analyze: rubbish in the lists is skipped', none2.span === null && none2.skipped === 1 && none2.events.length === 0);
  const many = { deviceLogs: [] };
  for (let i = 0; i < 6000; i++) many.deviceLogs.push({ source: 'busT4', type: 'open', time: NOW - i * 1000 });
  const big = A.analyze(many, [], NOW);
  ok('analyze: a very long log is cut to the newest 5000', big.events.length === 5000 && big.events[0].t === NOW && big.totals.all === 5000);
  ok('analyze: the clock of the module that was never set is no event', A.analyze({ deviceLogs: [{ source: 'x', type: 'open', time: Date.UTC(2000, 0, 1) }] }, [], NOW).span === null);

  ok('lastLine', A.lastLine(a, label) === 'Close · today 14:12 · Anna' && A.lastLine(a) === 'close · today 14:12 · Anna');
  ok('lastLine: nothing to say without commands', A.lastLine(none, label) === '' && A.lastLine(undefined, label) === '');
  ok('lastLine: another day', A.lastLine(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'MDBk', time: D(5, 17, 40) }] }, [], NOW), label) === 'Open and Block · ' + WD[new Date(D(5, 17, 40)).getDay()] + ' 17:40 · Automation');
}

// ------------------------------------------------------------------------------------------------ the HTML of the sheet
{
  const a = A.analyze(LOG, USERS, NOW);
  const html = A.renderHtml(a, label);
  ok('html: the four tiles', ['Last opened', 'Last closed', 'Commands, 7 days', 'Obstructions'].every((t) => html.indexOf(t) > -1) && html.indexOf('today 14:10') > -1 && html.indexOf('today 14:12') > -1, '');
  ok('html: obstructions show as a warning when there are some', /nx-t-obst nx-t-warn/.test(html) && !/nx-t-warn/.test(A.renderHtml(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(7, 7, 0) }] }, [], NOW), label)));
  ok('html: fourteen bars, today marked', (html.match(/class="nx-col/g) || []).length === 14 && /nx-col nx-today/.test(html) && /<small class="nx-today">/.test(html));
  ok('html: who and the busy hours', html.indexOf('>Who<') > -1 && html.indexOf('Anna') > -1 && html.indexOf('>Busy hours<') > -1 && html.indexOf('Busiest around 14:00') > -1 && (html.match(/<i class="(nx-peak)?"/g) || []).length === 24);
  ok('html: the Wi-Fi module with its counts', html.indexOf('Wi-Fi module') > -1 && /Restarts<\/b><span>last/.test(html) && /<em>2<\/em>/.test(html) && html.indexOf('Gate controller not found') > -1);
  ok('html: history with day headers, newest first', html.indexOf('>Today<') > -1 && html.indexOf('>Yesterday<') > -1 && html.indexOf('Open and Block') > -1 && html.indexOf('nx-k-obstruction') > -1);
  ok('html: where the data comes from', /From the accessory/.test(html) && /1 entry without a usable time/.test(html), html.slice(-300));
  ok('html: no "show all" button when everything is shown', html.indexOf('nx-act-all') === -1);

  const long = { deviceLogs: [] };
  for (let i = 0; i < 80; i++) long.deviceLogs.push({ source: 'CTRL-ANNA-0001', type: i % 2 ? 'close' : 'open', time: NOW - i * 3600000 });
  const al = A.analyze(long, USERS, NOW);
  const short = A.renderHtml(al, label), full = A.renderHtml(al, label, { all: true });
  ok('html: a long history shows the newest 25 and offers the rest', (short.match(/class="nx-tl-row/g) || []).length === 25 && /Show 80 events/.test(short) && (full.match(/class="nx-tl-row/g) || []).length === 80 && full.indexOf('nx-act-all') === -1);

  const evil = A.analyze({ deviceLogs: [{ source: 'X-1', type: '<img src=x onerror=alert(1)>', time: D(7, 9, 0) }] }, [{ controllerID: 'X-1', username: '<b>"Mallory"</b>' }], NOW);
  const eh = A.renderHtml(evil, (t) => t);
  ok('html: names and types are escaped', eh.indexOf('<img') === -1 && eh.indexOf('<b>"Mallory"') === -1 && eh.indexOf('&lt;b&gt;&quot;Mallory&quot;&lt;/b&gt;') > -1 && eh.indexOf('&lt;img src=x') > -1);

  const nolog = A.renderHtml(A.analyze({ deviceLogs: [], interfaceLogs: [] }, [], NOW), label);
  ok('html: an empty log says so', /Nothing in the log yet/.test(nolog));
  const nomod = A.renderHtml(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(7, 7, 0) }], interfaceLogs: [] }, [], NOW), label);
  ok('html: a log without module events says so', /The log has no events of the module itself/.test(nomod) && nomod.indexOf('Restarts') === -1);
  const onlyMod = A.renderHtml(A.analyze({ deviceLogs: [], interfaceLogs: [{ type: 'boot', time: D(7, 7, 0) }] }, [], NOW), label);
  ok('html: only module events: the history is empty but the module is there', /No commands in the log/.test(onlyMod) && onlyMod.indexOf('Restarts') > -1 && /<b>–<\/b>/.test(onlyMod));
  ok('html: the module with nothing wrong is green', /nx-fact nx-s-ok/.test(nomod.replace('The log has no events', '')) || /nx-fact nx-s-ok/.test(A.renderHtml(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(7, 7, 0) }], interfaceLogs: [{ type: 'connect', time: D(7, 7, 0) }] }, [], NOW), label)));

  const sm = A.summary(LOG);
  ok('summary: the kinds of events, without names or IDs', sm === 'device [MDBk x1, MDFh x1, Scena_Out x1, close x2, obstruction x1, open x3] sources [busT4 x2, phone x6, scheduler x1] module [Power ON x1, boot x2, connect x1, device not found x1, error x1, wifi loss x2]', sm);
  ok('summary: nothing, or rubbish', A.summary(undefined) === 'device [] sources [] module []' && A.summary({ deviceLogs: [null, {}] }) === 'device [? x2] sources [none x2] module []');

  // strange values in the log neither throw nor produce markup
  const odd = { deviceLogs: [{ source: {}, type: { a: 1 }, time: NOW - 1000 }, { source: ['x'], type: ['open'], time: NOW - 2000 }, { source: 5, type: 7, time: String(NOW - 3000) },
    { type: 'open', time: '2026-11-07T09:00:00' }, { source: 'busT4', type: null, time: NOW - 4000 }], interfaceLogs: [{ type: { x: 1 }, time: NOW }, { type: 'boot', time: 'nonsense' }] };
  let oddHtml = '';
  try { oddHtml = A.renderHtml(A.analyze(odd, USERS, NOW), label); } catch (e) { oddHtml = 'THREW ' + e; }
  ok('strange values in the log: no exception, and a sheet', /Last opened/.test(oddHtml) && oddHtml.indexOf('THREW') === -1, oddHtml.slice(0, 120));
  ok('strange values in the log: the raw text and the summary hold up too', typeof A.rawText(odd, NOW) === 'string' && typeof A.summary(odd) === 'string');

  const raw = A.rawText(LOG, NOW);
  ok('rawText: counts and one row per event, also those without a time', /device events: 9, module events: 8/.test(raw) && (raw.match(/ \| /g) || []).length > 30 && /\(no time\) \| open/.test(raw) && /\| busT4 \|/.test(raw));
}

// ------------------------------------------------------------------------------------------------ the sheet in a browser (jsdom)
(async function () {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('   skipped: jsdom is missing (the sheet is not tested)'); finish(); return; }

  // scen: { logs (the answer), logsErr, failFrom, hang, pairings (activeUsers), pairingsErr, names ($translate), state ($state.params), nxCheck,
  //         reachable, prefetchMs, maxAge, timeoutMs }
  async function environment(scen) {
    scen = scen || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.Date.now = () => NOW;                                   // the whole sheet agrees on "now"
    w.__nxActivityPrefetchMs = scen.prefetchMs != null ? scen.prefetchMs : 20;
    w.__nxActivityTimeoutMs = scen.timeoutMs != null ? scen.timeoutMs : 400;
    if (scen.maxAge != null) w.__nxActivityMaxAge = scen.maxAge;
    const handlers = {}, logs = [], toasts = [], copied = [], calls = { logs: 0, pairings: 0 }, digests = { n: 0 };
    const $rootScope = { $on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); }, $evalAsync() { digests.n++; } };
    if (scen.nxCheck) $rootScope.nxCheck = scen.nxCheck;
    const services = {};
    if (!scen.noTranslate) services.$translate = { instant: (k) => (scen.names && scen.names[k]) || k };
    if (scen.state) services.$state = { params: scen.state };
    const inj = { has: (n) => n in services, get: (n) => services[n] };
    const NHK = {
      logs() {
        calls.logs++;
        if (scen.failFrom && calls.logs >= scen.failFrom) return Promise.reject({ code: 4 });       // from the N-th request on
        return scen.logsErr !== undefined ? Promise.reject(scen.logsErr) : scen.hang ? new Promise(() => {}) : Promise.resolve(scen.logs || LOG);
      },
      pairings() { calls.pairings++; return scen.pairingsErr !== undefined ? Promise.reject(scen.pairingsErr) : Promise.resolve({ activeUsers: scen.pairings || USERS, waitingUsers: [] }); }
    };
    const dev = { mac: '00:0B:6C:AA:BB:CC', homeId: 1, description: 'AABBCC', name: 'NiceIT4WIFIAABBCC', reachable: scen.reachable !== false };
    w.eval(SRC);
    const act = w.__nxActivity({ inj, $rootScope, NHK, log: (...a) => logs.push(a.join(' ')), toast: (m) => toasts.push(m), liveDevice: () => dev, copy: (t) => copied.push(t) });
    return { w, dev, act, handlers, logs, toasts, copied, calls, digests, $rootScope, document: w.document,
      navigate(name, params) { (handlers['$stateChangeSuccess'] || []).forEach((f) => f({}, { name }, params || { homeId: 1, mac: dev.mac })); },
      sheet() { return w.document.getElementById('nx-activity'); },
      body() { return w.document.getElementById('nx-act-body'); } };
  }
  const DETAIL = 'tabsController.favorites-device-detail';

  {
    const env = await environment();
    ok('the app gets nxActivity and nxLast', typeof env.$rootScope.nxActivity === 'function' && typeof env.$rootScope.nxLast === 'function' && env.$rootScope.nxLast(env.dev) === '');
    ok('nothing is built or asked before it is needed', env.sheet() === null && env.calls.logs === 0);
    env.navigate(DETAIL);
    await sleep(120);
    ok('looking at the accessory screen reads the log once', env.calls.logs === 1 && env.calls.pairings === 1, JSON.stringify(env.calls));
    ok('...and the line for the screen is there', env.$rootScope.nxLast(env.dev) === 'Close · today 14:12 · Anna', env.$rootScope.nxLast(env.dev));
    ok('...and the view is told (a digest)', env.digests.n > 0);
    ok('...and the LOG says what it read', env.logs.some((l) => /^activity: 7 device events, 8 module events, back 7 days, 1 without a time/.test(l)), env.logs.join(' | '));
    ok('...and the LOG says what kinds of events there are', env.logs.some((l) => /^activity: device \[.*close x2.*\] sources \[.*phone x6.*\] module \[.*wifi loss x2\]/.test(l)), env.logs.join(' | '));
    env.navigate(DETAIL);
    await sleep(120);
    ok('looking again soon after does not read it again', env.calls.logs === 1, String(env.calls.logs));
    ok('nxLast of another accessory is empty', env.$rootScope.nxLast({ mac: 'AA' }) === '' && env.$rootScope.nxLast(null) === '');
  }
  {
    const env = await environment({ names: { DEVICE_COMMAND_close: 'Sluiten' } });
    env.navigate(DETAIL); await sleep(120);
    ok('the line uses the app\'s own text of the command', env.$rootScope.nxLast(env.dev) === 'Sluiten · today 14:12 · Anna', env.$rootScope.nxLast(env.dev));
  }
  {
    // when not to read the log by itself
    const e1 = await environment({ reachable: false }); e1.navigate(DETAIL); await sleep(100);
    const e2 = await environment({ nxCheck: () => 'checking' }); e2.navigate(DETAIL); await sleep(100);
    const e3 = await environment(); e3.navigate('tabsController.favorites'); await sleep(100);
    const e4 = await environment({ state: { homeId: 1, mac: 'SOMEONE-ELSE' } }); e4.navigate(DETAIL); await sleep(100);
    const e5 = await environment(); e5.handlers['$stateChangeSuccess'].forEach((f) => f({}, { name: DETAIL }, undefined)); await sleep(100);
    ok('not for an accessory that is not reachable', e1.calls.logs === 0);
    ok('not while the app is still checking the accessory', e2.calls.logs === 0);
    ok('not on other screens', e3.calls.logs === 0);
    ok('not when the screen has been left in the meantime', e4.calls.logs === 0);
    ok('no parameters, no reading, no error', e5.calls.logs === 0);
    const e6 = await environment({ maxAge: 0 }); e6.navigate(DETAIL); await sleep(80); e6.navigate(DETAIL); await sleep(80);
    ok('an old answer is read again', e6.calls.logs === 2, String(e6.calls.logs));
  }
  {
    const env = await environment();
    env.act.open(env.dev);
    const first = env.body().textContent;
    ok('the sheet opens at once with a message that it is reading', /Reading the accessory/.test(first) && env.sheet().style.display === 'block' && env.sheet().getAttribute('role') === 'dialog', first);
    ok('...and it is busy while reading', env.sheet().classList.contains('nx-busy'));
    ok('...and there is nothing to copy yet', env.sheet().querySelector('.nx-more').style.display === 'none');
    await sleep(60);
    ok('the sheet shows the result', /Last opened/.test(env.body().textContent) && /Anna/.test(env.body().textContent) && !env.sheet().classList.contains('nx-busy'));
    ok('...with the name and size of the log under the title', /^AABBCC · 15 events, 7 days$/.test(env.document.getElementById('nx-act-sub').textContent), env.document.getElementById('nx-act-sub').textContent);
    ok('...and copying is possible now', env.sheet().querySelector('.nx-more').style.display === '');
    ok('...and the sheet is open (after its animation frames)', env.act.isOpen() && env.sheet().classList.contains('nx-open') && env.document.querySelector('.nx-scrim').classList.contains('nx-open'));
    const bars = env.body().querySelectorAll('.nx-col').length, tiles = env.body().querySelectorAll('.nx-tile').length;
    ok('...with 14 bars and 4 tiles', bars === 14 && tiles === 4, bars + ' ' + tiles);
    env.sheet().querySelector('.nx-act-copy').click();
    ok('copy: the raw log goes to the clipboard function', env.copied.length === 1 && /^Accessory event log, read /.test(env.copied[0]) && /device events: 9, module events: 8/.test(env.copied[0]));
    env.sheet().querySelector('.nx-act-refresh').click(); await sleep(60);
    ok('refresh reads the log again', env.calls.logs === 1 + 1 && env.calls.pairings === 2, JSON.stringify(env.calls));
    env.act.open(env.dev); await sleep(40);
    ok('opening again does not build a second sheet', env.document.querySelectorAll('#nx-activity').length === 1 && env.document.querySelectorAll('.nx-scrim').length === 1);
    env.sheet().querySelector('.nx-act-close').click();
    ok('Close closes it', !env.act.isOpen());
    await sleep(480);
    ok('...and after the animation it is gone from the screen', env.sheet().style.display === 'none');
    env.act.open(env.dev); await sleep(30);
    env.document.dispatchEvent(new env.w.Event('backbutton'));
    ok('the back button closes it', !env.act.isOpen());
    env.act.open(env.dev); await sleep(30);
    env.document.querySelector('.nx-scrim').click();
    ok('a tap next to it closes it', !env.act.isOpen());
  }
  {
    // the history: a long one is shown in part, and the rest on request
    const long = { deviceLogs: [] };
    for (let i = 0; i < 60; i++) long.deviceLogs.push({ source: 'busT4', type: i % 2 ? 'close' : 'open', time: NOW - i * 1800000 });
    const env = await environment({ logs: long });
    env.act.open(env.dev); await sleep(60);
    ok('a long history: 25 rows and a button', env.body().querySelectorAll('.nx-tl-row').length === 25 && !!env.body().querySelector('.nx-act-all'));
    env.body().querySelector('.nx-act-all').click();
    ok('the button shows them all', env.body().querySelectorAll('.nx-tl-row').length === 60 && !env.body().querySelector('.nx-act-all'));
    env.act.close(); await sleep(450); env.act.open(env.dev); await sleep(60);
    ok('opening again starts with the short list again', env.body().querySelectorAll('.nx-tl-row').length === 25);
  }
  {
    // two requests at the same time are one request
    const env = await environment();
    let done = 0;
    env.act.refresh(env.dev, () => done++); env.act.refresh(env.dev, () => done++);
    await sleep(60);
    ok('two readings at once: one request, both are answered', env.calls.logs === 1 && done === 2, JSON.stringify(env.calls) + ' ' + done);
    env.navigate(DETAIL); env.act.open(env.dev); await sleep(80);
    ok('opening the sheet during the automatic reading does not ask twice', env.calls.logs <= 2, String(env.calls.logs));
  }
  {
    // errors
    const env = await environment({ logsErr: { code: 3 }, names: { 'NHK_ERROR-3': 'The connection with the Accessory is not valid' } });
    env.act.open(env.dev); await sleep(60);
    ok('a failure is shown with the app\'s own words', /Could not read the history/.test(env.body().textContent) && /The connection with the Accessory is not valid \(3\)/.test(env.body().textContent), env.body().textContent);
    ok('...with a way to try again, and nothing to copy', !!env.body().querySelector('.nx-act-retry') && env.sheet().querySelector('.nx-more').style.display === 'none');
    ok('...and a line in the LOG', env.logs.some((l) => /^activity: could not read the log \{"code":3\}/.test(l)), env.logs.join('|'));
    ok('...and no line for the screen', env.$rootScope.nxLast(env.dev) === '');
    env.body().querySelector('.nx-act-retry').click(); await sleep(60);
    ok('try again asks again', env.calls.logs === 2, String(env.calls.logs));

    const e2 = await environment({ logsErr: 'refused' });
    e2.act.open(e2.dev); await sleep(50);
    ok('a failure in plain text is shown too', /refused/.test(e2.body().textContent));
    const e3 = await environment({ logsErr: undefined, hang: true, timeoutMs: 120 });
    e3.act.open(e3.dev); await sleep(60);
    ok('while the accessory is silent the sheet says it is reading', /Reading the accessory/.test(e3.body().textContent) && e3.sheet().classList.contains('nx-busy'));
    await sleep(160);
    ok('and after the time-out it says the accessory did not answer', /Could not read the history/.test(e3.body().textContent) && /did not answer/.test(e3.body().textContent) && !e3.sheet().classList.contains('nx-busy'), e3.body().textContent);
  }
  {
    // users that cannot be read: the log is still shown
    const env = await environment({ pairingsErr: { code: 5 } });
    env.act.open(env.dev); await sleep(60);
    ok('without the users the log is still shown, with their phones as "Other"', /Last opened/.test(env.body().textContent) && /Other \(CTRL-ANN\)/.test(env.body().textContent), env.body().textContent.slice(0, 200));
    ok('...and the LOG says why', env.logs.some((l) => /^activity: users not read \{"code":5\}/.test(l)));
  }
  {
    // a refresh that fails keeps what is on screen and says so
    const env = await environment({ failFrom: 2 });
    env.act.open(env.dev); await sleep(60);
    ok('the first reading filled the cache, with the raw log for copying', !!env.act.cache[env.dev.mac] && env.act.cache[env.dev.mac].a.events.length === 7 && env.act.cache[env.dev.mac].raw.deviceLogs.length === 9);
    const before = env.body().innerHTML;
    env.sheet().querySelector('.nx-act-refresh').click(); await sleep(60);
    ok('a refresh that fails keeps the data on screen', env.body().innerHTML === before && !/Could not read/.test(env.body().textContent));
    ok('...and says so in a message', env.toasts.indexOf('Could not refresh the history.') > -1, JSON.stringify(env.toasts));
    ok('...and the busy mark is gone', !env.sheet().classList.contains('nx-busy'));
    ok('...and the line for the screen is still there', env.$rootScope.nxLast(env.dev) === 'Close · today 14:12 · Anna');
  }
  {
    // a user name with markup does not become markup
    const env = await environment({ logs: { deviceLogs: [{ source: 'X-1', type: 'open', time: D(7, 9, 0) }] }, pairings: [{ controllerID: 'X-1', username: '<img src=x onerror="window.__pwned=1">' }] });
    env.act.open(env.dev); await sleep(60);
    ok('a name with markup stays text in the sheet', env.body().querySelectorAll('img').length === 0 && env.w.__pwned === undefined && /<img src=x/.test(env.body().textContent));
  }
  {
    // no accessory
    const env = await environment();
    env.act.open(null); env.act.open({});
    ok('opening without an accessory says so and builds nothing', env.toasts.filter((t) => t === 'No accessory.').length === 2 && env.sheet() === null);
  }
  {
    // the status sheet of nx-patch.js is closed first
    const env = await environment();
    let closed = 0;
    env.w.NX = { close: () => closed++ };
    env.act.open(env.dev); await sleep(30);
    ok('the status sheet is closed when this one opens (one sheet at a time)', closed === 1);
  }
  finish();
})().catch((e) => { console.error('TEST ERROR', e); process.exit(2); });

function finish() {
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
}
