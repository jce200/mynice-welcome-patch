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

  // ======================================================================== 1. the data, without a DOM
  var MIN_TIME = Date.UTC(2015, 0, 1);     // a module whose clock was never set reports 1970 or 2000: that is no time
  var DAY = 86400000;
  var MAX_EVENTS = 5000;                   // more than this is not read (the newest are kept)
  var ECHO_MS = 5000;                      // the gate controller repeats a command it was given within this time as a movement of its own
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
        var again = lastRestart != null && e.t - lastRestart < 120000;
        lastRestart = e.t;
        if (again) { h.last = e.t; return; }
        if (h.first == null) h.first = e.t;
      }
      // right after a start the module cannot see the gate controller yet ("T4 device not found", then "found"): that is not a fault
      if (e.k === 'bus' && lastRestart != null && e.t - lastRestart < 120000) { h.atStart++; return; }
      h.count++;
      h.last = e.t;
    });
    // a restart after the last Block or Release command: whether the block survived it is not known
    if (block && health.restart.last != null && health.restart.last > block.t) block.uncertain = true;

    // how far back the log goes (all events with a usable time)
    var span = null, lo = null, hi = null;
    events.forEach(function (e) { if (lo == null || e.t < lo) lo = e.t; if (hi == null || e.t > hi) hi = e.t; });
    moduleTimes.forEach(function (t) { if (lo == null || t < lo) lo = t; if (hi == null || t > hi) hi = t; });
    if (lo != null) span = { oldest: lo, newest: hi, count: events.length + moduleTimes.length, days: Math.max(1, Math.round((hi - lo) / DAY)) };
    // the log seems to begin when the accessory last started (the oldest entry is that start): older events are forgotten at a restart
    var logStart = (span && health.restart.first != null && Math.abs(span.oldest - health.restart.first) < 120000) ? health.restart.first : null;

    return { now: now, events: events, commands: commands, obstructions: obstructions, days: days, hours: hours,
      peak: peak >= 0 ? { hour: peak, count: peakCount } : null, byWho: byWho, totals: totals, last: last, health: health, span: span, skipped: skipped,
      hasModuleEvents: moduleTimes.length > 0, echoes: echoes, lastMovement: lastMovement, block: block, logStart: logStart };
  }

  // the line on the accessory screen: the last command, when and by whom
  function lastLine(a, label) {
    var e = a && a.last && a.last.command;
    if (!e) return '';
    return (label ? label(e.type) : e.type) + ' · ' + when(e.t, a.now) + (e.who ? ' · ' + e.who : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }

  // the body of the sheet as HTML (label: type -> the app's text for it). opts.all: the whole history, not only the newest entries.
  var TIMELINE_SHORT = 25, TIMELINE_LONG = 300;
  function renderHtml(a, label, opts) {
    opts = opts || {};
    label = label || function (t) { return NAMES[t] || t; };
    var h = [], now = a.now;
    if (!a.span) {
      return '<div class="nx-card nx-act-empty"><b>Nothing in the log yet</b><span>The accessory has no events with a usable time. ' +
        'Give it a command and look again.</span></div>';
    }

    // ---- blocked? Only what the last Block or Release command says: the accessory itself has no state for it
    var bl = opts.block !== undefined ? opts.block : a.block;
    if (bl && bl.blocked) {
      h.push('<div class="nx-card nx-act-block nx-blocked"><i class="nx-block-icon" aria-hidden="true"></i><div><b>Blocked' + (bl.uncertain ? '?' : '') + '</b><span>since ' +
        esc(when(bl.t, now)) + ' \u00b7 ' + esc(label(bl.type)) + (bl.who ? ' \u00b7 ' + esc(bl.who) : '') + '</span><em>The last Block command, not a measurement: a block that was lifted at ' +
        'the gate controller itself is not seen here.' + (bl.uncertain ? ' The accessory restarted after it, and whether a block survives that is not known.' : '') + '</em></div></div>');
    } else if (bl) {
      h.push('<div class="nx-card nx-act-block"><i class="nx-block-icon" aria-hidden="true"></i><div><b>Not blocked, as far as the log shows</b><span>last Release command ' +
        esc(when(bl.t, now)) + ' \u00b7 ' + esc(label(bl.type)) + (bl.who ? ' \u00b7 ' + esc(bl.who) : '') + '</span></div></div>');
    }

    // ---- tiles
    function tile(cls, title, value, sub) {
      return '<div class="nx-tile ' + cls + '"><small>' + esc(title) + '</small><b>' + esc(value) + '</b><span>' + esc(sub) + '</span></div>';
    }
    var lo = a.last.open, lc = a.last.close, ob = a.obstructions;
    h.push('<div class="nx-tiles">' +
      tile('nx-t-open', 'Last opened', lo ? when(lo.t, now) : '–', lo ? lo.who : 'not in the log') +
      tile('nx-t-close', 'Last closed', lc ? when(lc.t, now) : '–', lc ? lc.who : 'not in the log') +
      tile('nx-t-count', 'Commands, 7 days', String(a.totals.d7), plural(a.totals.h24, 'command') + ' in 24 h') +
      tile(ob.length ? 'nx-t-obst nx-t-warn' : 'nx-t-obst', 'Obstructions', String(ob.length), ob.length ? 'last ' + when(ob[0].t, now) : 'none in the log') +
      '</div>');

    // ---- per day
    var maxDay = 0;
    a.days.forEach(function (d) { if (d.total > maxDay) maxDay = d.total; });
    var cols = a.days.map(function (d) {
      var t = new Date(d.n * DAY), nm = WEEKDAYS[t.getUTCDay()] + ' ' + t.getUTCDate() + ' ' + MONTHS[t.getUTCMonth()];
      var pct = d.total ? Math.max(6, Math.round(d.total / maxDay * 100)) : 0;
      return '<div class="nx-col' + (d.n === dayNumber(now) ? ' nx-today' : '') + '" title="' + esc(nm + ': ' + plural(d.total, 'command')) + '">' +
        (d.total ? '<div class="nx-stack" style="height:' + pct + '%"><i class="nx-b-rest" style="flex:' + d.rest + '"></i><i class="nx-b-close" style="flex:' + d.close +
          '"></i><i class="nx-b-open" style="flex:' + d.open + '"></i></div>' : '<div class="nx-stack nx-zero"></div>') + '</div>';
    });
    var axis = a.days.map(function (d) { return '<small' + (d.n === dayNumber(now) ? ' class="nx-today"' : '') + '>' + WEEKDAYS[new Date(d.n * DAY).getUTCDay()].charAt(0) + '</small>'; });
    var spoken = a.days.map(function (d) { var t = new Date(d.n * DAY); return WEEKDAYS[t.getUTCDay()] + ' ' + d.total; }).join(', ');
    h.push('<h3 class="nx-act-h">Commands per day</h3><div class="nx-card">' +
      '<div class="nx-bars" role="img" aria-label="Commands per day, the last 14 days: ' + esc(spoken) + '">' + cols.join('') + '</div>' +
      '<div class="nx-axis">' + axis.join('') + '</div>' +
      '<div class="nx-legend"><span class="nx-lg nx-lg-open">Open</span><span class="nx-lg nx-lg-close">Close</span><span class="nx-lg nx-lg-rest">Other</span></div></div>');

    // ---- who
    if (a.byWho.length) {
      var top = a.byWho.slice(0, 5), rest = 0;
      a.byWho.slice(5).forEach(function (w) { rest += w.count; });
      if (rest) top.push({ who: 'Others', count: rest });
      var maxWho = top[0].count;
      h.push('<h3 class="nx-act-h">Who</h3><ul class="nx-card nx-whos">' + top.map(function (w) {
        return '<li><span class="nx-w-name">' + esc(w.who) + '</span><span class="nx-w-bar"><i style="width:' + Math.max(4, Math.round(w.count / maxWho * 100)) +
          '%"></i></span><b>' + w.count + '</b></li>';
      }).join('') + '</ul>');
    }

    // ---- hours
    if (a.peak) {
      var bars = a.hours.map(function (c, hr) {
        return '<i class="' + (hr === a.peak.hour ? 'nx-peak' : '') + '" style="height:' + (c ? Math.max(6, Math.round(c / a.peak.count * 100)) : 0) + '%" title="' +
          pad(hr) + ':00 – ' + plural(c, 'command') + '"></i>';
      });
      h.push('<h3 class="nx-act-h">Busy hours</h3><div class="nx-card"><div class="nx-hours" role="img" aria-label="Commands by hour of the day; the busiest hour is ' + pad(a.peak.hour) +
        ':00">' + bars.join('') + '</div><div class="nx-axis nx-axis-h"><small>0</small><small>6</small><small>12</small><small>18</small><small>24</small></div>' +
        '<p class="nx-act-note">Busiest around ' + pad(a.peak.hour) + ':00 (' + plural(a.peak.count, 'command') + ' in the log).</p></div>');
    }

    // ---- the Wi-Fi module
    var hl = a.health;
    function hrow(k, icon, title, bad, none) {   // bad: how a count above zero looks (warn or fail); none: what to say at zero
      var c = hl[k];
      return '<li class="nx-fact ' + (c.count ? 'nx-s-' + bad : 'nx-s-ok') + '"><span class="nx-fi nx-i-' + icon + '"></span><div><b>' + esc(title) + '</b><span>' +
        esc(c.count ? 'last ' + when(c.last, now) : none || 'none in the log') + '</span></div><em>' + c.count + '</em></li>';
    }
    h.push('<h3 class="nx-act-h">Wi-Fi module</h3>');
    if (a.hasModuleEvents) {
      h.push('<ul class="nx-facts">' +
        hrow('restart', 'restart', 'Restarts', 'warn') +
        hrow('wifi', 'wifioff', 'Wi-Fi lost', 'warn') +
        hrow('error', 'warn', 'Errors', 'fail') +
        hrow('bus', 'gate', 'Gate controller lost', 'warn', hl.bus.atStart ? 'only while the accessory was starting' : 'none in the log') + '</ul>');
    } else {
      h.push('<div class="nx-card nx-act-empty"><span>The log has no events of the module itself.</span></div>');
    }

    // ---- history
    var list = a.events, shown = opts.all ? list.slice(0, TIMELINE_LONG) : list.slice(0, TIMELINE_SHORT);
    h.push('<h3 class="nx-act-h">History</h3>');
    if (shown.length) {
      var rows = [], prev = null;
      shown.forEach(function (e) {
        var dn = dayNumber(e.t);
        if (dn !== prev) { rows.push('<li class="nx-tl-day">' + esc(dayName(e.t, now)) + '</li>'); prev = dn; }
        rows.push('<li class="nx-tl-row nx-k-' + e.kind + '"><time>' + hhmm(e.t) + '</time><span class="nx-tl-what">' + esc(label(e.type)) + '</span><span class="nx-tl-who">' +
          esc(e.who) + '</span></li>');
      });
      h.push('<ul class="nx-card nx-tl">' + rows.join('') + '</ul>');
      if (!opts.all && list.length > shown.length) h.push('<button type="button" class="nx-act-all">Show ' + Math.min(list.length, TIMELINE_LONG) + ' events</button>');
    } else {
      h.push('<div class="nx-card nx-act-empty"><span>No commands in the log.</span></div>');
    }

    // ---- where this comes from
    h.push('<p class="nx-act-note">From the accessory’s own event log, as in the app’s Historian, with the accessory’s clock. ' +
      'It keeps a limited number of events: ' + plural(a.span.count, 'event') + ', from ' + esc(when(a.span.oldest, now)) + ' (about ' + plural(a.span.days, 'day') + ').' +
      (a.logStart ? ' The log begins when the accessory started (' + esc(when(a.logStart, now)) + '): it seems to forget older events at a restart.' : '') +
      (a.echoes ? ' ' + plural(a.echoes, 'movement') + ' that the gate controller reported right after a command ' + (a.echoes === 1 ? 'is' : 'are') + ' shown once, with the command.' : '') +
      (a.skipped ? ' ' + plural(a.skipped, 'entry', 'entries') + ' without a usable time left out.' : '') + '</p>');
    return h.join('');
  }

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
      analyze: analyze, lastLine: lastLine, renderHtml: renderHtml, rawText: rawText, summary: summary };
  }
  if (typeof window === 'undefined' || !window.document) return;      // (no browser: only the functions above)

  // ======================================================================== 2. the sheet (nx-patch.js calls this once the app is up)
  // ctx: { inj, $rootScope, NHK, log, toast, liveDevice, copy }
  window.__nxActivity = function (ctx) {
    var inj = ctx.inj, $rootScope = ctx.$rootScope, NHK = ctx.NHK;
    var log = ctx.log || function () {}, toast = ctx.toast || function () {};
    var PREFETCH_MS = window.__nxActivityPrefetchMs != null ? window.__nxActivityPrefetchMs : 2500;    // looking at the accessory screen this long: read the log
    var MAX_AGE = window.__nxActivityMaxAge != null ? window.__nxActivityMaxAge : 10 * 60 * 1000;       // ...unless it was read less than this long ago
    var TIMEOUT = window.__nxActivityTimeoutMs != null ? window.__nxActivityTimeoutMs : 20000;          // the accessory does not answer
    var cache = {};              // mac -> { at, a, line, raw }
    var waiting = {};            // mac -> callbacks of a read that is running
    var panel = null, scrim = null, body = null, sub = null, btnRefresh = null, copyRow = null;
    var isOpen = false, current = null, showAll = false;

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
    function errorText(err) {
      try {
        if (err == null) return '';
        if (typeof err === 'string') return err;
        var key = 'NHK_ERROR-' + err.code;
        var t = (err.code != null && inj.has('$translate')) ? inj.get('$translate').instant(key) : '';
        var why = (t && t !== key) ? t : (err.message ? String(err.message) : '');
        return why + (err.code != null ? ' (' + err.code + ')' : '');
      } catch (e) { return ''; }
    }

    // the log and the users, both optional apart from the log itself; one answer or one failure
    function fetchLog(device, done) {
      var finished = false, res = null, users = null, left = 2;
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
      try {
        NHK.pairings(device).then(function (r) { users = r && r.activeUsers; step(); },
          function (e) { log('activity: users not read', JSON.stringify(e)); step(); });     // without them the users show as "Other (...)"
      } catch (e) { step(); }
    }
    function refresh(device, cb) {
      var mac = device && device.mac;
      if (!mac) { if (cb) cb({ message: 'No accessory' }); return; }
      if (waiting[mac]) { if (cb) waiting[mac].push(cb); return; }
      waiting[mac] = cb ? [cb] : [];
      fetchLog(device, function (err, res, users) {
        var cbs = waiting[mac] || [];
        delete waiting[mac];
        if (err) { log('activity: could not read the log', JSON.stringify(err)); cbs.forEach(function (f) { f(err); }); return; }
        var a = analyze(res, users, Date.now());
        cache[mac] = { at: Date.now(), a: a, line: lastLine(a, label), raw: res };
        log('activity: ' + a.events.length + ' device events, ' + (a.span ? a.span.count - a.events.length : 0) + ' module events, ' +
          (a.span ? 'back ' + a.span.days + ' days' : 'no usable times') + (a.skipped ? ', ' + a.skipped + ' without a time' : ''));
        log('activity: ' + summary(res));
        cbs.forEach(function (f) { f(null, cache[mac]); });
      });
    }

    // ------------------------------------------------------------ blocked or not, and the state of the gate
    var TRAVEL_MS = window.__nxActivityTravelMs != null ? window.__nxActivityTravelMs : 150000;        // a gate does not keep moving for longer than this
    var AFTER_MS = window.__nxActivityAfterMs != null ? window.__nxActivityAfterMs : 3000;             // the log is read this long after a command
    var MARGIN_MS = window.__nxActivityMarginMs != null ? window.__nxActivityMarginMs : 8000;          // ...and this long after the travel time, if the gate is still said to move
    var BLOCK_KEY = 'nxBlock';
    var TRANSIENT = { opening: 1, closing: 1 };
    var timers = {};             // mac -> { after, travel }: readings that are planned
    var declaredLogged = {};
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
    function blockInfo(device) {
      var mac = device && device.mac;
      if (!mac) return null;
      var mine = readBlock()[mac], c = cache[mac], lg = c && c.a && c.a.block, best = null;
      if (mine && typeof mine.at === 'number' && (!lg || mine.at >= lg.t)) best = { blocked: !!mine.blocked, t: mine.at, type: mine.code, who: mine.who || '', uncertain: false };
      else if (lg) best = { blocked: lg.blocked, t: lg.t, type: lg.type, who: lg.who, uncertain: !!lg.uncertain };
      var restarted = c && c.a && c.a.health.restart.last;
      if (best && restarted != null && restarted > best.t) best.uncertain = true;      // the accessory restarted after it: not known whether the block survived
      return best;
    }
    function sinceText(t) { var w = when(t, Date.now()); return w.indexOf('today ') === 0 ? w.slice(6) : w; }
    // the pill on the accessory screen ('' when there is nothing to say)
    $rootScope.nxBlock = function (device) {
      var b = blockInfo(device);
      return (b && b.blocked) ? 'Blocked' + (b.uncertain ? '?' : '') + ' · since ' + sinceText(b.t) : '';
    };

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
      log('state: "' + raw + '" is out of date (the last movement in the log is ' + m.type + ', ' + when(m.t, now) + '); shown as ' + to);
      return c.settle;
    }
    $rootScope.nxState = function (device) { var st = settledOf(device); return st ? st.to : rawValue(device); };
    $rootScope.nxSettled = function (device) {
      var st = settledOf(device);
      if (!st) return '';
      var key = 'DEVICE_STATE_' + st.raw, name = '';
      try { name = inj.has('$translate') ? inj.get('$translate').instant(key) : ''; } catch (e) {}
      return 'reported: ' + ((name && name !== key) ? name : st.raw);
    };
    var ICON_TYPES = { sectional: 'i_gat006', 'up-and-over': 'i_gat002', swing: 'i_gat003', sliding: 'i_gat005', barrier: 'i_gat001' };
    // the class of the icon in the app's own form ("icon-i_gat005 open status-0"), only when the state is settled: otherwise the app's own function decides
    $rootScope.nxIcon = function (device) {
      var st = settledOf(device);
      if (!st) return '';
      var a0 = device.automations && device.automations[0], p = device.properties;
      return 'icon-' + (ICON_TYPES[a0 && a0.type] || 'i_undefined') + ' ' + st.to + ' status-' + (p && p[1] ? p[1].value : 'undefined');
    };

    function planReading(device, ms, key, onlyIf) {
      var mac = device && device.mac;
      if (!mac) return;
      var t = timers[mac] = timers[mac] || {};
      clearTimeout(t[key]);
      t[key] = setTimeout(function () { try { if (!onlyIf || onlyIf()) refresh(device); } catch (e) { log('activity', String(e)); } }, ms);
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
        if (TRANSIENT[st] && (!c || Date.now() - c.at > 20000)) refresh(device);
      } catch (e) { log('activity', String(e)); }
    }

    // ------------------------------------------------------------ the line on the accessory screen
    $rootScope.nxActivity = function (device) { openSheet(device); };
    $rootScope.nxLast = function (device) { var c = device && cache[device.mac]; return (c && c.line) || ''; };
    // looking at the accessory screen for a moment reads the log once in a while, so that the line is there (read-only, like the app's own history page)
    $rootScope.$on('$stateChangeSuccess', function (ev, toState, toParams) {
      try {
        if (!/device-detail$/.test((toState && toState.name) || '') || !toParams) return;
        var device = ctx.liveDevice(toParams.homeId, toParams.mac);
        if (!device) return;
        if (cache[device.mac]) cache[device.mac].settle = null;                          // a new look: decide again, from a fresh reading
        setTimeout(function () {
          try {
            var c = cache[device.mac];
            if (c && Date.now() - c.at < MAX_AGE && !(transient(device) && Date.now() - c.at > 20000)) return;
            if (device.reachable === false) return;
            if ($rootScope.nxCheck && $rootScope.nxCheck(device) === 'checking') return;
            if (inj.has('$state') && inj.get('$state').params && inj.get('$state').params.mac !== device.mac) return;     // gone from this screen
            refresh(device);
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
        '<div class="nx-handle"><div class="nx-progress"></div></div>' +
        '<div class="nx-act-head"><div class="nx-act-titles"><h2 class="nx-act-title">Activity</h2><div class="nx-act-sub" id="nx-act-sub"></div></div>' +
        '<button type="button" class="nx-act-refresh" aria-label="Refresh"></button></div>' +
        '<div id="nx-act-body"></div>' +
        '<div class="nx-more"><button type="button" class="nx-act-copy">Copy the log</button></div>' +
        '<div class="nx-footer nx-act-footer"><button type="button" class="nx-text nx-act-close">Close</button></div>';
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
        var t = e.target;
        if (t && t.classList && t.classList.contains('nx-act-all')) { showAll = true; render(); }
        else if (t && t.classList && t.classList.contains('nx-act-retry')) load(true);
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

    function render(error) {
      try { draw(error); } catch (e) {
        log('activity: could not show it', String(e));
        try { body.innerHTML = '<div class="nx-card nx-act-error"><b>Could not show the history</b><span>' + esc(String(e)) + '</span></div>'; } catch (x) {}
      }
    }
    function draw(error) {
      var c = current && cache[current.mac];
      var name = (current && (current.description || current.name)) || '';
      copyRow.style.display = c ? '' : 'none';                 // nothing to copy before the log has been read
      if (c) {
        var a = c.a;
        sub.textContent = name + (a.span ? (name ? ' · ' : '') + plural(a.span.count, 'event') + ', ' + plural(a.span.days, 'day') : '');
        body.innerHTML = renderHtml(a, label, { all: showAll, block: blockInfo(current) });
      } else if (error) {
        sub.textContent = name;
        body.innerHTML = '<div class="nx-card nx-act-error"><b>Could not read the history</b><span>' + esc(errorText(error) || 'The accessory did not answer.') +
          '</span><button type="button" class="nx-act-retry">Try again</button></div>';
      } else {
        sub.textContent = name;
        body.innerHTML = '<div class="nx-card nx-act-empty"><span>Reading the accessory’s log…</span></div>';
      }
    }
    function load(force) {
      if (!current) return;
      var device = current;
      panel.classList.add('nx-busy');
      refresh(device, function (err) {
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
        render();
        if (!isOpen) {
          isOpen = true;
          scrim.style.display = 'block';
          panel.style.display = 'block';
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
