// Test of what nx23 QA (screens) found in the merged build: places where two workstreams said the same thing in two voices, and two CSS defects of the lists. All data is made up.
//   A. the wording of the alert after a failed command says what the line on the accessory screen says, with one verb ("check the gate")
//   B. one name for the page of the other commands, the event history, the loading messages (copy.json, templates.json)
//   C. the cause of a failure without the sentence about "a command that was just sent" (nx-patch.js section nx23 copy; jsdom)
//   D. the line on the accessory screen names who moved the gate as the Activity sheet does (nx-activity.js)
//   E. the CSS of the lists: the glyph of the settings button has the color of its button; a field that is always disabled is not dimmed
// Run:  NODE_PATH=<folder with node_modules/jsdom> node test/nx23-qa-screens.test.js      (part C needs jsdom; the rest runs without)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('skipped: part C needs jsdom (npm install, or point NODE_PATH at a folder with node_modules/jsdom)'); }

const COPY = JSON.parse(read('skin/copy/copy.json'));
const T = {};
Object.keys(COPY).forEach((k) => { if (k[0] !== '_') T[k.replace(/^\+/, '')] = COPY[k]; });
const PATCH = read('nx-patch.js');

// ------------------------------------------------------------------------------------------------ A. failure alerts and the line on the gate screen
{
  const MAY = ['NHK_ERROR-TIMEOUT', 'NHK_ERROR-BAD_RESPONSE', 'NHK_ERROR-COMM_ERR'];
  ok('the line on the accessory screen says that a command without an answer "may have arrived: check the gate"', /No answer to ' \+ name \+ '\. It may have arrived: check the gate\./.test(PATCH));
  ok('...and so does the alert after a timeout, an unreadable answer and a failed exchange (the first draft said "may not have arrived", which the line corrects)', MAY.every((k) => /it may have arrived: check the gate/.test(T[k]) && !/may not have arrived/.test(T[k])), MAY.map((k) => T[k]).join(' | '));
  ok('one verb: no text of copy.json says "look at the gate" (the line, the unknown error and the alerts say "check the gate")', !Object.keys(T).some((k) => /look at the gate/i.test(T[k])) && /Check the gate\./.test(PATCH));
  ok('a code without a text still gets one sentence from the wrapper, with the same verb', /'The accessory reported error ' \+ code \+ '\. Check the gate\.'/.test(PATCH));
  ok('code 15 (the accessory is not ready) has one sentence like the line says ("not ready yet"), and the wrong code of the setup has no exclamation mark', T['NHK_ERROR-15'] === 'The accessory is not ready yet. Wait a moment, then try again.' && !/!/.test(T['NHK_ERROR-2_WRONG_CODE']) && /(not correct|wrong)/i.test(T['NHK_ERROR-2_WRONG_CODE']));
  ok('the general network error has no comma after "Please" and ends with a full stop', T.ADD_NEW_DEVICE_MSG_NETWORK_ERROR === 'A network error occurred. Please try again.');
}

// ------------------------------------------------------------------------------------------------ B. one name per thing
{
  ok('the page of the other commands has the name of the button that opens it ("More commands", the accessible name of the glyph in nx-patch.js), also for the permissions of users',
    T.DEVICE_COMMANDS_LABEL_OTHER_COMMANDS === 'More commands' && T.DEVICE_USERS_QUALIFICATIONS_LABEL_SECONDARY_COMMANDS === 'More commands' && /nameIt\(el, 'More commands'\)/.test(PATCH));
  ok('the pages of the event history are called "Accessory events" and "Scene events" (the rows and the titles say the same)', T.DEVICES_LOGS_PAGE_TITLE === 'Accessory events' && T.LOGS_PAGE_DEVICES_LOGS === 'Accessory events' && T.SCENES_LOGS_PAGE_TITLE === 'Scene events' && T.LOGS_PAGE_SCENES_LOGS === 'Scene events');
  const dots = Object.keys(T).filter((k) => /\.\.\./.test(T[k]));
  ok('no English text of copy.json has three dots: one ellipsis (the loading messages of every wait included)', dots.length === 0, dots.join(', '));
  ok('the messages of the loading overlay are in copy.json, with the one-character ellipsis', ['COMMON_MSG_LOADING', 'SAVING', 'ONGOING_VERIFY', 'ONGOING_CANCEL', 'BINDING_IN_PROGRESS', 'ADD_DEVICE_SETUP_WAITING_MSG_JOIN_HOME_NETWORK'].every((k) => /…$/.test(T[k] || '')), 'COMMON_MSG_LOADING=' + T.COMMON_MSG_LOADING);
  ok('a wait says Accessory where it said Device (detection, check, deletion)', /^Accessories being detected…$/.test(T.ONGOING_DETECTION) && /^Accessory being checked…$/.test(T.ONGOING_VERIFY_DEVICE) && /^Accessory being deleted…$/.test(T.ONGOING_CANCEL_DEVICE));
  ok('the confirmations of the reset, of the configuration and of allowing a user are sentences with a full stop or a question mark', /erased\.$/.test(T.SETTINGS_PAGE_ALERT_RESET_APP) && /minute\.$/.test(T.ADD_NEW_DEVICE_CONFIRM_RESET_HAP) && /\?$/.test(T.DEVICE_USERS_ASSOCIATION_ALERT_ENROLL_USER) && !/sure to allow/.test(T.DEVICE_USERS_ASSOCIATION_ALERT_ENROLL_USER));
  const tpl = JSON.parse(read('skin/copy/templates.json'));
  const e = tpl.filter((x) => x.file === 'templates/first_setup/add_device_setup_name.html' && /item-divider/.test(x.old));
  ok('the page "Identify accessory" has no divider that says the name of its only field again (one edit of templates.json, as the others: the element is taken out)', e.length === 1 && /ADD_DEVICE_SETUP_NAME_LABEL_NAME/.test(e[0].old) && /data-ng-if="false"/.test(e[0].new) && e[0].new.indexOf(e[0].old) === -1);
}

