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
  ok('healthKindOf: the module writes "T4 device not found" and "T4 device found"', A.healthKindOf('T4 device not found') === 'bus' && A.healthKindOf('device not found') === 'bus' &&
    A.healthKindOf('T4 device found') === 'busfound' && A.healthKindOf('device found') === 'busfound');
  ok('healthKindOf: the rest is no health event', A.healthKindOf('connect') === null && A.healthKindOf('pair') === null && A.healthKindOf(undefined) === null);

  ok('whoOf: the app\'s own rules for busT4, scheduler and input', A.whoOf('busT4', USERS) === 'Gate controller' && A.whoOf('scheduler', USERS) === 'Schedule' && A.whoOf('input', USERS) === 'Input');
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
  ok('analyze: who, most first, ties alphabetical', JSON.stringify(a.byWho) === JSON.stringify([{ who: 'Anna', count: 2 }, { who: 'Ben', count: 2 }, { who: 'Gate controller', count: 1 }, { who: 'Schedule', count: 1 }]), JSON.stringify(a.byWho));
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
  ok('lastLine: the time is worked out for the moment it is shown ("just now" does not stay)', A.lastLine(a, label, D(7, 14, 12, 40)) === 'Close · just now · Anna' && A.lastLine(a, label, D(7, 16, 0)) === 'Close · today 14:12 · Anna' &&
    A.lastLine(a, label, D(8, 16, 0)) === 'Close · yesterday 14:12 · Anna');
  ok('lastLine: another day', A.lastLine(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'MDBk', time: D(5, 17, 40) }] }, [], NOW), label) === 'Open and Block · ' + WD[new Date(D(5, 17, 40)).getDay()] + ' 17:40 · Gate controller');
}

// ------------------------------------------------------------------------------------------------ a log as a real accessory sends it
// The structure of a log that was copied from a real accessory (made-up names, IDs and times): the module events are written "T4 device not found" and
// have the source "boot"; the log begins with the start of the accessory; every command of a phone is followed within a second by the same
// movement from the gate controller (busT4); the field idx is missing.
const NOW2 = D(8, 11, 7, 50);
const REAL = {
  interfaceLogs: [
    { source: 'boot', type: 'Power ON', time: D(8, 4, 47, 16), id: '1' },
    { source: 'boot', type: 'T4 device not found', time: D(8, 4, 47, 48), id: '2' },
    { source: 'boot', type: 'T4 device found', time: D(8, 4, 47, 48), id: '3' }
  ],
  deviceLogs: [
    { source: 'busT4', type: 'stop', time: D(8, 4, 47, 48), id: '1' },
    { source: 'CTRL-ANNA-0001', type: 'MDFh', time: D(8, 9, 15, 34), id: '2' },
    { source: 'busT4', type: 'close', time: D(8, 9, 15, 35), id: '3' },
    { source: 'CTRL-ANNA-0001', type: 'MDBk', time: D(8, 10, 48, 16), id: '4' },
    { source: 'busT4', type: 'open', time: D(8, 10, 48, 17), id: '5' }
  ]
};
{
  const a = A.analyze(REAL, USERS, NOW2);
  ok('real log: the gate controller\'s repeat of a command is folded into it (3 events, 2 folded)', a.events.length === 3 && a.echoes === 2 && a.commands.length === 3,
    a.events.map((e) => e.type + '/' + e.who).join(' ') + ' echoes ' + a.echoes);
  ok('real log: the line says the last command, by the phone and not by "automation"', A.lastLine(a, label) === 'Open and Block · today 10:48 · Anna', A.lastLine(a, label));
  ok('real log: who, without double counting', JSON.stringify(a.byWho) === JSON.stringify([{ who: 'Anna', count: 2 }, { who: 'Gate controller', count: 1 }]), JSON.stringify(a.byWho));
  ok('real log: last opened and closed are by the phone', a.last.open.who === 'Anna' && a.last.open.t === D(8, 10, 48, 16) && a.last.close.who === 'Anna' && a.last.close.t === D(8, 9, 15, 34));
  ok('real log: the gate controller that is not found while the accessory starts is no fault', a.health.bus.count === 0 && a.health.bus.atStart === 1 && a.health.restart.count === 1, JSON.stringify(a.health));
  ok('real log: the log begins at the start of the accessory', a.logStart === D(8, 4, 47, 16) && a.span.oldest === D(8, 4, 47, 16), JSON.stringify([a.logStart, a.span]));
  ok('real log: the last Block command (10:48) is newer than the last Release (09:15): blocked', a.block && a.block.blocked === true && a.block.type === 'MDBk' && a.block.who === 'Anna' && a.block.t === D(8, 10, 48, 16) && !a.block.uncertain, JSON.stringify(a.block));
  ok('real log: the last movement is the opening (the repeat is folded)', a.lastMovement.kind === 'open' && a.lastMovement.type === 'MDBk' && a.lastMovement.t === D(8, 10, 48, 16));
  const html = A.renderHtml(a, label);
  ok('real log: the sheet says blocked, with the command and who', /nx-act-block nx-blocked/.test(html) && /<b>Blocked<\/b>/.test(html) && /Open and Block · Anna/.test(html) && /not a measurement/.test(html), html.slice(0, 400));
  ok('real log: the module row says that it only happened while starting, and the note says where the log begins and what was folded',
    /only while the accessory was starting/.test(html) && /The log begins when the accessory started \(today 04:47\)/.test(html) && /2 movements that the gate controller reported right after a command are shown once/.test(html), html.slice(-700));
  ok('real log: the history lists three entries and none of the repeats', (html.match(/class="nx-tl-row/g) || []).length === 3);
  const raw = A.rawText(REAL, NOW2);
  ok('real log: the raw text has "-" where idx is missing, never "undefined"', raw.indexOf('undefined') === -1 && /\| 4\/-/.test(raw));

  // a restart after the Block command: whether the block survived is not known
  const later = JSON.parse(JSON.stringify(REAL));
  later.interfaceLogs.push({ source: 'boot', type: 'Power ON', time: D(8, 11, 0, 0), id: '9' });
  const al = A.analyze(later, USERS, NOW2);
  ok('a restart after the Block command makes it uncertain', al.block.blocked === true && al.block.uncertain === true && /<b>Blocked\?<\/b>/.test(A.renderHtml(al, label)) && /whether a block survives that is not known/.test(A.renderHtml(al, label)));
  // released afterwards
  const rel = JSON.parse(JSON.stringify(REAL));
  rel.deviceLogs.push({ source: 'CTRL-BEN-00002', type: 'MDEw', time: D(8, 10, 55, 0), id: '6' });
  const ar = A.analyze(rel, USERS, NOW2), rh = A.renderHtml(ar, label);
  ok('a Release after the Block: not blocked, as far as the log shows', ar.block.blocked === false && ar.block.who === 'Ben' && /Not blocked, as far as the log shows/.test(rh) && !/nx-blocked/.test(rh));
  ok('no Block or Release command at all: nothing is said about it', A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(8, 9, 0, 0) }] }, [], NOW2).block === null && !/nx-act-block/.test(A.renderHtml(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(8, 9, 0, 0) }] }, [], NOW2), label)));

  // folding the repeats: the rules
  const f = (events) => A.analyze({ deviceLogs: events }, USERS, NOW2);
  const ph = (type, sec) => ({ source: 'CTRL-ANNA-0001', type, time: D(8, 9, 0, sec) }), bus = (type, sec) => ({ source: 'busT4', type, time: D(8, 9, 0, sec) });
  ok('folding: a repeat of the same kind within five seconds is folded', f([ph('open', 0), bus('open', 4)]).events.length === 1);
  ok('folding: later than five seconds it is a movement of its own (a remote control)', f([ph('open', 0), bus('open', 6)]).events.length === 2);
  ok('folding: another kind is not a repeat', f([ph('close', 0), bus('open', 1)]).events.length === 2);
  ok('folding: a command takes only one repeat', f([ph('open', 0), bus('open', 1), bus('open', 2)]).events.length === 2);
  ok('folding: two commands, two repeats', f([ph('open', 0), ph('open', 2), bus('open', 3), bus('open', 4)]).events.length === 2);
  ok('folding: a repeat without a command stays (the controller telling its state, a remote control)', f([bus('stop', 0)]).events.length === 1 && f([bus('stop', 0)]).events[0].who === 'Gate controller');
  ok('folding: a T4 command and its repeat (Release and Close, then close)', f([ph('MDFh', 0), bus('close', 1)]).events.length === 1);
  ok('folding: the repeat before the command is no repeat', f([bus('open', 0), ph('open', 1)]).events.length === 2);
  ok('folding: the schedule and inputs are folded too', f([{ source: 'scheduler', type: 'close', time: D(8, 22, 0, 0) }, { source: 'busT4', type: 'close', time: D(8, 22, 0, 1) }]).events.length === 1);

  // the gate controller lost while it runs is a fault; the one that is lost while it starts is not
  const lost = A.analyze({ interfaceLogs: [{ type: 'Power ON', time: D(8, 3, 0, 0) }, { type: 'T4 device not found', time: D(8, 3, 0, 30) }, { type: 'T4 device found', time: D(8, 3, 0, 31) },
    { type: 'T4 device not found', time: D(8, 6, 0, 0) }, { type: 'T4 device found', time: D(8, 6, 1, 0) }] }, [], NOW2);
  ok('the gate controller lost while running counts, the one at start-up does not', lost.health.bus.count === 1 && lost.health.bus.atStart === 1 && lost.health.bus.last === D(8, 6, 0, 0), JSON.stringify(lost.health.bus));
}

