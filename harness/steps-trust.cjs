// SCRIPT=steps-trust.cjs  PART=A|B|C|D   (nx23 command: how far the state on the accessory screen can be trusted; I-02)
//
//   A  entering the screen: the stored state is shown while the accessory is asked ("checking"), then the answer replaces it ("live")
//   B  time passes without a report: "updated hh:mm" (aging), then "last confirmed hh:mm" with Refresh (stale); Refresh asks again
//   C  the same, but the log is read now and then (the accessory answers): it stays "aging" and never turns stale
//   D  the app comes back (Cordova "resume"): the app marks every accessory not reachable and checks again: no red "Not usable" and no red chip in between
//
// The status line is the layout workstream's element (.nx-line); this script injects a throwaway copy with the bindings of the contract (see steps-command.cjs).
//
// CFG for A:  '{"state":"closed","statusState":"open","statusDelay":3000}'
// CFG for B:  '{"trustTimes":{"StateFreshMs":3000,"StateStaleMs":7000},"activityTimes":{"PollMs":0,"PrefetchMs":100000000}}'
// CFG for C:  '{"trustTimes":{"StateFreshMs":3000,"StateStaleMs":7000},"activityTimes":{"PollMs":3000}}'
// CFG for D:  '{"sqliteBackup":true,"verifyDelay":2500,"statusDelay":3500,"state":"closed","statusState":"open"}'
// One process at a time: VIEW=360x640 COLOR_SCHEME=dark PART=A CFG='...' SCRIPT=steps-trust.cjs node screens.cjs command-trust-a '#/tabs/favorites'
const H = require('./steps-command.cjs').helpers;
const { activate, injectLine, state, rect, cmd, calls, hero, reporter, pads, DETAIL } = H;

const heroLook = (page) => page.evaluate(() => {
  const before = getComputedStyle(document.querySelector('.device-icon'), ':before'), icon = document.querySelector('.device-icon');
  const word = Array.from(document.querySelectorAll('.device-info .nx-state strong span')).find((e) => e.getBoundingClientRect().width > 0);
  const root = getComputedStyle(document.documentElement);
  const glyph = icon.querySelector('i');
  return { shapeAnim: before.animationName, playState: before.animationPlayState, iconOpacity: getComputedStyle(icon).opacity, glyphOpacity: glyph ? getComputedStyle(glyph).opacity : null, word: word ? getComputedStyle(word).color : null,
    onSurfaceVariant: root.getPropertyValue('--md-sys-color-on-surface-variant').trim(), chip: root.getPropertyValue('--nx-sub').replace(/^"|"$/g, '') };
});
// nx23 qa (gate): the look of Stop (solid error = may be needed; container + outline = confirmed rest only)
const stopLook = (page) => page.evaluate(() => { const a = Array.from(document.querySelectorAll('[nav-view="active"] .device-commands .command')).find((x) => /Stop/.test(x.textContent)), c = getComputedStyle(a), root = getComputedStyle(document.documentElement); return { solid: c.backgroundColor === 'rgb(' + root.getPropertyValue('--md-sys-color-error').trim().replace('#', '').match(/../g).map((h) => parseInt(h, 16)).join(', ') + ')', outline: c.boxShadow !== 'none' && /inset/.test(c.boxShadow) }; });
const rgb = (hex) => { const h = hex.replace('#', ''); return 'rgb(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')'; };

