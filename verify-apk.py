#!/usr/bin/env python3
"""Checks a patched APK without running it:
  1. every call from the original dex to com/nice/patch/* exists in classes2.dex with EXACTLY the same signature
  2. every call from classes2.dex to app and Cordova classes exists in classes.dex with the same signature
     (so what was compiled against stubs matches what is really in the app)
  3. the manifest contains CHANGE_NETWORK_STATE and the plugin Nx is in config.xml
  3b. (nx9) the skin, the font and the hook points in index.html, nx-patch.js and debuglog.js
  4. package, version and signature (v2/v3)
Usage: python verify-apk.py <apk>   (run with the androguard venv)"""
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
    # nx11: the lists ask nxCheck and have a label for "Checking..."; the CSS styles it
    for n in ('favorites/favorites.html', 'favorites/add_favorites.html', 'settings/settings_device.html',
              'settings/settings_scene_edit.html', 'system/controls_home.html', 'system/device_detail.html'):
        if 'nxCheck' not in text('assets/www/templates/' + n):
            errors.append('templates/%s does not ask nxCheck (patch-11)' % n)
    for m in ('.nx-checking', 'nx-checking-text'):
        if m not in css:
            errors.append('nx-expressive.css does not style ' + m)
    # isDeviceReachable writes ten debug lines per call: in the state line it must be evaluated once per digest, after nxCheck
    detail = text('assets/www/templates/system/device_detail.html')
    if 'nxCheck(data.device) && !isDeviceReachable(data.device)' not in detail or '!isDeviceReachable(data.device) && ' in detail:
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