// ------------------------------------------------------------------------------------------------ C. the cause of a failure
(function () {
  if (!JSDOM) return;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.console.log = function () {};
  w.angular = { element: () => ({ injector: () => ({ has: () => false, get: () => null }) }) };
  w.__nxGraceMs = 1e9; w.__nxFirstWaitMs = 0; w.__nxKickoffMs = 1e9;
  w.eval(PATCH);
  const C = w.__nxCopy && w.__nxCopy.cause;
  ok('nx-patch.js offers the cause of a failure (window.__nxCopy.cause)', typeof C === 'function');
  if (typeof C !== 'function') return;
  const failures = Object.keys(T).filter((k) => /^NHK_ERROR/.test(k) && /If you just sent a command/.test(T[k]));
  ok('every text of copy.json that has the sentence about a command gives a cause of one sentence without it, naming the accessory', failures.length >= 8 && failures.every((k) => { const c = C(T[k]); return !/command/i.test(c) && /accessory/i.test(c) && /\.$/.test(c) && (c.match(/\./g) || []).length === 1; }), failures.filter((k) => /command/i.test(C(T[k]))).join(', '));
  ok('a code 3 reads "The connection to the accessory was lost."', C(T['NHK_ERROR-3']) === 'The connection to the accessory was lost.', C(T['NHK_ERROR-3']));
  ok('a text without that sentence, an empty text and a missing text come back as they are', C('Sign not valid') === 'Sign not valid' && C('') === '' && C(null) === '' && C(undefined) === '' && C('The accessory is full.') === 'The accessory is full.');
})();

// ------------------------------------------------------------------------------------------------ D. who moved the gate
{
  const A = require('../nx-activity.js');
  const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);
  const label = (t) => ({ open: 'Open', close: 'Close' }[t] || t);
  const line = (src, users) => A.lastLine(A.analyze({ deviceLogs: [{ source: src, type: 'close', time: NOW - 60000 }] }, users || [], NOW), label, NOW);
  ok('the line on the accessory screen says "At the gate" for the gate controller (the sheet that opens from it says so)', /· At the gate$/.test(line('busT4')), line('busT4'));
  ok('...and "Another phone" for a controller that is not one of the users (not "Other (6F9E1C2A)")', /· Another phone$/.test(line('6f9e1c2a99887766')), line('6f9e1c2a99887766'));
  ok('...and "Schedule" for the schedule as before', /· Schedule$/.test(line('scheduler')), line('scheduler'));
}

// ------------------------------------------------------------------------------------------------ E. CSS of the lists
{
  const css = read('skin/src/nx23-lists.css');
  ok('the glyph of the settings button on the page of the other commands has the color of its button (the original paints it white: 1.2:1 on the pale circle of the light theme)',
    /\.bar \.button > \.icon-settings \{[^}]*color: var\(--_fg\) !important;/.test(css) && /\.bar \.button > \.icon-settings:before \{[^}]*background: currentColor;/.test(css));
  ok('a field that is disabled in the template for good (data-ng-disabled="true": the name on "Identify accessory") is not dimmed to .38, one that is disabled by the state is',
    /\.item-input:has\(input:disabled:not\(\[data-ng-disabled="true"\]\), select:disabled, textarea:disabled\)/.test(css) && /opacity: \.38;/.test(css));
  const tpl = read('skin/copy/templates.json');
  ok('the template of that page does disable its field in the markup (so that the exception above is the one that is meant)', /ADD_DEVICE_SETUP_NAME_LABEL_NAME/.test(tpl));
}

console.log(failures ? 'FAILED: ' + failures + ' of ' + total : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
