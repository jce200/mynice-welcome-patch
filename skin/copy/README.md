# English wording fixes for text of the ORIGINAL app

`patch-21-copy.py` reads every `*.json` file in this folder (in file name order) and changes text of the app. **Only English text is changed**; the other 16 languages (`i18n/locale-*.json`) are not touched. Texts that the patches add themselves are written in the patch (English only) and do not belong here.

There are two kinds of file.

**1. Texts of the English language file** (`gate.json`, `command.json`, ..., `copy.json`): `patch-21-copy.py` replaces the value of the same key in the app's `i18n/locale-en.json`.

* A file is one flat JSON object: `{ "KEY": "new text", ... }`. Keys that start with `_` are comments and are ignored.
* A key has to exist in `locale-en.json` (a typo stops the build, nothing is written). A value has to be a non-empty string. A value is HTML where the original is HTML (`<br>`, `<b>`): keep the tags.
* Two files may not give different texts for one key. Two files may give the same text.
* One file per workstream: `gate.json`, `command.json`, `status.json`, `dialogs.json`, `lists.json`, `wizard.json`, `activity.json`, `copy.json`. `copy.json` holds the failure texts of commands (`NHK_ERROR-*`) and the wording fixes of the original English; a code without any text is completed in `nx-patch.js` (section `nx23 copy`: `The accessory reported error n. Check the gate.`).

**2. Text of templates** (`templates.json`; any file whose name starts with `templates` has this form): a JSON list of edits, for what a language file cannot change: a page title that is a raw id (`title="start"`), a divider that only repeats the title.

```json
[ { "file": "templates/first_setup/start.html", "old": "title=\"start\"", "new": "title=\" \"" } ]
```

* `file` is a path below `assets/www`, with forward slashes. `old` has to occur **exactly once** in that file (the edits of one file are applied in the order of the list, each to the result of the one before); it is replaced by `new`. Keys of an entry that start with `_` are comments (`_why` says why).
* `patch-21-copy.py` runs after every other patch, so the templates are already rewritten when it runs. Anchor on a small piece of an attribute (`title="..."`, `translate="KEY"`) that nobody else rewrites. If an `old` text is no longer there, the build stops and says which entry (nothing is written): the list has to follow the template.
* `new` must not contain `old` as a whole (a second run could not tell that the edit was done). To add an attribute, let `old` run over both sides of the place and put the addition in the middle of `new`, as the divider entries do.
* A title key that exists in the app's translations (`{{ 'ADD_NEW_DEVICE_PAGE_TITLE' | translate }}`) is better than English text: it is already translated into every language.

Both kinds are all or nothing: if one text or one edit does not match, neither the language file nor a template is written. A second run on the same tree says `already patched (nx23 copy)` and changes nothing.
