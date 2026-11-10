// nx23 (Activity sheet): the periods that the numbers count, the charts (no data is not zero, the numbers, the busiest hours, greyscale), the order of the
// sheet, the wording and the states (loading, slow, empty, error). The functions are tested without a browser, the sheet in jsdom (without CSS: what it looks
// like is checked with the screenshots of harness/steps-activity.cjs), and the colors of the charts in the built css. All data is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-activity.test.js
const fs = require('fs');
const path = require('path');
const A = require('../nx-activity.js');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'nx-activity.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'skin', 'nx-expressive.css'), 'utf8');
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('   skipped: jsdom is missing (the sheet is not tested)'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

// November 2026: the 1st is a Sunday, so the 9th is a Monday. "now" is Monday 9 November, 14:30, in the time zone of whoever runs the test.
const T = (month, day, h, m, s) => new Date(2026, month, day, h || 0, m || 0, s || 0).getTime();
const OCT = 9, NOV = 10;
const NOW = T(NOV, 9, 14, 30);
const ANNA = 'CTRL-ANNA-0001', BEN = 'CTRL-BEN-00002';
const USERS = [{ id: 1, controllerID: ANNA, username: 'Anna' }, { id: 2, controllerID: BEN, username: 'Ben' }];
const label = (t) => ({ open: 'Open', close: 'Close', stop: 'Stop', obstruction: 'Obstruction', MDBk: 'Open and Block', MDEw: 'Release' }[t] || t);

// A household. From the first day on: Anna opens at 07:40 and closes at 07:42, Ben opens at 17:30 and closes at 17:33 (Monday to Friday), the schedule closes at 22:00
// (every day), and the gate controller repeats every command of a phone a second later (as a real accessory does). `cmds` is what a person would count: the commands.
function household(first, opts) {
  opts = opts || {};
  const dev = [], ifc = [], cmds = [];
  let n = 0;
  const add = (list, t, source, type) => { if (t <= NOW) list.push({ deviceId: '1', source, type, time: t, idx: String(++n), id: String(n) }); };
  const cmd = (t, source, type) => { if (t > NOW) return; add(dev, t, source, type); if (source !== 'busT4' && source !== 'scheduler') add(dev, t + 1000, 'busT4', type); cmds.push({ t, source, type }); };
  const start = new Date(2026, first.m, first.d);
  for (let day = new Date(start); day.getTime() <= NOW; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    const y = day.getFullYear(), m = day.getMonth(), d = day.getDate(), wd = day.getDay();
    if (!opts.noRoutine && wd >= 1 && wd <= 5) {
      cmd(T(m, d, 7, 40) + 1, ANNA, 'open'); cmd(T(m, d, 7, 42), ANNA, 'close');
      cmd(T(m, d, 17, 30), BEN, 'open'); cmd(T(m, d, 17, 33), BEN, 'close');
    }
    cmd(T(m, d, 22, 0), 'scheduler', 'close');
  }
  (opts.extra || []).forEach((e) => cmd(T(e[0], e[1], e[2], e[3]), e[4], e[5]));      // [month, day, hour, minute, source, type]
  const o = opts.restart || T(first.m, first.d, 5, 0);            // the log begins when the accessory starts
  ifc.push({ source: 'boot', type: 'Power ON', time: o }, { source: 'boot', type: 'T4 device found', time: o + 30000 });
  return { res: { interfaceLogs: ifc, deviceLogs: dev }, cmds, add, ifc, dev };
}
const startOfDay = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const DAYMS = 86400000;
const addDays = (t, k) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + k, d.getHours(), d.getMinutes()).getTime(); };

const LONG = household({ m: OCT, d: 20 });                  // from Tuesday 20 October: 20 days
const MID = household({ m: OCT, d: 29 });                   // from Thursday 29 October: 12 days (more than a week, less than 14 days)
const SHORT = household({ m: NOV, d: 9 }, { noRoutine: true, extra: [[NOV, 9, 8, 0, ANNA, 'open'], [NOV, 9, 8, 2, ANNA, 'close'], [NOV, 9, 9, 30, BEN, 'open'], [NOV, 9, 9, 31, BEN, 'close'], [NOV, 9, 11, 0, 'busT4', 'stop']] });  // from this morning
const aLong = A.analyze(LONG.res, USERS, NOW), aMid = A.analyze(MID.res, USERS, NOW), aShort = A.analyze(SHORT.res, USERS, NOW);

// ------------------------------------------------------------------------------------------------ the words
{
  ok('whenParts: the same as when(), in two parts', [T(NOV, 9, 7, 5), T(NOV, 8, 22, 0), T(NOV, 4, 7, 31), T(OCT, 28, 9, 0)].every((t) => {
    const p = A.whenParts(t, NOW);
    return p.day + ' ' + p.time === A.when(t, NOW);
  }), JSON.stringify([A.whenParts(T(NOV, 8, 22, 0), NOW), A.whenParts(T(OCT, 28, 9, 0), NOW)]));
  ok('whenParts: today, yesterday, a weekday, a date', A.whenParts(T(NOV, 9, 7, 5), NOW).day === 'today' && A.whenParts(T(NOV, 8, 22, 0), NOW).day === 'yesterday' &&
    A.whenParts(T(NOV, 5, 8, 0), NOW).day === 'Thu' && A.whenParts(T(OCT, 28, 9, 0), NOW).day === '28 Oct' && A.whenParts(T(NOV, 9, 7, 5), NOW).time === '07:05');
  ok('whenParts: a moment ago', A.whenParts(NOW - 20000, NOW).day === 'just now');

  ok('spanText: minutes, hours, days, each in the unit that fits', A.spanText(40 * 60000) === '40 minutes' && A.spanText(30000) === '1 minute' && A.spanText(5 * 3600000) === '5 hours' &&
    A.spanText(3600000) === '1 hour' && A.spanText(30 * 3600000) === '30 hours' && A.spanText(47 * 3600000) === '47 hours' && A.spanText(48 * 3600000) === '2 days' && A.spanText(11.4 * DAYMS) === '11 days' && A.spanText(DAYMS * 61) === '61 days', A.spanText(48 * 3600000));
  ok('spanText: a time that is not before now does not break it', A.spanText(-5000) === '1 minute');

  ok('actorOf: the gate controller is "At the gate" (a remote control or a switch), a phone that is not known is "Another phone", a person keeps the name',
    A.actorOf('Gate controller').name === 'At the gate' && A.actorOf('Gate controller').note === 'remote or switch' && A.actorOf('Other (6f9e1c2a)').name === 'Another phone' &&
    A.actorOf('Anna').name === 'Anna' && A.actorOf('Schedule').name === 'Schedule' && A.actorOf('Others').name === 'Others' && A.actorOf(undefined).name === '');
  // the statistics keep the names of whoOf(); if one of them changes, the words of the sheet have to follow
  ok('actorOf: matches what whoOf() says for busT4 and for a phone that is not in the list', A.actorOf(A.whoOf('busT4', USERS)).name === 'At the gate' && A.actorOf(A.whoOf('ZZZZ1234abcd', USERS)).name === 'Another phone' &&
    A.actorOf(A.whoOf(ANNA, USERS)).name === 'Anna' && A.actorOf(A.whoOf('scheduler', USERS)).name === 'Schedule');
}

