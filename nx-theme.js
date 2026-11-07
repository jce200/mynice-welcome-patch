/* nx-theme.js: the theme the user chose (Settings > Theme), applied before the first paint so that the app does not flash in the
 * wrong colors. It runs in <head>, before the stylesheets. "light" and "dark" put data-nx-theme on <html>, which the color tokens
 * of nx-expressive.css answer to; "auto" (or nothing saved, or storage that cannot be read) sets nothing, and then the WebView's
 * own prefers-color-scheme decides, as before. nx-patch.js changes the choice later on (the same key, the same attribute). */
(function () {
  try {
    var t = window.localStorage.getItem('nxTheme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-nx-theme', t);
  } catch (e) { /* no storage: no choice */ }
})();
