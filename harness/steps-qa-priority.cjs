// nx23 qa (gate + command): the occupants of the line in the REAL digest when several apply at once: Blocked pill / unknown / settled note against "aging" and "stale" and a command
//   CFG='{"activity":"blocked","state":"opening","trustTimes":{"StateFreshMs":4500,"StateStaleMs":7000},"activityTimes":{"PollMs":0}}' VIEW=360x640 SCRIPT=steps-qa-priority.cjs node screens.cjs qa-gate-prio '#/tabs/favorites'
//   (state "opening" with a Block 20 minutes ago in the log: the pill applies, and the note "Accessory says Opening; ..." would; PART=U: state "partial" = Gate state unknown + the pill)
const H = require('./steps-command.cjs').helpers;
const { activate, state, reporter, DETAIL, tapButton } = H;
module.exports = async (page, { goto, wait, shot }) => {
  const R = reporter(), seq = [];
  const snap = async (label) => { const s = await state(page); seq.push(label + ' -> ' + JSON.stringify({ kind: s.kind, trust: s.trust, text: s.text, rest: s.rest, act: s.act })); return s; };
  await page.evaluate(() => { window.__NATIVE['nhk.executePrimaryCommand'] = () => ({ delay: 1200, then: {} }); });
  await goto(DETAIL, 3600);          // the log has been read (2.5 s): the pill is there; the state was reported 3 s ago
  let s = await snap('3.6 s: live');
  R.check('live + a Blocked gate: the pill (the resting content), no text of the status line', s.trust === 'live' && s.kind === '' && s.text === '' && /^Blocked · since/.test(s.rest), s);
  await wait(1500);
  s = await snap('5 s: aging');
  R.check('aging (older than 4.5 s, the log was read): the pill stays, "Updated hh:mm" does not take its place (aging yields to what the screen knows by itself)', s.trust === 'aging' && /^Blocked/.test(s.rest) && s.text === '', s);
  await wait(7000);
  s = await snap('12 s: stale');
  R.check('stale (older than 7 s and nothing heard): "Last confirmed hh:mm" + Refresh replaces the pill', s.trust === 'stale' && /^Last (confirmed|report)/.test(s.text) && s.act === 'Refresh' && s.rest === '', s);
  await tapButton(page, /Open/);
  await wait(300);
  s = await snap('a tap on Open while stale');
  R.check('a command beats the trust line: "Sending Open…" (busy), no button', s.kind === 'busy' && s.text === 'Sending Open\u2026' && s.act === '', s);
  await wait(1200);
  s = await snap('the call came back');
  R.check('then "Open sent hh:mm:ss" (ok) over the stale line', s.kind === 'ok' && /^Open sent \d\d:\d\d:\d\d$/.test(s.text), s);
  await wait(9000);
  s = await snap('9 s later');
  console.log('SEQ\n  ' + seq.join('\n  '));
  R.done();
};