// ------------------------------------------------------------------------------------------------ the periods
{
  const w7 = A.statWindow(aLong, '7'), wAll = A.statWindow(aLong, 'all'), wDef = A.statWindow(aLong, undefined);
  const today = Math.floor(Date.UTC(2026, NOV, 9) / DAYMS);
  ok('statWindow: a log of 20 days has two periods, and the week is the default', w7.mode === '7' && wDef.mode === '7' && wAll.mode === 'all' && w7.canSwitch && wAll.canSwitch);
  ok('statWindow: the week is today and the six days before (calendar days)', w7.fromDay === today - 6 && w7.today === today && w7.label === 'last 7 days' && w7.full === 'last 7 days' && w7.phrase === 'in the last 7 days');
  ok('statWindow: the whole log begins on the day of the oldest event and says how long it is', wAll.fromDay === today - 20 && wAll.firstDay === today - 20 && wAll.label === 'whole log' && wAll.full === 'whole log, 20 days' && wAll.phrase === 'in the whole log', wAll.full);
  const mid7 = A.statWindow(aMid, '7');
  ok('statWindow: a log of 12 days: the week, or the whole log, which begins on the day of the oldest event', mid7.mode === '7' && mid7.canSwitch && A.statWindow(aMid, 'all').firstDay === today - 11 && A.statWindow(aMid, 'all').full === 'whole log, 11 days', A.statWindow(aMid, 'all').full);
  const sh = A.statWindow(aShort, '7');
  ok('statWindow: a log that is not older than a week has only the whole log, whatever is asked, and says how short it is',
    sh.mode === 'all' && !sh.canSwitch && A.statWindow(aShort, 'all').mode === 'all' && sh.full === 'whole log, 10 hours' && sh.phrase === 'in the whole log', sh.full);
  const week = A.analyze(household({ m: NOV, d: 3 }).res, USERS, NOW);        // begins on the 3rd: today and the six days before are the 3rd to the 9th
  ok('statWindow: the log begins exactly on the first day of the week: still only the whole log', !A.statWindow(week, '7').canSwitch && A.statWindow(week, '7').mode === 'all');
  const week8 = A.analyze(household({ m: NOV, d: 2 }).res, USERS, NOW);
  ok('statWindow: one day older: two periods', A.statWindow(week8, '7').canSwitch && A.statWindow(week8, '7').mode === '7');
}
{
  // what is counted in a period equals what a person counts (the generator knows the commands)
  const week = (cmds) => cmds.filter((c) => startOfDay(c.t) >= startOfDay(addDays(NOW, -6)));
  const s7 = A.windowStats(aLong, A.statWindow(aLong, '7')), sAll = A.windowStats(aLong, A.statWindow(aLong, 'all'));
  ok('windowStats: the commands of the week', s7.commands === week(LONG.cmds).length && s7.commands > 20, s7.commands + ' vs ' + week(LONG.cmds).length);
  ok('windowStats: the commands of the whole log', sAll.commands === LONG.cmds.length && sAll.commands === aLong.commands.length, sAll.commands + ' vs ' + LONG.cmds.length);
  ok('windowStats: the repeats of the gate controller are not counted twice', aLong.events.length === LONG.cmds.length && aLong.echoes > 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  ok('windowStats: who and the hours add up to the commands of the period (so the numbers of the sheet agree)', sum(s7.byWho.map((w) => w.count)) === s7.commands && sum(s7.hours) === s7.commands &&
    sum(sAll.byWho.map((w) => w.count)) === sAll.commands && sum(sAll.hours) === sAll.commands);
  ok('windowStats: by hour (07 and 17 for the routine, 22 for the schedule; the 22:00 of today has not come yet)', s7.hours[7] === 10 && s7.hours[17] === 8 && s7.hours[22] === 6 && s7.hours[3] === 0, JSON.stringify(s7.hours));
  ok('windowStats: who, the most first', s7.byWho[0].count >= s7.byWho[1].count && s7.byWho.every((w) => w.count > 0) && s7.byWho.map((w) => w.who).sort().join() === 'Anna,Ben,Schedule', JSON.stringify(s7.byWho));
  const ob = A.analyze({ deviceLogs: [{ source: 'busT4', type: 'obstruction', time: T(NOV, 2, 8, 0) }, { source: 'busT4', type: 'obstruction', time: T(NOV, 8, 9, 0) }, { source: ANNA, type: 'open', time: T(OCT, 20, 9, 0) }] }, USERS, NOW);
  ok('windowStats: the obstructions of the period, the newest first', A.windowStats(ob, A.statWindow(ob, '7')).obstructions.length === 1 && A.windowStats(ob, A.statWindow(ob, '7')).obstructions[0].t === T(NOV, 8, 9, 0) &&
    A.windowStats(ob, A.statWindow(ob, 'all')).obstructions.length === 2);
}
{
  // the bars: a day from before the log began is no data, the day it begins is a minimum
  const cells = A.dayCells(aMid, A.statWindow(aMid, 'all'));
  ok('dayCells: fourteen days, oldest first, today last', cells.length === 14 && cells[13].today && cells.filter((c) => c.today).length === 1 && cells.every((c, i) => i === 0 || c.n === cells[i - 1].n + 1));
  ok('dayCells: the days before the log began have no data (27 and 28 October), the day it begins is partial (29 October)', cells.filter((c) => c.nodata).length === 2 && cells.slice(0, 2).every((c) => c.nodata && c.total === 0) && cells[2].partial && !cells[2].nodata &&
    cells.slice(3).every((c) => !c.nodata && !c.partial), JSON.stringify(cells.map((c) => (c.nodata ? 'x' : c.partial ? 'p' : '-')).join('')));
  const quiet = A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(OCT, 30, 8, 0) }, { source: ANNA, type: 'close', time: T(NOV, 5, 8, 0) }], interfaceLogs: [{ type: 'Power ON', time: T(OCT, 29, 5, 0) }] }, USERS, NOW);
  const qc = A.dayCells(quiet, A.statWindow(quiet, 'all'));
  ok('dayCells: a day with data and no commands is a quiet day: zero, not "no data"', qc.filter((c) => !c.nodata && c.total === 0).length === 10 && qc.filter((c) => c.nodata).length === 2, JSON.stringify(qc.map((c) => (c.nodata ? 'x' : c.partial ? 'p' : c.total))));
  const c7 = A.dayCells(aMid, A.statWindow(aMid, '7'));
  ok('dayCells: the week has seven days, none without data', c7.length === 7 && c7.every((c) => !c.nodata && !c.partial) && c7[6].today);
  const cs = A.dayCells(aShort, A.statWindow(aShort, '7'));
  ok('dayCells: a log from this morning: 13 days without data, and today is the partial day', cs.filter((c) => c.nodata).length === 13 && cs[13].partial && cs[13].today && cs[13].total === 5, JSON.stringify(cs[13]));
  const cl = A.dayCells(aLong, A.statWindow(aLong, 'all'));
  ok('dayCells: a log of 20 days: all fourteen days have data, none is partial', cl.every((c) => !c.nodata && !c.partial));
  const total = cells.reduce((s, c) => s + c.total, 0);
  ok('dayCells: the bars of the fourteen days add up to the commands of those days', total === MID.cmds.filter((c) => startOfDay(c.t) >= startOfDay(addDays(NOW, -13))).length);
}

// ------------------------------------------------------------------------------------------------ the busiest hours
{
  const hours = (o) => { const h = new Array(24).fill(0); Object.keys(o).forEach((k) => { h[k] = o[k]; }); return h; };
  const sum = (h) => h.reduce((x, y) => x + y, 0);
  const tie = hours({ 7: 16, 8: 16, 9: 4, 17: 14, 18: 5, 22: 11 });
  const p = A.peakHours(tie, sum(tie));
  ok('peakHours: two hours with the same count are both the busiest, and neighbours are one range', p.enough && !p.spread && p.hours.join() === '7,8' && p.ranges.length === 1 && p.ranges[0].join() === '7,9' && p.count === 16, JSON.stringify(p));
  const two = hours({ 7: 10, 8: 4, 17: 10, 20: 3 });
  const p2 = A.peakHours(two, sum(two));
  ok('peakHours: two peaks that are not neighbours are two ranges', p2.enough && p2.hours.join() === '7,17' && p2.ranges.map((r) => r.join('-')).join() === '7-8,17-18', JSON.stringify(p2));
  const thin = hours({ 7: 3, 17: 3 });
  ok('peakHours: six commands are too few to call an hour the busiest', !A.peakHours(thin, 6).enough && A.peakHours(thin, 6).hours.length === 0);
  const nine = hours({ 7: 3, 8: 2, 9: 2, 17: 2 });
  ok('peakHours: nine commands are still too few (the least is ten)', !A.peakHours(nine, 9).enough && A.peakHours(hours({ 7: 4, 8: 2, 9: 2, 17: 2 }), 10).enough);
  ok('peakHours: when every hour has one command there is no peak at all', !A.peakHours(hours({ 7: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1, 13: 1, 14: 1, 15: 1, 16: 1 }), 10).enough);
  const flat = hours({ 1: 2, 5: 2, 9: 2, 13: 2, 17: 2, 21: 2 });
  const pf = A.peakHours(flat, sum(flat));
  ok('peakHours: more than two separate peaks: the commands are spread over the day, no peak is named', pf.enough && pf.spread && pf.hours.length === 0, JSON.stringify(pf));
  const late = hours({ 23: 7, 0: 7, 12: 2 });
  const pl = A.peakHours(late, sum(late));
  ok('peakHours: 23:00 is a range that ends at 00:00 (and midnight is a range of its own: the hours do not wrap)', pl.enough && pl.ranges.map((r) => r.join('-')).join() === '0-1,23-24', JSON.stringify(pl));
}

