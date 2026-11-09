#!/usr/bin/env python3
"""Checks a patched APK without running it:
  1. every call from the original dex to com/nice/patch/* exists in classes2.dex with EXACTLY the same signature
  2. every call from classes2.dex to app and Cordova classes exists in classes.dex with the same signature
     (so what was compiled against stubs matches what is really in the app)
  3. the manifest contains CHANGE_NETWORK_STATE and the plugin Nx is in config.xml
  3a. (nx18/nx20) the logo as the adaptive icon, the small icon of the notifications and the splash screens (patch-16); with the original APK as a second argument also that the
      launcher icons for Android 7 and older are still the original ones
  3b. (nx9) the skin, the font and the hook points in index.html, nx-patch.js and debuglog.js; (nx21) the seven palettes and the choice in the settings; (nx22) the 35 shapes and the
      components of Material 3 Expressive in the CSS, and the page Settings > Design
  4. package, version and signature (v2/v3)
Usage: python verify-apk.py <apk> [original.apk]   (run with the androguard venv)"""
import os
import re
import sys
import zipfile
from loguru import logger
logger.remove()
from androguard.core.apk import APK
from androguard.core.dex import DEX

path = sys.argv[1]
errors = []
REF = re.compile(r'(L[^;\s]+;)->([^\s(]+)\(([^)]*)\)(\S+)')
FIELD = re.compile(r'(L[^;\s]+;)->([^\s(:]+):(\S+)')


def dex_from(name):
    with zipfile.ZipFile(path) as z:
        return DEX(z.read(name))


def defined(dex):
    out = set()
    for c in dex.get_classes():
        for m in c.get_methods():
            out.add((m.get_class_name(), m.get_name(), m.get_descriptor().replace(' ', '')))
    return out


def fields(dex):
    out = set()
    for c in dex.get_classes():
        for f in c.get_fields():
            out.add((f.get_class_name(), f.get_name(), f.get_descriptor()))
    return out


def references(dex):
    """All method calls (class, name, signature) in the bytecode."""
    out = set()
    for c in dex.get_classes():
        for m in c.get_methods():
            code = m.get_code()
            if not code:
                continue
            for ins in code.get_bc().get_instructions():
                o = ins.get_output()
                if '->' not in o:
                    continue
                mm = REF.search(o)
                if mm:
                    out.add((mm.group(1), mm.group(2), '(' + mm.group(3).replace(' ', '') + ')' + mm.group(4)))
    return out


main_dex = dex_from('classes.dex')
patch = dex_from('classes2.dex')
def_main, def_patch = defined(main_dex), defined(patch)
classes_main = {c.get_name() for c in main_dex.get_classes()}
classes_patch = {c.get_name() for c in patch.get_classes()}

# 1. app -> patch
n1 = 0
for k, n, d in sorted(references(main_dex)):
    if k.startswith('Lcom/nice/patch/'):
        n1 += 1
        if (k, n, d) not in def_patch:
            errors.append('app calls %s->%s%s, but that is not in classes2.dex' % (k, n, d))

# 2. patch -> app/Cordova (everything that is not from Android/Java/itself)
EXTERNAL = ('Landroid/', 'Ljava/', 'Ljavax/', 'Lorg/json/', 'Ldalvik/', 'Lcom/nice/patch/')
n2 = 0
for k, n, d in sorted(references(patch)):
    if k.startswith(EXTERNAL):
        continue
    n2 += 1
    if k not in classes_main:
        errors.append('patch uses class %s, which is not in the app' % k)
    elif (k, n, d) not in def_main and n != '<init>':
        errors.append('patch calls %s->%s%s, but the app does not have that method' % (k, n, d))
    elif n == '<init>' and (k, n, d) not in def_main:
        errors.append('patch calls constructor %s%s, but the app does not have it' % (k, d))

# our own field access on the base class (NxPlugin.cordova -> CordovaPlugin.cordova)
fields_main = fields(main_dex)
if ('Lorg/apache/cordova/CordovaPlugin;', 'cordova', 'Lorg/apache/cordova/CordovaInterface;') not in fields_main:
    errors.append('CordovaPlugin.cordova (CordovaInterface) not found in the app')
