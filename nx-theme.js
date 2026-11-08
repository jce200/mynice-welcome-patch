/* nx-theme.js: the theme and the colors the user chose (Settings > Appearance), applied before the first paint so that the app does not
 * flash in the wrong colors. It runs in <head>, before the stylesheets. "light" and "dark" put data-nx-theme on <html>, which the color
 * tokens of nx-expressive.css answer to; "auto" (or nothing saved, or storage that cannot be read) sets nothing, and then the WebView's
 * own prefers-color-scheme decides, as before. The same for the palette (nx21): one of the names below puts data-nx-palette on <html>;
 * the first palette, "midnight", is what the tokens have without it, so it is never set. The names are those of PALETTES in nx-patch.js
 * and of the palettes in tokens.css (test/skin.test.js checks that they agree). nx-patch.js changes the choices later on (the same keys,
 * the same attributes). */
(function () {
  try {
    var t = window.localStorage.getItem('nxTheme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-nx-theme', t);
  } catch (e) { /* no storage: no choice */ }
  try {
    var p = window.localStorage.getItem('nxPalette');
    if (/^(nice|graphite|paper|violet|pine|ember)$/.test(p)) document.documentElement.setAttribute('data-nx-palette', p);
  } catch (e) { /* no storage: the default palette */ }
})();
