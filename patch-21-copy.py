#!/usr/bin/env python3
"""Patch nx23 (copy): the English wording of the original app, and the titles of its pages.

Usage: python patch-21-copy.py <apktool-output-dir>   (all or nothing; idempotent)

The original app keeps its texts in assets/www/i18n/locale-<language>.json (17 languages) and a few of them in its templates (assets/www/templates/). The texts that these patches add are
English only; this script is the one place where the ENGLISH text of the original app is corrected, and where a page title that is a raw id is replaced. It reads the files of skin/copy/ (in
file name order; NX_COPY_DIR names another folder, as the tests do), of two kinds:

  1. <name>.json: a flat JSON object { "KEY": "new text" } in which keys that start with "_" are comments. In locale-en.json it replaces the value of each key and leaves the rest of the
     file as it was. The other locale files are not touched. One file per workstream (gate.json, command.json, ..., copy.json). A key that has to exist is checked (a typo stops the
     build); a key that the file does not have yet (a code of an error that the app never translated) is written "+KEY": it is added at the end of the file, or replaced when it is there.
  2. templates*.json (templates.json): a JSON list of { "file": "templates/first_setup/start.html", "old": 'title="start"', "new": 'title=" "' }: text of a template, for a title that
     is a raw id, or a divider that only repeats the title. "file" is a path below assets/www; "old" has to occur EXACTLY once in that file (the entries of one file are applied in the order of
     the list, each to the result of the one before) and is replaced by "new". Keys of an entry that start with "_" are comments. This script runs after all the other patches, so an "old"
     text should be a small piece of an attribute (title="...", a translate="..." key) that no other patch is likely to rewrite. To ADD something (an attribute), let "old" run on both
     sides of the place and put the addition in the middle of "new": "new" must not contain "old" as a whole.

It stops and writes NOTHING (neither the locale file nor a template) when
  - a file is not valid JSON, or has the wrong shape (an object of texts; a list of entries), or an entry has a key other than file, old, new (or a comment);
  - a key is not in locale-en.json, a text is not a non-empty string, or two files give different texts for one key;
  - a template is not there, or its "old" text is not there (another patch changed it: the list has to follow), or is there more than once;
  - "new" contains "old" (a second run could not tell that the edit was done), or "file" leaves assets/www.
When every text and every edit is already as wanted it says "already patched" and stops; when there are no files it does nothing. An edit whose "old" text is gone and whose "new" text is there
counts as done (so a run on a tree that has been through this script, or whose template already says what the list wants, changes nothing).
"""
import glob
import json
import os
import re
import sys

if len(sys.argv) != 2:
    sys.exit(__doc__)
HERE = os.path.dirname(os.path.abspath(__file__))
COPY = os.environ.get("NX_COPY_DIR") or os.path.join(HERE, "skin", "copy")
WWW = os.path.join(sys.argv[1], "assets", "www")
EN = os.path.join(WWW, "i18n", "locale-en.json")
ENTRY_KEYS = ("file", "old", "new")


def read_text(path):
    return open(path, encoding="utf-8", newline="").read()


def write_text(path, text):
    open(path, "w", encoding="utf-8", newline="").write(text)


def read_json(path):
    name = os.path.basename(path)
    try:
        return json.loads(read_text(path))
    except ValueError as e:
        sys.exit("%s: not valid JSON (%s)" % (name, e))


files = sorted(glob.glob(os.path.join(COPY, "*.json")))
if not files:
    print("patch-21-copy: no files in %s, nothing to do" % COPY)
    sys.exit(0)
text_files = [f for f in files if not os.path.basename(f).startswith("templates")]
template_files = [f for f in files if os.path.basename(f).startswith("templates")]

# ---- the texts of locale-en.json: read and check the files
wanted = {}      # key -> (text, file)
may_be_new = set()   # the keys that were written "+KEY": they may be missing from locale-en.json
for path in text_files:
    name = os.path.basename(path)
    data = read_json(path)
    if not isinstance(data, dict):
        sys.exit("%s: must be one JSON object {\"KEY\": \"text\"}" % name)
    for key, value in data.items():
        if key.startswith("_"):
            continue
        new_key = key.startswith("+")
        if new_key:
            key = key[1:]
            if not key:
                sys.exit("%s: a key that starts with + needs a name after it" % name)
        if not isinstance(value, str) or not value.strip():
            sys.exit("%s: the text of %s must be a non-empty string" % (name, key))
        if key in wanted and wanted[key][0] != value:
            sys.exit("%s and %s give different texts for %s" % (wanted[key][1], name, key))
        wanted[key] = (value, name)
        if new_key:
            may_be_new.add(key)