// ------------------------------------------------------------------------------------------------ the HTML of the sheet
{
  const a = A.analyze(LOG, USERS, NOW);
  const html = A.renderHtml(a, label);
  ok('html: the four tiles', ['Last opened', 'Last closed', 'Commands, 7 days', 'Obstructions'].every((t) => html.indexOf(t) > -1) && html.indexOf('today 14:10') > -1 && html.indexOf('today 14:12') > -1, '');
  ok('html: obstructions show as a warning when there are some', /nx-t-obst nx-t-warn/.test(html) && !/nx-t-warn/.test(A.renderHtml(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: D(7, 7, 0) }] }, [], NOW), label)));
  ok('html: fourteen bars, today marked', (html.match(/class="nx-col/g) || []).length === 14 && /nx-col nx-today/.test(html) && /<small class="nx-today">/.test(html));
  ok('html: who and the busy hours', html.indexOf('>Who<') > -1 && html.indexOf('Anna') > -1 && html.indexOf('>Busy hours<') > -1 && html.indexOf('Busiest around 14:00') > -1 && (html.match(/<i class="(nx-peak)?"/g) || []).length === 24);
  ok('html: the Wi-Fi module with its counts', html.indexOf('Wi-Fi module') > -1 && /Restarts<\/b><span>last/.test(html) && /<em>2<\/em>/.test(html) && html.indexOf('Gate controller lost') > -1);
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
  //         reachable, properties (the state of the gate), storage (what localStorage has at the start), prefetchMs, maxAge, timeoutMs, travelMs, afterMs, marginMs,
  //         pollMs, eventMs, statusMs, resumeMs, retryMs, backoffMs, minGapMs, usersAge (the times of the readings in the background), pairingsRaw (the whole answer about the users) }
  //       The object can be changed afterwards (scen.logs, scen.logsErr): the simulated accessory answers with what it holds at that moment.
  async function environment(scen) {
    scen = scen || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    for (const k of Object.keys(scen.storage || {})) w.localStorage.setItem(k, scen.storage[k]);
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
      pairings() {
        calls.pairings++;
        if (scen.pairingsErr !== undefined) return Promise.reject(scen.pairingsErr);
        return Promise.resolve(scen.pairingsRaw !== undefined ? scen.pairingsRaw : { activeUsers: scen.pairings || USERS, waitingUsers: [] });
      }
    };
    const dev = { mac: '00:0B:6C:AA:BB:CC', homeId: 1, description: 'AABBCC', name: 'NiceIT4WIFIAABBCC', reachable: scen.reachable !== false, pairingUsername: 'Anna',
      properties: scen.properties || [{ value: 'closed' }, { value: '0' }], automations: [{ id: '1', type: 'sliding', product: 'ROBUS', services: [{ name: 'T4Action', permissions: 'w' }, { name: 'DoorAction', permissions: 'w' }],
        properties: [{ name: 'DoorStatus', permissions: 'r' }, { name: 'Obstruct', permissions: 'r' }] }] };
    for (const k of ['travelMs', 'afterMs', 'marginMs', 'pollMs', 'eventMs', 'statusMs', 'resumeMs', 'retryMs', 'backoffMs', 'minGapMs', 'usersAge']) {
      if (scen[k] != null) w['__nxActivity' + k.charAt(0).toUpperCase() + k.slice(1)] = scen[k];
    }
    w.eval(SRC);
    const act = w.__nxActivity({ inj, $rootScope, NHK, log: (...a) => logs.push(a.join(' ')), toast: (m) => toasts.push(m), liveDevice: () => dev, findDevice: (mac) => (mac === dev.mac ? dev : null), copy: (t) => copied.push(t) });
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
    for (let i = 0; i < 40 && !env.sheet().classList.contains('nx-open'); i++) await sleep(25);       // two animation frames: how long that takes depends on the machine
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

  // ---------------------------------------------------------------- blocked or not
  {
    const env = await environment();
    env.w.Date.now = () => D(7, 9, 37, 16);
    env.act.onCommand(env.dev, 'MDBk', 'executeSecondaryCommand');
    env.w.Date.now = () => D(7, 9, 50);
    ok('block: a Block command of this phone shows as blocked, since when', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 09:37', env.$rootScope.nxBlock(env.dev));
    const stored = JSON.parse(env.w.localStorage.getItem('nxBlock') || '{}')[env.dev.mac] || {};
    ok('block: ...kept in the storage, apart from the app\'s own data', stored.blocked === true && stored.code === 'MDBk' && stored.who === 'Anna' && stored.at === D(7, 9, 37, 16), JSON.stringify(stored));
    ok('block: ...and in the LOG', env.logs.indexOf('block: blocked (MDBk)') > -1, env.logs.join(' | '));
    env.act.onCommand(env.dev, 'open', 'executePrimaryCommand');
    ok('block: another command does not change it', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 09:37');
    env.act.onCommand(env.dev, 'MDFh', 'executeSecondaryCommand');
    ok('block: a Release command ends it', env.$rootScope.nxBlock(env.dev) === '' && env.act.blockInfo(env.dev).blocked === false && env.logs.indexOf('block: released (MDFh)') > -1);
    ok('block: a command without accessory does nothing', (env.act.onCommand(null, 'MDBk', 'x'), env.act.onCommand({}, 'MDBk', 'x'), env.$rootScope.nxBlock(null) === '' && env.$rootScope.nxBlock({}) === ''));
  }
  {
    const rec = { '00:0B:6C:AA:BB:CC': { blocked: true, at: D(7, 9, 37, 16), code: 'MDBl', who: 'Anna' } };
    const env = await environment({ storage: { nxBlock: JSON.stringify(rec) } });
    ok('block: what an earlier session remembered is there', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 09:37');
    const e2 = await environment({ storage: { nxBlock: '{not json' } });
    ok('block: a broken storage is no block and no error', e2.$rootScope.nxBlock(e2.dev) === '');
    const e3 = await environment({ storage: { nxBlock: '[1,2]' } });
    ok('block: a storage with the wrong shape is no block', e3.$rootScope.nxBlock(e3.dev) === '');
    // the log is newer than this phone: another phone released it
    const e4 = await environment({ storage: { nxBlock: JSON.stringify({ '00:0B:6C:AA:BB:CC': { blocked: true, at: D(7, 9, 0), code: 'MDBk', who: 'Anna' } }) },
      logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDEw', time: D(7, 10, 0) }] } });
    ok('block: before the log is read, what this phone did counts', e4.$rootScope.nxBlock(e4.dev) === 'Blocked · since 09:00');
    await new Promise((r) => e4.act.refresh(e4.dev, r));
    ok('block: a Release by another phone, newer, in the log ends it', e4.$rootScope.nxBlock(e4.dev) === '' && e4.act.blockInfo(e4.dev).who === 'Ben', JSON.stringify(e4.act.blockInfo(e4.dev)));
    // this phone is newer than the log
    const e5 = await environment({ storage: { nxBlock: JSON.stringify({ '00:0B:6C:AA:BB:CC': { blocked: true, at: D(7, 12, 0), code: 'MDBk', who: 'Anna' } }) },
      logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDEw', time: D(7, 10, 0) }] } });
    await new Promise((r) => e5.act.refresh(e5.dev, r));
    ok('block: what this phone did after the log\'s Release counts', e5.$rootScope.nxBlock(e5.dev) === 'Blocked · since 12:00');
    // another phone blocked it, and this phone has never done anything
    const e6 = await environment({ logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDBm', time: D(7, 11, 0) }] } });
    await new Promise((r) => e6.act.refresh(e6.dev, r));
    ok('block: a Block by another phone in the log shows too', e6.$rootScope.nxBlock(e6.dev) === 'Blocked · since 11:00' && e6.act.blockInfo(e6.dev).who === 'Ben');
    // a restart of the accessory after the block: not known whether it survived
    const e7 = await environment({ storage: { nxBlock: JSON.stringify({ '00:0B:6C:AA:BB:CC': { blocked: true, at: D(7, 9, 0), code: 'MDBk', who: 'Anna' } }) },
      logs: { deviceLogs: [], interfaceLogs: [{ source: 'boot', type: 'Power ON', time: D(7, 10, 0) }] } });
    await new Promise((r) => e7.act.refresh(e7.dev, r));
    ok('block: a restart of the accessory after it makes it a question mark', e7.$rootScope.nxBlock(e7.dev) === 'Blocked? · since 09:00', e7.$rootScope.nxBlock(e7.dev));
    // and the sheet says it
    e6.act.open(e6.dev); await sleep(60);
    ok('block: the sheet has the card for it', /nx-act-block nx-blocked/.test(e6.body().innerHTML) && /Block · Ben/.test(e6.body().textContent), e6.body().textContent.slice(0, 160));
  }

  // ---------------------------------------------------------------- a state that is out of date
  const mov = (ageMs, extra) => ({ deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: NOW - ageMs }, { source: 'busT4', type: 'open', time: NOW - ageMs + 1000 }].concat(extra || []) });
  const read = (env) => new Promise((r) => env.act.refresh(env.dev, r));
  {
    const env = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000), names: { DEVICE_STATE_opening: 'Opening' } });
    ok('state: before the log has been read the reported state stays', env.$rootScope.nxState(env.dev) === 'opening' && env.$rootScope.nxIcon(env.dev) === '' && env.$rootScope.nxSettled(env.dev) === '');
    await read(env);
    ok('state: "opening" while the log says the gate was opened twenty minutes ago is shown as open', env.$rootScope.nxState(env.dev) === 'open', String(env.$rootScope.nxState(env.dev)));
    ok('state: ...with the icon of the app in the same form', env.$rootScope.nxIcon(env.dev) === 'icon-i_gat005 open status-0', env.$rootScope.nxIcon(env.dev));
    ok('state: ...and a note with what the accessory reported, in the app\'s own word', env.$rootScope.nxSettled(env.dev) === 'reported: Opening', env.$rootScope.nxSettled(env.dev));
    ok('state: ...and the LOG says why', env.logs.some((l) => /^state: "opening" is out of date \(the last movement in the log is MDBk, today 14:10\); shown as open$/.test(l)), env.logs.join(' | '));
    const logged = env.logs.length;
    env.$rootScope.nxState(env.dev); env.$rootScope.nxIcon(env.dev); env.$rootScope.nxSettled(env.dev);
    ok('state: ...and it says so once, not on every digest', env.logs.length === logged);
    const said = () => env.logs.filter((l) => /^state: "opening" is out of date/.test(l)).length;
    const first = said();
    await read(env);
    env.$rootScope.nxState(env.dev);
    ok('state: ...nor each time the log is read again in the background (the decision is made again, the LOG is not told again)', first === 1 && said() === 1, first + ' ' + said());
    // a new event: the reading from before it knows nothing of it
    env.w.Date.now = () => NOW + 5000;
    env.act.onEvent({ mac: env.dev.mac, state: 'opening', obstruct: '0' });
    ok('state: an event of the accessory clears it (the reading is older than the event)', env.$rootScope.nxState(env.dev) === 'opening' && env.$rootScope.nxIcon(env.dev) === '' && env.$rootScope.nxSettled(env.dev) === '');
    ok('state: ...and the event is in the LOG', env.logs.indexOf('state: event 00:0B:6C:AA:BB:CC opening, obstruct 0') > -1);
    await read(env);
    ok('state: ...until the log has been read again', env.$rootScope.nxState(env.dev) === 'open');
    env.w.Date.now = () => NOW + 10000;
    env.act.onCommand(env.dev, 'open', 'executePrimaryCommand');
    ok('state: a command from this phone clears it too', env.$rootScope.nxState(env.dev) === 'opening');
    // the report changes: the decision is for the old report only
    await read(env);
    env.dev.properties = [{ value: 'open' }, { value: '0' }];
    ok('state: a report of "open" is shown as it is', env.$rootScope.nxState(env.dev) === 'open' && env.$rootScope.nxIcon(env.dev) === '' && env.$rootScope.nxSettled(env.dev) === '');
  }
  {
    const recent = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(60000) });
    await read(recent);
    ok('state: an opening of a minute ago may still be going on: not settled', recent.$rootScope.nxState(recent.dev) === 'opening' && recent.$rootScope.nxSettled(recent.dev) === '');
    const wrongWay = await environment({ properties: [{ value: 'closing' }, { value: '0' }], logs: mov(20 * 60000) });
    await read(wrongWay);
    ok('state: "closing" after an opening is not settled (nothing explains it)', wrongWay.$rootScope.nxState(wrongWay.dev) === 'closing');
    const stopped = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000, [{ source: 'CTRL-ANNA-0001', type: 'stop', time: NOW - 10 * 60000 }]) });
    await read(stopped);
    ok('state: a stop after the opening: not settled', stopped.$rootScope.nxState(stopped.dev) === 'opening');
    const obstructed = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000, [{ source: 'busT4', type: 'obstruction', time: NOW - 10 * 60000 }]) });
    await read(obstructed);
    ok('state: an obstruction after the opening: not settled', obstructed.$rootScope.nxState(obstructed.dev) === 'opening');
    const blockedMid = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000, [{ source: 'CTRL-ANNA-0001', type: 'MDBm', time: NOW - 10 * 60000 }]) });
    await read(blockedMid);
    ok('state: a Block after the opening (it can stop the gate half way): not settled', blockedMid.$rootScope.nxState(blockedMid.dev) === 'opening');
    const closing = await environment({ properties: [{ value: 'closing' }, { value: '1' }], logs: { deviceLogs: [{ source: 'scheduler', type: 'close', time: NOW - 30 * 60000 }] } });
    await read(closing);
    ok('state: "closing" after a closing long ago is shown as closed, with the obstruction flag as it was', closing.$rootScope.nxState(closing.dev) === 'closed' && closing.$rootScope.nxIcon(closing.dev) === 'icon-i_gat005 closed status-1' && closing.$rootScope.nxSettled(closing.dev) === 'reported: closing', closing.$rootScope.nxIcon(closing.dev));
    const open = await environment({ properties: [{ value: 'open' }, { value: '0' }], logs: mov(20 * 60000) });
    await read(open);
    ok('state: a state that is not moving is left alone', open.$rootScope.nxState(open.dev) === 'open' && open.$rootScope.nxIcon(open.dev) === '' && open.$rootScope.nxSettled(open.dev) === '');
    const none = await environment({ properties: [] });
    ok('state: no state at all, no error', none.$rootScope.nxState(none.dev) === undefined && none.$rootScope.nxIcon(none.dev) === '' && none.$rootScope.nxState(null) === undefined);
    const old = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000) });
    await read(old);
    old.w.Date.now = () => NOW + 10 * 60000;
    old.dev.properties = [{ value: 'closing' }, { value: '0' }];
    ok('state: when the report changes the old decision does not apply', old.$rootScope.nxState(old.dev) === 'closing');
  }
  {
    // a state report: what the accessory says goes into the LOG, and "opening" asks for a fresh reading of the log
    const env = await environment({ logs: mov(20 * 60000) });
    const res = { devices: [{ properties: [{ name: 'DoorStatus', value: 'open' }, { name: 'Obstruct', value: '0' }] }] };
    env.act.onStatus(env.dev, res);
    ok('status: what the accessory says is in the LOG', env.logs.indexOf('state: status of 00:0B:6C:AA:BB:CC says [DoorStatus=open, Obstruct=0]') > -1, env.logs.join(' | '));
    ok('status: ...and which services and properties it declares, once', env.logs.filter((l) => /^state: the accessory declares services \[T4Action w, DoorAction w\] properties \[DoorStatus r, Obstruct r\], type sliding, product ROBUS$/.test(l)).length === 1);
    env.act.onStatus(env.dev, { devices: [{ properties: [{ value: 'closed' }, { value: '0' }] }] });
    ok('status: ...without names the values stand alone, and the declaration is not repeated', env.logs.indexOf('state: status of 00:0B:6C:AA:BB:CC says [closed, 0]') > -1 && env.logs.filter((l) => /^state: the accessory declares/.test(l)).length === 1);
    ok('status: a state that is not moving asks for nothing', env.calls.logs === 0);
    env.act.onStatus(env.dev, { devices: [{ properties: [{ value: 'opening' }, { value: '0' }] }] });
    await sleep(60);
    ok('status: "opening" asks for a fresh reading of the log', env.calls.logs === 1, String(env.calls.logs));
    env.act.onStatus(env.dev, { devices: [{ properties: [{ value: 'opening' }, { value: '0' }] }] });
    await sleep(60);
    ok('status: ...but not again within twenty seconds', env.calls.logs === 1);
    env.w.Date.now = () => NOW + 30000;
    env.act.onStatus(env.dev, { devices: [{ properties: [{ value: 'closing' }, { value: '0' }] }] });
    await sleep(60);
    ok('status: ...and again after that', env.calls.logs === 2, String(env.calls.logs));
    let threw = false;
    try { env.act.onStatus(null, res); env.act.onStatus(env.dev, undefined); env.act.onStatus(env.dev, {}); } catch (e) { threw = true; }
    ok('status: nothing, or rubbish, does not throw', threw === false);
  }
  {
    // after a command: the log is read a little later, and again when the travel time is over if the gate is still said to move
    const env = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000), afterMs: 25, travelMs: 40, marginMs: 30 });
    env.act.onCommand(env.dev, 'open', 'executePrimaryCommand');
    await sleep(55);
    ok('command: the log is read a little later', env.calls.logs === 1, String(env.calls.logs));
    await sleep(100);
    ok('command: ...and once more after the travel time, because the gate is still said to be moving', env.calls.logs === 2, String(env.calls.logs));
    const fine = await environment({ properties: [{ value: 'open' }, { value: '0' }], logs: mov(20 * 60000), afterMs: 25, travelMs: 40, marginMs: 30 });
    fine.act.onCommand(fine.dev, 'open', 'executePrimaryCommand');
    await sleep(160);
    ok('command: ...but not when the gate is no longer said to be moving', fine.calls.logs === 1, String(fine.calls.logs));
    // events: "opening" plans a reading for when the travel is over; the end of the movement cancels it
    const ev = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000), travelMs: 40, marginMs: 30 });
    ev.act.onEvent({ mac: ev.dev.mac, state: 'opening', obstruct: '0' });
    await sleep(120);
    ok('event: "opening" while the gate keeps being said to open makes a reading after the travel time', ev.calls.logs === 1, String(ev.calls.logs));
    const ev2 = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000), travelMs: 40, marginMs: 30 });
    ev2.act.onEvent({ mac: ev2.dev.mac, state: 'opening', obstruct: '0' });
    ev2.dev.properties = [{ value: 'open' }, { value: '0' }];
    ev2.act.onEvent({ mac: ev2.dev.mac, state: 'open', obstruct: '0' });
    await sleep(120);
    ok('event: "open" cancels it', ev2.calls.logs === 0, String(ev2.calls.logs));
    let threw2 = false;
    try { ev2.act.onEvent({ mac: 'SOMEONE-ELSE', state: 'opening' }); ev2.act.onEvent(undefined); ev2.act.onEvent({}); } catch (e) { threw2 = true; }
    ok('event: an event of another accessory, or none, does not throw', threw2 === false);
  }
  {
    // the line and the pill when the state is settled, in the real sequence of the accessory screen: the screen is entered, the status says "opening"
    const env = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov(20 * 60000), prefetchMs: 20 });
    env.navigate(DETAIL);
    await sleep(120);
    ok('screen: entering the screen with an old "opening" reads the log, and the state follows', env.calls.logs === 1 && env.$rootScope.nxState(env.dev) === 'open', env.calls.logs + ' ' + env.$rootScope.nxState(env.dev));
    ok('screen: ...and the line says the last command of the phone, not of the "automation"', env.$rootScope.nxLast(env.dev) === 'Open and Block · today 14:10 · Anna', env.$rootScope.nxLast(env.dev));
    ok('screen: ...and the pill says blocked', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 14:10', env.$rootScope.nxBlock(env.dev));
    env.navigate(DETAIL);
    ok('screen: entering again decides again (the old decision is gone until the log has been read)', env.$rootScope.nxState(env.dev) === 'opening' || env.$rootScope.nxState(env.dev) === 'open');
  }
  // ---------------------------------------------------------------- another app, another phone: the log is read again
  const hide = (env, yes) => Object.defineProperty(env.document, 'hidden', { configurable: true, get: () => yes });
  {
    // the case that was reported: this phone blocks the gate ("Open and Block"), later the official app gives "Release and Close". This app is not
    // involved in that; the log of the accessory is the only place where it shows.
    const t0 = D(7, 12, 0);
    const scen = { logs: { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: t0 + 1000 }, { source: 'busT4', type: 'open', time: t0 + 2000 }] }, eventMs: 30, minGapMs: 0 };
    const env = await environment(scen);
    env.w.Date.now = () => t0;
    env.act.onCommand(env.dev, 'MDBk', 'executeSecondaryCommand');
    env.w.Date.now = () => t0 + 5000;
    await read(env);
    ok('other app: after the Block the pill and the line say so', env.$rootScope.nxBlock(env.dev) === 'Blocked · since just now' && env.$rootScope.nxLast(env.dev) === 'Open and Block · just now · Anna',
      env.$rootScope.nxBlock(env.dev) + ' / ' + env.$rootScope.nxLast(env.dev));
    scen.logs = { deviceLogs: scen.logs.deviceLogs.concat([{ source: 'CTRL-ANNA-0001', type: 'MDFh', time: t0 + 120000 }, { source: 'busT4', type: 'close', time: t0 + 121000 }]) };
    env.w.Date.now = () => t0 + 123000;
    ok('other app: nothing has told this app yet: the pill still says blocked', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 12:00');
    ok('other app: ...and the line no longer says "just now" two minutes later', env.$rootScope.nxLast(env.dev) === 'Open and Block · today 12:00 · Anna', env.$rootScope.nxLast(env.dev));
    const before = env.calls.logs;
    env.act.onEvent({ mac: env.dev.mac, state: 'closing', obstruct: '0' });
    await sleep(120);
    ok('other app: a report of the accessory (the gate moves) makes this app read the log again', env.calls.logs === before + 1, String(env.calls.logs - before));
    ok('other app: ...and the pill is gone', env.$rootScope.nxBlock(env.dev) === '' && env.act.blockInfo(env.dev).blocked === false && env.act.blockInfo(env.dev).type === 'MDFh', JSON.stringify(env.act.blockInfo(env.dev)));
    ok('other app: ...and the line says what the other app did', env.$rootScope.nxLast(env.dev) === 'Release and Close · just now · Anna', env.$rootScope.nxLast(env.dev));
    ok('other app: ...and the LOG says that the log changed and why it was read', env.logs.some((l) => /^activity: \d+ device events, .* \(event\)$/.test(l)), env.logs.join(' | '));
    const sheet = await environment({ logs: scen.logs });
    sheet.w.Date.now = () => t0 + 123000;
    sheet.act.open(sheet.dev); await sleep(60);
    ok('other app: the sheet shows it too: not blocked', /Not blocked, as far as the log shows/.test(sheet.body().textContent) && /Release and Close/.test(sheet.body().textContent));
  }
  {
    // events while the app is in the background are not read (the app is not looking); coming back does it
    const scen = { eventMs: 20, resumeMs: 20, minGapMs: 0 };
    const env = await environment(scen);
    env.navigate(DETAIL); await sleep(60);
    const n = env.calls.logs;
    hide(env, true);
    env.act.onEvent({ mac: env.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('event: not while the app is in the background', env.calls.logs === n, String(env.calls.logs - n));
    hide(env, false);
    env.act.onEvent({ mac: env.dev.mac, state: 'open', obstruct: '0' }); env.act.onEvent({ mac: env.dev.mac, state: 'closed', obstruct: '0' }); await sleep(80);
    ok('event: several reports in a row are one reading', env.calls.logs === n + 1, String(env.calls.logs - n));
    env.act.onEvent({ mac: 'SOMEONE-ELSE', state: 'open' });
    await sleep(60);
    ok('event: a report of an accessory that is not known plans nothing', env.calls.logs === n + 1, String(env.calls.logs - n));
  }
  {
    // a Release without movement gives no report of the state: the log is read on a timer as long as the screen is open
    const t0 = D(7, 12, 0);
    const scen = { logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDBm', time: t0 }] }, pollMs: 40, minGapMs: 0, prefetchMs: 10 };
    const env = await environment(scen);
    env.w.Date.now = () => t0 + 300000;
    await sleep(100);
    ok('poll: nothing is read before the screen is opened', env.calls.logs === 0);
    env.navigate(DETAIL);
    await sleep(30);
    ok('poll: the Block of someone else shows, as soon as the screen has been read', env.$rootScope.nxBlock(env.dev) === 'Blocked · since 12:00' && env.act.blockInfo(env.dev).who === 'Ben');
    const n = env.calls.logs;
    scen.logs = { deviceLogs: scen.logs.deviceLogs.concat([{ source: 'CTRL-ANNA-0001', type: 'MDEw', time: t0 + 20000 }]) };
    env.w.Date.now = () => t0 + 330000;
    await sleep(200);
    ok('poll: as long as the screen is open the log is read again and again', env.calls.logs >= n + 2, String(env.calls.logs - n));
    ok('poll: ...so a plain Release (nothing moves, no report) shows too', env.$rootScope.nxBlock(env.dev) === '' && env.act.blockInfo(env.dev).who === 'Anna', JSON.stringify(env.act.blockInfo(env.dev)));
    hide(env, true);
    const m = env.calls.logs;
    await sleep(150);
    ok('poll: not while the app is in the background', env.calls.logs === m, String(env.calls.logs - m));
    hide(env, false);
    await sleep(150);
    ok('poll: ...and again when it is back', env.calls.logs > m);
    env.dev.reachable = false;
    const r = env.calls.logs;
    await sleep(120);
    ok('poll: not for an accessory that is not reachable', env.calls.logs === r, String(env.calls.logs - r));
    env.dev.reachable = true;
    env.$rootScope.nxCheck = () => 'checking';
    await sleep(120);
    ok('poll: not while the app is still checking the accessory', env.calls.logs === r, String(env.calls.logs - r));
    delete env.$rootScope.nxCheck;
    await sleep(120);
    ok('poll: ...and on again afterwards', env.calls.logs > r);
    env.act.open(env.dev); await sleep(60);
    const s = env.calls.logs;
    await sleep(150);
    ok('poll: not while the sheet is open (it has its own Refresh)', env.calls.logs === s, String(env.calls.logs - s));
    env.act.close(); await sleep(450);
    env.navigate('tabsController.favorites');
    const k = env.calls.logs;
    await sleep(200);
    ok('poll: stops when the screen is left', env.calls.logs === k, String(env.calls.logs - k));
    env.navigate(DETAIL); await sleep(150);
    ok('poll: ...and starts again on the next visit', env.calls.logs > k);
  }
  {
    // a reading of a moment ago is not repeated by the timer
    const env = await environment({ pollMs: 30 });
    env.navigate(DETAIL); await sleep(200);
    ok('poll: a reading that is younger than a few seconds is as good as a new one', env.calls.logs === 1, String(env.calls.logs));
  }
  {
    // coming back to the app (Cordova: resume) reads the log, also when the page only says that it is visible again
    const env = await environment({ resumeMs: 20, minGapMs: 0 });
    env.navigate(DETAIL); await sleep(80);
    const n = env.calls.logs;
    env.document.dispatchEvent(new env.w.Event('resume')); await sleep(80);
    ok('resume: coming back to the app reads the log', env.calls.logs === n + 1, String(env.calls.logs - n));
    env.document.dispatchEvent(new env.w.Event('visibilitychange')); await sleep(80);
    ok('resume: ...also when the page says that it is visible again', env.calls.logs === n + 2, String(env.calls.logs - n));
    hide(env, true);
    env.document.dispatchEvent(new env.w.Event('visibilitychange')); await sleep(80);
    ok('resume: ...but not when it says that it is hidden', env.calls.logs === n + 2);
    hide(env, false);
    env.navigate('tabsController.favorites');
    env.document.dispatchEvent(new env.w.Event('resume')); await sleep(80);
    ok('resume: not on another screen', env.calls.logs === n + 2);
    // the sheet was open when the app left: it is read again when the app comes back, and shows what the other app did
    const t0 = D(7, 12, 0), scenS = { logs: { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: t0 }] }, resumeMs: 20, minGapMs: 0 };
    const sh = await environment(scenS);
    sh.w.Date.now = () => t0 + 300000;
    sh.act.open(sh.dev); await sleep(60);
    ok('resume: (the sheet is open and says blocked)', /nx-act-block nx-blocked/.test(sh.body().innerHTML));
    scenS.logs = { deviceLogs: scenS.logs.deviceLogs.concat([{ source: 'CTRL-BEN-00002', type: 'MDEw', time: t0 + 120000 }]) };
    sh.document.dispatchEvent(new sh.w.Event('resume')); await sleep(100);
    ok('resume: ...and after coming back it is read again and says not blocked', sh.calls.logs === 2 && /Not blocked, as far as the log shows/.test(sh.body().textContent) && /Release · Ben/.test(sh.body().textContent), sh.calls.logs + ' ' + sh.body().textContent.slice(0, 120));
    const quick = await environment({ resumeMs: 20 });
    quick.navigate(DETAIL); await sleep(80);
    quick.document.dispatchEvent(new quick.w.Event('resume')); await sleep(80);
    ok('resume: a reading of a moment ago is not repeated', quick.calls.logs === 1, String(quick.calls.logs));
    quick.w.Date.now = () => NOW + 3000;
    quick.document.dispatchEvent(new quick.w.Event('resume')); await sleep(80);
    ok('resume: ...but one of three seconds ago is (the gap after coming back is two seconds; for the timer it is five)', quick.calls.logs === 2, String(quick.calls.logs));
  }
  {
    // the app asks the accessory for its state when the screen is entered and when it comes back: that is a moment to look at the log
    const env = await environment({ statusMs: 20 });
    env.navigate(DETAIL); await sleep(80);
    const n = env.calls.logs, closed = { devices: [{ properties: [{ value: 'closed' }, { value: '0' }] }] };
    env.act.onStatus(env.dev, closed); await sleep(60);
    ok('status: a report right after a reading asks for nothing more', env.calls.logs === n, String(env.calls.logs - n));
    env.w.Date.now = () => NOW + 31000;
    env.act.onStatus(env.dev, closed); await sleep(60);
    ok('status: an older reading is made again, whatever the state is', env.calls.logs === n + 1, String(env.calls.logs - n));
    env.navigate('tabsController.favorites');
    env.w.Date.now = () => NOW + 120000;
    env.act.onStatus(env.dev, closed); await sleep(60);
    ok('status: not for an accessory whose screen is not open', env.calls.logs === n + 1);
    const hidden = await environment({ statusMs: 20 });
    hidden.navigate(DETAIL); await sleep(80);
    hide(hidden, true);
    hidden.w.Date.now = () => NOW + 120000;
    hidden.act.onStatus(hidden.dev, closed); await sleep(60);
    ok('status: not while the app is in the background', hidden.calls.logs === 1, String(hidden.calls.logs));
  }
  {
    // readings that fail: the LOG gets one line, one more attempt, and the timer waits
    const scen = { logsErr: { code: 4 }, pollMs: 30, minGapMs: 50, retryMs: 40, backoffMs: 150 };
    const env = await environment(scen);
    env.navigate(DETAIL); await sleep(250);
    const fails = env.logs.filter((l) => /^activity: could not read the log/.test(l));
    ok('failure: the first one is in the LOG, with the reason for the reading', fails.length === 1 && /\(screen\) \{"code":4\}$/.test(fails[0]), fails.join(' | '));
    ok('failure: ...one more attempt is made, and the timer waits after the failure', env.calls.logs === 2, String(env.calls.logs));
    scen.logsErr = undefined;
    env.w.Date.now = () => NOW + 500;                    // the waiting time is over
    await sleep(100);
    ok('failure: ...when it is over the timer reads again', env.calls.logs === 3 && !!env.act.cache[env.dev.mac], String(env.calls.logs));
    ok('failure: ...and the LOG says that it works again, once', env.logs.filter((l) => l === 'activity: the log can be read again').length === 1, env.logs.join(' | '));
    const e2 = await environment({ logsErr: { code: 3 }, eventMs: 20, retryMs: 40 });
    e2.act.onEvent({ mac: e2.dev.mac, state: 'open', obstruct: '0' });
    await sleep(35);
    const one = e2.calls.logs;
    await sleep(150);
    ok('failure: a reading after a report that fails is tried once more', one === 1 && e2.calls.logs === 2, one + ' ' + e2.calls.logs);
    await sleep(150);
    ok('failure: ...and not a third time', e2.calls.logs === 2, String(e2.calls.logs));
    e2.act.onEvent({ mac: e2.dev.mac, state: 'closed', obstruct: '0' });
    await sleep(150);
    ok('failure: ...a next report in the same run of failures is read once and not tried again (the accessory is not pestered)', e2.calls.logs === 3, String(e2.calls.logs));
    const scen4 = { logsErr: { code: 3 }, eventMs: 20, retryMs: 40 };
    const e4 = await environment(scen4);
    e4.act.onEvent({ mac: e4.dev.mac, state: 'open', obstruct: '0' });
    await sleep(35);
    scen4.logsErr = undefined;                           // the accessory answers again before the second attempt
    await sleep(100);
    ok('failure: ...and the second attempt is the one that works', e4.calls.logs === 2 && !!e4.act.cache[e4.dev.mac] && e4.logs.indexOf('activity: the log can be read again') > -1, e4.calls.logs + ' ' + e4.logs.join(' | '));
    // a failure of the reading that someone asked for is shown to them, whatever the background does
    const e5 = await environment({ logsErr: { code: 3 }, eventMs: 20, retryMs: 40 });
    e5.act.onEvent({ mac: e5.dev.mac, state: 'open', obstruct: '0' });
    await sleep(35);
    e5.act.open(e5.dev); await sleep(60);
    ok('failure: the sheet tells about a failure by itself, also when the background has failed before', /Could not read the history/.test(e5.body().textContent) && e5.logs.filter((l) => /^activity: could not read the log/.test(l)).length >= 2, e5.logs.join(' | '));
  }
  {
    // the users are for the names only: a reading in the background reuses them
    const env = await environment({ eventMs: 20, minGapMs: 0 });
    await read(env);
    env.act.onEvent({ mac: env.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('users: a reading in the background reuses the users it has', env.calls.logs === 2 && env.calls.pairings === 1, JSON.stringify(env.calls));
    await read(env);
    ok('users: ...a reading that someone asked for does not', env.calls.logs === 3 && env.calls.pairings === 2, JSON.stringify(env.calls));
    const old = await environment({ eventMs: 20, usersAge: 0 });
    await read(old);
    old.act.onEvent({ mac: old.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('users: ...and they are asked for again when they are older than that', old.calls.pairings === 2, JSON.stringify(old.calls));
    const none = await environment({ eventMs: 20, pairingsRaw: {} });
    await read(none);
    none.act.onEvent({ mac: none.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('users: an answer without users is not remembered either', none.calls.pairings === 2, JSON.stringify(none.calls));
    const bad = await environment({ eventMs: 20, pairingsErr: { code: 5 } });
    await read(bad);
    bad.act.onEvent({ mac: bad.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('users: users that could not be read are not remembered', bad.calls.pairings === 2, JSON.stringify(bad.calls));
  }
  {
    // the LOG gets lines for a reading in the background only when the log has changed
    const base = [{ source: 'CTRL-ANNA-0001', type: 'open', time: D(7, 9, 0) }];
    const scen = { logs: { deviceLogs: base }, eventMs: 20, minGapMs: 0 };
    const env = await environment(scen);
    await read(env);
    const n = env.logs.length;
    env.act.onEvent({ mac: env.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    ok('LOG: a reading in the background that finds the same log adds nothing', env.calls.logs === 2 && env.logs.slice(n).filter((l) => /^activity:/.test(l)).length === 0, env.logs.slice(n).join(' | '));
    scen.logs = { deviceLogs: base.concat([{ source: 'CTRL-ANNA-0001', type: 'MDEw', time: D(7, 10, 0) }]) };
    env.act.onEvent({ mac: env.dev.mac, state: 'open', obstruct: '0' }); await sleep(80);
    const added = env.logs.slice(n).filter((l) => /^activity:/.test(l));
    ok('LOG: ...one that finds something new says so (what was found, and why it read)', added.length === 2 && /^activity: 2 device events, .* \(event\)$/.test(added[0]) && /^activity: device \[/.test(added[1]), added.join(' | '));
    await read(env);
    ok('LOG: a reading that someone asked for always says what it found', env.logs.filter((l) => /^activity: \d+ device events/.test(l)).length === 3);
  }
  {
    // what counts, this phone or the log: the log wins when it was read after the command, also when the clock of the accessory is a bit behind
    const t0 = D(7, 12, 0), rec = { '00:0B:6C:AA:BB:CC': { blocked: true, at: t0, code: 'MDBk', who: 'Anna' } };
    const behind = await environment({ storage: { nxBlock: JSON.stringify(rec) },
      logs: { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: t0 - 5000 }, { source: 'CTRL-BEN-00002', type: 'MDEw', time: t0 - 2000 }] } });
    behind.w.Date.now = () => t0 + 90000;
    await read(behind);
    ok('block: a Release that came after this phone\'s Block but is dated before it (the accessory\'s clock is behind) counts', behind.$rootScope.nxBlock(behind.dev) === '' && behind.act.blockInfo(behind.dev).who === 'Ben', JSON.stringify(behind.act.blockInfo(behind.dev)));
    const same = await environment({ storage: { nxBlock: JSON.stringify(rec) }, logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDEw', time: t0 - 20000 }] } });
    same.w.Date.now = () => t0 + 500;
    await read(same);
    ok('block: a reading taken in the same second cannot have this phone\'s Block yet: this phone counts', same.act.blockInfo(same.dev).blocked === true && same.act.blockInfo(same.dev).who === 'Anna' && same.act.blockInfo(same.dev).t === t0, JSON.stringify(same.act.blockInfo(same.dev)));
    const far = await environment({ storage: { nxBlock: JSON.stringify(rec) }, logs: { deviceLogs: [{ source: 'CTRL-BEN-00002', type: 'MDEw', time: t0 - 600000 }] } });
    far.w.Date.now = () => t0 + 90000;
    await read(far);
    ok('block: a Release from ten minutes before this phone\'s Block is not the answer to it: this phone counts', far.$rootScope.nxBlock(far.dev) === 'Blocked · since 12:00');
    const mine = await environment({ storage: { nxBlock: JSON.stringify(rec) }, logs: { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: t0 + 1000 }, { source: 'busT4', type: 'open', time: t0 + 2000 }] } });
    mine.w.Date.now = () => t0 + 90000;
    await read(mine);
    ok('block: the log with this phone\'s own Block says the same: blocked, since the time the accessory has', mine.$rootScope.nxBlock(mine.dev) === 'Blocked · since 12:00' && mine.act.blockInfo(mine.dev).who === 'Anna');
    const later = await environment({ storage: { nxBlock: JSON.stringify(rec) }, logs: { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: t0 + 1000 }, { source: 'CTRL-BEN-00002', type: 'MDFh', time: t0 + 90000 }] } });
    later.w.Date.now = () => t0 + 100000;
    await read(later);
    ok('block: a Release some time after it ends it (and says by whom)', later.$rootScope.nxBlock(later.dev) === '' && later.act.blockInfo(later.dev).who === 'Ben');
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
