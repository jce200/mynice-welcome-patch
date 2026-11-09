/* nx-patch.js: improvements on top of MyNice Welcome 2.2.0.
 *
 * Everything here is written defensively: an error in this file must never break the app, at most switch
 * off an improvement. What it contains:
 *   1. understandable error messages when connecting to Wi-Fi (window.__nxMsg)
 *   2. dead cloud calls (niceappdomain.com), skipped immediately for 10 minutes after a first failure
 *   3. saved addresses of the accessories, passed to the native layer (safety net if mDNS does not find the accessory),
 *      and a second/third attempt of the reachability check ("Not usable")
 *   4. a prompt "X requests access, allow?" for a new user (e.g. Home Assistant)
 *   5. protection against pressing Next twice while configuring
 *   6. (nx9) the connection status as a line under the title of every page (the status chip; CSS variables --nx-sub and
 *      --nx-dot) and, after a tap on it, a bottom sheet (the status sheet) with the route, the measurements and the
 *      actions (diagnosis, "Reconnect", new users, log)
 *   7. (nx4) also works with a VPN or mobile data on: the diagnosis shows the route and the default route, and an
 *      accessory that the phone does reach but that the app calls "Not usable" is reconnected automatically
 */
(function () {
  'use strict';
  if (window.__nxLoaded) return;
  window.__nxLoaded = true;

  // ------------------------------------------------------------------ helpers
  function log() {
    try { console.log.apply(console, ['[NX]'].concat(Array.prototype.slice.call(arguments))); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nx(action, args, ok, fail) {
    try {
      cordova.exec(ok || function () {}, fail || function () {}, 'Nx', action, args || []);
    } catch (e) { if (fail) fail(String(e)); }
  }
  function toast(msg) {
    try {
      // one at a time: a message about work in progress must not stay underneath the result
      Array.prototype.slice.call(document.querySelectorAll('.nx-snack')).forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
      var t = document.createElement('div');
      t.className = 'nx-snack';
      t.setAttribute('role', 'status');
      t.textContent = msg;
      // the styling (inverse surface, rounded corners, above the navigation bar) lives in nx-expressive.css; this is the safety net
      t.style.cssText = 'position:fixed;z-index:2147483645';
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
    } catch (e) {}
  }

  // ------------------------------------------------------------------ theme (nx12)
  // Settings > Theme: 'auto' (the WebView's prefers-color-scheme decides, as before), 'light' or 'dark'. The choice is in
  // localStorage ('nxTheme') and on <html> as data-nx-theme; nx-theme.js puts it there before the first paint, the color tokens of
  // nx-expressive.css answer to it. (Android's WebView takes prefers-color-scheme from the Android theme of the app, and the app's is
  // a dark base theme, so "auto" is not guaranteed to follow the phone: this is why there is a choice.)
  var THEME_KEY = 'nxTheme';
  function readTheme() {
    try { var t = window.localStorage.getItem(THEME_KEY); return (t === 'light' || t === 'dark') ? t : 'auto'; } catch (e) { return 'auto'; }
  }
  function applyTheme(mode) {
    var r = document.documentElement;
    if (mode === 'light' || mode === 'dark') r.setAttribute('data-nx-theme', mode); else r.removeAttribute('data-nx-theme');
  }
  // dark right now? What the user chose, else what the WebView reports
  function isDarkNow() {
    var a = document.documentElement.getAttribute('data-nx-theme');
    if (a === 'dark') return true;
    if (a === 'light') return false;
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  // ------------------------------------------------------------------ colors (nx21)
  // Settings > Appearance > Colors: one of the palettes of the skin (tokens.css). The choice is in localStorage ('nxPalette') and on <html> as
  // data-nx-palette; nx-theme.js puts it there before the first paint. The first palette is the one that the tokens have on :root, so for that
  // one nothing is saved and nothing is set. The ids are the names of the palettes in tokens.css and of the pattern in nx-theme.js.
  var PALETTES = [['midnight', 'Midnight'], ['nice', 'Nice blue'], ['graphite', 'Graphite'], ['paper', 'Paper'], ['violet', 'Violet'], ['pine', 'Pine'], ['ember', 'Ember']];
  var PALETTE_KEY = 'nxPalette';
  function paletteIndex(id) { for (var i = 0; i < PALETTES.length; i++) if (PALETTES[i][0] === id) return i; return -1; }
  function readPalette() {
    try { var p = window.localStorage.getItem(PALETTE_KEY); return paletteIndex(p) > 0 ? p : PALETTES[0][0]; } catch (e) { return PALETTES[0][0]; }
  }
  function applyPalette(id) {
    var r = document.documentElement;
    if (paletteIndex(id) > 0) r.setAttribute('data-nx-palette', id); else r.removeAttribute('data-nx-palette');
  }

  // ------------------------------------------------------------------ 1. error messages
  window.__nxMsg = function (e, fallback) {
    try {
      var s = (e && e.message) ? e.message : String(e == null ? '' : e);
      if (/^WIFI_UNAVAILABLE/.test(s)) {
        return 'Connecting to the accessory failed or was canceled. Tap the accessory again and choose ' +
          '"Connect" in the Android dialog. If that does not work: connect to the accessory yourself in ' +
          'Android\'s Wi-Fi settings and then tap the accessory.';
      }
      if (/^WIFI_RELEASED/.test(s)) {
        return 'The connection to the accessory was released. Try again.';
      }
      var m = /^WIFI_MISMATCH current="?([^"]*)"? requested="?([^"]*)"?/.exec(s);
      if (m) {
        var requested = m[2], isModule = /^Nice(IT4WIFI|CORE|Bridge)/.test(requested);
        if (isModule) {
          return 'Could not connect to "' + requested + '" automatically. Connect to this network manually in the ' +
            'Wi-Fi settings (they have been opened), go back to the app and tap the accessory again.';
        }
        return 'The phone did not return to "' + requested + '" (now: "' + m[1] + '"). Connect to your home network ' +
          'manually and try again.';
      }
      if (/cannot connect to network/.test(s)) {
        return 'Android did not allow the connection to the Wi-Fi. Connect manually in the Wi-Fi settings and ' +
          'try again.';
      }
    } catch (x) {}
    return fallback;
  };

  // ------------------------------------------------------------------ 2. skipping the dead cloud
  // The Nice cloud is not reachable from this phone (registerToken kept failing with status -1).
  // After a first failure we let calls to it fail immediately for 10 minutes instead of waiting. This concerns the
  // HTTP calls (push and IFTTT), not the connection to the accessory via the cloud; and it is a short period, because a failure
  // on one network (for example a filter) must not linger for a whole day on another network.
  (function () {
    try {
      var KEY = 'nxCloudDeadSince', RE = /(^|\/\/)[^\/?#]*niceappdomain\.com/i;
      var open = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (method, url) {
        try {
          if (RE.test(String(url))) {
            var t = +localStorage.getItem(KEY) || 0;
            if (t && Date.now() - t < 600000) {
              arguments[1] = 'http://127.0.0.1:9/nx-cloud-skipped';   // immediately "connection refused"
            } else {
              this.addEventListener('error', function () { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} });
              this.addEventListener('load', function () { try { localStorage.removeItem(KEY); } catch (e) {} });
            }
          }
        } catch (e) {}
        return open.apply(this, arguments);
      };
    } catch (e) { log('cloud hook failed', String(e)); }
  })();

  // ------------------------------------------------------------------ data from the app
  function readHomes() {
    try {
      var k = (window.STORAGE_KEYS && window.STORAGE_KEYS.KEY_HOMES) || 'keyHomes';
      var h = JSON.parse(window.localStorage.getItem(k) || '[]');
      return h instanceof Array ? h : [];
    } catch (e) { return []; }
  }
  function allDevices() {
    var out = [];
    readHomes().forEach(function (home) {
      (home.devices || []).forEach(function (d) { out.push({ home: home, device: d }); });
    });
    return out;
  }
  function pushHints() {
    var arr = allDevices().map(function (x) { return { mac: x.device.mac, address: x.device.address }; })
      .filter(function (h) { return h.mac && h.address; });
    nx('setHints', [arr]);
  }

  // ------------------------------------------------------------------ starting as soon as Angular is ready
  // The app only defines $rootScope.verifyDeviceRecheability in Ionic's ready callback. Right after it there is (put there
  // by patch-07-vpn-binding.py) a call to window.__nxWrapVerify, so that even the very first check on a cold start goes
  // through the wrapper. The poll below is the safety net (different order, or the hook is missing).
  var started = false, wrapped = false, origVerify = null, installVerify = null;
  var T0 = Date.now();
  var GRACE = (typeof window.__nxGraceMs === 'number') ? window.__nxGraceMs : 12000;   // no auto-recovery right after startup
  // nx11: an accessory that has not been checked yet in this session counts as "being checked" for this long, and an
  // accessory that no check was started for is checked by this patch after KICKOFF (the app only checks what is on screen)
  var FIRST_WAIT = (typeof window.__nxFirstWaitMs === 'number') ? window.__nxFirstWaitMs : 9000;
  var KICKOFF = (typeof window.__nxKickoffMs === 'number') ? window.__nxKickoffMs : 2500;
  var STUCK = 45000;   // a check that takes longer than this is no longer waited for

  function injector() {
    try { return (window.angular && document.body && angular.element(document.body).injector()) || null; } catch (e) { return null; }
  }
  function tryStart() {
    var inj = injector();
    if (!inj || !inj.has('NHKPluginService') || !inj.has('HomeService')) return null;
    if (!started) {
      started = true;
      try { start(inj); } catch (e) { log('start failed', String(e)); }
    }
    return inj;
  }
  window.__nxWrapVerify = function ($rs) {
    try {
      tryStart();
      if (installVerify && $rs) installVerify($rs);
    } catch (e) { log('__nxWrapVerify', String(e)); }
  };
  document.addEventListener('deviceready', function () { pushHints(); }, false);
  // what the app's Wi-Fi event does, visible in the LOG panel
  window.addEventListener('WiFiConnectionStatusChanged', function (ev) {
    try { log('Wi-Fi event', ev && ev.eventType); } catch (e) {}
  }, true);

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    try {
      var inj = tryStart();
      if (inj && installVerify) installVerify(inj.get('$rootScope'));
    } catch (e) { log('startup', String(e)); }
    if (wrapped || tries > 240) clearInterval(iv);
  }, 500);

  function start(inj) {
    var $rootScope = inj.get('$rootScope'), $q = inj.get('$q'), $timeout = inj.get('$timeout');
    var NHK = inj.get('NHKPluginService'), $ionicPopup = inj.get('$ionicPopup');
    var HS = inj.get('HomeService');
    var lastStatus = null;
    // The app's existing device object (so a check does not write an outdated copy back).
    function liveDevice(homeId, mac) {
      try {
        var hs = HS.homes || [];
        for (var i = 0; i < hs.length; i++) {
          if (hs[i].homeId != homeId) continue;
          var ds = hs[i].devices || [];
          for (var j = 0; j < ds.length; j++) if (ds[j].mac == mac) return ds[j];
        }
      } catch (e) {}
      return null;
    }
    var popupOpen = false, prompted = {}, lastUserCheck = 0;

    // native log lines in the LOG panel
    nx('logStream', [], function (m) { if (m) console.log('[nx] ' + m); });
    nx('version', [], function (v) { log('native layer', v); });
    pushHints();

    // -------------------------------------------------------------- 5. double Next while configuring
    try {
      var origCfg = NHK.config;
      if (origCfg && !origCfg.__nx) {
        var wc = function () {
          window.__nxCfgAt = Date.now();
          var p = origCfg.apply(NHK, arguments);
          try { p.then(null, function () { window.__nxCfgAt = 0; }); } catch (e) {}
          return p;
        };
        wc.__nx = true;
        NHK.config = wc;
      }
      window.__nxBusyCfg = function () {
        var t = window.__nxCfgAt || 0;
        if (t && Date.now() - t < 120000) { toast('Configuration is already in progress. Please wait.'); return true; }
        return false;
      };
    } catch (e) { log('config protection failed', String(e)); }

    // -------------------------------------------------------------- 3. reachability: hints and new attempts
    // installVerify is called by __nxWrapVerify (right after the definition in the app) and by the poll.
    var busy = {}, inflight = 0;   // busy[mac]: the time at which a check (with its new attempts) started, 0 when none is running
    function isVerifying() {
      if (inflight > 0) return true;
      for (var k in busy) if (busy[k]) return true;
      return false;
    }
    // nx11: what counts as confirmed. The app says "Not usable" as soon as the FIRST attempt of a check fails (reachable =
    // false), while the wrapper below is still making its second and third attempt, and right after startup it shows what the
    // last session left in storage. Neither is a confirmed status. seen[mac] is the result of the last check of this session
    // that has really finished (after its new attempts). nxCheck(device) tells the lists and the chip what to make of the
    // app's flag right now:
    //   'checking'  no result of this session yet and a check is running (or about to): "Checking…", neither good nor bad
    //   'hold'      the last result was "reachable" and the check that is running now has not failed for good: stay "usable"
    //   'retry'     the last result was "not reachable" and a new attempt to connect is running: "Connecting…". (Until nx17 the screen
    //               kept saying "Not usable" during such an attempt, and nothing showed that the app was still trying.)
    //   ''          nothing to add: the flag of the app is the confirmed state
    var seen = {};
    function runningSince(mac) {
      var t = busy[mac];
      return (t && Date.now() - t < STUCK) ? t : 0;
    }
    // an attempt that is not one of the app's own checks: the automatic recovery, and the diagnosis and the reconnect of the status sheet
    function attempting() { return !!((heal && heal.busy) || busyDiag); }
    function nxCheck(device) {
      var mac = device && device.mac;
      if (!mac) return '';
      var s = seen[mac];
      if (runningSince(mac)) return s ? (s.ok ? 'hold' : 'retry') : 'checking';
      if (!s && Date.now() - T0 < FIRST_WAIT) return 'checking';
      if (attempting() && !(s && s.ok)) return 'retry';
      return '';
    }
    // the views follow the flags above only when a digest runs, and these change outside of it (timers, the native layer)
    function digestSoon() { try { $rootScope.$evalAsync(function () {}); } catch (e) {} }
    installVerify = function ($rs) {
      try {
        var cur = $rs.verifyDeviceRecheability;
        if (typeof cur !== 'function') return false;
        if (cur.__nx) { wrapped = true; $rs.nxCheck = nxCheck; return true; }
        origVerify = cur;
        var wv = function (device) {
          pushHints();
          inflight++;
          var settled = false;
          function settle() { if (!settled) { settled = true; inflight = Math.max(0, inflight - 1); } }
          var ret;
          try { ret = origVerify.call($rs, device); } catch (e) { settle(); throw e; }
          try {
            if (ret && ret.promise) ret.promise.then(settle, settle); else settle();
            var mac = device && device.mac;
            if (mac && !runningSince(mac) && ret && ret.promise) {
              busy[mac] = Date.now();
              var n = 0;
              var check = function () {
                // the native layer remembers whether the chosen route (local or cloud) worked, and switches route when it failed
                nx(device.reachable ? 'checkSucceeded' : 'checkFailed', []);
                if (device.reachable || n >= 2) {
                  busy[mac] = 0;
                  seen[mac] = { ok: device.reachable === true, at: Date.now() };   // only now is the result confirmed
                  refreshPill();
                  return;
                }
                n++;
                $timeout(function () {
                  var r2 = origVerify.call($rs, device);
                  (r2 && r2.promise ? r2.promise : $q.when()).then(check, check);
                }, 2500);
              };
              ret.promise.then(check, check);
              refreshPill();   // the chip says "checking…" right away, not only when the check is done
            }
          } catch (e) { log('verify-wrapper', String(e)); settle(); }
          return ret;
        };
        wv.__nx = true;
        $rs.verifyDeviceRecheability = wv;
        $rs.nxCheck = nxCheck;   // the patched lists ask this (patch-11); without it they behave as the app does
        wrapped = true;
        log('verify-wrapper active');
        return true;
      } catch (e) { log('verify-wrapper failed', String(e)); return false; }
    };
    installVerify($rootScope);

    // -------------------------------------------------------------- 8. extra buttons next to Open, Close and Stop (nx12)
    // The app has ONE optional "fourth button". Here the user ticks as many of the accessory's secondary commands as wanted (say
    // "Open and Block" and "Release and Close") and each becomes a button under Open, Close and Stop. The choice is kept per
    // accessory in localStorage ('nxQuick': { "<mac>": ["<code>", ...] }, in the order in which the commands were ticked), apart
    // from the app's own data, so that none of the app's flows (discovery, updating the accessory) can lose it. Until the list has
    // been touched, the app's own optional command counts as the first choice. patch-12-extra-commands.py makes the accessory screen
    // and the "optional command" page ask for this; without it they behave as before. The commands run through the app's own
    // runCommand (executeSecondaryCommand), exactly like the optional command does.
    var QUICK_KEY = 'nxQuick';
    function readQuick() {
      try {
        var o = JSON.parse(window.localStorage.getItem(QUICK_KEY) || '{}');
        return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
      } catch (e) { return {}; }
    }
    function writeQuick(o) {
      try { window.localStorage.setItem(QUICK_KEY, JSON.stringify(o)); } catch (e) { log('extra buttons: not saved', String(e)); }
    }
    function automationOf(device) { return (device && device.automations && device.automations[0]) || null; }
    // the codes ticked for this accessory, in the order in which they were ticked
    function quickCodes(device) {
      var mac = device && device.mac;
      if (!mac) return [];
      var list = readQuick()[mac];
      if (Array.isArray(list)) return list.filter(function (c) { return typeof c === 'string' && c; });
      var a = automationOf(device);
      return (a && a.fourthButton && a.fourthButton.code) ? [String(a.fourthButton.code)] : [];
    }
    // what the accessory screen shows: the ticked commands, as long as the app's switch "enable the optional command" is on
    // (an array of strings: an array of new objects on every call would make ng-repeat re-render on every digest)
    function extraCodes(device) {
      var a = automationOf(device);
      return (a && a.fourthButtonEnabled) ? quickCodes(device) : [];
    }
    function quickToggle(device, item) {
      try {
        var code = item && (typeof item === 'string' ? item : item.code);
        var mac = device && device.mac;
        if (!code || !mac) return;
        var list = quickCodes(device).slice();     // the old optional command becomes part of the list here
        var i = list.indexOf(code);
        if (i >= 0) list.splice(i, 1); else list.push(code);
        var all = readQuick();
        all[mac] = list;
        writeQuick(all);
        // the app's own optional command follows the first choice, so that its own check ("select an optional command") still holds
        var a = automationOf(device);
        if (a) {
          if (!list.length) delete a.fourthButton;
          else if (!(a.fourthButton && a.fourthButton.code === list[0])) a.fourthButton = (item && item.code === list[0]) ? item : { code: list[0] };
          HS.updateDevice(device.homeId, device);
        }
      } catch (e) { log('extra buttons', String(e)); }
    }
    // is there anything to choose from? (an administrator has the full list; a user the list that was fetched and cached)
    function canQuick(device) {
      var a = automationOf(device);
      if (!a) return false;
      return !!((Array.isArray(a.secondaryCommands) && a.secondaryCommands.length) || a.enabledSecondaryCommands === true ||
        (Array.isArray(a.enabledSecondaryCommands) && a.enabledSecondaryCommands.length));
    }
    // shortcut from the accessory screen to the page where the commands are ticked; the switch goes on, so that the list is there
    function editQuick(device) {
      try {
        var a = automationOf(device);
        if (a && !a.fourthButtonEnabled) { a.fourthButtonEnabled = true; HS.updateDevice(device.homeId, device); }
        if (inj.has('$state') && typeof $rootScope.go === 'function') $rootScope.go(inj.get('$state'), '4th-button', { homeId: device.homeId, mac: device.mac });
      } catch (e) { log('extra buttons: choose', String(e)); }
    }
    // the commands give no sign of their own (a block or a release does not change the state shown), so a short confirmation
    function quickSent(code) {
      try {
        var name = inj.has('$translate') ? inj.get('$translate').instant('DEVICE_COMMAND_' + code) : '';
        toast((!name || name === 'DEVICE_COMMAND_' + code ? code : name) + ': sent');
      } catch (e) {}
    }
    // theme: what the settings page shows and does (patch-13); the status bar follows at once
    var themeNow = readTheme();
    applyTheme(themeNow);        // nx-theme.js did this already; here in case that script is not there
    $rootScope.nxTheme = function () { return themeNow; };
    $rootScope.nxSetTheme = function (mode) {
      try {
        if (mode !== 'auto' && mode !== 'light' && mode !== 'dark') return;
        themeNow = mode;
        try { if (mode === 'auto') window.localStorage.removeItem(THEME_KEY); else window.localStorage.setItem(THEME_KEY, mode); } catch (e) { log('theme: not saved', String(e)); }
        applyTheme(mode);
        tuneStatusBar();
        log('theme', mode);
      } catch (e) { log('theme', String(e)); }
    };
    // colors: the same for the palette (patch-13 shows the swatches); the status bar takes the surface color of the new palette at once
    var paletteNow = readPalette();
    applyPalette(paletteNow);    // nx-theme.js did this already; here in case that script is not there
    $rootScope.nxPalettes = PALETTES.map(function (p) { return { id: p[0], label: p[1] }; });
    $rootScope.nxPalette = function () { return paletteNow; };
    $rootScope.nxPaletteLabel = function () { return PALETTES[paletteIndex(paletteNow)][1]; };
    $rootScope.nxSetPalette = function (id) {
      try {
        if (typeof id !== 'string' || paletteIndex(id) < 0) return;
        paletteNow = id;
        try { if (paletteIndex(id) === 0) window.localStorage.removeItem(PALETTE_KEY); else window.localStorage.setItem(PALETTE_KEY, id); } catch (e) { log('palette: not saved', String(e)); }
        applyPalette(id);
        tuneStatusBar();
        log('palette', id);
      } catch (e) { log('palette', String(e)); }
    };
    // Settings > Design: the page of Material 3 Expressive (nx-gallery.js, patch-17); without that script there is no function, and the row is not shown
    if (window.NxGallery && typeof window.NxGallery.open === 'function') {
      $rootScope.nxGallery = function () { try { window.NxGallery.open(); log('gallery', 'open'); } catch (e) { log('gallery', String(e)); } };
    }
    $rootScope.nxExtra = extraCodes;
    $rootScope.nxQuickHas = function (device, code) { return quickCodes(device).indexOf(code) >= 0; };
    $rootScope.nxQuickToggle = quickToggle;
    $rootScope.nxCanQuick = canQuick;
    $rootScope.nxEditQuick = editQuick;
    $rootScope.nxSent = quickSent;

    // -------------------------------------------------------------- navigation
    $rootScope.$on('$stateChangeSuccess', function (ev, toState) {
      var n = (toState && toState.name) || '';
      if (/add-device-settings$/.test(n)) window.__nxCfgAt = 0;                 // back on the configuration screen
      // Outside the wizard the app must not stay tied to the accessory Wi-Fi (which has no internet).
      if (/^(tabsController\.(favorites|controls|system)|start-home$|init$)/.test(n)) nx('release', []);
      setTimeout(refreshPill, 800);
    });

    // -------------------------------------------------------------- 4. new users
    // the app's own explanation of an error ("Sign not valid", "The connection with the Accessory is not valid", ...)
    function errorText(err) {
      try {
        if (err == null) return '';
        if (typeof err === 'string') return err;
        var key = 'NHK_ERROR-' + err.code;
        var text = (err.code != null && inj.has('$translate')) ? inj.get('$translate').instant(key) : '';
        return (text && text !== key) ? text : (err.message ? String(err.message) : '');
      } catch (e) { return ''; }
    }
    // "<what>: <the app's explanation> (<code>)."; the fallback when there is neither an explanation nor a code
    function failedText(what, err, fallback) {
      var why = errorText(err);
      var code = (err && typeof err === 'object' && err.code != null) ? String(err.code) : '';
      if (!why && !code && fallback) return what + ' (' + fallback + ').';
      return what + (why ? ': ' + why : '') + (code ? ' (' + code + ')' : '') + '.';
    }
    function promptUser(device, u) {
      var key = device.mac + '#' + (u.id != null ? u.id : u.username);
      if (prompted[key] || popupOpen) return;
      prompted[key] = true;
      popupOpen = true;
      log('new user: asking whether to allow', u.username);
      $timeout(function () {
        var pop = $ionicPopup.confirm({
          title: 'New user',
          template: '<div style="text-align:center"><b>' + esc(u.username) + '</b> requests access to <b>' +
            esc(device.name || device.description || device.mac) + '</b>.<br>Allow?</div>',
          cancelText: 'Later',
          okText: 'Allow'
        });
        pop.then(function (ok) {
          popupOpen = false;
          if (!ok) { log('new user: later', u.username); delete prompted[key]; return; }
          // the accessory can take a while (or not answer at all): say that something is happening
          log('new user: allowing', u.username);
          toast('Allowing "' + u.username + '"\u2026');
          var slow = setTimeout(function () { toast('Still waiting for the accessory\u2026'); }, 15000);
          NHK.userApproved(device, u.id, u.username).then(function () {
            clearTimeout(slow);
            log('new user: allowed', u.username);
            toast('"' + u.username + '" has been allowed.');
          }, function (err) {
            clearTimeout(slow);
            log('new user: could not allow', u.username, JSON.stringify(err));
            toast(err && err.code == 11 ? 'Maximum number of users reached.' : failedText('Could not allow the user', err));
            delete prompted[key];
          });
        });
      }, 0);
    }
    function checkWaitingUsers(manual) {
      var devs = allDevices();
      if (!devs.length) { if (manual) toast('No accessory in the app.'); return; }
      lastUserCheck = Date.now();
      var found = 0, done = 0;
      devs.forEach(function (x) {
        var d = liveDevice(x.home.homeId, x.device.mac) || x.device;
        NHK.pairings(d).then(function (res) {
          var w = (res && res.waitingUsers) || [];
          log('waiting users', d.mac, w.length);
          found += w.length;
          w.forEach(function (u) { promptUser(d, u); });
          if (++done === devs.length && manual && !found) toast('No users waiting.');
        }, function (err) {
          log('pairings failed', JSON.stringify(err));
          if (++done === devs.length && manual) toast(failedText('Check failed', err, 'no connection'));
        });
      });
    }
    window.addEventListener('newUser', function (e) {
      log('newUser', e && e.username);
      setTimeout(function () { checkWaitingUsers(false); }, 700);
    });
    document.addEventListener('resume', function () {
      pushHints();
      setTimeout(refreshPill, 1500);
      if (Date.now() - lastUserCheck > 300000) setTimeout(function () { checkWaitingUsers(false); }, 4000);
    }, false);

    // -------------------------------------------------------------- 6. status chip and diagnosis
    // Visible: a line under the title of every page (the status chip: --nx-sub and --nx-dot on <html>, styling in nx-expressive.css)
    // and, after a tap on it, a bottom sheet (the status sheet) with the route, the measurements and the actions. #nx-status is
    // the invisible element for screen readers (and for the keyboard): the same text, a click opens the sheet.
    var DOTS = { ok: 'var(--nx-ok)', warn: 'var(--nx-warn)', bad: 'var(--md-sys-color-error)', info: 'var(--md-sys-color-primary)', connecting: 'var(--md-sys-color-primary)', unknown: 'var(--md-sys-color-outline)' };
    var pill = null, panel = null, panelText = null, btnReconnect = null, btnUsers = null;
    var scrim = null, elHeadline = null, elExplanation = null, elRoute = null, elFacts = null;
    var sheetOpen = false, sheetData = null, busyDiag = false;

    function describeNet(net) {
      var t = [];
      if (net.module) t.push('accessory Wi-Fi (' + net.ssid + ')');
      else if (net.wifi) t.push('Wi-Fi ' + (net.ssid || '?') + (net.ip ? ' (' + net.ip + ')' : ''));
      else t.push('no Wi-Fi');
      if (net.wifi && net.validated === false && !net.module) t.push('no internet');
      if (net.vpn) t.push('VPN on');
      if (net.cellular) t.push('mobile data on');
      var s = 'Network: ' + t.join(', ');
      // what Android sees as the active network is what the app bases its "Wi-Fi gone" notifications on
      if (net.wifi && !net.module && net.defaultType && net.defaultType !== 'wifi') {
        s += '\nAndroid\'s active network: ' + net.defaultType + ' (not the Wi-Fi)';
      }
      if (net.vpn && 'vpnRoute' in net) {
        s += '\nVPN route to the accessory: ' + (net.vpnRoute ? net.vpnRoute : 'none (the VPN does not affect the accessory\'s address)');
      }
      if (net.route) {
        s += '\nThe app connects to the accessory via ' + (net.route === 'cloud' ? 'the Nice cloud' : 'a local connection') +
          (net.routeAgeSeconds != null ? ' (chosen ' + net.routeAgeSeconds + ' s ago)' : '');
      }
      if (net.cloudPreference) {
        s += '\nThe local connection just failed; the app gives the cloud priority for another ' + net.cloudPreference + ' s.';
      }
      return s;
    }
    // The VPN cannot be bypassed from within this app; the clean solution is to exclude this app from the VPN.
    var VPN_TIP = ' Exclude MyNice Welcome in your VPN app: in Tailscale under "App split tunneling" (Excluded apps). ' +
      'Tailscale then stays on for your other apps and this app goes around it.';
    // Is the phone on a different Wi-Fi than the one the accessory was set up on? On a router with several networks
    // (HomeWifi-5G and HomeWifi) that is the same home network and the app works just as well there; so this is only a hint.
    function otherSsid(net, homeSsid) { return !!(homeSsid && net && net.ssid && net.ssid !== homeSsid); }
    // short indication of what else is on, for the status chip
    function tagsFor(net, homeSsid) {
      var t = [];
      if (net && !net.wifi) t.push('no Wi-Fi');
      else if (otherSsid(net, homeSsid)) t.push('other Wi-Fi');
      if (net && net.vpn) t.push('VPN');
      if (net && net.cellular) t.push('mobile');
      return t.length ? ' · ' + t.join(', ') : '';
    }
    // First what the app itself knows (reachable or not); the network is only the reason added to it. That way the app stays
    // usable on any network that reaches the accessory: another Wi-Fi of the same router, or away from home via a VPN to home.
    function computeStatus(cb) {
      var devs = allDevices();
      if (!devs.length) return cb({ level: 'none' });
      nx('netState', [devs[0].device.address || ''], function (net) {
        var homeSsid = devs[0].home.networkSsid || '';
        // per accessory what the app says (reachable or not), unless that is not confirmed yet (see nxCheck)
        var states = devs.map(function (x) {
          var c = nxCheck(x.device);
          if (c === 'checking') return 'checking';
          if (c === 'retry') return 'retry';
          if (c === 'hold') return 'ok';
          return x.device.reachable === true ? 'ok' : x.device.reachable === false ? 'bad' : 'unknown';
        });
        var allOk = states.every(function (v) { return v === 'ok'; });
        var anyBad = states.some(function (v) { return v === 'bad'; });
        var anyChecking = states.some(function (v) { return v === 'checking'; });
        var anyRetry = states.some(function (v) { return v === 'retry'; });
        var viaCloud = net.route === 'cloud';
        if (net.module) return cb({ level: 'info', text: 'Accessory Wi-Fi', net: net });
        // no verdict, neither good nor bad, as long as a result is missing: without Wi-Fi the Nice cloud may still work
        if (anyChecking && !anyBad && !anyRetry) return cb({ level: 'unknown', text: 'Accessory: checking…', net: net });
        // a new attempt to connect is running: that is what the chip says, not the verdict of the attempt before it
        if (anyRetry && !allOk) return cb({ level: 'connecting', text: 'Connecting to the accessory…', net: net });
        // Without Wi-Fi and without a VPN an accessory in the home network can only be reachable via the Nice cloud. An old
        // "reachable" flag then only counts if the app really chose the cloud for its last connection.
        if (!net.wifi && !net.vpn) {
          if (allOk && viaCloud) return cb({ level: 'ok', text: 'Accessory online · cloud', net: net });
          if (anyBad) return cb({ level: 'bad', kind: 'unreachable', text: 'Accessory not reachable' + tagsFor(net, homeSsid), net: net });
          return cb({ level: 'bad', text: 'No Wi-Fi', net: net });
        }
        if (allOk) return cb({ level: 'ok', text: 'Accessory online' + (viaCloud ? ' · cloud' : ''), net: net });
        if (anyBad) {
          return cb({ level: 'bad', kind: 'unreachable', text: 'Accessory not reachable' + tagsFor(net, homeSsid), net: net });
        }
        if (!net.wifi) return cb({ level: 'bad', text: 'No Wi-Fi', net: net });
        if (otherSsid(net, homeSsid)) return cb({ level: 'warn', text: 'Other Wi-Fi', net: net });
        cb({ level: 'unknown', text: 'Accessory: checking…', net: net });
      }, function () { cb({ level: 'unknown', text: 'Accessory', net: null }); });
    }
    // the same /24 (the usual size of a home network); only to decide whether recovery makes sense
    function sameNet24(a, b) {
      try {
        var x = String(a).split('.'), y = String(b).split('.');
        return x.length === 4 && y.length === 4 && x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
      } catch (e) { return true; }
    }

    // -------------------------------------------------------------- 7. automatic recovery
    // The app says "Not usable" while the accessory simply answers (for example after a cold start, a Wi-Fi switch or
    // a VPN that briefly interfered). If the accessory answers over Wi-Fi on TCP and TLS, we rebuild the app connection.
    // At most three times per outage, with at least 45 s in between, and never while the app itself is checking.
    var heal = { last: 0, n: 0, busy: false };
    // the recovery is an attempt to connect: the labels and the chip say "Connecting…" while it runs, and say what came of it when it is over
    function setHeal(b) { heal.busy = !!b; digestSoon(); refreshPill(); }
    function autoHeal(st) {
      try {
        if (st && st.level === 'ok') { heal.n = 0; return; }
        if (!st || st.kind !== 'unreachable') return;
        var net = st.net || {};
        if (net.module) return;
        var now = Date.now();
        if (heal.busy || heal.n >= 3 || now - T0 < GRACE || isVerifying()) return;
        if (heal.last && now - heal.last < 45000) return;
        var d = allDevices()[0] && allDevices()[0].device;
        // Without Wi-Fi the app chooses the route itself (the Nice cloud); checking again is then enough, a reconnect does not help.
        if (!net.wifi) {
          setHeal(true); heal.last = now; heal.n++;
          log('auto-recovery ' + heal.n + '/3: no Wi-Fi, the app chooses again (cloud)');
          verifyAll(function () { setHeal(false); });
          return;
        }
        if (!d || !d.address) return;
        // If the phone is on a completely different network than the accessory's address (for example at someone else's home),
        // the accessory is not there and there is nothing to recover.
        if (net.ip && !sameNet24(net.ip, d.address)) return;
        setHeal(true); heal.last = now; heal.n++;
        nx('probe', [d.address, 443, 4000, true], function (p) {
          if (!p || !p.ok) {
            // With a VPN the local route can be closed while the cloud works: since nx6 the app measures that itself when
            // checking and then chooses the cloud. Without a VPN there is nothing to recover.
            if (net.vpn) {
              log('auto-recovery ' + heal.n + '/3: the accessory does not respond locally (' + ((p && p.error) || '?') + ') and the VPN is on; ' +
                'the app chooses again between local and cloud');
              verifyAll(function () { setHeal(false); });
              return;
            }
            setHeal(false);
            log('auto-recovery: the accessory does not respond (' + ((p && p.error) || '?') + '), nothing to repair in the app');
            return;
          }
          log('auto-recovery ' + heal.n + '/3: the accessory responds (TCP ' + p.tcpMs + ' ms, TLS ' + p.tlsMs +
            ' ms) but the app reports "not reachable"; rebuilding the connection');
          nx('reconnect', [], function () {
            pushHints();
            setTimeout(function () {
              verifyAll(function () { setHeal(false); });
            }, 2500);
          }, function () { setHeal(false); });
        }, function () { setHeal(false); });
      } catch (e) { setHeal(false); log('auto-recovery', String(e)); }
    }

    // a CSS string for content: var(--nx-sub): escape quotation marks and backslashes, drop line breaks
    function cssString(t) {
      return '"' + String(t == null ? '' : t).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\u2028\u2029]+/g, ' ') + '"';
    }
    function setHeaderStatus(st) {
      try {
        var r = document.documentElement;
        if (!st || st.level === 'none') {
          r.style.setProperty('--nx-sub', 'none');
          r.removeAttribute('data-nx-status');
          return;
        }
        r.style.setProperty('--nx-sub', cssString(st.text));
        r.style.setProperty('--nx-dot', DOTS[st.level] || DOTS.unknown);
        r.setAttribute('data-nx-status', st.level);
      } catch (e) {}
    }
    function refreshPill() {
      if (!pill) return;
      computeStatus(function (st) {
        lastStatus = st;
        if (st.level === 'none') {
          pill.style.display = 'none';
          setHeaderStatus(null);
          if (sheetOpen) closeSheet();
          return;
        }
        pill.style.display = 'block';
        pill.textContent = st.text;
        pill.setAttribute('data-level', st.level);
        setHeaderStatus(st);
        if (sheetOpen) renderSheet();
        digestSoon();
        autoHeal(st);
      });
    }
    // short reason why the Nice cloud cannot be reached (from the native layer's measurement)
    function cloudReason(c) {
      if (!c || c.ok) return '';
      if (c.dnsError && !c.dnsViaNetwork) return ' (the name cannot be found: ' + c.dnsError + ')';
      if (c.dnsError && c.dnsViaNetwork) return ' (the name can only be found via the network itself, and after that there is no answer: ' + (c.error || '?') + ')';
      return c.error ? ' (' + c.error + ')' : '';
    }
    function conclude(net, probe, reachable, homeSsid, cloud) {
      if (net.module) return 'The phone is on the accessory Wi-Fi (setup). Finish the wizard; the phone then switches back by itself.';
      var disrupted = !reachable || (probe && !probe.ok);
      var viaCloud = net.route === 'cloud';
      var cloudOk = !!(cloud && cloud.ok);
      // TCP to the accessory got through, the secure handshake (TLS) did not: the accessory itself has hung. The network is then fine and
      // a VPN has nothing to do with it; cutting the accessory's power usually fixes it.
      var hung = !!(net.wifi && probe && !probe.ok && probe.tcpMs != null);
      var hangText = 'The accessory accepts the connection (TCP ' + (probe && probe.tcpMs) + ' ms) but does not answer the secure ' +
        'handshake (' + (probe && probe.error) + '): it has hung. The network' + (net.vpn ? ' and your VPN are' : ' is') + ' fine. Cut the power to ' +
        'the accessory for half a minute to restore the local connection.';
      // The app is connected and chose the Nice cloud (away from home, or at home because the local route did not work).
      if (reachable && viaCloud) {
        if (!net.wifi && !net.vpn) return 'Everything works: away from home, the connection to the accessory runs via the Nice cloud.';
        if (hung) return 'Everything works via the Nice cloud. ' + hangText;
        return 'Everything works, but via the Nice cloud instead of directly: the local route to the accessory did not work' +
          (probe && !probe.ok ? ' (the accessory does not answer on the local network: ' + probe.error + ')' : '') +
          (net.vpn ? '. Your VPN is on; try switching it off briefly to see whether that is the cause.' + VPN_TIP : '.');
      }
      if (!net.wifi) {
        if (!net.vpn) {
          // away from home the Nice cloud is the only route to the accessory
          if (reachable) return 'Everything works.';
          if (cloudOk) {
            return 'Away from home, the connection runs via the Nice cloud. The cloud is reachable, yet the app did not get a session. Tap "Reconnect".';
          }
          return 'You are not on Wi-Fi. Away from home, the connection runs via the Nice cloud, and it cannot be reached right now' + cloudReason(cloud) +
            '. Connect to your home Wi-Fi (' + (homeSsid ? '"' + homeSsid + '" or another Wi-Fi network on your home network' : 'your home network') +
            ') or try again later.';
        }
        // no Wi-Fi but a VPN
        if (reachable) return 'Everything works: the connection to the accessory runs via your VPN.';
        if (cloudOk) {
          return 'The Nice cloud is reachable, yet the app did not get a session. Tap "Reconnect"; the app will then choose the cloud.';
        }
        if (probe && probe.ok) {
          return 'The accessory is reachable via your VPN, yet the app did not get a session. Tap "Reconnect".';
        }
        if (cloud && !cloud.ok) {
          return 'You are not on Wi-Fi and your VPN is on. The Nice cloud cannot be reached' + cloudReason(cloud) + ' and the VPN ' +
            (net.vpnRoute ? 'does route the accessory\'s address (route ' + net.vpnRoute + '), but the accessory does not answer' :
              'does not route the accessory\'s address') + '. Try switching the VPN off briefly to see whether that is the cause.' + VPN_TIP;
        }
        if (net.vpnRoute) {
          return 'You are not on Wi-Fi. Your VPN does route the accessory\'s address (route ' + net.vpnRoute + '), but the accessory ' +
            'does not answer. Check whether the VPN connection to home works (with Tailscale: is the device at home that advertises the route switched on?).';
        }
        if ('vpnRoute' in net) {
          return 'You are not on Wi-Fi and your VPN does not route the accessory\'s address. Set up the VPN to route the home network (with ' +
            'Tailscale: a subnet route for the home network on a device at home, and subnet routes enabled on the phone) ' +
            'or connect to your home Wi-Fi.';
        }
        return 'You are not on Wi-Fi. Connect to your home Wi-Fi, or use a VPN that routes the home network.';
      }
      // A different Wi-Fi than the one the accessory was set up on is not an error: with one router with several networks it simply works.
      var ssidTip = (otherSsid(net, homeSsid) && disrupted)
        ? ' You are on "' + net.ssid + '", the accessory is set up on "' + homeSsid + '". That does not have to be a problem (same router), ' +
          'but if this Wi-Fi network does not reach the accessory (guest network, device isolation), connect to "' + homeSsid + '".'
        : '';
      if (hung) {
        return hangText + (cloudOk && !reachable ? ' The Nice cloud is reachable, though: tap "Reconnect" and the app will choose that route.' : '');
      }
      if (net.vpn && net.vpnRoute && disrupted) {
        return 'Your VPN (for example Tailscale) sends the traffic to the accessory into the tunnel, via the route ' + net.vpnRoute +
          '. As a result it does not reach the accessory.' + VPN_TIP + ' Alternatively: in the VPN app, turn off the use of subnet routes (with Tailscale: ' +
          '"Use Tailscale subnets") or an exit node, or turn the VPN off while you operate the accessory.' +
          (cloudOk && !reachable ? ' The Nice cloud is reachable, though: tap "Reconnect" and the app will choose that route.' : '');
      }
      if (net.vpn && disrupted && cloud && !cloud.ok && !(probe && probe.ok)) {
        return 'Your VPN is on and neither the accessory nor the Nice cloud can be reached' + cloudReason(cloud) +
          '. Try switching the VPN off briefly: if it works then, the VPN is in the way.' + VPN_TIP;
      }
      if (probe && !probe.ok) {
        if (probe.std && probe.std.ok) {
          return 'Directly over Wi-Fi the phone does not reach the accessory, but via Android\'s default route it does. ' +
            'Check whether this Wi-Fi gives the phone access to the accessory (guest network or device isolation in the router).';
        }
        return 'The accessory is not responding. Cut its power briefly and switch it back on. If that does not help, check in the router whether the ' +
          'accessory is still there and whether its IP address has changed.' +
          (net.vpn ? ' Your VPN is on, but does not affect the accessory\'s address.' : '') + ssidTip +
          (cloudOk && !reachable ? ' The Nice cloud is reachable, though: tap "Reconnect" and the app will choose that route.' : '');
      }
      var slow = probe && (probe.tcpMs > 1500 || (probe.tlsMs != null && probe.tlsMs > 6000));
      if (!reachable) {
        return 'The accessory is reachable' + (slow ? ' (but slow)' : '') + ', yet the app did not get a session. Tap "Reconnect".' + ssidTip;
      }
      if (slow) return 'Everything works, but the connection is slow. Weak Wi-Fi signal at the accessory?';
      // if it works, a different Wi-Fi name is no cause for concern; say so once
      if (otherSsid(net, homeSsid)) {
        return 'Everything is fine. You are on "' + net.ssid + '" instead of "' + homeSsid + '"; that does not matter as long as it is the same home network.';
      }
      return 'Everything is fine.';
    }
    function setBusy(b) {
      busyDiag = !!b;
      if (btnReconnect) btnReconnect.disabled = b;
      if (btnUsers) btnUsers.disabled = b;
      if (sheetOpen) renderSheet();
      digestSoon();
      refreshPill();      // an attempt (the diagnosis, the reconnect) is running or over: "Connecting…" or the result
    }
    // the text for copying and sharing (under "Technical details"); opens the sheet if it is still closed
    function showText(lines) {
      if (!panel) return;
      panelText.textContent = lines.join('\n');
      openSheet();
    }

    function verifyAll(done) {
      var devs = allDevices();
      if (!devs.length) return done();
      var left = devs.length;
      devs.forEach(function (x) {
        var d = liveDevice(x.home.homeId, x.device.mac) || x.device;
        // the raw check, without the wrapper's extra attempts: the diagnosis must give one honest result
        var r = (origVerify || $rootScope.verifyDeviceRecheability).call($rootScope, d);
        (r && r.promise ? r.promise : $q.when()).then(function () {
          // the check stores its result in storage; diagnose() reads it back
          if (--left === 0) done();
        }, function () { if (--left === 0) done(); });
      });
    }
    // The result goes in the technical details and in the LOG panel, so one copy of the LOG is enough to share.
    function showDiagnosis(lines) {
      showText(lines);
      log('diagnosis\n' + lines.join('\n'));
    }
    // one line about the route to the Nice cloud, from the native layer's measurement
    function cloudLine(c) {
      var dns = c.dns
        ? 'name → ' + c.dns + (c.dnsMs != null ? ' (' + c.dnsMs + ' ms)' : '')
        : 'name not found (' + (c.dnsError || '?') + ')' + (c.dnsViaNetwork ? ', found via the network itself: ' + c.dnsViaNetwork : '');
      var tcp = c.ok ? 'TCP 7890 ' + c.tcpMs + ' ms' : (c.error ? 'TCP 7890 no answer (' + c.error + ')' : 'no connection');
      return 'Nice cloud: ' + dns + '; ' + tcp;
    }
    function diagnose() {
      sheetData = null;
      setBusy(true);
      showText(['Checking…']);
      pushHints();
      var devs0 = allDevices();
      nx('netState', [(devs0[0] && devs0[0].device.address) || ''], function (net) {
        var lines = [describeNet(net)];
        var devs = allDevices();
        if (!devs.length) { lines.push('No accessory in the app.'); showDiagnosis(lines); setBusy(false); return; }
        var d = devs[0].device, homeSsid = devs[0].home.networkSsid || '';
        function finish(probe, cloud) {
          verifyAll(function () {
            var fresh = allDevices()[0];
            var reachable = !!(fresh && fresh.device.reachable);
            lines.push('App connection to the accessory: ' + (reachable ? 'ok' : 'failed'));
            // only the native layer knows which route the app chose in that check (local or cloud); read it again
            nx('netState', [d.address || ''], function (net2) {
              var n2 = net2 || net;
              if (n2.route && n2.route !== net.route) {
                lines.push('The app connected to the accessory via ' + (n2.route === 'cloud' ? 'the Nice cloud' : 'a local connection'));
              }
              var outcome = conclude(n2, probe, reachable, homeSsid, cloud);
              sheetData = { net: n2, probe: probe, cloud: cloud, reachable: reachable, conclusion: outcome, homeSsid: homeSsid };
              lines.push('');
              lines.push(outcome);
              lines.push('');
              lines.push('Android API ' + (n2.sdk || '?') + ' · native layer ' + (n2.version || '?'));
              showDiagnosis(lines);
              setBusy(false);
              refreshPill();
            }, function () {
              var outcome2 = conclude(net, probe, reachable, homeSsid, cloud);
              sheetData = { net: net, probe: probe, cloud: cloud, reachable: reachable, conclusion: outcome2, homeSsid: homeSsid };
              lines.push('');
              lines.push(outcome2);
              showDiagnosis(lines);
              setBusy(false);
              refreshPill();
            });
          });
        }
        if (net.module) { return finish(null, null); }
        // Always measure: even without Wi-Fi (or without an address) the route to the Nice cloud can still be tested.
        nx('probe', [d.address || '', 443, 6000, true, true], function (p) {
          var noWifi = p.error === 'NO_WIFI', noAddress = p.error === 'NO_ADDRESS';
          var unbound = p.bound === false || !!(p.cloud && p.cloud.bound === false);
          if (unbound) {
            // Android refuses to let an app that falls under a VPN bind its connection to the Wi-Fi (EPERM); the original
            // app failed every connection because of it, nx7 then uses a normal connection.
            lines.push('The VPN does not allow the app to bind its connection to the Wi-Fi network (EPERM); the app then uses a normal connection.');
          }
          if (!noWifi && !noAddress) {
            lines.push('Accessory ' + d.address + (p.bound === false ? ' (normal connection)' : ' over Wi-Fi') + ': ' + (p.ok
              ? 'TCP ' + p.tcpMs + ' ms' + (p.tlsMs != null ? ', TLS ' + p.tlsMs + ' ms' : '')
              // TCP got through but the secure handshake did not: the accessory itself has hung, the network is fine
              : (p.tcpMs != null ? 'TCP ' + p.tcpMs + ' ms, but no answer on TLS (' + p.error + ')' : 'no answer (' + p.error + ')')));
          }
          // only present if there is a VPN or mobile data: then we know whether the route is the cause
          if (p.std) {
            lines.push('Accessory ' + d.address + ' via Android\'s default route: ' + (p.std.ok
              ? 'TCP ' + p.std.tcpMs + ' ms'
              : 'no answer (' + p.std.error + ')'));
          }
          if (p.cloud) lines.push(cloudLine(p.cloud));
          // without Wi-Fi the measurement over the default route (the VPN) counts as the result; without an address there is none
          var effective = noAddress ? null : (noWifi ? (p.std ? { ok: !!p.std.ok, tcpMs: p.std.tcpMs, error: p.std.error } : null) : p);
          finish(effective, p.cloud || null);
        }, function (err) { lines.push('Measurement failed: ' + err); finish(null, null); });
      }, function (err) { showText(['Cannot read network status: ' + err]); setBusy(false); });
    }
    function copyText(text) {
      function copyFallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0';
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          var succeeded = !!(document.execCommand && document.execCommand('copy'));
          document.body.removeChild(ta);
          toast(succeeded ? 'Copied.' : 'Copying failed; select the text yourself.');
        } catch (e) { toast('Copying failed; select the text yourself.'); }
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast('Copied.'); }, copyFallback);
          return;
        }
      } catch (e) {}
      copyFallback();
    }
    function reconnect() {
      setBusy(true);
      showText(['Reconnecting…']);
      nx('reconnect', [], function () {
        pushHints();
        setTimeout(diagnose, 1500);
      }, function (err) { showText(['Reconnecting failed: ' + err]); setBusy(false); });
    }

    // ---- the sheet: building the route and the facts from the diagnosis measurements (net, probe, cloud)
    function ms(n) { return (n == null || isNaN(n)) ? '' : Math.round(n) + ' ms'; }
    function shortError(e) { var t = String(e == null ? '' : e); return t.length > 60 ? t.slice(0, 57) + '…' : t; }
    // how the phone is attached to the network: title, line below it and which icon goes with it
    function netTitle(net) {
      if (!net) return { t: 'Network unknown', s: '', i: 'wifi' };
      if (net.module) return { t: 'Accessory Wi-Fi', s: (net.ssid ? '"' + net.ssid + '" ' : '') + '(setup)', i: 'wifi' };
      if (net.wifi) {
        return { t: 'Wi-Fi' + (net.ssid ? ' ' + net.ssid : ''), i: 'wifi',
          s: (net.ip || '') + (net.validated === false ? (net.ip ? ' · ' : '') + 'no internet' : '') };
      }
      if (net.cellular) return { t: 'Mobile data', s: 'no Wi-Fi', i: 'cell' };
      return { t: 'No network', s: 'no Wi-Fi and no mobile data', i: 'wifi' };
    }
    function linkState(ok) { return ok === true ? 'ok' : ok === false ? 'fail' : 'unknown'; }
    // phone - (cloud) - accessory, each link styled by the outcome of its measurement
    function routeHtml(net, d) {
      if (!net) return '';
      var viaCloud = net.route === 'cloud' || (!net.module && !net.wifi && !net.vpn);
      var probe = d && d.probe, cloud = d && d.cloud;
      var reachable = d ? !!d.reachable
        : (lastStatus && lastStatus.level === 'ok' ? true : (lastStatus && lastStatus.level === 'bad' ? false : null));
      var address = (allDevices()[0] && allDevices()[0].device.address) || '';
      var nt = netTitle(net);
      var carrier = (net.module ? 'accessory Wi-Fi' : net.wifi ? 'Wi-Fi' : net.cellular ? 'mobile' : 'network') + (net.vpn ? ' + VPN' : '');
      function node(i, t, sub, st) {
        return '<div class="nx-node"><span class="nx-nodeicon nx-i-' + i + ' nx-s-' + st + '"></span><b>' + esc(t) + '</b><small>' + esc(sub) + '</small></div>';
      }
      function routeLink(label, st, meta) {
        return '<div class="nx-link nx-s-' + st + '"><small>' + esc(label) + (meta ? '<br>' + esc(meta) : '') + '</small><i></i></div>';
      }
      var phoneNode = node('phone', 'Phone', nt.t, 'ok');
      var mod = node('gate', 'Accessory', address, linkState(reachable));
      if (viaCloud && !net.module) {
        var cOk = cloud ? !!cloud.ok : null;
        return phoneNode + routeLink(carrier, linkState(cOk), cloud && cloud.ok ? ms(cloud.tcpMs) : '') + node('cloud', 'Nice cloud', '', linkState(cOk)) +
          routeLink('cloud', linkState(reachable), '') + mod;
      }
      var lOk = probe ? !!probe.ok : reachable;
      return phoneNode + routeLink(carrier, linkState(lOk), probe && probe.ok ? ms(probe.tcpMs) : '') + mod;
    }
    // the facts as list rows: what network the phone has, which route the app chose and what the measurements gave
    function factsHtml(net, d) {
      var rows = [];
      function addRow(icon, title, sub, st, badge) {
        rows.push('<li class="nx-fact' + (st ? ' nx-s-' + st : '') + '"><span class="nx-fi nx-i-' + icon + '"></span><div><b>' + esc(title) + '</b>' +
          (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + (badge ? '<em>' + esc(badge) + '</em>' : '') + '</li>');
      }
      if (net) {
        var nt = netTitle(net);
        addRow(nt.i, nt.t, nt.s || (net.cellular && net.wifi ? 'mobile data is also on' : ''), (net.wifi || net.module) ? 'ok' : (net.cellular ? '' : 'fail'));
        if (net.vpn) {
          addRow('vpn', 'VPN on', ('vpnRoute' in net) ? (net.vpnRoute ? 'route to the accessory: ' + net.vpnRoute : 'does not affect the accessory\'s address') : '', 'warn');
        }
        if (net.route) {
          var extra = [];
          if (net.routeAgeSeconds != null) extra.push('chosen ' + net.routeAgeSeconds + ' s ago');
          if (net.cloudPreference) extra.push('the cloud has priority for another ' + net.cloudPreference + ' s');
          addRow('route', net.route === 'cloud' ? 'Via the Nice cloud' : 'Local connection', extra.join(' · '), '');
        }
      }
      if (d && d.probe) {
        var p = d.probe;
        addRow('gate', 'Accessory reached', p.ok
          ? 'TCP ' + ms(p.tcpMs) + (p.tlsMs != null ? ' · TLS ' + ms(p.tlsMs) : '')
          : (p.tcpMs != null ? 'TCP ' + ms(p.tcpMs) + ', but no answer to the secure handshake' : 'no answer' + (p.error ? ' (' + shortError(p.error) + ')' : '')),
          p.ok ? 'ok' : 'fail', p.ok ? 'ok' : 'failed');
      }
      if (d && d.cloud) {
        var c = d.cloud;
        addRow('cloud', 'Nice cloud', c.ok ? 'reachable' + (c.tcpMs != null ? ' · TCP ' + ms(c.tcpMs) : '') : 'not reachable' + cloudReason(c),
          c.ok ? 'ok' : 'fail', c.ok ? 'ok' : 'failed');
      }
      if (d) {
        addRow('check', 'App connection', d.reachable ? 'the app has a session with the accessory' : 'the app did not get a session with the accessory',
          d.reachable ? 'ok' : 'fail', d.reachable ? 'ok' : 'failed');
      }
      return rows.join('');
    }
    // update the sheet with what is known now: the shape and color of the header follow the state
    function renderSheet() {
      if (!panel) return;
      var st = lastStatus || { level: 'unknown', text: 'Accessory' };
      var net = (sheetData && sheetData.net) || st.net || null;
      var stateLevel = busyDiag ? 'busy' : (/^(ok|warn|bad|info)$/.test(st.level) ? st.level : 'unknown');
      ['ok', 'warn', 'bad', 'info', 'unknown', 'busy'].forEach(function (k) { panel.classList.remove('nx-l-' + k); });
      panel.classList.remove('nx-via-cloud');
      panel.classList.remove('nx-via-local');
      panel.classList.add('nx-l-' + stateLevel);
      panel.classList.add('nx-via-' + (net && net.route === 'cloud' ? 'cloud' : 'local'));
      if (busyDiag) panel.classList.add('nx-busy'); else panel.classList.remove('nx-busy');
      elHeadline.textContent = (busyDiag && !sheetData) ? 'Checking…' : st.text;
      elExplanation.textContent = sheetData ? sheetData.conclusion : (busyDiag ? 'Measuring the connection…' : '');
      elRoute.innerHTML = routeHtml(net, sheetData);
      elFacts.innerHTML = factsHtml(net, sheetData);
    }
    function openSheet() {
      if (sheetOpen || !panel) return;
      sheetOpen = true;
      renderSheet();
      scrim.style.display = 'block';
      panel.style.display = 'block';
      panel.scrollTop = 0;
      // the transition only starts once the initial state has been drawn: wait two frames
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () { raf(function () {
        if (!sheetOpen) return;
        panel.classList.add('nx-open');
        scrim.classList.add('nx-open');
      }); });
    }
    function closeSheet() {
      if (!sheetOpen || !panel) return;
      sheetOpen = false;
      panel.classList.remove('nx-open');
      scrim.classList.remove('nx-open');
      panel.style.transform = '';
      setTimeout(function () {
        if (sheetOpen) return;
        panel.style.display = 'none';
        scrim.style.display = 'none';
      }, 420);
    }
    function toggleSheet() {
      if (sheetOpen) { closeSheet(); } else { openSheet(); diagnose(); }
    }

    // ---- Android's status bar in the color of the surface, with matching icons; the app colored it differently per page
    function tuneStatusBar() {
      try {
        var sb = window.StatusBar;
        if (!sb) return;
        var color = String(getComputedStyle(document.documentElement).getPropertyValue('--md-sys-color-surface') || '').trim();
        var dark = isDarkNow();
        if (/^#[0-9a-f]{6}$/i.test(color) && sb.__nxColor) sb.__nxColor(color);
        var style = dark ? sb.__nxLight : sb.__nxDark;
        if (style) style();
      } catch (e) {}
    }
    function wrapStatusBar() {
      try {
        var sb = window.StatusBar;
        if (!sb || sb.__nx) return;
        sb.__nx = true;
        var color = sb.backgroundColorByHexString, light = sb.styleLightContent, dark = sb.styleDefault;
        if (typeof color !== 'function' || typeof light !== 'function' || typeof dark !== 'function') return;
        sb.__nxColor = function (k) { color.call(sb, k); };
        sb.__nxLight = function () { light.call(sb); };
        sb.__nxDark = function () { dark.call(sb); };
        // whatever the app calls (black, green, blue, white: different per page) becomes the color of the surface
        sb.backgroundColorByHexString = function () { tuneStatusBar(); };
        sb.styleLightContent = function () { tuneStatusBar(); };
        sb.styleDefault = function () { tuneStatusBar(); };
        tuneStatusBar();
        if (window.matchMedia) {
          var mq = window.matchMedia('(prefers-color-scheme: dark)');
          if (mq.addEventListener) mq.addEventListener('change', tuneStatusBar);
          else if (mq.addListener) mq.addListener(tuneStatusBar);
        }
      } catch (e) {}
    }

    function buildUi() {
      if (pill || !document.body) return;
      pill = document.createElement('div');
      pill.id = 'nx-status';
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');
      pill.setAttribute('aria-live', 'polite');
      pill.style.display = 'none';
      pill.addEventListener('click', toggleSheet);
      pill.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSheet(); } });

      scrim = document.createElement('div');
      scrim.className = 'nx-scrim';
      scrim.style.display = 'none';
      scrim.addEventListener('click', closeSheet);

      panel = document.createElement('div');
      panel.id = 'nx-sheet';
      panel.className = 'nx-sheet nx-l-unknown nx-via-local';
      panel.style.display = 'none';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', 'Accessory status');
      panel.innerHTML =
        '<div class="nx-handle"><div class="nx-progress m3e-progress m3e-indet" aria-hidden="true"><i></i><b></b></div></div>' +
        '<div class="nx-head"><div class="nx-shape" aria-hidden="true"><span class="nx-glyph"></span></div>' +
        '<div class="nx-text"><div class="nx-title" id="nx-sheet-title"></div></div></div>' +
        '<div class="nx-explanation" id="nx-sheet-explanation"></div>' +
        '<div class="nx-route" id="nx-sheet-route"></div>' +
        '<ul class="nx-facts" id="nx-sheet-facts"></ul>' +
        '<details class="nx-details"><summary>Technical details</summary><pre id="nx-sheet-text"></pre></details>' +
        '<div class="nx-more"></div>' +
        '<div class="nx-footer"></div>';
      elHeadline = panel.querySelector('#nx-sheet-title');
      elExplanation = panel.querySelector('#nx-sheet-explanation');
      elRoute = panel.querySelector('#nx-sheet-route');
      elFacts = panel.querySelector('#nx-sheet-facts');
      panelText = panel.querySelector('#nx-sheet-text');
      function addButton(addRow, text, fn, className) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        if (className) b.className = className;
        b.addEventListener('click', fn);
        panel.querySelector(addRow).appendChild(b);
        return b;
      }
      btnUsers = addButton('.nx-more', 'New users', function () { checkWaitingUsers(true); });
      addButton('.nx-more', 'Copy', function () { copyText(panelText.textContent); });
      addButton('.nx-more', 'Log', function () {
        closeSheet();
        try { if (window.__nxLogShow) window.__nxLogShow(); } catch (e) {}
      });
      addButton('.nx-footer', 'Close', closeSheet, 'nx-text');
      btnReconnect = addButton('.nx-footer', 'Reconnect', reconnect, 'nx-primary');

      // dragging down closes the sheet (only from the top of the content)
      var sleep = null;
      panel.addEventListener('touchstart', function (e) {
        if (panel.scrollTop > 0 || !e.touches || !e.touches[0]) { sleep = null; return; }
        sleep = { y: e.touches[0].clientY, dy: 0, t: Date.now() };
      }, { passive: true });
      panel.addEventListener('touchmove', function (e) {
        if (!sleep || !e.touches || !e.touches[0]) return;
        var dy = e.touches[0].clientY - sleep.y;
        if (dy <= 0) { sleep.dy = 0; panel.style.transform = ''; return; }
        sleep.dy = dy;
        panel.style.transition = 'none';
        panel.style.transform = 'translateY(' + dy + 'px)';
      }, { passive: true });
      panel.addEventListener('touchend', function () {
        if (!sleep) return;
        var s = sleep;
        sleep = null;
        panel.style.transition = '';
        if (s.dy > 110 || (s.dy > 40 && Date.now() - s.t < 220)) closeSheet(); else panel.style.transform = '';
      }, { passive: true });

      // Android's back button closes the sheet first; in the capture phase, so the app's own back button handler does not fire as well
      document.addEventListener('backbutton', function (e) {
        if (!sheetOpen) return;
        try { e.stopImmediatePropagation(); e.preventDefault(); } catch (x) {}
        closeSheet();
      }, true);
      // a tap on the title (and so on the status line under it) opens the sheet
      document.addEventListener('click', function (e) {
        try {
          var t = e.target;
          if (sheetOpen || !t || !t.closest || !t.closest('.bar-header .title')) return;
          if (!lastStatus || lastStatus.level === 'none') return;
          toggleSheet();
        } catch (x) {}
      }, true);

      document.body.appendChild(scrim);
      document.body.appendChild(panel);
      document.body.appendChild(pill);
      renderSheet();
      wrapStatusBar();
      setTimeout(wrapStatusBar, 1500);
      setTimeout(wrapStatusBar, 5000);
      document.addEventListener('deviceready', function () { wrapStatusBar(); }, false);
    }
    buildUi();
    // nx11: the app only checks the accessories on the screen. One that nobody checks would keep showing what the last session
    // left in storage, so it is checked here (with the same new attempts). Not while the phone is on the accessory's own Wi-Fi.
    function kickoff() {
      try {
        var devs = allDevices();
        if (!devs.length) return;
        nx('netState', [devs[0].device.address || ''], function (net) {
          if (net && net.module) return;
          devs.forEach(function (x) {
            if (seen[x.device.mac] || runningSince(x.device.mac)) return;
            var d = liveDevice(x.home.homeId, x.device.mac) || x.device;
            try { $rootScope.verifyDeviceRecheability(d); } catch (e) { log('kickoff', String(e)); }
          });
        });
      } catch (e) { log('kickoff', String(e)); }
    }
    setTimeout(kickoff, KICKOFF);
    setTimeout(refreshPill, 1500);
    setTimeout(refreshPill, GRACE + 300);     // first chance for the automatic recovery, right after the quiet period
    setInterval(refreshPill, 20000);
    window.addEventListener('online', function () { setTimeout(refreshPill, 1500); });
    window.addEventListener('offline', function () { setTimeout(refreshPill, 1500); });

    // nx14: the history of the accessory in a sheet (nx-activity.js): $rootScope.nxActivity and nxLast for the accessory screen
    function findDevice(mac) {
      try {
        var hs = HS.homes || [];
        for (var i = 0; i < hs.length; i++) {
          var ds = hs[i].devices || [];
          for (var j = 0; j < ds.length; j++) if (ds[j].mac == mac) return ds[j];
        }
      } catch (e) {}
      return null;
    }
    var activity = null;
    try {
      if (typeof window.__nxActivity === 'function') {
        activity = window.__nxActivity({ inj: inj, $rootScope: $rootScope, NHK: NHK, log: log, toast: toast, liveDevice: liveDevice, findDevice: findDevice, copy: copyText });
      }
    } catch (e) { log('activity', String(e)); }
    // nx15: what the accessory says about its state (status requests and events, in the LOG), and the commands that this phone gives (Block and
    // Release are remembered, the log is read again after a command). The app's own functions are called as before; these only look along.
    if (activity) {
      try {
        var wrap = function (name, after) {
          var orig = NHK[name];
          if (typeof orig !== 'function' || orig.__nx) return;
          var w = function () {
            var p = orig.apply(NHK, arguments), args = arguments;
            try { after(args, p); } catch (e) { log('wrapper ' + name, String(e)); }
            return p;
          };
          w.__nx = true;
          NHK[name] = w;
        };
        wrap('status', function (args, p) {
          var d = args[0];
          p.then(function (res) { activity.onStatus(d, res); }, function (err) { log('state: status request failed', d && d.mac, JSON.stringify(err)); });
        });
        ['executePrimaryCommand', 'executeSecondaryCommand'].forEach(function (name) {
          wrap(name, function (args, p) {
            var d = args[0], code = args[2];
            p.then(function () { activity.onCommand(d, String(code), name); }, function (err) { log(name + ' failed', code, JSON.stringify(err)); });
          });
        });
        window.addEventListener('newDeviceState', function (e) { activity.onEvent(e); }, false);
      } catch (e) { log('state wrappers', String(e)); }
    }

    window.NX = { diagnose: diagnose, reconnect: reconnect, checkWaitingUsers: checkWaitingUsers, refresh: refreshPill, open: openSheet, close: closeSheet,
      theme: function (mode) { if (mode) $rootScope.nxSetTheme(mode); return themeNow; },
      palette: function (id) { if (id) $rootScope.nxSetPalette(id); return paletteNow; },
      activity: function (device) {
        if (!activity) return;
        var d = device || (allDevices()[0] || {}).device;
        if (d) activity.open(liveDevice(d.homeId, d.mac) || d);
      } };
    log('nx-patch active');
  }
})();
