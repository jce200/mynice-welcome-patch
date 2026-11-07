/* debuglog.js: small log panel. Tap "LOG" at the bottom left; "copy" puts everything on the clipboard.
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

  var pre = null, renderTimer = 0;
  // what is shown and copied: the lines, and a note when the noise has been left out
  function everything() {
    return lines.join('\n') + (noise ? '\n(' + noise + ' repetitive debug lines of the Nice app left out)' : '');
  }
  // one redraw per 250 ms at most, however many lines come in
  function render() {
    if (renderTimer) return;
    renderTimer = setTimeout(function () {
      renderTimer = 0;
      if (pre && pre.offsetParent) { pre.textContent = everything(); pre.scrollTop = pre.scrollHeight; }
    }, 250);
  }
  function add(kind, args) {
    try {
      var t = mask(textOf(args));
      var d = new Date();
      lines.push(('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + ' ' + kind + ' ' + t.slice(0, 700));
      if (lines.length > MAX) lines.shift();
      render();
    } catch (e) {}
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { mask: mask, isNoise: isNoise }; }
  if (typeof document === 'undefined') return;   // (test environment without a browser)

  ['log', 'info', 'warn', 'error'].forEach(function (k) {
    var o = console[k] ? console[k].bind(console) : function () {};
    console[k] = function () {
      if (k === 'log' && !window.__nxLogAll && isNoise(arguments)) { noise++; return; }
      add(k === 'log' ? '' : k.toUpperCase(), arguments);
      o.apply(null, arguments);
    };
  });
  window.addEventListener('error', function (e) { add('ERROR', [e.message, e.filename, e.lineno]); });
  window.__nxMask = mask;

  var panel, button;
  function build() {
    if (!document.body || button) return;
    button = document.createElement('div');
    button.textContent = 'LOG';
    button.id = 'nx-log-button';
    button.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#c00;color:#fff;font:bold 12px sans-serif;padding:6px 10px;border-radius:6px;opacity:.85';
    panel = document.createElement('div');
    panel.id = 'nx-log-panel';
    panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:60%;z-index:2147483646;background:#000;color:#0f0;display:none;flex-direction:column';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;padding:6px 6px 6px 70px;background:#222';
    function b(t, f) { var x = document.createElement('button'); x.textContent = t; x.style.cssText = 'font-size:13px;padding:6px 10px'; x.onclick = f; bar.appendChild(x); }
    pre = document.createElement('pre');
    pre.style.cssText = 'flex:1;margin:0;padding:6px;overflow:auto;font:10px/1.25 monospace;white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text';
    b('copy', function () {
      var text = everything();
      try { if (cordova && cordova.plugins && cordova.plugins.clipboard) { cordova.plugins.clipboard.copy(text); return; } } catch (e) {}
      try { navigator.clipboard.writeText(text); } catch (e) {}
    });
    b('clear', function () { lines.length = 0; noise = 0; pre.textContent = ''; });
    panel.appendChild(bar); panel.appendChild(pre);
    button.onclick = function () {
      var open = panel.style.display === 'none';
      panel.style.display = open ? 'flex' : 'none';
      if (open) { pre.textContent = everything(); pre.scrollTop = pre.scrollHeight; }
    };
    // the status sheet (nx-patch.js) also opens the log panel, so the separate button no longer has to stay on screen
    window.__nxLogShow = function () { if (panel.style.display === 'none') button.onclick(); };
    document.body.appendChild(panel); document.body.appendChild(button);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  setInterval(build, 2000);
})();
