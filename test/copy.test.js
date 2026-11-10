// Test of patch-21-copy.py (nx23: the English wording of the original app, and the titles of its pages) on an invented app tree. All texts are made up.
// Run:  node test/copy.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let failures = 0, total = 0;
function ok(name, condition, extra) {
  total++;
  if (!condition) failures++;
  console.log((condition ? 'ok    ' : 'FAIL  ') + name + (condition || extra === undefined ? '' : '  -> ' + extra));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copy21-'));
const www = path.join(tmp, 'app', 'assets', 'www');
const i18n = path.join(www, 'i18n');
const dir = path.join(tmp, 'copy');
fs.mkdirSync(i18n, { recursive: true });
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(path.join(www, 'templates', 'first_setup'), { recursive: true });
const EN = '{\n  "A_TITLE" : "Enter Name e Description",\n  "B_BUTTON" : "OK",\n\n  "C_NOTE" : "Say \\"hi\\" now",\n  "D_LONG" : "Line one\\nline two"\n}\n';
const NL = '{\n  "A_TITLE" : "Voer naam in",\n  "B_BUTTON" : "OK"\n}\n';
const enPath = path.join(i18n, 'locale-en.json'), nlPath = path.join(i18n, 'locale-nl.json');
// two templates of an invented app: one with a raw id as a title (Unix line ends), one with a divider that repeats the title (Windows line ends, as some files of the original have)
const TPL = { 'templates/first_setup/start.html': '<ion-view class="light" hide-nav-bar="false" title="start" >\n  <ion-content>\n    <a href="#/start-email">go</a>\n  </ion-content>\n</ion-view>\n',
  'templates/first_setup/list.html': '<ion-view title="{{ \'LIST_TITLE\' | translate }}">\r\n  <div class="list">\r\n    <span class="item item-divider" translate="LIST_TITLE"></span>\r\n    <a class="item">one</a>\r\n  </div>\r\n</ion-view>\r\n' };
const tplPath = (rel) => path.join(www, ...rel.split('/'));
const tpl = (rel) => fs.readFileSync(tplPath(rel), 'utf8');
const reset = () => {
  fs.writeFileSync(enPath, EN); fs.writeFileSync(nlPath, NL);
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f));
  for (const [rel, text] of Object.entries(TPL)) fs.writeFileSync(tplPath(rel), text);
};
const put = (name, text) => fs.writeFileSync(path.join(dir, name), typeof text === 'string' ? text : JSON.stringify(text));
const run = () => cp.spawnSync('python3', ['-I', path.join(ROOT, 'patch-21-copy.py'), path.join(tmp, 'app')], { encoding: 'utf8', env: Object.assign({}, process.env, { NX_COPY_DIR: dir }) });
const en = () => fs.readFileSync(enPath, 'utf8');

reset();
let r = run();
ok('no files: it does nothing and succeeds', r.status === 0 && /nothing to do/.test(r.stdout) && en() === EN, r.stdout + r.stderr);

put('a.json', { _about: 'a comment', A_TITLE: 'Enter name and description', C_NOTE: 'Say "hello" – now…' });
put('b.json', { B_BUTTON: 'Done' });
r = run();
let after = en();
let parsed = JSON.parse(after);
ok('it replaces the wanted texts and says how many', r.status === 0 && /patched \(nx23 copy\): 3 texts/.test(r.stdout), r.stdout + r.stderr);
ok('the values are what was asked (quotes, dash and ellipsis included)', parsed.A_TITLE === 'Enter name and description' && parsed.B_BUTTON === 'Done' && parsed.C_NOTE === 'Say "hello" – now…', after);
ok('texts that were not asked for stay as they were', parsed.D_LONG === 'Line one\nline two');
ok('the layout of the file stays (same number of lines, the same "KEY" : "value" form)', after.split('\n').length === EN.split('\n').length && /"A_TITLE" : "Enter name and description"/.test(after) && /^\{\n/.test(after) && /\n\}\n$/.test(after));
ok('the other languages are not touched', fs.readFileSync(nlPath, 'utf8') === NL);
const second = run();
ok('a second run stops ("already patched") and changes nothing', second.status !== 0 && /already patched/.test(second.stdout + second.stderr) && en() === after);

