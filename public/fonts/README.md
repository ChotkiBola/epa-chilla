# Fonts

The brand headline font is **Pragmatica Extended Extrabold**. It is licensed, so
it is not in this repo and was not downloaded — drop the files in here yourself.

## Drop these exact filenames into this folder

| Filename                              | Format | Required                     |
| ------------------------------------- | ------ | ---------------------------- |
| `pragmatica-extended-extrabold.woff2` | WOFF2  | Yes — this is what ships     |
| `pragmatica-extended-extrabold.woff`  | WOFF   | Optional, legacy fallback    |

The names are matched literally by the `@font-face` rule in
[`app/globals.css`](../../app/globals.css). If you rename the files, change the
rule too.

## Converting from OTF/TTF

If what you have is `PragmaticaExtended-ExtraBold.otf`, convert it — do not just
rename it. Web browsers will not load an OTF renamed to `.woff2`.

```bash
pip install fonttools brotli
fonttools ttLib.woff2 compress -o pragmatica-extended-extrabold.woff2 PragmaticaExtended-ExtraBold.otf
```

## If the files are missing

Nothing breaks. `font-display: swap` plus the fallback stack in `globals.css`
(`"Arial Black", "Segoe UI Black", "Helvetica Neue", system-ui`) keeps the
headlines heavy and deliberate — just not on-brand. Check a headline visually
after adding the real files; that is the only way to confirm they loaded.