# NxPlugin must extend CordovaPlugin
for c in patch.get_classes():
    if c.get_name() == 'Lcom/nice/patch/NxPlugin;' and c.get_superclassname() != 'Lorg/apache/cordova/CordovaPlugin;':
        errors.append('NxPlugin extends %s, expected CordovaPlugin' % c.get_superclassname())
# CordovaPlugin.execute(String, JSONArray, CallbackContext) must exist (we override it)
if ('Lorg/apache/cordova/CordovaPlugin;', 'execute', '(Ljava/lang/String;Lorg/json/JSONArray;Lorg/apache/cordova/CallbackContext;)Z') not in def_main:
    errors.append('CordovaPlugin.execute(String,JSONArray,CallbackContext) not found in the app')

# 3. manifest and config.xml
a = APK(path)
if 'android.permission.CHANGE_NETWORK_STATE' not in a.get_permissions():
    errors.append('CHANGE_NETWORK_STATE is missing from the manifest')
from androguard.core.axml import AXMLPrinter
with zipfile.ZipFile(path) as z:
    cfg = AXMLPrinter(z.read('res/xml/config.xml')).get_xml().decode('utf-8', 'replace') if hasattr(AXMLPrinter(z.read('res/xml/config.xml')).get_xml(), 'decode') else str(AXMLPrinter(z.read('res/xml/config.xml')).get_xml())
if 'com.nice.patch.NxPlugin' not in cfg:
    errors.append('plugin Nx is not in config.xml')

# 3a. nx18/nx20: the logo of Nice as the adaptive icon (with a monochrome layer), the small icon of the notifications, the splash icon and the splash screens in light and dark (patch-16), the
#     theme, the picture that is not stretched, and the option that makes the push plugin use the small icon (it would take the launcher icon, an adaptive one with a background: a white blot)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'brand'))
import logo  # noqa: E402  (brand/logo.py: a PNG decoder, to compare the launcher icons with the original without depending on how aapt2 wrote the file)
DENS = ('mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')
with zipfile.ZipFile(path) as z:
    names0 = set(z.namelist())

    def find(pattern):
        found = [n for n in names0 if re.fullmatch(pattern, n)]
        return found[0] if len(found) == 1 else None
    need = [('res/mipmap-anydpi-v26/ic_launcher.xml', 100)]
    for d in DENS:
        need += [('res/mipmap-%s/ic_launcher_foreground.png' % d, 400), ('res/mipmap-%s/ic_launcher_monochrome.png' % d, 300),
                 ('res/drawable-%s/nx_stat.png' % d, 150), ('res/drawable-%s/nx_splash_icon.png' % d, 3000)]
    for o in ('port', 'land'):
        for night in ('', '-night'):
            for d in ('ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'):
                need.append((r'res/drawable-%s%s-%s(-v\d+)?/screen\.png' % (o, night, d), 1500))
    for pattern, least in need:
        n = find(re.escape(pattern) if '(' not in pattern else pattern)
        if n is None:
            errors.append('missing from the APK (or twice): %s (patch-16)' % pattern)
        elif n.endswith('.png') and not (z.read(n)[:8] == b'\x89PNG\r\n\x1a\n' and least < len(z.read(n)) < 200000):
            errors.append('%s is not a usable PNG (patch-16)' % n)         # a white silhouette on transparent is a few hundred bytes, a splash screen is 3 to 40 KB
    for gone in ('res/drawable/ic_launcher_foreground.xml', 'res/drawable/ic_launcher_background.xml', 'res/drawable/ic_launcher_monochrome.xml'):
        if gone in names0:
            errors.append('%s is still in the APK: a mark of nx18/nx19 (patch-16 of an older version?)' % gone)
    arsc = z.read('resources.arsc')
    if b'NxTheme' not in arsc and 'NxTheme'.encode('utf-16le') not in arsc:
        errors.append('the theme NxTheme is not in resources.arsc (patch-16)')
    appjs = z.read('assets/www/js/app.min.js').decode('utf-8', 'replace') if 'assets/www/js/app.min.js' in names0 else ''
    if not re.search(r'PushNotification\.init\(\{android:\{senderID:PUSH_SENDER_ID,icon:"nx_stat",iconColor:"#[0-9A-F]{6}"\}', appjs):
        errors.append('app.min.js does not give the push plugin the small icon nx_stat (patch-16): the notifications would show the launcher icon as a white blot')
    if 'SplashMaintainAspectRatio' not in cfg:
        errors.append('config.xml has no SplashMaintainAspectRatio (patch-16): the splash picture would be stretched')
    if len(sys.argv) > 2:
        # the logo of Nice for Android 7 and older must be what the original app had (same pixels; aapt2 may write the file differently)
        with zipfile.ZipFile(sys.argv[2]) as zo:
            onames = set(zo.namelist())
            for d in ('ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'):
                new = [n for n in names0 if re.fullmatch(r'res/mipmap-%s(-v\d+)?/ic_launcher\.png' % d, n)]
                old = [n for n in onames if re.fullmatch(r'res/mipmap-%s(-v\d+)?/ic_launcher\.png' % d, n)]
                if len(new) != 1 or len(old) != 1:
                    errors.append('res/mipmap-%s/ic_launcher.png: found %d in the APK and %d in the original' % (d, len(new), len(old)))
                    continue
                try:
                    same = logo.read_png(z.read(new[0])) == logo.read_png(zo.read(old[0]))
                except ValueError:
                    same = z.read(new[0]) == zo.read(old[0])
                if not same:
                    errors.append('%s is not the launcher icon of the original app (patch-16 must leave it alone)' % new[0])