// ------------------------------------------------------------------------------------------------ what is wrong with the accessory
{
  const mod = (list) => A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 9, 7, 0) }], interfaceLogs: list }, USERS, NOW);
  const H = 3600000;
  const none = mod([{ type: 'connect', time: NOW - H }]);
  ok('healthTone: nothing is "none"', ['restart', 'wifi', 'error', 'bus'].every((k) => A.healthTone(none, k) === 'none') && A.attention(none).length === 0);
  const old = mod([{ type: 'wifi loss', time: NOW - 30 * H }, { type: 'error', time: NOW - 26 * H }, { type: 'boot', time: NOW - 40 * H }, { type: 'T4 device not found', time: NOW - 50 * H }]);
  ok('healthTone: what is older than 24 hours is a note (calm), never amber', ['restart', 'wifi', 'error', 'bus'].every((k) => A.healthTone(old, k) === 'note') && A.attention(old).length === 0);
  const fresh = mod([{ type: 'wifi loss', time: NOW - 3 * H }, { type: 'wifi loss', time: NOW - 5 * H }, { type: 'error', time: NOW - H }, { type: 'boot', time: NOW - 20 * H }, { type: 'T4 device not found', time: NOW - 2 * H }]);
  ok('healthTone: in the last 24 hours it is amber, and an error is red', A.healthTone(fresh, 'wifi') === 'warn' && A.healthTone(fresh, 'restart') === 'warn' && A.healthTone(fresh, 'bus') === 'warn' && A.healthTone(fresh, 'error') === 'fail');
  ok('attention: the events of the last 24 hours, the worst first, with the time of the latest one', A.attention(fresh).map((w) => w.kind).join() === 'error,bus,wifi,restart' && A.attention(fresh)[0].level === 'fail' &&
    A.attention(fresh)[1].level === 'warn' && A.attention(fresh)[2].t === NOW - 3 * H && A.attention(fresh).map((w) => w.text).join('|') === 'Error reported|Gate controller lost|Wi-Fi lost|Accessory restarted');
  ok('healthTone: exactly 24 hours ago still counts, a minute more does not', A.healthTone(mod([{ type: 'wifi loss', time: NOW - 24 * H }]), 'wifi') === 'warn' && A.healthTone(mod([{ type: 'wifi loss', time: NOW - 24 * H - 60000 }]), 'wifi') === 'note');
  const start = A.analyze({ interfaceLogs: [{ type: 'Power ON', time: NOW - 3 * H }, { type: 'T4 device not found', time: NOW - 3 * H + 30000 }, { type: 'T4 device found', time: NOW - 3 * H + 31000 }] }, [], NOW);
  ok('attention: the gate controller that is not found while the accessory starts is no fault, the restart is shown', A.attention(start).map((w) => w.kind).join() === 'restart' && A.healthTone(start, 'bus') === 'none');
}

