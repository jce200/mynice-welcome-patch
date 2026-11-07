/* Test environment: simulated Cordova bridge + simulated module, so that the real app runs in a normal browser. */
(function () {
  var CFG = window.__CFG || {};
  var HOME = 1, MAC = '00:0B:6C:AA:BB:CC';
  function seed() {
    try {
      if (localStorage.getItem('keyHomes')) return;
      var device = {
        mac: MAC, name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', address: '192.168.1.72', homeId: HOME,
        pairingUsername: 'homeuser', pairingPassword: 'x', reachable: true, favorites: true, paired: true, permissions: { isAdmin: true, isUser: true },
        properties: [{ value: CFG.state || 'closed' }, { value: CFG.obstruct || '0' }],
        automations: [{ id: '1', type: 'sliding', primaryCommands: ['open', 'stop', 'close'], fourthButtonEnabled: false,
          secondaryCommands: [], enabledSecondaryCommands: [], properties: [] }]
      };
      var homes = [{ homeId: HOME, name: 'Home', phoneName: 'Pixel', userName: 'homeuser', networkSsid: 'HomeWifi', networkPassword: 'x', devices: [device] }];
      localStorage.setItem('keyHomes', JSON.stringify(homes));
      localStorage.setItem('keyIsFirstSetupCompleted', 'true');
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
  var NATIVE = {
    'Device.getDeviceInfo': function () { return { platform: 'Android', version: '14', uuid: 'design-uuid', model: 'Pixel 9', manufacturer: 'Google', isVirtual: true, serial: 'x', sdkVersion: '34' }; },
    'nhk.verify': function () { return CFG.verifyFail ? { fail: 'timeout' } : { isAdmin: true, isUser: true }; },   // the permissions of a paired, reachable accessory: the list shows no "Not usable" badge
    'nhk.connect': function () { return CFG.verifyFail ? { fail: 'timeout' } : {}; },
    'nhk.status': status,
    'nhk.discoverConfiguredDevices': function () { return []; },
    'nhk.enableEvents': function () { return { keep: true, none: true }; },
    'WifiWizard.enableEvents': function () { return { none: true }; },
    'CoreAndroid.messageChannel': function () { return { none: true }; },
    'Keyboard.init': function () { return { none: true }; },
    'SQLitePlugin.backgroundExecuteSqlBatch': function (a) { var ex = (a[0] && a[0].executes) || []; return ex.map(function (e) { return { qid: e.qid, type: 'success', result: { rows: [], rowsAffected: 0, insertId: null } }; }); },
    'nhk.executePrimaryCommand': function () { return {}; },
    'nhk.closeConnection': function () { return {}; },
    'nhk.pairings': function () { return { activeUsers: [], waitingUsers: [] }; },
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
    'Nx.version': function () { return 'nx-10'; },
    'Nx.logStream': function () { return { keep: true, none: true }; },
    'Nx.setHints': function () { return {}; },
    'Nx.release': function () { return {}; },
    'Nx.reconnect': function () { return {}; },
    'Nx.checkSucceeded': function () { return {}; },
    'Nx.checkFailed': function () { return {}; },
    'Nx.netState': function () { return CFG.net || { version: 'nx-10', sdk: 37, wifi: true, ssid: 'HomeWifi', ip: '192.168.1.172', validated: true, cellular: false, vpn: false, module: false, defaultType: 'wifi', route: 'local', routeAgeSeconds: 4 }; },
    'Nx.probe': function () { return CFG.probe || { ok: true, tcpMs: 14, tlsMs: 380, bound: true, cloud: { ok: true, dns: '63.182.6.157', dnsMs: 12, tcpMs: 20 } }; }
  };
  window._cordovaNative = {
    exec: function (secret, service, action, callbackId, argsJson) {
      var key = service + '.' + action, args = [];
      try { args = JSON.parse(argsJson); } catch (e) {}
      log.push(key);
      var h = NATIVE[key];
      setTimeout(function () {
        try {
          if (!h) { if (window.cordova) cordova.callbackFromNative(callbackId, true, 1, [], false); return; }
          var r = h(args);
          if (r && r.none) return;               // stays open (events)
          if (r && r.fail) { cordova.callbackFromNative(callbackId, false, 2, [r.fail], false); return; }
          cordova.callbackFromNative(callbackId, true, 1, [r], false);
        } catch (e) { console.log('shim-error ' + key + ' ' + e); }
      }, 0);
      return '';
    },
    setNativeToJsBridgeMode: function () {},
    retrieveJsMessages: function () { return ''; }
  };
  window.__NATIVE = NATIVE;
})();
