#!/usr/bin/env python3
"""Makes the pictures in docs/screenshots with the harness (headless Chromium, simulated Cordova bridge).

Usage (from this folder, with the app unpacked into ./www, see README.md):
    python3 make-screenshots.py [output-folder]        # default: ../docs/screenshots

Writes overview.png (favorites, device page and status sheet, light above dark), status-states.png (the status sheet in five
situations), m3e-states.png (nx22: the accessory screen in five states with the shapes of Material 3 Expressive), m3e.png (nx22: five parts of Settings > Design), extras-theme.png (the extra buttons, the page where they are ticked, the theme row and the colors row, and the buttons in dark), palettes.png
(the accessory screen in the seven palettes, dark above light) and activity.png
(the line on the accessory screen and the activity sheet, light above dark) and blocked.png (a gate that was blocked, with a state that
the accessory still reports as "opening").
Everything on them is made up (accessory AABBCC, Wi-Fi HomeWifi); there is nothing of a real installation in them.
Needs Node with `playwright` (screens.cjs) and Python with PIL."""
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, '..', 'docs', 'screenshots')
os.makedirs(OUT, exist_ok=True)
MAC = '00:0B:6C:AA:BB:CC'
DETAIL = f'#/tabs/favorites-device-detail/1/{MAC}'

# the shapes that the native layer (Nx.netState / Nx.probe) returns; shim.js has the same defaults
NET = {'version': 'nx-24', 'sdk': 37, 'wifi': True, 'ssid': 'HomeWifi', 'ip': '192.168.1.172', 'validated': True, 'cellular': False,
       'vpn': False, 'module': False, 'defaultType': 'wifi', 'route': 'local', 'routeAgeSeconds': 4}
CLOUD_OK = {'ok': True, 'dns': '63.182.6.157', 'dnsMs': 12, 'tcpMs': 60}
STATES = {
    'checking': {'verifyDelay': 60000, 'reachable': False},   # the first check is still running: nothing is confirmed yet
    'online': {},
    'cloud': {'net': dict(NET, wifi=False, ssid='', ip='10.8.0.5', cellular=True, vpn=True, defaultType='vpn', route='cloud', routeAgeSeconds=3),
              'probe': {'ok': False, 'tcpMs': None, 'bound': False, 'cloud': CLOUD_OK}},
    'guest': {'verifyFail': True, 'net': dict(NET, ssid='GuestWifi'),
              'probe': {'ok': False, 'tcpMs': None, 'bound': True, 'cloud': {'ok': False}}},
    'setup': {'net': dict(NET, module=True, ssid='NiceIT4WIFIAABBCC')},
}


def shoot(label, routes, cfg=None, scheme='light', pre=None):
    """Takes one screenshot per route with screens.cjs (device scale factor 2) and returns them as images."""
    env = dict(os.environ, DSF='2', WAIT='1600', COLOR_SCHEME=scheme, CFG=json.dumps(cfg or {}))
    if pre:
        env.update(PRE=pre, PREWAIT='2800')   # e.g. NX.open(): opens the status sheet first
    subprocess.run(['node', 'screens.cjs', label] + routes, cwd=HERE, env=env, check=True, capture_output=True, timeout=240)
    # screens.cjs names the file after the route: every run of other characters becomes one underscore
    names = [re.sub(r'[^a-z0-9]+', '_', r, flags=re.I).strip('_') for r in routes]
    return [Image.open(os.path.join(HERE, 'shots', label, n + '.png')).convert('RGB') for n in names]


BG = (217, 217, 229)
GAP = 24


def grid(rows, scale):
    w, h = rows[0][0].size
    sheet = Image.new('RGB', (len(rows[0]) * w + (len(rows[0]) + 1) * GAP, len(rows) * h + (len(rows) + 1) * GAP), BG)
    for j, row in enumerate(rows):
        for i, im in enumerate(row):
            sheet.paste(im, (GAP + i * (w + GAP), GAP + j * (h + GAP)))
    new_w = int(sheet.width * scale)
    return sheet.resize((new_w, int(sheet.height * new_w / sheet.width)), Image.LANCZOS)


rows = []
for scheme in ('light', 'dark'):
    plain = shoot(f'ov-{scheme}-plain', ['#/tabs/favorites', DETAIL], scheme=scheme)
    sheet = shoot(f'ov-{scheme}-sheet', ['#/tabs/favorites'], scheme=scheme, pre='NX.open()')
    rows.append(plain + sheet)
overview = grid(rows, 0.5)
overview.save(os.path.join(OUT, 'overview.png'), optimize=True)

states = []
for name in ('checking', 'online', 'cloud', 'guest', 'setup'):
    shot = shoot(f'ov-state-{name}', ['#/tabs/favorites'], cfg=STATES[name], pre='NX.open()')[0]
    w, h = shot.size
    states.append(shot.crop((0, int(h * 0.20), w, h)))   # the sheet is the subject; drop most of the dimmed page above it
strip = grid([states], 0.5)
strip.save(os.path.join(OUT, 'status-states.png'), optimize=True)

# nx12: an administrator's accessory offers all its secondary commands; "Open and Block" and "Release and Close" are ticked
CMDS = ['MDBk', 'MDBl', 'MDBm', 'MDEw', 'MDE5', 'MDFh']   # Open and Block, Close and Block, Block, Release, Release and Open, Release and Close
QUICK = {'secondary': CMDS, 'fourth': 'MDBk', 'quick': ['MDBk', 'MDFh']}
TICK = f'#/tabs/settings-4th-button/1/{MAC}'
light = shoot('ov-extras-light', [DETAIL, TICK, '#/tabs/settings/false'], cfg=QUICK)
dark = shoot('ov-extras-dark', [DETAIL], cfg=QUICK, scheme='dark')
extras = grid([light + dark], 0.5)
extras.save(os.path.join(OUT, 'extras-theme.png'), optimize=True)


