// Generates tokens.css: the color roles (Material 3, light and dark) of the palettes of the app, plus the custom "ok" and "warning" families, plus
// the spring curves as CSS linear() (Material 3 Expressive: spatial and effects).
// Run:  npm install && npm run build:tokens   (esbuild bundles it first: the ESM build of the color package has no file extensions,
//        so plain `node build-tokens.mjs` fails with ERR_MODULE_NOT_FOUND). Then run build-css.py in the folder above.
//
// THE PALETTES are not generated from one seed color any more (nx11 to nx20 used the Material scheme "tonal spot" with seed #1E6A8A: a grayish petrol,
// a deep red for everything that is wrong, and the dark surfaces with a green cast). Each palette is a few tonal palettes, each one a hue and a chroma
// (the amount of color), and Material's own tone logic does the rest, so that the pairs of text and background keep their contrast (test/skin.test.js checks it):
//   pri, sec, ter   the primary, secondary and tertiary palette: [hue, chroma]
//   nL, nD          the neutral palette that the surfaces come from, in the light and in the dark theme; vL, vD: the neutral variant (outlines, variant surfaces)
//   soft            [hue, chroma] of the error container in the dark theme. Material's is a saturated deep red (#93000A) that dominates every screen that has a Stop
//                   button or a red chip; this one is a wine red (hue 14, chroma 52, tone 24), which keeps its depth without shouting
//   ok, warn        [hue, chroma] of the green and the amber of the status colors (the state of the gate, the chips)
// The first palette is the one on :root (the default); the others answer to data-nx-palette on <html> (Settings > Appearance > Colors: nx-patch.js, nx-theme.js).
// To add a palette: add it here, add its name to PALETTES in nx-patch.js and to the pattern in nx-theme.js, and a swatch rule in skin.css (test/skin.test.js says what is missing).
import { hexFromArgb, Hct, DynamicScheme, TonalPalette, Variant, MaterialDynamicColors } from '@material/material-color-utilities';

const PALETTES = {
  // the blue of the logo of Nice (hue 257), with dark surfaces that have a navy tint and a vivid but not electric primary
  midnight: { label: 'Midnight', pri: [262, 62], sec: [262, 20], ter: [232, 28], nL: [262, 6], nD: [264, 14], vL: [262, 9], vD: [264, 16], soft: [14, 52], ok: [158, 40], warn: [84, 56] },
  // the same blue, with neutral surfaces: charcoal in the dark theme
  nice: { label: 'Nice blue', pri: [257, 52], sec: [257, 15], ter: [212, 26], nL: [257, 4], nD: [257, 6], vL: [257, 8], vD: [257, 9], soft: [14, 50], ok: [152, 38], warn: [82, 56] },
  // gray surfaces without a tint, one vivid azure
  graphite: { label: 'Graphite', pri: [258, 76], sec: [258, 9], ter: [258, 22], nL: [250, 1], nD: [250, 2], vL: [250, 3], vD: [250, 4], soft: [12, 46], ok: [152, 38], warn: [82, 56] },
  // warm paper and a blue accent
  paper: { label: 'Paper', pri: [255, 50], sec: [255, 14], ter: [38, 34], nL: [80, 6], nD: [75, 2.5], vL: [80, 10], vD: [75, 6], soft: [14, 48], ok: [150, 36], warn: [84, 54] },
  violet: { label: 'Violet', pri: [296, 46], sec: [296, 14], ter: [350, 30], nL: [300, 5], nD: [300, 6], vL: [300, 9], vD: [300, 10], soft: [8, 48], ok: [152, 36], warn: [82, 54] },
  // deep green-teal (a gate in a garden); its green status color is a little yellower than its primary, so that "online" is not the same green as a button
  pine: { label: 'Pine', pri: [172, 34], sec: [172, 13], ter: [215, 24], nL: [172, 4], nD: [172, 5], vL: [172, 7], vD: [172, 8], soft: [14, 50], ok: [135, 40], warn: [84, 56] },
  // terracotta
  ember: { label: 'Ember', pri: [38, 52], sec: [38, 16], ter: [100, 28], nL: [60, 5], nD: [50, 4], vL: [60, 9], vD: [50, 8], soft: [14, 50], ok: [150, 36], warn: [96, 56] },
};
const args = {};
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args[process.argv[i].slice(2)] = process.argv[++i];
// To try one palette without touching the file:  node build-tokens.bundle.mjs --only ember   (the palette is then the only one, on :root)
if (args.only && !PALETTES[args.only]) throw new Error('unknown palette ' + args.only + ' (' + Object.keys(PALETTES).join(', ') + ')');
const NAMES = args.only ? [args.only] : Object.keys(PALETTES);
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const P = (h, c) => TonalPalette.fromHueAndChroma(h, c);
const roles = ['primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer', 'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant', 'outline', 'outlineVariant', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest',
  'inverseSurface', 'inverseOnSurface', 'inversePrimary', 'scrim'];

