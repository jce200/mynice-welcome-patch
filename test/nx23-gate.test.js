// Test of the nx23 workstream "Accessory screen: layout and visual state": the CSS of the accessory screen (static: what it makes of the screen is checked with the screenshots and the
// measurements of harness/steps-gate.cjs), patch-18-accessory-layout.py on an invented app tree, and the functions of nx-activity.js that the screen asks (jsdom). All data is made up.
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-gate.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ------------------------------------------------------------------------------------------------ the CSS (sources: skin.css, activity.css, nx23-gate.css; {{P}} is the prefix)
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const noP = (s) => s.replace(/\{\{P\}\} ?/g, '');   // the prefix {{P}} is not what is looked at here
  const skin = noP(strip(read('skin', 'src', 'skin.css'))), gate = noP(strip(read('skin', 'src', 'nx23-gate.css'))), act = noP(strip(read('skin', 'src', 'activity.css')));
  const build = read('skin', 'src', 'build-css.py');
  const rule = (css, sel) => {   // (sel without the prefix)
    const m = new RegExp('(?:^|\\})\\s*' + esc(sel) + '\\s*\\{([^}]*)\\}', 'm').exec(css); return m ? m[1] : null; };

  // the boxes keep their height
  ok('the variables of the stack: state 52, line 48, pad gap 12 (nx24: one distance between the line, Open | Close and Stop), 16 above the tab bar; 42 and 40 on a screen lower than 720', /--nx-state-h:\s*52px/.test(skin) && /--nx-line-h:\s*48px/.test(skin) && /--nx-pad-gap:\s*12px/.test(skin) &&
    /--nx-pad-bottom:\s*16px/.test(skin) && /@media \(max-height: 720px\)\s*\{\s*:root\s*\{[^}]*--nx-state-h:\s*42px;[^}]*--nx-line-h:\s*40px/.test(gate));
  ok('the state box has a height of its own (a word that changes cannot move what is under it), and a word never wraps', /\.nx-state \{[^}]*height:\s*var\(--nx-state-h\)/.test(skin) && /\.nx-state strong \{[^}]*white-space:\s*nowrap/.test(skin));
  ok('the status line reserves its height (min-height: var(--nx-line-h)) and is a box of its own', /\.nx-line \{[^}]*min-height:\s*var\(--nx-line-h\)/.test(gate));
  ok('the pad is anchored to the bottom and does not scroll: align-content end, no flex growth, no overflow-y, 12 dp between Open and Close, 16 above Stop and under the pad',
    (() => { const r = rule(gate, '.row.flex-3:has(> .nx-line) > .device-commands') || ''; return /align-content:\s*end/.test(r) && /flex:\s*0 0 auto/.test(r) && /overflow:\s*visible/.test(r) && !/overflow-y/.test(r) && /column-gap:\s*12px/.test(r) &&
      /row-gap:\s*var\(--nx-pad-gap\)/.test(r) && /padding:\s*0 16px var\(--nx-pad-bottom\)/.test(r); })() &&
    /align-content:\s*start;\s*column-gap:\s*2px/.test(rule(skin, '.device-commands') || ''));   // (the general rule is as it was: scenes, bridge screens and demo pages keep it)
  ok('the top of the screen gives way: the hero shrinks (flex 0 1 176px, min-height 0), the row takes what is left, the pad row does not grow', /\.row\.flex-2:has\(\.nx-state\) \{[^}]*flex:\s*1 1 auto !important/.test(gate) &&
    /\.row\.flex-2:has\(\.nx-state\) \.device-icon \{[^}]*flex:\s*0 1 176px;[^}]*min-height:\s*0/.test(gate) && /\.row\.flex-3:has\(> \.nx-line\) \{[^}]*flex:\s*0 0 auto !important/.test(gate));
  ok('only the accessory slide is laid out that way (a scene has no state box): every rule of the stack is scoped to .nx-state or .nx-line', !/\.row\.flex-[23] \{/.test(gate) && !/^\.device-icon \{/m.test(gate));
  ok('a hero with less than 48 dp gives way completely (a container query on the top of the screen), the state word stays', /container:\s*nx-top \/ size/.test(gate) && /@container nx-top \(max-height: 152px\)[\s\S]*?\.device-icon \{ display: none/.test(gate));
  ok('the extra commands: a caption, no more rows than fit (the rest scrolls inside, Stop never does), 48 dp buttons and no caption or link on a screen lower than 700; the link has a hit area of 48 dp',
    /\.nx-extras-cap \{/.test(gate) && /\.device-commands \.nx-extras \{[^}]*max-height:\s*208px;[^}]*overflow-y:\s*auto/.test(gate) && /@media \(max-height: 700px\)[\s\S]*\.nx-extras-cap \{ display: none; \}/.test(gate) &&
    /\.nx-extra \{ --_h: 48px/.test(gate) && /\.nx-extra-edit \{[^}]*--_h:\s*48px/.test(skin));

  // Open and Close: momentary, not a choice
  ok('Open and Close: no state-driven shape or fill (nothing is "selected": the hero says what the gate does)', !/i\.(open|closed)\) \.device-commands/.test(skin + gate + act) && !/selected: the state the accessory is in/.test(skin));
  ok('Open and Close: round on the outside, 8 dp on the inside, 4 dp when pressed (fixed fills: Open primary, Close tonal)', /\.command:has\(\[translate\$="_open"\]\) \{\s*--_bg:\s*var\(--md-sys-color-primary\)[^}]*--_rl:\s*var\(--_round\);\s*--_rr:\s*var\(--_in\)/.test(skin) &&
    /\.command:has\(\[translate\$="_close"\]\) \{\s*--_bg:\s*var\(--md-sys-color-secondary-container\)[^}]*--_rl:\s*var\(--_in\);\s*--_rr:\s*var\(--_round\)/.test(skin) && /:active, [^{]*\.activated \{ --_rr: 4px; \}/.test(skin));

  // Stop
  const rest = (gate.match(/\.full-container:has\(\.device-icon i:is\(\.open, \.closed\)\.status-0\)[^{]*\.command:has\(\[translate\$="_stop"\]\) \{([^}]*)\}/) || [])[0] || '';
  ok('Stop: solid error in every state (the default), with its on-error label', /\.command:has\(\[translate\$="_stop"\]\) \{\s*--_bg:\s*var\(--md-sys-color-error\);\s*--_fg:\s*var\(--md-sys-color-on-error\)/.test(skin));
  ok('Stop: at confirmed rest only (open or closed, nothing flagged, not unusable, not checking, nobody waiting, no doubt about the age) the error container with a 2 dp error outline',
    rest.length > 0 && /--_bg:\s*var\(--md-sys-color-error-container\)/.test(rest) && /--_sh:\s*inset 0 0 0 2px var\(--md-sys-color-error\)/.test(rest) && /:not\(:has\(\.nx-unusable:not\(\.ng-hide\)\)\)/.test(rest) &&
    /:not\(:has\(strong\.nx-checking-text:not\(\.ng-hide\)\)\)/.test(rest) && /DEVICE_STATE_CONFIRMATION_PENDING"\]:not\(\.ng-hide\)/.test(rest) && /data-nx-trust="checking"\], \[data-nx-trust="aging"\], \[data-nx-trust="stale"\]/.test(rest));
  ok('Stop keeps its size and place: nothing in the rules for Stop moves it (colors and the outline only)', !/_stop"\]\)[^{]*\{[^}]*(width|height|margin|top|bottom|transform|order)\s*:/.test(skin + gate));

  // the hero moves only while something moves, and says when the app is unsure
  ok('hero: nothing turns at rest (no nx-spin on the shape, no longer period for the burst), the keyframes stay for the refresh button and the sheet', !/animation:\s*nx-spin/.test(rule(skin, '.device-icon:before') || '') &&
    !/animation-duration/.test(skin) && /@keyframes nx-spin/.test(skin) && /prefers-reduced-motion[^{]*\{\s*\.device-icon:before \{ animation: none !important/.test(skin));
  ok('"Checking..." breathes between 70 and 100 % (4:1 at 70 %), and stands still with reduced motion', /@keyframes nx-fade \{ 0%, 100% \{ opacity: \.7; \} 50% \{ opacity: 1; \} \}/.test(skin) && /prefers-reduced-motion[^{]*\{ \.nx-state strong\.nx-checking-text \{ animation: none; \}/.test(skin));
  const unsure = gate;
  ok('hero when the app does not know: neutral fill, a plain gate instead of the drawing of a closed one, a question mark that screen readers skip, the pixel circle for "Not usable" and unknown',
    /surface-container-high/.test(unsure) && /--nx-i-gate/.test(unsure) && /content: '\?' \/ ''/.test(unsure) && /var\(--nx-v-pixelcircle\)/.test(unsure) && /:has\(\.nx-unusable:not\(\.ng-hide\)\)/.test(unsure) &&
    /:has\(\.device-icon i\.unknown\)/.test(unsure) && /:has\(strong\.nx-checking-text:not\(\.ng-hide\)\)/.test(unsure));
  ok('every :has() on "Checking..." comes with :not(.ng-hide) (the template always contains the text, hidden by ng-hide)', !/:has\(strong\.nx-checking-text\)/.test(skin + gate) && !/:has\(\.nx-unusable\)/.test(skin + gate));
  ok('an obstruction: an error chip with an icon, the position of the gate as context under it, in the same 52 dp (32 + 20; 26 + 16 on a lower screen)', /\.nx-state strong > \.nx-obst \{[^}]*height:\s*32px/.test(gate) && /\.nx-state strong:has\(> \.nx-obst:not\(\.ng-hide\)\) > span\.status-1 \{[^}]*line-height:\s*20px/.test(gate) &&
    /@media \(max-height: 720px\)[\s\S]*\.nx-obst \{ height: 26px/.test(gate));
  ok('the pill of a blocked gate is a button in the status line; maybe blocked is the same pill, empty and dashed; the Activity chip is a button of 40 dp in a hit area of 48', /\.nx-pill\.nx-block \{/.test(gate) && /\.nx-pill\.nx-block\.nx-maybe \{[^}]*border:\s*2px dashed/.test(gate) &&
    /\.nx-last \{[^}]*--_h:\s*40px/.test(gate) && /\.nx-last:after \{[^}]*inset:\s*-8px 0 0/.test(gate) && /\.nx-pill:after \{[^}]*inset:\s*-8px 0/.test(gate));
  ok('the old rules of the pill, the note and the chip are gone from activity.css (the lock icon stays: the card of the sheet uses it); the stepped sizes stay there for scenes and bridge screens', !/\.nx-block \{|\.nx-block-row|\.nx-last-row|\.nx-settled|\.nx-last/.test(act) && /\.nx-block-icon \{/.test(act) &&
    /@media \(max-height: 780px\)[^{]*\{\s*\.device-icon \{ width: 140px/.test(act));
  ok('new buttons: .nx-last, .nx-pill and .nx-line-act are in the BUTTONS line of this workstream and declare --_h', /^BUTTONS \+= \[[^\]]*'\.nx-last'[^\]]*'\.nx-pill'[^\]]*'\.nx-line-act'[^\]]*\]   # gate screen/m.test(build) &&
    ['.nx-last', '.nx-pill', '.nx-line-act'].every((s) => new RegExp('(?:^|\\n)' + esc(s) + ' \\{[^}]*--_h:').test(gate)));
  ok('the bars of the wavy progress stand still with reduced motion (a bar of 60 % instead of nothing: the registered start values clip it away)', /prefers-reduced-motion[^{]*\{[^}]*\.m3e-progress\.m3e-indet > i, \.m3e-progress\.m3e-indet > b \{ animation: none !important/.test(gate) &&
    /\.m3e-progress\.m3e-indet > i \{ clip-path: inset\(0 40% 0 0 round 5px\)/.test(gate) && /\.m3e-progress\.m3e-indet > b \{ display: none/.test(gate));
  const gateRaw = strip(read('skin', 'src', 'nx23-gate.css'));
  const lonely = gateRaw.split('\n').filter((l) => /^[^\s}@]/.test(l) && /\{/.test(l) && !/^(\{\{P\}\}|:root)/.test(l));
  ok('every rule of this workstream goes through the prefix (or is :root)', lonely.length === 0, lonely.slice(0, 3).join(' | '));
}

// ------------------------------------------------------------------------------------------------ patch-18-accessory-layout.py on an invented app tree
// what patch-11, patch-12 and patch-15 leave of the accessory slide (made up from their output; the commands' attributes are theirs and must stay as they are)
const SLIDE = (commands) => `<ion-view class="light device-detail">
<ion-content scroll="true">
<ion-slide-box>
<ion-slide data-ng-repeat="slide in slides track by $index" class="full-container">
    <div class="row flex-2" data-ng-if="slide.isDevice">
        <div class="col text-center device-detail">
            <div class="device-icon"><i class="{{ (nxIcon && nxIcon(data.device)) || retrieveIconClass(data.device) }}"></i></div>
            <!-- the classes of the icons -->
            <div class="device-info">
                <div class="device-row">
                    <span translate="{{ 'DEVICE_DETAIL_LABEL_STATE' }}"></span>
                    <strong class="nx-checking-text" data-ng-show="nxCheck(data.device) && nxCheck(data.device) !== 'retry' && !isDeviceReachable(data.device)">Checking&hellip;</strong>
                    <strong class="nx-checking-text nx-connecting" data-ng-show="nxCheck(data.device) === 'retry' && !isDeviceReachable(data.device)">Connecting&hellip;</strong>
                    <strong data-ng-show="!nxCheck(data.device) && !isDeviceReachable(data.device)">
                        <span translate="CONTROLS_DEVICE_NOT_READY"></span>
                    </strong>
                    <strong data-ng-show="isDeviceReachable(data.device)">
<span translate="{{ 'DEVICE_STATE_'+(nxState ? nxState(data.device) : data.device.properties[0].value) }}"
      data-ng-hide="data.confirmationPending"
      class="status-{{ data.device.properties[1].value }}"></span>
                        <span translate="{{ 'DEVICE_STATE_OBSTRUCTED' }}"
                              data-ng-show="!data.confirmationPending && data.device.properties[1].value == 1"
                              class="status-{{ data.device.properties[1].value }}"></span>
                        <span translate="{{ 'DEVICE_STATE_CONFIRMATION_PENDING' }}"
                              data-ng-show="data.confirmationPending"></span></strong>
                </div>
                <div class="device-row">
                    <span translate="DEVICE_DETAIL_LABEL_DEVICE"></span> {{ slide.description }}
                </div>
                <div class="device-row">
                    <span translate="DEVICE_DETAIL_LABEL_HOME"></span> {{ data.homeName }}
                </div>
            </div>
        </div>
    </div>
    <div class="row flex-3" data-ng-if="slide.isDevice" >
        <div class="device-commands">
${commands}
        </div>
    </div>
    <div class="full-container" data-ng-if="slide.isScene">
        <div class="row flex-3">
            <div class="device-commands">
                <a class="command bg-blue-1" ng-click="playScene(scene.sceneId)"><span translate="{{ 'DEVICE_COMMANDS_LABEL_PLAY' }}"></span></a>
            </div>
        </div>
    </div>
</ion-slide>
</ion-slide-box>
</ion-content>
</ion-view>
`;
const COMMANDS = `            <a class="command bg-blue-{{ $index+1 }}" data-ng-repeat="item in data.device.automations[0].primaryCommands track by $index" data-ng-click="runCommand(item, true)">
                <span translate="{{ 'DEVICE_COMMAND_'+item }}"></span>
            </a>
            <a class="command bg-blue-4" data-ng-click="runCommand(data.device.automations[0].fourthButton.code, false)" data-ng-if="!nxExtra && data.device.automations[0].fourthButtonEnabled">
                <span translate="{{ 'DEVICE_COMMAND_'+data.device.automations[0].fourthButton.code }}"></span>
            </a>
            <div class="nx-extras" data-ng-if="nxExtra(data.device).length">
                <a class="command nx-extra" data-ng-repeat="code in nxExtra(data.device) track by code" data-ng-click="runCommand(code, false); nxSent(code)">
                    <span translate="{{ 'DEVICE_COMMAND_'+code }}"></span>
                </a>
            </div>
            <a class="nx-extra-edit" data-ng-if="nxCanQuick && nxCanQuick(data.device)" data-ng-click="nxEditQuick(data.device)"><span>Choose commands</span></a>`;
// the same after the workstream "Command feedback and trust" has changed the commands (the click goes through nxRun, roles and keys): patch-18 must not care
const COMMANDS_LATER = COMMANDS.replace('data-ng-click="runCommand(item, true)"', 'data-ng-click="nxRun ? nxRun(data.device, item, true, runCommand) : runCommand(item, true)" role="button" tabindex="0" data-ng-keydown="nxKey($event)"')
  .replace('data-ng-click="runCommand(code, false); nxSent(code)"', 'data-ng-click="nxRun(data.device, code, false, runCommand)" role="button" tabindex="0"')
  .replace('<div class="nx-extras" data-ng-if="nxExtra(data.device).length">', '<div class="nx-extras" role="group" data-ng-if="nxExtra(data.device).length">')
  .replace('<span>Choose commands</span>', '<span>{{ nxExtra(data.device).length ? \'Edit extra buttons\' : \'Add extra buttons\' }}</span>');

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate18-'));
  const www = path.join(tmp, 'assets', 'www');
  fs.mkdirSync(path.join(www, 'templates', 'system'), { recursive: true });
  const file = path.join(www, 'templates', 'system', 'device_detail.html');
  const run = () => cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-18-accessory-layout.py'), tmp], { encoding: 'utf8' });
  fs.writeFileSync(file, SLIDE(COMMANDS));
  const before = fs.readFileSync(file, 'utf8');
  const res = run();
  const t = fs.readFileSync(file, 'utf8');
  const out = res.stdout + res.stderr;
  ok('patch-18: it runs and says what it patched', res.status === 0 && /patched \(nx23 accessory layout\)/.test(res.stdout), out);

  // the state box
  ok('patch-18: the state is a box (.nx-state) without the hidden label; the three states of patch-11 keep their conditions, in the order that verify-apk.py wants (nxCheck before isDeviceReachable)',
    /<div class="nx-state">/.test(t) && !/DEVICE_DETAIL_LABEL_STATE/.test(t) && t.includes("nxCheck(data.device) && nxCheck(data.device) !== 'retry' && !isDeviceReachable(data.device)") &&
    t.includes("nxCheck(data.device) === 'retry' && !isDeviceReachable(data.device)") && t.includes('Connecting&hellip;') && !t.includes('!isDeviceReachable(data.device) && '));
  ok('patch-18: "Not usable" and the reachable state have classes (nx-unusable, nx-reach) and keep their conditions', /<strong class="nx-unusable" data-ng-show="!nxCheck\(data\.device\) && !isDeviceReachable\(data\.device\)">/.test(t) &&
    /<strong class="nx-reach" data-ng-show="isDeviceReachable\(data\.device\)">/.test(t));
  ok('patch-18: an obstruction is a chip with an icon and a role alert, on the same condition as before; the position word stays (it is demoted by the skin)', /<span class="nx-obst" role="alert" data-ng-show="!data\.confirmationPending && data\.device\.properties\[1\]\.value == 1"><i class="nx-obst-icon" aria-hidden="true"><\/i>Obstruction detected<\/span>/.test(t) &&
    !/DEVICE_STATE_OBSTRUCTED/.test(t) && /class="status-\{\{ data\.device\.properties\[1\]\.value \}\}"/.test(t));
  ok('patch-18: no "Accessory:" chip; "Home:" only with more than one home', !/DEVICE_DETAIL_LABEL_DEVICE/.test(t) && /<div class="nx-home" data-ng-if="nxManyHomes && nxManyHomes\(\)">\s*<span translate="DEVICE_DETAIL_LABEL_HOME"><\/span> \{\{ data\.homeName \}\}/.test(t) && !/class="device-row"/.test(t));

  // the Activity chip
  ok('patch-18: the entry to the Activity sheet is a button under the state word (inside .device-info, after the state box), with a spoken name; "Last:" before the command, "Activity" while there is none',
    /<button type="button" class="nx-last" data-ng-if="nxActivity" data-ng-click="nxActivity\(data\.device\)" aria-label="\{\{ nxLastSpoken \? nxLastSpoken\(data\.device\) : 'Activity' \}\}">/.test(t) &&
    t.indexOf('class="nx-state"') < t.indexOf('class="nx-last"') && t.indexOf('class="nx-last"') < t.indexOf('class="device-commands"') && /\{\{ nxLast\(data\.device\) \? 'Last: ' \+ nxLast\(data\.device\) : 'Activity' \}\}/.test(t) &&
    /nxLastStale && nxLastStale\(data\.device\)/.test(t));

  // the status line: the contract of the workstreams
  const line = (t.match(/<div class="nx-line"[\s\S]*?\n\s*<\/div>\n/) || [''])[0];
  const lineStart = (line.match(/<div class="nx-line"[^>]*>/) || [''])[0];
  ok('patch-18: the status line is always in the DOM: a plain div (no ng-if, ng-show, ng-hide), role status, aria-live polite that becomes assertive for a failure (nxLineLive, guarded)', lineStart.length > 0 && /role="status"/.test(lineStart) && lineStart.includes(`aria-live="{{ nxLineLive ? nxLineLive(data.device) : 'polite' }}"`) && !/ng-(if|show|hide|repeat)/.test(lineStart));
  ok('patch-18: ...with the bindings of the contract: data-nx-kind, data-nx-trust, data-nx-unsure (absent when not set)', lineStart.includes(`data-nx-kind="{{ nxLineKind ? nxLineKind(data.device) : '' }}"`) &&
    lineStart.includes(`data-nx-trust="{{ nxTrust ? nxTrust(data.device) : '' }}"`) && /ng-attr-data-nx-unsure="\{\{ \(nxUnsure && nxUnsure\(data\.device\)\) \? '1' : undefined \}\}"/.test(lineStart));
  ok('patch-18: ...its text (nxLine) and its optional real button (nxLineAct, click -> nxLineDo)', /<span class="nx-line-text" data-ng-if="nxLine && nxLine\(data\.device\)">\{\{ nxLine\(data\.device\) \}\}<\/span>/.test(line) &&
    /<button type="button" class="nx-line-act" data-ng-if="nxLineAct && nxLineAct\(data\.device\)" data-ng-click="nxLineDo\(data\.device\)">\{\{ nxLineAct\(data\.device\) \}\}<\/button>/.test(line));
  ok('patch-18: ...directly above the pad of the accessory (nothing but white space between), and not above the pad of a scene', /<\/div>\s*<div class="device-commands">\s*<a class="command bg-blue-\{\{ \$index\+1 \}\}"/.test(t.slice(t.indexOf('class="nx-line"'))) &&
    t.split('class="nx-line"').length === 2);
  // every call of a function that another workstream offers is guarded: in the attributes (the text and the button are inside elements with a guard of their own)
  const attrs = Array.from(t.matchAll(/<[^>]*>/g)).flatMap((m) => Array.from(m[0].matchAll(/([\w-]+)="([^"]*)"/g)).map((a) => ({ tag: m[0], name: a[1], value: a[2] })));
  const unguarded = [];
  for (const n of ['nxLine', 'nxLineKind', 'nxLineAct', 'nxLineDo', 'nxTrust', 'nxUnsure']) {
    for (const a of attrs) {
      if (!new RegExp('\\b' + n + '\\(').test(a.value)) continue;
      const guard = new RegExp('\\b' + n + ' (&&|\\?)').test(a.value) || (n === 'nxLineDo' && /data-ng-if="nxLineAct && nxLineAct\(data\.device\)"/.test(a.tag));
      if (!guard) unguarded.push(n + ' in ' + a.name);
    }
  }
  ok('patch-18: every call of nxLine, nxLineKind, nxLineAct, nxLineDo, nxTrust and nxUnsure in an attribute is guarded (without that workstream the line shows what the screen knows by itself); the text and the button sit in elements with a guard',
    unguarded.length === 0 && attrs.some((a) => /\bnxLineKind\(/.test(a.value)) && /<span class="nx-line-text" data-ng-if="nxLine && nxLine/.test(t) && /<button type="button" class="nx-line-act" data-ng-if="nxLineAct && nxLineAct/.test(t), unguarded.join(', '));
  ok('patch-18: the resting content, in the order of the contract: the pill of a blocked gate (a button, to the Activity sheet; dashed when maybe), "Gate state unknown", the note of a settled state; each only when nxLine has nothing to say',
    /<button type="button" class="nx-pill nx-block" data-ng-if="!\(nxLine && nxLine\(data\.device\)\) && nxBlock && nxBlock\(data\.device\)" data-ng-class="\{ 'nx-maybe': nxBlockMaybe && nxBlockMaybe\(data\.device\) \}"/.test(line) &&
    /data-ng-click="nxActivity\(data\.device\)" aria-label="\{\{ nxBlock\(data\.device\) \}\}\. Opens the history\."/.test(line) && /class="nx-unknown" data-ng-if="!\(nxLine && nxLine\(data\.device\)\) && !\(nxBlock && nxBlock\(data\.device\)\) && nxUnknown && nxUnknown\(data\.device\)"/.test(line) &&
    /class="nx-settled" data-ng-if="!\(nxLine && nxLine\(data\.device\)\) && !\(nxBlock && nxBlock\(data\.device\)\) && !\(nxUnknown && nxUnknown\(data\.device\)\) && nxSettled && nxSettled\(data\.device\)"/.test(line) &&
    line.indexOf('nx-pill') < line.indexOf('nx-unknown') && line.indexOf('nx-unknown') < line.indexOf('nx-settled'));

  // the extras and the commands
  ok('patch-18: the extras block has a caption and a name (role group, aria-label) and keeps its own start tag and everything else', /<div class="nx-extras" data-ng-if="nxExtra\(data\.device\)\.length" role="group" aria-label="Extra buttons">\s*<div class="nx-extras-cap" aria-hidden="true">Extra buttons<\/div>\s*<a class="command nx-extra"/.test(t));
  ok('patch-18: it does not touch the commands: the clicks, the link to choose commands, the scene\'s pad are byte for byte what they were', ['data-ng-click="runCommand(item, true)"', 'data-ng-click="runCommand(code, false); nxSent(code)"', 'data-ng-click="runCommand(data.device.automations[0].fourthButton.code, false)"',
    'data-ng-click="nxEditQuick(data.device)"', '<a class="command bg-blue-1" ng-click="playScene(scene.sceneId)">'].every((s) => t.includes(s)));

  // idempotent, all or nothing
  const res2 = run();
  ok('patch-18: a second run stops ("already patched") and changes nothing', res2.status !== 0 && /already patched/.test(res2.stdout + res2.stderr) && fs.readFileSync(file, 'utf8') === t);
  const bad = (text) => { fs.writeFileSync(file, text); const x = run(); return { x, untouched: fs.readFileSync(file, 'utf8') === text }; };
  const noExtras = bad(SLIDE(COMMANDS.replace('<div class="nx-extras"', '<div class="nx-more"')));
  ok('patch-18: without the extras block of patch-12 it stops and writes nothing', noExtras.x.status !== 0 && /extra commands block/.test(noExtras.x.stdout + noExtras.x.stderr) && noExtras.untouched);
  const noPad = bad(SLIDE(COMMANDS).replace('<div class="row flex-3" data-ng-if="slide.isDevice" >', '<div class="row flex-3">'));
  ok('patch-18: without the pad row of the accessory it stops and writes nothing', noPad.x.status !== 0 && /pad of the accessory/.test(noPad.x.stdout + noPad.x.stderr) && noPad.untouched);
  const noState = bad(SLIDE(COMMANDS).replace("'DEVICE_STATE_OBSTRUCTED'", "'SOMETHING_ELSE'"));
  ok('patch-18: without the obstruction span it stops and writes nothing', noState.x.status !== 0 && /obstruction span/.test(noState.x.stdout + noState.x.stderr) && noState.untouched);
  const noP15 = bad(SLIDE(COMMANDS).replace(/nxState/g, 'zzState'));
  ok('patch-18: before patch-15 (no nxState in the template) it stops and says which patch to run first', noP15.x.status !== 0 && /patch-15/.test(noP15.x.stdout + noP15.x.stderr) && noP15.untouched);

  // the commands of the other workstream (nxRun, roles, keys, other link text): it still works, and leaves them alone; a role that is there already is not doubled
  fs.writeFileSync(file, SLIDE(COMMANDS_LATER));
  const res3 = run();
  const t3 = fs.readFileSync(file, 'utf8');
  ok('patch-18: with the commands as the workstream "Command feedback and trust" will leave them (nxRun, role, tabindex, keys, another link text) it works and leaves every attribute of the commands as it is', res3.status === 0 &&
    t3.includes('data-ng-click="nxRun ? nxRun(data.device, item, true, runCommand) : runCommand(item, true)" role="button" tabindex="0" data-ng-keydown="nxKey($event)"') && t3.includes('data-ng-click="nxRun(data.device, code, false, runCommand)" role="button" tabindex="0"') &&
    t3.includes("{{ nxExtra(data.device).length ? 'Edit extra buttons' : 'Add extra buttons' }}"), res3.stdout + res3.stderr);
  ok('patch-18: ...and a group that has its role already does not get a second one', (t3.match(/<div class="nx-extras"[^>]*>/) || [''])[0].split('role=').length === 2 && /aria-label="Extra buttons"/.test(t3) === false);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('patch-18: the file is not in the app before the script ran (the invented input was not changed by the test itself)', before.indexOf('nx-state') === -1);
}
{
  const build = read('build.sh');
  ok('build.sh runs patch-18-accessory-layout.py after patch-17-gallery.py and before the next one', /patch-17-gallery\.py patch-18-accessory-layout\.py patch-19-lists\.py/.test(build.replace(/\s*\\\n\s*/g, ' ')));
  const p14 = read('patch-14-activity.py'), p15 = read('patch-15-state.py');
  ok('patch-14 and patch-15 no longer put rows in the accessory screen (patch-18 makes it); the line of the last command, the pill and the note are not in them', !/nx-last-row|nx-block-row|nx-settled|nx-last-chev/.test(p14 + p15) && /nxIcon/.test(p15) && /nx-activity\.js/.test(p14));
}

// ------------------------------------------------------------------------------------------------ nx-activity.js: what the screen asks (jsdom)
(async function () {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('   skipped: jsdom is missing (the functions of nx-activity.js are not tested)'); finish(); return; }
  const SRC = read('nx-activity.js');
  const A = require('../nx-activity.js');
  const D = (day, h, m, s) => new Date(2026, 10, day, h, m, s || 0).getTime();
  const NOW = D(7, 14, 30);
  const MAC = '00:0B:6C:AA:BB:CC';
  const USERS = [{ id: 1, controllerID: 'CTRL-ANNA-0001', username: 'Anna' }];
  const LOG = { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'close', time: D(7, 14, 12) }], interfaceLogs: [] };
  // scen: { properties, reachable, logs, homes (HomeService.homes), nxCheck, noTranslate, names }
  async function environment(scen) {
    scen = scen || {};
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    for (const k of Object.keys(scen.storage || {})) w.localStorage.setItem(k, scen.storage[k]);
    w.Date.now = () => (scen.now || NOW);
    w.__nxActivityPrefetchMs = 20;
    const $rootScope = { $on() {}, $evalAsync() {} };
    if (scen.nxCheck) $rootScope.nxCheck = scen.nxCheck;
    const services = {};
    if (!scen.noTranslate) services.$translate = { instant: (k) => (scen.names && scen.names[k]) || k };
    if (scen.homes !== undefined) services.HomeService = { homes: scen.homes };
    const inj = { has: (n) => n in services, get: (n) => services[n] };
    const NHK = { logs: () => Promise.resolve(scen.logs || LOG), pairings: () => Promise.resolve({ activeUsers: USERS, waitingUsers: [] }) };
    const dev = { mac: MAC, homeId: 1, description: 'AABBCC', reachable: scen.reachable !== false, pairingUsername: 'Anna', properties: scen.properties || [{ value: 'closed' }, { value: '0' }],
      automations: [{ id: '1', type: 'sliding', properties: [] }] };
    w.eval(SRC);
    const act = w.__nxActivity({ inj, $rootScope, NHK, log() {}, toast() {}, liveDevice: () => dev, findDevice: () => dev, copy() {} });
    return { w, dev, act, $rootScope };
  }
  const readLog = (env) => new Promise((r) => env.act.refresh(env.dev, r));
  const R = (env) => env.$rootScope;

  ok('NX_WORDS: the words of the pill, the note and "unknown" are in one place, and the module exports them', A.NX_WORDS && A.NX_WORDS.blocked === 'Blocked' && A.NX_WORDS.maybeBlocked === 'Maybe blocked' && A.NX_WORDS.since === 'since' &&
    A.NX_WORDS.unknown === 'Gate state unknown' && /\{state\}/.test(A.NX_WORDS.settled) && /^  var NX_WORDS = \{/m.test(SRC.slice(0, 1800)));
  {
    const e = await environment({ properties: [{ value: 'partial' }, { value: '0' }] });
    ok('nxState: a state that the app has no word for (partial, nothing, nonsense) is "unknown", the known ones stay as they are, no device is no answer',
      R(e).nxState(e.dev) === 'unknown' && ['open', 'closed', 'opening', 'closing', 'stopped', 'unknown'].every((s) => { e.dev.properties = [{ value: s }, { value: '0' }]; return R(e).nxState(e.dev) === s; }) &&
      (e.dev.properties = [{ value: '' }, { value: '0' }], R(e).nxState(e.dev) === 'unknown') && (e.dev.properties = [{ value: 'OPEN' }, { value: '0' }], R(e).nxState(e.dev) === 'unknown') &&
      (e.dev.properties = [], R(e).nxState(e.dev) === 'unknown') && R(e).nxState(null) === undefined && R(e).nxState(undefined) === undefined);
    e.dev.properties = [{ value: 'partial' }, { value: '1' }];
    ok('nxIcon: for such a state the class of the icon says unknown, in the app\'s own form with the obstruction flag; for a known state it answers nothing (the app\'s function decides)', R(e).nxIcon(e.dev) === 'icon-i_gat005 unknown status-1' &&
      (e.dev.properties = [{ value: 'closed' }, { value: '0' }], R(e).nxIcon(e.dev) === '') && R(e).nxIcon(null) === '' && (e.dev.automations[0].type = 'sectional', e.dev.properties = [{ value: '' }, { value: '0' }], R(e).nxIcon(e.dev) === 'icon-i_gat006 unknown status-0'));
  }
  {
    const e = await environment({ reachable: false });
    ok('nxUnknown: "Not usable" (not reachable, nothing running) says "Gate state unknown"', R(e).nxUnknown(e.dev) === 'Gate state unknown');
    const c = await environment({ reachable: false, nxCheck: () => 'checking' });
    const r = await environment({ reachable: false, nxCheck: () => 'retry' });
    ok('nxUnknown: while the app checks or connects the word says so by itself: nothing more', R(c).nxUnknown(c.dev) === '' && R(r).nxUnknown(r.dev) === '');
    const p = await environment({ properties: [{ value: 'partial' }, { value: '0' }] });
    const k = await environment({ properties: [{ value: 'closed' }, { value: '0' }] });
    ok('nxUnknown: a reachable accessory that reports a state nobody knows is unknown too; a known state is not, and neither is no device', R(p).nxUnknown(p.dev) === 'Gate state unknown' && R(k).nxUnknown(k.dev) === '' && R(k).nxUnknown(null) === '' && R(k).nxUnknown(undefined) === '');
    const h = await environment({ reachable: false, nxCheck: () => '' });
    h.dev.reachable = true; h.dev.properties = [{ value: 'open' }, { value: '0' }];
    ok('nxUnknown: it follows the flag of the live device (a check that succeeds clears it)', R(h).nxUnknown(h.dev) === '');
  }
  {
    // the pill: certain and maybe, in words
    const sure = await environment({ storage: { nxBlock: JSON.stringify({ [MAC]: { blocked: true, at: D(7, 9, 37), code: 'MDBk', who: 'Anna' } }) }, logs: { deviceLogs: [], interfaceLogs: [] } });
    ok('nxBlock: "Blocked · since 09:37", and nxBlockMaybe is false', R(sure).nxBlock(sure.dev) === 'Blocked · since 09:37' && R(sure).nxBlockMaybe(sure.dev) === false);
    const maybe = await environment({ storage: { nxBlock: JSON.stringify({ [MAC]: { blocked: true, at: D(7, 9, 0), code: 'MDBk', who: 'Anna' } }) }, logs: { deviceLogs: [], interfaceLogs: [{ source: 'boot', type: 'Power ON', time: D(7, 10, 0) }] } });
    await readLog(maybe);
    ok('nxBlock: a restart of the accessory after the Block makes it "Maybe blocked · since 09:00" (no question mark), and nxBlockMaybe says so', R(maybe).nxBlock(maybe.dev) === 'Maybe blocked · since 09:00' && R(maybe).nxBlockMaybe(maybe.dev) === true && !/\?/.test(R(maybe).nxBlock(maybe.dev)));
    const none = await environment({});
    ok('nxBlock: no Block, no pill, no error, also without a device', R(none).nxBlock(none.dev) === '' && R(none).nxBlockMaybe(none.dev) === false && R(none).nxBlock(null) === '' && R(none).nxBlockMaybe(null) === false);
  }
  {
    // the note of a settled state
    const mov = { deviceLogs: [{ source: 'CTRL-ANNA-0001', type: 'MDBk', time: NOW - 20 * 60000 }, { source: 'busT4', type: 'open', time: NOW - 20 * 60000 + 1000 }] };
    const e = await environment({ properties: [{ value: 'opening' }, { value: '0' }], logs: mov, names: { DEVICE_STATE_opening: 'Opening' } });
    await readLog(e);
    ok('nxSettled: "Accessory says Opening; the log shows it finished." (the app\'s word for the state, one line at 360 dp), nothing when the state is not settled', R(e).nxState(e.dev) === 'open' && R(e).nxSettled(e.dev) === 'Accessory says Opening; the log shows it finished.' &&
      R(e).nxSettled(e.dev).length <= 52 && (e.dev.properties = [{ value: 'open' }, { value: '0' }], R(e).nxSettled(e.dev) === ''));
  }
  {
    // the entry to the Activity sheet
    const e = await environment({ names: { DEVICE_COMMAND_close: 'Close' } });
    ok('nxLastSpoken / nxLastStale: before the log is read: "Activity. Opens the history.", no age', R(e).nxLastSpoken(e.dev) === 'Activity. Opens the history.' && R(e).nxLastStale(e.dev) === '' && R(e).nxLastSpoken(null) === 'Activity. Opens the history.');
    await readLog(e);
    ok('nxLastSpoken: with the log: "Activity. Last command: Close by Anna, today 14:12. Opens the history."; the visible line (nxLast) is unchanged', R(e).nxLastSpoken(e.dev) === 'Activity. Last command: Close by Anna, today 14:12. Opens the history.' &&
      R(e).nxLast(e.dev) === 'Close · today 14:12 · Anna', R(e).nxLastSpoken(e.dev));
    ok('nxLastStale: "" while the log is fresh', R(e).nxLastStale(e.dev) === '');
    e.w.Date.now = () => NOW + 61000;
    ok('nxLastStale: the time of the reading when it is more than a minute old, and the spoken name says so', R(e).nxLastStale(e.dev) === '14:30' && /\(log read at 14:30\)/.test(R(e).nxLastSpoken(e.dev)), R(e).nxLastStale(e.dev));
    e.w.Date.now = () => NOW + 59000;
    ok('nxLastStale: not before that', R(e).nxLastStale(e.dev) === '');
  }
  {
    const two = await environment({ homes: [{ homeId: 1 }, { homeId: 2 }] }), one = await environment({ homes: [{ homeId: 1 }] }), noSvc = await environment({}), broken = await environment({ homes: 'nonsense' });
    ok('nxManyHomes: true with more than one home, false with one, without the service and with nonsense (it never throws)', R(two).nxManyHomes() === true && R(one).nxManyHomes() === false && R(noSvc).nxManyHomes() === false && R(broken).nxManyHomes() === false);
    ok('everything that the template asks of this file is offered as $rootScope.nxName =', ['nxBlock', 'nxBlockMaybe', 'nxState', 'nxIcon', 'nxSettled', 'nxUnknown', 'nxLastSpoken', 'nxLastStale', 'nxManyHomes'].every((n) => new RegExp('\\$rootScope\\.' + n + ' = function').test(SRC)));
  }
  finish();
})();

function finish() {
  console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
  process.exit(failures ? 1 : 0);
}
