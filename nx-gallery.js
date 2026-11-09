/* nx-gallery.js (nx22): Settings > Design. A reference page of Material 3 Expressive, built with the stylesheet of the app itself (nx-expressive.css): what you see here
 * is what the screens of the app are made of. Every part is a working example (press it, drag it, switch it) with the numbers of the official tokens under it and the class
 * names to use. It adds to the app only what it needs: one overlay on <body>, built the first time it is opened, and window.NxGallery.{open, close, isOpen}.
 * nx-patch.js offers $rootScope.nxGallery() to the Settings page (patch-17-gallery.py puts the row there).
 *
 * The principles of Material 3 Expressive, and where to see them:
 *   shape    corners that morph (buttons when pressed and selected, lists, the 35 shapes), and shapes as content (avatars, the hero of the accessory screen)
 *   size     five sizes of buttons, three widths of icon buttons, five heights of sliders
 *   motion   springs instead of curves: spatial (with overshoot) for what moves and changes shape, effects (without) for color and opacity
 *   color    seven palettes (dynamic color, tonal), light and dark
 *   type     the scale of M3 and the emphasized styles (one weight heavier)
 *
 * The sizes, shapes and motion are taken from the tokens of androidx.compose.material3 (Apache License 2.0), see NOTICE.md and skin/src/m3e.css.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------------------------------------------- what the page shows
  // the 35 shapes of MaterialShapes (skin/src/shapes.json, tools/build-shapes.py): the CSS has them as --nx-v-<id>
  var SHAPES = [['circle', 'Circle'], ['square', 'Square'], ['slanted', 'Slanted'], ['arch', 'Arch'], ['fan', 'Fan'], ['arrow', 'Arrow'], ['semicircle', 'Semicircle'],
    ['oval', 'Oval'], ['pill', 'Pill'], ['triangle', 'Triangle'], ['diamond', 'Diamond'], ['clamshell', 'Clamshell'], ['pentagon', 'Pentagon'], ['gem', 'Gem'],
    ['verysunny', 'Very sunny'], ['sunny', 'Sunny'], ['cookie4', 'Cookie 4'], ['cookie6', 'Cookie 6'], ['cookie7', 'Cookie 7'], ['cookie9', 'Cookie 9'],
    ['cookie12', 'Cookie 12'], ['ghostish', 'Ghostish'], ['clover4', 'Clover 4'], ['clover8', 'Clover 8'], ['burst', 'Burst'], ['softburst', 'Soft burst'],
    ['boom', 'Boom'], ['softboom', 'Soft boom'], ['flower', 'Flower'], ['puffy', 'Puffy'], ['puffydiamond', 'Puffy diamond'], ['pixelcircle', 'Pixel circle'],
    ['pixeltriangle', 'Pixel triangle'], ['bun', 'Bun'], ['heart', 'Heart']];
  // the six springs of the expressive motion scheme: [token, name, damping and stiffness], tokens.css has --nx-<token> and --nx-<token>-ms
  var SPRINGS = [['spatial-fast', 'Fast spatial', '0.6 / 800'], ['spatial', 'Default spatial', '0.8 / 380'], ['spatial-slow', 'Slow spatial', '0.8 / 200'],
    ['effects-fast', 'Fast effects', '1.0 / 3800'], ['effects', 'Default effects', '1.0 / 1600'], ['effects-slow', 'Slow effects', '1.0 / 800']];
  // the palettes of the skin (tokens.css, PALETTES in nx-patch.js, nx-theme.js)
  var PALETTES = [['midnight', 'Midnight'], ['nice', 'Nice blue'], ['graphite', 'Graphite'], ['paper', 'Paper'], ['violet', 'Violet'], ['pine', 'Pine'], ['ember', 'Ember']];
  // the type scale: [class, name, size/line, weight]
  var TYPES = [['display-l', 'Display', 'Display large', '57/64', 400], ['display-m', 'Display', 'Display medium', '45/52', 400], ['display-s', 'Display', 'Display small', '36/44', 400],
    ['headline-l', 'Headline', 'Headline large', '32/40', 400], ['headline-m', 'Headline', 'Headline medium', '28/36', 400], ['headline-s', 'Headline', 'Headline small', '24/32', 400],
    ['title-l', 'Title', 'Title large', '22/28', 400], ['title-m', 'Title', 'Title medium', '16/24', 500], ['title-s', 'Title', 'Title small', '14/20', 500],
    ['body-l', 'Body text', 'Body large', '16/24', 400], ['body-m', 'Body text', 'Body medium', '14/20', 400], ['body-s', 'Body text', 'Body small', '12/16', 400],
    ['label-l', 'Label', 'Label large', '14/20', 500], ['label-m', 'Label', 'Label medium', '12/16', 500], ['label-s', 'Label', 'Label small', '11/16', 500]];
  // the color roles: [role, on-role]
  var ROLES = [['primary', 'on-primary'], ['primary-container', 'on-primary-container'], ['secondary', 'on-secondary'], ['secondary-container', 'on-secondary-container'],
    ['tertiary', 'on-tertiary'], ['tertiary-container', 'on-tertiary-container'], ['error', 'on-error'], ['error-container', 'on-error-container'],
    ['surface', 'on-surface'], ['surface-container-low', 'on-surface'], ['surface-container', 'on-surface'], ['surface-container-high', 'on-surface'],
    ['surface-container-highest', 'on-surface'], ['inverse-surface', 'inverse-on-surface'], ['outline', 'surface'], ['outline-variant', 'on-surface']];
  // the parts of the page: [id, name]; the chips at the top jump to them
  var PARTS = [['shapes', 'Shapes'], ['motion', 'Motion'], ['buttons', 'Buttons'], ['icons', 'Icon buttons'], ['groups', 'Groups'], ['split', 'Split button'], ['fab', 'FAB'],
    ['progress', 'Loading'], ['sliders', 'Sliders'], ['switches', 'Switches, chips'], ['toolbars', 'Toolbars'], ['lists', 'Lists'], ['type', 'Type'], ['color', 'Color']];

  var root = document.documentElement;
  var panel = null, isOpen = false, built = false, timers = [];

  function log() { try { if (window.console && console.log) console.log.apply(console, ['[nx-gallery]'].concat([].slice.call(arguments))); } catch (e) { /* nothing */ } }

  // ---------------------------------------------------------------------------------------------------------------- small helpers for the DOM
  function h(tag, cls, attrs, kids) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (kids) {
      if (!Array.isArray(kids)) kids = [kids];
      for (var i = 0; i < kids.length; i++) if (kids[i] !== null && kids[i] !== undefined) e.appendChild(typeof kids[i] === 'string' ? document.createTextNode(kids[i]) : kids[i]);
    }
    return e;
  }
  function icon(name, size) { return h('i', 'm3e-i', { 'aria-hidden': 'true', style: '--i:var(--nx-i-' + name + ')' + (size ? ';--_icon:' + size + 'px' : '') }); }
  function btn(label, cls, iconName, attrs) {
    var a = { type: 'button' };
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    var b = h('button', 'm3e-btn ' + cls, a);
    if (iconName) b.appendChild(icon(iconName));
    if (label) b.appendChild(h('span', null, { text: label }));
    return b;
  }
  function ibtn(name, label, cls, attrs) {
    var a = { type: 'button', 'aria-label': label };
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    return h('button', 'm3e-icon-btn ' + cls, a, icon(name));
  }
  function on(el, type, fn) { el.addEventListener(type, fn); return el; }
  function later(fn, ms) { var t = setTimeout(fn, ms); timers.push(t); return t; }
  function css(name) { try { return getComputedStyle(root).getPropertyValue(name).trim(); } catch (e) { return ''; } }
  function selectedOf(el) { return el.getAttribute('aria-pressed') === 'true'; }
  // a toggle: aria-pressed flips, and the CSS morphs the corners and swaps the colors
  function toggle(el, fn) {
    return on(el, 'click', function () { var s = !selectedOf(el); el.setAttribute('aria-pressed', s ? 'true' : 'false'); if (fn) fn(s, el); });
  }
  // a group in which one button is selected (a connected button group as the new segmented button)
  function single(group, fn) {
    return on(group, 'click', function (e) {
      var t = e.target;
      while (t && t !== group && t.parentNode !== group) t = t.parentNode;
      if (!t || t === group) return;
      for (var i = 0; i < group.children.length; i++) group.children[i].setAttribute('aria-pressed', group.children[i] === t ? 'true' : 'false');
      if (fn) fn(t);
    });
  }

  // ---------------------------------------------------------------------------------------------------------------- structure of the page
  function section(id, title, blurb) {
    var s = h('section', 'nx-gal-sec', { id: 'nx-gal-' + id }, [h('h2', 'm3e-headline-s', { text: title }), h('p', 'nx-gal-blurb m3e-body-m', { text: blurb })]);
    s.add = function (name, spec, kids, cls) {
      var p = h('div', 'nx-gal-card' + (cls ? ' ' + cls : ''));
      if (name) p.appendChild(h('h3', 'nx-gal-name m3e-title-s', { text: name }));
      var row = h('div', 'nx-gal-row');
      (Array.isArray(kids) ? kids : [kids]).forEach(function (k) { if (k) row.appendChild(k); });
      p.appendChild(row);
      if (spec) p.appendChild(h('p', 'nx-gal-spec m3e-label-s', { text: spec }));
      s.appendChild(p);
      return row;
    };
    return s;
  }
  function item(el, caption) { return h('div', 'nx-gal-item', null, [el, caption ? h('small', 'm3e-label-s', { text: caption }) : null]); }

  // ---------------------------------------------------------------------------------------------------------------- the parts
  function head() {
    var d = h('div', 'nx-gal-intro');
    var hero = h('div', 'nx-gal-hero', null, h('div', 'm3e-loader nx-gal-heroshape', { 'aria-hidden': 'true' }, h('i')));
    d.appendChild(hero);
    d.appendChild(h('p', 'nx-gal-lead m3e-body-l', { text: 'The look of this app is Material 3 Expressive: shapes that morph, sizes you can feel, springs for motion. This page shows every part of it, made with the very stylesheet of the app.' }));
    // theme and colors: the same choices as in Settings > Appearance
    var theme = h('div', 'm3e-group m3e-connected m3e-fill', { role: 'radiogroup', 'aria-label': 'Theme' });
    var cur = getTheme();
    [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].forEach(function (t) {
      theme.appendChild(btn(t[1], 'm3e-s m3e-filled', null, { role: 'radio', 'aria-pressed': cur === t[0] ? 'true' : 'false', 'data-mode': t[0] }));
    });
    single(theme, function (b) { setTheme(b.getAttribute('data-mode')); });
    var sw = h('div', 'nx-swatches', { role: 'radiogroup', 'aria-label': 'Colors' });
    var pal = getPalette();
    PALETTES.forEach(function (p) {
      sw.appendChild(h('a', 'nx-swatch' + (pal === p[0] ? ' nx-on' : ''), { role: 'radio', tabindex: '0', 'data-nx-pal': p[0], 'aria-label': p[1], title: p[1], 'aria-checked': pal === p[0] ? 'true' : 'false' }));
    });
    on(sw, 'click', function (e) {
      var t = e.target;
      while (t && t !== sw && !(t.getAttribute && t.getAttribute('data-nx-pal'))) t = t.parentNode;
      if (!t || t === sw) return;
      setPalette(t.getAttribute('data-nx-pal'));
      for (var i = 0; i < sw.children.length; i++) {
        var o = sw.children[i].getAttribute('data-nx-pal') === t.getAttribute('data-nx-pal');
        sw.children[i].classList.toggle('nx-on', o);
        sw.children[i].setAttribute('aria-checked', o ? 'true' : 'false');
      }
    });
    d.appendChild(h('div', 'nx-gal-card', null, [h('h3', 'nx-gal-name m3e-title-s', { text: 'Theme' }), theme, h('h3', 'nx-gal-name m3e-title-s', { text: 'Colors' }), sw,
      h('p', 'nx-gal-spec m3e-label-s', { text: 'The same choices as Settings > Appearance. Everything on this page answers to them at once.' })]));
    // jump chips
    var jump = h('div', 'nx-gal-jump', { role: 'navigation', 'aria-label': 'Parts' });
    PARTS.forEach(function (p) {
      jump.appendChild(on(h('button', 'm3e-chip m3e-fill-s', { type: 'button', text: p[1] }), 'click', function () {
        var t = panel.querySelector('#nx-gal-' + p[0]);
        if (t && t.scrollIntoView) { try { t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { t.scrollIntoView(); } }
      }));
    });
    d.appendChild(jump);
    return d;
  }

  // --- shapes: 35 shapes with the same number of points, so that any one can turn into any other
  function shapes() {
    var s = section('shapes', 'Shapes', '35 shapes, each a polygon of 144 points. Because every shape has the same number of points, clip-path can morph from any shape to any other, with a spring.');
    var big = h('div', 'm3e-shape nx-gal-bigshape', { 'aria-hidden': 'true', style: 'clip-path:var(--nx-v-cookie9)' });
    var name = h('code', 'nx-gal-code', { text: '--nx-v-cookie9' });
    var grid = h('div', 'nx-gal-shapes', { role: 'listbox', 'aria-label': 'Shapes' });
    var playing = null, idx = 19;
    function show(id, label) {
      big.style.clipPath = 'var(--nx-v-' + id + ')';
      name.textContent = '--nx-v-' + id;
      for (var i = 0; i < grid.children.length; i++) grid.children[i].setAttribute('aria-selected', grid.children[i].getAttribute('data-id') === id ? 'true' : 'false');
    }
    SHAPES.forEach(function (sh, i) {
      var b = h('button', 'nx-gal-shape', { type: 'button', role: 'option', 'data-id': sh[0], 'aria-label': sh[1], title: sh[1], 'aria-selected': sh[0] === 'cookie9' ? 'true' : 'false' },
        h('span', 'm3e-shape', { style: 'clip-path:var(--nx-v-' + sh[0] + ')' }));
      on(b, 'click', function () { idx = i; show(sh[0], sh[1]); });
      grid.appendChild(b);
    });
    var play = btn('Play', 'm3e-s m3e-tonal', 'play', { 'aria-pressed': 'false' });
    toggle(play, function (state) {
      if (playing) { clearInterval(playing); playing = null; }
      if (state) {
        playing = setInterval(function () { idx = (idx + 1) % SHAPES.length; show(SHAPES[idx][0], SHAPES[idx][1]); }, 1100);
        timers.push(playing);
      }
    });
    s.add('Morph', 'Tap a shape. .m3e-shape + clip-path: var(--nx-v-<name>) + transition: clip-path var(--nx-spatial-ms) var(--nx-spatial)',
      [h('div', 'nx-gal-morph', null, [big, name, play]), grid], 'nx-gal-col');
    s._stop = function () { if (playing) { clearInterval(playing); playing = null; play.setAttribute('aria-pressed', 'false'); } };
    return s;
  }

  // --- motion: the springs
  function motion() {
    var s = section('motion', 'Motion', 'M3 Expressive moves with springs, not curves. Spatial springs (how far, how big, which shape) overshoot a little; effects springs (color, opacity) do not.');
    var rows = h('div', 'nx-gal-springs');
    var all = [];
    SPRINGS.forEach(function (sp) {
      var effects = sp[0].indexOf('effects') === 0;
      var ball = h('i', 'nx-gal-ball' + (effects ? ' nx-gal-fade' : ''), { style: 'transition-duration:var(--nx-' + sp[0] + '-ms);transition-timing-function:var(--nx-' + sp[0] + ')' });
      var ms = css('--nx-' + sp[0] + '-ms') || '';
      var row = h('div', 'nx-gal-spring', null, [h('div', 'nx-gal-springname', null, [h('b', 'm3e-label-l', { text: sp[1] }), h('small', 'm3e-label-s', { text: sp[2] + (ms ? ' · ' + ms : '') })]),
        h('div', 'nx-gal-track', null, ball)]);
      rows.appendChild(row);
      all.push(row);
    });
    var go = false;
    var play = btn('Play', 'm3e-s m3e-tonal', 'play');
    on(play, 'click', function () { go = !go; all.forEach(function (r) { r.classList.toggle('nx-go', go); }); });
    s.add('Springs', 'transition: transform var(--nx-spatial-ms) var(--nx-spatial) (a linear() easing computed from the damping and the stiffness; --nx-<name>-ms is the duration)', [rows, play], 'nx-gal-col');
    return s;
  }

  // --- buttons
  function buttons() {
    var s = section('buttons', 'Buttons', 'Five sizes, five styles. A button is round or square, and its corners move: smaller when you press it, and a toggle button changes shape when it is selected.');
    var sizes = [['xs', 'XS', 32], ['s', 'S', 40], ['m', 'M', 56], ['l', 'L', 96], ['xl', 'XL', 136]];
    s.add('Sizes', '.m3e-btn .m3e-xs / .m3e-s / .m3e-m / .m3e-l / .m3e-xl: 32 / 40 / 56 / 96 / 136 dp high, label 14 / 14 / 16 / 24 / 32 sp',
      sizes.map(function (z) { return item(btn(z[1], 'm3e-' + z[0] + ' m3e-filled', 'play'), z[1] + ' · ' + z[2] + ' dp'); }), 'nx-gal-col');
    s.add('Styles', '.m3e-filled / .m3e-tonal / .m3e-elevated / .m3e-outlined / .m3e-text / .m3e-error',
      [btn('Filled', 'm3e-s m3e-filled'), btn('Tonal', 'm3e-s m3e-tonal'), btn('Elevated', 'm3e-s m3e-elevated'), btn('Outlined', 'm3e-s m3e-outlined'), btn('Text', 'm3e-s m3e-text'),
        btn('Error', 'm3e-s m3e-error')]);
    s.add('Round and square', '.m3e-square: 12 / 12 / 16 / 28 / 28 dp corners (XS to XL); pressed: 8 / 8 / 12 / 16 / 16 dp. Hold a button to see the corners move.',
      [btn('Round', 'm3e-m m3e-tonal', 'favorite'), btn('Square', 'm3e-m m3e-tonal m3e-square', 'favorite')]);
    var t1 = toggle(btn('Wi-Fi', 'm3e-m m3e-filled', 'wifi', { 'aria-pressed': 'false' }));
    var t2 = toggle(btn('Alerts', 'm3e-m m3e-filled m3e-square', 'bell', { 'aria-pressed': 'true' }));
    s.add('Toggle', '[aria-pressed]: a round button turns square when it is selected, a square one turns round. The colors swap with an effects spring.', [t1, t2]);
    return s;
  }

  // --- icon buttons
  function iconButtons() {
    var s = section('icons', 'Icon buttons', 'Four styles, five sizes and three widths. Round or square, a toggle changes shape when selected.');
    s.add('Styles', '.m3e-icon-btn + .m3e-standard / .m3e-filled / .m3e-tonal / .m3e-outlined',
      [ibtn('favorite', 'Standard', 'm3e-s m3e-standard'), ibtn('favorite', 'Filled', 'm3e-s m3e-filled'), ibtn('favorite', 'Tonal', 'm3e-s m3e-tonal'), ibtn('favorite', 'Outlined', 'm3e-s m3e-outlined')]);
    s.add('Toggle', '[aria-pressed="true"] fills the button',
      [toggle(ibtn('favorite', 'Favorite', 'm3e-s m3e-standard', { 'aria-pressed': 'false' })), toggle(ibtn('bookmark', 'Bookmark', 'm3e-s m3e-filled', { 'aria-pressed': 'true' })),
        toggle(ibtn('like', 'Like', 'm3e-s m3e-tonal', { 'aria-pressed': 'false' })), toggle(ibtn('share', 'Share', 'm3e-s m3e-outlined', { 'aria-pressed': 'false' }))]);
    s.add('Sizes', 'XS 32 / S 40 / M 56 / L 96 / XL 136 dp (the icon 20 / 24 / 24 / 32 / 40)',
      [ibtn('edit', 'Edit, extra small', 'm3e-xs m3e-tonal'), ibtn('edit', 'Edit, small', 'm3e-s m3e-tonal'), ibtn('edit', 'Edit, medium', 'm3e-m m3e-tonal'), ibtn('edit', 'Edit, large', 'm3e-l m3e-tonal'),
        ibtn('edit', 'Edit, extra large', 'm3e-xl m3e-tonal')]);
    s.add('Widths', '.m3e-narrow / default / .m3e-wide, here at size M: 48 / 56 / 72 dp', [ibtn('edit', 'Edit, narrow', 'm3e-m m3e-filled m3e-narrow'), ibtn('edit', 'Edit, default width', 'm3e-m m3e-filled'),
      ibtn('edit', 'Edit, wide', 'm3e-m m3e-filled m3e-wide')]);
    s.add('Square', '.m3e-square: corners of 12 dp (XS, S), 16 dp (M), 28 dp (L, XL); pressed, a square button gets smaller corners (8 / 12 / 16 dp)', [ibtn('delete', 'Delete', 'm3e-m m3e-error m3e-square'), ibtn('search', 'Search', 'm3e-m m3e-filled m3e-square'),
      ibtn('more', 'More', 'm3e-m m3e-tonal m3e-square')]);
    return s;
  }

  // --- groups
  function groups() {
    var s = section('groups', 'Button groups', 'Buttons that belong together. In a connected group (the new segmented button) the buttons are 2 dp apart and the selected one is round; pressing one makes it grow and the others give way.');
    var std = h('div', 'm3e-group m3e-fill', { role: 'group' }, [btn('Undo', 'm3e-s m3e-tonal', 'undo'), btn('Redo', 'm3e-s m3e-tonal', 'redo'), btn('Share', 'm3e-s m3e-tonal', 'share')]);
    s.add('Standard', '.m3e-group (12 dp apart; 18 with .m3e-xs-gap) + .m3e-fill: the buttons share the width', std);
    var seg = single(h('div', 'm3e-group m3e-connected m3e-fill', { role: 'radiogroup', 'aria-label': 'Period' }, [
      btn('Day', 'm3e-s m3e-filled', null, { role: 'radio', 'aria-pressed': 'false' }), btn('Week', 'm3e-s m3e-filled', null, { role: 'radio', 'aria-pressed': 'true' }),
      btn('Month', 'm3e-s m3e-filled', null, { role: 'radio', 'aria-pressed': 'false' })]));
    s.add('Connected, one selected', '.m3e-group.m3e-connected: 2 dp between the buttons, 8 dp inside (4 dp pressed), the ends round; a selected button is round all over', seg);
    var multi = h('div', 'm3e-group m3e-connected', { role: 'group', 'aria-label': 'Format' }, [
      toggle(ibtn('bold', 'Bold', 'm3e-m m3e-filled m3e-wide', { 'aria-pressed': 'true' })), toggle(ibtn('italic', 'Italic', 'm3e-m m3e-filled m3e-wide', { 'aria-pressed': 'false' })),
      toggle(ibtn('underline', 'Underline', 'm3e-m m3e-filled m3e-wide', { 'aria-pressed': 'false' }))]);
    s.add('Connected, several selected', 'icon buttons with aria-pressed, size M, wide', multi);
    var big = single(h('div', 'm3e-group m3e-connected m3e-fill', { role: 'radiogroup', 'aria-label': 'Gate' }, [
      btn('Open', 'm3e-l m3e-filled', 'arrow-up', { role: 'radio', 'aria-pressed': 'false' }), btn('Close', 'm3e-l m3e-filled', 'arrow-down', { role: 'radio', 'aria-pressed': 'true' })]));
    s.add('Large: the accessory screen', 'Open and Close on the accessory screen are this group, with the button of the state of the gate selected (round all over)', big);
    return s;
  }

  // --- split button
  function split() {
    var s = section('split', 'Split button', 'An action and a menu in one shape. The chevron turns when the menu opens, and the menu button becomes round.');
    var anchor = h('div', 'nx-gal-anchor');
    var main = btn('Save', 'm3e-m m3e-filled', 'done');
    var more = btn('', 'm3e-m m3e-filled', 'expand', { 'aria-label': 'More', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
    var menu = h('div', 'm3e-menu', { role: 'menu' }, ['Save as a copy', 'Save and share', 'Discard changes'].map(function (t, i) {
      return h('button', null, { type: 'button', role: 'menuitem' }, [icon(['copy', 'share', 'delete'][i]), h('span', null, { text: t })]);
    }));
    function setOpen(o) { more.setAttribute('aria-expanded', o ? 'true' : 'false'); menu.classList.toggle('m3e-open', o); }
    on(more, 'click', function () { setOpen(more.getAttribute('aria-expanded') !== 'true'); });   // a tap anywhere else closes it (the handler of the page)
    s._close = function () { setOpen(false); };
    anchor.appendChild(h('div', 'm3e-split m3e-m', null, [main, more]));
    anchor.appendChild(menu);
    s.add('Split button', '.m3e-split: the trailing button has [aria-expanded]; the menu is .m3e-menu + .m3e-open', anchor, 'nx-gal-tall');
    return s;
  }

  // --- FAB
  function fabs() {
    var s = section('fab', 'FAB', 'The floating action button in four sizes, extended, and as a menu that unfolds from the button.');
    s.add('Sizes', '.m3e-fab + .m3e-fab-s / default / .m3e-fab-m / .m3e-fab-l: 40 / 56 / 80 / 96 dp; the corners 12 / 16 / 20 / 28 dp',
      [h('button', 'm3e-fab m3e-fab-s', { type: 'button', 'aria-label': 'Small' }, icon('add')), h('button', 'm3e-fab', { type: 'button', 'aria-label': 'Standard' }, icon('add')),
        h('button', 'm3e-fab m3e-fab-m', { type: 'button', 'aria-label': 'Medium' }, icon('add')), h('button', 'm3e-fab m3e-fab-l', { type: 'button', 'aria-label': 'Large' }, icon('add'))]);
    s.add('Extended', '.m3e-fab.m3e-ext (+ .m3e-fab-m / .m3e-fab-l): 56 / 80 / 96 dp high',
      [item(h('button', 'm3e-fab m3e-ext', { type: 'button' }, [icon('edit'), h('span', null, { text: 'Compose' })]), 'Small · 56 dp'),
        item(h('button', 'm3e-fab m3e-ext m3e-fab-m m3e-secondary', { type: 'button' }, [icon('edit', 28), h('span', null, { text: 'Compose' })]), 'Medium · 80 dp'),
        item(h('button', 'm3e-fab m3e-ext m3e-fab-l m3e-tertiary', { type: 'button' }, [icon('edit', 32), h('span', null, { text: 'Compose' })]), 'Large · 96 dp')], 'nx-gal-col');
    var menu = h('div', 'm3e-fabm', { 'aria-expanded': 'false' });
    var fab = h('button', 'm3e-fab', { type: 'button', 'aria-label': 'Menu', 'aria-haspopup': 'menu' }, icon('add'));
    var items = h('div', 'm3e-fabm-items', { role: 'menu' });
    [['edit', 'Edit'], ['share', 'Share'], ['favorite', 'Favorite']].forEach(function (it, i) {
      items.appendChild(h('button', 'm3e-fabm-item', { type: 'button', role: 'menuitem', style: '--k:' + i }, [icon(it[0]), h('span', null, { text: it[1] })]));
    });
    menu.appendChild(fab);
    menu.appendChild(items);
    function setOpen(o) { menu.setAttribute('aria-expanded', o ? 'true' : 'false'); fab.setAttribute('aria-label', o ? 'Close menu' : 'Menu'); }
    on(fab, 'click', function () { setOpen(menu.getAttribute('aria-expanded') !== 'true'); });
    on(items, 'click', function () { setOpen(false); });
    s._close = function () { setOpen(false); };
    s.add('FAB menu', '.m3e-fabm[aria-expanded]: the items (.m3e-fabm-item, 56 dp, 4 dp apart) unfold from the button one after the other (32 ms)', h('div', 'nx-gal-fabarea', null, menu), 'nx-gal-tall');
    return s;
  }

  // --- loading indicator and progress
  function progress() {
    var s = section('progress', 'Loading and progress', 'The loading indicator is a shape that morphs through seven shapes while it turns. Progress is a wave: wavy where the line is long (and moving), flat when you want it calm.');
    s.add('Loading indicator', '.m3e-loader (+ .m3e-contained): the shape changes every 650 ms with a spring, a quarter turn at a time, and turns once in 4.7 s. The hero of the accessory screen is this while the gate moves.',
      [item(h('div', 'm3e-loader', null, h('i')), 'Uncontained'), item(h('div', 'm3e-loader m3e-contained', null, h('i')), 'Contained'),
        item(h('div', 'm3e-loader m3e-contained', { style: '--s:96px' }, h('i')), 'Larger')]);
    var det = h('div', 'm3e-progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '60', style: '--p:.6' }, h('i'));
    var flat = h('div', 'm3e-progress m3e-flat', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '60', style: '--p:.6' }, h('i'));
    var sl = slider({ size: 's', value: 0.6, label: 'Progress', onInput: function (v) {
      det.style.setProperty('--p', v); flat.style.setProperty('--p', v);
      det.setAttribute('aria-valuenow', Math.round(v * 100)); flat.setAttribute('aria-valuenow', Math.round(v * 100));
    } });
    s.add('Determinate', '.m3e-progress[style="--p: .6"]: a wave of 3 dp on a track of 4 dp, 40 dp long, moving one wavelength per second; drag the slider and the end follows with a spring', [det, h('div', 'nx-gal-gap'), flat, h('div', 'nx-gal-gap'), sl], 'nx-gal-col');
    s.add('Indeterminate', '.m3e-progress.m3e-indet: two lines with a head and a tail (1750 ms), the wavelength 20 dp; the status sheet shows it while it checks',
      [h('div', 'm3e-progress m3e-indet', { role: 'progressbar', 'aria-label': 'Loading' }, [h('i'), h('b')])], 'nx-gal-col');
    return s;
  }

  // --- slider
  function slider(o) {
    var size = o.size || 'xs';
    var el = h('div', 'm3e-slider' + (size === 'xs' ? '' : ' m3e-' + size), { role: 'slider', tabindex: '0', 'aria-label': o.label || 'Value', 'aria-valuemin': '0', 'aria-valuemax': '100', style: '--v:' + (o.value === undefined ? 0.5 : o.value) });
    var a = h('span', 'a'), t = h('span', 't'), out = h('output');
    var handle = h('span', 'h', null, out);
    if (o.icon) { a.appendChild(icon(o.icon)); }
    el.appendChild(a); el.appendChild(t); el.appendChild(handle);
    var dragging = false;
    function set(v, silent) {
      v = Math.max(0, Math.min(1, v));
      el.style.setProperty('--v', String(v));
      out.textContent = String(Math.round(v * 100));
      el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      if (!silent && o.onInput) o.onInput(v);
    }
    function at(e) { var r = el.getBoundingClientRect(); return r.width ? (e.clientX - r.left) / r.width : 0; }
    set(o.value === undefined ? 0.5 : o.value, true);
    on(el, 'pointerdown', function (e) {
      dragging = true; el.classList.add('m3e-drag');
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* not supported: the move events still arrive while the pointer is over it */ }
      set(at(e));
    });
    on(el, 'pointermove', function (e) { if (dragging) set(at(e)); });
    var end = function () { dragging = false; el.classList.remove('m3e-drag'); };
    on(el, 'pointerup', end); on(el, 'pointercancel', end); on(el, 'lostpointercapture', end);
    on(el, 'keydown', function (e) {
      var v = parseFloat(el.style.getPropertyValue('--v')) || 0, k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowUp') { set(v + 0.05); e.preventDefault(); } else if (k === 'ArrowLeft' || k === 'ArrowDown') { set(v - 0.05); e.preventDefault(); }
      else if (k === 'Home') { set(0); e.preventDefault(); } else if (k === 'End') { set(1); e.preventDefault(); }
    });
    el.setValue = set;
    return el;
  }
  function sliders() {
    var s = section('sliders', 'Sliders', 'A thick track with a handle that is a thin bar. The handle gets thinner while you hold it and shows its value; the track has a gap of 6 dp around the handle and a stop at the end.');
    var rows = [['xs', 'XS · track 16 dp', 0.35, null], ['s', 'S · 24 dp', 0.6, null], ['m', 'M · 40 dp', 0.45, 'sun'], ['l', 'L · 56 dp', 0.7, 'sun'], ['xl', 'XL · 96 dp', 0.5, 'sun']];
    s.add('Sizes', '.m3e-slider (+ .m3e-s / .m3e-m / .m3e-l / .m3e-xl); the value is --v (0 to 1); the handle is 4 dp wide, 2 dp while pressed',
      rows.map(function (r) { return item(slider({ size: r[0], value: r[2], icon: r[3], label: r[1] }), r[1]); }), 'nx-gal-col');
    return s;
  }

  // --- switches and chips
  function switches() {
    var s = section('switches', 'Switches and chips', 'The switch has a thumb that grows when it is on (24 dp) and when you press it (28 dp). Chips are 32 dp high with 8 dp corners.');
    function sw(on_, label, disabled) {
      var b = h('button', 'm3e-switch', { type: 'button', role: 'switch', 'aria-checked': on_ ? 'true' : 'false', 'aria-label': label, disabled: disabled }, h('i'));
      if (!disabled) on(b, 'click', function () { b.setAttribute('aria-checked', b.getAttribute('aria-checked') === 'true' ? 'false' : 'true'); });
      return item(b, label);
    }
    s.add('Switch', '.m3e-switch[aria-checked]: 52 x 32 dp; the Settings of this app use it as the toggle (ion-toggle)', [sw(false, 'Off'), sw(true, 'On'), sw(true, 'Disabled', true)]);
    function chip(label, cls, attrs, ico, trail) {
      var c = h('button', 'm3e-chip ' + cls, attrs || { type: 'button' });
      if (!c.hasAttribute('type')) c.setAttribute('type', 'button');
      if (ico) c.appendChild(icon(ico));
      c.appendChild(h('span', null, { text: label }));
      if (trail) c.appendChild(icon(trail));
      return c;
    }
    var f1 = toggle(h('button', 'm3e-chip', { type: 'button', 'aria-pressed': 'true' }, [h('i', 'm3e-i m3e-chk', { 'aria-hidden': 'true', style: '--i:var(--nx-i-done)' }), h('span', null, { text: 'Garage' })]));
    var f2 = toggle(h('button', 'm3e-chip', { type: 'button', 'aria-pressed': 'false' }, [h('i', 'm3e-i m3e-chk', { 'aria-hidden': 'true', style: '--i:var(--nx-i-done)' }), h('span', null, { text: 'Gate' })]));
    s.add('Chips', '.m3e-chip: assist (icon), filter (a toggle: tonal with a check when selected), input (removable), suggestion (.m3e-fill-s)',
      [chip('Add a user', 'm3e-assist m3e-lead', null, 'add'), f1, f2, chip('Anna', 'm3e-lead', null, 'person', 'close'), chip('Open at 8:00', 'm3e-fill-s')]);
    return s;
  }

  // --- toolbars
  function toolbars() {
    var s = section('toolbars', 'Toolbars', 'A floating toolbar is a round bar with the actions that belong to what you are doing. A docked toolbar fills the width.');
    function tb(vibrant) {
      var b = h('div', 'm3e-toolbar' + (vibrant ? ' m3e-vibrant' : ''), { role: 'toolbar', 'aria-label': vibrant ? 'Vibrant' : 'Standard' }, [
        toggle(ibtn('bold', 'Bold', 'm3e-standard', { 'aria-pressed': 'true' })), toggle(ibtn('italic', 'Italic', 'm3e-standard', { 'aria-pressed': 'false' })),
        toggle(ibtn('underline', 'Underline', 'm3e-standard', { 'aria-pressed': 'false' })), ibtn('list', 'List', 'm3e-standard'),
        h('button', 'm3e-fab', { type: 'button', 'aria-label': 'Add' }, icon('add'))]);
      return b;
    }
    s.add('Floating', '.m3e-toolbar (+ .m3e-vibrant): 64 dp high, round; icon buttons of 48 dp, an optional FAB at the end', [tb(false)]);
    s.add('Vibrant', 'the same in the primary container', [tb(true)]);
    s.add('Docked', '.m3e-docked: 64 dp high, the width of the screen',
      [h('div', 'm3e-docked', { role: 'toolbar', 'aria-label': 'Docked' }, [toggle(ibtn('favorite', 'Favorite', 'm3e-standard', { 'aria-pressed': 'true' })), ibtn('search', 'Search', 'm3e-standard'), ibtn('share', 'Share', 'm3e-standard'),
        ibtn('more', 'More', 'm3e-standard')])]);
    return s;
  }

  // --- lists
  function lists() {
    var s = section('lists', 'Lists', 'A segmented list: 2 dp between the items, the first and the last 16 dp round, the ones in between 4 dp. Pressed or selected an item is 16 dp all over, and its avatar becomes a cookie.');
    var list = h('div', 'm3e-list', { role: 'listbox', 'aria-label': 'Accessories' });
    [['Garage door', 'Closed · 22:00', 'gate'], ['Front gate', 'Open', 'gate'], ['Side gate', 'Not usable', 'wifi-off'], ['Driveway', 'Checking…', 'refresh']].forEach(function (it, i) {
      list.appendChild(h('div', 'm3e-li', { role: 'option', tabindex: '0', 'aria-selected': i === 1 ? 'true' : 'false' }, [h('span', 'm3e-lead', null, icon(it[2])),
        h('span', 'm3e-txt', null, [h('b', 'm3e-title-m', { text: it[0] }), h('span', 'm3e-sup m3e-body-m', { text: it[1] })])]));
    });
    on(list, 'click', function (e) {
      var t = e.target;
      while (t && t !== list && t.parentNode !== list) t = t.parentNode;
      if (!t || t === list) return;
      for (var i = 0; i < list.children.length; i++) list.children[i].setAttribute('aria-selected', list.children[i] === t ? 'true' : 'false');
    });
    s.add('Segmented list', '.m3e-list > .m3e-li[aria-selected]: 56 dp or more, 10 dp above and below, 16 dp at the start and the end', list, 'nx-gal-col');
    return s;
  }

  // --- type
  function type() {
    var s = section('type', 'Type', 'The scale of M3 in 15 roles. The emphasized styles are one weight heavier: use them for what matters most.');
    var emph = false;
    var rows = h('div', 'nx-gal-types');
    TYPES.forEach(function (t) {
      rows.appendChild(h('div', 'nx-gal-type', null, [h('span', 'm3e-' + t[0], { text: t[1] }), h('small', 'm3e-label-s', { text: t[2] + ' · ' + t[3] + ' · ' + t[4] })]));
    });
    var sw = h('button', 'm3e-switch', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': 'Emphasized' }, h('i'));
    on(sw, 'click', function () {
      emph = !emph;
      sw.setAttribute('aria-checked', emph ? 'true' : 'false');
      for (var i = 0; i < rows.children.length; i++) rows.children[i].firstChild.classList.toggle('m3e-emph', emph);
    });
    s.add('Scale', '.m3e-display-l ... .m3e-label-s, and .m3e-emph for the emphasized style', [h('div', 'nx-gal-line', null, [h('span', 'm3e-label-l', { text: 'Emphasized' }), sw]), rows], 'nx-gal-col');
    return s;
  }

  // --- color
  function color() {
    var s = section('color', 'Color', 'Dynamic color: every color on this page is a role of the palette that is chosen above (light or dark). Change the palette and all of it follows.');
    var grid = h('div', 'nx-gal-roles');
    ROLES.forEach(function (r) {
      grid.appendChild(h('div', 'nx-gal-role', { style: 'background:var(--md-sys-color-' + r[0] + ');color:var(--md-sys-color-' + r[1] + ')' }, [h('b', 'm3e-label-m', { text: r[0] }), h('small', 'm3e-label-s', { text: r[1] })]));
    });
    s.add('Roles', 'var(--md-sys-color-<role>); a role and the role that is made to be read on it (on-primary on primary ...) are always used as a pair', grid, 'nx-gal-col');
    return s;
  }

  // ---------------------------------------------------------------------------------------------------------------- theme and palette: through nx-patch.js when it is there
  function getTheme() {
    try { if (window.NX && window.NX.theme) return window.NX.theme(); } catch (e) { /* the attribute */ }
    var a = root.getAttribute('data-nx-theme');
    return a === 'light' || a === 'dark' ? a : 'auto';
  }
  function setTheme(mode) {
    try { if (window.NX && window.NX.theme) { window.NX.theme(mode); return; } } catch (e) { /* the attribute */ }
    if (mode === 'light' || mode === 'dark') root.setAttribute('data-nx-theme', mode); else root.removeAttribute('data-nx-theme');
  }
  function getPalette() {
    try { if (window.NX && window.NX.palette) return window.NX.palette(); } catch (e) { /* the attribute */ }
    return root.getAttribute('data-nx-palette') || PALETTES[0][0];
  }
  function setPalette(id) {
    try { if (window.NX && window.NX.palette) { window.NX.palette(id); return; } } catch (e) { /* the attribute */ }
    if (id === PALETTES[0][0]) root.removeAttribute('data-nx-palette'); else root.setAttribute('data-nx-palette', id);
  }

  // ---------------------------------------------------------------------------------------------------------------- the overlay
  var parts = [];
  function build() {
    if (built) return;
    built = true;
    panel = h('div', 'nx-gal', { id: 'nx-gallery', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Design', 'data-tap-disabled': 'true' });
    var bar = h('div', 'nx-gal-bar', null, [ibtn('arrow-back', 'Back', 'm3e-s m3e-tonal nx-gal-back'),
      h('div', 'nx-gal-title', null, [h('h1', 'm3e-title-l', { text: 'Design' }), h('span', 'm3e-label-m', { text: 'Material 3 Expressive' })])]);
    on(bar.firstChild, 'click', close);
    var scroll = h('div', 'nx-gal-scroll');
    scroll.appendChild(head());
    parts = [shapes(), motion(), buttons(), iconButtons(), groups(), split(), fabs(), progress(), sliders(), switches(), toolbars(), lists(), type(), color()];
    parts.forEach(function (p) { scroll.appendChild(p); });
    scroll.appendChild(h('p', 'nx-gal-credit m3e-body-s', { text: 'Material 3 Expressive is a design system by Google. The shapes, sizes and springs on this page follow the tokens of androidx.compose.material3 (Apache License 2.0), see NOTICE.md in the patch kit.' }));
    panel.appendChild(bar);
    panel.appendChild(scroll);
    // a tap anywhere else closes a menu that is open (the split button, the FAB menu)
    on(panel, 'click', function (e) {
      var inside = e.target && e.target.closest ? e.target.closest('.m3e-split, .m3e-fabm') : null;
      parts.forEach(function (p) { if (p._close && !(inside && p.contains(inside))) p._close(); });
    });
    // Android's back button closes the page first (capture phase, so that the app's own back handler does not run as well)
    document.addEventListener('backbutton', function (e) {
      if (!isOpen) return;
      try { e.stopImmediatePropagation(); e.preventDefault(); } catch (x) { /* nothing */ }
      close();
    }, true);
    document.body.appendChild(panel);
  }
  function open() {
    try {
      build();
      if (isOpen) return;
      try { if (window.NX && window.NX.close) window.NX.close(); } catch (e) { /* one sheet at a time */ }
      isOpen = true;
      panel.style.display = 'flex';
      panel.querySelector('.nx-gal-scroll').scrollTop = 0;
      // the finger that opened the page is still on the screen: the click that follows its lift must not reach what the page shows under it (the app, Ionic's tap handling,
      // can send one more click to the same place), so the page takes no touches for a moment
      panel.style.pointerEvents = 'none';
      later(function () { if (panel) panel.style.pointerEvents = ''; }, 450);
      var raf = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
      raf(function () { raf(function () { if (isOpen) panel.classList.add('nx-open'); }); });
    } catch (e) { log('open failed', String(e)); }
  }
  function close() {
    if (!isOpen || !panel) return;
    isOpen = false;
    panel.classList.remove('nx-open');
    parts.forEach(function (p) { if (p._stop) p._stop(); if (p._close) p._close(); });
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
    setTimeout(function () {
      if (isOpen) return;
      panel.style.display = 'none';
    }, 420);
  }

  window.NxGallery = { open: open, close: close, isOpen: function () { return isOpen; }, shapes: SHAPES.map(function (s) { return s[0]; }), palettes: PALETTES.map(function (p) { return p[0]; }), parts: PARTS.map(function (p) { return p[0]; }) };
})();
