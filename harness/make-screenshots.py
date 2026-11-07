#!/usr/bin/env python3
"""Makes the pictures in docs/screenshots with the harness (headless Chromium, simulated Cordova bridge).

Usage (from this folder, with the app unpacked into ./www, see README.md):
    python3 make-screenshots.py [output-folder]        # default: ../docs/screenshots

Writes overview.png (favorites, device page and status sheet, light above dark), status-states.png (the status sheet in five
situations) and extras-theme.png (the extra buttons, the page where they are ticked, the theme row, and the buttons in dark).
Everything on them is made up (accessory AABBCC, Wi-Fi HomeWifi); there is nothing of a real installation in them.
Needs Node with `playwright` (screens.cjs) and Python with PIL."""
import json
import os
import re
import subprocess
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(HERE, '..', 'docs', 'screenshots')
os.makedirs(OUT, exist_ok=True)
MAC = '00:0B:6C:AA:BB:CC'
DETAIL = f'#/tabs/favorites-device-detail/1/{MAC}'

# the shapes that the native layer (Nx.netState / Nx.probe) returns; shim.js has the same defaults
NET = {'version': 'nx-12', 'sdk': 37, 'wifi': True, 'ssid': 'HomeWifi', 'ip': '192.168.1.172', 'validated': True, 'cellular': False,
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

for name, im in (('overview.png', overview), ('status-states.png', strip), ('extras-theme.png', extras)):
    print(name, im.size, os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
