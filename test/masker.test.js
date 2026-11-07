// Test of the masking in debuglog.js. The secrets below are made up; the LINES have the shape of real log lines.
var mask = require('../debuglog.js').mask;
var SECRETS = ['Password123x', 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/abcdEFGH=', '12345678', 'zzFCMtok123:APA91bMadeUpTokenMadeUpTokenMadeUpToken'];
var cases = [
  // [name, line, must disappear (list), must stay (list)]
  ['JSON home', 'scene getHome:  {"homeId":1,"networkSsid":"HomeWifi","networkPassword":"Password123x","devices":[{"mac":"00:0B:6C:AA:BB:CC","setupCode":"12345678","pairingUsername":"homeuser","pairingPassword":"aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/abcdEFGH="}]}',
    [SECRETS[0], SECRETS[1], SECRETS[2]], ['HomeWifi', '00:0B:6C:AA:BB:CC', 'homeuser']],
  ['connect line', '############ connect[00:0B:6C:AA:BB:CC] user: homeuser, password: aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/abcdEFGH=',
    [SECRETS[1]], ['user: homeuser', '00:0B:6C:AA:BB:CC']],
  ['data object', '$scope.data: {"config":"NHK","ssid":"HomeWifi","password":"Password123x","sec":"WPA2_MIXED_PSK","name":"NiceIT4WIFIAABBCC"}',
    [SECRETS[0]], ['HomeWifi', 'WPA2_MIXED_PSK', 'NiceIT4WIFIAABBCC']],
  ['plain text line setup.networkPassword', 'AddDeviceSettingsCtrl goToStepAddDevice setup.networkPassword: Password123x',
    [SECRETS[0]], ['setup.networkPassword']],
  ['setupcode line', '1goToStepDeviceSetupFinish - setupcode:  12345678', [SECRETS[2]], ['setupcode']],
  ['setup finish result', 'goToStepDeviceSetupFinish result {"userId":"1","password":"aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789+/abcdEFGH="}',
    [SECRETS[1]], ['"userId":"1"']],
  ['FCM token in text', 'PUSH registration: 0123456789abcdef token zzFCMtok123:APA91bMadeUpTokenMadeUpTokenMadeUpToken',
    [SECRETS[3]], ['PUSH registration: 0123456789abcdef']],
  ['FCM token in JSON params', 'ERROR registerToken ON IT4WIFI {"data":null,"status":-1,"config":{"params":{"token":"zzFCMtok123:APA91bMadeUpTokenMadeUpTokenMadeUpToken","udid":"0123456789abcdef","platform":"Android"}}}',
    [SECRETS[3]], ['"udid":"0123456789abcdef"', '"status":-1']],
  ['double-stringified JSON', 'x {"a":"{\\"password\\":\\"Password123x\\",\\"b\\":1}"}', [SECRETS[0]], ['b']],
  ['setup in config line', 'AddDeviceSettingsCtrl goToStepAddDevice setup.networkPassword: Password123x setup.deviceConfig: NHK',
    [SECRETS[0]], ['setup.deviceConfig: NHK']],
  // things that must NOT be masked
  ['SSID stays', 'listWiFiNetworksHandler EachWiFiNetworkHandler {"level":-38,"SSID":"NiceIT4WIFIAABBCC","BSSID":"00:0b:6c:aa:bb:cc"}', [], ['NiceIT4WIFIAABBCC', '00:0b:6c:aa:bb:cc']],
  ['plain text stays', 'Network Failure: WIFI_MISMATCH current="NiceIT4WIFIAABBCC" requested="HomeWifi"', [], ['WIFI_MISMATCH', 'HomeWifi']],
  ['the word password without a value', 'errore password necessaria', [], ['errore password necessaria']]
];
var failures = 0;
cases.forEach(function (g) {
  var m = mask(g[1]);
  var problems = [];
  g[2].forEach(function (s) { if (m.indexOf(s) !== -1) problems.push('LEAKS: ' + s.slice(0, 12) + '…'); });
  g[3].forEach(function (s) { if (m.indexOf(s) === -1) problems.push('MISSING: ' + s); });
  console.log((problems.length ? 'FAIL  ' : 'ok    ') + g[0] + (problems.length ? '  ' + problems.join(' | ') + '\n        -> ' + m : ''));
  if (problems.length) failures++;
});
console.log(failures ? failures + ' FAILED' : 'ALL OK');
process.exit(failures ? 1 : 0);