module.exports = async (page, { goto, wait, shot }) => {
  const part = String(process.env.PART || 'A').toUpperCase(), R = reporter(), seen = [];
  const st = async () => { const x = await state(page); if (x) seen.push(x); return x; };
  const stateCalls = () => calls(page, 'nhk.status');

  if (part === 'A') {
    await page.evaluate(() => { window.__t0 = Date.now(); });
    await goto(DETAIL, 100);
    await injectLine(page);
    await wait(500);
    const base = await pads(page);
    let s = await st(), look = await heroLook(page);
    R.check('0.7 s: the stored state "Closed" is still on screen, and the line says it is being checked', s.trust === 'checking' && s.kind === 'busy' && s.text === 'Checking the gate\u2026' && /Closed/.test(await hero(page)), [s, await hero(page)]);
    R.check('... the shape is the loading indicator, the word has the second-line colour (not a fading opacity), the picture lost weight',
      /m3e-morph/.test(look.shapeAnim) && look.word === rgb(look.onSurfaceVariant) && Number(look.glyphOpacity) < 1, look);
    await shot('a1-checking');
    await wait(3600);
    s = await st(); look = await heroLook(page);
    R.check('3.9 s: the answer is there: "Open", live, the line is empty', s.trust === 'live' && s.text === '' && /Open/.test(await hero(page)), [s, await hero(page)]);
    R.check('... the shape is at rest again, the picture has its weight back', !/m3e-morph/.test(look.shapeAnim) && Number(look.glyphOpacity) === 1, look);
    await shot('a2-live');
    const g = await pads(page);
    R.check('geometry: Open and Stop did not move between checking and live', Math.abs(g.open - base.open) <= 0.5 && Math.abs(g.stop - base.stop) <= 0.5, [base, g]);
  }

  if (part === 'B' || part === 'C') {
    await goto(DETAIL, 1500);
    await injectLine(page);
    await wait(300);
    const base = await pads(page);
    let s = await st();
    R.check('right after the answer: live, nothing in the line', s.trust === 'live' && s.text === '', s);
    R.check('... and Stop has its calm look (container + outline: the state is confirmed)', (await stopLook(page)).outline === true && (await stopLook(page)).solid === false, await stopLook(page));
    await wait(3700);   // StateFreshMs 3000
    s = await st();
    R.check('older than the fresh time: "Updated hh:mm" (aging), plain text, not announced (aria-live off)', s.trust === 'aging' && s.kind === '' && /^Updated \d\d:\d\d$/.test(s.text) && s.live === 'off', s);
    R.check('aging: Stop is solid (the state is not confirmed any more)', (await stopLook(page)).solid === true, await stopLook(page));
    await shot(part.toLowerCase() + '1-aging');
    if (part === 'B') {
      await wait(5000);   // StateStaleMs 7000 and nothing heard
      s = await st();
      const look = await heroLook(page), stop = await cmd(page, 'Stop');
      R.check('older than the stale time and nothing heard: "Last confirmed hh:mm" with Refresh (warn)', s.trust === 'stale' && s.kind === 'warn' && /^Last confirmed \d\d:\d\d$/.test(s.text) && s.act === 'Refresh', s);
      const ar = await rect(page, '.nx-line-act');
      R.check('Refresh is at least 48 x 48 dp with its hit area', ar && ar.h + 8 >= 48 && ar.w >= 48, ar);
      R.check('the shape stands still and fades, the word keeps the second-line colour', look.playState === 'paused' && Number(look.iconOpacity) < 1 && look.word === rgb(look.onSurfaceVariant), look);
      R.check('Stop is untouched: filter none, opacity 1, and solid', stop.filter === 'none' && stop.opacity === '1' && (await stopLook(page)).solid === true, [stop, await stopLook(page)]);
      await shot('b2-stale');
      const g = await pads(page);
      R.check('geometry: Open and Stop did not move', Math.abs(g.open - base.open) <= 0.5 && Math.abs(g.stop - base.stop) <= 0.5, [base, g]);
      const n0 = (await stateCalls()).length;
      await activate(page);
      await wait(700);
      s = await st();
      R.check('Refresh: one new request for the state, and it is live again', (await stateCalls()).length === n0 + 1 && s.trust === 'live' && s.text === '', [await stateCalls(), s]);
      await shot('b3-refreshed');
    } else {
      await wait(7000);   // the log is read every 3 s: the accessory answers, it only tells what changes
      s = await st();
      R.check('after 14 s with the log read every 3 s: still aging, never stale', s.trust === 'aging' && /^Updated \d\d:\d\d$/.test(s.text), s);
      const logs = (await calls(page, 'nhk.logs')).length;
      R.check('(the log was read ' + logs + ' times)', logs >= 3, logs);
    }
  }

  if (part === 'D') {
    await goto(DETAIL, 6500);
    await injectLine(page);
    await page.evaluate(() => {
      window.__NATIVE['nhk.info_nhk'] = function () { return { delay: 800, then: { interface: { description: 'IT4WIFI' }, devices: [{ type: 'sliding', primaryCommands: ['open', 'stop', 'close'], properties: [], schedules: [], secondaryCommands: [], services: [] }] } }; };
      window.__samples = [];
      const t0 = Date.now();
      window.__sampler = setInterval(() => {
        const l = document.querySelector('.nx-line');
        const row = document.querySelector('.device-info .nx-state');
        const vis = Array.from(row.querySelectorAll('strong')).filter((e) => !e.classList.contains('ng-hide')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join('/');
        const chip = document.documentElement.style.getPropertyValue('--nx-sub').replace(/^"|"$/g, '');
        const tx = l && l.querySelector('.nx-line-text');
        const key = vis + ' | ' + chip + ' | ' + (l ? l.getAttribute('data-nx-trust') + ' ' + (tx ? tx.textContent.trim() : '') : '');
        const s = window.__samples; if (!s.length || s[s.length - 1].key !== key) s.push({ t: Date.now() - t0, key });
      }, 40);
    });
    await page.evaluate(() => cordova.fireDocumentEvent('resume'));
    await wait(1000);
    await shot('d1-resume-1s');
    await wait(5500);
    const samples = await page.evaluate(() => window.__samples);
    console.log('samples (ms since resume):\n  ' + samples.map((x) => x.t + ' ms  ' + x.key).join('\n  '));
    R.check('no red "Not usable" while the app checks again', !samples.some((x) => /Not usable/.test(x.key)), samples);
    R.check('the chip never says "Accessory not reachable" meanwhile', !samples.some((x) => /not reachable/.test(x.key)), samples);
    R.check('it ends with the answer: "Open" and an online chip', /^Open\b.*\| Accessory online/.test(samples[samples.length - 1].key), samples[samples.length - 1]);
    R.check('the checking time was marked as such ("Checking…" on the screen, trust checking in the line)', samples.some((x) => /^Checking/.test(x.key) && /checking/.test(x.key.split('|')[2] || '')), samples);
    await shot('d2-after');
  }

  const tooBig = seen.filter((x) => !x.fits || x.lines > 2);
  R.check('every message fits the two lines of the reserved row at this width (' + seen.length + ' states seen)', tooBig.length === 0, tooBig.map((x) => x.text));
  R.done();
};
