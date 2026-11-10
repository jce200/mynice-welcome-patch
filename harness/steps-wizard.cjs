// SCRIPT=steps-wizard.cjs: the waits, the failures and the pairing pages of the setup wizard (nx23, workstream "Setup wizard").
// WZ is a comma separated list of what to show; every item writes one screenshot with its name into the folder you gave screens.cjs:
//   wait-search wait-identify wait-configure wait-request wait-detect   the full-screen waits exactly as the controllers start them (showLoadingAction); the "taking long" lines of
//                                                                        identify and configure come after 20 s and 60 s; here after 1.5 s (WZLATE=ms for another time): wait-identify-late, wait-configure-late
//   notfound            the real path: "Turn on the accessory" > Next > the scan finds no accessory network > the popup (CFG '{"scan":"none"}'; WZLOC=off switches Location off and a "net" in the
//                       CFG with "vpn":true / "cellular":true adds those, to see the lines that only appear when they are true)
//   wifi-timeout        the alert after a configuration that timed out (the app's ERR_TIMEOUT_RETRY, shown on the configuration page)
//   wifi-unavailable    the alert when Android's Connect dialog was canceled (with its Technical details opened: wifi-unavailable-details); network-error: the general network error
//   maxusers            the real path of a full accessory: "Log on to the accessory" > Next > verify answers 11 (first run, and the Settings variant with WZ=maxusers-tabs)
//   measure             the size of every control on the wizard pages (hit areas) as JSON lines
// Examples:  CFG='{"firstRun":true}' VIEW=360x640 SCRIPT=steps-wizard.cjs WZ=wait-identify,wait-configure node screens.cjs wizard-x '#/start-email'
const M = '00:0B:6C:AA:BB:CC';

const ROUTES = ['#/start-email', '#/start-home', '#/start-add-device/', '#/benvenuto/1', '#/rete-wifi', '#/accendi-dispositivo', '#/bridge-rilevati', '#/bridge-individuato',
  '#/configura-bridge', '#/connettiti-al-bridge', '#/start-add-device-setup-code/1', '#/start-add-device-setup-name', '#/start-add-device-setup-finish/1/' + M, '#/start-user-pairing-request',
  '#/start-user-pairing-max-user-reached', '#/start-user-pairing-requested', '#/tabs/settings-add-device/1', '#/tabs/settings-user-pairing-request/1'];