# ---- the edits of templates: read and check the lists
edits = []       # (file below assets/www, old, new, where)
for path in template_files:
    name = os.path.basename(path)
    data = read_json(path)
    if not isinstance(data, list):
        sys.exit("%s: must be a JSON list of {\"file\", \"old\", \"new\"}" % name)
    for i, entry in enumerate(data):
        where = "%s[%d]" % (name, i)
        if not isinstance(entry, dict):
            sys.exit("%s: must be an object {\"file\", \"old\", \"new\"}" % where)
        extra = sorted(k for k in entry if k not in ENTRY_KEYS and not k.startswith("_"))
        if extra:
            sys.exit("%s: unknown key %s (an entry has file, old and new; keys that start with _ are comments)" % (where, ", ".join(extra)))
        for k in ENTRY_KEYS:
            if not isinstance(entry.get(k), str) or not entry[k]:
                sys.exit("%s: \"%s\" must be a non-empty string" % (where, k))
        rel, old, new = entry["file"], entry["old"], entry["new"]
        parts = rel.split("/")
        if rel.startswith("/") or "\\" in rel or ".." in parts or "" in parts:
            sys.exit("%s: \"file\" must be a path below assets/www, with forward slashes (%s)" % (where, rel))
        if old in new:
            sys.exit("%s: \"new\" must not contain \"old\" (a second run could not tell that the edit was done)" % where)
        edits.append((rel, old, new, where))

if not wanted and not edits:
    print("patch-21-copy: the files have no texts and no edits, nothing to do")
    sys.exit(0)

# ---- the locale file: what has to change
locale_text = None
todo = []
if wanted:
    if not os.path.isfile(EN):
        sys.exit("not found: " + EN)
    text = read_text(EN)
    current = json.loads(text)
    missing = sorted(k for k in wanted if k not in current and k not in may_be_new)
    if missing:
        sys.exit("not in locale-en.json (typo?): " + ", ".join(missing))
    todo = sorted(k for k in wanted if k not in current or current[k] != wanted[k][0])
    added = [k for k in todo if k not in current]
    for key in todo:
        if key in added:
            continue
        rx = re.compile(r'("' + re.escape(key) + r'"\s*:\s*)"(?:[^"\\]|\\.)*"')
        found = rx.findall(text)
        if len(found) != 1:
            sys.exit("locale-en.json: expected 1 line for %s, found %d" % (key, len(found)))
        new_value = json.dumps(wanted[key][0], ensure_ascii=False)
        text = rx.sub(lambda m: m.group(1) + new_value, text, count=1)
    if added:                            # new keys go at the end of the object, as lines in the style of the end of the file
        end = text.rstrip()
        if not end.endswith("}"):
            sys.exit("locale-en.json: does not end with a closing brace; nothing written")
        head = end[:-1].rstrip()
        lines = ",\n".join('  %s: %s' % (json.dumps(k), json.dumps(wanted[k][0], ensure_ascii=False)) for k in added)
        text = head + ("" if head.endswith("{") else ",") + "\n" + lines + "\n}" + text[len(end):]
    if todo:
        check = json.loads(text)         # the result must still be JSON, with exactly the wanted values
        if set(check) != set(current) | set(added) or any(check[k] != wanted[k][0] for k in todo) or any(check[k] != current[k] for k in current if k not in todo):
            sys.exit("locale-en.json: the result is not what was asked for; nothing written")
        locale_text = text

# ---- the templates: apply every edit in memory; nothing is written before all of them have worked
original, changed = {}, {}
done_now = already = 0
for rel, old, new, where in edits:
    path = os.path.join(WWW, *rel.split("/"))
    if rel not in changed:
        if not os.path.isfile(path):
            sys.exit("%s: not found: %s" % (where, rel))
        original[rel] = changed[rel] = read_text(path)
    t = changed[rel]
    n = t.count(old)
    if n == 1:
        changed[rel] = t.replace(old, new)
        done_now += 1
    elif n == 0 and new in t:
        already += 1
    elif n == 0:
        sys.exit("%s: %s: the text to replace is not there: %r (did another patch change it? the list in skin/copy has to follow; nothing written)" % (where, rel, old))
    else:
        sys.exit("%s: %s: the text to replace is there %d times, it must be there exactly once: %r (nothing written)" % (where, rel, n, old))

if not todo and not done_now:
    sys.exit("already patched (nx23 copy)")

# ---- everything matched: only now write
if locale_text is not None:
    write_text(EN, locale_text)
for rel in sorted(changed):
    if changed[rel] != original[rel]:
        write_text(os.path.join(WWW, *rel.split("/")), changed[rel])
said = []
if wanted:
    said.append("%d texts in locale-en.json (%d files)" % (len(todo), len(text_files)) + (", %d of them new keys" % len(added) if added else ""))
if edits:
    said.append("%d edits in %d templates (%d files)" % (done_now, sum(1 for r in changed if changed[r] != original[r]), len(template_files)))
print("patched (nx23 copy): " + ", ".join(said))
