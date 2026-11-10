// nx23 qa (gate + command): contrast of the colours of the accessory screen in all seven palettes, light and dark (tokens read from the live page).
//   VIEW=360x640 SCRIPT=steps-qa-gate-contrast.cjs node screens.cjs qa-gate-contrast '#/tabs/favorites'
module.exports = async (page, { goto }) => {
  await goto('#/tabs/favorites-device-detail/1/00:0B:6C:AA:BB:CC', 2500);
  const res = await page.evaluate(() => {
    const root = document.documentElement, pals = ['midnight', 'nice', 'graphite', 'paper', 'violet', 'pine', 'ember'];
    const v = (n) => getComputedStyle(root).getPropertyValue(n).trim();
    const parse = (c) => { c = c.trim(); if (c[0] === '#') { if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return { r: parseInt(c.slice(1, 3), 16), g: parseInt(c.slice(3, 5), 16), b: parseInt(c.slice(5, 7), 16) }; } const m = c.match(/rgba?\(([^)]+)\)/); const p = m[1].split(',').map(parseFloat); return { r: p[0], g: p[1], b: p[2] }; };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const x = lum(parse(a)), y = lum(parse(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const pairs = {
      'line busy/ok text (tertiary container)': ['--md-sys-color-tertiary-container', '--md-sys-color-on-tertiary-container', 4.5],
      'line warn text (warn container)': ['--nx-warn-container', '--nx-on-warn-container', 4.5],
      'line bad text (error container)': ['--md-sys-color-error-container', '--md-sys-color-on-error-container', 4.5],
      'action button in a busy/ok line (label on the line colour)': ['--md-sys-color-on-tertiary-container', '--md-sys-color-tertiary-container', 4.5],
      'action button in a warn line': ['--nx-on-warn-container', '--nx-warn-container', 4.5],
      'action button in a bad line': ['--md-sys-color-on-error-container', '--md-sys-color-error-container', 4.5],
      'Stop solid (on-error on error)': ['--md-sys-color-error', '--md-sys-color-on-error', 4.5],
      'Stop at rest (on-error-container on error-container)': ['--md-sys-color-error-container', '--md-sys-color-on-error-container', 4.5],
      'Stop rest outline (error on surface, non-text 3:1)': ['--md-sys-color-surface', '--md-sys-color-error', 3],
      'Stop solid on the surface (non-text 3:1)': ['--md-sys-color-surface', '--md-sys-color-error', 3],
      'Updated hh:mm / settled note (on-surface-variant on surface)': ['--md-sys-color-surface', '--md-sys-color-on-surface-variant', 4.5],
      'Gate state unknown (on-surface on surface) and its dashed outline (outline, non-text 3:1)': ['--md-sys-color-surface', '--md-sys-color-outline', 3],
      'Blocked pill (on-warn on warn container)': ['--nx-warn-container', '--nx-on-warn-container', 4.5],
      'Maybe blocked dashed outline (on-warn-container on surface, 3:1)': ['--md-sys-color-surface', '--nx-on-warn-container', 3],
    };
    const out = {}, worst = {};
    for (const theme of ['light', 'dark']) for (const p of pals) {
      root.setAttribute('data-nx-theme', theme); if (p === 'midnight') root.removeAttribute('data-nx-palette'); else root.setAttribute('data-nx-palette', p);
      for (const [name, [a, b, need]] of Object.entries(pairs)) {
        const r = ratio(v(a), v(b)); const w = worst[name] = worst[name] || { min: 99, at: '', need };
        if (r < w.min) { w.min = +r.toFixed(2); w.at = theme + '/' + p; }
      }
    }
    root.removeAttribute('data-nx-theme'); root.removeAttribute('data-nx-palette');
    return worst;
  });
  Object.entries(res).forEach(([k, w]) => console.log((w.min >= w.need ? 'ok    ' : 'FAIL  ') + k + ': worst ' + w.min + ':1 (' + w.at + '), needs ' + w.need));
};
