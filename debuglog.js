/* debuglog.js: the Debug log. A bottom sheet (like the status sheet) with the log lines, "Copy", "Clear" (it asks again) and "Done". It opens from
 * the "Debug log" button of the status sheet, from the row in Settings and, while the app has no accessory yet (the setup wizard), from a small
 * button docked in the header (#nx-log-button; window.__nxLogShow() opens it from code). Back, Escape, the scrim and a change of page close it.
 * Passwords, setup codes and tokens are replaced by *** as soon as they are captured, so what you copy
 * and share does not contain them. (Works on patterns; check it yourself before you share anything.)
 * The Nice app's own repetitive debug lines are left out (see NOISE), so that the lines that matter stay in the log. */
(function () {
  var lines = [], MAX = 1500, noise = 0;

  // ---- masking secrets ----------------------------------------------------------------------
  var RULES = [
    // JSON: "password":"...", also when the JSON is double-stringified (\"password\":\"...\")
    [/(\\?"(?:networkPassword|pairingPassword|sessionPassword|password|setupCode|passphrase|psk|accessToken|token)\\?"\s*:\s*\\?")([^"\\]*)(\\?")/gi, '$1***$3'],
    // plain text: "password: abc", "setup.networkPassword: abc", "pairingPassword=abc"
    [/((?:network|pairing|session)?password\s*[:=]\s*)([^\s,;"'}]+)/gi, '$1***'],
    // "setupcode:  12345678"
    [/(setup\s?code\s*[:=]\s*)([^\s,;"'}]+)/gi, '$1***'],
    // "token zzFCMtok123:APA91b..." (an FCM token and the like)
    [/(token[\s:=]+)([A-Za-z0-9_\-:.]{16,})/gi, '$1***']
  ];
  function mask(t) {
    for (var i = 0; i < RULES.length; i++) t = t.replace(RULES[i][0], RULES[i][1]);
    return t;
  }

  // The Nice app writes debug lines of its own on every refresh of a screen, each with the whole home and accessory as JSON:
  // the accessory screen alone gives some 180 lines every time it is opened (and the log keeps a limited number of lines).
  // They say nothing, and they push out the lines that do matter (a failed check, a failed approval, ...). They are neither
  // stored nor passed on to the console. window.__nxLogAll = true brings them back (for debugging the app itself).
  var NOISE = /^\s*(scene getHome|scene getDevice|devices\.forEach|getDevice scene home\.device|ICONA|updateDevice scene|- updateHome -|this\.homes\[index\]|updateHome forEach)/;
  function isNoise(args) {
    var first = args && args[0];
    return typeof first === 'string' && NOISE.test(first);
  }

  function textOf(args) {
    return Array.prototype.map.call(args, function (a) {
      if (typeof a === 'string') return a;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }).join(' ');
  }

  var pre = null, renderTimer = 0, rev = 0, shownRev = -1, isOpenNow = function () { return false; };
  // what is shown and copied: the lines, and a note when the noise has been left out
  function everything() {
    return lines.join('\n') + (noise ? '\n(' + noise + ' repetitive debug lines of the Nice app left out)' : '');
  }
  function count(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  // one redraw per 250 ms at most, however many lines come in; nothing is rewritten when nothing is new (a selection that is being made stays)
  function render() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () {
      renderTimer = 0;
      if (isOpenNow()) draw();
    }, 250);
  }
  function draw() {
    if (!pre || shownRev === rev) return;
    var atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 24, keep = pre.scrollTop;
    pre.textContent = everything();
    shownRev = rev;
    pre.scrollTop = atBottom ? pre.scrollHeight : keep;      // follows the end only when the reader is at the end
    if (showSub) showSub();
  }
  var showSub = null;
  function add(kind, args) {
    try {
      var t = mask(textOf(args));
      var d = new Date();
      lines.push(('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ' ' + kind + ' ' + t.slice(0, 700));
      if (lines.length > MAX) lines.shift();
      rev++;
      render();
    } catch (e) {}
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { mask: mask, isNoise: isNoise }; }
  if (typeof document === 'undefined') return;   // (test environment without a browser)

  ['log', 'info', 'warn', 'error'].forEach(function (k) {
    var o = console[k] ? console[k].bind(console) : function () {};
    console[k] = function () {
      if (k === 'log' && !window.__nxLogAll && isNoise(arguments)) { noise++; rev++; return; }
      add(k === 'log' ? '' : k.toUpperCase(), arguments);
      o.apply(null, arguments);
    };
  });
  window.addEventListener('error', function (e) { add('ERROR', [e.message, e.filename, e.lineno]); });
  window.__nxMask = mask;

  // ---- the sheet -------------------------------------------------------------------------------------------------------------
  // DOM and classes of the other sheets (status.css: .nx-scrim, .nx-sheet, .nx-handle, .nx-footer), so that it looks like them; data-tap-disabled keeps Ionic's
  // tap handling off these elements (a key press, a screen reader's double tap and a touch all arrive as a plain click). Without nx-patch.js (which adds the
  // dialog manager: focus, inert, Escape, Back through Ionic) it still works: it closes itself on Escape, on a change of page and on the DOM backbutton event.
  var panel, button, scrim, sub, bClear, bCopy, bDone, open = false, closeTimer = 0, msgTimer = 0, clearTimer = 0, armed = false;
  var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  function el(tag, cls, attrs) {
    var x = document.createElement(tag);
    if (cls) x.className = cls;
    if (attrs) for (var k in attrs) x.setAttribute(k, attrs[k]);
    return x;
  }
  function btn(text, cls, fn) {
    var b = el('button', cls, { type: 'button' });
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
  function defaultSub() { return count(lines.length) + (lines.length === 1 ? ' line' : ' lines') + ', secrets are masked, check before you share'; }
  function setStatus(text, ms) {
    if (!sub) return;
    sub.textContent = text;
    clearTimeout(msgTimer);
    if (ms) msgTimer = setTimeout(function () { msgTimer = 0; if (sub) sub.textContent = defaultSub(); }, ms);
  }
  showSub = function () { if (!msgTimer && sub) sub.textContent = defaultSub(); };
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = !!(document.execCommand && document.execCommand('copy'));
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function copyAll() {
    var text = everything(), n = lines.length;
    function done(ok) {
      try { if (bCopy) bCopy.focus({ preventScroll: true }); } catch (e) {}
      msgTimer = 0;
      setStatus(ok ? 'Copied ' + count(n) + (n === 1 ? ' line' : ' lines') : 'Copy failed: select the text yourself', 2500);
    }
    try { if (window.cordova && cordova.plugins && cordova.plugins.clipboard) { cordova.plugins.clipboard.copy(text); done(true); return; } } catch (e) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallbackCopy(text)); });
        return;
      }
    } catch (e) {}
    done(fallbackCopy(text));
  }
  function resetClear() {
    armed = false;
    clearTimeout(clearTimer);
    if (bClear) { bClear.textContent = 'Clear'; bClear.classList.remove('nx-confirm'); }
  }
  // the first tap asks ("Clear all?", for 3 seconds), the second one clears
  function clearAll() {
    if (!armed) {
      armed = true;
      bClear.textContent = 'Clear all?'; bClear.classList.add('nx-confirm');
      msgTimer = 0; setStatus('Tap Clear all? again to delete every line', 3000);
      clearTimer = setTimeout(resetClear, 3000);
      return;
    }
    resetClear();
    lines.length = 0; noise = 0; rev++; shownRev = -1;
    draw();
    msgTimer = 0; setStatus('Cleared', 2500);
  }
  function build() {
    if (!document.body) return;
    if (button) {      // (still there? a page that rebuilds <body> must not take the Debug log with it)
      [scrim, panel, button].forEach(function (n) { if (!n.parentNode) document.body.appendChild(n); });
      return;
    }
    button = el('button', null, { id: 'nx-log-button', type: 'button', 'aria-label': 'Debug log', 'data-tap-disabled': 'true' });
    scrim = el('div', 'nx-scrim', { 'aria-hidden': 'true' });      // (not data-tap-disabled: the row in Settings opens the log from Ionic's own click of a tap; the browser's click that follows lands on this scrim, and only Ionic's gate keeper stops it)
    scrim.style.display = 'none';
    panel = el('div', 'nx-sheet nx-log', { id: 'nx-log-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'nx-log-title', lang: 'en', tabindex: '-1', 'data-tap-disabled': 'true' });
    panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;display:none';      // the look is in nx-expressive.css; this is the safety net
    var head = el('div', 'nx-log-head'), h = el('h2', null, { id: 'nx-log-title' });
    h.textContent = 'Debug log';
    sub = el('div', 'nx-log-sub', { role: 'status', 'aria-live': 'polite' });
    head.appendChild(h); head.appendChild(sub);
    pre = el('pre', 'nx-log-pre', { tabindex: '0', role: 'region', 'aria-label': 'Log lines' });
    var foot = el('div', 'nx-footer nx-log-foot');
    bClear = btn('Clear', 'nx-text', clearAll);
    bCopy = btn('Copy', 'nx-tonal', copyAll);
    bDone = btn('Done', 'nx-primary', hide);
    foot.appendChild(bClear); foot.appendChild(bCopy); foot.appendChild(bDone);
    panel.appendChild(el('div', 'nx-handle'));
    panel.appendChild(head); panel.appendChild(pre); panel.appendChild(foot);
    scrim.addEventListener('click', hide);
    button.addEventListener('click', show);
    document.body.appendChild(scrim); document.body.appendChild(panel); document.body.appendChild(button);
    isOpenNow = function () { return open; };
    showSub();
  }
  function show() {
    build();
    if (!panel || open) return;
    open = true;
    clearTimeout(closeTimer);
    shownRev = -1;
    scrim.style.display = 'block'; panel.style.display = 'flex';
    draw();
    pre.scrollTop = pre.scrollHeight;
    // the transition starts from the closed state: wait two frames
    raf(function () { raf(function () { if (open) { panel.classList.add('nx-open'); scrim.classList.add('nx-open'); } }); });
  }
  function hide() {
    if (!panel || !open) return;
    open = false;
    panel.classList.remove('nx-open'); scrim.classList.remove('nx-open');
    resetClear(); clearTimeout(msgTimer); msgTimer = 0; showSub();
    closeTimer = setTimeout(function () { if (open) return; panel.style.display = 'none'; scrim.style.display = 'none'; }, 350);
  }
  // the status sheet and the row in Settings (nx-patch.js) open it; verify-apk.py and the harness use these names and the ids #nx-log-button and #nx-log-panel
  window.__nxLogShow = show;
  window.__nxLogHide = hide;
  window.__nxLogIsOpen = function () { return open; };
  window.addEventListener('hashchange', hide);
  // Escape closes it wherever the focus is (nx-patch.js has its own handler for every dialog; this one is for when that script has not started)
  document.addEventListener('keydown', function (e) { if (open && (e.key === 'Escape' || e.key === 'Esc')) { e.preventDefault(); hide(); } }, true);
  document.addEventListener('backbutton', function () { if (open) hide(); }, false);      // only the fallback: nx-patch.js closes it through Ionic's back action
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  setInterval(build, 2000);
  // the docked button shows while the app has no accessory (html[data-nx-chip="0"], set by nx-patch.js). If that script never ran, the button is the only way in
  // to the log of a broken patch: after 6 seconds it takes that place itself.
  setTimeout(function () {
    try { var r = document.documentElement; if (!r.hasAttribute('data-nx-chip')) r.setAttribute('data-nx-chip', '0'); } catch (e) {}
  }, 6000);
})();
