// nx23 qa (gate): runs steps-command.cjs / steps-trust.cjs against the REAL status line of the merged build, with a monitor that watches every animation frame:
//   - the top of Open, Close and Stop and the height of .nx-line (the box must never change, Open must never move), over the whole life of the screen
//   - every change of the occupant of the line (kind, trust, unsure, aria-live, text, resting content, action) with its time and its colors
//
//   RUN=command|trust  PART=A|B|C|D  VIEW=360x640 COLOR_SCHEME=light|dark  CFG='...'  SCRIPT=steps-qa-run.cjs  node screens.cjs <folder> '#/tabs/favorites'
// Prints MONITOR {...} at the end (ranges and the list of occupants).
const which = process.env.RUN || 'command';
const mod = require('./steps-' + which + '.cjs');

const MONITOR = () => {
  if (window.__mon) return;
  const m = window.__mon = { frames: 0, t0: Date.now(), open: [1e9, -1e9], close: [1e9, -1e9], stop: [1e9, -1e9], line: [1e9, -1e9], seen: [], enterAt: 0, moves: [] };
  let prevKey = '', prevOpen = null;
  const rgb = (c) => c.replace(/\s+/g, '');
  function tick() {
    m.frames++;
    const act = document.querySelector('[nav-view="active"]');
    const dc = act && Array.from(act.querySelectorAll('.device-commands')).find((e) => e.getBoundingClientRect().height > 0);
    const line = dc && dc.closest('.row') && dc.closest('.row').querySelector(':scope > .nx-line');
    if (dc && line) {
      const cmds = Array.from(dc.querySelectorAll(':scope > .command'));
      const by = (k) => cmds.find((a) => a.querySelector('[translate$="_' + k + '"]'));
      const o = by('open'), c = by('close'), s = by('stop');
      if (o && c && s) {
        const t = Date.now() - m.t0, ot = o.getBoundingClientRect().top, ct = c.getBoundingClientRect().top, st = s.getBoundingClientRect().top, lh = line.getBoundingClientRect().height;
        if (!m.enterAt) m.enterAt = t;
        // the first 400 ms after the screen appears belong to Ionic's page transition and the first layout: not counted
        if (t - m.enterAt > 400) {
          m.open = [Math.min(m.open[0], ot), Math.max(m.open[1], ot)]; m.close = [Math.min(m.close[0], ct), Math.max(m.close[1], ct)];
          m.stop = [Math.min(m.stop[0], st), Math.max(m.stop[1], st)]; m.line = [Math.min(m.line[0], lh), Math.max(m.line[1], lh)];
          if (prevOpen !== null && Math.abs(ot - prevOpen) > 0.5 && m.moves.length < 20) m.moves.push({ t, from: prevOpen, to: ot });
        }
        prevOpen = ot;
        const tx = line.querySelector('.nx-line-text'), ac = line.querySelector('.nx-line-act'), rest = line.querySelector('.nx-pill, .nx-unknown, .nx-settled');
        const key = [line.getAttribute('data-nx-kind'), line.getAttribute('data-nx-trust'), line.getAttribute('data-nx-unsure'), line.getAttribute('aria-live'), tx ? tx.textContent.trim() : '', rest ? rest.className.split(' ')[0] + ':' + rest.textContent.replace(/\s+/g, ' ').trim() : '', ac ? ac.textContent.trim() : ''].join('|');
        if (key !== prevKey) {
          prevKey = key;
          const cs = getComputedStyle(line), stopCs = getComputedStyle(s);
          const txr = tx ? tx.getBoundingClientRect() : null;
          m.seen.push({ t, kind: line.getAttribute('data-nx-kind'), trust: line.getAttribute('data-nx-trust'), unsure: line.getAttribute('data-nx-unsure'), live: line.getAttribute('aria-live'), text: tx ? tx.textContent.trim() : '',
            rest: rest ? rest.className.split(' ')[0] + ':' + rest.textContent.replace(/\s+/g, ' ').trim() : '', act: ac ? ac.textContent.trim() : '', boxH: +lh.toFixed(1), textLines: txr ? Math.round(txr.height / 20) : 0,
            bg: rgb(cs.backgroundColor), fg: rgb(cs.color), stopBg: rgb(stopCs.backgroundColor), stopOutline: stopCs.boxShadow.slice(0, 40), open: +ot.toFixed(1), scrollOver: line.scrollHeight > line.clientHeight + 1 });
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
};

module.exports = async (page, h) => {
  await page.evaluate(MONITOR);
  await mod(page, h);
  const r = await page.evaluate(() => { const m = window.__mon; const rg = (a) => (a[0] > a[1] ? null : +(a[1] - a[0]).toFixed(2)); return { frames: m.frames, moved: { open: rg(m.open), close: rg(m.close), stop: rg(m.stop), lineHeight: rg(m.line) }, openRange: m.open, lineRange: m.line, moves: m.moves, seen: m.seen }; });
  console.log('MONITOR ' + JSON.stringify(r));
};
module.exports.helpers = mod.helpers;
