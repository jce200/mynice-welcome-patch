// SCRIPT=steps-activity.cjs: the activity sheet in the real app. Opens the accessory screen, taps the line with the last command (a real tap: Ionic
// ignores a synthetic click), and takes the sheet from the top down: sheet-1 (what the user sees first), sheet-2 (the middle), sheet-3 (the bottom),
// tall (the whole sheet in one picture) and prints what it measured.
//
//   ACT=<scenario> VIEW=360x640 COLOR_SCHEME=dark WAIT=1500 SCRIPT=steps-activity.cjs node screens.cjs <folder> '#/tabs/favorites'
//
// ACT (default normal): normal (the made-up household log of 12 days, shim.js), short (the log begins 5 hours ago), thin (two commands), long (60 days,
// about 700 entries), obstr (an obstruction half an hour ago), trouble (Wi-Fi drops, a gate controller that is lost and an error in the last 24 hours),
// restart (the accessory restarted two hours ago). The states of the reading itself are CFG.activity of shim.js: none (empty log), error, slow, blocked,
// for example CFG='{"activity":"none"}' (the log of ACT is then not used).
// ACT_TAPS=<list>: what to tap in the sheet after the first pictures (a picture 'after-<name>' of each): all (Show all), less, scope (the other period),
// status (Open connection status), retry (Try again), or any selector.
// The data is made up. Times are relative to "now" so that "today" and "yesterday" mean what they say.
module.exports = async (page, { goto, wait, shot }) => {
  const M = '00:0B:6C:AA:BB:CC';
  const scenario = process.env.ACT || 'normal';
  const H = 3600000, D = 86400000;
  const ANNA = 'CTRL-ANNA-0001', BEN = 'CTRL-BEN-00002';
  // a log built relative to "now" (the browser and this script share the clock); as on a real accessory every command of a phone is followed within a
  // second by the same movement from the gate controller (busT4)
  function build(name, sample) {
    const now = Date.now();
    let n = 0;
    const dev = [], ifc = [];
    const add = (list, t, source, type) => { if (t <= now) list.push({ deviceId: list === dev ? '1' : '', source, type, time: t, idx: String(++n), id: String(n) }); };
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const at = (day, h, m, s) => midnight.getTime() - day * D + ((h * 60 + m) * 60 + (s || 0)) * 1000;
    const pair = (t, source, gap) => {
      add(dev, t, source, 'open'); add(dev, t + 1000, 'busT4', 'open');
      add(dev, t + (gap || 120) * 1000, source, 'close'); add(dev, t + (gap || 120) * 1000 + 1000, 'busT4', 'close');
    };
    if (name === 'short' || name === 'restart') {
      const start = name === 'short' ? now - 5 * H : now - 2 * H;
      add(ifc, start, 'boot', 'Power ON'); add(ifc, start + 30000, 'boot', 'T4 device not found'); add(ifc, start + 31000, 'boot', 'T4 device found');
      add(dev, start + 31000, 'busT4', 'stop');
      pair(now - (name === 'short' ? 3 * H : 100 * 60000) - 600000, ANNA); pair(now - 40 * 60000, BEN, 90);
      return { interfaceLogs: ifc, deviceLogs: dev };
    }
    if (name === 'thin') {
      add(ifc, now - 30 * H, 'boot', 'Power ON'); add(ifc, now - 30 * H + 30000, 'boot', 'T4 device found');
      pair(now - 9 * H, ANNA);
      return { interfaceLogs: ifc, deviceLogs: dev };
    }
    if (name === 'long') {
      add(ifc, at(60, 3, 0), 'boot', 'Power ON'); add(ifc, at(60, 3, 0, 30), 'boot', 'T4 device found');
      let seed = 7;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let day = 59; day >= 0; day--) {
        const dow = new Date(at(day, 12, 0)).getDay(), work = dow >= 1 && dow <= 5;
        if (work) { pair(at(day, 7, 20 + Math.floor(rnd() * 20)), ANNA); pair(at(day, 8, 5 + Math.floor(rnd() * 25)), BEN); pair(at(day, 17, 10 + Math.floor(rnd() * 50)), rnd() < 0.5 ? ANNA : BEN); }
        else { pair(at(day, 10, 5 + Math.floor(rnd() * 30)), BEN, 180); pair(at(day, 15, 20 + Math.floor(rnd() * 30)), 'busT4', 60); }
        add(dev, at(day, 22, 0), 'scheduler', 'close');
        if (rnd() < 0.15) add(ifc, at(day, 3, 14), '', 'wifi loss');
      }
      add(dev, at(20, 18, 2), 'busT4', 'obstruction');
      return { interfaceLogs: ifc, deviceLogs: dev };
    }
    // on top of the made-up household log of shim.js: things that happened in the last 24 hours
    const out = { interfaceLogs: sample.interfaceLogs.slice(), deviceLogs: sample.deviceLogs.slice() };
    const X = (list, t, source, type) => out[list].push({ deviceId: list === 'deviceLogs' ? '1' : '', source, type, time: t, idx: 'x' + (++n), id: 'x' + n });
    if (name === 'obstr') { X('deviceLogs', now - 30 * 60000, 'busT4', 'obstruction'); X('deviceLogs', now - 29 * 60000, ANNA, 'close'); }
    if (name === 'trouble') {
      X('interfaceLogs', now - 5 * H, '', 'wifi loss'); X('interfaceLogs', now - 5 * H + 20000, '', 'connect');
      X('interfaceLogs', now - 3 * H, '', 'wifi loss'); X('interfaceLogs', now - 3 * H + 40000, '', 'connect');
      X('interfaceLogs', now - 4 * H, '', 'T4 device not found'); X('interfaceLogs', now - 4 * H + 60000, '', 'T4 device found');
      X('interfaceLogs', now - 1 * H, '', 'error');
    }
    return out;
  }
  if (scenario !== 'normal' && !process.env.NOLOG) {
    const sample = await page.evaluate(() => window.__NATIVE['nhk.logs']());          // the log of shim.js (the made-up household)
    const log = build(scenario, sample && sample.deviceLogs ? sample : { interfaceLogs: [], deviceLogs: [] });
    await page.evaluate((l) => { window.__logsOverride = l; }, log);
  }

  await goto('#/tabs/favorites-device-detail/1/' + M, 3200);
  console.log('line:', JSON.stringify(await page.evaluate(() => (document.querySelector('.nx-last-text') || {}).textContent)));
  await shot('device');
  await page.locator('.nx-last').tap();
  await wait(Number(process.env.ACT_WAIT || 1800));
  const sheetState = () => page.evaluate(() => {
    const p = document.getElementById('nx-activity');
    return p ? { open: p.classList.contains('nx-open'), scrollHeight: p.scrollHeight, clientHeight: p.clientHeight } : null;
  });
  await shot('sheet-1');
  const scroll = (f) => page.evaluate((fr) => { const p = document.getElementById('nx-activity'); p.scrollTop = Math.round((p.scrollHeight - p.clientHeight) * fr); }, f);
  const first = await sheetState();
  if (first && first.scrollHeight > first.clientHeight + 4) {
    await scroll(0.45); await wait(300); await shot('sheet-2');
    await scroll(1); await wait(300); await shot('sheet-3');
    await scroll(0); await wait(200);
  }
  // what the sheet holds: the numbers that the review measured (height, where the answers are, whether the footer is pinned) and the texts
  const metrics = await page.evaluate(() => {
    const p = document.getElementById('nx-activity'), pb = p.getBoundingClientRect();
    const y = (el) => Math.round(el.getBoundingClientRect().top - pb.top + p.scrollTop);
    const footer = p.querySelector('.nx-footer'), fb = footer && footer.getBoundingClientRect();
    return {
      view: innerWidth + 'x' + innerHeight, scrollHeight: p.scrollHeight, clientHeight: p.clientHeight,
      footerGapToSheetBottom: fb ? Math.round(pb.bottom - fb.bottom) : null,       // 0: the footer is pinned to the bottom of the sheet
      sub: (document.getElementById('nx-act-sub') || {}).textContent,
      tiles: Array.from(p.querySelectorAll('.nx-tile')).map((t) => t.innerText.replace(/\n/g, ' / ') + ' [' + Math.round(t.getBoundingClientRect().height) + 'px]'),
      headings: Array.from(p.querySelectorAll('.nx-act-h')).map((h) => h.innerText.replace(/\n/g, ' · ') + ' @' + y(h)),
      who: Array.from(p.querySelectorAll('.nx-whos li')).map((l) => l.innerText.replace(/\n/g, ' ')),
      health: Array.from(p.querySelectorAll('.nx-fact')).map((l) => l.innerText.replace(/\n/g, ' / ')),
      rows: p.querySelectorAll('.nx-tl-row').length, bars: p.querySelectorAll('.nx-col').length,
      hscroll: p.scrollWidth > p.clientWidth + 1,
      firstScreen: { available: p.clientHeight - (footer ? footer.getBoundingClientRect().height : 0), firstTile: p.querySelector('.nx-tile') ? y(p.querySelector('.nx-tile')) : null,
        firstRow: p.querySelector('.nx-tl-row') ? y(p.querySelector('.nx-tl-row')) : null, firstBars: p.querySelector('.nx-bars') ? y(p.querySelector('.nx-bars')) : null },
    };
  });
  console.log('sheet:', JSON.stringify(metrics));
  // the whole sheet in one picture: a window that is tall enough (the sheet is at most 92 % of the height of the window)
  async function tall(name) {
    const st = await sheetState();
    if (!st || st.scrollHeight <= st.clientHeight + 4) return;
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.width, height: Math.ceil(st.scrollHeight / 0.92) + 60 });
    await wait(700);
    await page.locator('#nx-activity').screenshot({ path: require('path').join(__dirname, 'shots', process.argv[2], name + '.png') });
    await page.setViewportSize(vp);
    await wait(500);
  }
  if (process.env.ACT_TALL !== '0') await tall('tall');
  for (const tap of (process.env.ACT_TAPS || '').split(',').filter(Boolean)) {
    const sel = { all: '.nx-act-all', less: '.nx-act-less', scope: '.nx-scope button:not([aria-pressed="true"])', status: '.nx-act-status', retry: '.nx-act-retry' }[tap] || tap;
    const el = page.locator('#nx-activity ' + sel).first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      const top0 = await page.evaluate(() => document.getElementById('nx-activity').scrollTop);
      await el.tap(); await wait(900);
      console.log('tap ' + tap + ': scrollTop ' + top0 + ' -> ' + await page.evaluate(() => document.getElementById('nx-activity').scrollTop));
      await shot('after-' + tap);
    } else console.log('no such button:', tap);
  }
  if (process.env.ACT_TALL_AFTER) await tall('tall-after');
};
