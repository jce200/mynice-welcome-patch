# Notices

## Nice / MyNice Welcome

"Nice", "MyNice" and "MyNice Welcome" are names and trademarks of their owner (Nice S.p.A.), and the MyNice Welcome app
(`com.nice.nhk`) is their copyrighted work. **This project is unofficial and not affiliated with, endorsed by or supported by Nice.**

This repository contains **no Nice binaries**: no original APK and no patched APK. It contains scripts that patch a copy of the
app that *you* provide, plus code written for this project. To make the patches apply, some scripts contain short excerpts of the
app's code (smali and JavaScript) as anchor text to find and replace, and `java/stubs/` holds method signatures of a few of the
app's classes so the new code can be compiled against them. Nothing here may be used to get around licensing of the app; you
are responsible for having the right to use and modify the copy of the app you patch.

## Included third-party material

| What | Where | License |
|---|---|---|
| Roboto Flex (variable font, Latin subset) | `skin/fonts-nx/` (license text next to it) | SIL Open Font License 1.1 |
| Material Design icon paths (as inline SVG masks) | `skin/src/build-css.py` | Apache License 2.0, Google |
| Color values generated with `@material/material-color-utilities` (build time only; the library itself is not included) | `skin/src/tokens.css`, `skin/src/tools/` | Apache License 2.0, Google |

The look follows Google's Material 3 (Expressive) design guidelines. No Google code is included beyond the items above.

## Downloaded by `get-tools.sh` (not included, checked on SHA-256)

| Tool | License |
|---|---|
| Apktool 2.10.0 (iBotPeaches) | Apache License 2.0 |
| uber-apk-signer 1.3.0 (patrickfav) | Apache License 2.0 |
| dalvik-dx 11.0.0_r3 (repackaged by JakeWharton from the Android Open Source Project) | Apache License 2.0 |
| android-all 10 (Robolectric build of the Android 10 framework) | Apache License 2.0 |

## Development dependencies of the tests (not included)

jsdom (MIT), Playwright (Apache-2.0; only for the optional screenshot harness in `harness/`), esbuild and
`@material/material-color-utilities` (only to regenerate `skin/src/tokens.css`).