module.exports = async (page, { goto, wait, shot }) => {
  const want = (process.env.WZ || '').split(',').map((s) => s.trim()).filter(Boolean);
  const late = process.env.WZLATE ? Number(process.env.WZLATE) : 0;
  const inj = (fn) => page.evaluate(fn);
  const waitFor = (kind, title, text, duration) => page.evaluate(([k, d]) => {
    const inj = angular.element(document.body).injector(), rs = inj.get('$rootScope'), t = inj.get('$translate');
    window.__nxWzLateMs = d.late || 1500;
    const args = {
      search: [t.instant('BRIDGE_SEARCH_TITLE'), false, 60000, t.instant('BRIDGE_SEARCH_TEXT')],
      identify: [t.instant('BRIDGE_SEARCH_TITLE_SINGLE'), false, 60000, t.instant('BRIDGE_SEARCH_TEXT_SINGLE')],
      configure: [t.instant('CONFIGURAZIONE'), false, 150000, t.instant('COLL_WIFI_BRIDGE')],
      request: [t.instant('DEVICE_USERS_ASSOCIATION_STATUS_WAITING'), false, 300000],
      detect: [t.instant('ONGOING_DETECTION'), false, 300000]
    }[k];
    rs.showLoadingAction.apply(rs, args);
  }, [kind, { late }]);

  for (const what of want) {
    if (/^wait-/.test(what)) {
      const kind = what.slice(5);
      // behind the overlay: the page where the controller starts it (the first run is a Settings route only when the accessory exists; both look alike)
      const page0 = { search: '#/accendi-dispositivo', identify: '#/bridge-rilevati', configure: '#/configura-bridge', request: '#/start-user-pairing-request', detect: '#/start-add-device/' }[kind];
      await goto(page0, 1400);
      await waitFor(kind);
      await wait(900);
      await shot(what);                                           // right after it started
      if (kind === 'identify' || kind === 'configure') {          // the line that comes when it takes long (WZLATE ms after the start; 1500 by default here, in the app 20 s and 60 s)
        await wait((late || 1500) + 900 - 900);
        await shot(what + '-late');
      }
      await page.evaluate(() => { const rs = angular.element(document.body).injector().get('$rootScope'); rs.hideLoadingAction(); });
      await wait(500);
    } else if (what === 'notfound') {
      await goto('#/start-add-device/', 1600);                    // the page before stores the name of the home Wi-Fi, which the page "Turn on the accessory" needs to show Next
      if (process.env.WZLOC === 'off') await page.evaluate(() => { window.__NATIVE['WifiWizard.isLocalizationEnabled'] = () => '0'; });   // Location is switched off only now (the Add accessory page would stop at once)
      await goto('#/accendi-dispositivo', 1500);
      await page.locator('.nav-bar-block[nav-bar="active"] .button', { hasText: 'Next' }).first().tap();
      await wait(600);
      await shot('notfound-1-search');
      await page.evaluate(() => window.dispatchEvent(new Event('WiFiScanCompleted')));       // what the native layer sends when the scan is ready
      await wait(4200);                                                                      // the app waits 3 s after the results before it decides
      await shot('notfound');
      console.log('popup:', JSON.stringify(await page.evaluate(() => (document.querySelector('.popup-body') || {}).textContent)));
      await page.locator('.popup-buttons .button').first().tap();                            // Close
      await wait(500);
    } else if (what === 'wifi-timeout') {
      await goto('#/configura-bridge', 1500);
      await page.evaluate(() => {
        const inj = angular.element(document.body).injector();
        window.showAlert(inj.get('$ionicPopup'), inj.get('$translate').instant('ALERT_TITLE_WARNING'), inj.get('$translate').instant('ERR_TIMEOUT_RETRY'));
      });
      await wait(900);
      await shot('wifi-timeout');
      console.log('alert:', JSON.stringify(await page.evaluate(() => (document.querySelector('.popup-body') || {}).textContent)));
      await page.locator('.popup-buttons .button').first().tap();                            // OK: the next step of the same run must not find the popup in the way
      await wait(500);
    } else if (what === 'wifi-unavailable' || what === 'network-error') {
      // the alerts of the Wi-Fi steps (failNetwork of the app): the Connect dialog of Android was canceled / an error that is not one of the known ones (with the lines about Location, VPN, mobile data
      // when they are true: CFG with a "net" and WZLOC=off, as for notfound)
      await goto('#/start-add-device/', 1600);
      if (process.env.WZLOC === 'off') await page.evaluate(() => { window.__NATIVE['WifiWizard.isLocalizationEnabled'] = () => '0'; });
      await goto('#/bridge-rilevati', 1400);
      // the phone's facts (VPN, mobile data, Location) are read when a wait starts, as in the real flow: the search or the identification comes before such an error
      await page.evaluate(() => { const inj = angular.element(document.body).injector(), rs = inj.get('$rootScope'), t = inj.get('$translate'); rs.showLoadingAction(t.instant('BRIDGE_SEARCH_TITLE_SINGLE'), false, 60000, t.instant('BRIDGE_SEARCH_TEXT_SINGLE')); });
      await wait(500);
      await page.evaluate(() => angular.element(document.body).injector().get('$rootScope').hideLoadingAction());
      await wait(400);
      await page.evaluate((k) => {
        const inj = angular.element(document.body).injector(), t = inj.get('$translate');
        window.showAlert(inj.get('$ionicPopup'), t.instant('ALERT_TITLE_WARNING'), window.__nxMsg(k === 'wifi-unavailable' ? 'WIFI_UNAVAILABLE' : 'something else', t.instant('ADD_NEW_DEVICE_MSG_NETWORK_ERROR')));
      }, what);
      await wait(900);
      await shot(what);
      if (what === 'wifi-unavailable') { await page.locator('.popup-body summary').first().tap(); await wait(500); await shot(what + '-details'); }
      await page.locator('.popup-buttons .button').first().tap();
      await wait(500);
    } else if (/^maxusers/.test(what)) {
      const tabs = what === 'maxusers-tabs';
      // the controller of "Log on to the accessory" takes the accessory from the setup when it starts: prime it first, then go there
      await goto(tabs ? '#/tabs/settings' : '#/start-email', 1200);
      await page.evaluate(() => {
        const SS = angular.element(document.body).injector().get('SetupService'), setup = SS.getSetup();
        setup.device = { name: 'NiceIT4WIFIAABBCC', description: 'AABBCC', mac: '00:0B:6C:AA:BB:CC', address: '192.168.1.72', port: 443 };
        setup.userEmail = 'homeuser'; setup.homeId = 1; SS.updateSetup(setup);
      });
      await goto(tabs ? '#/tabs/settings-connettiti-al-bridge/1' : '#/connettiti-al-bridge', 1400);
      await shot(what + '-1-logon');
      await page.evaluate(() => { window.__verifyCode = 11; });                              // the simulated accessory answers "full" (code 11) to the verify of the wizard
      await page.locator('.nav-bar-block[nav-bar="active"] .button', { hasText: 'Next' }).first().tap();
      await wait(1800);
      await page.evaluate(() => { window.__verifyCode = 0; });
      await shot(what);
      console.log(what + ': hash', await page.evaluate(() => location.hash), '| heading:', JSON.stringify(await page.evaluate(() => { const h = document.querySelector('ion-view[nav-view="active"] h2'); return h && h.textContent; })));
    } else if (what === 'measure') {
      for (const r of ROUTES) {
        await goto(r, 1300);
        const small = await page.evaluate(() => {
          const out = [], seen = new Set();
          const sel = 'button, a, [ng-click], [data-ng-click], input:not([type=hidden]), .item-radio, ion-checkbox, .checkbox, .photo_button, .item.item-button, ion-radio, label.item-input';
          document.querySelectorAll('ion-view[nav-view="active"] ' + sel + ', .bar ' + sel).forEach((e) => {
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
            if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none' || e.closest('.ng-hide, .nav-bar-block[nav-bar="cached"], .nav-bar-block[nav-bar="stage"]')) return;
            if (seen.has(e)) return;
            seen.add(e);
            out.push({ tag: e.tagName.toLowerCase(), cls: (e.className || '').toString().replace(/\s*ng-[a-z-]+/g, '').slice(0, 44), text: (e.textContent || e.placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) });
          });
          return out;
        });
        console.log('measure', r, JSON.stringify(small.filter((x) => Math.min(x.w, x.h) < 48)));
      }
    }
  }
};
