# Notices

## Nice / MyNice Welcome

"Nice", "MyNice" and "MyNice Welcome" are names and trademarks of their owner (Nice S.p.A.), and the MyNice Welcome app
(`com.nice.nhk`) is their copyrighted work. **This project is unofficial and not affiliated with, endorsed by or supported by Nice.**

The source tree of this repository contains **no Nice binaries**: no original APK and no patched APK, and no picture of the Nice logo either: the icon, the notification icon and the splash
screens that `patch-16-brand.py` makes are drawn at build time from the launcher icon that is in the copy of the app *you* provide (`brand/logo.py` and `brand/assets.py` are only code). It contains scripts that patch a copy of the
app that *you* provide, plus code written for this project. To make the patches apply, some scripts contain short excerpts of the
app's code (smali and JavaScript) as anchor text to find and replace, and `java/stubs/` holds method signatures of a few of the
app's classes so the new code can be compiled against them. Nothing here may be used to get around licensing of the app; you
are responsible for having the right to use and modify the copy of the app you patch.

**Release assets are different.** The prebuilt APK on the [Releases](../../releases) page is the MyNice Welcome app itself with the patches
applied, so it contains Nice's code and resources. The maintainer provides it unofficially and without warranty, for owners of IT4WIFI
accessories whose official app no longer works on their phone, and it may be removed at any time, for example if the rights holder asks.
Whether you may install or pass on that file is between you and the rights holder; if in doubt, build the app yourself from an APK you
are entitled to use (see the README).

**The license of this repository.** The MIT license in [LICENSE](LICENSE) covers the files in this repository. It does not cover, and does
not grant any rights to, the Nice / MyNice Welcome app that these scripts patch.

## Included third-party material

| What | Where | License |
|---|---|---|
| Roboto Flex (variable font, Latin subset) | `skin/fonts-nx/` (license text next to it) | SIL Open Font License 1.1 |
| Material Design icon paths (as inline SVG masks) | `skin/src/build-css.py` | Apache License 2.0, Google |
| Color values generated with `@material/material-color-utilities` (build time only; the library itself is not included) | `skin/src/tokens.css`, `skin/src/tools/` | Apache License 2.0, Google |
| The geometry of the 35 shapes of Material 3 Expressive (`MaterialShapes` and `androidx.graphics.shapes`: the coordinates and rounding values of the vertices and the way a rounded corner is built), ported to Python and sampled as polygons of 144 points. An independent port, not a copy of the Kotlin code. | `skin/src/tools/build-shapes.py`, `skin/src/shapes.json` | Apache License 2.0, The Android Open Source Project |
| The numbers of the Material 3 Expressive components: sizes, corner radii, spaces and type styles (`androidx.compose.material3` tokens such as `ButtonLargeTokens`, `FabMediumTokens`, `SliderTokens`, `ListTokens`, `TypeScaleTokens`) and the damping and stiffness of the six springs of the expressive motion scheme (`ExpressiveMotionTokens`), and the shape sequence and timing of the loading indicator and of the wavy progress indicator. Written as CSS; no Kotlin code is included. | `skin/src/m3e.css`, `skin/src/tools/build-tokens.mjs`, `skin/src/build-css.py`, `nx-gallery.js` | Apache License 2.0, The Android Open Source Project |

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