# 3b. nx9: the skin, the font and the hook points in index.html, nx-patch.js and debuglog.js
with zipfile.ZipFile(path) as z:
    names = set(z.namelist())

    def text(n):
        return z.read(n).decode('utf-8', 'replace') if n in names else ''
    for n in ('assets/www/css/nx-expressive.css', 'assets/www/fonts-nx/roboto-flex-latin.woff2', 'assets/www/fonts-nx/ROBOTO-FLEX-LICENSE.txt'):
        if n not in names:
            errors.append('missing from the APK: ' + n)
    if 'assets/www/fonts-nx/roboto-flex-latin.woff2' in names and z.read('assets/www/fonts-nx/roboto-flex-latin.woff2')[:4] != b'wOF2':
        errors.append('roboto-flex-latin.woff2 is not a woff2 file')
    idx = text('assets/www/index.html')
    if idx.count('css/nx-expressive.css') != 1:
        errors.append('index.html references nx-expressive.css %d times (expected 1)' % idx.count('css/nx-expressive.css'))
    elif idx.index('css/nx-expressive.css') < idx.index('css/style.css'):
        errors.append('nx-expressive.css comes before style.css in index.html: the original styles would override the skin')
    css = text('assets/www/css/nx-expressive.css')
    if '{{' in css or 'var(--md-sys-color-primary)' not in css:
        errors.append('nx-expressive.css is not completely filled in')
    js = text('assets/www/js/nx-patch.js')
    for m in ('--nx-sub', '--nx-dot', 'data-nx-status', 'nx-sheet', 'wrapStatusBar', 'nxCheck'):
        if m not in js:
            errors.append('nx-patch.js is missing ' + m)
    # nx11: the lists ask nxCheck and have a label for "Checking..."; nx18: and one for "Connecting..." (a new attempt after "Not usable"); the CSS styles them
    for n in ('favorites/favorites.html', 'favorites/add_favorites.html', 'settings/settings_device.html',
              'settings/settings_scene_edit.html', 'system/controls_home.html', 'system/device_detail.html'):
        t = text('assets/www/templates/' + n)
        if 'nxCheck' not in t:
            errors.append('templates/%s does not ask nxCheck (patch-11)' % n)
        if "=== 'retry'" not in t or 'Connecting&hellip;' not in t:
            errors.append('templates/%s has no "Connecting..." label (patch-11, nx18)' % n)
    for m in ('.nx-checking', 'nx-checking-text', '.nx-connecting', 'data-nx-status="connecting"', '@property --nx-dot-r'):
        if m not in css:
            errors.append('nx-expressive.css does not style ' + m)
    if "'retry'" not in js or 'Connecting to the accessory' not in js:
        errors.append('nx-patch.js does not know the state "retry" (nx18)')
    # isDeviceReachable writes ten debug lines per call: in the state line it must be evaluated once per digest, after nxCheck
    detail = text('assets/www/templates/system/device_detail.html')
    if "nxCheck(data.device) !== 'retry' && !isDeviceReachable(data.device)" not in detail or "nxCheck(data.device) === 'retry' && !isDeviceReachable(data.device)" not in detail \
            or '!isDeviceReachable(data.device) && ' in detail:
        errors.append('device_detail.html: isDeviceReachable must come after nxCheck in the state line (patch-11)')
    # nx12: the extra command buttons and the theme choice
    for n, m in (('system/device_detail.html', 'nxExtra'), ('settings/device_4th_button.html', 'nxQuickToggle'), ('settings/settings.html', 'nxSetTheme')):
        if m not in text('assets/www/templates/' + n):
            errors.append('templates/%s does not ask %s (patch-12/13)' % (n, m))
    for m in ('.nx-extra', '.nx-pick', '.nx-seg-btn', 'data-nx-theme'):
        if m not in css:
            errors.append('nx-expressive.css does not style ' + m)
    if 'data-nx-theme' not in text('assets/www/js/nx-theme.js') or 'js/nx-theme.js' not in idx:
        errors.append('nx-theme.js is missing or index.html does not load it')
    if 'nxSetTheme' not in js or 'nxQuickToggle' not in js:
        errors.append('nx-patch.js is missing nxSetTheme or nxQuickToggle')
    # nx21: the palettes: seven in the CSS (the default on :root and six on data-nx-palette, each with its dark blocks), the swatches in the settings, the early script, the JS
    PALETTES = ('midnight', 'nice', 'graphite', 'paper', 'violet', 'pine', 'ember')
    for n in PALETTES:
        if '--nx-swatch-%s:' % n not in css or '.nx-swatch[data-nx-pal="%s"]' % n not in css:
            errors.append('nx-expressive.css has no swatch for the palette %s (nx21)' % n)
        if n != PALETTES[0] and (css.count(':root[data-nx-palette="%s"]' % n) != 3 or ':root[data-nx-palette="%s"]:not([data-nx-theme="light"])' % n not in css):
            errors.append('nx-expressive.css: the palette %s has not its three blocks (nx21)' % n)
    if 'nxSetPalette' not in text('assets/www/templates/settings/settings.html') or 'nx-palette-row' not in text('assets/www/templates/settings/settings.html'):
        errors.append('settings.html has no row for the colors (patch-13, nx21)')
    if 'nxSetPalette' not in js or "var PALETTES = [['midnight'," not in js:
        errors.append('nx-patch.js does not know the palettes (nx21)')
    if 'data-nx-palette' not in text('assets/www/js/nx-theme.js'):
        errors.append('nx-theme.js does not apply the palette before the first paint (nx21)')
    if '#93000a' in css.lower():
        errors.append('nx-expressive.css still has the saturated deep red of Material as a color (nx21: the error container is a wine red)')
    # nx22: Material 3 Expressive as a reference: the 35 shapes, the components, the loading indicator and the wavy progress in the CSS, and the page Settings > Design (patch-17)
    shapes22 = re.findall(r'--nx-v-([a-z0-9]+):\s*polygon\(', css)
    if len(shapes22) != 35 or len(set(shapes22)) != 35 or any(n in shapes22 for n in ('cookie', 'sun', 'star')):
        errors.append('nx-expressive.css has %d shapes, not the 35 of Material 3 Expressive (nx22)' % len(shapes22))
    for m in ('.m3e-btn', '.m3e-icon-btn', '.m3e-fab', '.m3e-fabm', '.m3e-slider', '.m3e-switch', '.m3e-progress', '.m3e-loader', '.m3e-list', '.m3e-toolbar', '.m3e-chip', '.m3e-menu',
              '@keyframes m3e-morph', '@keyframes m3e-turn', '--nx-wave-40', '--nx-wave-20', '--nx-spatial-fast', '--nx-effects', '--nx-loader-spring', '.nx-gal-scroll'):
        if m not in css:
            errors.append('nx-expressive.css does not have %s (nx22)' % m)
    if '--nx-spring' in css:
        errors.append('nx-expressive.css still has a spring of before nx22 (--nx-spring)')
    gal22 = text('assets/www/js/nx-gallery.js')
    if 'NxGallery' not in gal22 or 'js/nx-gallery.js' not in idx or idx.index('js/nx-gallery.js') > idx.index('js/nx-patch.js'):
        errors.append('nx-gallery.js is missing or index.html does not load it before nx-patch.js (patch-17, nx22)')
    set22 = text('assets/www/templates/settings/settings.html')
    if 'nxGallery' not in set22 or 'nx-design-row' not in set22 or set22.index('nx-palette-row') > set22.index('nx-design-row'):
        errors.append('settings.html has no row Design behind the colors (patch-17, nx22)')
    if "$rootScope.nxGallery = function" not in js:
        errors.append('nx-patch.js does not offer nxGallery (nx22)')
    # nx14: the activity sheet: its script (loaded before nx-patch.js), the line on the accessory screen, its styles
    if 'js/nx-activity.js' not in idx or idx.index('js/nx-activity.js') > idx.index('js/nx-patch.js'):
        errors.append('index.html does not load nx-activity.js before nx-patch.js')
    act = text('assets/www/js/nx-activity.js')
    for m in ('__nxActivity', 'nxActivity', 'nxLast', 'interfaceLogs', 'deviceLogs'):
        if m not in act:
            errors.append('nx-activity.js is missing ' + m)
    if 'nxActivity' not in text('assets/www/templates/system/device_detail.html') or '__nxActivity' not in js:
        errors.append('the accessory screen or nx-patch.js does not know the activity sheet (patch-14)')
    for m in ('.nx-last', '.nx-act', '.nx-tile', '.nx-bars', '.nx-tl-row'):
        if m not in css:
            errors.append('nx-expressive.css does not style ' + m)
    # nx15: the state of the gate settled from the log, and the pill for a blocked gate
    detail15 = text('assets/www/templates/system/device_detail.html')
    for m in ('nxState', 'nxIcon', 'nxSettled', 'nxBlock', 'nx-block-row'):
        if m not in detail15:
            errors.append('device_detail.html does not know %s (patch-15)' % m)
    for m in ('lastMovement', 'blockInfo', 'settledOf', 'device not found'):
        if m not in act:
            errors.append('nx-activity.js is missing ' + m)
    for m in ('onStatus', 'onCommand', 'newDeviceState'):
        if m not in js:
            errors.append('nx-patch.js does not call the activity module for ' + m)
    for m in ('.nx-block', '.nx-settled', '.nx-act-block'):
        if m not in css:
            errors.append('nx-expressive.css does not style ' + m)
    dl = text('assets/www/js/debuglog.js')
    for m in ('nx-log-button', '__nxLogShow', 'NOISE', '__nxLogAll'):
        if m not in dl:
            errors.append('debuglog.js is missing ' + m)
    print('skin        : css %d bytes, font %s, hooks in index.html/nx-patch.js/debuglog.js %s' % (
        len(css.encode('utf-8')), 'yes' if 'assets/www/fonts-nx/roboto-flex-latin.woff2' in names else 'NO',
        'yes' if not any(f.startswith(('index.html', 'nx-patch.js', 'debuglog.js')) for f in errors) else 'NO'))

# 4. package, version, signature
print('package     :', a.get_package())
print('version     :', a.get_androidversion_name(), a.get_androidversion_code())
print('signature   : v2=%s v3=%s' % (a.is_signed_v2(), a.is_signed_v3()))
print('classes     : %d in classes.dex, %d in classes2.dex (only com/nice/patch: %s)' %
      (len(classes_main), len(classes_patch), all(k.startswith('Lcom/nice/patch/') for k in classes_patch)))
print('calls       : %d app->patch checked, %d patch->app/Cordova checked' % (n1, n2))
if not all(k.startswith('Lcom/nice/patch/') for k in classes_patch):
    errors.append('classes2.dex contains classes outside com/nice/patch (stubs included by mistake?)')
if not (a.is_signed_v2() and a.is_signed_v3()):
    errors.append('not signed with v2/v3')
if errors:
    print('\nERRORS:')
    for f in errors:
        print(' -', f)
    sys.exit(1)
print('\nALL CHECKS PASSED')
