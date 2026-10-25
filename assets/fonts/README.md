# Website fonts

The product page and the complete shortcut handbook use the same self-hosted
fonts through `../typography.css`. No operating-system font is selected by name.

| Role | Fixed font | License |
| --- | --- | --- |
| Latin text, headings and controls | Inter Variable 4.1 | `Inter-OFL.txt` |
| Keyboard symbols, code and machine identifiers | Fira Code Variable 6.2 | `FiraCode-OFL.txt` |
| Chinese text, CJK punctuation and the illustrative rain's halfwidth kana | Noto Sans SC 2.004-H2, site subset | `NotoSansSC-OFL.txt` |

The CJK font supplies variable weights from 100 to 900. Its modified family is
named **Glow Noto Sans SC**. Its outlines and colors have not been redrawn. The
Latin fonts remain byte-for-byte unchanged. `unicode-range` keeps Latin and
keyboard symbols in Inter or Fira Code while selecting the same fixed Chinese
outlines for both roles. The final CSS names are `Glow Sans` and `Glow Mono`.

## Provenance

- Existing Latin font provenance and hashes: `SOURCES.json`.
- Official CJK source, immutable commit, source/output SHA-256 and subset details:
  `NotoSansSC-SOURCE.json`.
- The upstream font comes from the official Google Fonts repository at commit
  `a85815a42757630ce188fdad368c2dfc444d4773`, and identifies itself as
  `Version 2.004-H2`. Its upstream Noto CJK release is
  <https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004>.
- All three font licenses permit self-hosted web distribution under the SIL Open
  Font License 1.1; the complete licenses are distributed alongside the fonts.

## Coverage checked on 2026-10-24

The source scan covered every HTML, CSS, JavaScript and JSON file under `dist/`,
excluding font metadata, including both 296-action shortcut catalogs. HTML
entities and JavaScript `\uXXXX` escapes were decoded before checking the
fonts' actual Unicode cmaps. The baseline scan found 898 printable code points,
including 706 distinct Chinese ideographs. An incremental check of `颗粒强度`
and `颗粒大小` adds two characters, bringing those totals to 900 and 708.
Both font combinations cover every checked text character;
neither needs a system glyph for current page content. Keyboard symbols checked
include `␣ ⌃ ⌘ ⌥ ⇧ ↩ ⇥ ⎋ ⌫ ⌦ ↑ ↓ ← →`.

`NotoSansSC-COVERAGE.json` records the scanned files and exact glyph set. The CJK
subset contains 1,630 code points, including available CJK punctuation, kana and
halfwidth-form blocks. It is 453,692 bytes, rather than shipping the 17,772,300-byte
source TTF to each visitor. The WOFF2 retains its variable-weight axis and layout
features. `NotoSansSC-Site-Unicodes.txt` records the input Unicode set for rebuilding
with fonttools 4.60.1 and Brotli 1.2.1; regenerate the subset and coverage report
when introducing Chinese characters absent from that set.

The updated scan also checks cmatrix-gm's original 125-character alphabet
directly from `cmatrix-showcase.js`: all 63 halfwidth kana/punctuation characters
exist in the CJK subset, and its 62 Latin letters/digits exist in Fira Code.
The fixed monospace combination has zero missing rain characters. The caption
`原算法网页移植` is covered, including the newly retained `植` glyph. All 1,623
code points from the previous subset remain present.

Load `typography.css` after the page's other styles, and preload
`GlowNotoSansSC-Site-2.004.woff2` together with the existing Inter/Fira files.
Layout measurements and canvas text should be refreshed after
`document.fonts.ready` so their first completed layout uses these fonts.

2026-10-24 palette workbench: retained the prior subset and added 失、幻、牌、败. Font asset revision: 20261024-3.

2026-10-24 grain controls: retained all 1,628 previous code points and added
颗 (U+9897) and 粒 (U+7C92) for `颗粒强度` and `颗粒大小`. This update checks
those phrases incrementally against the existing scan and preserves the Glow
family name, weight axis, layout features and OFL metadata. Font asset revision:
20261024-4.