# nx14: the activity sheet, with the made-up log of shim.js (two people, a schedule, a remote control, two obstructions, a restart, Wi-Fi drops)
def steps(label, script, scheme):
    env = dict(os.environ, DSF='2', WAIT='1200', COLOR_SCHEME=scheme, CFG='{}', SCRIPT=script)
    subprocess.run(['node', 'screens.cjs', label, '#/tabs/favorites'], cwd=HERE, env=env, check=True, capture_output=True, timeout=240)
    return [Image.open(os.path.join(HERE, 'shots', label, n + '.png')).convert('RGB') for n in ('device', 'sheet-1', 'sheet-2', 'sheet-3')]
activity = grid([steps('ov-activity-' + scheme, 'steps-activity.cjs', scheme) for scheme in ('light', 'dark')], 0.4)
activity.save(os.path.join(OUT, 'activity.png'), optimize=True)

# nx15: a gate that was opened with "Open and Block", and a status that still says "opening"
def blocked_shots(label, scheme):
    env = dict(os.environ, DSF='2', WAIT='1200', COLOR_SCHEME=scheme, CFG='{"activity":"blocked","state":"opening"}', SCRIPT='steps-state.cjs')
    subprocess.run(['node', 'screens.cjs', label, '#/tabs/favorites'], cwd=HERE, env=env, check=True, capture_output=True, timeout=240)
    return [Image.open(os.path.join(HERE, 'shots', label, n + '.png')).convert('RGB') for n in ('device', 'sheet')]
light, dark = blocked_shots('ov-blocked-light', 'light'), blocked_shots('ov-blocked-dark', 'dark')
blocked = grid([[light[0], light[1], dark[0], dark[1]]], 0.5)
blocked.save(os.path.join(OUT, 'blocked.png'), optimize=True)

# nx21: the seven palettes (Settings > Appearance > Colors): the accessory screen with the extra buttons, dark above light; NX.palette() chooses
PALETTES = [('midnight', 'Midnight'), ('nice', 'Nice blue'), ('graphite', 'Graphite'), ('paper', 'Paper'), ('violet', 'Violet'), ('pine', 'Pine'), ('ember', 'Ember')]
shots = {scheme: [shoot(f'ov-pal-{scheme}-{key}', [DETAIL], cfg=QUICK, scheme=scheme, pre=f'NX.palette("{key}")')[0] for key, _ in PALETTES] for scheme in ('dark', 'light')}
sheet = grid([shots['dark'], shots['light']], 0.4)
label_h = 44
labeled = Image.new('RGB', (sheet.width, sheet.height + label_h), BG)
labeled.paste(sheet, (0, label_h))
draw = ImageDraw.Draw(labeled)
font = ImageFont.load_default(size=26)
col = sheet.width / len(PALETTES)
for i, (_, label) in enumerate(PALETTES):
    draw.text((int(i * col + col / 2 - draw.textlength(label, font=font) / 2), 8), label, fill=(40, 44, 52), font=font)
palettes = labeled
palettes.save(os.path.join(OUT, 'palettes.png'), optimize=True)

# nx22: Material 3 Expressive. (1) The accessory screen in five states: the shape of the hero says what the gate does (cookie, loading indicator while it moves, flower, clover, burst) and Open and
# Close are a connected button group with the state selected. (2) Settings > Design, the reference page, in five parts. The animations are paused at a chosen moment (the loading indicator at
# the end of its second step, the others at 0.9 s) so that the pictures are the same every time.
FREEZE = ("setTimeout(function () { document.getAnimations().forEach(function (a) { var n = a.animationName; a.pause(); a.currentTime = n === 'm3e-morph' ? 1300 : n === 'm3e-turn' ? 1000 : 900; }); }, %d); ")
M3E_STATES = [('closed', {}), ('opening', {'state': 'opening'}), ('open', {'state': 'open'}), ('stopped', {'state': 'stopped'}), ('obstructed', {'obstruct': '1'})]
m3e_states = grid([[shoot(f'ov-m3e-{scheme}-{name}', [DETAIL], cfg=cfg, scheme=scheme, pre=FREEZE % 600)[0] for name, cfg in M3E_STATES] for scheme in ('light', 'dark')], 0.4)
m3e_states.save(os.path.join(OUT, 'm3e-states.png'), optimize=True)
GALLERY = ['shapes', 'buttons', 'groups', 'progress', 'sliders']


def gallery_part(scheme, part):
    pre = ("NxGallery.open(); setTimeout(function () { document.querySelector('.nx-gal-scroll').scrollTop = document.getElementById('nx-gal-%s').offsetTop - 8; }, 800); " % part) + FREEZE % 1500
    return shoot(f'ov-m3e-gal-{scheme}-{part}', ['#/tabs/settings/false'], scheme=scheme, pre=pre)[0]
m3e = grid([[gallery_part(scheme, part) for part in GALLERY] for scheme in ('light', 'dark')], 0.4)
m3e.save(os.path.join(OUT, 'm3e.png'), optimize=True)

for name, im in (('overview.png', overview), ('status-states.png', strip), ('extras-theme.png', extras), ('palettes.png', palettes), ('activity.png', activity), ('blocked.png', blocked),
                 ('m3e-states.png', m3e_states), ('m3e.png', m3e)):
    print(name, im.size, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
