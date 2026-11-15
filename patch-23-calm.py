#!/usr/bin/env python3
"""Patch nx30 (a calmer accessory screen): the entry to Activity moves to the header, and the extra buttons fold away.

Usage: python patch-23-calm.py <apktool-output-dir>   (all or nothing; idempotent)

The accessory screen showed everything at once: the state, a pill with the last command, a line with a message, Open, Close and Stop, a caption, up to
six extra buttons and a link. This patch changes templates/system/device_detail.html (after the patches that made it what it is):
  - the header gets a round button "Activity" (class nx-hist) next to the one for the other commands; it opens the same sheet as the pill under the state
    did, and its name for a screen reader still says the last command. The pill stays in the page for the patches and tests that know it; nx30-calm.css
    takes it off the screen.
  - the back button of this page gets the class nx-back-detail: with one accessory the app starts on this page and there is nothing to go back to
    (nx-patch.js sets data-nx-single on <html>, the style rules hide the button).
  - the extra buttons are behind one quiet button "More commands" (class nx-more, nxMore / nxMoreOpen of nx-patch.js; the choice is remembered). Without
    those functions everything is shown as before.
"""
import os
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
path = os.path.join(sys.argv[1], "assets", "www", "templates", "system", "device_detail.html")
if not os.path.isfile(path):
    sys.exit("not found: " + path)
text = open(path, encoding="utf-8", newline="").read()
if "nx-hist" in text or "nx-more" in text:
    sys.exit("already patched (nx30 calm accessory screen)")

EDITS = [
    # the back button of this page can be told from the others
    ('<button class="button back-button buttons button-icon icon header-item ion-ios-arrow-back" data-ng-click="onPressBackFromDeviceDetail()">',
     '<button class="button back-button buttons button-icon icon header-item ion-ios-arrow-back nx-back-detail" data-ng-click="onPressBackFromDeviceDetail()">'),
    # Activity in the header, before the button for the other commands
    ('        <button class="button back-button buttons button-icon icon icon-occhio header-item"\n',
     '        <button class="button back-button buttons button-icon icon header-item nx-hist" data-ng-if="nxActivity" data-ng-click="nxActivity(data.device)"\n'
     '                aria-label="{{ nxLastSpoken ? nxLastSpoken(data.device) : \'Activity\' }}"></button>\n'
     '        <button class="button back-button buttons button-icon icon icon-occhio header-item"\n'),
    # the extra buttons fold away behind one button
    ('                        <div class="nx-extras" data-ng-if="nxExtra(data.device).length" role="group" aria-label="Extra buttons">\n',
     '                        <button type="button" class="nx-more" data-ng-if="nxMore && nxExtra(data.device).length" data-ng-click="nxMore()" aria-expanded="{{ nxMoreOpen() }}">'
     '<span>{{ nxMoreOpen() ? \'Fewer commands\' : \'More commands\' }}</span><i aria-hidden="true"></i></button>\n'
     '                        <div class="nx-extras" data-ng-if="nxExtra(data.device).length" data-ng-class="{ \'nx-folded\': nxMoreOpen && !nxMoreOpen() }" role="group" aria-label="Extra buttons">\n'),
    ('<a class="nx-extra-edit" data-ng-if="nxCanQuick && nxCanQuick(data.device)" ',
     '<a class="nx-extra-edit" data-ng-class="{ \'nx-folded\': nxMoreOpen && nxExtra(data.device).length && !nxMoreOpen() }" data-ng-if="nxCanQuick && nxCanQuick(data.device)" '),
]
for old, new in EDITS:
    if text.count(old) != 1:
        sys.exit("device_detail.html: expected 1 x %r, found %d (another patch changed it: this one has to follow)" % (old[:70], text.count(old)))
for old, new in EDITS:
    text = text.replace(old, new)
open(path, "w", encoding="utf-8", newline="").write(text)
print("patched (nx30 calm accessory screen): templates/system/device_detail.html")