// all or nothing
const bad = (name, files, rx) => {
  reset();
  for (const [f, t] of Object.entries(files)) put(f, t);
  const x = run();
  ok(name, x.status !== 0 && rx.test(x.stdout + x.stderr) && en() === EN && fs.readFileSync(nlPath, 'utf8') === NL, x.stdout + x.stderr);
};
bad('a key that is not in locale-en.json stops it and writes nothing', { 'a.json': { B_BUTTON: 'Done', NOPE: 'x' } }, /NOPE/);
bad('an empty text stops it and writes nothing', { 'a.json': { B_BUTTON: ' ' } }, /non-empty string/);
bad('a text that is not a string stops it and writes nothing', { 'a.json': { B_BUTTON: 5 } }, /non-empty string/);
bad('two files with different texts for one key stop it and write nothing', { 'a.json': { B_BUTTON: 'Done' }, 'b.json': { B_BUTTON: 'Finished' } }, /different texts/);
bad('invalid JSON stops it and writes nothing', { 'a.json': '{ "B_BUTTON": ' }, /not valid JSON/);
bad('a file that is not an object stops it and writes nothing', { 'a.json': '["x"]' }, /JSON object/);
reset(); put('a.json', { B_BUTTON: 'Done' }); put('b.json', { B_BUTTON: 'Done', A_TITLE: 'Name' });
r = run();
ok('two files may give the same text for a key', r.status === 0 && JSON.parse(en()).B_BUTTON === 'Done' && JSON.parse(en()).A_TITLE === 'Name', r.stdout + r.stderr);

// a key that the file does not have yet: "+KEY" (a code of an error that the app never translated)
{
  const EN2 = '{\n  "A_TITLE" : "Enter Name e Description",\n  "B_BUTTON" : "OK",\n  "LAST": "end"\n}';      // no newline after the closing brace
  reset(); fs.writeFileSync(enPath, EN2);
  put('a.json', { '+NEW_ONE': 'A new text, with "quotes" and …', B_BUTTON: 'Done' });
  r = run();
  let o = JSON.parse(en());
  ok('+KEY adds a key that is not in the file, and says so', r.status === 0 && /patched \(nx23 copy\): 2 texts in locale-en\.json \(1 files\), 1 of them new keys/.test(r.stdout) && o.NEW_ONE === 'A new text, with "quotes" and …' && o.B_BUTTON === 'Done', r.stdout + r.stderr + en());
  ok('the new key is a line at the end, in the style of the file, and the rest stays', en() === '{\n  "A_TITLE" : "Enter Name e Description",\n  "B_BUTTON" : "Done",\n  "LAST": "end",\n  "NEW_ONE": "A new text, with \\"quotes\\" and …"\n}', en());
  const again = run();
  ok('a second run with a new key says "already patched" and changes nothing', again.status !== 0 && /already patched/.test(again.stdout + again.stderr) && JSON.parse(en()).NEW_ONE === 'A new text, with "quotes" and …' && Object.keys(JSON.parse(en())).length === 4);
  reset(); put('a.json', { '+B_BUTTON': 'Done' }); r = run();
  ok('+KEY for a key that is there replaces it, as a plain key does', r.status === 0 && JSON.parse(en()).B_BUTTON === 'Done' && Object.keys(JSON.parse(en())).length === 4 && !/new keys/.test(r.stdout), r.stdout + r.stderr);
  reset(); put('a.json', { '+NEW_ONE': 'x1' }); put('b.json', { NEW_ONE: 'x1' }); r = run();
  ok('"+KEY" in one file and "KEY" in another with the same text are one text', r.status === 0 && JSON.parse(en()).NEW_ONE === 'x1', r.stdout + r.stderr);
  bad('"+KEY" in one file and "KEY" in another with different texts stop it', { 'a.json': { '+NEW_ONE': 'x1' }, 'b.json': { NEW_ONE: 'x2' } }, /different texts/);
  bad('a plain key that is not in the file still stops it (a typo is not a new key)', { 'a.json': { NEW_ONE: 'x1' } }, /NEW_ONE/);
  bad('a bare plus sign stops it', { 'a.json': { '+': 'x1' } }, /needs a name/);
  bad('an empty text for a new key stops it', { 'a.json': { '+NEW_ONE': '  ' } }, /non-empty string/);
  reset(); fs.writeFileSync(enPath, '{}'); put('a.json', { '+NEW_ONE': 'x1' }); r = run();
  ok('a new key in an empty file works too', r.status === 0 && JSON.stringify(JSON.parse(en())) === '{"NEW_ONE":"x1"}', r.stdout + r.stderr + en());
}