function scheme(spec, dark) {
  return new DynamicScheme({
    sourceColorHct: Hct.from(spec.pri[0], spec.pri[1], 40), variant: Variant.TONAL_SPOT, contrastLevel: 0, isDark: dark,
    primaryPalette: P(...spec.pri), secondaryPalette: P(...spec.sec), tertiaryPalette: P(...spec.ter),
    neutralPalette: P(...(dark ? spec.nD : spec.nL)), neutralVariantPalette: P(...(dark ? spec.vD : spec.vL)), errorPalette: P(25, 70),
  });
}
// custom families (green = ok, amber = warning): a tonal palette of their own, with the same tone logic as the primary
function family(hc, dark) {
  const [h, c] = hc;
  const s = new DynamicScheme({ sourceColorHct: Hct.from(h, c, 50), variant: Variant.TONAL_SPOT, contrastLevel: 0, isDark: dark,
    primaryPalette: P(h, c), secondaryPalette: P(h, 10), tertiaryPalette: P(h, 10), neutralPalette: P(h, 4), neutralVariantPalette: P(h, 6), errorPalette: P(25, 70) });
  const f = (n) => hexFromArgb(MaterialDynamicColors[n].getArgb(s));
  return { fam: f('primary'), onFam: f('onPrimary'), famContainer: f('primaryContainer'), onFamContainer: f('onPrimaryContainer') };
}
function colors(spec, dark) {
  const s = scheme(spec, dark), out = [];
  const set = (k, v) => out.push(`  --md-sys-color-${kebab(k)}: ${v};`);
  const soft = { errorContainer: hexFromArgb(P(spec.soft[0], spec.soft[1]).tone(24)), onErrorContainer: hexFromArgb(P(spec.soft[0], 30).tone(92)) };
  for (const r of roles) {
    // the error container: used for Stop, the red chip and the star of a gate that cannot be used. Light: a pale rose; dark: the wine red of `soft`
    if (dark && soft[r]) set(r, soft[r]);
    else if (!dark && r === 'errorContainer') set(r, hexFromArgb(P(25, 34).tone(92)));
    else set(r, hexFromArgb(MaterialDynamicColors[r].getArgb(s)));
  }
  for (const [name, hc] of [['ok', spec.ok], ['warn', spec.warn]]) {
    const f = family(hc, dark);
    out.push(`  --nx-${name}: ${f.fam};`, `  --nx-on-${name}: ${f.onFam};`, `  --nx-${name}-container: ${f.famContainer};`, `  --nx-on-${name}-container: ${f.onFamContainer};`);
  }
  // the wizard screens: Nice's light-gray icons sit on a dark "stage" or on a "brand" surface; both follow the palette
  out.push(`  --nx-brand: ${hexFromArgb(P(...spec.pri).tone(dark ? 48 : 36))};`, `  --nx-stage: ${hexFromArgb(P(...(dark ? spec.vD : spec.vL)).tone(dark ? 14 : 16))};`);
  return out.join('\n');
}
// the swatch of a palette in the settings: its primary color (light theme) against its dark surface
function swatch(name) {
  const spec = PALETTES[name], primary = hexFromArgb(MaterialDynamicColors.primary.getArgb(scheme(spec, false))), surface = hexFromArgb(MaterialDynamicColors.surface.getArgb(scheme(spec, true)));
  return `  --nx-swatch-${name}: linear-gradient(135deg, ${primary} 0 50%, ${surface} 50% 100%);`;
}
// spring as CSS linear(): x(t) for a damped spring with damping ratio z and natural frequency w; duration until |x-1| < 0.002
function spring(z, w, points = 40) {
  const x = (t) => { const wd = w * Math.sqrt(1 - z * z); return z < 1 ? 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t)) : 1 - Math.exp(-w * t) * (1 + w * t); };
  let T = 0.05; while (T < 3) { let ok = true; for (let t = T; t < T + 0.3; t += 0.01) if (Math.abs(x(t) - 1) > 0.002) { ok = false; break; } if (ok) break; T += 0.01; }
  const parts = []; for (let i = 0; i <= points; i++) { const t = (i / points) * T; parts.push(+x(t).toFixed(4)); }
  parts[parts.length - 1] = 1;
  return { ms: Math.round(T * 1000), linear: 'linear(' + parts.join(', ') + ')' };
}
const spatialFast = spring(0.82, 34), spatialDefault = spring(0.8, 24), spatialSlow = spring(0.85, 15), bouncy = spring(0.55, 26), effects = spring(1.0, 36);
const indent = (text, pad) => text.replace(/^/gm, pad);
const first = NAMES[0];
let css = `/* Generated by build-tokens.mjs: ${NAMES.length} palettes (${NAMES.map((n) => n + (n === first ? ', the default' : '')).join('; ')}). Do not edit by hand. */
:root {
${colors(PALETTES[first], false)}
${NAMES.map(swatch).join('\n')}
  --nx-spring-fast: ${spatialFast.linear};   --nx-spring-fast-ms: ${spatialFast.ms}ms;
  --nx-spring: ${spatialDefault.linear};   --nx-spring-ms: ${spatialDefault.ms}ms;
  --nx-spring-slow: ${spatialSlow.linear};   --nx-spring-slow-ms: ${spatialSlow.ms}ms;
  --nx-spring-bouncy: ${bouncy.linear};   --nx-spring-bouncy-ms: ${bouncy.ms}ms;
  --nx-effects: ${effects.linear};   --nx-effects-ms: ${effects.ms}ms;
}
/* Dark follows the phone (what the WebView reports as prefers-color-scheme) unless the user chose a theme: nx-theme.js and
   nx-patch.js put data-nx-theme="light" or "dark" on <html> (Settings > Appearance > Theme); "auto" sets nothing. */
@media (prefers-color-scheme: dark) {
  :root:not([data-nx-theme="light"]) {
${indent(colors(PALETTES[first], true), '  ')}
  }
}
:root[data-nx-theme="dark"] {
${colors(PALETTES[first], true)}
}
`;
// the other palettes: data-nx-palette on <html> (Settings > Appearance > Colors). Every one has its three blocks, each more specific than any block above,
// so the order of the blocks does not matter
for (const name of NAMES.slice(1)) {
  css += `/* ${PALETTES[name].label} */
:root[data-nx-palette="${name}"] {
${colors(PALETTES[name], false)}
}
@media (prefers-color-scheme: dark) {
  :root[data-nx-palette="${name}"]:not([data-nx-theme="light"]) {
${indent(colors(PALETTES[name], true), '  ')}
  }
}
:root[data-nx-palette="${name}"][data-nx-theme="dark"] {
${colors(PALETTES[name], true)}
}
`;
}
console.log(css);
