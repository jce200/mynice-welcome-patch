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
  // nx23 (dialogs): toast(msg, opts), opts = { ms: how long (3500), action: 'Review', onAction: fn }. The snack takes no touches itself (its button
  // does: the styling is in status.css) and the text is spoken once, through the hidden live region of the accessibility layer (NxA11y.announce).
  function toast(msg, opts) {
    try {
      if (typeof opts === 'number') opts = { ms: opts };      // the older call: toast(msg, ms)
      opts = opts || {};
      // one at a time: a message about work in progress must not stay underneath the result
      Array.prototype.slice.call(document.querySelectorAll('.nx-snack')).forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); });
      var t = document.createElement('div');
      var live = typeof NxA11y !== 'undefined' && NxA11y && NxA11y.announce;
      t.className = 'nx-snack';
      t.setAttribute('lang', 'en');
      if (!live) t.setAttribute('role', 'status');      // without the accessibility layer the snack announces itself, as before
      // nx23 (command): on the accessory screen the message sits under the header: the command pad is the one place that nothing may cover
      if (/device-detail\//.test(String(location.hash))) t.setAttribute('data-nx-at', 'top');
      var txt = document.createElement('span');
      txt.textContent = msg;
      t.appendChild(txt);
      if (opts.action && typeof opts.onAction === 'function') {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = opts.action;
        b.addEventListener('click', function () {
          if (t.parentNode) t.parentNode.removeChild(t);
          try { opts.onAction(); } catch (e) { log('snack action', String(e)); }
        });
        t.appendChild(b);
      }
      // the styling (inverse surface, rounded corners, above the navigation bar) lives in nx-expressive.css; this is the safety net
      t.style.cssText = 'position:fixed;z-index:2147483645';
      document.body.appendChild(t);
      if (live) NxA11y.announce(msg);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, opts.ms > 0 ? opts.ms : 3500);   // nx23 (command): a failure stays longer (9 s)
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
        // nx23: the cause first, one action; what else to try is under "Technical details"
        return 'The phone did not join the accessory\'s Wi-Fi: Android\'s Connect dialog was canceled or timed out. Tap the accessory again and choose <b>Connect</b>.' +
          '<details class="nx-wz-details"><summary>Technical details</summary>WIFI_UNAVAILABLE: the request for the accessory\'s network was canceled, or Android did not answer within a minute. ' +
          'If it keeps failing, open Android\'s Wi-Fi settings, connect to the accessory\'s network yourself, return to the app and tap the accessory again.</details>';
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

  // ---- nx23 copy: begin
  // The explanation of a failure in the app's "Attention" alert is $translate.instant('NHK_ERROR-' + code). When the translation file has no text for the code,
  // instant() hands back the key itself and the person reads "NHK_ERROR-12" (or "NHK_ERROR-undefined"). This wraps instant() so that, in the app's own alert, such a
  // key becomes a sentence that says what is known and what to do. The texts that exist (their wording is in skin/copy/copy.json, which patch-21-copy.py puts in
  // locale-en.json; English only) are not touched, and neither is any other key.
  // It acts only when the call comes right after the one for the title of the alert (ALERT_TITLE_WARNING), which is how the app builds every alert:
  // showAlert($ionicPopup, $translate.instant('ALERT_TITLE_WARNING'), $translate.instant('NHK_ERROR-' + code)). The helpers of this file and of nx-activity.js also
  // ask for such keys and compare the answer with the key to find out whether the app has a text, so for them nothing changes. If the wrapper cannot be installed
  // the alert shows the key, as before. The function that was wrapped is $translate.instant.raw.
  (function () {
    var PREFIX = 'NHK_ERROR-', TITLE = 'ALERT_TITLE_WARNING';
    function trimmed(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
    // what the person reads for a code that has no text; the code itself only when it is a plain number or word
    function unknownError(key) {
      var code = key.slice(PREFIX.length);
      if (/^[A-Za-z0-9_.-]{1,24}$/.test(code) && !/^(undefined|null|NaN)$/.test(code)) return 'The accessory reported error ' + code + '. Check the gate.';
      return 'The accessory reported an error. Check the gate.';
    }
    function wrap($translate) {
      try {
        if (!$translate || typeof $translate.instant !== 'function' || $translate.instant.__nxCopy) return false;
        var orig = $translate.instant, last = '';
        var wrapped = function (id) {
          var prev = last;
          last = typeof id === 'string' ? id : '';
          var r = orig.apply(this, arguments);
          try {
            if (prev === TITLE && typeof id === 'string' && trimmed(id).indexOf(PREFIX) === 0 && r === trimmed(id)) {
              log('copy: no text for', r);
              return unknownError(r);
            }
          } catch (e) {}
          return r;
        };
        wrapped.__nxCopy = true;
        wrapped.raw = orig;
        $translate.instant = wrapped;
        log('copy: the texts of failures are completed');
        return true;
      } catch (e) { return false; }
    }
    // the cause alone: the texts of failures end with a sentence for the case that a command was just sent ("If you just sent a command, it may have arrived: check the gate, then try again.").
    // Where a failure is about something else (reading the history, allowing a user, a check of the accessory) that sentence is wrong, so those places take it off
    function cause(text) { return String(text == null ? '' : text).replace(/\s*If you just sent a command[\s\S]*$/, ''); }
    window.__nxCopy = { wrap: wrap, unknownError: unknownError, cause: cause };
    // before the app starts (this file is loaded before Angular boots it): a decorator, so that not one call goes round the wrapper
    try {
      if (window.angular && window.angular.module) {
        window.angular.module('app').config(['$provide', function ($provide) {
          $provide.decorator('$translate', ['$delegate', function ($delegate) { wrap($delegate); return $delegate; }]);
        }]);
      }
    } catch (e) { log('copy: no decorator', String(e)); }
    // and through the injector, for an app that is already running (it also ends this poll when the decorator did the work)
    var tries = 0, iv = setInterval(function () {
      tries++;
      try {
        var inj = injector();
        if (inj && inj.has('$translate')) { wrap(inj.get('$translate')); clearInterval(iv); return; }
      } catch (e) {}
      if (tries > 120) clearInterval(iv);
    }, 250);
  })();
  // ---- nx23 copy: end

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

  // ---- nx23 dialogs: begin ------------------------------------------------------------------------------------------------------
  // The semantic layer (nx23, workstream Dialogs, LOG and accessibility), added from OUTSIDE: no template, sheet or popup of the app or of the other
  // patches is changed. One MutationObserver (one pass per frame over the nodes that were added) and a quiet pass every 1.5 s give what the markup lacks:
  // roles, names, tab stops, headings, the language, live state. One delegated key handler: Enter and Space on what is a control only because of a click
  // handler, the arrows in a radio group, Escape for the dialog that is open. The dialog manager moves the focus into a dialog, makes the page behind it
  // inert, closes it with Escape and Back, and gives the focus back. It finds its elements by the class names in RULES and DIALOGS below (they belong to the
  // other workstreams: harness/steps-a11y.cjs fails loudly when one disappears). Everything is guarded: a bug in this layer must never reach the app's
  // own handlers, and nothing is inert unless a dialog is open right now (the gate can only be stopped while the page is live).
  var NxA11y = (function () {
    var api = { announce: function () {}, sync: function () {}, decorate: function () {}, top: function () { return null; }, errors: [], events: [] };      // errors: exceptions that were caught; events: things that should not happen (the watchdog)
    if (window.__nxA11y) return window.__nxA11y;
    window.__nxA11y = api;
    var root = document.documentElement;
    function note(where, e) {
      try { if (api.errors.length < 30) api.errors.push(where + ': ' + String(e)); if (api.errors.length <= 3) log('accessibility layer', where, String(e)); } catch (x) {}
    }
    function setAttr(el, k, v) { if (el.getAttribute(k) !== v) el.setAttribute(k, v); }
    function isNative(el) { return (el.tagName === 'A' && el.hasAttribute('href')) || /^(BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName); }
    function isEnglish() { return /^en/i.test(root.getAttribute('lang') || 'en'); }
    function textOf(el) {
      var out = [];
      (function walk(n) {
        for (var c = n.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 3) out.push(c.data); else if (c.nodeType === 1) { out.push(' '); walk(c); out.push(' '); }
        }
      })(el);
      return out.join('').replace(/\s+/g, ' ').trim();
    }

    // ---------------------------------------------------------------- 1. Ionic's tap gate
    // Ionic stops every click that it did not make itself (tapClickGateKeeper: no isIonicTap): the click of a key press (Enter), of el.click() and of TalkBack's
    // double tap would never reach the app's handlers. A click with detail 0 (a real touch click has detail 1) inside one of our scopes is let through. The
    // touch path is not touched: Ionic still makes the one click of a tap, and the browser's own click after it is still stopped (no second command).
    var GATE_SCOPE = '[data-nx-act],button[class^="nx-"],button[class*=" nx-"],.nx-sheet,#nx-log-panel,.popup-container,.nx-gal,.nx-snack,label.item-radio,label.item-checkbox';   // our own buttons (the Activity entry, the button of the status line, the chip) are native buttons: they have no data-nx-act, but a click of a key press or of TalkBack has to reach them as well
    window.addEventListener('click', function (e) {
      try {
        if (e.isIonicTap || !(e.detail === 0 || e.pointerType === '')) return;
        var t = e.target;
        if (t && t.closest && t.closest(GATE_SCOPE)) e.isIonicTap = true;
      } catch (x) {}
    }, true);

    // ---------------------------------------------------------------- 2. the rules table: roles, names, tab stops
    function act(el, role) {
      if (role && !el.hasAttribute('role')) el.setAttribute('role', role);
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      if (!el.hasAttribute('data-nx-act')) el.setAttribute('data-nx-act', '1');
    }
    // a name that this layer gave (data-nx-name) is taken away again when the reason is gone (another language, no request)
    function nameIt(el, label) {
      if (label) { if (!el.hasAttribute('aria-label') || el.hasAttribute('data-nx-name')) { setAttr(el, 'aria-label', label); setAttr(el, 'data-nx-name', '1'); } }
      else if (el.hasAttribute('data-nx-name')) { el.removeAttribute('aria-label'); el.removeAttribute('data-nx-name'); }
    }
    var PAD_NAMES = { open: 'Open the gate', close: 'Close the gate', stop: 'Stop the gate' };
    function padKey(el) {
      var sp = el.querySelector && el.querySelector('[translate]'), m = sp && /_(open|close|stop)$/i.exec(sp.getAttribute('translate') || '');
      return m ? m[1].toLowerCase() : '';
    }
    function hasNamedControl(el) {
      var l = el.querySelectorAll('button,[role=button]');
      for (var i = 0; i < l.length; i++) if ((l[i].textContent || '').trim() || l[i].getAttribute('aria-label')) return true;
      return false;
    }
    function routeLabel(el) {
      var parts = [];
      for (var i = 0; i < el.children.length; i++) {
        var c = el.children[i], cl = c.classList;
        if (cl.contains('nx-node')) {
          var b = c.querySelector('b'), s = c.querySelector('small'), sub = s ? textOf(s) : '';
          parts.push((b ? textOf(b) : '') + (sub ? ' (' + sub + ')' : ''));
        } else if (cl.contains('nx-link')) {
          var sm = c.querySelector('small'), via = sm ? textOf(sm) : '';
          parts.push((cl.contains('nx-s-ok') ? 'connected' : cl.contains('nx-s-fail') ? 'failed' : 'not checked') + (via ? ' via ' + via : ''));
        }
      }
      if (parts.length) { setAttr(el, 'role', 'img'); setAttr(el, 'aria-label', 'Route: ' + parts.join(', ')); }
    }
    // text that is spoken once, when it really changes (the sheet renders the same text again every 20 s; a live region would repeat it)
    function watchText(el, speak) {
      if (el.__nxW) return;
      el.__nxW = 1;
      var last = el.textContent;
      new MutationObserver(function () { try { var t = el.textContent; if (t !== last) { last = t; speak(t); } } catch (e) { note('watch', e); } })
        .observe(el, { childList: true, characterData: true, subtree: true });
    }
    // the chip text: spoken when it has settled. The app writes it again every 20 s, also when it did not change (the chip is not a live region of its own).
    // A confirmed state is spoken after 0.7 s, "checking" and "connecting" only if they last 3 s (so that the start-up sequence is not read three times).
    function watchChip(p) {
      if (p.__nxW) return;
      p.__nxW = 1;
      p.setAttribute('aria-live', 'off');     // role=status is a live region by itself: it must not say the chip a second time
      var last = p.textContent, timer = 0;
      new MutationObserver(function () {
        try {
          var t = p.textContent;
          if (t === last) return;
          last = t;
          clearTimeout(timer);
          if (!t) return;
          var settled = /^(ok|bad|warn|info)$/.test(p.getAttribute('data-level') || '');
          timer = setTimeout(function () { if (p.textContent === t && p.style.display !== 'none') announce(t); }, settled ? 700 : 3000);
        } catch (e) { note('chip', e); }
      }).observe(p, { childList: true, characterData: true, subtree: true });
    }
    function settingsPending() { var n = parseInt(root.getAttribute('data-nx-pending') || '0', 10); return n > 0 ? n : 0; }
    // the text of a header title without the status chip (a button that nx-patch.js puts in at the end of the title, it is not part of the page title: a bar with no title of its own
    // has the chip alone in it, and the heading of such a page is in the page)
    function titleText(el) {
      var t = '';
      for (var c = el.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) t += c.data;
        else if (c.nodeType === 1 && !(c.classList && c.classList.contains('nx-chip'))) t += c.textContent;
      }
      return t.replace(/\s+/g, ' ').trim();
    }

    function apply(el) {
      var m = function (sel) { return el.matches(sel); };
      // headings: the title of the page, if it has text of its own (the chip under it is generated, it is not part of the text)
      if (m('.bar .title, h1.title')) {
        if (titleText(el)) { setAttr(el, 'role', 'heading'); setAttr(el, 'aria-level', '1'); }
        else if (el.getAttribute('role') === 'heading') { el.removeAttribute('role'); el.removeAttribute('aria-level'); }
      }
      // icon buttons of the header: the eye of the accessory screen also has the class of a back button, so it is named first
      if (m('.bar .icon-occhio')) nameIt(el, 'More commands');
      else if (m('.bar .ion-ios-arrow-back, ion-nav-back-button')) nameIt(el, 'Back');
      else if (m('.bar .ion-android-add')) nameIt(el, 'Add');
      else if (m('.bar .ion-ios-arrow-forward') && !(el.textContent || '').trim()) nameIt(el, 'Next');
      // the tab bar
      if (m('.tabs')) setAttr(el, 'role', 'tablist');
      if (m('.tab-item')) {
        act(el, 'tab');
        var on = el.classList.contains('tab-item-active') || el.classList.contains('active');
        setAttr(el, 'aria-selected', on ? 'true' : 'false');
        if (on) setAttr(el, 'aria-current', 'page'); else el.removeAttribute('aria-current');
        if (el.querySelector('.icon-settings')) {
          var n = settingsPending();
          nameIt(el, n ? ((el.textContent || '').replace(/\s+/g, ' ').trim() || 'Settings') + ', ' + n + (n === 1 ? ' access request' : ' access requests') : '');
        }
      }
      // the gate: Open, Close, Stop, the extra commands, the line of the last movement
      if (m('a.command, .nx-extra, .nx-extra-edit, .nx-last')) {
        if (!isNative(el)) act(el, 'button');
        if (m('.nx-last, .nx-design-row, #nx-status')) setAttr(el, 'aria-haspopup', 'dialog');
      }
      if (m('.device-commands .command:not(.nx-extra)')) {
        var key = padKey(el);
        nameIt(el, key && isEnglish() ? PAD_NAMES[key] : '');      // another language keeps its own visible word as the name (WCAG 2.5.3)
      }
      // anything else that is clickable only because of a click handler (the rows of Settings, Demo, Help, Visit Nice website, the button rows)
      if (m('[data-ng-click],[ng-click]') && el.tagName.indexOf('-') < 0 && !isNative(el) && !el.hasAttribute('data-nx-act') && /^(|button|link)$/.test(el.getAttribute('role') || '') &&
          !el.querySelector('input,select,textarea,a[href]') && !hasNamedControl(el) && !el.closest('ion-toggle')) act(el, el.hasAttribute('role') ? null : 'button');
      // a button without a name inside a row that is clickable as a whole is only the arrow of the row; a hidden submit button (Enter in a form) is not a control either
      if (m('.item button, button[type="submit"]') && !(el.textContent || '').trim() && !el.hasAttribute('aria-label') && !el.hasAttribute('title') && !el.hasAttribute('ng-click') && !el.hasAttribute('data-ng-click') &&
          (el.closest('.item[data-ng-click],.item[ng-click]') || /opacity:\s*0/.test(el.getAttribute('style') || ''))) { setAttr(el, 'aria-hidden', 'true'); setAttr(el, 'tabindex', '-1'); }
      if (m('[role=radio],[role=checkbox],[role=switch],[role=option],[role=tab]') && !isNative(el)) act(el, null);
      if (m('.nx-design-row')) { if (!isNative(el)) act(el, 'button'); setAttr(el, 'aria-haspopup', 'dialog'); }
      // the switch of Ionic (its checkbox is display:none): the label becomes the switch
      if (m('label.toggle')) {
        var inp = el.querySelector('input'), row = el.closest('.item-toggle');
        act(el, 'switch');
        if (inp) setAttr(el, 'aria-checked', inp.checked ? 'true' : 'false');
        var tx = row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (tx && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', tx);
      }
      // a radio group: one tab stop, on the radio that is checked (the arrows move inside it)
      if (m('[role=radiogroup]')) {
        var rs = el.querySelectorAll('[role=radio]'), chk = null, i;
        for (i = 0; i < rs.length; i++) if (rs[i].getAttribute('aria-checked') === 'true' || rs[i].getAttribute('aria-pressed') === 'true') { chk = rs[i]; break; }
        if (!chk && rs.length) chk = rs[0];
        for (i = 0; i < rs.length; i++) setAttr(rs[i], 'tabindex', rs[i] === chk ? '0' : '-1');
      }
      // wizard progress and the search
      if (m('.bar-footer.bridge_stepper')) {
        var st = el.querySelector('.stepper');
        setAttr(el, 'role', 'progressbar'); setAttr(el, 'aria-label', 'Setup progress');
        setAttr(el, 'aria-valuemin', '0'); setAttr(el, 'aria-valuemax', '100');
        setAttr(el, 'aria-valuenow', String(Math.max(0, Math.min(100, Math.round(parseFloat(st && st.style.width) || 0)))));
      }
      if (m('ion-spinner')) { var pg = el.closest('ion-content, .scroll-content, ion-view'); if (pg) setAttr(pg, 'aria-busy', 'true'); }
      // the state of the gate is spoken when it changes (louder when something blocks the gate); .nx-state is the state word of the new gate screen
      if (m('.device-info .device-row:first-child, .nx-state')) {
        var hot = el.querySelector('.status-1:not(.ng-hide)') || /obstruct/i.test(el.textContent || '');
        setAttr(el, 'role', 'status'); setAttr(el, 'aria-atomic', 'true'); setAttr(el, 'aria-live', hot ? 'assertive' : 'polite');
      }
      // the sheets and the popup
      if (m('.nx-sheet, .nx-gal')) { setAttr(el, 'lang', 'en'); if (el.id === 'nx-sheet') { setAttr(el, 'aria-labelledby', 'nx-sheet-title'); setAttr(el, 'aria-busy', el.classList.contains('nx-busy') ? 'true' : 'false'); } }
      // the English islands in the page of another language (the app follows $translate, the words of these patches are English): the chip and the status line
      if (m('.nx-chip, .nx-line, .nx-pill, .nx-unknown, .nx-settled, .nx-last')) setAttr(el, 'lang', 'en');
      if (m('.nx-scrim')) setAttr(el, 'aria-hidden', 'true');
      if (m('#nx-sheet-explanation')) watchText(el, function (t) { if (t) announce(t); });
      if (m('.nx-route')) routeLabel(el);
      if (m('#nx-status')) { setAttr(el, 'aria-haspopup', 'dialog'); watchChip(el); }
      if (m('.popup-container')) {
        var pop = el.querySelector('.popup');
        if (pop) {
          var ti = pop.querySelector('.popup-title'), bo = pop.querySelector('.popup-body');
          setAttr(pop, 'role', 'alertdialog'); setAttr(pop, 'aria-modal', 'true'); setAttr(pop, 'lang', 'en');
          if (ti) { if (!ti.id) ti.id = 'nx-popup-title'; setAttr(pop, 'aria-labelledby', ti.id); }
          if (bo) { if (!bo.id) bo.id = 'nx-popup-body'; setAttr(pop, 'aria-describedby', bo.id); }
        }
      }
    }
    var RULES = '[data-ng-click],[ng-click],[role=radio],[role=checkbox],[role=switch],[role=option],[role=tab],[role=radiogroup],.tab-item,.tabs,label.toggle,.bar .title,h1.title,' +
      '.bar .icon-occhio,.bar .ion-ios-arrow-back,.bar .ion-ios-arrow-forward,.bar .ion-android-add,ion-nav-back-button,ion-spinner,.nx-design-row,#nx-status,.bar-footer.bridge_stepper,' +
      '.device-info .device-row:first-child,.nx-state,#nx-sheet-explanation,.nx-sheet,.nx-gal,.nx-scrim,.nx-route,.popup-container,a.command,.device-commands .command,.nx-extra,.nx-extra-edit,.nx-last,.nx-chip,.nx-line,.nx-pill,.nx-unknown,.nx-settled,.item button,button[type="submit"]';
    function decorate(node) {
      try {
        if (node.matches && node.matches(RULES)) apply(node);
        if (node.querySelectorAll) { var l = node.querySelectorAll(RULES); for (var i = 0; i < l.length; i++) { try { apply(l[i]); } catch (e) { note('apply', e); } } }
      } catch (e) { note('decorate', e); }
    }
    api.decorate = decorate;

    // ---------------------------------------------------------------- 3. the keyboard
    // Enter and Space press what is a control only because of a click handler; arrows, Home and End move inside a radio group; Escape closes the dialog on top.
    // The three buttons of the gate are among them: a held key must not queue commands (e.repeat), and the app has its own guard of 500 ms after a command.
    document.addEventListener('keydown', function (e) {
      try {
        if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
        var t = e.target;
        if (e.key === 'Escape' || e.key === 'Esc') { var d = topDialog(); if (d) { e.preventDefault(); onEscape(d); } return; }
        if (!t || !t.closest || !t.hasAttribute) return;
        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && t.hasAttribute('data-nx-act') && !isNative(t)) {
          e.preventDefault();
          if (!e.repeat) t.click();
          return;
        }
        if (/^(Arrow(Left|Right|Up|Down)|Home|End)$/.test(e.key) && t.getAttribute('role') === 'radio') {
          var g = t.closest('[role=radiogroup]');
          if (!g) return;
          var rs = Array.prototype.slice.call(g.querySelectorAll('[role=radio]')), i = rs.indexOf(t);
          if (i < 0 || rs.length < 2) return;
          var n = e.key === 'Home' ? 0 : e.key === 'End' ? rs.length - 1 : (i + (/Left|Up/.test(e.key) ? -1 : 1) + rs.length) % rs.length;
          e.preventDefault();
          if (e.repeat) return;
          for (var k = 0; k < rs.length; k++) rs[k].setAttribute('tabindex', k === n ? '0' : '-1');
          rs[n].focus();
          rs[n].click();
        }
      } catch (x) { note('keydown', x); }
    }, true);
    // the checked state of a switch, a radio and a checkbox is a property of a hidden input: follow its change event
    document.addEventListener('change', function (e) {
      try {
        var l = e.target && e.target.closest && e.target.closest('label.toggle');
        if (l) apply(l);
      } catch (x) {}
    }, true);
    // a radio of a group that the click has just checked: the tab stop follows at once
    document.addEventListener('click', function (e) {
      try {
        var r = e.target && e.target.closest && e.target.closest('[role=radio]'), g = r && r.closest('[role=radiogroup]');
        if (g) setTimeout(function () { try { apply(g); } catch (x) {} }, 60);
      } catch (x) {}
    }, true);

    // ---------------------------------------------------------------- 4. announcements
    // One hidden live region for everything that is said without moving the focus (a toast, the new explanation of the status sheet, the chip). Written empty
    // first, so that the same text twice is heard twice (a repeat of a command), and never on the page's own live regions.
    var liveTimer = 0;
    function announce(text) {
      try {
        if (!text || !document.body) return;
        var el = document.getElementById('nx-live');
        if (!el) {
          el = document.createElement('div');
          el.id = 'nx-live'; el.className = 'nx-sr'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true'); el.setAttribute('lang', 'en');
          document.body.appendChild(el);
        }
        el.textContent = '';
        clearTimeout(liveTimer);
        liveTimer = setTimeout(function () { el.textContent = String(text); }, 60);
      } catch (e) { note('announce', e); }
    }
    api.announce = announce;

    // ---------------------------------------------------------------- 5. the dialog manager
    // A dialog is a sheet (.nx-sheet: the status sheet, the Activity sheet, the Debug log), the page Settings > Design (.nx-gal) or a popup of Ionic. It is open
    // when it is displayed AND has the class that the owner puts on it (nx-open; popup-showing). The one on top is the last in the document, which is also the
    // order in which they are drawn (the popup is raised above the sheets in status.css).
    var DIALOGS = '.nx-sheet,.nx-gal,.popup-container';
    var cur = null, opener = null, offBack = null, syncQueued = false;
    function isOpen(d) {
      var cs = window.getComputedStyle(d);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (d.classList.contains('popup-container')) return d.classList.contains('popup-showing') && !d.classList.contains('popup-hidden');
      return d.classList.contains('nx-open');
    }
    function openDialogs() {
      var all = document.querySelectorAll(DIALOGS), out = [];
      for (var i = 0; i < all.length; i++) { watchDialog(all[i]); if (isOpen(all[i])) out.push(all[i]); }
      return out;
    }
    function topDialog() { var l = openDialogs(); return l.length ? l[l.length - 1] : null; }
    api.top = topDialog;
    function clearInert() {
      var l = document.querySelectorAll('[data-nx-inert]');
      for (var i = 0; i < l.length; i++) { l[i].removeAttribute('inert'); l[i].removeAttribute('data-nx-inert'); }
    }
    function setInert(d) {
      clearInert();
      for (var n = d; n && n !== document.body && n.parentElement; n = n.parentElement) {
        var sib = n.parentElement.children;
        for (var i = 0; i < sib.length; i++) {
          var s = sib[i];
          if (s === n || /^(SCRIPT|STYLE|LINK)$/.test(s.tagName) || s.id === 'nx-live' || s.classList.contains('nx-scrim') || s.classList.contains('nx-snack') || s.classList.contains('backdrop') || s.hasAttribute('inert')) continue;
          s.setAttribute('inert', ''); s.setAttribute('data-nx-inert', '1');
        }
      }
    }
    // a change of class or display of a dialog is the moment to look again (not every change of style: the sheet's drag writes a transform 60 times a second)
    var dmo = new MutationObserver(function (muts) {
      var run = false;
      for (var i = 0; i < muts.length; i++) {
        var t = muts[i].target;
        if (muts[i].attributeName === 'style') { if (t.__nxDisp !== t.style.display) { t.__nxDisp = t.style.display; run = true; } } else run = true;
        if (muts[i].attributeName === 'class') { try { apply(t); } catch (x) {} }
      }
      if (run) syncSoon();
    });
    function watchDialog(d) {
      if (d.__nxD) return;
      d.__nxD = 1; d.__nxDisp = d.style.display;
      dmo.observe(d, { attributes: true, attributeFilter: ['class', 'style'] });
    }
    function syncSoon() { if (syncQueued) return; syncQueued = true; setTimeout(function () { syncQueued = false; sync(); }, 0); }
    function ionicPlatform() { try { var inj = injector(); return inj && inj.has('$ionicPlatform') ? inj.get('$ionicPlatform') : null; } catch (e) { return null; } }
    function fireBack() {
      try {
        if (window.cordova && typeof window.cordova.fireDocumentEvent === 'function') window.cordova.fireDocumentEvent('backbutton');
        else document.dispatchEvent(new Event('backbutton', { cancelable: true }));
      } catch (e) { note('back', e); }
    }
    // what Back and Escape do while a dialog is open: close the top one. (A capture listener on 'backbutton' cannot stop the others: cordova.js calls every
    // handler. The app's back action must not run as well, or a Back would also leave the accessory screen. Ionic runs only the action with the highest
    // priority: view 100, modal 200, action sheet 300, popup 400. This one is 350, and is registered only while a dialog is open.)
    function closeTop() {
      var t = topDialog();
      if (!t) return;
      try {
        if (t.id === 'nx-sheet' && window.NX && window.NX.close) window.NX.close();
        else if (t.id === 'nx-activity' && window.NX && window.NX.closeActivity) window.NX.closeActivity();
        else if (t.id === 'nx-gallery' && window.NxGallery && window.NxGallery.close) window.NxGallery.close();
        else if (t.id === 'nx-log-panel' && window.__nxLogHide) window.__nxLogHide();
        else if (t.classList.contains('popup-container')) { var no = t.querySelector('.popup-buttons button'); if (no) no.click(); }
        else { var sc = t.previousElementSibling; if (sc && sc.classList.contains('nx-scrim')) sc.click(); }      // a sheet that this layer does not know: its scrim closes it
      } catch (e) { note('closeTop', e); }
    }
    api.closeTop = closeTop;
    // Escape closes the dialog on top. A sheet is closed directly, not through a 'backbutton' event: that event is fired later (cordova.js queues it), and if the
    // dialog was closed by then the action above would be gone and the app would also go back a page. A popup belongs to Ionic: its own back action closes it.
    function onEscape(d) {
      if (d.classList.contains('popup-container')) fireBack(); else closeTop();
    }
    function sync() {
      try {
        var l = openDialogs(), t = l.length ? l[l.length - 1] : null;
        if (t === cur) {
          if (!t && document.querySelector('[data-nx-inert]')) clearInert();      // nothing is open: nothing may stay inert
          else if (t && !offBack && !t.classList.contains('popup-container')) registerBack();
          return;
        }
        var was = cur;
        cur = t;
        if (t) {
          if (!was) { var a = document.activeElement; opener = (a && a !== document.body && !t.contains(a)) ? a : null; }
          setInert(t);
          if (!t.classList.contains('popup-container')) registerBack();
          focusInto(t);
          root.setAttribute('data-nx-dialog', t.id || (t.classList.contains('popup-container') ? 'popup' : 'dialog'));
        } else {
          clearInert();
          if (offBack) { try { offBack(); } catch (e) {} offBack = null; }
          root.removeAttribute('data-nx-dialog');
          if (was && typeof api.onClosed === 'function') { try { api.onClosed(); } catch (e) { note('onClosed', e); } }
          var o = opener;
          opener = null;
          if (o && o.isConnected) { try { o.focus({ preventScroll: true }); } catch (e) {} }
        }
      } catch (e) { note('sync', e); try { clearInert(); } catch (x) {} }
    }
    api.sync = sync;
    function registerBack() {
      if (offBack) return;
      var ip = ionicPlatform();
      if (ip && typeof ip.registerBackButtonAction === 'function') offBack = ip.registerBackButtonAction(closeTop, 350);
    }
    function focusInto(t) {
      var target = t;
      if (t.classList.contains('popup-container')) {
        var p = t.querySelector('.popup'), first = p && p.querySelector('.popup-buttons button');      // "Not now" (the first button): never the one that grants access
        target = first || p || t;
        if (target === p && !p.hasAttribute('tabindex')) p.setAttribute('tabindex', '-1');
      } else if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (e) {}
    }

    // ---------------------------------------------------------------- 6. things that are derived from the page, in the quiet pass
    // the language of the page: nx-theme.js sets "en" before the first paint, the language of the app follows $translate (the keys of the 17 files are the codes)
    function syncLang() {
      var inj = injector();
      if (!inj || !inj.has('$translate')) return;
      var k = String(inj.get('$translate').use() || '').replace(/_/g, '-');
      if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(k)) k = 'en';
      setAttr(root, 'lang', k);
    }
    // html[data-nx-chip]: "0" while the app has no accessory (no chip and no status sheet: the Debug log button is docked in the header), else "1"
    function syncChip() {
      var v = allDevices().length ? '1' : '0';
      setAttr(root, 'data-nx-chip', v);
    }
    // the Debug log button needs a gap in the header: x 96 to 152. A page whose title or buttons run into it hides the button (data-nx-logfit="0")
    function logFit() {
      if (root.getAttribute('data-nx-chip') !== '0') { root.removeAttribute('data-nx-logfit'); return; }
      var bar = document.querySelector('ion-nav-bar .nav-bar-block[nav-bar="active"] .bar-header') || document.querySelector('.bar-header'), fit = true;
      if (bar) {
        var items = bar.querySelectorAll('.button, .title');
        for (var i = 0; i < items.length; i++) {
          var it = items[i], cs = window.getComputedStyle(it);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          var r;
          if (it.classList.contains('title')) {
            if (!(it.textContent || '').trim()) continue;
            var rg = document.createRange(); rg.selectNodeContents(it); r = rg.getBoundingClientRect();
          } else r = it.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && r.right > 92 && r.left < 156 && r.top < 80) fit = false;
        }
      }
      setAttr(root, 'data-nx-logfit', fit ? '1' : '0');
    }
    // the status chip comes right behind the header in the reading order and the Tab order (nx-patch.js adds it at the end of the page)
    function placeStatus() {
      var p = document.getElementById('nx-status'), nb = document.querySelector('ion-nav-bar');
      if (p && nb && nb.parentNode && p.previousElementSibling !== nb && p.parentNode !== nb) nb.parentNode.insertBefore(p, nb.nextSibling);
    }
    // the headers of the views that were left stay in the page, hidden but with their Back and eye buttons in the Tab order and the accessibility tree
    function cachedBars() {
      var l = document.querySelectorAll('ion-nav-bar .nav-bar-block');
      for (var i = 0; i < l.length; i++) {
        var b = l[i], cached = b.getAttribute('nav-bar') === 'cached';
        if (cached && !b.hasAttribute('inert')) { b.setAttribute('inert', ''); b.setAttribute('data-nx-cached', '1'); }
        else if (!cached && b.hasAttribute('data-nx-cached')) { b.removeAttribute('inert'); b.removeAttribute('data-nx-cached'); }
      }
    }
    function busyPages() {
      var l = document.querySelectorAll('[aria-busy="true"]:not(#nx-sheet)');
      for (var i = 0; i < l.length; i++) if (!l[i].querySelector('ion-spinner')) l[i].removeAttribute('aria-busy');
    }
    // a page whose bar has no title (the setup wizard: the title is the chip alone) has its heading in the page: the first h2 of the view becomes the level-1 heading
    function pageHeading() {
      var shown = function (e) { return !!e.offsetParent && !e.closest('[inert]') && (e.textContent || '').trim(); };
      var titles = document.querySelectorAll('.bar .title[role="heading"]'), has = false, i;
      for (i = 0; i < titles.length; i++) if (shown(titles[i]) && titleText(titles[i])) has = true;
      var h2s = document.querySelectorAll('ion-view h2'), done = has;
      for (i = 0; i < h2s.length; i++) {
        var h = h2s[i];
        if (!done && shown(h)) { setAttr(h, 'aria-level', '1'); h.setAttribute('data-nx-h1', '1'); done = true; }
        else if (h.hasAttribute('data-nx-h1')) { h.removeAttribute('aria-level'); h.removeAttribute('data-nx-h1'); }
      }
    }
    // every step on its own: one that fails (an odd page, a browser without a feature) never stops the others
    function pass() {
      if (document.hidden) return;
      [syncLang, syncChip, function () { decorate(document.body); }, placeStatus, cachedBars, busyPages, pageHeading, logFit].forEach(function (f) { try { f(); } catch (e) { note('pass', e); } });
    }
    api.pass = pass; api.syncChip = syncChip; api.logFit = logFit; api.syncLang = syncLang; api.placeStatus = placeStatus; api.cachedBars = cachedBars;

    // ---------------------------------------------------------------- 7. start
    var pendingNodes = [], scheduled = false;
    function flush() {
      scheduled = false;
      var l = pendingNodes;
      pendingNodes = [];
      try {
        if (l.length > 300) decorate(document.body);
        else for (var i = 0; i < l.length; i++) if (l[i].isConnected) decorate(l[i]);
        sync();
      } catch (e) { note('flush', e); }
    }
    var mo = new MutationObserver(function (muts) {
      try {
        var removed = false;
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          for (var j = 0; j < m.addedNodes.length; j++) if (m.addedNodes[j].nodeType === 1) pendingNodes.push(m.addedNodes[j]);
          if (m.removedNodes.length) removed = true;
          if (m.target.nodeType === 1 && m.target.classList && (m.target.classList.contains('nx-route') || m.target.id === 'nx-sheet-route')) pendingNodes.push(m.target);
        }
        if (!pendingNodes.length && !removed) return;
        if (!scheduled) { scheduled = true; (window.requestAnimationFrame || setTimeout)(flush, 16); }
      } catch (e) { note('observer', e); }
    });
    var booted = false;
    function boot() {
      if (booted || !document.body) return;
      booted = true;
      try {
        mo.observe(document.body, { childList: true, subtree: true });
        pass(); sync();
        setInterval(function () { try { pass(); } catch (e) { note('pass', e); } }, 1500);
        // the watchdog: a page that is inert without an open dialog would mean a Stop button that cannot be pressed
        setInterval(function () { if (!document.hidden) sync(); }, 1000);
        window.addEventListener('hashchange', function () { syncSoon(); setTimeout(function () { try { syncChip(); logFit(); } catch (e) {} }, 900); });
        document.addEventListener('visibilitychange', function () { syncSoon(); });
        document.addEventListener('touchstart', function () { if (!cur && document.querySelector('[data-nx-inert]')) { clearInert(); api.events.push('watchdog: inert without a dialog, cleared on touch'); log('accessibility layer: inert without a dialog, cleared on touch'); } }, { capture: true, passive: true });
      } catch (e) { note('boot', e); }
    }
    if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
    return api;
  })();
  // ---- nx23 dialogs: end --------------------------------------------------------------------------------------------------------

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

    // ---- nx23 wizard: begin
    // Setup (the first run and the pairing) explains itself. The app's steps are untouched; this block only adds words and one redirect:
    //  - the full-screen waits say what they wait for and what Android will ask (showLoadingAction is wrapped; the words come with the overlay),
    //  - what only the phone knows (Location off, VPN on, mobile data on) is added to "Accessory not found" and to the general network error, and only when it is true,
    //  - the timeout of the Wi-Fi configuration gets its own text (the app shows one text for every timeout, sensors and remote controls included, so it is replaced on the
    //    configuration pages only; skin/copy/wizard.json does not touch that key),
    //  - the app sends a full accessory (Settings > Add accessory) to a state that does not exist: it is redirected to the one that does (the page itself: patch-20-wizard.py).
    // A failure in here is logged and leaves the app as it was.
    try {
      (function () {
        var $state = inj.has('$state') ? inj.get('$state') : null;
        var $translate = inj.has('$translate') ? inj.get('$translate') : null;
        function tr(key) {
          try { var v = $translate && $translate.instant(key); return (v && v !== key) ? v : null; } catch (e) { return null; }
        }
        // the waits the wizard has: the title is what the app passes (the translated text of the key), so the words follow the app's own language of the title
        var WAITS = {
          search: { key: 'BRIDGE_SEARCH_TITLE', lead: 'When the accessory is found, Android will ask to connect to its Wi-Fi network: tap <b>Connect</b>.', sub: 'The search takes up to a minute.' },
          identify: { key: 'BRIDGE_SEARCH_TITLE_SINGLE', lead: 'Android will ask to connect to the accessory\'s Wi-Fi network. Tap <b>Connect</b>.',
            sub: 'Your phone may leave your home Wi-Fi for a minute and returns to it by itself.', late: 'Still waiting for Android\'s Connect dialog. If it did not come, tap the accessory again when this stops.', lateS: 20 },
          configure: { key: 'CONFIGURAZIONE', lead: 'Keep the app open. This can take up to 2½ minutes.', late: 'Taking long? If it fails, check the Wi-Fi password and that the network is 2.4 GHz.', lateS: 60 },
          request: { key: 'DEVICE_USERS_ASSOCIATION_STATUS_WAITING', lead: 'Sending your request to the accessory. Keep the app open: it gives up after 5 minutes.' },
          detect: { key: 'ONGOING_DETECTION', lead: 'Waiting for the accessory to appear on your Wi-Fi. Keep the app open: it gives up after 5 minutes.' }
        };
        function waitKind(title) {
          if (typeof title !== 'string') return null;
          for (var k in WAITS) { var t = tr(WAITS[k].key); if (t && t === title) return k; }
          return null;
        }
        function waitHtml(w, id) {
          return '<div class="nx-wz-lead">' + w.lead + '</div>' + (w.sub ? '<div class="nx-wz-sub">' + w.sub + '</div>' : '') +
            '<div class="nx-wz-progress m3e-progress m3e-indet" aria-hidden="true"><i></i><b></b></div>' +
            '<div class="nx-wz-late" role="status" data-nx-wz="' + id + '"></div>';
        }

        // what only the phone knows. Read when a wait starts and when the popup opens; used for 30 minutes at the most.
        var facts = null, factsAt = 0;
        function readFacts(done) {
          var f = { vpn: null, cellular: null, location: null }, left = 2;
          function fin() { if (--left > 0) return; facts = f; factsAt = Date.now(); if (done) done(f); }
          nx('netState', [''], function (net) { if (net && typeof net === 'object') { f.vpn = !!net.vpn; f.cellular = !!net.cellular; } fin(); }, function () { fin(); });
          try {
            if (window.WifiWizard && typeof window.WifiWizard.isLocalizationEnabled === 'function') {
              window.WifiWizard.isLocalizationEnabled(function (on) { f.location = !!on; fin(); }, function () { fin(); });
            } else { fin(); }
          } catch (e) { fin(); }
        }
        function freshFacts() { return (facts && Date.now() - factsAt < 1800000) ? facts : null; }
        function whyHtml(f) {
          var l = [];
          if (f && f.location === false) l.push('<div class="nx-wz-why"><b>Location is off.</b> Android hides nearby Wi-Fi networks from apps while it is off. Turn it on and try again.</div>');
          if (f && f.vpn) l.push('<div class="nx-wz-why"><b>A VPN is on.</b> Turn it off for the setup, then try again.</div>');
          if (f && f.cellular) l.push('<div class="nx-wz-why"><b>Mobile data is on.</b> Turn it off for the setup, then try again.</div>');
          return l.join('');
        }

        // the waits: showLoadingAction is defined when Ionic is ready (after this code may have started), so the property is watched: what the app assigns is wrapped
        var seq = 0, lateTimer = null;
        function startWait(kind, duration, id) {
          var w = WAITS[kind];
          if (kind === 'search' || kind === 'identify' || kind === 'configure') readFacts();
          // the overlay is built a moment after the call (the app's loader waits a tick, and a second call 100 ms later replaces the content): look at it for about a second
          var tries = 0;
          (function look() {
            if (id !== seq) return;
            var host = document.querySelector('.loading-container .popUp');
            if (host && host.getAttribute('data-nx-wz') !== String(id)) {
              host.setAttribute('data-nx-wz', String(id));
              // (nx23 QA) the overlay of the app has no role and no live region, so a screen reader said nothing when a wait began: the words are added to a polite one
              host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
              host.insertAdjacentHTML('beforeend', waitHtml(w, id));
            }
            if (++tries < 40) setTimeout(look, 30);
          })();
          if (w.late) {
            var ms = (typeof window.__nxWzLateMs === 'number') ? window.__nxWzLateMs : w.lateS * 1000;
            if (!duration || duration > ms + 3000) {
              lateTimer = setTimeout(function () {
                var el = document.querySelector('.loading-container .nx-wz-late[data-nx-wz="' + id + '"]');
                if (el) el.textContent = w.late;
              }, ms);
            }
          }
        }
        function wrapLoading(fn) {
          if (typeof fn !== 'function' || fn.__nxWz) return fn;
          var wrapped = function (message, isCommand, duration) {
            var r = fn.apply(this, arguments);
            try {
              // every overlay of the app ends what an earlier call was going to add (a later overlay of another kind must not get the words of the one before it)
              var id = ++seq, kind = isCommand ? null : waitKind(message);
              if (lateTimer) { clearTimeout(lateTimer); lateTimer = null; }
              if (kind) startWait(kind, duration, id);
            } catch (e) { log('wizard wait', String(e)); }
            return r;
          };
          wrapped.__nxWz = true;
          return wrapped;
        }
        var held = wrapLoading($rootScope.showLoadingAction);
        try {
          Object.defineProperty($rootScope, 'showLoadingAction', {
            configurable: true, enumerable: true,
            get: function () { return held; },
            set: function (fn) { held = wrapLoading(fn); }
          });
        } catch (e) { $rootScope.showLoadingAction = held; log('wizard: showLoadingAction is wrapped once, not watched', String(e)); }

        // "Accessory not found" (the popup of the app) and the timeout of the Wi-Fi configuration (an alert of the app)
        function onConfigPage() {
          try { return !!($state && /(configura-bridge|add-device-settings|setup-waiting|bridge-in-rete|connettiti-al-bridge)$/.test($state.current.name || '')); } catch (e) { return false; }
        }
        function fillWhy() {
          readFacts(function (f) {
            var html = whyHtml(f), n = 0;
            (function put() {
              var slots = document.querySelectorAll('.popup-body .nx-wz-whys'), slot = slots[slots.length - 1];
              if (slot) { if (slot.innerHTML !== html) slot.innerHTML = html; return; }
              if (++n < 10) setTimeout(put, 100);
            })();
          });
        }
        function decoratePopup(opts) {
          var title = tr('BRIDGE_NOT_FOUND_TITLE'), text = tr('BRIDGE_NOT_FOUND_TEXT'), o = null, k;
          function copyOf() { var c = {}; for (k in opts) c[k] = opts[k]; return c; }
          if (title && text && opts.title === title && opts.template === text) {
            o = copyOf();
            o.template = '<div class="nx-wz-whys">' + whyHtml(freshFacts()) + '</div>' + text;
            fillWhy();
          } else if (opts.template && opts.template === tr('ERR_TIMEOUT_RETRY') && onConfigPage()) {
            o = copyOf();
            o.template = 'The accessory did not join your Wi-Fi. Check the password and that the network is 2.4 GHz, then start again.';
          }
          return o;
        }
        ['show', 'alert'].forEach(function (name) {
          var orig = $ionicPopup && $ionicPopup[name];
          if (typeof orig !== 'function' || orig.__nxWz) return;
          var wrapped = function (opts) {
            var args = arguments;
            try { var o = (opts && typeof opts === 'object') ? decoratePopup(opts) : null; if (o) args = [o].concat(Array.prototype.slice.call(arguments, 1)); } catch (e) { log('wizard popup', String(e)); }
            return orig.apply(this, args);
          };
          wrapped.__nxWz = true;
          $ionicPopup[name] = wrapped;
        });
        // the general network error of the Wi-Fi steps (the message of the app when the error is not one of the known ones) gets the same lines
        var plainMsg = window.__nxMsg;
        if (typeof plainMsg === 'function') {
          window.__nxMsg = function (e, fallback) {
            var r = plainMsg(e, fallback);
            try { var why = (r === fallback) ? whyHtml(freshFacts()) : ''; if (why) return fallback + '<div class="nx-wz-whys">' + why + '</div>'; } catch (x) {}
            return r;
          };
        }

        // a full accessory: the app goes to 'tabsController.settings-user-pairing-max-user-reached', the state that exists has 'settings' twice in its name
        $rootScope.$on('$stateNotFound', function (ev, unfound) {
          try {
            if (unfound && unfound.to === 'tabsController.settings-user-pairing-max-user-reached') {
              unfound.to = 'tabsController.settings-settings-user-pairing-max-user-reached';
              log('wizard: the accessory is full; the app named a state that does not exist, redirected');
            }
          } catch (e) {}
        });
      })();
    } catch (e) { log('wizard', String(e)); }
    // ---- nx23 wizard: end

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
      if (resumeHold(device)) return 'checking';   // nx23: after a resume the app marks every accessory "not reachable" until its own check has answered (section 9)
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
    // (until nx22 there was a "<command>: sent" message here, shown at the tap whether or not anything went out; section 9 says what became of a tap)
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
    // ---- nx23 lists: begin
    // Favorites, Other commands and Settings (patch-19-lists.py asks for these; each is guarded, and where one does not exist the page shows what nx22 showed). They return strings, booleans or
    // nothing: a function that returns a new object on every call would make the digest spin.
    // The state of the accessory on its card or row, built only from what the lists already know (the app's flag and nxCheck: no traffic of its own):
    //   'online'      the app says it is usable and this session has a result for it (or none is needed any more)
    //   'checking'    no result of this session yet (the flag may be what the last session left), or a check runs after one that succeeded
    //   'connecting'  the last result was "not reachable" and a new attempt is running
    //   'offline'     not usable and nothing is being tried: "Not reachable"
    function nxUsable(device) { return typeof $rootScope.verifyDevice === 'function' ? !!$rootScope.verifyDevice(device) : !!(device && device.reachable); }
    $rootScope.nxFavState = function (device) {
      try {
        var chk = typeof $rootScope.nxCheck === 'function' ? $rootScope.nxCheck(device) : '';
        if (nxUsable(device)) return chk === 'checking' ? 'checking' : 'online';
        if (chk === 'retry') return 'connecting';
        return (chk === 'checking' || chk === 'hold') ? 'checking' : 'offline';
      } catch (e) { return ''; }
    };
    // The state of the gate on the card, only while it is confirmed: window.__nxTrust(device) (command feedback and trust, I-02) says 'live'. Without that function there is no state on the card.
    $rootScope.nxFavGate = function (device) {
      try {
        if (typeof window.__nxTrust !== 'function' || window.__nxTrust(device) !== 'live' || $rootScope.nxFavState(device) !== 'online') return '';
        var v = typeof $rootScope.nxState === 'function' ? $rootScope.nxState(device) : (device.properties && device.properties[0] && device.properties[0].value);
        return /^(open|closed|opening|closing|stopped)$/.test(v) ? v : '';
      } catch (e) { return ''; }
    };
    $rootScope.nxFavObst = function (device) {
      try { return !!($rootScope.nxFavGate(device) && device.properties && device.properties[1] && String(device.properties[1].value) === '1'); } catch (e) { return false; }
    };
    // A tap on a row of Favorites: the app's own goToDettaglio (go: it also sets the accessory type and does nothing for an accessory that is not usable), and for such an accessory the status sheet, which
    // knows why and offers Reconnect. Until nx22 the tap did nothing and said nothing.
    $rootScope.nxRowTap = function (device, go) {
      var usable = false;
      try { usable = nxUsable(device); } catch (e) { log('favorites: tap', String(e)); }
      try { if (typeof go === 'function') go(device.homeId, device.mac); } catch (e) { log('favorites: tap', String(e)); }   // an error of the app must not keep the sheet from opening
      try {
        if (!usable && window.NX && typeof window.NX.open === 'function') {
          window.NX.open();
          if (typeof window.NX.diagnose === 'function') window.NX.diagnose();
        }
      } catch (e) { log('favorites: tap', String(e)); }
    };
    // While a gate state is on the card it has to go when it stops being confirmed: nothing else makes the page look again after 30 seconds (the card is not on the accessory screen)
    setInterval(function () { try { if (document.querySelector('.nx-fav-gate, .nx-fav-obst')) digestSoon(); } catch (e) {} }, (typeof window.__nxFavTickMs === 'number') ? window.__nxFavTickMs : 5000);
    // Other commands: what a command does, by its code (the names are those of the app: DEVICE_COMMAND_<code>). A row that starts another group than the row above it gets space above (nxCmdGap).
    var CMD_MOVE = /^(MDAx|MDAy|MDAz|MDA0|MDA1|MDA2|MDA3|MDBi|MDBj|MDEz|MDE0|MDE1|MDE2|MDE3|MDE4)$/, CMD_BLOCK = /^(MDBk|MDBl|MDBm)$/, CMD_RELEASE = /^(MDEw|MDE5|MDFh)$/, CMD_LIGHT = /^(MDEx|MDEy)$/;
    function cmdGroup(c) { var k = c && c.code; return CMD_MOVE.test(k) ? 'move' : CMD_BLOCK.test(k) ? 'block' : CMD_RELEASE.test(k) ? 'release' : CMD_LIGHT.test(k) ? 'light' : 'other'; }
    $rootScope.nxCmdGap = function (commands, index) {
      try { return Array.isArray(commands) && index > 0 && index < commands.length && cmdGroup(commands[index]) !== cmdGroup(commands[index - 1]); } catch (e) { return false; }
    };
    // Settings > Debug log: the row calls $rootScope.nxLogOpen (offered by the dialogs part of nx23, below: it opens the LOG panel of debuglog.js)
    // ---- nx23 lists: end

    // Settings > Design: the page of Material 3 Expressive (nx-gallery.js, patch-17); without that script there is no function, and the row is not shown
    if (window.NxGallery && typeof window.NxGallery.open === 'function') {
      $rootScope.nxGallery = function () { try { window.NxGallery.open(); log('gallery', 'open'); } catch (e) { log('gallery', String(e)); } };
    }
    // nx23 dialogs: the Debug log (debuglog.js) from Settings (the row of the lists workstream: data-ng-click="nxLogOpen()") and from the status sheet
    $rootScope.nxLogOpen = function () { try { if (window.__nxLogShow) window.__nxLogShow(); } catch (e) { log('debug log', String(e)); } };
    $rootScope.nxExtra = extraCodes;
    $rootScope.nxQuickHas = function (device, code) { return quickCodes(device).indexOf(code) >= 0; };
    $rootScope.nxQuickToggle = quickToggle;
    $rootScope.nxCanQuick = canQuick;
    $rootScope.nxEditQuick = editQuick;

    // -------------------------------------------------------------- navigation
    $rootScope.$on('$stateChangeSuccess', function (ev, toState) {
      var n = (toState && toState.name) || '';
      if (/add-device-settings$/.test(n)) window.__nxCfgAt = 0;                 // back on the configuration screen
      // Outside the wizard the app must not stay tied to the accessory Wi-Fi (which has no internet).
      if (/^(tabsController\.(favorites|controls|system)|start-home$|init$)/.test(n)) nx('release', []);
      setTimeout(refreshPill, 800);
      try { flushDeferred(); } catch (e) {}     // nx23 dialogs: a request that waited for the person to leave the accessory screen
    });

    // -------------------------------------------------------------- 4. new users
    // the app's own explanation of an error ("Sign not valid", "The connection with the Accessory is not valid", ...)
    function errorText(err) {
      try {
        if (err == null) return '';
        if (typeof err === 'string') return err;
        var key = 'NHK_ERROR-' + err.code;
        var text = (err.code != null && inj.has('$translate')) ? inj.get('$translate').instant(key) : '';
        // (nx23 QA: the cause without the sentence about "a command that was just sent", and without its full stop: "<what>: <cause> (<code>).")
        return (text && text !== key) ? (window.__nxCopy && window.__nxCopy.cause ? window.__nxCopy.cause(text).replace(/\.\s*$/, '') : text) : (err.message ? String(err.message) : '');
      } catch (e) { return ''; }
    }
    // "<what>: <the app's explanation> (<code>)."; the fallback when there is neither an explanation nor a code
    function failedText(what, err, fallback) {
      var why = errorText(err);
      var code = (err && typeof err === 'object' && err.code != null) ? String(err.code) : '';
      if (!why && !code && fallback) return what + ' (' + fallback + ').';
      return what + (why ? ': ' + why : '') + (code ? ' (' + code + ')' : '') + '.';
    }
    // ---- nx23 dialogs: begin (the pairing popup) -------------------------------------------------------------------------------
    // (I-05) A request for access must not come back at every opening of the app, and no modal may open over the gate: Ionic's body.popup-open takes every
    // touch away from the page, Stop included. On the route of an accessory (device-detail) a request waits: a snack "<name> wants access · Review", a dot on
    // the Settings tab (html[data-nx-pending]), and the popup opens when the person has left that screen. "Not now" (and Back and Escape) snoozes the request
    // for 24 hours (localStorage 'nxSnooze', in try/catch like the rest); a check that the person asks for (the sheet's "New users", the snack's "Review")
    // ignores both rules. The app has no call to reject a request, so there is no Deny.
    var SNOOZE_KEY = 'nxSnooze', SNOOZE_MS = 24 * 3600 * 1000, deferred = {};
    function readSnooze() {
      try {
        var o = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) || '{}'), now = Date.now(), out = {};
        if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
        Object.keys(o).forEach(function (k) { if (+o[k] > now) out[k] = +o[k]; });
        return out;
      } catch (e) { return {}; }
    }
    function snooze(key) {
      try { var o = readSnooze(); o[key] = Date.now() + SNOOZE_MS; window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(o)); } catch (e) { log('snooze: not saved', String(e)); }
    }
    // the screen of an accessory (the hash, not $state, so that it can be tested): controls-/favorites-device-detail and their -bridge variants
    function onPad() { return /device-detail/.test(String(window.location.hash || '')); }
    // a sheet, the Debug log or the Design page is open: no popup over it either (Back would close both, the focus would have to jump)
    function dialogOpen() { try { return !!(NxA11y && NxA11y.top && NxA11y.top()); } catch (e) { return false; } }
    function showPending() {
      try {
        var n = Object.keys(deferred).length;
        if (n) document.documentElement.setAttribute('data-nx-pending', String(n)); else document.documentElement.removeAttribute('data-nx-pending');
      } catch (e) {}
    }
    // when the person leaves the accessory screen (and after a popup is answered): one waiting request at a time, from the list that is already there
    function flushDeferred() {
      setTimeout(function () {
        if (onPad() || popupOpen || dialogOpen()) return;
        var k = Object.keys(deferred)[0];
        if (!k) return;
        var x = deferred[k];
        delete deferred[k];
        showPending();
        promptUser(x.device, x.u, false);
      }, 700);
    }
    // cause first, and who it was about: "<name> was not allowed: <why> (<code>)."
    function notAllowed(name, err) {
      var who = '“' + name + '”', why = errorText(err), code = (err && typeof err === 'object' && err.code != null) ? String(err.code) : '';
      if (err && err.code == 11) return who + ' was not allowed: the accessory has reached its maximum number of users.';
      return who + ' was not allowed' + (why ? ': ' + why : (code ? '' : ': the accessory did not answer')) + (code ? ' (' + code + ')' : '') + '.';
    }
    function promptUser(device, u, manual) {
      var key = device.mac + '#' + (u.id != null ? u.id : u.username);
      if (prompted[key] || popupOpen) return;
      if (!manual && readSnooze()[key]) { log('new user: snoozed', u.username); return; }
      if (!manual && (onPad() || dialogOpen())) {
        if (!deferred[key]) {
          deferred[key] = { device: device, u: u };
          showPending();
          log('new user: waits until the accessory screen is left', u.username);
          // Review: a sheet that is open (it lies under the snack) closes first, so that the popup, which waits while a dialog is open, can follow on Settings
          toast(u.username + ' wants access', { ms: 8000, action: 'Review', onAction: function () {
            try { if (sheetOpen) closeSheet(); if (window.NX && window.NX.closeActivity) window.NX.closeActivity(); if (window.__nxLogHide) window.__nxLogHide(); } catch (e) {}
            window.location.hash = '#/tabs/settings/false';
          } });
        }
        return;
      }
      delete deferred[key];
      showPending();
      if (manual && sheetOpen) closeSheet();      // asked for from the status sheet ("New users"): the popup opens over the page, not over the sheet
      prompted[key] = true;
      popupOpen = true;
      log('new user: asking whether to allow', u.username);
      $timeout(function () {
        // (I-20) the name of the accessory as every other screen says it (the description, "AABBCC", not NiceIT4WIFIAABBCC), and who asks: the user and the phone
        var label = device.description || device.name || device.mac;
        var phone = u.description && u.description !== u.username ? ' (' + esc(String(u.description).slice(0, 40)) + ')' : '';
        var pop = $ionicPopup.confirm({
          title: 'Allow access?',
          cssClass: 'nx-popup',
          template: '<b>' + esc(String(u.username).slice(0, 60)) + '</b>' + phone + ' wants to open and close “' + esc(label) + '”. Only allow people you know.',
          cancelText: 'Not now',
          okText: 'Allow'
        });
        pop.then(function (ok) {
          popupOpen = false;
          if (!ok) { log('new user: later', u.username); delete prompted[key]; snooze(key); flushDeferred(); return; }
          // the accessory can take a while (or not answer at all): say that something is happening
          log('new user: allowing', u.username);
          toast('Allowing “' + u.username + '”…');
          var slow = setTimeout(function () { toast('Still waiting for the accessory…'); }, 15000);
          NHK.userApproved(device, u.id, u.username).then(function () {
            clearTimeout(slow);
            log('new user: allowed', u.username);
            toast('“' + u.username + '” can now open and close the gate.');
            flushDeferred();
          }, function (err) {
            clearTimeout(slow);
            log('new user: could not allow', u.username, JSON.stringify(err));
            toast(notAllowed(u.username, err));
            delete prompted[key];
          });
        });
      }, 0);
    }
    // ---- nx23 dialogs: end (the pairing popup) ---------------------------------------------------------------------------------
    try { NxA11y.onClosed = function () { flushDeferred(); }; } catch (e) {}      // the person closed the last dialog: a request that waited may open now
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
          w.forEach(function (u) { promptUser(d, u, !!manual); });
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
    // Visible: a chip under the title of every page (a real button, put in the header by ensureChips(); the CSS variables --nx-sub and
    // --nx-dot on <html> carry the same text and color for the style rules) and, after a tap on it, a bottom sheet (the status sheet)
    // with the verdict, the route, what to try and the measurements. The sheet opens only when the person asks for it (the chip,
    // Reconnect, NX.diagnose); a measurement that ends later never opens it. #nx-status is the invisible live region for screen
    // readers: the same text as the chip, a click on it opens the sheet.
    // ---- nx23 status: begin (the words: the chip, the verdicts, the buttons)
    // Everything that the chip and the sheet say is in this block. The verdicts are cause first, then one action (at most 25 words each),
    // without protocol terms: the measurements (TCP and TLS times, error names, routes) stay under "Technical details" and in the LOG.
    // the restart, with what it costs: while the accessory has no power the app cannot control the gate (not confirmed with the maintainer which cable is meant)
    var RESTART = 'disconnect its power for 30 seconds, then reconnect it (the app cannot control the gate meanwhile).';
    var VPN_EXCLUDE = 'Tailscale: App split tunneling > Excluded apps (the menu names differ per version).';
    var COPY = {
      // the chip: one verdict word and at most one tag
      chip: { online: 'Accessory online', unreachable: 'Not reachable', noWifi: 'No Wi-Fi', otherWifi: 'Other Wi-Fi', module: 'Accessory Wi-Fi',
        checking: 'Accessory: checking…', checkingShort: 'Checking…', connecting: 'Connecting…', unknown: 'Accessory', opens: 'Opens connection details' },
      tag: { cloud: 'cloud', noWifi: 'no Wi-Fi', vpn: 'VPN', otherWifi: 'other Wi-Fi', mobile: 'mobile data' },
      // the headline of the sheet (never contains the tag)
      title: { unreachable: 'Accessory not reachable', connecting: 'Connecting to the accessory…', checking: 'Checking…', reconnecting: 'Reconnecting…' },
      busy: { check: 'Measuring the connection…', reconnect: 'Rebuilding the connection to the accessory…' },
      stale: ['The status changed since this check.', 'Tap Reconnect to measure again.'],
      todo: 'What to try',
      buttons: { done: 'Done', doneAria: 'Done, close the status details', reconnect: 'Reconnect', reconnecting: 'Reconnecting…', requests: 'Check requests', log: 'Debug log', copy: 'Copy details' },
      nodes: { phone: 'Phone', accessory: 'Accessory', cloud: 'Nice cloud' },
      facts: { fine: 'Everything else is fine', direct: 'Direct connection', cloud: 'Nice cloud', app: 'App connection' },
      // the verdicts: [cause, action, [what else to try]]. {home} and {here} stand for the Wi-Fi of the accessory and the Wi-Fi of the phone.
      // conclude() takes the first that matches, in this order: what the phone can fix in seconds (Wi-Fi, VPN), then what to check at the accessory,
      // then the restart (last, with what it costs).
      v: {
        module: ['Your phone is on the accessory\'s own Wi-Fi, which is only used for setup.', 'Finish the setup wizard; your phone then returns to your home Wi-Fi by itself.',
          ['Not in the wizard? Choose your home Wi-Fi in Android\'s Wi-Fi settings.']],
        away: ['You are not on Wi-Fi, so the app reaches the accessory through the Nice cloud.', '', []],
        cloudHung: ['Connected through the Nice cloud, but the accessory has stopped answering on your home network.', 'Restart it when it suits you: ' + RESTART, []],
        cloudVpn: ['Connected through the Nice cloud; your VPN may be blocking the direct route to the accessory.', 'In your VPN app, exclude MyNice Welcome so the app can connect directly.',
          [VPN_EXCLUDE, 'Or turn the VPN off while you use the gate.']],
        cloudLocal: ['Connected through the Nice cloud, because the accessory does not answer on your home network.', 'Check its power and Wi-Fi light when it suits you.', []],
        cloudAny: ['Connected through the Nice cloud instead of directly.', '', []],
        fineNoWifi: ['The app still reports a connection, but your phone has no Wi-Fi.', 'Tap Reconnect to check again.', []],
        cloudNoSession: ['The Nice cloud is reachable, but the app has no session with the accessory.', 'Tap Reconnect.', []],
        noWifiCloudDown: ['You are not on Wi-Fi, and the Nice cloud cannot be reached from here.', 'Join your home Wi-Fi or get mobile signal, then tap Reconnect.', []],
        vpnOk: ['Connected to the accessory through your VPN.', '', []],
        vpnCloudNoSession: ['The Nice cloud is reachable, but the app has no session with the accessory.', 'Tap Reconnect and the app will use the cloud.', []],
        vpnProbeOk: ['The accessory answers through your VPN, but the app has no session with it.', 'Tap Reconnect.', []],
        vpnNothing: ['Neither the Nice cloud nor your VPN reaches the accessory.', 'Turn the VPN off briefly, then tap Reconnect.', ['If that works, exclude MyNice Welcome in your VPN app.', VPN_EXCLUDE]],
        vpnRouteNoAnswer: ['Your VPN routes the accessory\'s address, but the accessory does not answer.', 'Check that the VPN connection to your home works.',
          ['Tailscale: is the device at home that offers your home network switched on?']],
        vpnNoRoute: ['Your VPN does not include your home network.', 'Join your home Wi-Fi, or add your home network to the VPN.',
          ['Tailscale: a device at home has to offer your home network as a route.']],
        noWifi: ['You are not on Wi-Fi.', 'Join your home Wi-Fi, or use a VPN that includes your home network.', []],
        hung: ['The accessory is on your network but has stopped answering.', 'Restart it: ' + RESTART, []],
        vpnCapture: ['Your VPN is sending the traffic for the accessory into its tunnel.', 'In your VPN app, exclude MyNice Welcome, then tap Reconnect.',
          [VPN_EXCLUDE, 'Or turn the VPN off while you use the gate.']],
        vpnBothDown: ['Neither the accessory nor the Nice cloud can be reached while your VPN is on.', 'Turn the VPN off briefly, then tap Reconnect.',
          ['If that works, exclude MyNice Welcome in your VPN app.', VPN_EXCLUDE]],
        isolated: ['This Wi-Fi does not let your phone reach the accessory (guest network or device isolation).', 'Join {home}, then tap Reconnect.', []],
        noAnswerOther: ['Your phone is on {here}, not {home}, and the accessory does not answer here.', 'Switch to {home}, then tap Reconnect.',
          ['Already on your home network? Check the accessory\'s power and Wi-Fi light.', 'Still nothing? Restart it: ' + RESTART]],
        noAnswerSame: ['The accessory does not answer on your Wi-Fi.', 'Check that it has power and that its Wi-Fi light is on.',
          ['In your router: has the accessory\'s IP address changed?', 'Still nothing? Restart it: ' + RESTART]],
        noSession: ['The accessory answers, but the app has no session with it.', 'Tap Reconnect.', []],
        slow: ['Connected, but the link to the accessory is slow.', 'Check the Wi-Fi signal near the gate.', []],
        otherWifiOk: ['Connected. You are on {here} instead of {home}, which is fine on the same router.', '', []],
        fine: ['Connected to the accessory over your Wi-Fi.', '', []]
      },
      cloudWorks: 'The Nice cloud works: tap Reconnect to use it.',
      // the options that the short verdicts leave out, for Technical details
      vpnOptions: 'If a VPN is in the way: exclude MyNice Welcome in the VPN app (Tailscale: "App split tunneling" > Excluded apps); or turn off the use of subnet routes ' +
        '(Tailscale: "Use Tailscale subnets") or of an exit node; or turn the VPN off while you operate the accessory. The menu names differ per version.'
    };
    // ---- nx23 status: end
    var DOTS = { ok: 'var(--nx-ok)', warn: 'var(--nx-warn)', bad: 'var(--md-sys-color-error)', info: 'var(--md-sys-color-primary)', connecting: 'var(--md-sys-color-primary)', unknown: 'var(--md-sys-color-outline)' };
    var pill = null, panel = null, panelText = null, btnReconnect = null, btnUsers = null;
    var scrim = null, elHeadline = null, elExplanation = null, elRoute = null, elTodo = null, elFacts = null;
    var sheetOpen = false, sheetData = null, busyDiag = false;
    // nx23 status: busyKind says what the sheet is busy with ('check' or 'reconnect'); diagRun numbers the runs (the newest one counts, an older one
    // that ends later stores nothing and changes nothing); carryLines are lines for Technical details of the run that starts next
    var busyKind = '', diagRun = 0, carryLines = [], lastAuto = 0;

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
    // Is the phone on a different Wi-Fi than the one the accessory was set up on? On a router with several networks
    // (HomeWifi-5G and HomeWifi) that is the same home network and the app works just as well there; so this is only a hint.
    function otherSsid(net, homeSsid) { return !!(homeSsid && net && net.ssid && net.ssid !== homeSsid); }
    // ---- nx23 status: begin (the chip says at most one tag; the verdict word is never cut)
    // At most one tag for the status chip, the most important first: no Wi-Fi, a VPN, another Wi-Fi, mobile data (the rest is in the sheet)
    function tagFor(net, homeSsid) {
      if (net && !net.wifi && !net.module) return COPY.tag.noWifi;
      if (net && net.vpn) return COPY.tag.vpn;
      if (otherSsid(net, homeSsid)) return COPY.tag.otherWifi;
      if (net && net.cellular) return COPY.tag.mobile;
      return '';
    }
    // What computeStatus() hands to its callback: { level, kind, side, word, tag, text, title, net }. word and tag are what the chip shows (text is both,
    // the plain string of the live region), title is the headline of the sheet (it never contains the tag), side says whose problem a red level is
    // ('phone' when there is neither Wi-Fi nor a VPN, else 'accessory'), kind is 'unreachable' for what the automatic recovery may handle.
    function mkStatus(level, kind, word, tag, title, net, unsure) {
      var st = { level: level, side: (net && !net.module && !net.wifi && !net.vpn) ? 'phone' : 'accessory', word: word, tag: tag || '',
        text: word + (tag ? ' · ' + tag : ''), title: title || word, net: net };
      if (kind) st.kind = kind;
      if (unsure) st.unsure = true;
      // the chip has little room in a header with buttons on both sides: while it checks it shows the short word (the list label says the same), the
      // live region and the name of the button keep the longer phrase
      if (word === COPY.chip.checking) st.show = COPY.chip.checkingShort;
      return st;
    }
    // How sure is the state of the gate on the accessory screen? The freshness comes from the command workstream (window.__nxTrust: '' | 'live' | 'checking' |
    // 'aging' | 'stale'); without it, or on any other screen, there is nothing to add.
    function screenTrust(devs) {
      try {
        if (typeof window.__nxTrust !== 'function') return '';
        var m = /device-detail\/([^\/]*)\/([^\/?#]+)/.exec(String(window.location.hash || ''));
        if (!m) return '';
        var mac = decodeURIComponent(m[2]), x = null;
        for (var i = 0; i < devs.length; i++) if (devs[i].device.mac === mac) x = devs[i];
        x = x || devs[0];
        return String(window.__nxTrust(liveDevice(x.home.homeId, x.device.mac) || x.device) || '');
      } catch (e) { return ''; }
    }
    // ---- nx23 status: end
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
        // nx23: online, unless the state on the accessory screen is not confirmed yet: then it is still being checked
        function online() {
          if (screenTrust(devs) === 'checking') return mkStatus('unknown', '', COPY.chip.checking, '', COPY.chip.checking, net, true);
          return mkStatus('ok', '', COPY.chip.online, viaCloud ? COPY.tag.cloud : '', COPY.chip.online, net);
        }
        function unreachable() { return mkStatus('bad', 'unreachable', COPY.chip.unreachable, tagFor(net, homeSsid), COPY.title.unreachable, net); }
        if (net.module) return cb(mkStatus('info', '', COPY.chip.module, '', COPY.chip.module, net));
        // no verdict, neither good nor bad, as long as a result is missing: without Wi-Fi the Nice cloud may still work
        if (anyChecking && !anyBad && !anyRetry) return cb(mkStatus('unknown', '', COPY.chip.checking, '', COPY.chip.checking, net));
        // a new attempt to connect is running: that is what the chip says, not the verdict of the attempt before it
        if (anyRetry && !allOk) return cb(mkStatus('connecting', '', COPY.chip.connecting, '', COPY.title.connecting, net));
        // Without Wi-Fi and without a VPN an accessory in the home network can only be reachable via the Nice cloud. An old
        // "reachable" flag then only counts if the app really chose the cloud for its last connection.
        if (!net.wifi && !net.vpn) {
          if (allOk && viaCloud) return cb(online());
          if (anyBad) return cb(unreachable());
          return cb(mkStatus('bad', '', COPY.chip.noWifi, '', COPY.chip.noWifi, net));
        }
        if (allOk) return cb(online());
        if (anyBad) return cb(unreachable());
        if (!net.wifi) return cb(mkStatus('bad', '', COPY.chip.noWifi, '', COPY.chip.noWifi, net));
        if (otherSsid(net, homeSsid)) return cb(mkStatus('warn', '', COPY.chip.otherWifi, '', COPY.chip.otherWifi, net));
        cb(mkStatus('unknown', '', COPY.chip.checking, '', COPY.chip.checking, net));
      }, function () { cb(mkStatus('unknown', '', COPY.chip.unknown, '', COPY.chip.unknown, null)); });
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
          reconnectQuiet();
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
    // ---- nx23 status: begin (the chip is a real button in the header)
    // Ionic builds the header bars itself and rewrites the title (innerHTML) on every change of view, so the button cannot sit in a template: it is put
    // in as the LAST child of every header title (the pill itself is drawn by the style rules; the hit area is 48 dp) and put back when the title is
    // rewritten. It is written only when something differs, so the observer below ends after one round.
    var chipFrame = 0, chipObserver = null, trustTimer = 0, trustTries = 0;
    function makeChip() {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'nx-chip';
      b.setAttribute('aria-haspopup', 'dialog');
      b.innerHTML = '<span class="nx-chip-text"></span><span class="nx-chip-tag"></span>';
      return b;
    }
    // when less than a few letters of the tag fit next to the verdict (a header with buttons on both sides, large text) the tag goes altogether, with its dot:
    // the sheet has it. "A few" is four letters: 4.4 times the font size, so it follows the size of the text.
    function fitChip(c) {
      var tag = c.children[1], fs = 13;
      try { fs = parseFloat(window.getComputedStyle(c).fontSize) || 13; } catch (e) {}
      c.classList.remove('nx-chip-notag');
      if (tag.textContent && tag.scrollWidth > tag.clientWidth + 1 && tag.clientWidth < fs * 4.4) c.classList.add('nx-chip-notag');
    }
    function ensureChips() {
      try {
        var st = lastStatus, show = !!(st && st.level && st.level !== 'none');
        var titles = document.querySelectorAll('.bar-header .title');
        for (var i = 0; i < titles.length; i++) {
          var t = titles[i], c = null;
          for (var k = 0; k < t.children.length; k++) if (t.children[k].classList.contains('nx-chip')) c = t.children[k];
          if (!c) c = makeChip();
          if (t.lastElementChild !== c) t.appendChild(c);
          var sig = show ? (st.show || st.word) + '|' + st.tag + '|' + st.text : '';
          var changed = c.__nxSig !== sig;
          if (changed) {
            c.__nxSig = sig;
            c.hidden = !show;
            c.children[0].textContent = show ? (st.show || st.word) : '';
            c.children[1].textContent = show ? st.tag : '';
            // the name contains the visible text (WCAG 2.5.3), then what a tap does
            if (show) c.setAttribute('aria-label', st.text + '. ' + COPY.chip.opens); else c.removeAttribute('aria-label');
          }
          // the buttons on the right of the header (the eye, Next) lie over the end of the title box: the chip stops before them
          var br = t.parentNode && t.parentNode.querySelector ? t.parentNode.querySelector('.buttons-right') : null;
          var w = br ? Math.round(br.getBoundingClientRect().width) : 0, res = w ? (w + 8) + 'px' : '';
          if (c.__nxRes !== res) {
            c.__nxRes = res;
            changed = true;
            if (res) c.style.setProperty('--nx-chip-reserve', res); else c.style.removeProperty('--nx-chip-reserve');
          }
          if (show && (changed || c.__nxW !== t.clientWidth)) { c.__nxW = t.clientWidth; fitChip(c); }
        }
      } catch (e) { log('chip', String(e)); }
    }
    function watchChips() {
      try {
        if (chipObserver || !window.MutationObserver || !document.body) return;
        var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
        // only a change in a header counts (a list that fills, a snackbar and the like do not); what the chip itself writes does not count either
        var HEADER = '.bar-header, .nav-bar-block, ion-nav-bar';
        function inHeader(n) {
          if (!n || n.nodeType !== 1) return false;
          if (n.closest && n.closest('.nx-chip')) return false;
          return !!(n.closest && n.closest(HEADER)) || !!(n.matches && n.matches(HEADER)) || !!(n.querySelector && n.querySelector('.bar-header'));
        }
        chipObserver = new window.MutationObserver(function (records) {
          if (chipFrame) return;
          var relevant = false;
          for (var i = 0; i < records.length && !relevant; i++) {
            var r = records[i];
            if (inHeader(r.target)) { relevant = true; break; }
            for (var j = 0; j < r.addedNodes.length; j++) if (inHeader(r.addedNodes[j])) { relevant = true; break; }
          }
          if (!relevant) return;
          chipFrame = raf(function () { chipFrame = 0; ensureChips(); });
        });
        chipObserver.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('resize', function () { ensureChips(); });
        window.addEventListener('orientationchange', function () { setTimeout(ensureChips, 300); });
      } catch (e) { log('chip observer', String(e)); }
    }
    // ---- nx23 status: end
    function refreshPill() {
      if (!pill) return;
      computeStatus(function (st) {
        lastStatus = st;
        // nx23: the first status after a measurement is the one that the sheet's verdict is compared with (see renderSheet)
        if (sheetData && sheetData.level == null && !busyDiag && st.level !== 'none') sheetData.level = st.level;
        if (st.level === 'none') {
          pill.style.display = 'none';
          setHeaderStatus(null);
          ensureChips();
          if (sheetOpen) closeSheet();
          return;
        }
        pill.style.display = 'block';
        if (pill.textContent !== st.text) pill.textContent = st.text;     // a live region: it announces only what changed
        pill.setAttribute('data-level', st.level);
        setHeaderStatus(st);
        ensureChips();
        if (sheetOpen) renderSheet();
        digestSoon();
        autoHeal(st);
        // nx23: while the state on the accessory screen is being confirmed the chip asks again, so that it does not stay on "checking" until the next round
        if (st.unsure && trustTries < 40) {
          trustTries++;
          clearTimeout(trustTimer);
          trustTimer = setTimeout(refreshPill, 1500);
        } else if (!st.unsure) { trustTries = 0; }
      });
    }
    // ---- nx23 status: begin (the verdict: cause first, then one action; what else to try; no protocol terms)
    // The verdict that the sheet shows: { id, cause, action, more }. cause is one sentence, action one sentence (may be empty when there is nothing to do),
    // more is what else to try (at most three short items, the restart last). The table is COPY.v; this function only decides which row applies.
    function verdict(id, homeSsid, net, extraFirst) {
      var row = COPY.v[id];
      function fill(t) {
        return String(t).replace(/\{home\}/g, homeSsid ? '"' + homeSsid + '"' : 'your home Wi-Fi').replace(/\{here\}/g, (net && net.ssid) ? '"' + net.ssid + '"' : 'this Wi-Fi');
      }
      var more = (extraFirst || []).concat(row[2]).map(fill).slice(0, 3);
      return { id: id, cause: fill(row[0]), action: fill(row[1]), more: more };
    }
    // the same as one flat text, for Technical details and for copying: nothing that the short verdict leaves out is lost
    function flatVerdict(v) {
      return v.cause + (v.action ? ' ' + v.action : '') + (v.more.length ? '\nWhat to try: ' + v.more.join(' ') : '');
    }
    // the native layer says explicitly that the VPN has no route to the accessory's address (then the VPN is not the cause of anything)
    function noVpnRoute(net) { return !!net && 'vpnRoute' in net && !net.vpnRoute; }
    function conclude(net, probe, reachable, homeSsid, cloud) {
      if (net.module) return verdict('module', homeSsid, net);
      var disrupted = !reachable || (probe && !probe.ok);
      var viaCloud = net.route === 'cloud';
      var cloudOk = !!(cloud && cloud.ok);
      // TCP to the accessory got through, the secure handshake (TLS) did not: the accessory itself has stopped answering. The network is then fine and
      // a VPN has nothing to do with it. (What the person reads: "has stopped answering", an observation; "has hung" would be an inference.)
      var hung = !!(net.wifi && probe && !probe.ok && probe.tcpMs != null);
      var cloudHint = (cloudOk && !reachable) ? [COPY.cloudWorks] : [];
      // The app is connected and chose the Nice cloud (away from home, or at home because the local route did not work).
      if (reachable && viaCloud) {
        if (!net.wifi) return verdict('away', homeSsid, net);       // away from home the direct route cannot work, with or without a VPN
        if (hung) return verdict('cloudHung', homeSsid, net);
        if (net.vpn && !noVpnRoute(net)) return verdict('cloudVpn', homeSsid, net);
        return verdict(probe && !probe.ok ? 'cloudLocal' : 'cloudAny', homeSsid, net);
      }
      if (!net.wifi) {
        if (!net.vpn) {
          // away from home the Nice cloud is the only route to the accessory
          if (reachable) return verdict('fineNoWifi', homeSsid, net);
          return verdict(cloudOk ? 'cloudNoSession' : 'noWifiCloudDown', homeSsid, net);
        }
        // no Wi-Fi but a VPN
        if (reachable) return verdict('vpnOk', homeSsid, net);
        if (cloudOk) return verdict('vpnCloudNoSession', homeSsid, net);
        if (probe && probe.ok) return verdict('vpnProbeOk', homeSsid, net);
        if (cloud && !cloud.ok) return verdict('vpnNothing', homeSsid, net);
        if (net.vpnRoute) return verdict('vpnRouteNoAnswer', homeSsid, net);
        if ('vpnRoute' in net) return verdict('vpnNoRoute', homeSsid, net);
        return verdict('noWifi', homeSsid, net);
      }
      if (hung) return verdict('hung', homeSsid, net, cloudHint);
      if (net.vpn && net.vpnRoute && disrupted) return verdict('vpnCapture', homeSsid, net, cloudHint);
      if (net.vpn && disrupted && cloud && !cloud.ok && !(probe && probe.ok)) return verdict('vpnBothDown', homeSsid, net);
      if (probe && !probe.ok) {
        // directly over Wi-Fi nothing answers but via Android's default route it does: this Wi-Fi keeps the phone from the accessory
        if (probe.std && probe.std.ok) return verdict('isolated', homeSsid, net);
        return verdict(otherSsid(net, homeSsid) ? 'noAnswerOther' : 'noAnswerSame', homeSsid, net, cloudHint);
      }
      var slow = probe && (probe.tcpMs > 1500 || (probe.tlsMs != null && probe.tlsMs > 6000));
      if (!reachable) return verdict('noSession', homeSsid, net);
      if (slow) return verdict('slow', homeSsid, net);
      // if it works, a different Wi-Fi name is no cause for concern; say so once
      if (otherSsid(net, homeSsid)) return verdict('otherWifiOk', homeSsid, net);
      return verdict('fine', homeSsid, net);
    }
    // ---- nx23 status: end
    function setBusy(b) {
      busyDiag = !!b;
      if (!busyDiag) busyKind = '';
      if (btnReconnect) btnReconnect.disabled = b;
      if (btnUsers) btnUsers.disabled = b;
      if (sheetOpen) renderSheet();
      digestSoon();
      refreshPill();      // an attempt (the diagnosis, the reconnect) is running or over: "Connecting…" or the result
    }
    // the text for copying and sharing (under "Technical details"). nx23: it never opens the sheet: a measurement that ends after the person has
    // dismissed the sheet must not bring it back over Open, Stop and Close (the sheet opens from the chip, Reconnect and NX.diagnose only)
    function showText(lines) {
      if (!panel) return;
      panelText.textContent = lines.join('\n');
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
    // nx23 status: every run takes a number (diagRun); only the newest run may store its result or change the busy state, so a run that ends after the sheet
    // was dismissed and opened again cannot overwrite the new one. A run that ends after a dismissal still stores its result and refreshes the chip.
    function diagnose(opts) {
      var run = ++diagRun;
      function live() { return run === diagRun; }
      sheetData = null;
      busyKind = (opts && opts.keepKind && busyKind === 'reconnect') ? 'reconnect' : 'check';
      setBusy(true);
      showText(['Checking…']);
      // a native call that never answers must not leave the sheet on "Checking…" with Reconnect dimmed for ever
      setTimeout(function () {
        if (!live() || !busyDiag) return;
        sheetData = { net: (lastStatus && lastStatus.net) || null, probe: null, cloud: null, reachable: false, unmeasured: true, homeSsid: '',
          verdict: { id: 'timeout', cause: 'The check did not finish.', action: 'Tap Reconnect to try again.', more: [] } };
        sheetData.conclusion = flatVerdict(sheetData.verdict);
        showText([panelText.textContent, '', sheetData.conclusion]);
        setBusy(false);
      }, 30000);
      pushHints();
      var devs0 = allDevices();
      nx('netState', [(devs0[0] && devs0[0].device.address) || ''], function (net) {
        if (!live()) return;
        var lines = carryLines.splice(0).concat([describeNet(net)]);
        var devs = allDevices();
        if (!devs.length) { lines.push('No accessory in the app.'); showDiagnosis(lines); setBusy(false); return; }
        var d = devs[0].device, homeSsid = devs[0].home.networkSsid || '';
        function conclusion(n, probe, reachable, cloud) {
          var v = conclude(n, probe, reachable, homeSsid, cloud);
          sheetData = { net: n, probe: probe, cloud: cloud, reachable: reachable, verdict: v, conclusion: flatVerdict(v), homeSsid: homeSsid };
          lines.push('');
          lines.push(sheetData.conclusion);
          if (n.vpn && !noVpnRoute(n)) { lines.push(''); lines.push(COPY.vpnOptions); }
        }
        function finish(probe, cloud) {
          verifyAll(function () {
            if (!live()) return;
            var fresh = allDevices()[0];
            var reachable = !!(fresh && fresh.device.reachable);
            lines.push('App connection to the accessory: ' + (reachable ? 'ok' : 'failed'));
            // only the native layer knows which route the app chose in that check (local or cloud); read it again
            nx('netState', [d.address || ''], function (net2) {
              if (!live()) return;
              var n2 = net2 || net;
              if (n2.route && n2.route !== net.route) {
                lines.push('The app connected to the accessory via ' + (n2.route === 'cloud' ? 'the Nice cloud' : 'a local connection'));
              }
              conclusion(n2, probe, reachable, cloud);
              lines.push('');
              lines.push('Android API ' + (n2.sdk || '?') + ' · native layer ' + (n2.version || '?'));
              showDiagnosis(lines);
              setBusy(false);
              refreshPill();
            }, function () {
              if (!live()) return;
              conclusion(net, probe, reachable, cloud);
              showDiagnosis(lines);
              setBusy(false);
              refreshPill();
            });
          });
        }
        if (net.module) { return finish(null, null); }
        // Always measure: even without Wi-Fi (or without an address) the route to the Nice cloud can still be tested.
        nx('probe', [d.address || '', 443, 6000, true, true], function (p) {
          if (!live()) return;
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
        }, function (err) { if (!live()) return; lines.push('Measurement failed: ' + err); finish(null, null); });
      }, function (err) { if (!live()) return; showText(['Cannot read network status: ' + err]); setBusy(false); });
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
    // nx23: the old verdict goes at once (it described the state before the reconnect), the sheet says "Reconnecting…" until the new measurement is in
    function reconnect() {
      var run = ++diagRun;
      sheetData = null;
      busyKind = 'reconnect';
      setBusy(true);
      showText(['Reconnecting…']);
      nx('reconnect', [], function () {
        if (run !== diagRun) return;
        pushHints();
        setTimeout(function () { if (run === diagRun) diagnose({ keepKind: true }); }, 1500);
      }, function (err) {
        if (run !== diagRun) return;
        // measure anyway: the real picture is better than an empty sheet
        carryLines.push('Reconnecting failed: ' + err);
        diagnose({ keepKind: true });
      });
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
      return { t: 'No network', s: 'no Wi-Fi and no mobile data', i: 'wifi-off' };
    }
    function linkState(ok) { return ok === true ? 'ok' : ok === false ? 'fail' : 'unknown'; }
    // ---- nx23 status: begin (the route and the facts never contradict the verdict)
    // does the phone have any way to get anywhere? (the phone node is red only when it has none)
    function phoneState(net) { return !net ? 'unknown' : (net.module || net.wifi || net.cellular || net.vpn) ? 'ok' : 'fail'; }
    // the route of the diagram has three nodes (phone, Nice cloud, accessory) when the app goes through the cloud
    function isCloudRoute(net) { return !!net && !net.module && (net.route === 'cloud' || (!net.wifi && !net.vpn)); }
    // phone - (cloud) - accessory, each link styled by the outcome of its measurement. A measurement never overrules a session that works: when the app is
    // connected, the links that it runs over are green, whatever a probe of the other route said.
    function routeHtml(net, d) {
      if (!net) return '';
      var three = isCloudRoute(net);
      var probe = d && d.probe, cloud = d && d.cloud;
      var reachable = d ? !!d.reachable
        : (lastStatus && lastStatus.level === 'ok' ? true : (lastStatus && lastStatus.level === 'bad' ? false : null));
      var proven = d ? !!d.reachable : !!(lastStatus && lastStatus.level === 'ok');
      var address = (allDevices()[0] && allDevices()[0].device.address) || '';
      var nt = netTitle(net);
      var carrier = (net.module ? 'accessory Wi-Fi' : net.wifi ? 'Wi-Fi' : net.cellular ? 'mobile' : 'network') + (net.vpn ? ' + VPN' : '');
      function node(i, t, sub, st) {
        return '<div class="nx-node"><span class="nx-nodeicon nx-i-' + i + ' nx-s-' + st + '"></span><b>' + esc(t) + '</b><small>' + esc(sub) + '</small></div>';
      }
      function routeLink(label, st) {
        return '<div class="nx-link nx-s-' + st + '">' + (label ? '<small>' + esc(label) + '</small>' : '') + '<i></i></div>';
      }
      var phoneNode = node('phone', COPY.nodes.phone, nt.t + (three && net.vpn ? ' + VPN' : ''), phoneState(net));
      if (three) {
        var cOk = proven ? true : (cloud ? !!cloud.ok : null);
        // three nodes leave 56 dp for a link at 360 dp: the first link says only how fast, the carrier is in the caption of the phone
        return phoneNode + routeLink(cloud && cloud.ok ? ms(cloud.tcpMs) : '', linkState(cOk)) + node('cloud', COPY.nodes.cloud, '', linkState(cOk)) +
          routeLink('', linkState(reachable)) + node('gate', COPY.nodes.accessory, '', linkState(reachable));
      }
      var lOk = proven ? true : (probe ? !!probe.ok : reachable);
      return phoneNode + routeLink(carrier + (probe && probe.ok ? ' · ' + ms(probe.tcpMs) : ''), linkState(lOk)) + node('gate', COPY.nodes.accessory, address, linkState(reachable));
    }
    // the facts as list rows: what network the phone has, which route the app chose and what the measurements gave. A healthy sheet lists only what needs
    // a word (a VPN, the cloud route, anything that failed or is not known) and one line for the rest; a row that failed or is uncertain is never folded in.
    function factsHtml(net, d, level) {
      var rows = [], quiet = 0;
      var fold = !!d && !d.unmeasured && /^(ok|info)$/.test(level);
      function addRow(icon, title, sub, st, badge, routine) {
        if (fold && routine) { quiet++; return; }
        rows.push('<li class="nx-fact' + (st ? ' nx-s-' + st : '') + '"><span class="nx-fi nx-i-' + icon + '"></span><div><b>' + esc(title) + '</b>' +
          (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + (badge ? '<em>' + esc(badge) + '</em>' : '') + '</li>');
      }
      var cloudRoute = isCloudRoute(net);
      if (net) {
        var nt = netTitle(net);
        var attached = !!(net.wifi || net.module);
        addRow(nt.i, nt.t, nt.s || (net.cellular && net.wifi ? 'mobile data is also on' : ''), attached ? 'ok' : (net.cellular ? '' : 'fail'), null, attached || !!net.cellular);
        if (net.vpn) {
          addRow('vpn', 'VPN on', ('vpnRoute' in net) ? (net.vpnRoute ? 'route to the accessory: ' + net.vpnRoute : 'does not affect the accessory\'s address') : '', 'warn', null, false);
        }
        if (net.route) {
          var extra = [];
          if (net.routeAgeSeconds != null) extra.push('chosen ' + net.routeAgeSeconds + ' s ago');
          if (net.cloudPreference) extra.push('the cloud has priority for another ' + net.cloudPreference + ' s');
          addRow('route', net.route === 'cloud' ? 'Via the Nice cloud' : 'Local connection', extra.join(' · '), '', null, true);
        }
      }
      if (d && d.probe) {
        var p = d.probe;
        if (cloudRoute && d.reachable) {
          // away from home the direct connection cannot work, and it is not needed: neutral, with its reason, no badge
          addRow('gate', COPY.facts.direct, 'not available from here, the app uses the Nice cloud', '', null, false);
        } else if (p.ok) {
          addRow('gate', COPY.facts.direct, 'the accessory answers on your network', 'ok', 'ok', true);
        } else {
          addRow('gate', COPY.facts.direct, p.tcpMs != null ? 'reached, but it does not answer' : 'no answer', 'fail', 'failed', false);
        }
      }
      if (d && d.cloud) {
        var c = d.cloud;
        if (c.ok) addRow('cloud', COPY.facts.cloud, 'reachable', 'ok', 'ok', true);
        else if (d.reachable) addRow('cloud', COPY.facts.cloud, 'not reachable, not needed while the app is connected', '', null, true);
        else addRow('cloud', COPY.facts.cloud, 'not reachable', 'fail', 'failed', false);
      }
      if (d && !d.unmeasured) {
        addRow(d.reachable ? 'check' : 'warn', COPY.facts.app, d.reachable ? 'the app has a session with the accessory' : 'the app did not get a session with the accessory',
          d.reachable ? 'ok' : 'fail', d.reachable ? 'ok' : 'failed', !!d.reachable);
      }
      if (quiet) {
        rows.push('<li class="nx-fact nx-s-ok nx-fact-sum"><span class="nx-fi nx-i-check"></span><div><b>' + esc(COPY.facts.fine) + '</b><span>' + quiet + (quiet === 1 ? ' check' : ' checks') +
          ', nothing to fix</span></div></li>');
      }
      return rows.join('');
    }
    // a verdict that no longer matches the chip (the state changed since the measurement) is measured again, once, at most every 30 s
    function remeasure() {
      var now = Date.now();
      if (!sheetOpen || busyDiag || now - lastAuto < 30000) return false;
      lastAuto = now;
      setTimeout(function () { if (sheetOpen && !busyDiag) diagnose(); }, 0);
      return true;
    }
    // update the sheet with what is known now: the shape and color of the header follow the state. This is the only place that reads the sheet's inputs:
    // the status (lastStatus), the measurement (sheetData) and what the sheet is busy with (busyDiag, busyKind).
    function renderSheet() {
      if (!panel) return;
      var st = lastStatus || mkStatus('unknown', '', COPY.chip.unknown, '', COPY.chip.unknown, null);
      var net = (sheetData && sheetData.net) || st.net || null;
      var settled = /^(ok|warn|bad|info)$/;
      var stateLevel = busyDiag ? 'busy' : (settled.test(st.level) ? st.level : 'unknown');
      ['ok', 'warn', 'bad', 'info', 'unknown', 'busy'].forEach(function (k) { panel.classList.remove('nx-l-' + k); });
      panel.classList.remove('nx-via-cloud');
      panel.classList.remove('nx-via-local');
      panel.classList.remove('nx-k-phone');
      panel.classList.remove('nx-k-accessory');
      panel.classList.add('nx-l-' + stateLevel);
      panel.classList.add('nx-via-' + (net && net.route === 'cloud' ? 'cloud' : 'local'));
      panel.classList.add('nx-k-' + (st.side === 'phone' ? 'phone' : 'accessory'));
      var reconnecting = busyDiag && busyKind === 'reconnect';
      if (busyDiag) panel.classList.add('nx-busy'); else panel.classList.remove('nx-busy');
      if (reconnecting) panel.classList.add('nx-busy-reconnect'); else panel.classList.remove('nx-busy-reconnect');
      var v = sheetData && sheetData.verdict;
      var stale = !!(v && !busyDiag && sheetData.level && settled.test(sheetData.level) && settled.test(st.level) && sheetData.level !== st.level);
      var again = stale && remeasure();
      elHeadline.textContent = busyDiag ? (reconnecting ? COPY.title.reconnecting : COPY.title.checking) : st.title;
      var text = '';
      if (busyDiag) text = reconnecting ? COPY.busy.reconnect : COPY.busy.check;
      else if (stale) text = again ? COPY.busy.check : COPY.stale.join(' ');
      else if (v) text = v.cause + (v.action ? ' ' + v.action : '');
      elExplanation.textContent = text;
      var more = (!busyDiag && !stale && v) ? v.more : [];
      elTodo.innerHTML = more.length ? '<b>' + esc(COPY.todo) + '</b><ul>' + more.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '';
      elRoute.classList.toggle('nx-three', isCloudRoute(net));
      elRoute.innerHTML = routeHtml(net, sheetData);
      elFacts.innerHTML = (busyDiag && !sheetData) ? '' : factsHtml(net, sheetData, stateLevel);
      if (btnReconnect) {
        var label = reconnecting ? COPY.buttons.reconnecting : COPY.buttons.reconnect;
        if (btnReconnect.textContent !== label) btnReconnect.textContent = label;
        btnReconnect.classList.toggle('nx-spin', reconnecting);
        btnReconnect.setAttribute('aria-busy', reconnecting ? 'true' : 'false');
      }
    }
    // ---- nx23 status: end
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
      // nx23: opened by the person: the measurement of the last time is no longer what is asked for (diagnose() makes a new one at once)
      if (sheetOpen) { closeSheet(); } else { sheetData = null; openSheet(); diagnose(); }
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
      // nx23: a live region only (it reads the status aloud when it changes); the button is the chip in the header, which the keyboard and TalkBack reach
      pill.setAttribute('role', 'status');
      pill.setAttribute('aria-live', 'polite');
      pill.style.display = 'none';
      pill.addEventListener('click', toggleSheet);

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
        '<div class="nx-todo" id="nx-sheet-todo"></div>' +
        '<ul class="nx-facts" id="nx-sheet-facts"></ul>' +
        '<details class="nx-details"><summary>Technical details</summary><pre id="nx-sheet-text"></pre><div class="nx-details-act"></div></details>' +
        '<div class="nx-more"></div>' +
        '<div class="nx-footer"></div>';
      elHeadline = panel.querySelector('#nx-sheet-title');
      elExplanation = panel.querySelector('#nx-sheet-explanation');
      elRoute = panel.querySelector('#nx-sheet-route');
      elTodo = panel.querySelector('#nx-sheet-todo');
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
      // nx23: "Check requests" closes the sheet first, so that the popup (when somebody waits) is not opened behind it; "Copy details" sits under the details
      // that it copies; the one button of the row that is "Log" elsewhere in the app is called "Debug log"; "Close" is "Done" (Close means the gate)
      btnUsers = addButton('.nx-more', COPY.buttons.requests, function () { closeSheet(); checkWaitingUsers(true); });
      addButton('.nx-more', COPY.buttons.log, function () {
        closeSheet();
        try { if (window.__nxLogShow) window.__nxLogShow(); } catch (e) {}
      });
      addButton('.nx-details-act', COPY.buttons.copy, function () { copyText(panelText.textContent); });
      var btnDone = addButton('.nx-footer', COPY.buttons.done, closeSheet, 'nx-text nx-done');
      btnDone.setAttribute('aria-label', COPY.buttons.doneAria);
      btnReconnect = addButton('.nx-footer', COPY.buttons.reconnect, reconnect, 'nx-primary nx-reconnect');

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
      // a tap on the chip opens the sheet (nx23: only the chip; a tap on the title text does nothing, as the title is no button)
      document.addEventListener('click', function (e) {
        try {
          var t = e.target;
          if (sheetOpen || !t || !t.closest || !t.closest('.nx-chip')) return;
          if (!lastStatus || lastStatus.level === 'none') return;
          toggleSheet();
        } catch (x) {}
      }, true);
      // nx23: a popup of the app (a new user asks for access, an error) opens under the sheet, which would swallow its taps: the sheet gives way
      try {
        if (window.MutationObserver) {
          new window.MutationObserver(function () {
            if (sheetOpen && document.body.classList.contains('popup-open')) closeSheet();
          }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        }
      } catch (x) {}

      document.body.appendChild(scrim);
      document.body.appendChild(panel);
      document.body.appendChild(pill);
      renderSheet();
      watchChips();
      ensureChips();
      // the chip and the room that it leaves next to the buttons of the header are checked again after every change of view (the title is rewritten)
      try { $rootScope.$on('$stateChangeSuccess', function () { setTimeout(ensureChips, 120); setTimeout(ensureChips, 700); }); } catch (x) {}
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

    window.NX = { diagnose: function () { openSheet(); return diagnose(); }, reconnect: function () { openSheet(); return reconnect(); },
      checkWaitingUsers: checkWaitingUsers, refresh: refreshPill, open: openSheet, close: closeSheet,
      theme: function (mode) { if (mode) $rootScope.nxSetTheme(mode); return themeNow; },
      palette: function (id) { if (id) $rootScope.nxSetPalette(id); return paletteNow; },
      activity: function (device) {
        if (!activity) return;
        var d = device || (allDevices()[0] || {}).device;
        if (d) activity.open(liveDevice(d.homeId, d.mac) || d);
      } };

    // -------------------------------------------------------------- 9. command feedback and trust (nx23)
    // ---- nx23 command: begin
    // What the accessory screen says about a tap (sending, waiting, sent, not sent, no answer) and how far the state on the screen can be trusted
    // (checking, updated 12:03, last confirmed 12:03). It is a memory of what the app's own service calls did (kept in memory, never saved) and ONE
    // pure function of that memory and the clock, lineOf(device) -> { kind, text, act }, that the template asks for its status line. The wrappers
    // below only look along: the result of every call is passed on unchanged, nothing is asked of the accessory that the app would not ask, and
    // timers only ask for a digest at the moment something expires. The words follow what is KNOWN: "sent" when the call came back ("accepted" cannot
    // be proven from here), "not sent" only when it is known that nothing went out (no connection, a refusal, a tap that the app's own guard
    // ignored), and "No answer ... it may have arrived" for the rest.
    var led = {};                    // mac -> { stateAt, heardAt, askAt, askEnd, askFailAt, enteredAt, verifyFailAt, stopAt, reconnectAt, manualDoneAt, cmds: [] }
    var resumeAt = 0, detailMac = '', cmdSeq = 0, anySendAt = 0, connectFor = null;
    function knob(name, dflt) { var v = window[name]; return (typeof v === 'number' && v >= 0) ? v : dflt; }
    function freshMs() { return knob('__nxStateFreshMs', 30000); }      // a report of the state younger than this is live
    function staleMs() { return knob('__nxStateStaleMs', 75000); }      // older than this and nothing else heard from the accessory: stale
    function silentMs() { return knob('__nxSilentMs', 8000); }          // a command that should move the gate, and no report of the state this long after it
    function failKeepMs() { return knob('__nxFailKeepMs', 30000); }    // how long a failure stays on screen
    var SLOW_MS = 6000, PENDING_MS = 20000, WAIT_LONG_MS = 10000, CHECK_LONG_MS = 10000, DROP_KEEP_MS = 6000, ENTER_MS = 1500, RESUME_HOLD_MS = 8000,
      GUARD_MS = 600, TWICE_MS = 150;
    // I-09, THE ONE PLACE WHERE THIS PATCH GOES AROUND A GUARD OF THE APP, and only for Stop. The app ignores every tap that comes within 500 ms of its
    // previous command (a flag in DeviceDetailCtrl.runCommand) and says nothing: a Stop right after a wrong Open or Close is lost.
    //   'guard'   (default) the app's own path runs first, unchanged. Only when it did not call the service for a Stop (its guard swallowed the tap) is the
    //             same service call made here, in the same tick: NHKPluginService.executePrimaryCommand(device, automation, 'stop').
    //   'always'  Stop never goes through the app's runCommand: it does not wait for the app's check of an accessory that it calls "not usable" either
    //             (the app starts that check and sends nothing when it fails), and a refusal comes back as a failure that is shown.
    //   'off'     nothing is bypassed; a Stop that the app ignores is said to be not sent.
    // Never delayed, never an extra tap, never a confirmation. A second Stop within 150 ms of one is not sent again. Nothing else is ever bypassed.
    var STOP_BYPASS = (window.__nxStopBypass === 'always' || window.__nxStopBypass === 'off') ? window.__nxStopBypass : 'guard';
    // I-02: "Refresh" on a stale state repeats the request that the app makes whenever the screen is entered (one status request, started by a tap)
    var REFRESH_BUTTON = window.__nxRefreshButton !== false;

    function rec(mac) {
      var L = led[mac];
      if (!L) L = led[mac] = { stateAt: 0, heardAt: 0, askAt: 0, askEnd: 0, askFailAt: 0, enteredAt: 0, verifyFailAt: 0, stopAt: 0, reconnectAt: 0, manualDoneAt: 0, cmds: [] };
      return L;
    }
    function liveOf(device) { return (device && liveDevice(device.homeId, device.mac)) || device || {}; }
    function nowMs() { return Date.now(); }
    function later(ms) { setTimeout(digestSoon, ms + 40); }
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    function hhmm(t) { var d = new Date(t); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
    function hms(t) { return hhmm(t) + ':' + p2(new Date(t).getSeconds()); }
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
    function rawState(d) { var p = d && d.properties; return (p && p[0] && p[0].value != null) ? String(p[0].value) : ''; }
    function stateName(d) { var v = $rootScope.nxState ? $rootScope.nxState(d) : rawState(d); return v == null ? '' : String(v); }
    function stateLabel(st) {
      var key = 'DEVICE_STATE_' + st, name = '';
      try { name = inj.has('$translate') ? inj.get('$translate').instant(key) : ''; } catch (e) {}
      return (name && name !== key) ? name : cap(st);
    }
    // the name of a command in the sentence: English for the three of the pad, the app's own text for the secondary ones
    var CMD_NAMES = { open: 'Open', close: 'Close', stop: 'Stop', MDBk: 'Open and Block', MDBl: 'Close and Block', MDBm: 'Block', MDEw: 'Release', MDE5: 'Release and Open', MDFh: 'Release and Close' };
    function nameOf(code, primary) {
      code = String(code);
      if (primary && CMD_NAMES[code]) return CMD_NAMES[code];
      var key = 'DEVICE_COMMAND_' + code, name = '';
      try { name = inj.has('$translate') ? inj.get('$translate').instant(key) : ''; } catch (e) {}
      return (name && name !== key) ? name : (CMD_NAMES[code] || code);
    }
    // which commands move the gate (the same table as KINDS in nx-activity.js: a test keeps the two together)
    var MOVE_OPEN = { open: 1, MDAz: 1, MDA1: 1, MDA2: 1, MDA3: 1, MDBk: 1, MDE5: 1, MDE0: 1, MDE3: 1 };
    var MOVE_CLOSE = { close: 1, MDA0: 1, MDBl: 1, MDFh: 1, MDE1: 1, MDE4: 1 };
    var MOVE_STEP = { MDAx: 1, MDBi: 1, MDBj: 1, MDEz: 1, MDE2: 1 };
    // will the gate report anything? Not when it is already where the command takes it (and not for a Block, a Release or the light)
    function expectsReport(c) {
      var b = c.before, k = c.code;
      if (MOVE_OPEN[k]) return b !== 'open' && b !== 'opening';
      if (MOVE_CLOSE[k]) return b !== 'closed' && b !== 'closing';
      if (k === 'stop' || k === 'MDAy') return b === 'opening' || b === 'closing';
      return !!MOVE_STEP[k];
    }
    function routeNow() { return (lastStatus && lastStatus.net && lastStatus.net.route === 'cloud') ? 'cloud' : ''; }
    function onSettle(p, ok, fail) { if (p && typeof p.then === 'function') p.then(ok, fail || function () {}); }       // (always a handler for a failure: a look-along must not leave a rejection unhandled)

    // ---- the ledger: what the wrappers see
    function heard(mac) { if (mac) rec(mac).heardAt = nowMs(); }
    function stateReport(mac) {
      if (!mac) return;
      var L = rec(mac), t = nowMs();
      L.stateAt = L.heardAt = t;
      L.askFailAt = 0;
      later(freshMs()); later(staleMs());
      digestSoon(); refreshPill();
    }
    function newCmd(device, code, primary, fromTap) {
      var L = rec(device.mac), t = nowMs();
      var c = { id: ++cmdSeq, mac: device.mac, homeId: device.homeId, code: String(code), primary: !!primary, phase: fromTap ? 'tapped' : 'sending', tapAt: fromTap ? t : 0,
        sendAt: 0, sentAt: 0, failAt: 0, dropAt: 0, waitAt: 0, route: '', before: stateName(liveOf(device)), fail: '', why: '', err: null, done: false };
      if (fromTap) L.cmds.forEach(function (x) { if (x.phase === 'failed' || x.phase === 'dropped' || x.phase === 'sent') x.done = true; });   // a new tap replaces what was said about the last ones
      L.cmds.push(c);
      if (L.cmds.length > 8) L.cmds.splice(0, L.cmds.length - 8);
      return c;
    }
    // the app called the service (a tap of the pad, the page of other commands, a scene, a Stop sent from here): the oldest tap of this command that waits is it
    function cmdSending(device, code, primary) {
      var mac = device && device.mac;
      if (!mac) return null;
      var L = rec(mac), t = nowMs(), k = String(code), c = null, i, x;
      // the app calls the service inside the tap itself (the newest tap of this command that is still "tapped": a tap that waited for a check that never came back must not take it)...
      for (i = L.cmds.length - 1; i >= 0 && !c; i--) {
        x = L.cmds[i];
        if (!x.done && x.code === k && x.primary === !!primary && x.phase === 'tapped' && t - x.tapAt < 100) c = x;
      }
      // ... or later, when it checked an accessory that it called "not usable" first (the oldest tap that waits)
      for (i = 0; i < L.cmds.length && !c; i++) {
        x = L.cmds[i];
        if (!x.done && x.code === k && x.primary === !!primary && x.phase === 'waiting' && t - x.tapAt < 120000) c = x;
      }
      if (!c) c = newCmd(device, k, primary, false);
      c.phase = 'sending'; c.sendAt = t; c.route = routeNow();
      anySendAt = t;
      if (c.primary && k === 'stop') L.stopAt = t;
      later(SLOW_MS); later(PENDING_MS);
      digestSoon();
      log('command: ' + nameOf(k, primary) + ' goes to the accessory' + (c.tapAt ? ', ' + (t - c.tapAt) + ' ms after the tap' : ''));
      return c;
    }
    function cmdSent(c) {
      var L = rec(c.mac), t = nowMs();
      c.phase = 'sent'; c.sentAt = t; L.heardAt = t;
      later(silentMs()); later(silentMs() + failKeepMs());
      log('command: ' + nameOf(c.code, c.primary) + ' sent, the call came back after ' + (t - c.sendAt) + ' ms' + (c.route === 'cloud' ? ' (via cloud)' : ''));
      announce(c); digestSoon();
    }
    // what a failure means: the call never went out ('notsent'), the accessory refused ('refused'), or nobody knows whether it arrived ('unknown')
    var REFUSED = { 1: 'not confirmed by the administrator yet', 2: 'this user is no longer enabled', 5: 'command not allowed', '005': 'command not allowed', 10: 'the accessory has no paired user yet',
      15: 'the accessory is not ready yet', OPERATION_NOT_PERMITTED: 'operation not allowed',
      '007': 'the accessory cannot reach the gate controller' };     // the alert of the app says "not carried out" for 007 (skin/copy/copy.json): the line says the same
    var NOT_SENT = { NOT_CONNECTED: 1, NO_SESSION: 1, WRITE_ERROR: 1, 3: 1, 4: 1 };
    function codeOf(err) { return (err && typeof err === 'object') ? err.code : err; }
    function failKind(err, c) {
      var code = codeOf(err);
      if (code != null && REFUSED[code]) return 'refused';
      // Through the Nice cloud a call that failed here does not prove that nothing went out (nx24: seen on a phone on mobile data: "No connection to the accessory. Open not sent."
      // while the gate opened and the accessory logged the Open): the words are then "No answer ... it may have arrived", never "not sent"
      if (routeNow() === 'cloud') return 'unknown';
      if (c.connectFail) return 'notsent';                         // the service could not connect: nothing was written
      if (code != null && NOT_SENT[code]) return 'notsent';
      return 'unknown';
    }
    // The gate did what the command asks, after the tap: whatever the call said, the screen shows what happened and a failure line would contradict it. Only when the gate was not
    // already there (expectsReport) and the state was reported after the tap.
    function agreesWith(code, st) {
      if (MOVE_OPEN[code]) return st === 'open' || st === 'opening';
      if (MOVE_CLOSE[code]) return st === 'closed' || st === 'closing';
      if (code === 'stop' || code === 'MDAy') return st === 'stopped';
      return false;
    }
    function gateFollowed(L, c) {
      try {
        if (!L || !expectsReport(c) || !(L.stateAt > (c.tapAt || c.sendAt || 0))) return false;
        return agreesWith(c.code, stateName(liveOf({ mac: c.mac, homeId: c.homeId })));
      } catch (e) { return false; }
    }
    function cmdFailed(c, err) {
      var t = nowMs();
      c.phase = 'failed'; c.failAt = t; c.err = err; c.fail = failKind(err, c); c.why = '';
      log('command: ' + nameOf(c.code, c.primary) + ' failed ' + JSON.stringify(err == null ? null : err) + ' -> ' + c.fail);
      later(failKeepMs());
      announce(c); digestSoon(); refreshPill();
    }
    // The page of other commands has no status line (and a screen without the line falls back to the same): the message is a toast there, longer for a failure.
    // A scene that runs commands stays silent.
    function surfaceOf() {
      var n = '';
      try { n = (inj.has('$state') && inj.get('$state').current && inj.get('$state').current.name) || ''; } catch (e) {}
      if (/device-detail$/.test(n)) return document.querySelector('.nx-line') ? 'line' : 'toast';
      if (/device-commands$/.test(n)) return 'toast';
      return '';
    }
    function announce(c) {
      try {
        if (surfaceOf() !== 'toast') return;
        var r = recLine(rec(c.mac), c, nowMs());
        if (r && r.text) toast(r.text, (c.phase === 'failed' || c.phase === 'dropped') ? 9000 : 3500);
      } catch (e) {}
    }

    // ---- the wrappers (they look along; every result goes on unchanged)
    function wrapNx(name, after) {
      var orig = NHK[name];
      if (typeof orig !== 'function' || orig.__nxCmd) return;
      var w = function () {
        var p = orig.apply(NHK, arguments);
        try { after(arguments, p); } catch (e) { log('wrapper ' + name, String(e)); }
        return p;
      };
      w.__nxCmd = true;
      if (orig.__nx) w.__nx = true;
      NHK[name] = w;
    }
    ['executePrimaryCommand', 'executeSecondaryCommand'].forEach(function (name) {
      var orig = NHK[name], primary = name === 'executePrimaryCommand';
      if (typeof orig !== 'function' || orig.__nxCmd) return;
      var w = function (device, automationId, code) {
        var c = null, p;
        try { c = cmdSending(device, code, primary); } catch (e) { log('wrapper ' + name, String(e)); }
        connectFor = c;                          // the connect that the service makes first belongs to this command (see the wrapper of connect)
        try { p = orig.apply(NHK, arguments); } catch (e) {
          connectFor = null;
          try { if (c) cmdFailed(c, e); } catch (x) {}
          throw e;
        }
        connectFor = null;
        try { if (c) onSettle(p, function () { cmdSent(c); }, function (err) { cmdFailed(c, err); }); } catch (e) { log('wrapper ' + name, String(e)); }
        return p;
      };
      w.__nxCmd = true;
      if (orig.__nx) w.__nx = true;
      NHK[name] = w;
    });
    wrapNx('connect', function (args, p) {
      var c = connectFor;
      if (!c || c.connectSeen) return;
      c.connectSeen = true;
      onSettle(p, function () { c.connectOk = true; }, function () { c.connectFail = true; });
    });
    wrapNx('status', function (args, p) {
      var mac = args[0] && args[0].mac;
      if (!mac) return;
      var L = rec(mac);
      L.askAt = nowMs();
      refreshPill(); digestSoon();
      onSettle(p, function () { L.askEnd = nowMs(); stateReport(mac); }, function () {
        L.askEnd = L.askFailAt = nowMs();
        log('state: not confirmed, the status request failed');
        refreshPill(); digestSoon();
      });
    });
    function heardAfter(args, p) { var mac = args[0] && args[0].mac; if (mac) onSettle(p, function () { heard(mac); }); }
    wrapNx('logs', heardAfter);
    wrapNx('pairings', heardAfter);
    // The check of the accessory. A tap on a button while the app calls the accessory "not usable" starts one before the command (and sends nothing when it fails).
    wrapNx('verify', function (args, p) {
      var mac = args[0] && args[0].mac;
      if (!mac) return;
      var L = rec(mac), t = nowMs(), c = null, i;
      for (i = L.cmds.length - 1; i >= 0; i--) if (L.cmds[i].phase === 'tapped' && t - L.cmds[i].tapAt < 50) { c = L.cmds[i]; break; }
      if (c) {
        c.phase = 'waiting'; c.waitAt = t;
        later(WAIT_LONG_MS); digestSoon();
        log('command: ' + nameOf(c.code, c.primary) + ' waits, the app checks the accessory first');
      }
      onSettle(p, function () {
        L.heardAt = nowMs();
        if (c) afterVerify(c);
      }, function (err) {
        L.verifyFailAt = nowMs();
        if (c && c.phase === 'waiting') {
          c.phase = 'failed'; c.failAt = L.verifyFailAt; c.fail = 'notsent'; c.why = 'verify'; c.err = err;
          log('command: ' + nameOf(c.code, c.primary) + ' not sent, the check of the accessory failed ' + JSON.stringify(err == null ? null : err));
          later(failKeepMs()); announce(c);
        }
        refreshPill(); digestSoon();
      });
    });
    window.addEventListener('newDeviceState', function (e) { stateReport(e && e.mac); }, false);
    $rootScope.$on('deviceReachable', function (ev, data) { var m = data && data.device && data.device.mac; if (m) { heard(m); refreshPill(); } });
    $rootScope.$on('deviceUnreachable', function (ev, data) {
      var m = data && data.device && data.device.mac;
      if (m) { rec(m).verifyFailAt = nowMs(); digestSoon(); refreshPill(); }
    });
    $rootScope.$on('$stateChangeSuccess', function (ev, toState, toParams) {
      var n = (toState && toState.name) || '';
      if (/device-detail$/.test(n) && toParams && toParams.mac) { detailMac = toParams.mac; rec(detailMac).enteredAt = nowMs(); later(ENTER_MS); digestSoon(); } else detailMac = '';
    });
    document.addEventListener('resume', function () { resumeAt = nowMs(); later(RESUME_HOLD_MS); digestSoon(); }, false);
    // so that "updated 12:03" turns into "last confirmed 12:03" without a tap (this asks the accessory for nothing)
    setInterval(function () { if (detailMac && !document.hidden) digestSoon(); }, 5000);

    // right after a resume the app marks every accessory "not reachable" until its own check has answered; that is not a result (nxCheck asks this)
    function resumeHold(device) {
      if (!resumeAt || nowMs() - resumeAt >= RESUME_HOLD_MS) return false;
      var mac = device && device.mac, L = mac && led[mac], d = liveOf(device);
      if (d.reachable === true) return false;                      // the app has checked the accessory since: nothing to hold
      return !(L && L.verifyFailAt > resumeAt);                    // a check that failed ends the wait: that is the answer
    }

    // ---- taps: the one entry point of the pad (patch-12). The app's runCommand is called first and unchanged; what became of the tap is read afterwards, without timers.
    function nxRun(device, code, primary, appRun) {
      if (typeof appRun !== 'function') return;
      var c = null, k = String(code), stop = !!primary && k === 'stop', ret;
      try {
        if (device && device.mac) { c = newCmd(device, k, !!primary, true); log('command: ' + nameOf(k, !!primary) + ' tapped'); }
      } catch (e) { log('nxRun', String(e)); c = null; }
      if (stop && c && STOP_BYPASS === 'always' && stopDirect(device, c)) return;
      try { ret = appRun(code, primary); } catch (e) {
        if (stop && c && STOP_BYPASS !== 'off' && stopDirect(device, c)) return;
        throw e;
      }
      try { settleTap(device, c, stop); } catch (e) { log('nxRun', String(e)); }
      return ret;
    }
    // After the app's runCommand: still "tapped" means that it did not call the service. Either it checks an accessory that it calls "not usable" first
    // (the verify wrapper has seen that), or its guard ignored the tap because it came within 500 ms of another command.
    function settleTap(device, c, stop) {
      if (!c || c.phase !== 'tapped') return;
      var t = nowMs();
      if (liveOf(device).reachable === false) { c.phase = 'waiting'; c.waitAt = t; later(WAIT_LONG_MS); digestSoon(); return; }
      if (anySendAt && t - anySendAt < GUARD_MS) {
        if (stop && STOP_BYPASS !== 'off' && stopDirect(device, c)) return;
        if (repeatOfSent(device, c, t)) {         // a double tap: the same command went out a moment ago, the line says what became of that one
          c.phase = 'skipped'; c.done = true;
          log('command: ' + nameOf(c.code, c.primary) + ' tapped again, the first tap is on its way (the app ignores the second)');
          return;
        }
        c.phase = 'dropped'; c.dropAt = t;
        log('command: ' + nameOf(c.code, c.primary) + ' not sent, the app ignores a tap within 500 ms of another command');
        later(DROP_KEEP_MS); announce(c); digestSoon();
      }
    }
    // the command that went out last on this accessory, a moment ago, is the same as this one (the second tap of a double tap)
    function repeatOfSent(device, c, t) {
      var L = rec(device.mac), last = null, i;
      for (i = 0; i < L.cmds.length; i++) if (L.cmds[i] !== c && L.cmds[i].sendAt && (!last || L.cmds[i].sendAt > last.sendAt)) last = L.cmds[i];
      return !!last && last.code === c.code && last.primary === c.primary && t - last.sendAt < GUARD_MS && (last.phase === 'sending' || last.phase === 'sent');
    }
    // the same service call that the app makes for Stop (see STOP_BYPASS): true when it went out (or is on its way)
    function stopDirect(device, c) {
      var a = automationOf(device);
      if (!a || a.id == null || !device.mac || typeof NHK.executePrimaryCommand !== 'function') return false;
      var L = rec(device.mac);
      if (L.stopAt && nowMs() - L.stopAt < TWICE_MS) { c.done = true; c.phase = 'skipped'; return true; }          // a second tap within 150 ms: the first Stop is on its way
      try { NHK.executePrimaryCommand(device, a.id, 'stop'); } catch (e) { log('command: Stop could not be sent from here', String(e)); return false; }
      log('command: Stop is sent from here (' + (STOP_BYPASS === 'always' ? 'bypass: always' : 'the app ignored the tap') + ')');
      return true;
    }
    // the check came back: the app now sends the command, unless its guard ignores it (then nothing follows, and a Stop is sent from here)
    function afterVerify(c) {
      setTimeout(function () {
        try {
          if (c.phase !== 'waiting') return;
          var d = liveDevice(c.homeId, c.mac);
          if (c.primary && c.code === 'stop' && STOP_BYPASS !== 'off' && d && stopDirect(d, c)) return;
          c.phase = 'dropped'; c.dropAt = nowMs();
          log('command: ' + nameOf(c.code, c.primary) + ' not sent, the app ignores a tap within 500 ms of another command');
          later(DROP_KEEP_MS); announce(c); digestSoon();
        } catch (e) { log('afterVerify', String(e)); }
      }, 0);
    }

    // ---- trust: how old is the state on the screen, and does the accessory still answer
    //   'live'      a report of the state of the last 30 s, and not from before the last resume
    //   'checking'  the state is being asked for (the screen was just entered, or the app came back and asks)
    //   'aging'     older than that, and still no reason to doubt it (the accessory answers; it only tells what changes)
    //   'stale'     older than 75 s and nothing heard from the accessory, or the request failed
    //   ''          nothing is known (an accessory that this session never asked about)
    function trustOf(device) {
      var mac = (device && device.mac) || (typeof device === 'string' ? device : ''), L = mac && led[mac], t = nowMs();
      if (!L) return '';
      var asking = L.askAt > L.askEnd && t - L.askAt < STUCK, entered = !!L.enteredAt && t - L.enteredAt < ENTER_MS;
      // a request that has been out for longer than a check is waited for, with no answer and no error since: it is as good as a failed one (the state on the screen is not confirmed)
      var hung = L.askAt > L.askEnd && L.askAt > L.stateAt && t - L.askAt >= STUCK;
      if (!L.stateAt && !asking && !entered && !L.askFailAt && !hung) return '';
      var age = L.stateAt ? t - L.stateAt : Infinity;
      if (age < -5000) return 'stale';           // the clock went back (a manual change): how old the report is cannot be told, and 'live' would be a claim; a few seconds back is normal time sync
      if (age <= freshMs() && L.stateAt >= resumeAt) return 'live';
      if (asking || entered) return 'checking';
      if (L.askFailAt > L.stateAt || hung) return 'stale';
      if (age <= staleMs()) return 'aging';
      return (t - L.heardAt <= staleMs()) ? 'aging' : 'stale';
    }
    // what else may be in the line's place (the layout's pill for a blocked gate, a state that the log has settled, a state that nobody knows): it keeps it
    function restingBusy(d) {
      try {
        if ($rootScope.nxBlock && $rootScope.nxBlock(d)) return true;
        if ($rootScope.nxSettled && $rootScope.nxSettled(d)) return true;
        var st = stateName(d);
        return !!st && !/^(open|closed|opening|closing|stopped)$/.test(st);
      } catch (e) { return false; }
    }
    function trustLine(d, L, t) {
      var tr = trustOf(d);
      if (tr === 'checking') return { kind: 'busy', text: checkingText(L, t), act: '' };
      if (tr === 'aging') return restingBusy(d) ? null : { kind: '', text: 'Updated ' + hhmm(L.stateAt || L.heardAt), act: '' };
      if (tr !== 'stale') return null;
      var st = stateName(d), when = L && L.stateAt ? hhmm(L.stateAt) : '', text;
      if (!when) text = 'State not read. Showing the stored one.';
      else if (st === 'opening' || st === 'closing') text = 'Last report: ' + stateLabel(st) + ' ' + when + '. Check the gate.';
      else text = 'Last confirmed ' + when;
      return { kind: 'warn', text: text, act: REFRESH_BUTTON ? 'Refresh' : '' };
    }
    function checkingText(L, t) { return (L && L.askAt > L.askEnd && t - L.askAt > CHECK_LONG_MS) ? 'Still checking. The accessory is slow to answer.' : 'Checking the gate…'; }

    // ---- the status line
    var NONE = { kind: '', text: '', act: '' };
    // A button needs room: next to one the text gets about 49 characters in the two lines of the line on a phone 360 dp wide (lineOf drops the button of a longer text).
    // So no button for a delivery that is not known, and none for Stop: the words are what matters there, the chip and its sheet still have Reconnect.
    var ACT_FIT_CHARS = 49;
    // (measured in the finished layout, Roboto Flex, two lines of 14 sp: 50 characters next to a button at 360 dp, 68 at 412 dp, 35 at 320 dp: a narrower screen has less room)
    function actFitChars() { var w = window.innerWidth || 360; return w >= 360 ? ACT_FIT_CHARS : Math.max(24, Math.floor(ACT_FIT_CHARS - (360 - w) * 0.36)); }
    function failLine(c, name) {
      var stop = c.primary && c.code === 'stop', tail = stop ? ': use the remote.' : '.', code = codeOf(c.err), text, act = 'Reconnect';
      if (c.fail === 'refused') { text = cap(REFUSED[code]) + '. ' + name + ' not sent' + tail; act = ''; }
      else if (c.fail === 'notsent') {
        text = (c.why === 'verify' ? 'The accessory did not answer. ' : code === 'WRITE_ERROR' ? 'Writing to the accessory failed. ' : 'No connection to the accessory. ') + name + ' not sent' + tail;
      } else { text = stop ? 'Stop not confirmed. The gate may move: use the remote.' : 'No answer to ' + name + '. It may have arrived: check the gate.'; act = ''; }
      return { kind: 'bad', text: text, act: stop ? '' : act };
    }
    function recLine(L, c, t) {
      if (c.done) return null;
      var name = nameOf(c.code, c.primary), at;
      switch (c.phase) {
        case 'waiting':
          at = t - c.waitAt;
          // the check of the app has no end of its own: after a while the words say what is true (it may still be sent, late), and after the time in which cmdSending would still match it, nothing
          if (at >= 120000) return null;
          if (at >= STUCK) return { kind: 'warn', text: 'No answer from the accessory yet. ' + name + ' may still be sent: check the gate.', act: '' };
          return { kind: 'busy', inflight: true, text: (at > WAIT_LONG_MS ? 'Still waiting. ' + name + ' is not sent if the accessory stays silent.' : 'Waiting for the accessory. ' + name + ' is not sent if it stays silent.'), act: '' };
        case 'sending':
          at = t - c.sendAt;
          if (at >= PENDING_MS) return { kind: 'warn', inflight: true, text: 'No answer to ' + name + ' yet. It may still arrive: check the gate.', act: '' };
          return { kind: 'busy', inflight: true, text: 'Sending ' + name + '…' + (at >= SLOW_MS ? ' the accessory is slow to answer.' : ''), act: '' };
        case 'sent':
          if (L.stateAt > (c.tapAt || c.sendAt)) return null;       // the state was reported after it: the screen shows what happened
          at = t - c.sentAt;
          if (expectsReport(c) && at >= silentMs()) return at < silentMs() + failKeepMs() ? { kind: 'warn', text: 'No report from the gate yet. Check it.', act: '' } : null;
          return at < silentMs() ? { kind: 'ok', text: name + ' sent ' + hms(c.sentAt) + (c.route === 'cloud' ? ' · via cloud' : ''), act: '' } : null;
        case 'failed':
          if (t - c.failAt > failKeepMs()) return null;
          if (c.fail === 'unknown' && L.stateAt > c.failAt) return null;   // the state was reported after it: the doubt is settled
          if (gateFollowed(L, c)) {                                        // the gate did it after all: the line does not go on saying "not sent" next to "Opening"
            if (!c.followed) { c.followed = true; log('command: ' + name + ' was reported as failed (' + c.fail + '), but the gate reports ' + stateName(liveOf({ mac: c.mac, homeId: c.homeId })) + ': the line is withdrawn'); }
            return null;
          }
          return failLine(c, name);
        case 'dropped':
          return t - c.dropAt < DROP_KEEP_MS ? { kind: 'warn', text: 'Too soon after the last command. ' + name + ' not sent: tap again.', act: '' } : null;
      }
      return null;
    }
    // why nothing answers (the long diagnosis stays in the status sheet)
    function unreachableAct() { var net = lastStatus && lastStatus.net; return (net && net.module) ? '' : 'Reconnect'; }
    function unreachableCause() {
      var net = lastStatus && lastStatus.net, home = (allDevices()[0] && allDevices()[0].home.networkSsid) || '';
      if (!net) return 'The accessory does not answer.';
      if (net.module) return 'The phone is on the accessory’s setup Wi-Fi.';
      if (!net.wifi && !net.vpn) return 'No Wi-Fi, and the Nice cloud does not answer.';
      if (net.vpn && (net.vpnRoute || !('vpnRoute' in net))) return 'The VPN may be blocking the accessory.';
      if (otherSsid(net, home)) return 'The phone is on another Wi-Fi than the accessory.';
      return 'The accessory does not answer.';
    }
    // The app's flag says "not reachable", but the accessory answered a moment ago (a check or a command came back, and nothing failed since): the flag is out of date until the app checks again
    function answeredJustNow(L, t) { return !!L && L.heardAt > L.verifyFailAt && t - L.heardAt < 15000; }
    function lineOf(device) {
      var r = lineOf1(device);
      if (r.act && r.text.length > actFitChars()) r = { kind: r.kind, text: r.text, act: '' };      // no room for a button next to this text
      return r;
    }
    function lineOf1(device) {
      try {
        if (!device || !device.mac) return NONE;
        var L = led[device.mac], t = nowMs(), d = liveOf(device), r = null, i;
        if (L) for (i = L.cmds.length - 1; i >= 0 && !r; i--) r = recLine(L, L.cmds[i], t);
        if (r && r.inflight) return r;                                // a command is on its way: that is the news
        if (L && L.reconnectAt > L.manualDoneAt) return { kind: 'busy', text: 'Connecting to the accessory…', act: '' };       // Reconnect was tapped
        if (r) return r;
        var chk = nxCheck(d);
        if (chk === 'retry') return { kind: 'busy', text: 'Connecting to the accessory…', act: '' };
        if (d.reachable === false && chk === '') {
          if (answeredJustNow(L, t)) return { kind: '', text: 'The accessory answered a moment ago.', act: '' };
          return { kind: 'bad', text: (L && L.manualDoneAt && t - L.manualDoneAt < 60000) ? 'Still no answer. Tap the status for details.' : unreachableCause(), act: unreachableAct() };
        }
        if (chk === 'checking') return { kind: 'busy', text: checkingText(L, t), act: '' };
        return trustLine(d, L, t) || NONE;
      } catch (e) { log('nxLine', String(e)); return NONE; }
    }
    // the pad is dimmed (not blocked: every button still works) while the accessory does not answer; never Stop
    function unsureOf(device) {
      try {
        if (!device || !device.mac) return false;
        var d = liveOf(device), chk = nxCheck(d);
        return chk === 'retry' || (d.reachable === false && chk === '' && !answeredJustNow(led[device.mac], nowMs()));
      } catch (e) { return false; }
    }
    // the app's own recovery without the sheet: a button in the line must never open a modal over the pad (reconnect() of the sheet does)
    function reconnectQuiet(done) {
      nx('reconnect', [], function () {
        pushHints();
        setTimeout(function () { verifyAll(function () { setHeal(false); if (done) done(); }); }, 2500);
      }, function () { setHeal(false); if (done) done(); });
    }
    function manualReconnect(device) {
      if (heal.busy || busyDiag || !device || !device.mac) return;
      var L = rec(device.mac);
      log('reconnect: asked from the status line');
      L.reconnectAt = nowMs();
      L.cmds.forEach(function (x) { if (x.phase === 'failed' && x.fail === 'notsent') x.done = true; });     // the attempt replaces that; a doubt about a command that may have arrived stays
      setHeal(true);                           // (the automatic attempts, heal.n, are not used up by this)
      reconnectQuiet(function () { L.manualDoneAt = nowMs(); later(60000); digestSoon(); refreshPill(); });
    }
    // the app's own request for the state of the screen that is shown (what happens when the screen is entered); without its scope the same request is made here
    function refreshState(device) {
      var d = liveOf(device);
      try {
        var el = document.querySelector('.device-commands'), s = el && window.angular && window.angular.element(el).scope();
        if (s && typeof s.changeSlide === 'function') { log('refresh: asked from the status line'); s.changeSlide(s.activeSlideIndex); return; }
      } catch (e) { log('refresh', String(e)); }
      NHK.status(d).then(function (res) {
        var props = res && res.devices && res.devices[0] && res.devices[0].properties;
        if (props) { d.properties = props; d.reachable = true; HS.updateDevice(d.homeId, d); }
        digestSoon();
      }, function () {});
    }
    $rootScope.nxLine = function (d) { return lineOf(d).text; };
    $rootScope.nxLineKind = function (d) { return lineOf(d).kind; };
    $rootScope.nxLineAct = function (d) { return lineOf(d).act; };
    // what a screen reader does with a change of the line: a failure interrupts, a message about a tap is said when the reader is free, and the plain "Updated 12:03" (30 s after every report of
    // the state) and "The accessory answered a moment ago." are only there to be read, not announced
    $rootScope.nxLineLive = function (d) { var r = lineOf(d); return r.kind === 'bad' ? 'assertive' : (r.kind === '' && r.text ? 'off' : 'polite'); };
    // The button that was pressed goes away when the line changes ("Connecting to the accessory…" has none): the keyboard focus (and TalkBack's) stays in the line, so that a person who
    // used the button does not start again from the top of the page. Nothing happens for a touch that did not focus the button.
    function keepFocus() {
      try {
        var ae = document.activeElement, line = ae && ae.closest && ae.closest('.nx-line');
        if (!line) return;
        if (!line.hasAttribute('tabindex')) line.setAttribute('tabindex', '-1');
        line.focus({ preventScroll: true });
      } catch (e) {}
    }
    $rootScope.nxLineDo = function (d) {
      try {
        var a = lineOf(d).act;
        if (a === 'Reconnect') manualReconnect(d); else if (a === 'Refresh') refreshState(d);
        keepFocus();
      } catch (e) { log('nxLineDo', String(e)); }
    };
    $rootScope.nxTrust = trustOf;
    $rootScope.nxUnsure = function (d) { return unsureOf(d) ? '1' : ''; };
    $rootScope.nxRun = nxRun;
    window.__nxTrust = trustOf;     // for the chip (status) and the lists, which call it guarded
    window.NX.line = function (device) { var d = device || (allDevices()[0] || {}).device; return d ? lineOf(liveOf(d)) : NONE; };
    window.NX.trust = function (device) { var d = device || (allDevices()[0] || {}).device; return d ? trustOf(liveOf(d)) : ''; };
    window.NX.ledger = function () { try { return JSON.parse(JSON.stringify(led)); } catch (e) { return {}; } };
    // ---- nx23 command: end
    // nx23 dialogs: the dialog manager closes the Activity sheet with this (Back, Escape)
    window.NX.closeActivity = function () { try { if (activity && activity.close) activity.close(); } catch (e) { log('activity close', String(e)); } };
    log('nx-patch active');
  }
})();