// the edits of templates: templates.json is a list of { file, old, new }
{
  const START = 'templates/first_setup/start.html', LIST = 'templates/first_setup/list.html';
  const edit = (file, old, nw, more) => Object.assign({ file, old, new: nw }, more || {});
  const TITLE = edit(START, 'title="start"', 'title=" "');
  const DIVIDER = edit(LIST, 'class="item item-divider" translate="LIST_TITLE"', 'class="item item-divider" data-ng-if="false" translate="LIST_TITLE"');
  const unchanged = () => en() === EN && fs.readFileSync(nlPath, 'utf8') === NL && Object.entries(TPL).every(([rel, text]) => tpl(rel) === text);

  reset(); put('templates.json', [TITLE, DIVIDER]);
  r = run();
  ok('it replaces the old text of each edit and says how many', r.status === 0 && /patched \(nx23 copy\): 2 edits in 2 templates \(1 files\)/.test(r.stdout), r.stdout + r.stderr);
  ok('only the old text changes; the rest of the template stays as it was', tpl(START) === TPL[START].replace('title="start"', 'title=" "') && tpl(LIST) === TPL[LIST].replace('translate="LIST_TITLE"></span>', 'data-ng-if="false" translate="LIST_TITLE"></span>'), tpl(START) + tpl(LIST));
  ok('the line ends of a template stay (Windows and Unix)', !/\r\n/.test(tpl(START)) && tpl(LIST).split('\r\n').length === TPL[LIST].split('\r\n').length && !/[^\r]\n/.test(tpl(LIST)));
  ok('the language files are not touched by edits of templates', en() === EN && fs.readFileSync(nlPath, 'utf8') === NL);
  const done = tpl(START) + tpl(LIST);
  const twice = run();
  ok('a second run stops ("already patched") and changes nothing', twice.status !== 0 && /already patched/.test(twice.stdout + twice.stderr) && tpl(START) + tpl(LIST) === done);

  // the edits of one file are applied in order, each to the result of the one before
  reset(); put('templates.json', [edit(START, 'title="start"', 'title="first"'), edit(START, 'title="first"', 'title="second"')]);
  r = run();
  ok('the edits of one file are applied in order, each to the result of the one before', r.status === 0 && tpl(START) === TPL[START].replace('title="start"', 'title="second"') && /2 edits in 1 templates/.test(r.stdout), r.stdout + r.stderr + tpl(START));
  // two lists: file name order, both are read
  reset(); put('templates.json', [TITLE]); put('templates-more.json', [DIVIDER]); r = run();
  ok('every file whose name starts with "templates" is a list of edits (and is not read as texts)', r.status === 0 && /2 edits in 2 templates \(2 files\)/.test(r.stdout) && !/locale-en/.test(r.stdout), r.stdout + r.stderr);

  // texts and edits together
  reset(); put('copy.json', { A_TITLE: 'Enter name and description' }); put('templates.json', [TITLE]); r = run();
  ok('texts and edits together: both are done, one line says so', r.status === 0 && /patched \(nx23 copy\): 1 texts in locale-en\.json \(1 files\), 1 edits in 1 templates \(1 files\)/.test(r.stdout) && JSON.parse(en()).A_TITLE === 'Enter name and description' && /title=" "/.test(tpl(START)), r.stdout + r.stderr);
  reset(); put('copy.json', { A_TITLE: 'Enter name and description' }); put('templates.json', [TITLE]);
  run();
  const mixed = run();
  ok('texts and edits together: a second run says "already patched"', mixed.status !== 0 && /already patched/.test(mixed.stdout + mixed.stderr));
  // the texts are done already, the edits are not: the edits are done
  reset(); put('copy.json', { A_TITLE: 'Enter Name e Description' }); put('templates.json', [TITLE]); r = run();
  ok('texts that are as wanted do not stop the edits', r.status === 0 && /title=" "/.test(tpl(START)) && /0 texts in locale-en\.json/.test(r.stdout), r.stdout + r.stderr);
  // an edit that is done already (old gone, new there) counts as done; the others are done
  reset(); fs.writeFileSync(tplPath(START), TPL[START].replace('title="start"', 'title=" "')); put('templates.json', [TITLE, DIVIDER]); r = run();
  ok('an edit that is done already is skipped, the others are done', r.status === 0 && /1 edits in 1 templates/.test(r.stdout) && /data-ng-if="false"/.test(tpl(LIST)), r.stdout + r.stderr);
  reset(); fs.writeFileSync(tplPath(START), TPL[START].replace('title="start"', 'title=" "')); put('templates.json', [TITLE]); r = run();
  ok('a template that already says what the list wants: "already patched"', r.status !== 0 && /already patched/.test(r.stdout + r.stderr) && tpl(START) === TPL[START].replace('title="start"', 'title=" "'));

  // all or nothing: the first edit is fine, the second is not: nothing is written, not even the first edit, the texts or another template
  const stop = (name, list, rx, extraFiles) => {
    reset(); put('copy.json', { A_TITLE: 'Enter name and description' });
    for (const [f, d] of Object.entries(extraFiles || {})) put(f, d);
    put('templates.json', list);
    const x = run();
    ok(name, x.status !== 0 && rx.test(x.stdout + x.stderr) && unchanged(), x.stdout + x.stderr);
  };
  stop('an old text that is not there stops it, says which entry and file, and writes nothing', [TITLE, edit(LIST, 'translate="NO_SUCH_KEY"', 'translate="X"')], /templates\.json\[1\].*list\.html.*not there.*NO_SUCH_KEY/);
  stop('an old text that is there twice stops it and writes nothing', [TITLE, edit(LIST, 'class="item', 'class="row')], /templates\.json\[1\].*list\.html.*2 times.*exactly once/);
  stop('a template that is not there stops it and writes nothing', [TITLE, edit('templates/first_setup/nope.html', 'a', 'b')], /templates\.json\[1\]: not found: templates\/first_setup\/nope\.html/);
  stop('a new text that contains the old one stops it and writes nothing', [TITLE, edit(START, 'title="start"', 'title="start" id="x"')], /templates\.json\[1\].*must not contain/);
  stop('an edit that leaves assets/www stops it', [TITLE, edit('../outside.html', 'a', 'b')], /below assets\/www/);
  stop('an absolute path stops it', [TITLE, edit('/etc/hosts', 'a', 'b')], /below assets\/www/);
  stop('a path with a backslash stops it', [TITLE, edit('templates\\first_setup\\start.html', 'a', 'b')], /below assets\/www/);
  stop('a path with an empty part stops it', [TITLE, edit('templates//first_setup/start.html', 'a', 'b')], /below assets\/www/);
  stop('an entry with a key of its own (a typo) stops it', [TITLE, { file: START, olt: 'a', old: 'title', new: 'x' }], /unknown key olt/);
  stop('an entry without "new" stops it', [TITLE, { file: START, old: 'title' }], /"new" must be a non-empty string/);
  stop('an empty "old" stops it', [TITLE, edit(START, '', 'x')], /"old" must be a non-empty string/);
  stop('an entry that is not an object stops it', [TITLE, 'title'], /must be an object/);
  stop('a list that is not a list stops it', { file: START }, /must be a JSON list/);
  reset(); put('copy.json', { A_TITLE: 'Enter name and description' }); fs.writeFileSync(path.join(dir, 'templates.json'), '[ { "file": ');
  r = run();
  ok('invalid JSON in a list stops it and writes nothing', r.status !== 0 && /templates\.json: not valid JSON/.test(r.stdout + r.stderr) && unchanged());
  ok('comments in an entry (keys that start with an underscore) are allowed', (() => { reset(); put('templates.json', [edit(START, 'title="start"', 'title=" "', { _why: 'a comment' })]); return run().status === 0 && /title=" "/.test(tpl(START)); })());
  // a text that does not fit stops the edits too (all or nothing across the two kinds)
  reset(); put('copy.json', { NOPE: 'x' }); put('templates.json', [TITLE]); r = run();
  ok('a key that is not in locale-en.json stops the edits of templates too', r.status !== 0 && /NOPE/.test(r.stdout + r.stderr) && unchanged());
  // a tree without the language file still takes edits (no texts in the files)
  reset(); fs.rmSync(enPath); put('templates.json', [TITLE]); r = run();
  ok('without texts in the files the language file is not needed', r.status === 0 && /title=" "/.test(tpl(START)), r.stdout + r.stderr);
}