// ------------------------------------------------------------------------------------------------ the sheet as HTML
if (JSDOM) {
  const parse = (html) => new JSDOM('<!doctype html><body>' + html + '</body>').window.document;
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const sheet = (a, opts) => { const html = A.renderHtml(a, label, opts); return { html, doc: parse(html) }; };
  const heads = (doc) => Array.from(doc.querySelectorAll('.nx-act-h')).map((h) => ({ title: text(h.querySelector('span')), period: text(h.querySelector('small')) }));
  const tiles = (doc) => Array.from(doc.querySelectorAll('.nx-tile')).map((t) => ({ title: text(t.querySelector('small')), value: text(t.querySelector('b')), sub: text(t.querySelector('span')), cls: t.className }));
  const bars = (doc) => Array.from(doc.querySelectorAll('.nx-col')).map((c) => ({ nodata: c.classList.contains('nx-nodata'), partial: c.getAttribute('data-partial') === '1', today: c.classList.contains('nx-today'),
    label: c.querySelector('em') ? text(c.querySelector('em')) : null, zero: !!c.querySelector('.nx-zero') }));
  const who = (doc) => Array.from(doc.querySelectorAll('.nx-whos li')).map((l) => ({ name: text(l.querySelector('.nx-w-name')), n: Number(text(l.querySelector('b'))) }));

  // the order: what is blocked, what is wrong, four tiles, the latest events, the period, the charts, the accessory, where the data comes from
  {
    const blocked = A.analyze({ deviceLogs: LONG.res.deviceLogs.concat([{ source: BEN, type: 'MDBk', time: NOW - 600000 }]), interfaceLogs: LONG.res.interfaceLogs.concat([{ type: 'wifi loss', time: NOW - 7200000 }]) }, USERS, NOW);
    const s = sheet(blocked);
    const order = ['nx-act-block', 'nx-act-alert', 'nx-tiles', 'nx-tl', 'nx-scope', 'nx-bars', 'nx-whos', 'nx-hours', 'nx-facts', 'nx-act-about'];
    const at = order.map((c) => s.html.search(new RegExp('class="[^"]*\\b' + c + '\\b')));
    ok('order: block, trouble, tiles, latest events, period, per day, who, hours, accessory, about', at.every((x, i) => x > -1 && (i === 0 || x > at[i - 1])), JSON.stringify(at));
    ok('order: the answers come first: the tiles and the latest events are before every chart', s.html.indexOf('nx-tiles') < s.html.indexOf('nx-bars') && s.html.indexOf('class="nx-card nx-tl"') < s.html.indexOf('nx-bars'));
  }
  // every heading says which period it is about
  {
    const s = sheet(aLong), h = heads(s.doc);
    ok('headings: the week, the log of 20 days has the week and the fourteen days of the chart', h.map((x) => x.title + '|' + x.period).join() === 'Latest events|,Commands per day|last 7 days,Who|last 7 days,Busy hours|last 7 days,Accessory health|whole log, 20 days', JSON.stringify(h));
    const sa = sheet(aLong, { scope: 'all' }), ha = heads(sa.doc);
    ok('headings: the whole log says how long it is, and the chart per day says that it shows fourteen days', ha.map((x) => x.title + '|' + x.period).join() === 'Latest events|,Commands per day|last 14 days,Who|whole log, 20 days,Busy hours|whole log, 20 days,Accessory health|whole log, 20 days', JSON.stringify(ha));
    const sh = heads(sheet(aShort).doc);
    ok('headings: a log from this morning says that it is ten hours long (9:30)', sh.find((x) => x.title === 'Who') && sh.find((x) => x.title === 'Who').period === 'whole log, 10 hours', JSON.stringify(sh));
  }
  // the four tiles
  {
    const t = tiles(sheet(aLong).doc), cmdsWeek = LONG.cmds.filter((c) => startOfDay(c.t) >= startOfDay(addDays(NOW, -6))).length, cmdsToday = LONG.cmds.filter((c) => startOfDay(c.t) === startOfDay(NOW)).length;
    ok('tiles: last opened and closed (the time is the value, the day and who under it)', t[0].title === 'Last opened' && t[0].value === '07:40' && t[0].sub === 'today · Anna' && t[1].title === 'Last closed' && t[1].value === '07:42' && t[1].sub === 'today · Anna', JSON.stringify(t.slice(0, 2)));
    ok('tiles: the commands of today, and of the week with its name', t[2].title === 'Commands today' && t[2].value === String(cmdsToday) && t[2].sub === cmdsWeek + ' in the last 7 days', JSON.stringify(t[2]));
    ok('tiles: no obstruction: zero, calm, and the period in the title', t[3].title === 'Obstructions, 7 days' && t[3].value === '0' && t[3].sub === 'none reported' && !/nx-t-bad/.test(t[3].cls), JSON.stringify(t[3]));
    const none = tiles(sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 9, 8, 0) }], interfaceLogs: [{ type: 'Power ON', time: T(NOV, 9, 5, 0) }] }, USERS, NOW)).doc);
    ok('tiles: no closing in the log: a dash, and since when the log is there (no data is not "never")', none[1].value === '–' && none[1].sub === 'none since today 05:00' && none[0].value === '08:00', JSON.stringify(none[1]));
    const wk = tiles(sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 2, 8, 0) }, { source: 'busT4', type: 'obstruction', time: T(NOV, 5, 17, 52) }, { source: ANNA, type: 'close', time: T(OCT, 30, 8, 0) }] }, USERS, NOW)).doc);
    ok('tiles: an obstruction of three days ago is counted in the week, with its day, and is not red', wk[3].value === '1' && wk[3].sub === 'latest Thu 17:52' && !/nx-t-bad/.test(wk[3].cls) && wk[1].sub === '30 Oct · Anna' || wk[1].sub === 'Fri · Anna', JSON.stringify(wk));
    const red = tiles(sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 8, 8, 0) }, { source: 'busT4', type: 'obstruction', time: NOW - 3600000 }, { source: ANNA, type: 'close', time: T(OCT, 30, 8, 0) }] }, USERS, NOW)).doc);
    ok('tiles: an obstruction in the last 24 hours is red', /nx-t-bad/.test(red[3].cls) && red[3].sub === 'latest today 13:30', JSON.stringify(red[3]));
  }
  // no data is not zero
  {
    const s = sheet(aMid, { scope: 'all' }), b = bars(s.doc);
    ok('per day: fourteen columns; the two days before the log began are drawn as no data, without a number', b.length === 14 && b.slice(0, 2).every((c) => c.nodata && c.label === null && !c.zero) && b.filter((c) => c.nodata).length === 2, JSON.stringify(b.slice(0, 3)));
    ok('per day: the first day of the log is a minimum ("+"), the days after it have their number', b[2].partial && /^\d+\+$/.test(b[2].label) && b.slice(3).every((c) => /^\d+$/.test(c.label)), JSON.stringify(b.slice(2, 5)));
    const qs = sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(OCT, 30, 8, 0) }, { source: ANNA, type: 'close', time: T(NOV, 5, 8, 0) }], interfaceLogs: [{ type: 'Power ON', time: T(OCT, 29, 5, 0) }] }, USERS, NOW), { scope: 'all' });
    ok('per day: a quiet day is a zero, drawn as a line with the number 0 (the first day: "0+"; no data has neither)', bars(qs.doc).filter((c) => c.label === '0' && c.zero).length === 9 && bars(qs.doc).filter((c) => c.partial && c.label === '0+' && c.zero).length === 1 &&
      bars(qs.doc).filter((c) => c.nodata).every((c) => c.label === null && !c.zero));
    ok('per day: today is marked, and the bars have the numbers of the commands', b[13].today && Number(b[13].label) === MID.cmds.filter((c) => startOfDay(c.t) === startOfDay(NOW)).length);
    ok('per day: the legend has "No data" because there are days without data; the note says where the log begins', /nx-lg-none/.test(s.html) && /The log begins 29 Oct 05:00/.test(s.html) && /not the same as a quiet day/.test(s.html) && /with a \+\) is a minimum/.test(s.html));
    const sl = sheet(aLong, { scope: 'all' });
    ok('per day: with a log of 20 days there is nothing without data, so no "No data" in the legend and no note', !/nx-lg-none/.test(sl.html) && !/nx-nodata/.test(sl.html) && !/data-partial/.test(sl.html) && bars(sl.doc).length === 14);
    const s7 = sheet(aMid), b7 = bars(s7.doc);
    ok('per day: the week has seven columns, all with their number', b7.length === 7 && b7.every((c) => !c.nodata && c.label !== null) && !/nx-lg-none/.test(s7.html));
    const ssh = sheet(aShort);
    ok('per day: a log from this morning has no other day to compare: no chart, and it says so', !/nx-bars/.test(ssh.html) && /The log begins today at 05:00: there is no other day to compare yet/.test(ssh.html));
  }
  // the chart can be read without the picture (and the parts that only draw are hidden from a screen reader)
  {
    const s = sheet(aMid, { scope: 'all' });
    const img = s.doc.querySelector('.nx-bars');
    ok('chart per day: one image with a label that has every day: "no data" for the days before the log, "at least" for the first one', img.getAttribute('role') === 'img' && /last 14 days: Tue 27 Oct no data, Wed 28 Oct no data, Thu 29 Oct at least \d+, /.test(img.getAttribute('aria-label')) &&
      /Mon 9 Nov \d+$/.test(img.getAttribute('aria-label')), img.getAttribute('aria-label'));
    ok('chart per day: the axis and the legend are hidden from a screen reader (the label says it all)', s.doc.querySelector('.nx-axis').getAttribute('aria-hidden') === 'true' && s.doc.querySelector('.nx-legend').getAttribute('aria-hidden') === 'true' && s.doc.querySelector('.nx-axis-h').getAttribute('aria-hidden') === 'true');
    const ax = Array.from(s.doc.querySelectorAll('.nx-axis:not(.nx-axis-h) small')).map((x) => x.firstChild.textContent + '/' + text(x.querySelector('span')));
    ok('chart per day: two letters per weekday (no "T W T F S S M"), the date only under every Monday and under today', ax.length === 14 && ax[0] === 'Tu/' && ax[1] === 'We/' && ax[3] === 'Fr/' && ax[6] === 'Mo/2' && ax[13] === 'Mo/9' && ax.filter((x) => /\/\d/.test(x)).length === 2, ax.join(' '));
    ok('chart per day: today has the class of the axis', /<small class="nx-today">Mo/.test(s.html));
    ok('chart hours: one image with the busiest hours in its label; the axis has 0, 6, 12 and 18 (no 24)', s.doc.querySelector('.nx-hours').getAttribute('role') === 'img' && /^Commands by hour of the day, whole log, 11 days\. Busiest: /.test(s.doc.querySelector('.nx-hours').getAttribute('aria-label')) &&
      Array.from(s.doc.querySelectorAll('.nx-axis-h small')).map((x) => text(x)).join() === '0,6,12,18');
  }
  // the busiest hours: ties, ranges, thin data
  {
    const busy = (spec) => { const dev = []; Object.keys(spec).forEach((h) => { for (let i = 0; i < spec[h]; i++) dev.push({ source: ANNA, type: i % 2 ? 'close' : 'open', time: T(NOV, 5 + (i % 4), Number(h), 10 + i) }); }); return A.analyze({ deviceLogs: dev, interfaceLogs: [{ type: 'Power ON', time: T(NOV, 2, 3, 0) }] }, USERS, NOW); };
    const s = sheet(busy({ 7: 4, 8: 4, 17: 3, 9: 1 }), { scope: 'all' }), peaks = Array.from(s.doc.querySelectorAll('.nx-hours i.nx-peak'));
    ok('hours: both of the tied hours are marked, each with its number, and named as one range', peaks.length === 2 && peaks.every((p) => text(p) === '4') && /Busiest: 07:00–09:00 \(4 commands in each hour\)/.test(s.html), s.html.slice(s.html.indexOf('nx-hours'), s.html.indexOf('nx-hours') + 200));
    ok('hours: 12 commands are enough to name them', !/Too few commands/.test(s.html));
    const t = sheet(busy({ 7: 3, 17: 3 }), { scope: 'all' });
    ok('hours: six commands: no hour is marked and it says so', !/nx-peak/.test(t.html) && /Too few commands \(6\) to say which hours are busiest/.test(t.html) && !/Busiest:/.test(t.html));
    const two = sheet(busy({ 7: 5, 17: 5, 12: 1, 13: 1 }), { scope: 'all' });
    ok('hours: two peaks that are far apart are named both', /Busiest: 07:00–08:00 and 17:00–18:00 \(5 commands in each hour\)/.test(two.html) && two.doc.querySelectorAll('.nx-hours i.nx-peak').length === 2);
    const one = sheet(busy({ 7: 8, 17: 3, 12: 1 }), { scope: 'all' });
    ok('hours: one hour: its range and "commands" without "in each hour"', /Busiest: 07:00–08:00 \(8 commands\)\./.test(one.html) && one.doc.querySelectorAll('.nx-hours i.nx-peak').length === 1);
    const spread = sheet(busy({ 1: 2, 5: 2, 9: 2, 13: 2, 17: 2, 21: 2 }), { scope: 'all' });
    ok('hours: a day with many peaks has none (no hour is highlighted)', /No clear peak/.test(spread.html) && !/nx-peak/.test(spread.html));
    const night = sheet(busy({ 23: 5, 7: 3, 12: 2 }), { scope: 'all' });
    ok('hours: 23:00 ends at 00:00', /Busiest: 23:00–00:00 \(5 commands\)/.test(night.html));
  }
  // the numbers agree (one period, the same everywhere)
  {
    const total = (arr) => arr.reduce((s, x) => s + x, 0);
    const s = sheet(aLong), t = tiles(s.doc), week = Number(/^(\d+) in the last 7 days$/.exec(t[2].sub)[1]);
    ok('reconcile (the week): the tile, the bars, the people and the hours name the same number of commands', total(bars(s.doc).map((c) => Number(c.label))) === week && total(who(s.doc).map((w) => w.n)) === week &&
      total(A.windowStats(aLong, A.statWindow(aLong, '7')).hours) === week, week + ' ' + total(bars(s.doc).map((c) => Number(c.label))) + ' ' + total(who(s.doc).map((w) => w.n)));
    const sa = sheet(aLong, { scope: 'all' });
    ok('reconcile (the whole log): the people add up to all the commands, which is more than the week', total(who(sa.doc).map((w) => w.n)) === LONG.cmds.length && LONG.cmds.length > week);
    const sm = sheet(aMid), tm = tiles(sm.doc);
    ok('reconcile (a log of 12 days): the week agrees too', total(bars(sm.doc).map((c) => Number(c.label))) === Number(/^(\d+) in/.exec(tm[2].sub)[1]) && total(who(sm.doc).map((w) => w.n)) === Number(/^(\d+) in/.exec(tm[2].sub)[1]));
  }
  // the words
  {
    const s = sheet(aLong, { all: false });
    ok('latest events: six rows and "Show all N events" (not "Show N events")', s.doc.querySelectorAll('.nx-tl-row').length === 6 && new RegExp('>Show all ' + aLong.events.length + ' events<').test(s.html), s.html.match(/Show[^<]*/));
    ok('who: the gate controller is "At the gate" with its explanation, never "Gate controller"', !/Gate controller</.test(s.html.replace(/Gate controller lost/g, '')) && /At the gate/.test(s.html) && who(s.doc).length > 0);
    const g = sheet(A.analyze({ deviceLogs: [{ source: 'busT4', type: 'open', time: T(NOV, 9, 9, 0) }, { source: 'busT4', type: 'close', time: T(NOV, 9, 9, 5) }, { source: 'X-123456789', type: 'open', time: T(NOV, 8, 9, 0) }] }, USERS, NOW), { scope: 'all' });
    const names = Array.from(g.doc.querySelectorAll('.nx-w-name')).map((n) => text(n)).sort();
    ok('who: "At the gate remote or switch" and "Another phone" (not "Other (X-123456)")', names.join('|') === 'Another phone|At the gate remote or switch' && !/Other \(/.test(g.html), names.join('|'));
    ok('latest events: "At the gate" and "Another phone" in the rows too', /nx-tl-who">At the gate</.test(g.html) && /nx-tl-who">Another phone</.test(g.html));
    const rows = Array.from(s.doc.querySelectorAll('.nx-facts .nx-fact')).map((r) => text(r.querySelector('b')) + ': ' + text(r.querySelector('div > span')));
    ok('accessory: "Latest: ..." and "None in the log" (not "last yesterday 13:05")', rows.every((r) => /: (Latest: |None in the log|Only while)/.test(r)) && !/last (yesterday|today)/.test(s.html), rows.join(' | '));
    ok('the title of the sheet and of every part: no heading says only "Who" or "History"', !/>History</.test(s.html) && !/<h3 class="nx-act-h">Who</.test(s.html));
  }
  // amber only when something is wrong
  {
    const calm = sheet(aLong);
    ok('calm: nothing in the last 24 hours: no strip, no amber row (a restart and Wi-Fi drops of a week ago are calm)', !/nx-act-alert/.test(calm.html) && !/nx-s-warn|nx-s-fail/.test(calm.html) && !/nx-t-bad/.test(calm.html));
    const rows = calm.doc.querySelectorAll('.nx-fact.nx-s-none, .nx-fact.nx-s-note');
    ok('calm: the rows of the accessory are "none" (a tick) or "note" (its own icon), none is amber', rows.length === 4 && calm.doc.querySelectorAll('.nx-fact.nx-s-none .nx-i-done').length === calm.doc.querySelectorAll('.nx-fact.nx-s-none').length);
    const bad = sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 9, 7, 0) }], interfaceLogs: [{ type: 'wifi loss', time: NOW - 3600000 }, { type: 'error', time: NOW - 7200000 }, { type: 'T4 device not found', time: NOW - 5 * 3600000 }] }, USERS, NOW));
    const items = Array.from(bad.doc.querySelectorAll('.nx-act-alert li')).map((li) => text(li));
    ok('trouble: the strip lists what happened in the last 24 hours, the worst first, with the time', items.join('|') === 'Error reported today 12:30|Gate controller lost today 09:30|Wi-Fi lost today 13:30', items.join('|'));
    ok('trouble: red when one of them is an error; the rows below say it with their colors', /nx-act-alert nx-alert-bad/.test(bad.html) && bad.doc.querySelectorAll('.nx-fact.nx-s-fail').length === 1 && bad.doc.querySelectorAll('.nx-fact.nx-s-warn').length === 2);
    const amber = sheet(A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: T(NOV, 9, 7, 0) }], interfaceLogs: [{ type: 'wifi loss', time: NOW - 3600000 }] }, USERS, NOW));
    ok('trouble: amber without an error', /nx-act-alert"/.test(amber.html) && !/nx-alert-bad/.test(amber.html));
  }
  // the icons for a block
  {
    const free = sheet(A.analyze({ deviceLogs: [{ source: BEN, type: 'MDEw', time: T(NOV, 8, 9, 0) }] }, USERS, NOW)), blocked = sheet(A.analyze({ deviceLogs: [{ source: BEN, type: 'MDBk', time: T(NOV, 8, 9, 0) }] }, USERS, NOW));
    ok('block: not blocked is a quiet line with an open lock, not a card; blocked is the amber card with the closed lock', /nx-act-block nx-act-free/.test(free.html) && /nx-free-icon/.test(free.html) && !/nx-card nx-act-block/.test(free.html) &&
      /nx-card nx-act-block nx-blocked/.test(blocked.html) && /nx-block-icon/.test(blocked.html) && !/nx-free-icon/.test(blocked.html));
    ok('block: the line says what it knows (the last Release, when, by whom)', /Not blocked, as far as the log shows/.test(free.html) && /last Release: yesterday 09:00 · Release · Ben/.test(free.html), free.html.slice(0, 300));
    ok('block: nothing in the log about blocking: nothing is said', !/nx-act-block/.test(sheet(aLong).html));
  }
  // the words of a Block are the constants of the gate screen (NX_WORDS, at the top of the file): the pill under the state and the card of the sheet say the same
  {
    const load = (from, to) => { const m = { exports: {} }; new Function('module', 'exports', SRC.replace(from, to))(m, m.exports); return m.exports; };
    const logs = { deviceLogs: [{ source: BEN, type: 'MDBk', time: T(NOV, 8, 9, 0) }] };
    const logsRestart = { deviceLogs: [{ source: BEN, type: 'MDBk', time: T(NOV, 8, 9, 0) }], interfaceLogs: [{ type: 'Power ON', time: T(NOV, 8, 10, 0) }] };
    const b = A.analyze(logs, USERS, NOW), bu = A.analyze(logsRestart, USERS, NOW);
    ok('NX_WORDS: the card uses the words of the gate screen (the constants of the pill)', A.NX_WORDS && A.NX_WORDS.blocked === 'Blocked' && A.NX_WORDS.maybeBlocked === 'Maybe blocked' &&
      /<b>Blocked<\/b>/.test(A.renderHtml(b, label)) && /<b>Maybe blocked<\/b>/.test(A.renderHtml(bu, label)));
    const B = load("blocked: 'Blocked',", "blocked: 'Blocked now',");
    ok('NX_WORDS: another word in the constants is the word in the card', /<b>Blocked now<\/b>/.test(B.renderHtml(B.analyze(logs, USERS, NOW), label)));
    const C = load("maybeBlocked: 'Maybe blocked',", "maybe: 'Perhaps blocked',");
    ok('NX_WORDS: the key "maybe" works as well', /<b>Perhaps blocked<\/b>/.test(C.renderHtml(C.analyze(logsRestart, USERS, NOW), label)));
    const D = load("maybeBlocked: 'Maybe blocked',", "");
    ok('NX_WORDS: a missing key falls back to the literal word', D.NX_WORDS.maybeBlocked === undefined && /<b>Maybe blocked<\/b>/.test(D.renderHtml(D.analyze(logsRestart, USERS, NOW), label)));
  }
  // folded: where the data comes from
  {
    const s = sheet(aMid);
    ok('about: folded in a <details> (not open), says where the data comes from, how far back it goes and how many events', s.doc.querySelector('details.nx-act-about') && !s.doc.querySelector('details.nx-act-about').hasAttribute('open') &&
      new RegExp('It keeps only the latest events: ' + aMid.span.count + ' events, from 29 Oct 05:00 \\(11 days\\)').test(text(s.doc.querySelector('.nx-act-about'))), text(s.doc.querySelector('.nx-act-about')).slice(0, 300));
    ok('about: says what "At the gate" is', /“At the gate” is the gate controller moving the gate without a command/.test(s.html));
  }
  // robustness: an escape of the names, strange values, the empty log
  {
    const evil = A.analyze({ deviceLogs: [{ source: 'X-1', type: '<img src=x onerror=alert(1)>', time: T(NOV, 9, 9, 0) }, { source: 'Y', type: 'open', time: T(NOV, 9, 9, 1) }] }, [{ controllerID: 'X-1', username: '<b>"Mallory"</b>' }], NOW);
    const e = A.renderHtml(evil, (t) => t, { scope: 'all' });
    ok('names and types are still escaped in the new parts (tiles, who, rows, labels)', e.indexOf('<img') === -1 && e.indexOf('<b>"Mallory"') === -1 && e.indexOf('&lt;b&gt;&quot;Mallory&quot;&lt;/b&gt;') > -1 && /Another phone/.test(e));
    const nolog = A.renderHtml(A.analyze({ deviceLogs: [], interfaceLogs: [] }, [], NOW), label);
    ok('the empty log says what to do and shows no tiles or charts', /No events yet/.test(nolog) && !/nx-tile|nx-bars|nx-hours/.test(nolog));
    let thrown = null; try { A.renderHtml(A.analyze({ deviceLogs: [{ source: {}, type: { a: 1 }, time: NOW - 1000 }, { type: 'open', time: String(NOW - 3000) }], interfaceLogs: [{ type: { x: 1 }, time: NOW }] }, USERS, NOW), label, { scope: 'all' }); } catch (x) { thrown = x; }
    ok('strange values in the log do not throw', thrown === null, String(thrown));
    const future = A.analyze({ deviceLogs: [{ source: ANNA, type: 'open', time: NOW + 3600000 }] }, USERS, NOW);
    let t2 = null, h2 = ''; try { h2 = A.renderHtml(future, label); } catch (x) { t2 = x; }
    ok('a clock that is an hour ahead does not break it ("just now")', t2 === null && /just now|today/.test(h2), String(t2));
  }
} else {
  console.log('   skipped: the HTML of the sheet is not tested without jsdom');
}

