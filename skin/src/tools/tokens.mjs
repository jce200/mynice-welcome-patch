// Prints the Material 3 color roles for a seed color, as CSS or (4th argument `json`) as JSON, to compare variants:
//   node tokens.bundle.mjs '#3A6FF7' expressive|tonal|vibrant [json]   (bundle it with esbuild first, see build-tokens.mjs)
import { argbFromHex, hexFromArgb, Hct, SchemeExpressive, SchemeTonalSpot, SchemeVibrant, MaterialDynamicColors, DynamicScheme } from '@material/material-color-utilities';
const seed = process.argv[2] || '#3A6FF7';
const variant = (process.argv[3] || 'expressive').toLowerCase();
const Cls = { expressive: SchemeExpressive, tonal: SchemeTonalSpot, vibrant: SchemeVibrant }[variant];
const roles = ['primary','onPrimary','primaryContainer','onPrimaryContainer','secondary','onSecondary','secondaryContainer','onSecondaryContainer','tertiary','onTertiary','tertiaryContainer','onTertiaryContainer','error','onError','errorContainer','onErrorContainer','background','onBackground','surface','onSurface','surfaceVariant','onSurfaceVariant','outline','outlineVariant','surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow','surfaceContainer','surfaceContainerHigh','surfaceContainerHighest','inverseSurface','inverseOnSurface','inversePrimary','scrim','shadow','primaryFixed','onPrimaryFixed','secondaryFixed','tertiaryFixed'];
const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
function makeScheme(isDark) {
  const sch = new Cls(Hct.fromInt(argbFromHex(seed)), isDark, 0.0);
  const out = {};
  for (const r of roles) { const dc = MaterialDynamicColors[r]; if (dc) out[r] = hexFromArgb(dc.getArgb(sch)); }
  return out;
}
const light = makeScheme(false), dark = makeScheme(true);
if (process.argv[4] === 'json') { console.log(JSON.stringify({ light, dark }, null, 1)); }
else {
  const css = (o) => Object.entries(o).map(([k, v]) => `  --md-sys-color-${kebab(k)}: ${v};`).join('\n');
  console.log(`/* seed ${seed}, variant ${variant} */\n:root {\n${css(light)}\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n${css(dark).replace(/^/gm, '  ')}\n  }\n}`);
}