// the real files of the repository: every key exists in the English file of the app (when the harness has the app)
{
  const real = path.join(ROOT, 'harness', 'www', 'i18n', 'locale-en.json');
  const folder = path.join(ROOT, 'skin', 'copy');
  const all = fs.existsSync(folder) ? fs.readdirSync(folder).filter((f) => /\.json$/.test(f)) : [];
  const files = all.filter((f) => !/^templates/.test(f)), tplFiles = all.filter((f) => /^templates/.test(f));
  // a key written "+KEY" is a new one (the original has no text for it): only these may be new, so that a typo cannot add a key unseen
  const NEW_KEYS = ['NHK_ERROR-11'];
  const plain = (k) => k.replace(/^\+/, '');
  const keysOf = (f) => Object.keys(JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'))).filter((k) => !k.startsWith('_'));
  const marked = files.flatMap((f) => keysOf(f).filter((k) => k.startsWith('+')).map(plain));
  ok('skin/copy/*.json: only the planned keys are written as new ones (' + (marked.join(', ') || 'none') + ')', marked.every((k) => NEW_KEYS.includes(k)), marked.join(', '));
  ok('skin/copy/templates*.json are lists of {file, old, new}, the others are objects', all.every((f) => {
    const d = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'));
    return /^templates/.test(f) ? Array.isArray(d) && d.every((e) => e && typeof e.file === 'string' && typeof e.old === 'string' && typeof e.new === 'string') : d && typeof d === 'object' && !Array.isArray(d);
  }));
  if (fs.existsSync(real)) {
    const have = JSON.parse(fs.readFileSync(real, 'utf8'));
    const keys = files.flatMap((f) => keysOf(f).map(plain));
    const unknown = keys.filter((k) => !(k in have));
    ok('skin/copy/*.json: every key exists in the English file of the app (' + keys.length + ' keys in ' + files.length + ' files)', unknown.length === 0, unknown.join(', '));
    // the edits of templates: in the app of the harness each one is either still to do (old once) or done (old gone, new there); never half
    const root = path.join(ROOT, 'harness', 'www');
    for (const f of tplFiles) {
      const list = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'));
      const state = list.map((e) => {
        const p = path.join(root, ...e.file.split('/'));
        if (!fs.existsSync(p)) return 'missing';
        const t = fs.readFileSync(p, 'utf8');
        const n = t.split(e.old).length - 1;
        return n === 1 ? 'todo' : (n === 0 && t.includes(e.new) ? 'done' : 'broken (' + n + ' x old)');
      });
      ok(f + ': every edit finds its template in the app of the harness (' + list.length + ' edits: ' + state.filter((s) => s === 'done').length + ' done, ' + state.filter((s) => s === 'todo').length + ' to do)', state.every((s) => s === 'todo' || s === 'done'), state.join(', '));
      const keysInTitles = list.flatMap((e) => Array.from(e.new.matchAll(/'([A-Z0-9_]+)' \| translate/g)).map((m) => m[1]));
      ok(f + ': the title keys that it uses exist in the English file (' + keysInTitles.length + ')', keysInTitles.every((k) => k in have), keysInTitles.filter((k) => !(k in have)).join(', '));
    }
    // no page of the app has a raw id as its title any more (a snake_case word, or the name of the template file itself)
    const raw = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.html$/.test(e.name)) { const t = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, ''); for (const m of t.matchAll(/<ion-view[^>]*\stitle="([A-Za-z0-9_]+)"/g)) if (/[a-z0-9]_[a-z0-9]/.test(m[1]) || m[1] === e.name.replace(/\.html$/, '')) raw.push(path.relative(root, p) + ': ' + m[1]); } });
    if (fs.existsSync(path.join(root, 'templates'))) { walk(path.join(root, 'templates')); ok('no template has a raw id as the title of its page', tplFiles.length === 0 || raw.length === 0, raw.join(', ')); }
  } else {
    console.log('note  harness/www is not there, so the keys of skin/copy/ were not compared with the English file of the app');
  }
  const build = fs.readFileSync(path.join(ROOT, 'build.sh'), 'utf8');
  ok('build.sh runs patch-21-copy.py as the last script', /patch-20-wizard\.py patch-21-copy\.py; do/.test(build));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failures ? failures + ' of ' + total + ' FAILED' : 'ALL OK (' + total + ' checks)');
process.exit(failures ? 1 : 0);
