/* Test environment: simulated Cordova bridge + simulated module, so that the real app runs in a normal browser. */
(function () {
  var CFG = window.__CFG || {};
  var HOME = 1, MAC = '00:0B:6C:AA:BB:CC';
  // CFG.favorite: false -> the accessory is not a favorite (it shows up in the "add favorites" list)
  // CFG.reachable: false -> the stored flag of the last session says "not reachable" (the state in which the app shows "Not usable")
  // CFG.secondary: the codes of the secondary commands of the accessory ("Open and Block" is MDBk, "Release and Close" MDFh); CFG.fourth: the code of the app's own optional command
  var SECONDARY = CFG.secondary || [];
  function seed() {
    try {
      if (localStorage.getItem('keyHomes')) return;
      var device = {
        mac: MAC, name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', address: '192.168.1.72', homeId: HOME,
        pairingUsername: 'homeuser', pairingPassword: 'x', reachable: CFG.reachable !== false, favorites: CFG.favorite !== false, paired: true, permissions: { isAdmin: true, isUser: true },
        properties: [{ value: CFG.state || 'closed' }, { value: CFG.obstruct || '0' }],
        automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'],
          fourthButtonEnabled: !!CFG.fourth, fourthButton: CFG.fourth ? { code: CFG.fourth } : undefined,
          secondaryCommands: SECONDARY.map(function (c) { return { code: c }; }), enabledSecondaryCommands: SECONDARY.length ? true : [], properties: [] }]
      };
      var homes = [{ homeId: HOME, name: 'Home', phoneName: 'Pixel', userName: 'homeuser', networkSsid: 'HomeWifi', networkPassword: 'x', devices: [device] }];
      localStorage.setItem('keyHomes', JSON.stringify(homes));
      localStorage.setItem('keyIsFirstSetupCompleted', 'true');
      if (CFG.quick) localStorage.setItem('nxQuick', JSON.stringify({ [MAC]: CFG.quick }));   // CFG.quick: the codes ticked as extra buttons
      localStorage.setItem('keyDefaultHome', String(HOME));
      localStorage.setItem('keyConnectionMode', JSON.stringify('local'));
    } catch (e) {}
  }
  seed();

  window.prompt = function (m, d) { return (d && String(d).indexOf('gap_init') === 0) ? '1234' : null; };

  var log = window.__nativeLog = [];
  function status() {
    return { interface: { settings: [{ value: 'AABBCC' }] },
      devices: [{ properties: [{ value: CFG.state || 'closed' }, { value: CFG.obstruct || '0' }] }] };
  }
  var verifyCount = 0;
  // nx14: the event log of the accessory (made up). CFG.activity: 'none' (an empty log), 'error' (reading fails), 'slow' (answers after 4 s),
  // 'blocked' (the last thing in the log is an "Open and Block" of 20 minutes ago); CFG.logs: a log of your own ({ interfaceLogs, deviceLogs }).
  // The default is the last 12 days of a household: two people (Anna and Ben) who open and close the gate on workdays, a schedule that closes
  // it at 22:00, a few commands from a remote control (source busT4), two obstructions, a restart, three Wi-Fi drops and a moment in which the
  // module did not find the gate controller. As on a real accessory the gate controller (busT4) repeats every command of a phone as a
  // movement a second later, and a module event is written as "T4 device not found".
  var USERS = [{ id: 1, controllerID: 'CTRL-ANNA-0001', username: 'Anna', desc: 'Pixel', perm: 'admin', notify: true },
               { id: 2, controllerID: 'CTRL-BEN-00002', username: 'Ben', desc: 'Galaxy', perm: 'user', notify: false }];
  function sampleLogs(blocked) {
    var seed = 11;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var now = Date.now(), midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    var dev = [], ifc = [], n = 0;
    function at(day, h, m, sec) { return midnight.getTime() - day * 86400000 + ((h * 60 + m) * 60 + (sec || 0)) * 1000; }
    function add(list, t, source, type, device) { if (t <= now) list.push({ deviceId: device ? '1' : '', source: source, type: type, time: t, idx: String(++n), id: String(n) }); }
    function pair(day, h, m, source, gap) {
      add(dev, at(day, h, m, 5), source, 'open', true); add(dev, at(day, h, m + (gap || 2), 20), source, 'close', true);
      if (source !== 'busT4') { add(dev, at(day, h, m, 6), 'busT4', 'open', true); add(dev, at(day, h, m + (gap || 2), 21), 'busT4', 'close', true); }       // the gate controller's own report
    }
    for (var day = 11; day >= 0; day--) {
      var dow = new Date(at(day, 12, 0)).getDay(), work = dow >= 1 && dow <= 5;
      if (work) {
        pair(day, 7, 28 + Math.floor(rnd() * 14), 'CTRL-ANNA-0001');
        if (rnd() < 0.8) pair(day, 8, 5 + Math.floor(rnd() * 25), 'CTRL-BEN-00002');
        pair(day, 17, 10 + Math.floor(rnd() * 50), rnd() < 0.7 ? 'CTRL-ANNA-0001' : 'CTRL-BEN-00002');
        if (rnd() < 0.5) pair(day, 18, 5 + Math.floor(rnd() * 40), 'busT4', 1);
      } else {
        pair(day, 10, 5 + Math.floor(rnd() * 30), 'CTRL-BEN-00002', 3);
        if (dow === 6) { add(dev, at(day, 11, 2), 'CTRL-BEN-00002', 'MDBk', true); add(dev, at(day, 11, 40), 'CTRL-BEN-00002', 'MDFh', true); }
        pair(day, 15, 20 + Math.floor(rnd() * 30), 'busT4', 1);
      }
      add(dev, at(day, 22, 0), 'scheduler', 'close', true);
    }
    add(dev, at(9, 7, 31, 40), 'busT4', 'obstruction', true);
    add(dev, at(3, 17, 52, 12), 'busT4', 'obstruction', true);
    add(ifc, at(7, 2, 0, 0), 'boot', 'Power ON'); add(ifc, at(7, 2, 0, 30), 'boot', 'T4 device not found'); add(ifc, at(7, 2, 0, 31), 'boot', 'T4 device found');
    add(ifc, at(6, 3, 14), '', 'wifi loss'); add(ifc, at(6, 3, 15), '', 'connect'); add(ifc, at(2, 4, 40), '', 'wifi loss'); add(ifc, at(2, 4, 41), '', 'connect');
    add(ifc, at(1, 13, 5), '', 'wifi loss'); add(ifc, at(4, 5, 0), '', 'T4 device not found'); add(ifc, at(4, 5, 1), '', 'T4 device found');
    for (var k = 0; k < 8; k++) add(ifc, at(k, 6, 30 + k), '', 'connect');
    if (blocked) {                                              // the newest thing in the log: a phone blocks the gate (and the controller reports the opening)
      var tb = now - 20 * 60000;
      dev = dev.filter(function (e) { return e.time < tb - 60000; });
      add(dev, tb, 'CTRL-ANNA-0001', 'MDBk', true); add(dev, tb + 1000, 'busT4', 'open', true);
    }
    return { interfaceLogs: ifc, deviceLogs: dev };
  }
  // nx16: window.__extraLogs: entries of the device log that are added to the answer from now on (a script can push what "another app" does:
  // { deviceId: '1', source: 'CTRL-ANNA-0001', type: 'MDEw', time: Date.now() }); CFG.activityTimes: the times of the readings in the background
  // of nx-activity.js in milliseconds, for example { "PollMs": 3000, "ResumeMs": 500 } (the same names as window.__nxActivity<Name>)
  Object.keys(CFG.activityTimes || {}).forEach(function (k) { window['__nxActivity' + k] = CFG.activityTimes[k]; });
  // window.__logsOverride: the whole answer ({ interfaceLogs, deviceLogs }), for a script that builds a log relative to "now" (a restart an hour ago, ...)
  function activityAnswer() {
    if (CFG.activity === 'error') return { fail: { code: 3 } };
    var data = window.__logsOverride || CFG.logs || (CFG.activity === 'none' ? { interfaceLogs: [], deviceLogs: [] } : sampleLogs(CFG.activity === 'blocked'));
    if (window.__extraLogs && window.__extraLogs.length) data = { interfaceLogs: data.interfaceLogs, deviceLogs: data.deviceLogs.concat(window.__extraLogs) };
    return CFG.activity === 'slow' ? { delay: 4000, then: data } : data;
  }
  var NATIVE = {
    'Device.getDeviceInfo': function () { return { platform: 'Android', version: '14', uuid: 'design-uuid', model: 'Pixel 9', manufacturer: 'Google', isVirtual: true, serial: 'x', sdkVersion: '34' }; },
    // The check of the accessory. The answer of a paired, reachable accessory has its permissions: the list shows no "Not usable".
    // CFG.verifyFail: it always fails. CFG.verifyScript: the outcomes of the successive checks ('fail' or 'ok'; the last one repeats).
    // CFG.verifyDelay: how many milliseconds a check takes (to look at the "Checking..." state).
    'nhk.verify': function () {
      var step = CFG.verifyScript ? CFG.verifyScript[Math.min(verifyCount++, CFG.verifyScript.length - 1)] : (CFG.verifyFail ? 'fail' : 'ok');
      var answer = step === 'fail' ? { fail: 'timeout' } : { isAdmin: true, isUser: true };
      return CFG.verifyDelay ? { delay: CFG.verifyDelay, then: answer } : answer;
    },
    'nhk.connect': function () { return CFG.verifyFail ? { fail: 'timeout' } : {}; },
    'nhk.status': status,
    'nhk.discoverConfiguredDevices': function () { return []; },
    'nhk.getUsersPermissions': function () { return { devices: [{ secondaryCommands: SECONDARY.map(function (c) { return { code: c }; }) }] }; },
    'nhk.executePrimaryCommand': function () { return {}; },
    'nhk.executeSecondaryCommand': function () { return {}; },
    'nhk.enableEvents': function () { return { keep: true, none: true }; },
    'WifiWizard.enableEvents': function () { return { none: true }; },
    'CoreAndroid.messageChannel': function () { return { none: true }; },
    'Keyboard.init': function () { return { none: true }; },
    'SQLitePlugin.backgroundExecuteSqlBatch': function (a) { var ex = (a[0] && a[0].executes) || []; return ex.map(function (e) { return { qid: e.qid, type: 'success', result: { rows: [], rowsAffected: 0, insertId: null } }; }); },
    'nhk.executePrimaryCommand': function () { return {}; },
    'nhk.closeConnection': function () { return {}; },
    // CFG.waiting: users that wait for approval, as the accessory lists them (for example [{ id: 2, username: 'Home assistant' }]);
    // CFG.approveError: the code that approving fails with (11 = the maximum number of users is reached)
    'nhk.pairings': function () { return { activeUsers: USERS, waitingUsers: CFG.waiting || [] }; },
    'nhk.logs': activityAnswer,
    'nhk.userNew': function () { return CFG.approveError ? { fail: { code: CFG.approveError } } : {}; },   // what the app calls "userApproved"
    'nhk.getCurrentSSID': function () { return 'HomeWifi'; },
    'WifiWizard.isLocalizationEnabled': function () { return true; },
    'WifiWizard.getScanResults': function () { return [{ SSID: 'HomeWifi', level: -48, BSSID: 'aa:bb:cc:00:11:22', capabilities: '[WPA2-PSK-CCMP]' }, { SSID: 'NiceIT4WIFIAABBCC', level: -60, BSSID: 'aa:bb:cc:00:11:23', capabilities: '[WPA2-PSK-CCMP]' }]; },
    'WifiWizard.getCurrentSSID': function () { return '"HomeWifi"'; },
    'WifiWizard.getCurrentBSSID': function () { return 'aa:bb:cc:00:11:22'; },
    'WifiWizard.isWifiEnabled': function () { return true; },
    'StatusBar.backgroundColorByHexString': function (a) { (window.__statusbar = window.__statusbar || []).push(['color', a[0]]); return {}; },
    'StatusBar.styleDefault': function () { (window.__statusbar = window.__statusbar || []).push(['style', 'dark']); return {}; },
    'StatusBar.styleLightContent': function () { (window.__statusbar = window.__statusbar || []).push(['style', 'light']); return {}; },
    'WifiWizard.getConnectedSSID': function () { return { ssid: '"HomeWifi"', networkId: 1 }; },
    'NetworkStatus.getConnectionInfo': function () { return 'wifi'; },
    'Globalization.getPreferredLanguage': function () { return { value: CFG.lang || 'en-US' }; },
    'Globalization.getLocaleName': function () { return { value: CFG.lang || 'en-US' }; },
    'Nx.version': function () { return 'nx-17'; },
    'Nx.logStream': function () { return { keep: true, none: true }; },
    'Nx.setHints': function () { return {}; },
    'Nx.release': function () { return {}; },
    'Nx.reconnect': function () { return {}; },
    'Nx.checkSucceeded': function () { return {}; },
    'Nx.checkFailed': function () { return {}; },
    'Nx.netState': function () { return CFG.net || { version: 'nx-17', sdk: 37, wifi: true, ssid: 'HomeWifi', ip: '192.168.1.172', validated: true, cellular: false, vpn: false, module: false, defaultType: 'wifi', route: 'local', routeAgeSeconds: 4 }; },
    'Nx.probe': function () { return CFG.probe || { ok: true, tcpMs: 14, tlsMs: 380, bound: true, cloud: { ok: true, dns: '63.182.6.157', dnsMs: 12, tcpMs: 20 } }; }
  };
  function answer(callbackId, r) {
    try {
      if (r && r.none) return;               // stays open (events)
      if (r && r.fail) { cordova.callbackFromNative(callbackId, false, 2, [r.fail], false); return; }
      cordova.callbackFromNative(callbackId, true, 1, [r], false);
    } catch (e) { console.log('shim-error answer ' + e); }
  }
  window._cordovaNative = {
    exec: function (secret, service, action, callbackId, argsJson) {
      var key = service + '.' + action, args = [];
      try { args = JSON.parse(argsJson); } catch (e) {}
      log.push(key);
      (window.__calls = window.__calls || []).push({ key: key, args: args });
      var h = NATIVE[key];
      setTimeout(function () {
        try {
          if (!h) { if (window.cordova) cordova.callbackFromNative(callbackId, true, 1, [], false); return; }
          var r = h(args);
          if (r && r.delay) { setTimeout(function () { answer(callbackId, r.then); }, r.delay); return; }   // answers later
          answer(callbackId, r);
        } catch (e) { console.log('shim-error ' + key + ' ' + e); }
      }, 0);
      return '';
    },
    setNativeToJsBridgeMode: function () {},
    retrieveJsMessages: function () { return ''; }
  };
  window.__NATIVE = NATIVE;
})();
