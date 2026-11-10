/* nx-activity.js: "Activity" (nx14): what the accessory remembers about the gate, shown in a sheet.
 *
 * The accessory keeps an event log. The app reads it for its own "Historian of events" page, in a small table, and leaves out the
 * events of the Wi-Fi module itself. This file reads the same log (NHKPluginService.logs: { interfaceLogs, deviceLogs }, every entry
 * { deviceId, source, type, time (epoch ms), idx, id }) and shows:
 *   - what was done, by whom and when (the commands that were given, and obstructions), per day, per hour and per user
 *   - the health of the Wi-Fi module (restarts, Wi-Fi drops, errors, the gate controller that was not found)
 *   - a short line on the accessory screen ("Close · today 14:12 · Anna") that opens the sheet
 * It is read-only: it only asks for what the app asks for on its own history page, and nothing leaves the phone.
 * What the log does not have: counters of maneuvers, motor current or temperature (the accessory's protocol has no such fields),
 * and door movements that were not caused by a command it saw. The log is limited in length; the sheet says how far back it goes.
 *
 * Part 1 is plain functions without a DOM (tested directly); part 2 is the sheet, built by nx-patch.js (window.__nxActivity(ctx)). */
(function () {
  'use strict';

  // ---- nx23 gate: begin
  // The words of the accessory screen that more than one place says (the pill under the state, the note, the card of the sheet): one set, English like
  // every text of the patches. The sheet takes them from here too, and keeps its own words only when this block is not there.
  var NX_WORDS = {
    blocked: 'Blocked',                  // the last Block command has not been followed by a Release (from the log: not a measurement)
    maybeBlocked: 'Maybe blocked',       // ... but the accessory restarted after it and forgot its log, so a Release since then would not show
    since: 'since',                      // "Blocked · since 06:27"
    unknown: 'Gate state unknown',       // nothing says what the gate does: "Not usable", or a state that nobody knows
    settled: 'Accessory says {state}; the log shows it finished.'    // the state was settled from the log (the accessory still reports a movement)
  };
  // ---- nx23 gate: end

  // ======================================================================== 1. the data, without a DOM
  var MIN_TIME = Date.UTC(2015, 0, 1);     // a module whose clock was never set reports 1970 or 2000: that is no time
  var DAY = 86400000;
  var MAX_EVENTS = 5000;                   // more than this is not read (the newest are kept)
  var ECHO_MS = 5000;                      // the gate controller repeats a command it was given within this time as a movement of its own
  var START_MS = 120000;                   // right after the accessory starts it cannot tell yet what the gate controller does: its reports are about the state
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // what a command type is: the door actions and the T4 codes of the accessory's secondary commands (as in the app's DEVICE_COMMAND_ texts)
  var KINDS = {
    open: ['open', 'MDAz', 'MDA1', 'MDA2', 'MDA3', 'MDBk', 'MDE5', 'MDE0', 'MDE3'],
    close: ['close', 'MDA0', 'MDBl', 'MDFh', 'MDE1', 'MDE4'],
    stop: ['stop', 'MDAy'],
    step: ['MDAx', 'MDBi', 'MDBj', 'MDEz', 'MDE2'],
    block: ['MDBm'],
    release: ['MDEw'],
    light: ['MDEx', 'MDEy'],
    obstruction: ['obstruction']
  };
  var KIND_OF = {};
  Object.keys(KINDS).forEach(function (k) { KINDS[k].forEach(function (code) { KIND_OF[code] = k; }); });
  var NAMES = {   // for when the app's own texts are not available
    open: 'Open', close: 'Close', stop: 'Stop', obstruction: 'Obstruction', MDAx: 'Step by step', MDBk: 'Open and Block', MDBl: 'Close and Block',
    MDBm: 'Block', MDEw: 'Release', MDE5: 'Release and Open', MDFh: 'Release and Close'
  };

  // the commands that block the automation, and those that release it (the T4 codes of "Open and Block", "Close and Block", "Block" and
  // "Release", "Release and Open", "Release and Close")
  var BLOCKING = { MDBk: 1, MDBl: 1, MDBm: 1 }, RELEASING = { MDEw: 1, MDE5: 1, MDFh: 1 };

  function kindOf(type) {
    var t = type == null ? '' : String(type);
    return KIND_OF[t] || KIND_OF[t.toLowerCase()] || 'other';
  }
  // a command (something someone or something asked the gate to do), as opposed to an obstruction or an event we do not know
  function isCommand(kind) {
    return kind === 'open' || kind === 'close' || kind === 'stop' || kind === 'step' || kind === 'block' || kind === 'release' || kind === 'light';
  }
  // the events of the Wi-Fi module that tell how it is doing (the app's own history page leaves all of these out)
  function healthKindOf(type) {
    var t = String(type == null ? '' : type).toLowerCase();
    if (t === 'power on' || t === 'boot') return 'restart';
    if (t === 'wifi loss') return 'wifi';
    if (t === 'error') return 'error';
    if (t.indexOf('device not found') > -1) return 'bus';        // the module writes "T4 device not found" (the app's own filter also matches a part of the text)
    if (t.indexOf('device found') > -1) return 'busfound';
    return null;
  }

  // epoch milliseconds, or null when this is no usable time (not a time, a clock that was never set, or far in the future)
  function toMs(v, now) {
    var n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && /^\d{9,}$/.test(v)) n = Number(v);
    else if (typeof v === 'string' && v) n = new Date(v).getTime();
    else return null;
    if (!isFinite(n) || n < MIN_TIME) return null;
    if (now != null && n > now + DAY) return null;
    return n;
  }

  // who or what gave the command: the app's own rules (busT4 = the gate controller on the bus, which the app calls "Autom.", scheduler, a user's
  // phone by its controller ID)
  function whoOf(source, users) {
    var s = source == null ? '' : String(source);
    if (s === 'busT4') return 'Gate controller';
    if (s === 'scheduler') return 'Schedule';
    if (s === 'input') return 'Input';
    if (!s) return 'Unknown';
    var list = Array.isArray(users) ? users : [];
    for (var i = 0; i < list.length; i++) {
      var u = list[i], cid = u && u.controllerID != null ? String(u.controllerID) : '';
      if (!cid) continue;
      // a shortened ID (it has a dash) is the controller ID without its last five characters
      if (cid === s || (s.indexOf('-') > -1 && cid.slice(0, Math.max(0, cid.length - 5)) === s)) return String(u.username || u.desc || 'User');
    }
    return 'Other (' + s.slice(0, 8) + ')';
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // the calendar day (in the phone's time zone) as a number, so that "yesterday" is right across a clock change
  function dayNumber(t) { var d = new Date(t); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  function dayName(t, now) {
    var diff = dayNumber(now) - dayNumber(t), d = new Date(t);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }
  // "today 14:12", "yesterday 18:40", "Tue 07:31", "12 Nov 14:12"
  function when(t, now) {
    var diff = dayNumber(now) - dayNumber(t), d = new Date(t);
    if (diff <= 0) return now - t < 60000 ? 'just now' : 'today ' + hhmm(t);
    if (diff === 1) return 'yesterday ' + hhmm(t);
    if (diff < 7) return WEEKDAYS[d.getDay()] + ' ' + hhmm(t);
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + hhmm(t);
  }
  function asList(x) { return Array.isArray(x) ? x : []; }

  // Everything the sheet shows, from the answer of the accessory: { interfaceLogs, deviceLogs } and the users (pairings.activeUsers)
  function analyze(res, users, now) {
    now = now == null ? Date.now() : now;
    var skipped = 0;                                                                   // entries without a usable time
    var events = [];
    asList(res && res.deviceLogs).forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var type = it.type == null ? '' : String(it.type);
      if (type === 'Scena_Out') return;                                                // the app's own history page leaves these out too
      var t = toMs(it.time, now);
      if (t == null) { skipped++; return; }
      events.push({ t: t, type: type, kind: kindOf(type), who: whoOf(it.source, users), source: it.source == null ? '' : String(it.source) });
    });
    events.sort(function (a, b) { return b.t - a.t; });                                // newest first
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    // The gate controller (source busT4) reports every movement it makes, also the one that a phone, a schedule or an input has just asked
    // for: "Open and Block" from a phone is followed within a second by an "open" from busT4. That is the same movement, so it is folded into
    // the command (a command takes at most one). What is left of busT4 is what nobody asked for through the accessory: a remote control, a switch,
    // the gate closing by itself, or the controller telling its state when the accessory starts.
    var echoes = 0, k;
    var oldest = events.slice().reverse();                                             // oldest first
    for (var ei = 0; ei < oldest.length; ei++) {
      var be = oldest[ei];
      if (be.source !== 'busT4' || !(be.kind === 'open' || be.kind === 'close' || be.kind === 'stop')) continue;
      for (k = ei - 1; k >= 0 && be.t - oldest[k].t <= ECHO_MS; k--) {
        var cmd = oldest[k];
        if (cmd.source !== 'busT4' && !cmd.echoed && cmd.kind === be.kind) { cmd.echoed = true; be.echo = true; echoes++; break; }
      }
    }
    var raw = events;                                                                  // (all of them, the repeats of the gate controller too)
    events = events.filter(function (e) { return !e.echo; });
    var commands = events.filter(function (e) { return isCommand(e.kind); });
    var obstructions = events.filter(function (e) { return e.kind === 'obstruction'; });

    // the last 14 calendar days, oldest first, with the commands of each split in opening, closing and the rest
    var today = dayNumber(now), days = [], byDay = {}, i;
    for (i = 13; i >= 0; i--) { var dd = { n: today - i, open: 0, close: 0, rest: 0, total: 0 }; days.push(dd); byDay[dd.n] = dd; }
    var hours = [];
    for (i = 0; i < 24; i++) hours.push(0);
    var who = {}, totals = { h24: 0, d7: 0, d30: 0, all: commands.length };
    commands.forEach(function (e) {
      var d = byDay[dayNumber(e.t)];
      if (d) { d.total++; if (e.kind === 'open') d.open++; else if (e.kind === 'close') d.close++; else d.rest++; }
      hours[new Date(e.t).getHours()]++;
      who[e.who] = (who[e.who] || 0) + 1;
      var age = now - e.t;
      if (age <= DAY) totals.h24++;
      if (age <= 7 * DAY) totals.d7++;
      if (age <= 30 * DAY) totals.d30++;
    });
    var byWho = Object.keys(who).map(function (k) { return { who: k, count: who[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0); });
    var peak = -1, peakCount = 0;
    hours.forEach(function (c, h) { if (c > peakCount) { peakCount = c; peak = h; } });
    var last = { open: null, close: null, command: commands[0] || null };
    for (i = 0; i < commands.length && !(last.open && last.close); i++) {
      if (!last.open && commands[i].kind === 'open') last.open = commands[i];
      if (!last.close && commands[i].kind === 'close') last.close = commands[i];
    }
    // the newest event that can have moved or stopped the gate (a stop, a block or an obstruction after an opening means it did not simply open)
    var MOVES = { open: 1, close: 1, stop: 1, step: 1, block: 1, obstruction: 1 }, lastMovement = null;
    for (i = 0; i < events.length; i++) if (MOVES[events[i].kind]) { lastMovement = events[i]; break; }
    // the newest Block or Release command: all the accessory can tell about blocking (it has no state for it)
    var block = null;
    for (i = 0; i < events.length; i++) {
      var bt = events[i].type;
      if (BLOCKING[bt] || RELEASING[bt]) { block = { blocked: !!BLOCKING[bt], t: events[i].t, type: bt, who: events[i].who, uncertain: false }; break; }
    }

    // the module itself: restarts (a power-on and the boot after it count once), Wi-Fi drops, errors, the gate controller that was not found
    var health = { restart: { count: 0, last: null, first: null }, wifi: { count: 0, last: null }, error: { count: 0, last: null }, bus: { count: 0, last: null, atStart: 0 } };
    var moduleTimes = [], mevents = [];
    asList(res && res.interfaceLogs).forEach(function (it) {
      if (!it || typeof it !== 'object') return;
      var t = toMs(it.time, now);
      if (t == null) { skipped++; return; }
      moduleTimes.push(t);
      var k = healthKindOf(it.type);
      if (k) mevents.push({ t: t, k: k });
    });
    mevents.sort(function (a, b) { return a.t - b.t; });
    var lastRestart = null;
    mevents.forEach(function (e) {
      if (e.k === 'busfound') return;
      var h = health[e.k];
      if (e.k === 'restart') {
        var again = lastRestart != null && e.t - lastRestart < START_MS;
        lastRestart = e.t;
        if (again) { h.last = e.t; return; }
        if (h.first == null) h.first = e.t;
      }
      // right after a start the module cannot see the gate controller yet ("T4 device not found", then "found"): that is not a fault
      if (e.k === 'bus' && lastRestart != null && e.t - lastRestart < START_MS) { h.atStart++; return; }
      h.count++;
      h.last = e.t;
    });
    // a restart after the last Block or Release command: the log is forgotten at a restart, so a Release since then would not show
    if (block && health.restart.last != null && health.restart.last > block.t) block.uncertain = true;

    // The newest movement that the gate controller itself reported (busT4: opening, closing, a step; a repeat of a command is the gate moving too), but
    // not what it says while the accessory starts (that is its state, not a movement). A blocked automation does not move: such a movement after a
    // Block means that the Block was lifted, also when the Release itself is not in the log (it is forgotten at a restart, or it was never seen).
    var starts = mevents.filter(function (e) { return e.k === 'restart'; }).map(function (e) { return e.t; });
    var DRIVES = { open: 1, close: 1, step: 1 }, drive = null;
    for (i = 0; i < raw.length && !drive; i++) {
      var dv = raw[i], atStart = false;
      if (dv.source !== 'busT4' || !DRIVES[dv.kind]) continue;
      for (k = 0; k < starts.length; k++) if (dv.t >= starts[k] && dv.t - starts[k] < START_MS) atStart = true;
      if (!atStart) drive = { t: dv.t, kind: dv.kind, type: dv.type };
    }

    // how far back the log goes (all events with a usable time)
    var span = null, lo = null, hi = null;
    events.forEach(function (e) { if (lo == null || e.t < lo) lo = e.t; if (hi == null || e.t > hi) hi = e.t; });
    moduleTimes.forEach(function (t) { if (lo == null || t < lo) lo = t; if (hi == null || t > hi) hi = t; });
    if (lo != null) span = { oldest: lo, newest: hi, count: events.length + moduleTimes.length, days: Math.max(1, Math.round((hi - lo) / DAY)) };
    // the log seems to begin when the accessory last started (the oldest entry is that start): older events are forgotten at a restart
    var logStart = (span && health.restart.first != null && Math.abs(span.oldest - health.restart.first) < 120000) ? health.restart.first : null;

    return { now: now, events: events, commands: commands, obstructions: obstructions, days: days, hours: hours,
      peak: peak >= 0 ? { hour: peak, count: peakCount } : null, byWho: byWho, totals: totals, last: last, health: health, span: span, skipped: skipped,
      hasModuleEvents: moduleTimes.length > 0, echoes: echoes, lastMovement: lastMovement, block: block, drive: drive, logStart: logStart };
  }

  // the line on the accessory screen: the last command, when and by whom (now: the moment of showing it, so that "just now" does not stay
  // on the screen for an hour; the moment of the reading when it is not given). Who is named as the sheet names it (At the gate, Another phone): the sheet opens from this line
  function lastLine(a, label, now) {
    var e = a && a.last && a.last.command;
    if (!e) return '';
    return (label ? label(e.type) : e.type) + ' · ' + when(e.t, now == null ? a.now : now) + (e.who ? ' · ' + actorOf(e.who).name : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }

  // ---- nx23 activity: begin (the periods that the numbers count, the charts, and the wording of the sheet)
  // What the sheet shows in amber or red happened in the last 24 hours, or it still holds (a block). Older events are shown too, in a calm tone.
  var RECENT_MS = DAY;
  var PEAK_MIN = 10;                       // fewer commands than this in the period: no "busiest hour" (three commands are no habit)
  var LATEST = 6;                          // the events at the top of the sheet; the rest is behind "Show all"
  var WEEKDAYS2 = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  // the words of a Block: the constants of the gate screen (NX_WORDS, when this file has them) so that the pill and the sheet agree, else the literal
  function word(keys, fallback) {
    try {
      var w = typeof NX_WORDS === 'object' && NX_WORDS ? NX_WORDS : null;
      for (var i = 0; w && i < keys.length; i++) if (typeof w[keys[i]] === 'string' && w[keys[i]]) return w[keys[i]];
    } catch (e) {}
    return fallback;
  }
  // "yesterday 15:30" in two parts: the day ("today", "yesterday", "Tue", "28 Oct", "just now") and the time
  function whenParts(t, now) {
    var diff = dayNumber(now) - dayNumber(t), d = new Date(t);
    if (diff <= 0) return { day: now - t < 60000 ? 'just now' : 'today', time: hhmm(t) };
    if (diff === 1) return { day: 'yesterday', time: hhmm(t) };
    if (diff < 7) return { day: WEEKDAYS[d.getDay()], time: hhmm(t) };
    return { day: d.getDate() + ' ' + MONTHS[d.getMonth()], time: hhmm(t) };
  }
  // how long, in the unit that fits: "40 minutes", "5 hours", "11 days"
  function spanText(ms) {
    var min = Math.round(ms / 60000), hours = Math.round(ms / 3600000);
    if (min < 60) return plural(Math.max(1, min), 'minute');
    if (hours < 48) return plural(hours, 'hour');
    return plural(Math.round(ms / DAY), 'day');
  }
  // who or what, in the words of the sheet. The statistics keep the names of whoOf() ("Gate controller" is busT4, "Other (...)" a phone that is not in the
  // list of the users); a test checks that they still match
  function actorOf(who) {
    var s = String(who == null ? '' : who);
    if (s === 'Gate controller') return { name: 'At the gate', note: 'remote or switch' };
    if (/^Other \(/.test(s)) return { name: 'Another phone', note: '' };
    return { name: s, note: '' };
  }

  // The period that the numbers count: the last 7 calendar days (today and the six before) or the whole log. A log that is not older than that has only the
  // whole log (the mode '7' gives it too). "Since the log starts": the accessory forgets its log when it restarts, so the whole log can be short.
  function statWindow(a, mode) {
    var today = dayNumber(a.now), first = a.span ? dayNumber(a.span.oldest) : today;
    var longLog = first < today - 6, seven = longLog && mode !== 'all';
    var age = a.span ? a.now - a.span.oldest : 0;
    return { mode: seven ? '7' : 'all', canSwitch: longLog, today: today, firstDay: first, fromDay: seven ? today - 6 : first,
      label: seven ? 'last 7 days' : 'whole log', full: seven ? 'last 7 days' : 'whole log, ' + spanText(age), phrase: seven ? 'in the last 7 days' : 'in the whole log' };
  }
  // what is counted in a period: the commands (by hour of the day and by who) and the obstructions
  function windowStats(a, win) {
    var cmds = a.commands.filter(function (e) { return dayNumber(e.t) >= win.fromDay; });
    var obst = a.obstructions.filter(function (e) { return dayNumber(e.t) >= win.fromDay; });
    var hours = [], who = {}, i;
    for (i = 0; i < 24; i++) hours.push(0);
    cmds.forEach(function (e) { hours[new Date(e.t).getHours()]++; who[e.who] = (who[e.who] || 0) + 1; });
    var byWho = Object.keys(who).map(function (k) { return { who: k, count: who[k] }; })
      .sort(function (x, y) { return y.count - x.count || (x.who < y.who ? -1 : x.who > y.who ? 1 : 0); });
    return { commands: cmds.length, obstructions: obst, hours: hours, byWho: byWho };
  }
  // the bars of the chart per day (oldest first): the last 14 days, or the last 7. A day from before the log began has no data: it is not a quiet day. The day
  // on which the log begins counts from the first entry on (a minimum).
  function dayCells(a, win) {
    var days = win.mode === '7' ? a.days.slice(-7) : a.days;
    return days.map(function (d) {
      return { n: d.n, open: d.open, close: d.close, rest: d.rest, total: d.total, today: d.n === win.today, nodata: d.n < win.firstDay, partial: d.n === win.firstDay };
    });
  }
  // The busiest hours of the day: every hour that has the most commands (ties are all shown, neighbours merged into one range), but only when there are
  // enough commands for it to mean something. { enough, spread, hours: [..], ranges: [[from, to]..], count }
  function peakHours(hours, total) {
    var max = 0, i;
    hours.forEach(function (c) { if (c > max) max = c; });
    if (total < PEAK_MIN || max < 2) return { enough: false, spread: false, hours: [], ranges: [], count: max };
    var tied = [], ranges = [];
    for (i = 0; i < 24; i++) if (hours[i] === max) {
      tied.push(i);
      if (ranges.length && ranges[ranges.length - 1][1] === i) ranges[ranges.length - 1][1] = i + 1; else ranges.push([i, i + 1]);
    }
    if (ranges.length > 2) return { enough: true, spread: true, hours: [], ranges: [], count: max };       // all over the day: there is no peak
    return { enough: true, spread: false, hours: tied, ranges: ranges, count: max };
  }
  function hourRange(r) { return pad(r[0]) + ':00–' + pad(r[1] % 24) + ':00'; }
  // how a row of the health of the accessory looks: nothing, something older (a calm tone), something in the last 24 hours (amber; red for errors)
  function healthTone(a, k) {
    var c = a.health[k];
    if (!c || !c.count) return 'none';
    if (c.last != null && a.now - c.last <= RECENT_MS) return k === 'error' ? 'fail' : 'warn';
    return 'note';
  }
  // what is wrong with the accessory right now: the events of its health in the last 24 hours, the worst first
  function attention(a) {
    var out = [], names = { error: 'Error reported', bus: 'Gate controller lost', wifi: 'Wi-Fi lost', restart: 'Accessory restarted' };
    ['error', 'bus', 'wifi', 'restart'].forEach(function (k) {
      var tone = healthTone(a, k);
      if (tone === 'warn' || tone === 'fail') out.push({ kind: k, level: tone, text: names[k], t: a.health[k].last });
    });
    return out;
  }

  // The state of the gate as far as Block and Release commands tell (bl: what blockInfo() says, or the analysis). A blocked gate gets the card (amber); the
  // rest is a quiet line under the title.
  function blockHtml(bl, label, now) {
    if (!bl) return '';
    var did = esc(label(bl.type)) + (bl.who ? ' · ' + esc(actorOf(bl.who).name) : '');
    if (bl.blocked) {
      return '<div class="nx-card nx-act-block nx-blocked"><i class="nx-block-icon" aria-hidden="true"></i><div><b>' +
        esc(bl.uncertain ? word(['maybeBlocked', 'maybe'], 'Maybe blocked') : word(['blocked'], 'Blocked')) + '</b><span>since ' + esc(when(bl.t, now)) + ' · ' + did +
        '</span><em>The last Block command, not a measurement: a block that was lifted at the gate controller itself is not seen here.' +
        (bl.uncertain ? ' The accessory restarted after it and forgot its log, so a Release since then would not show here. If the gate moves, it is not blocked: then this goes away.' : '') +
        '</em></div></div>';
    }
    if (bl.inferred) {
      return '<div class="nx-act-block nx-act-free"><i class="nx-free-icon" aria-hidden="true"></i><div><b>Not blocked, as far as the log shows</b><span>the gate moved ' +
        esc(when(bl.t, now)) + ' · ' + did + ', after the Block of ' + esc(when(bl.since, now)) +
        '</span><em>A blocked automation does not move, so the Block was lifted since. The Release itself is not in the log (for instance because the accessory restarted ' +
        'and forgot it, or it was given by an app that the log does not show).</em></div></div>';
    }
    return '<div class="nx-act-block nx-act-free"><i class="nx-free-icon" aria-hidden="true"></i><div><b>Not blocked, as far as the log shows</b><span>last Release: ' +
      esc(when(bl.t, now)) + ' · ' + did + '</span></div></div>';
  }
  function longDate(n) { var t = new Date(n * DAY); return WEEKDAYS[t.getUTCDay()] + ' ' + t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()]; }

  // the body of the sheet as HTML (label: type -> the app's text for it). From the top: what is blocked, what is wrong with the accessory now, four tiles, the
  // latest events; then the charts of one period (opts.scope: '7' or 'all'), the health of the accessory and, folded, where the data comes from.
  // opts.all: the whole history, not only the latest events; opts.block: the state of blocking that blockInfo() worked out.
  var TIMELINE_LONG = 300;
  function renderHtml(a, label, opts) {
    opts = opts || {};
    label = label || function (t) { return NAMES[t] || t; };
    var h = [], now = a.now;
    if (!a.span) {
      return '<div class="nx-card nx-act-empty"><b>No events yet</b><span>The accessory’s log is empty, or its entries have no usable time. ' +
        'Send a command from the gate screen, then tap refresh.</span></div>';
    }

    // ---- 1. blocked? Only what the last Block or Release command says: the accessory itself has no state for it
    h.push(blockHtml(opts.block !== undefined ? opts.block : a.block, label, now));

    // ---- 2. what is wrong with the accessory now (nothing is shown when nothing is)
    var warn = attention(a);
    if (warn.length) {
      h.push('<div class="nx-card nx-act-alert' + (warn.some(function (w) { return w.level === 'fail'; }) ? ' nx-alert-bad' : '') + '" role="status"><b>In the last 24 hours</b><ul>' +
        warn.map(function (w) {
          return '<li><i class="nx-ai nx-i-' + { restart: 'restart', wifi: 'wifioff', error: 'warn', bus: 'gate' }[w.kind] + '" aria-hidden="true"></i><span>' + esc(w.text) + '</span> <time>' + esc(when(w.t, now)) + '</time></li>';
        }).join('') + '</ul></div>');
    }

    // ---- 3. four tiles: the last opening and closing; the commands of today (and of the week); the obstructions of the week
    var cw = statWindow(a, '7'), cs = windowStats(a, cw), since = when(a.span.oldest, now);
    function tile(cls, title, value, sub) {
      return '<div class="nx-tile ' + cls + '"><small>' + esc(title) + '</small><b>' + esc(value) + '</b><span>' + esc(sub) + '</span></div>';
    }
    function lastTile(cls, title, e) {
      if (!e) return tile(cls, title, '–', 'none since ' + since);
      var p = whenParts(e.t, now);
      return tile(cls, title, p.time, p.day + (e.who ? ' · ' + actorOf(e.who).name : ''));
    }
    var ob = cs.obstructions, obRecent = ob.length > 0 && now - ob[0].t <= RECENT_MS;
    h.push('<div class="nx-tiles">' +
      lastTile('nx-t-open', 'Last opened', a.last.open) +
      lastTile('nx-t-close', 'Last closed', a.last.close) +
      tile('nx-t-count', 'Commands today', String(a.days[a.days.length - 1].total), cs.commands + ' ' + cw.phrase) +
      tile('nx-t-obst' + (obRecent ? ' nx-t-bad' : ''), 'Obstructions, ' + (cw.mode === '7' ? '7 days' : 'whole log'), String(ob.length), ob.length ? 'latest ' + when(ob[0].t, now) : 'none reported') +
      '</div>');

    // ---- 4. the latest events (the whole history on request)
    var list = a.events, nShow = Math.min(list.length, opts.all ? TIMELINE_LONG : LATEST), shown = list.slice(0, nShow);
    h.push('<h3 class="nx-act-h"><span>' + (opts.all ? (list.length > TIMELINE_LONG ? 'Latest ' + TIMELINE_LONG + ' events' : 'All events') : 'Latest events') + '</span></h3>');
    if (shown.length) {
      var rows = [], prev = null;
      shown.forEach(function (e) {
        var dn = dayNumber(e.t);
        if (dn !== prev) { rows.push('<li class="nx-tl-day">' + esc(dayName(e.t, now)) + '</li>'); prev = dn; }
        rows.push('<li class="nx-tl-row nx-k-' + e.kind + '"><time>' + hhmm(e.t) + '</time><span class="nx-tl-what">' + esc(label(e.type)) + '</span><span class="nx-tl-who">' +
          esc(actorOf(e.who).name) + '</span></li>');
      });
      h.push('<ul class="nx-card nx-tl">' + rows.join('') + '</ul>');
      if (list.length > LATEST) {
        h.push(opts.all ? '<button type="button" class="nx-act-less">Show less</button>' :
          '<button type="button" class="nx-act-all">' + (list.length > TIMELINE_LONG ? 'Show the latest ' + TIMELINE_LONG + ' of ' + list.length : 'Show all ' + plural(list.length, 'event')) + '</button>');
      }
    } else {
      h.push('<div class="nx-card nx-act-empty"><span>No commands in the log.</span></div>');
    }

    // ---- 5. the charts. They count one period, and every heading says which; with a log of more than a week the period can be changed
    var win = statWindow(a, opts.scope), ws = windowStats(a, win);
    if (win.canSwitch) {
      h.push('<div class="nx-scope" role="group" aria-label="Period of the charts"><button type="button" data-scope="7" aria-pressed="' + (win.mode === '7') + '">Last 7 days</button>' +
        '<button type="button" data-scope="all" aria-pressed="' + (win.mode === 'all') + '">Whole log · ' + esc(spanText(now - a.span.oldest)) + '</button></div>');
    }
    function heading(title, period) { return '<h3 class="nx-act-h"><span>' + esc(title) + '</span><small>' + esc(period) + '</small></h3>'; }

    // per day: a day from before the log began is dashed (no data is not zero), the day it begins counts a minimum (5+)
    var cells = dayCells(a, win), dayPeriod = 'last ' + cells.length + ' days';
    if (win.firstDay >= win.today) {
      h.push(heading('Commands per day', dayPeriod) + '<div class="nx-card nx-act-empty"><span>The log begins today at ' + esc(hhmm(a.span.oldest)) + ': there is no other day to compare yet.</span></div>');
    } else {
      var maxDay = 0, spoken = [], hasVoid = false, hasPartial = false;
      cells.forEach(function (d) { if (d.total > maxDay) maxDay = d.total; });
      var cols = cells.map(function (d) {
        var nm = longDate(d.n), head = '<div class="nx-col' + (d.today ? ' nx-today' : '') + (d.nodata ? ' nx-nodata' : '') + '"' + (d.partial ? ' data-partial="1"' : '') + '>';
        if (d.nodata) { hasVoid = true; spoken.push(nm + ' no data'); return head + '<div class="nx-stack"></div></div>'; }
        if (d.partial) hasPartial = true;
        spoken.push(nm + ' ' + (d.partial ? 'at least ' : '') + d.total);
        var px = d.total ? Math.max(6, Math.round(d.total / maxDay * 92)) : 0, seg = '';
        if (d.rest) seg += '<i class="nx-b-rest" style="flex:' + d.rest + '"></i>';
        if (d.close) seg += '<i class="nx-b-close" style="flex:' + d.close + '"></i>';
        if (d.open) seg += '<i class="nx-b-open" style="flex:' + d.open + '"></i>';
        return head + '<em>' + d.total + (d.partial ? '+' : '') + '</em>' +
          (d.total ? '<div class="nx-stack" style="height:' + px + 'px">' + seg + '</div>' : '<div class="nx-stack nx-zero"></div>') + '</div>';
      });
      var axis = cells.map(function (d) {
        var wd = new Date(d.n * DAY).getUTCDay(), date = (wd === 1 || d.today) ? new Date(d.n * DAY).getUTCDate() : '';
        return '<small' + (d.today ? ' class="nx-today"' : '') + '>' + WEEKDAYS2[wd] + '<span>' + date + '</span></small>';
      });
      var note = '';
      if (hasVoid || hasPartial) {
        note = '<p class="nx-act-note">The log begins ' + esc(since) + (a.logStart ? ' (the accessory started then and forgets older events)' : '') + '. ' +
          (hasVoid ? 'Dashed days are before that: no data, which is not the same as a quiet day. ' : '') + (hasPartial ? 'The first day counts from then on, so its number (with a +) is a minimum.' : '') + '</p>';
      }
      h.push(heading('Commands per day', dayPeriod) + '<div class="nx-card">' +
        '<div class="nx-bars" role="img" aria-label="Commands per day, ' + esc(dayPeriod) + ': ' + esc(spoken.join(', ')) + '">' + cols.join('') + '</div>' +
        '<div class="nx-axis" aria-hidden="true">' + axis.join('') + '</div>' +
        '<div class="nx-legend" aria-hidden="true"><span class="nx-lg nx-lg-open">Open</span><span class="nx-lg nx-lg-close">Close</span><span class="nx-lg nx-lg-rest">Other</span>' +
        (hasVoid ? '<span class="nx-lg nx-lg-none">No data</span>' : '') + '</div>' + note + '</div>');
    }

    if (ws.commands) {
      // who gave the commands
      var top = ws.byWho.slice(0, 5), rest = 0;
      ws.byWho.slice(5).forEach(function (w) { rest += w.count; });
      if (rest) top.push({ who: 'Others', count: rest });
      var maxWho = top[0].count;
      h.push(heading('Who', win.full) + '<ul class="nx-card nx-whos">' + top.map(function (w) {
        var who = actorOf(w.who);
        return '<li><span class="nx-w-name">' + esc(who.name) + (who.note ? ' <small>' + esc(who.note) + '</small>' : '') + '</span><span class="nx-w-bar"><i style="width:' +
          Math.max(4, Math.round(w.count / maxWho * 100)) + '%"></i></span><b>' + w.count + '</b></li>';
      }).join('') + '</ul>');

      // the hours of the day: every tied hour is shown, and nothing is called busiest on a few commands
      var pk = peakHours(ws.hours, ws.commands), maxH = pk.count, isPeak = {}, spokenH = [];
      pk.hours.forEach(function (x) { isPeak[x] = true; });
      var bars = ws.hours.map(function (c, hr) {
        if (c) spokenH.push(pad(hr) + ':00 ' + c);
        return '<i class="' + (isPeak[hr] ? 'nx-peak' : '') + '" style="height:' + (c ? Math.max(4, Math.round(c / maxH * 48)) : 0) + 'px">' + (isPeak[hr] ? '<b>' + c + '</b>' : '') + '</i>';
      });
      var peakNote = !pk.enough ? 'Too few commands (' + ws.commands + ') to say which hours are busiest.' :
        pk.spread ? 'No clear peak: the commands are spread over the day.' :
        'Busiest: ' + pk.ranges.map(hourRange).join(' and ') + ' (' + plural(pk.count, 'command') + (pk.hours.length > 1 ? ' in each hour' : '') + ').';
      h.push(heading('Busy hours', win.full) + '<div class="nx-card"><div class="nx-hours" role="img" aria-label="Commands by hour of the day, ' + esc(win.full) + '. ' + esc(peakNote) + ' ' +
        esc(spokenH.join(', ')) + '">' + bars.join('') + '</div><div class="nx-axis nx-axis-h" aria-hidden="true"><small>0</small><small>6</small><small>12</small><small>18</small></div>' +
        '<p class="nx-act-note">' + esc(peakNote) + '</p></div>');
    }

    // ---- 6. the accessory itself
    var hl = a.health, aw = statWindow(a, 'all');
    function hrow(k, icon, title, none) {
      var c = hl[k], tone = healthTone(a, k);
      return '<li class="nx-fact nx-s-' + tone + '"><span class="nx-fi nx-i-' + (tone === 'none' ? 'done' : icon) + '"></span><div><b>' + esc(title) + '</b><span>' +
        esc(c.count ? 'Latest: ' + when(c.last, now) : none || 'None in the log') + '</span></div><em>' + c.count + '</em></li>';
    }
    h.push(heading('Accessory health', aw.full));
    if (a.hasModuleEvents) {
      h.push('<ul class="nx-facts">' +
        hrow('restart', 'restart', 'Restarts') +
        hrow('wifi', 'wifioff', 'Wi-Fi lost') +
        hrow('error', 'warn', 'Errors') +
        hrow('bus', 'gate', 'Gate controller lost', hl.bus.atStart ? 'Only while the accessory was starting' : '') + '</ul>');
    } else {
      h.push('<div class="nx-card nx-act-empty"><span>The log has no events of the accessory itself.</span></div>');
    }

    // ---- 7. where this comes from (folded)
    h.push('<details class="nx-details nx-act-about"><summary>About this data</summary><div class="nx-act-abouttext">' +
      '<p>Source: the accessory’s own event log (the one the app shows as its history), with the accessory’s clock. It keeps only the latest events: ' +
      plural(a.span.count, 'event') + ', from ' + esc(since) + ' (' + esc(spanText(now - a.span.oldest)) + ').</p>' +
      (a.logStart ? '<p>The log begins when the accessory started (' + esc(when(a.logStart, now)) + '): it seems to forget older events at a restart.</p>' : '') +
      (a.echoes ? '<p>' + plural(a.echoes, 'movement') + ' that the gate controller reported right after a command ' + (a.echoes === 1 ? 'is' : 'are') + ' shown once, with the command.</p>' : '') +
      (a.skipped ? '<p>' + plural(a.skipped, 'entry', 'entries') + ' without a usable time left out.</p>' : '') +
      '<p>“At the gate” is the gate controller moving the gate without a command from the app or the schedule: a remote control, a wall switch, or the gate closing by itself.</p>' +
      '</div></details>');
    return h.join('');
  }
  // ---- nx23 activity: end

  // what kinds of events there are, for the LOG: "device [close x2, open x3] sources [busT4 x1, phone x4] module [boot x1]" (no names, no IDs)
  function summary(res) {
    function count(list, key) {
      var o = {};
      asList(list).forEach(function (it) { var k = key(it); o[k] = (o[k] || 0) + 1; });
      return Object.keys(o).sort().map(function (k) { return k + ' x' + o[k]; }).join(', ');
    }
    function type(it) { return it && it.type != null ? String(it.type) : '?'; }
    function source(it) { var s = it && it.source; return (s === 'busT4' || s === 'scheduler' || s === 'input') ? s : s ? 'phone' : 'none'; }
    return 'device [' + count(res && res.deviceLogs, type) + '] sources [' + count(res && res.deviceLogs, source) + '] module [' + count(res && res.interfaceLogs, type) + ']';
  }

  // plain text of the raw log, to copy and share (times, types and sources; no passwords are in it)
  function ymdhms(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function rawText(res, now) {
    function row(it) {
      var t = toMs(it && it.time, null);
      return (t == null ? '(no time)' : ymdhms(t)) + ' | ' + String(it && it.type) + ' | ' + String(it && it.source) + ' | ' + String(it && it.id) + '/' + (it && it.idx != null ? String(it.idx) : '-');
    }
    var dev = asList(res && res.deviceLogs), ifc = asList(res && res.interfaceLogs);
    return 'Accessory event log, read ' + new Date(now == null ? Date.now() : now).toISOString() + '\n' +
      'device events: ' + dev.length + ', module events: ' + ifc.length + '\n' +
      'time | type | source | id/idx\n--- device events\n' + dev.map(row).join('\n') + '\n--- module events\n' + ifc.map(row).join('\n');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { toMs: toMs, kindOf: kindOf, isCommand: isCommand, healthKindOf: healthKindOf, whoOf: whoOf, when: when, dayName: dayName, hhmm: hhmm,
      analyze: analyze, lastLine: lastLine, renderHtml: renderHtml, rawText: rawText, summary: summary, NX_WORDS: NX_WORDS };
  }
  // ---- nx23 activity: begin (what the tests of the sheet call)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports.statWindow = statWindow; module.exports.windowStats = windowStats; module.exports.dayCells = dayCells; module.exports.peakHours = peakHours;
    module.exports.attention = attention; module.exports.healthTone = healthTone; module.exports.whenParts = whenParts; module.exports.spanText = spanText;
    module.exports.actorOf = actorOf;
  }
  // ---- nx23 activity: end
  if (typeof window === 'undefined' || !window.document) return;      // (no browser: only the functions above)

  // ======================================================================== 2. the sheet (nx-patch.js calls this once the app is up)
  // ctx: { inj, $rootScope, NHK, log, toast, liveDevice, copy }
  window.__nxActivity = function (ctx) {
    var inj = ctx.inj, $rootScope = ctx.$rootScope, NHK = ctx.NHK;
    var log = ctx.log || function () {}, toast = ctx.toast || function () {};
    var PREFETCH_MS = window.__nxActivityPrefetchMs != null ? window.__nxActivityPrefetchMs : 2500;    // looking at the accessory screen this long: read the log
    var MAX_AGE = window.__nxActivityMaxAge != null ? window.__nxActivityMaxAge : 30000;                // ...unless it was read less than this long ago
    var TIMEOUT = window.__nxActivityTimeoutMs != null ? window.__nxActivityTimeoutMs : 20000;          // the accessory does not answer
    // Another app, another phone or the schedule can block or release the gate at any moment, and the accessory does not tell: a plain Block or
    // Release moves nothing, so there is no state event either. The only place where it shows is the log, so the log is read again:
    var POLL_MS = window.__nxActivityPollMs != null ? window.__nxActivityPollMs : 30000;                // as long as the accessory screen is open, this often
    var EVENT_MS = window.__nxActivityEventMs != null ? window.__nxActivityEventMs : 4000;              // after a report of the state (a gate that moves: someone gave a command)
    var STATUS_MS = window.__nxActivityStatusMs != null ? window.__nxActivityStatusMs : 1500;           // after the app asked for the state (the screen was entered, the app resumed)
    var RESUME_MS = window.__nxActivityResumeMs != null ? window.__nxActivityResumeMs : 2000;           // after the app came back to the front
    var RETRY_MS = window.__nxActivityRetryMs != null ? window.__nxActivityRetryMs : 5000;              // once more, when such a reading failed
    var BACKOFF_MS = window.__nxActivityBackoffMs != null ? window.__nxActivityBackoffMs : 120000;       // no readings on a timer after a failure for this long
    var MIN_GAP_MS = window.__nxActivityMinGapMs != null ? window.__nxActivityMinGapMs : 5000;          // a reading younger than this is as good as a new one
    var USERS_AGE = window.__nxActivityUsersAge != null ? window.__nxActivityUsersAge : 10 * 60 * 1000;  // the users change rarely: readings in the background reuse them
    var cache = {};              // mac -> { at, a, raw, sig }
    var waiting = {};            // mac -> callbacks of a read that is running
    var usersCache = {};         // mac -> { at, list }
    var failedAt = {}, failures = {}, retried = {};       // mac -> when the last reading failed, how many in a row, whether the one more attempt was made
    var panel = null, scrim = null, body = null, sub = null, btnRefresh = null, copyRow = null;
    var isOpen = false, current = null, showAll = false;
    // nx23 activity: the period of the charts ('7' or 'all'), and the hint that the accessory is slow (after SLOW_MS without an answer, while nothing is on screen)
    var SLOW_MS = window.__nxActivitySlowMs != null ? window.__nxActivitySlowMs : 3500;
    var scope = '7', slow = false, slowTimer = null;

    function digest() { try { if ($rootScope.$evalAsync) $rootScope.$evalAsync(function () {}); } catch (e) {} }
    function label(type) {
      try {
        if (inj.has('$translate')) {
          var key = 'DEVICE_COMMAND_' + type, t = inj.get('$translate').instant(key);
          if (t && t !== key) return t;
        }
      } catch (e) {}
      return NAMES[type] || type || 'Unknown';
    }
    // nx23 activity: what to say when the log could not be read: the cause in one sentence (the app's own words for the code when it has them), and the details
    // (the code and the message of the accessory or the system) for "Technical details": a message of the system is not for the person
    function errorParts(err) {
      var code = null, msg = '', cause = '';
      try {
        if (typeof err === 'string') msg = err;
        else if (err && typeof err === 'object') { code = err.code != null ? err.code : null; msg = err.message != null ? String(err.message) : ''; }
        if (code != null && code !== 'timeout' && inj.has('$translate')) {
          var key = 'NHK_ERROR-' + code, t = inj.get('$translate').instant(key);
          if (t && t !== key) cause = String(t);
        }
      } catch (e) {}
      // the texts of failures end with a sentence about "a command that was just sent": not for a log that could not be read (nx23 QA)
      cause = window.__nxCopy && window.__nxCopy.cause ? window.__nxCopy.cause(cause) : cause.replace(/\s*If you just sent a command[\s\S]*$/, '');
      return { cause: cause || 'The accessory did not answer.', detail: [(code != null && code !== 'timeout') ? 'code ' + code : '', msg].filter(Boolean).join(' · ') };
    }

    // the log and the users, both optional apart from the log itself; one answer or one failure. A reading in the background (quiet) does not
    // ask for the users again when it has them (they are for the names in the history only).
    function fetchLog(device, quiet, done) {
      var mac = device.mac, finished = false, res = null, users = null, left = 2;
      var known = usersCache[mac], reuse = !!(quiet && known && Date.now() - known.at < USERS_AGE);
      if (reuse) { users = known.list; left = 1; }
      function end(err) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        done(err, res, users);
        digest();
      }
      var timer = setTimeout(function () { end({ code: 'timeout', message: 'The accessory did not answer' }); }, TIMEOUT);
      function step() { if (--left === 0) end(res ? null : { message: 'No answer' }); }
      try {
        NHK.logs(device).then(function (r) { res = r || {}; step(); }, function (e) { end(e || { message: 'Not allowed or not reachable' }); });
      } catch (e) { end({ message: String(e) }); return; }
      if (reuse) return;
      try {
        NHK.pairings(device).then(function (r) {
          users = r && r.activeUsers;
          if (Array.isArray(users)) usersCache[mac] = { at: Date.now(), list: users };
          step();
        }, function (e) { log('activity: users not read', JSON.stringify(e)); step(); });     // without them the users show as "Other (...)"
      } catch (e) { step(); }
    }
    // what changes on the screen when the log is new: the newest event, the last Block or Release, the health of the module
    function sigOf(a) {
      var e = a.events[0], b = a.block, h = a.health;
      return a.events.length + '|' + (e ? e.t + e.type : '') + '|' + (b ? b.t + b.type : '') + '|' + h.restart.count + '|' + h.wifi.count + '|' + h.error.count + '|' + h.bus.count;
    }
    // opts: { why (what asked for it, for the LOG), quiet (a reading in the background: the LOG gets a line only when the log has changed, or
    // when readings begin to fail, and the users are reused), retry (try once more, a little later, when it fails) }
    function refresh(device, cb, opts) {
      var mac = device && device.mac;
      if (!mac) { if (cb) cb({ message: 'No accessory' }); return; }
      if (waiting[mac]) { if (cb) waiting[mac].push(cb); return; }
      opts = opts || {};
      var why = opts.why ? ' (' + opts.why + ')' : '', quiet = !!opts.quiet;
      waiting[mac] = cb ? [cb] : [];
      fetchLog(device, quiet, function (err, res, users) {
        var cbs = waiting[mac] || [];
        delete waiting[mac];
        if (err) {
          failedAt[mac] = Date.now();
          if (!quiet || !failures[mac]) log('activity: could not read the log' + why, JSON.stringify(err));      // a gate away from home would flood the LOG otherwise
          failures[mac] = (failures[mac] || 0) + 1;
          if (opts.retry && !retried[mac]) { retried[mac] = true; planReading(device, RETRY_MS, 'retry'); }
          cbs.forEach(function (f) { f(err); });
          return;
        }
        var a = analyze(res, users, Date.now()), sig = sigOf(a), changed = !cache[mac] || cache[mac].sig !== sig;
        cache[mac] = { at: Date.now(), a: a, raw: res, sig: sig };
        if (failures[mac] && quiet) log('activity: the log can be read again');
        failures[mac] = 0; failedAt[mac] = 0; retried[mac] = false;
        remember(device);
        if (!quiet || changed) {
          log('activity: ' + a.events.length + ' device events, ' + (a.span ? a.span.count - a.events.length : 0) + ' module events, ' +
            (a.span ? 'back ' + a.span.days + ' days' : 'no usable times') + (a.skipped ? ', ' + a.skipped + ' without a time' : '') + why);
          log('activity: ' + summary(res));
        }
        cbs.forEach(function (f) { f(null, cache[mac]); });
      });
    }
    // a reading in the background, unless one is running, one was taken a moment ago, or (a reading on a timer) the last one failed not long ago
    function readIfStale(device, maxAge, why, backoff) {
      var mac = device && device.mac, now = Date.now();
      if (!mac || waiting[mac]) return;
      var c = cache[mac];
      if (c && now - c.at < maxAge) return;
      if (backoff && failedAt[mac] && now - failedAt[mac] < BACKOFF_MS) return;
      refresh(device, null, { why: why, quiet: true, retry: why !== 'poll' });
    }
    function visible() { try { return !document.hidden; } catch (e) { return true; } }

    // ------------------------------------------------------------ blocked or not, and the state of the gate
    var TRAVEL_MS = window.__nxActivityTravelMs != null ? window.__nxActivityTravelMs : 150000;        // a gate does not keep moving for longer than this
    var AFTER_MS = window.__nxActivityAfterMs != null ? window.__nxActivityAfterMs : 3000;             // the log is read this long after a command
    var MARGIN_MS = window.__nxActivityMarginMs != null ? window.__nxActivityMarginMs : 8000;          // ...and this long after the travel time, if the gate is still said to move
    var BLOCK_KEY = 'nxBlock';
    var TRANSIENT = { opening: 1, closing: 1 };
    var timers = {};             // mac -> { after, travel }: readings that are planned
    var declaredLogged = {};
    var settleLogged = {};       // mac -> what was said about a state that is out of date (a reading in the background replaces the cache, and the decision is made again)
    var movedAt = {};            // mac -> when the last event or command of this phone was seen: a reading from before that cannot say anything about it

    // The accessory has no state for "blocked". What is known is the last Block or Release command: the ones this phone gave (kept here, apart
    // from the app's data) and the ones in the log (every phone, the schedule). The newer of the two counts.
    var blockMem = null;
    function readBlock() {
      if (blockMem) return blockMem;
      try { var o = JSON.parse(window.localStorage.getItem(BLOCK_KEY) || '{}'); blockMem = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { blockMem = {}; }
      return blockMem;
    }
    function writeBlock(o) {
      blockMem = o;
      try { window.localStorage.setItem(BLOCK_KEY, JSON.stringify(o)); } catch (e) { log('block: not saved', String(e)); }
    }
    // What this phone did counts until the log can know better. The log can know better when it has a newer Block or Release (another phone, another
    // app, the schedule), and also when it was read after this phone's command and has one from about that time or later: the accessory writes a
    // command in its log at once, so that reading has this phone's command in it and the newest Block or Release is the one that counts, also
    // when the clock of the accessory is a few seconds behind the clock of the phone.
    var LOGGED_MS = 2000, SKEW_MS = 60000;
    function blockInfo(device) {
      var mac = device && device.mac;
      if (!mac) return null;
      var mine = readBlock()[mac], c = cache[mac], lg = c && c.a && c.a.block, best = null;
      var hasMine = !!mine && typeof mine.at === 'number';
      var logKnows = hasMine && !!lg && c.at >= mine.at + LOGGED_MS && lg.t >= mine.at - SKEW_MS;
      if (hasMine && (!lg || (mine.at >= lg.t && !logKnows))) {
        best = { blocked: !!mine.blocked, t: mine.at, type: mine.code, who: mine.who || '', uncertain: false };
        if (mine.inferred) { best.inferred = true; best.since = mine.since; }
      } else if (lg) best = { blocked: lg.blocked, t: lg.t, type: lg.type, who: lg.who, uncertain: !!lg.uncertain };
      // A blocked automation does not move. When the gate controller reported a movement after the Block (and after the movement that the Block
      // itself may have started: "Open and Block"), the Block was lifted since, by whoever and however: the Release is not always in the log (it is
      // forgotten when the accessory restarts, and not every app shows up in it). That is what a gate that Home Assistant opens, and that then
      // closes by itself, says about a "Blocked" that is still on the screen.
      var drive = c && c.a && c.a.drive;
      if (best && best.blocked && drive && drive.t > best.t + TRAVEL_MS) {
        best = { blocked: false, t: drive.t, type: drive.type, who: 'Gate controller', uncertain: false, inferred: true, since: best.t };
      }
      var restarted = c && c.a && c.a.health.restart.last;
      if (best && restarted != null && restarted > best.t) best.uncertain = true;      // the accessory restarted after it: a Release since then would not be in the log
      return best;
    }
    // What is known about blocking is kept with this phone's own commands. The log is forgotten when the accessory restarts, and a Block that was
    // lifted in the meantime (by the official app, say) would otherwise come back from this phone's old record as if it still held.
    function remember(device) {
      try {
        var mac = device && device.mac, b = mac && blockInfo(device);
        if (!b) return;
        var all = readBlock(), mine = all[mac], rec = { blocked: !!b.blocked, at: b.t, code: b.type, who: b.who || '' };
        if (b.inferred) { rec.inferred = true; rec.since = b.since; }
        if (mine && mine.blocked === rec.blocked && mine.at === rec.at && mine.code === rec.code && !!mine.inferred === !!rec.inferred) return;
        all[mac] = rec;
        writeBlock(all);
        log('block: kept ' + (rec.blocked ? 'blocked' : 'not blocked') + ' (' + (rec.inferred ? 'the gate moved after the Block' : 'from the log') + ')');
      } catch (e) { log('activity', String(e)); }
    }
    function sinceText(t) { var w = when(t, Date.now()); return w.indexOf('today ') === 0 ? w.slice(6) : w; }
    // the pill on the accessory screen ('' when there is nothing to say); "Maybe blocked" when the accessory restarted after the Block (nxBlockMaybe: the pill is dashed then)
    $rootScope.nxBlock = function (device) {
      var b = blockInfo(device);
      return (b && b.blocked) ? (b.uncertain ? NX_WORDS.maybeBlocked : NX_WORDS.blocked) + ' · ' + NX_WORDS.since + ' ' + sinceText(b.t) : '';
    };
    $rootScope.nxBlockMaybe = function (device) { var b = blockInfo(device); return !!(b && b.blocked && b.uncertain); };

    // The state that the accessory reports can be out of date. A gate does not take minutes to open: a report of "opening" (or "closing") that
    // began longer ago than that, with nothing in the accessory's log that stopped, blocked or reversed it since, is stale. The gate has finished:
    // it is open (or closed). It was seen with a gate that was opened with "Open and Block": the app stayed on "Opening". The state is shown as
    // settled, with a note, only while the report stays the same; an event of the accessory or a command from this phone clears it.
    function rawValue(device) { var p = device && device.properties; return p && p[0] ? p[0].value : undefined; }
    function transient(device) { var v = rawValue(device); return v != null && !!TRANSIENT[String(v)]; }
    function settledOf(device) {
      var mac = device && device.mac;
      if (!mac || !transient(device)) return null;
      var raw = String(rawValue(device)), c = cache[mac];
      if (!c) return null;
      if (c.settle && c.settle.raw === raw) return c.settle;
      var now = Date.now(), m = c.a && c.a.lastMovement;
      if (c.at < (movedAt[mac] || 0)) return null;                                   // the reading is older than the latest event or command: it knows nothing of that
      if (now - c.at > 120000 || !m || now - m.t < TRAVEL_MS) return null;           // only on a recent reading, and when the movement is long over
      var to = (raw === 'opening' && m.kind === 'open') ? 'open' : (raw === 'closing' && m.kind === 'close') ? 'closed' : null;
      if (!to) return null;
      c.settle = { raw: raw, to: to, since: m.t };
      if (settleLogged[mac] !== raw + '|' + m.t) {
        settleLogged[mac] = raw + '|' + m.t;
        log('state: "' + raw + '" is out of date (the last movement in the log is ' + m.type + ', ' + when(m.t, now) + '); shown as ' + to);
      }
      return c.settle;
    }
    // A value that the app has no word for ("partial", nothing at all) used to be printed as its raw key at 44 px, and the hero kept the calm look of a closed
    // gate. It is 'unknown' now, which the app has a word for ("Unknown") and the hero a look for.
    var KNOWN_STATES = { open: 1, closed: 1, opening: 1, closing: 1, stopped: 1, unknown: 1 };
    function knownState(v) { return v != null && KNOWN_STATES.hasOwnProperty(String(v)) ? String(v) : 'unknown'; }
    $rootScope.nxState = function (device) { var st = settledOf(device); return st ? st.to : (device ? knownState(rawValue(device)) : rawValue(device)); };
    $rootScope.nxSettled = function (device) {
      var st = settledOf(device);
      if (!st) return '';
      var key = 'DEVICE_STATE_' + st.raw, name = '';
      try { name = inj.has('$translate') ? inj.get('$translate').instant(key) : ''; } catch (e) {}
      return NX_WORDS.settled.replace('{state}', (name && name !== key) ? name : st.raw);
    };
    var ICON_TYPES = { sectional: 'i_gat006', 'up-and-over': 'i_gat002', swing: 'i_gat003', sliding: 'i_gat005', barrier: 'i_gat001' };
    // the class of the icon in the app's own form ("icon-i_gat005 open status-0"), when the state is settled, or when the report is none that the app knows (the
    // app's function would put the raw value in the class, and no rule of the hero matches it): otherwise the app's own function decides
    $rootScope.nxIcon = function (device) {
      var st = settledOf(device), unknown = !st && !!device && !KNOWN_STATES.hasOwnProperty(String(rawValue(device)));
      if (!st && !unknown) return '';
      var a0 = device.automations && device.automations[0], p = device.properties;
      return 'icon-' + (ICON_TYPES[a0 && a0.type] || 'i_undefined') + ' ' + (st ? st.to : 'unknown') + ' status-' + (p && p[1] ? p[1].value : 'undefined');
    };
    // "Gate state unknown" under the state word: nothing says what the gate is doing. That is the case when the accessory cannot be reached ("Not usable"; while the
    // app checks or connects, the state line says so itself) and when it reports a state that nobody knows. '' otherwise.
    $rootScope.nxUnknown = function (device) {
      try {
        if (!device) return '';
        var live = (ctx.liveDevice && ctx.liveDevice(device.homeId, device.mac)) || device;
        if (live.reachable === false) return $rootScope.nxCheck && $rootScope.nxCheck(live) ? '' : NX_WORDS.unknown;
        return $rootScope.nxState(device) === 'unknown' ? NX_WORDS.unknown : '';
      } catch (e) { return ''; }
    };

    // a reading that is planned (the key says why; a new plan with the same key replaces the old one)
    function planReading(device, ms, key, onlyIf) {
      var mac = device && device.mac;
      if (!mac) return;
      var t = timers[mac] = timers[mac] || {};
      clearTimeout(t[key]);
      t[key] = setTimeout(function () {
        try { if (!onlyIf || onlyIf()) refresh(device, null, { why: key, quiet: true, retry: key !== 'retry' && key !== 'travel' }); } catch (e) { log('activity', String(e)); }
      }, ms);
    }
    // a command that this phone gave: what was settled no longer holds, Block and Release are kept, the log is read a little later (it has the
    // command and the movement within a second) and, if the gate is still said to be moving after the travel time, once more
    function onCommand(device, code, kind) {
      try {
        var mac = device && device.mac;
        if (!mac) return;
        if (cache[mac]) cache[mac].settle = null;
        movedAt[mac] = Date.now();
        if (BLOCKING[code] || RELEASING[code]) {
          var all = readBlock();
          all[mac] = { blocked: !!BLOCKING[code], at: Date.now(), code: code, who: device.pairingUsername || '' };
          writeBlock(all);
          log('block: ' + (BLOCKING[code] ? 'blocked' : 'released') + ' (' + code + ')');
        }
        digest();
        planReading(device, AFTER_MS, 'after');
        planReading(device, TRAVEL_MS + MARGIN_MS, 'travel', function () { return transient(device); });
      } catch (e) { log('activity', String(e)); }
    }
    // a report of the accessory about the state, as an event (the app is connected) or as the answer to a status request
    function stateSeen(device, state, fromEvent) {
      try {
        if (!device) return;
        if (fromEvent) { movedAt[device.mac] = Date.now(); if (cache[device.mac]) cache[device.mac].settle = null; }
        if (TRANSIENT[state]) planReading(device, TRAVEL_MS + MARGIN_MS, 'travel', function () { return transient(device); });
        else if (timers[device.mac]) clearTimeout(timers[device.mac].travel);
      } catch (e) {}
    }
    function onEvent(ev) {
      try {
        var device = ctx.findDevice ? ctx.findDevice(ev && ev.mac) : null;
        log('state: event ' + (ev && ev.mac) + ' ' + (ev && ev.state) + ', obstruct ' + (ev && ev.obstruct));
        stateSeen(device, ev && ev.state, true);
        // The gate moves, so someone gave it a command: this phone, another phone, another app (the official one), the schedule, a remote control.
        // The command is in the log by now, and so is a Block or Release that came with it ("Release and Close"). A report that follows the
        // first one (the end of the movement) replaces this plan, so that it is one reading in the end.
        if (device) planReading(device, EVENT_MS, 'event', visible);
        digest();
      } catch (e) { log('activity', String(e)); }
    }
    // what the accessory says when the app asks for its status, in the LOG (the properties it declares only once): this is what is needed to see
    // whether it reports more than the state and the obstruction, and what it says when the app shows something odd
    function onStatus(device, res) {
      try {
        if (!device) return;
        var props = asList(res && res.devices && res.devices[0] && res.devices[0].properties);
        log('state: status of ' + device.mac + ' says [' + props.map(function (p) { return (p && p.name ? p.name + '=' : '') + (p ? p.value : '?'); }).join(', ') + ']');
        if (!declaredLogged[device.mac] && device.automations && device.automations[0]) {
          declaredLogged[device.mac] = true;
          var a0 = device.automations[0];
          var names = function (list) { return asList(list).map(function (p) { return p && p.name ? p.name + (p.permissions ? ' ' + p.permissions : '') : '?'; }).join(', '); };
          log('state: the accessory declares services [' + names(a0.services) + '] properties [' + names(a0.properties) + '], type ' + a0.type + ', product ' + a0.product);
        }
        var st = props[0] && props[0].value;
        stateSeen(device, st, false);
        // an "opening" or "closing" at the moment the screen is shown: the log decides whether that is still true (unless it was read a moment ago)
        var c = cache[device.mac];
        if (TRANSIENT[st] && (!c || Date.now() - c.at > 20000)) { refresh(device, null, { why: 'status', quiet: true, retry: true }); return; }
        // Whatever it says: the app asks when the screen is entered and when the app comes back to the front, and something may have been done
        // with the gate in the meantime (by another app, another phone, the schedule). The state the accessory reports does not tell whether it is
        // blocked, the log does: read it, unless that was done a moment ago.
        if (shown && shown.mac === device.mac) {
          planReading(device, STATUS_MS, 'status', function () { var k = cache[device.mac]; return visible() && (!k || Date.now() - k.at >= MAX_AGE); });
        }
      } catch (e) { log('activity', String(e)); }
    }

    // ------------------------------------------------------------ the line on the accessory screen
    $rootScope.nxActivity = function (device) { openSheet(device); };
    // the last command, from the log (the time is worked out now, not when the log was read)
    $rootScope.nxLast = function (device) { var c = device && cache[device.mac]; return c ? lastLine(c.a, label, Date.now()) : ''; };
    // ---- nx23 gate: begin
    // the entry on the accessory screen: what a screen reader says for it (the visible text starts with "Last command:"), when the log was read if that was a while
    // ago (a reading that fails leaves the line as it was), and whether the app has more than one home (the name of the home is shown only then)
    var LOG_STALE_MS = window.__nxActivityStaleMs != null ? window.__nxActivityStaleMs : 60000;
    $rootScope.nxLastStale = function (device) { var c = device && cache[device.mac]; return (c && Date.now() - c.at > LOG_STALE_MS) ? hhmm(c.at) : ''; };
    $rootScope.nxLastSpoken = function (device) {
      var c = device && cache[device.mac], e = c && c.a && c.a.last && c.a.last.command;
      if (!e) return 'Activity. Opens the history.';
      var stale = $rootScope.nxLastStale(device);
      return 'Activity. Last command: ' + label(e.type) + (e.who ? ' by ' + e.who : '') + ', ' + when(e.t, Date.now()) + (stale ? ' (log read at ' + stale + ')' : '') + '. Opens the history.';
    };
    $rootScope.nxManyHomes = function () {
      try { var hs = inj.has('HomeService') ? inj.get('HomeService').homes : null; return Array.isArray(hs) && hs.length > 1; } catch (e) { return false; }
    };
    // ---- nx23 gate: end

    // The accessory screen that is open ({ homeId, mac }; null on other screens), and what is read while it is: the log, now and then, so that the
    // line and the pill follow what other apps and phones do with the gate.
    var shown = null, pollTimer = null;
    function screenDevice() { return shown ? ctx.liveDevice(shown.homeId, shown.mac) : null; }
    // the app is checking the accessory, or trying to connect to it again (nx-patch.js: nxCheck 'checking' or 'retry'): not the moment to ask it for more
    function attemptRunning(device) { var c = $rootScope.nxCheck && $rootScope.nxCheck(device); return c === 'checking' || c === 'retry'; }
    function armPoll() { if (pollTimer == null && POLL_MS > 0) pollTimer = setTimeout(pollTick, POLL_MS); }
    function disarmPoll() { clearTimeout(pollTimer); pollTimer = null; }
    function pollTick() {
      pollTimer = null;
      try {
        var device = screenDevice();
        if (!device) return;                                                    // the screen has been left: the next visit starts it again
        armPoll();
        if (!visible() || isOpen) return;                                       // in the background, or the sheet has its own reading
        if (device.reachable === false) return;
        if (attemptRunning(device)) return;
        readIfStale(device, MIN_GAP_MS, 'poll', true);
      } catch (e) { log('activity', String(e)); }
    }
    // the app comes back to the front (Cordova: resume): something may have been done with the gate meanwhile, by the official app for instance
    // (a reading from before that is no use, so only one of the last two seconds is as good as a new one; the page that says "visible" and the
    // event "resume" come together, and one reading serves both)
    function comeBack() {
      setTimeout(function () {
        try {
          if (!visible()) return;
          if (isOpen && current) {                                              // the sheet was open when the app left: it shows what it showed then
            var seen = cache[current.mac];
            if (!seen || Date.now() - seen.at >= Math.min(MIN_GAP_MS, 2000)) load();
            return;
          }
          var device = screenDevice();
          if (device) readIfStale(device, Math.min(MIN_GAP_MS, 2000), 'resume');
        } catch (e) { log('activity', String(e)); }
      }, RESUME_MS);
    }
    document.addEventListener('resume', comeBack, false);
    document.addEventListener('visibilitychange', function () { if (visible()) comeBack(); }, false);

    // looking at the accessory screen for a moment reads the log (unless that was done a moment ago), so that the line is there; it is also where the
    // reading on a timer starts (read-only, like the app's own history page)
    $rootScope.$on('$stateChangeSuccess', function (ev, toState, toParams) {
      try {
        var device = (/device-detail$/.test((toState && toState.name) || '') && toParams) ? ctx.liveDevice(toParams.homeId, toParams.mac) : null;
        if (!device) { shown = null; disarmPoll(); return; }
        shown = { homeId: toParams.homeId, mac: device.mac };
        armPoll();
        if (cache[device.mac]) cache[device.mac].settle = null;                          // a new look: decide again, from a fresh reading
        setTimeout(function () {
          try {
            var c = cache[device.mac];
            if (c && Date.now() - c.at < MAX_AGE && !(transient(device) && Date.now() - c.at > 20000)) return;
            if (device.reachable === false) return;
            if (attemptRunning(device)) return;
            if (inj.has('$state') && inj.get('$state').params && inj.get('$state').params.mac !== device.mac) return;     // gone from this screen
            refresh(device, null, { why: 'screen', quiet: true, retry: true });
          } catch (e) { log('activity', String(e)); }
        }, PREFETCH_MS);
      } catch (e) { log('activity', String(e)); }
    });

    // ------------------------------------------------------------ the sheet
    function build() {
      if (panel) return;
      scrim = document.createElement('div');
      scrim.className = 'nx-scrim';
      scrim.style.display = 'none';
      scrim.addEventListener('click', closeSheet);
      panel = document.createElement('div');
      panel.id = 'nx-activity';
      panel.className = 'nx-sheet nx-act';
      panel.style.display = 'none';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Activity');
      panel.innerHTML =
        '<div class="nx-handle"><div class="nx-progress m3e-progress m3e-indet" aria-hidden="true"><i></i><b></b></div></div>' +
        '<div class="nx-act-head"><div class="nx-act-titles"><h2 class="nx-act-title">Activity</h2><div class="nx-act-sub" id="nx-act-sub"></div></div>' +
        '<button type="button" class="nx-act-refresh" aria-label="Refresh"></button></div>' +
        '<div id="nx-act-body"></div>' +
        '<div class="nx-more"><button type="button" class="nx-act-copy">Copy the log</button></div>' +
        '<div class="nx-footer nx-act-footer"><button type="button" class="nx-text nx-act-close">Done</button></div>';
      body = panel.querySelector('#nx-act-body');
      sub = panel.querySelector('#nx-act-sub');
      btnRefresh = panel.querySelector('.nx-act-refresh');
      copyRow = panel.querySelector('.nx-more');
      btnRefresh.addEventListener('click', function () { load(true); });
      panel.querySelector('.nx-act-close').addEventListener('click', closeSheet);
      panel.querySelector('.nx-act-copy').addEventListener('click', function () {
        var c = current && cache[current.mac];
        if (!c) { toast('Nothing to copy yet.'); return; }
        if (ctx.copy) ctx.copy(rawText(c.raw, c.at));
      });
      body.addEventListener('click', function (e) {
        var t = e.target, b = t && t.closest ? t.closest('button') : t, cl = b && b.classList;
        if (!cl) return;
        if (cl.contains('nx-act-all')) { showAll = true; render(); }
        else if (cl.contains('nx-act-less')) {                       // nx23 activity: back to the latest events, and the view with them
          showAll = false; render();
          try { var hd = body.querySelector('.nx-act-h'); panel.scrollTop = hd ? Math.max(0, hd.offsetTop - 40) : 0; } catch (x) {}
        } else if (cl.contains('nx-act-retry')) load(true);
        else if (cl.contains('nx-act-status')) {                     // nx23 activity: the way out of an error card: the connection status, with its diagnosis
          closeSheet();
          try { if (window.NX && window.NX.open) { window.NX.open(); if (window.NX.diagnose) window.NX.diagnose(); } } catch (x) { log('activity', String(x)); }
        } else if (b.getAttribute && b.getAttribute('data-scope')) {  // nx23 activity: the period of the charts
          scope = b.getAttribute('data-scope') === 'all' ? 'all' : '7';
          render();
          if (e.detail === 0) {                                      // a key, or an assistive technology: the focus stays on the button (a touch needs no ring)
            try { var again = body.querySelector('[data-scope="' + scope + '"]'); if (again && again.focus) again.focus(); } catch (x) {}
          }
        }
      });
      // dragging down closes the sheet (only from the top of the content)
      var drag = null;
      panel.addEventListener('touchstart', function (e) {
        if (panel.scrollTop > 0 || !e.touches || !e.touches[0]) { drag = null; return; }
        drag = { y: e.touches[0].clientY, dy: 0, t: Date.now() };
      }, { passive: true });
      panel.addEventListener('touchmove', function (e) {
        if (!drag || !e.touches || !e.touches[0]) return;
        var dy = e.touches[0].clientY - drag.y;
        if (dy <= 0) { drag.dy = 0; panel.style.transform = ''; return; }
        drag.dy = dy;
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
      panel.addEventListener('touchend', function () {
        if (!drag) return;
        var s = drag;
        drag = null;
        panel.style.transition = '';
        if (s.dy > 110 || (s.dy > 40 && Date.now() - s.t < 220)) closeSheet(); else panel.style.transform = '';
      }, { passive: true });
      // Android's back button closes the sheet first (capture phase, so the app's own back handler does not fire as well)
      document.addEventListener('backbutton', function (e) {
        if (!isOpen) return;
        try { e.stopImmediatePropagation(); e.preventDefault(); } catch (x) {}
        closeSheet();
      }, true);
      document.body.appendChild(scrim);
      document.body.appendChild(panel);
    }

    // nx23 activity: the card for a reading that failed (or a sheet that could not be drawn): the cause in one sentence, what to do, the details folded
    function errorCard(title, cause, detail, withStatus) {
      return '<div class="nx-card nx-act-error" role="alert"><b>' + esc(title) + '</b><span>' + esc(cause) + '</span><div class="nx-act-actions">' +
        '<button type="button" class="nx-act-retry">Try again</button>' +
        (withStatus && window.NX && window.NX.open ? '<button type="button" class="nx-act-status">Open connection status</button>' : '') + '</div>' +
        (detail ? '<details class="nx-details nx-act-tech"><summary>Technical details</summary><pre>' + esc(detail) + '</pre></details>' : '') + '</div>';
    }
    function hasEntries(raw) { return !!raw && (asList(raw.deviceLogs).length + asList(raw.interfaceLogs).length) > 0; }
    function render(error) {
      try { draw(error); } catch (e) {
        log('activity: could not show it', String(e));
        try { body.innerHTML = errorCard('Could not show the history', 'Something went wrong while drawing it.', String(e), false); } catch (x) {}
      }
    }
    function draw(error) {
      var c = current && cache[current.mac];
      var name = (current && (current.description || current.name)) || '';
      copyRow.style.display = (c && hasEntries(c.raw)) ? '' : 'none';      // nothing to copy before the log has been read, or when it has no entries at all
      if (c) {
        var a = c.a;
        sub.textContent = name + (a.span ? (name ? ' · ' : '') + plural(a.span.count, 'event') + ' over ' + spanText(a.now - a.span.oldest) : '');
        body.innerHTML = renderHtml(a, label, { all: showAll, block: blockInfo(current), scope: scope });
      } else if (error) {
        sub.textContent = name;
        var why = errorParts(error);
        body.innerHTML = errorCard('Could not read the history', why.cause, why.detail, true);
      } else {
        sub.textContent = name;
        body.innerHTML = '<div class="nx-card nx-act-empty" role="status"><span>Reading the accessory’s log…</span>' +
          (slow ? '<span>Still waiting: the accessory is slow to answer.' + (TIMEOUT >= 2000 ? ' It gives up after ' + Math.round(TIMEOUT / 1000) + ' seconds.' : '') + '</span>' : '') + '</div>';
      }
    }
    function load(force) {
      if (!current) return;
      var device = current;
      panel.classList.add('nx-busy');
      clearTimeout(slowTimer); slow = false;
      slowTimer = setTimeout(function () {                        // nx23 activity: nothing on screen yet and it takes a while: say so
        if (current === device && !cache[device.mac] && panel.classList.contains('nx-busy')) { slow = true; render(); }
      }, SLOW_MS);
      refresh(device, function (err) {
        clearTimeout(slowTimer); slow = false;
        if (current !== device) return;
        panel.classList.remove('nx-busy');
        if (err) {
          if (cache[device.mac]) toast('Could not refresh the history.'); else render(err);
          return;
        }
        render();
      });
    }
    function openSheet(device) {
      try {
        if (!device || !device.mac) { toast('No accessory.'); return; }
        build();
        try { if (window.NX && window.NX.close) window.NX.close(); } catch (e) {}     // one sheet at a time
        current = device;
        showAll = false;
        scope = '7';
        render();
        if (!isOpen) {
          isOpen = true;
          scrim.style.display = 'block';
          panel.style.display = 'flex';                           // nx23 activity: a column, so that the footer stays at the bottom of a short sheet
          panel.scrollTop = 0;
          var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
          raf(function () { raf(function () {
            if (!isOpen) return;
            panel.classList.add('nx-open');
            scrim.classList.add('nx-open');
          }); });
        }
        load(true);
      } catch (e) { log('activity', String(e)); }
    }
    function closeSheet() {
      if (!isOpen || !panel) return;
      isOpen = false;
      panel.classList.remove('nx-open');
      scrim.classList.remove('nx-open');
      panel.style.transform = '';
      setTimeout(function () {
        if (isOpen) return;
        panel.style.display = 'none';
        scrim.style.display = 'none';
      }, 420);
    }

    return { open: openSheet, close: closeSheet, refresh: refresh, cache: cache, isOpen: function () { return isOpen; },
      onCommand: onCommand, onStatus: onStatus, onEvent: onEvent, blockInfo: blockInfo };
  };
})();