// ------------------------------------------------------------------------------------------------ the colors of the charts (the built css)
{
  const bare = CSS;
  const NAMES = ((bare.match(/^\/\* Generated by build-tokens\.mjs: \d+ palettes \(([^)]*)\)/) || [])[1] || '').split(';').map((x) => x.replace(/, the default/, '').trim()).filter(Boolean);
  const DEFAULT = NAMES[0];
  const blockOf = (selector) => { const i = bare.indexOf(selector + ' {'); if (i < 0) return null; const body = bare.slice(i + selector.length + 2, bare.indexOf('}', i)); const m = new Map(); for (const x of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) m.set(x[1], x[2].trim()); return m; };
  const sel = (name, kind) => { const root = name === DEFAULT ? ':root' : ':root[data-nx-palette="' + name + '"]'; if (kind === 'light') return root; return name === DEFAULT ? ':root[data-nx-theme="dark"]' : root + '[data-nx-theme="dark"]'; };
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const M = '--md-sys-color-';
  const rule = (selector) => { const m = new RegExp('(?:^|\\})\\s*html:root body\\[data-ng-app\\] ' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm').exec(bare); return m ? m[1] : null; };
  const low = [], same = [], quiet = [];
  for (const n of NAMES) for (const k of ['light', 'dark']) {
    const b = blockOf(sel(n, k)), g = (x) => b.get(M + x);
    // Open (solid) and Close (a light fill with an outline) differ in lightness, not only in hue: the fill of Close and the solid of Open (it was 1.01:1 before nx23)
    if (contrast(g('primary'), g('primary-container')) < 3) same.push(n + '/' + k);
    // the outline of Close and the solid of Open are seen on the card, and so is what is quiet (the hours without a peak, the hatching of Other): at least 3:1 (it was 1.46:1 and 1.75:1)
    if (contrast(g('primary'), g('surface-container')) < 3) low.push(n + '/' + k + ' primary');
    if (contrast(g('outline'), g('surface-container')) < 3) quiet.push(n + '/' + k + ' outline ' + contrast(g('outline'), g('surface-container')).toFixed(2));
  }
  ok('chart colors: Open (solid) and the fill of Close differ in lightness by at least 3:1 in all ' + NAMES.length + ' palettes, light and dark (they were 1.01:1)', NAMES.length === 7 && same.length === 0, same.join(', '));
  ok('chart colors: Open and the outline of Close are at least 3:1 on the card', low.length === 0, low.join(', '));
  ok('chart colors: what is quiet (hours without a peak, the hatching of Other, a day without commands) is the outline color: at least 3:1 on the card', quiet.length === 0 && /--nx-act-quiet:\s*var\(--md-sys-color-outline\)/.test(bare), quiet.join(', '));
  const open = rule('.nx-b-open'), close = rule('.nx-b-close'), rest = rule('.nx-b-rest');
  ok('chart: Open is solid, Close is hollow (a light fill and an outline), Other is hatched: three textures, so they differ in greyscale',
    /background:\s*var\(--md-sys-color-primary\)/.test(open || '') && /background:\s*var\(--md-sys-color-primary-container\)/.test(close || '') && /box-shadow:\s*inset 0 0 0 2px var\(--md-sys-color-primary\)/.test(close || '') && /repeating-linear-gradient/.test(rest || ''), JSON.stringify([open, close, rest]));
  ok('chart: no series uses the secondary color any more (it had the same lightness as the primary one)', !/secondary/.test((open || '') + (close || '') + (rest || '')));
  ok('chart: the hours without a peak and the zero days are not drawn with the outline-variant (1.46:1)', !/outline-variant/.test(rule('.nx-hours i') || '') && !/outline-variant/.test(rule('.nx-stack.nx-zero') || ''));
  ok('chart: a day without data is a dashed box, and the legend has the same swatch', /dashed/.test(rule('.nx-nodata > .nx-stack') || '') && /dashed/.test(rule('.nx-lg-none:before') || ''));
  ok('chart: the history dots follow the chart: Open solid, Close a ring', /background:\s*var\(--md-sys-color-primary\)/.test(rule('.nx-k-open .nx-tl-what:before') || '') && /box-shadow:\s*inset 0 0 0 2px var\(--md-sys-color-primary\)/.test(rule('.nx-k-close .nx-tl-what:before') || ''));
  // the sheet: a column, so that the footer is at the bottom of a short sheet (empty, error and loading states); the progress under the handle; the title without the padding of the app's h2
  ok('sheet: a column with a body that takes what is left, so that the footer is pinned', /flex-direction:\s*column/.test(rule('.nx-sheet.nx-act') || '') && /flex:\s*1 0 auto/.test(rule('.nx-act > #nx-act-body') || ''));
  ok('sheet: the title has no padding (the h2 of the app has 16 px at the left) and the progress runs under the handle', /padding:\s*0;/.test(rule('.nx-act-title') || '') && /top:\s*18px/.test(rule('.nx-act .nx-progress.m3e-progress') || ''));
  ok('sheet: what scrolls under the footer fades out (a gradient above it)', /linear-gradient\(to bottom, transparent/.test(rule('.nx-act .nx-footer:before') || ''));
  ok('icons: a lock-open for "not blocked" is in the css and used by the line', /--nx-i-lock-open:\s*url\(/.test(bare) && /var\(--nx-i-lock-open\)/.test(rule('.nx-free-icon') || ''));
  ok('amber and red are only used for what is recent: the alert strip and the tile have their rules, the plain tiles do not use warn colors', /nx-warn-container/.test(rule('.nx-card.nx-act-alert') || '') && /error-container/.test(rule('.nx-card.nx-act-alert.nx-alert-bad') || '') && !/warn/.test(rule('.nx-tile') || '') && !/nx-t-warn/.test(bare));
}

// ------------------------------------------------------------------------------------------------ the sheet in a browser (jsdom)
(async function () {
  if (!JSDOM) { finish(); return; }
  const DETAIL = 'tabsController.favorites-device-detail';
  async function environment(scen) {
    scen = scen || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.Date.now = () => NOW;
    w.__nxActivityPrefetchMs = 100000;
    w.__nxActivityTimeoutMs = scen.timeoutMs != null ? scen.timeoutMs : 400;
    if (scen.slowMs != null) w.__nxActivitySlowMs = scen.slowMs;
    const logs = [], toasts = [], copied = [], calls = { logs: 0 };
    const services = { $translate: { instant: (k) => (scen.names && scen.names[k]) || k } };
    const inj = { has: (n) => n in services, get: (n) => services[n] };
    const NHK = {
      logs() { calls.logs++; return scen.hang ? new Promise(() => {}) : scen.logsErr !== undefined ? Promise.reject(scen.logsErr) : Promise.resolve(scen.logs); },
      pairings() { return Promise.resolve({ activeUsers: USERS, waitingUsers: [] }); }
    };
    const dev = { mac: '00:0B:6C:AA:BB:CC', homeId: 1, description: 'AABBCC', name: 'NiceIT4WIFIAABBCC', reachable: true, pairingUsername: 'Anna', properties: [{ value: 'closed' }, { value: '0' }], automations: [{ id: '1', type: 'sliding', properties: [] }] };
    const nx = { opened: 0, diagnosed: 0 };
    if (scen.NX) w.NX = { open() { nx.opened++; }, close() {}, diagnose() { nx.diagnosed++; } };
    w.eval(SRC);
    const act = w.__nxActivity({ inj, $rootScope: { $on() {}, $evalAsync() {} }, NHK, log: (...a) => logs.push(a.join(' ')), toast: (m) => toasts.push(m), liveDevice: () => dev, findDevice: () => dev, copy: (t) => copied.push(t) });
    return { w, dev, act, logs, toasts, copied, calls, nx, document: w.document,
      sheet: () => w.document.getElementById('nx-activity'), body: () => w.document.getElementById('nx-act-body'),
      click: (el, detail) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: detail === undefined ? 1 : detail })) };
  }

  {
    const env = await environment({ logs: MID.res });
    env.act.open(env.dev); await sleep(60);
    const q = (s) => env.body().querySelector(s), qa = (s) => Array.from(env.body().querySelectorAll(s));
    ok('sheet: it is a column when it is open (display: flex), so that the footer sits at the bottom', env.sheet().style.display === 'flex');
    ok('sheet: the button that dismisses it says "Done" (the gate has a "Close")', /^Done$/.test(env.sheet().querySelector('.nx-act-close').textContent) && !/Close/.test(env.sheet().querySelector('.nx-footer').textContent));
    ok('sheet: under the title: the events and how long the log is', /^AABBCC · \d+ events over 11 days$/.test(env.document.getElementById('nx-act-sub').textContent), env.document.getElementById('nx-act-sub').textContent);
    ok('sheet: a log of 11 days has the period switch, the week is selected, and there are seven columns', qa('.nx-scope button').length === 2 && qa('.nx-scope button').map((b) => b.getAttribute('aria-pressed')).join() === 'true,false' &&
      qa('.nx-scope button').map((b) => b.textContent).join('|') === 'Last 7 days|Whole log · 11 days' && qa('.nx-col').length === 7 && q('.nx-scope').getAttribute('role') === 'group');
    const week = q('.nx-tile.nx-t-count span').textContent;
    // a tap (a click with a detail) does not move the focus (it would show the ring of the keyboard)
    env.click(qa('.nx-scope button')[1], 1);
    ok('period: "Whole log" shows fourteen columns, the days before the log as no data, and the headings say so', qa('.nx-col').length === 14 && qa('.nx-nodata').length === 2 && qa('.nx-scope button').map((b) => b.getAttribute('aria-pressed')).join() === 'false,true' &&
      /Who/.test(env.body().textContent) && /whole log, 11 days/.test(q('.nx-whos').previousSibling.textContent), env.body().textContent.slice(0, 80));
    ok('period: the tiles do not change (they say their own period: today, the week)', q('.nx-tile.nx-t-count span').textContent === week);
    ok('period: after a tap the focus is not forced onto the button', env.document.activeElement !== qa('.nx-scope button')[1]);
    // a key (a click without a detail) keeps the focus on the button, which is a new element
    env.click(qa('.nx-scope button')[0], 0);
    ok('period: back to the week: seven columns; after a key the focus is on the selected button', qa('.nx-col').length === 7 && env.document.activeElement === qa('.nx-scope button')[0] && qa('.nx-scope button')[0].getAttribute('aria-pressed') === 'true');
    env.click(qa('.nx-scope button')[1], 1);
    env.act.close(); await sleep(450); env.act.open(env.dev); await sleep(60);
    ok('period: opening the sheet again starts with the week', qa('.nx-col').length === 7 && qa('.nx-scope button')[0].getAttribute('aria-pressed') === 'true');
  }
  {
    const env = await environment({ logs: SHORT.res });
    env.act.open(env.dev); await sleep(60);
    ok('sheet: a log from this morning has no period switch (there is only the whole log)', env.body().querySelectorAll('.nx-scope').length === 0 && /whole log, 10 hours/.test(env.body().textContent));
    ok('sheet: ...and its subtitle says "over 10 hours"', /events over 10 hours$/.test(env.document.getElementById('nx-act-sub').textContent), env.document.getElementById('nx-act-sub').textContent);
  }
  {
    // show all and show less
    const env = await environment({ logs: LONG.res });
    env.act.open(env.dev); await sleep(60);
    const rows = () => env.body().querySelectorAll('.nx-tl-row').length;
    ok('latest events: six, and "Show all"', rows() === 6 && !!env.body().querySelector('.nx-act-all') && !env.body().querySelector('.nx-act-less') && /Latest events/.test(env.body().textContent));
    env.click(env.body().querySelector('.nx-act-all'));
    ok('show all: every event up to 300, the heading says "All events" (or the latest 300), and there is a way back', (rows() === aLong.events.length || rows() === 300) && !!env.body().querySelector('.nx-act-less') && !env.body().querySelector('.nx-act-all'));
    env.click(env.body().querySelector('.nx-act-less'));
    ok('show less: the six latest again', rows() === 6 && !!env.body().querySelector('.nx-act-all'));
  }
  {
    // the empty log: no copy button when there is nothing at all; with entries that have no usable time it can be copied (that is when it is needed)
    const env = await environment({ logs: { deviceLogs: [], interfaceLogs: [] } });
    env.act.open(env.dev); await sleep(60);
    ok('empty: says what to do, and there is nothing to copy', /No events yet/.test(env.body().textContent) && env.sheet().querySelector('.nx-more').style.display === 'none');
    const env2 = await environment({ logs: { deviceLogs: [{ source: ANNA, type: 'open', time: 0 }], interfaceLogs: [] } });
    env2.act.open(env2.dev); await sleep(60);
    ok('empty: entries without a usable time: the same message, and the raw log can be copied', /No events yet/.test(env2.body().textContent) && env2.sheet().querySelector('.nx-more').style.display === '');
  }
  {
    // an error: the cause in one sentence, the way out, the details folded; a message of the system is not shown
    const env = await environment({ logsErr: { code: 3, message: 'java.net.SocketTimeoutException: connect timed out' }, names: { 'NHK_ERROR-3': 'The connection with the Accessory is not valid' }, NX: true });
    env.act.open(env.dev); await sleep(60);
    const card = env.body().querySelector('.nx-act-error');
    ok('error: the card says what happened in one sentence (the words of the app for the code), as an alert', card.getAttribute('role') === 'alert' && /Could not read the history/.test(card.querySelector('b').textContent) &&
      card.querySelector(':scope > span').textContent === 'The connection with the Accessory is not valid');
    ok('error: the message of the system is not in the card, only in the folded technical details', !/java\.net/.test(card.querySelector(':scope > span').textContent) && card.querySelector('details.nx-act-tech') && !card.querySelector('details').hasAttribute('open') &&
      /code 3/.test(card.querySelector('pre').textContent) && /SocketTimeoutException/.test(card.querySelector('pre').textContent));
    ok('error: two ways out: "Try again" and "Open connection status"', !!card.querySelector('.nx-act-retry') && /Open connection status/.test(card.querySelector('.nx-act-status').textContent) && card.querySelectorAll('button').length === 2);
    ok('error: nothing to copy, and the LOG has the exception', env.sheet().querySelector('.nx-more').style.display === 'none' && env.logs.some((l) => /could not read the log/.test(l) && /SocketTimeoutException/.test(l)));
    env.click(card.querySelector('.nx-act-status'));
    ok('error: "Open connection status" closes this sheet, opens the status sheet and starts its diagnosis', !env.act.isOpen() && env.nx.opened === 1 && env.nx.diagnosed === 1);
    const e2 = await environment({ logsErr: 'refused' });
    e2.act.open(e2.dev); await sleep(60);
    ok('error: a plain text is a detail, and the cause is "The accessory did not answer."; without a status sheet there is no button for it', e2.body().querySelector('.nx-act-error > span').textContent === 'The accessory did not answer.' &&
      /refused/.test(e2.body().querySelector('pre').textContent) && !e2.body().querySelector('.nx-act-status') && !!e2.body().querySelector('.nx-act-retry'));
    const e3 = await environment({ logsErr: { code: 7 } });
    e3.act.open(e3.dev); await sleep(60);
    ok('error: a code that the app has no words for: the same cause, the code in the details', e3.body().querySelector('.nx-act-error > span').textContent === 'The accessory did not answer.' && /code 7/.test(e3.body().querySelector('pre').textContent));
    const e4 = await environment({ logsErr: undefined, hang: true, timeoutMs: 150 });
    e4.act.open(e4.dev); await sleep(260);
    ok('error: after the time-out: "The accessory did not answer." and no code', e4.body().querySelector('.nx-act-error > span').textContent === 'The accessory did not answer.' && !/code/.test(e4.body().querySelector('pre') ? e4.body().querySelector('pre').textContent : ''), e4.body().textContent);
    // nx23 QA (screens): the app's text for a failure ends with a sentence for "a command that was just sent" (skin/copy/copy.json); reading a log is not one
    const e5 = await environment({ logsErr: { code: 3 }, names: { 'NHK_ERROR-3': 'The connection to the accessory was lost. If you just sent a command, it was not confirmed: check the gate, then try again.' } });
    e5.act.open(e5.dev); await sleep(60);
    ok('error: the cause is the sentence about the connection, without the part about a command that was just sent', e5.body().querySelector('.nx-act-error > span').textContent === 'The connection to the accessory was lost.', e5.body().querySelector('.nx-act-error > span').textContent);
  }
  {
    // slow: after a while without an answer the sheet says so; the hint goes when the answer comes
    const env = await environment({ hang: true, timeoutMs: 600, slowMs: 80 });
    env.act.open(env.dev); await sleep(30);
    ok('loading: it says that it is reading, with a status role', /Reading the accessory/.test(env.body().textContent) && env.body().querySelector('[role="status"]') && !/slow/.test(env.body().textContent) && env.sheet().classList.contains('nx-busy'));
    await sleep(120);
    ok('slow: after a moment: the accessory is slow to answer (and when it gives up, if that is known)', /Still waiting: the accessory is slow to answer\./.test(env.body().textContent) && /gives up after 1 seconds/.test(env.body().textContent) === false);
    await sleep(600);
    ok('slow: ...and then the error, without the hint', /Could not read the history/.test(env.body().textContent) && !/Still waiting/.test(env.body().textContent) && !env.sheet().classList.contains('nx-busy'));
    const fast = await environment({ logs: MID.res, slowMs: 50 });
    fast.act.open(fast.dev); await sleep(150);
    ok('slow: a reading that is quick never says it', !/Still waiting/.test(fast.body().textContent) && /Last opened/.test(fast.body().textContent));
    const keep = await environment({ logs: MID.res, slowMs: 20 });
    keep.act.open(keep.dev); await sleep(100);
    keep.act.refresh(keep.dev, () => {});
    keep.click(keep.sheet().querySelector('.nx-act-refresh')); await sleep(120);
    ok('slow: a refresh of data that is on screen keeps it (no hint, no blank)', /Last opened/.test(keep.body().textContent) && !/Still waiting/.test(keep.body().textContent));
  }
  {
    const env = await environment({ logs: MID.res, timeoutMs: 20000 });
    env.act.open(env.dev); await sleep(60);
    ok('sheet: the refresh button has a name, the sheet a name and the role of a dialog', env.sheet().querySelector('.nx-act-refresh').getAttribute('aria-label') === 'Refresh' && env.sheet().getAttribute('aria-label') === 'Activity' && env.sheet().getAttribute('role') === 'dialog');
    const hs = Array.from(env.body().querySelectorAll('.nx-act-h')).length;
    ok('sheet: every part has a heading (' + hs + '), and the charts, the accessory and the about text are all there', hs === 5 && !!env.body().querySelector('.nx-bars') && !!env.body().querySelector('.nx-hours') && !!env.body().querySelector('.nx-facts') && !!env.body().querySelector('details.nx-act-about'));
  }
  finish();
})();

function finish() {
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
}
