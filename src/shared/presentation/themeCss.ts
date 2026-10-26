/**
 * Stylesheets of the document themes.
 *
 * `BASE_CSS` is shared structure: layout, lists, tables, code, quotes, math, diagrams and print
 * rules, all driven by the `--ms-*` variables and the `data-*` variant attributes written by
 * `theme.ts`. `THEME_CSS` holds what makes each theme look different: typography, heading
 * treatment and page composition.
 */

export const BASE_CSS = String.raw`
html { background: var(--ms-bg); -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  color: var(--ms-text);
  background: var(--ms-bg);
  font-family: var(--ms-font-body);
  font-size: var(--ms-size);
  line-height: var(--ms-leading);
  overflow-wrap: break-word;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.markdown-body {
  box-sizing: border-box;
  max-width: calc(var(--ms-width) + 2 * 48px);
  margin: 0 auto;
  padding: 44px 48px 72px;
}
.markdown-body > *:first-child { margin-top: 0 !important; }
.markdown-body > *:last-child { margin-bottom: 0 !important; }

p { margin: 0 0 var(--ms-para); }
blockquote, ul, ol, dl, table, pre, details, figure { margin-top: 0; margin-bottom: var(--ms-para); }

h1, h2, h3, h4, h5, h6 {
  margin: 1.5em 0 0.6em;
  color: var(--ms-heading);
  font-family: var(--ms-font-heading);
  font-weight: 650;
  line-height: 1.25;
}
h1 { font-size: var(--ms-h1); margin-top: 0; }
h2 { font-size: var(--ms-h2); }
h3 { font-size: var(--ms-h3); }
h4 { font-size: var(--ms-h4); }
h5 { font-size: var(--ms-h5); }
h6 { font-size: var(--ms-h6); color: var(--ms-muted); }

a { color: var(--ms-link); text-decoration: none; }
a:hover { text-decoration: underline; }
a:focus-visible { outline: 2px solid var(--ms-accent); outline-offset: 2px; border-radius: 2px; }
strong { font-weight: 650; }

hr { height: 1px; margin: 2em 0; padding: 0; background: var(--ms-border); border: 0; }

ul, ol { padding-left: 1.9em; }
li + li { margin-top: 0.25em; }
li > p { margin-top: 0.6em; }
ul ul, ul ol, ol ol, ol ul { margin-top: 0.25em; margin-bottom: 0; }
li::marker { color: var(--ms-muted); }
.contains-task-list { padding-left: 1.4em; }
.task-list-item { list-style-type: none; }
.task-list-item-checkbox { margin: 0 0.4em 0.2em -1.4em; vertical-align: middle; accent-color: var(--ms-accent); }

img { max-width: 100%; height: auto; }
figure { margin-left: 0; margin-right: 0; }

/* ---------- tables ---------- */
table { display: block; width: max-content; max-width: 100%; overflow: auto; border-spacing: 0; border-collapse: collapse; font-size: 0.95em; }
th, td { padding: 0.4em 0.85em; text-align: left; vertical-align: top; }
th { font-weight: 650; }
[data-table='rows'] th, [data-table='rows'] td { border-bottom: 1px solid var(--ms-border); }
[data-table='rows'] thead th { border-bottom: 2px solid var(--ms-text); }
[data-table='grid'] th, [data-table='grid'] td { border: 1px solid var(--ms-border); }
[data-table='grid'] th { background: var(--ms-subtle); }
[data-table='banded'] th { background: var(--ms-accent); color: var(--ms-on-accent); border: 1px solid var(--ms-accent); }
[data-table='banded'] td { border: 1px solid var(--ms-border); }
[data-table='banded'] tbody tr:nth-child(even) td { background: var(--ms-subtle); }
[data-table='minimal'] { border-top: 2px solid var(--ms-text); border-bottom: 2px solid var(--ms-text); }
[data-table='minimal'] th { border-bottom: 1px solid var(--ms-text); }
[data-table='minimal'] td { padding-top: 0.3em; padding-bottom: 0.3em; }

/* ---------- code ---------- */
code, kbd, pre, samp { font-family: var(--ms-font-mono); }
code { padding: 0.15em 0.4em; font-size: 0.88em; white-space: break-spaces; background: var(--ms-subtle); border-radius: 4px; }
pre { padding: 1em 1.1em; overflow: auto; font-size: 0.88em; line-height: 1.5; color: var(--ms-code-fg); background: var(--ms-code-bg); border: 1px solid var(--ms-code-border); border-radius: 6px; }
pre code { display: block; padding: 0; font-size: 100%; white-space: pre; color: inherit; background: transparent; border-radius: 0; }
[data-code='dark'] code:not(pre code) { background: color-mix(in srgb, var(--ms-text) 10%, transparent); }
kbd { display: inline-block; padding: 2px 6px; font-size: 0.8em; line-height: 1.2; vertical-align: middle; background: var(--ms-subtle); border: 1px solid var(--ms-border); border-bottom-width: 2px; border-radius: 5px; }
mark { background: color-mix(in srgb, #facc15 55%, transparent); color: inherit; }
details summary { cursor: pointer; }

/* ---------- quotes ---------- */
blockquote { margin-left: 0; margin-right: 0; color: var(--ms-muted); }
blockquote > :last-child { margin-bottom: 0; }
[data-quote='bar'] blockquote { padding: 0 1em; border-left: 3px solid var(--ms-accent); }
[data-quote='boxed'] blockquote { padding: 0.7em 1em; color: var(--ms-text); background: var(--ms-subtle); border: 1px solid var(--ms-border); border-left: 4px solid var(--ms-accent); border-radius: 4px; }
[data-quote='quote'] blockquote { position: relative; padding: 0.2em 1.4em 0.2em 2.6em; font-style: italic; }
[data-quote='quote'] blockquote::before { content: '\201C'; position: absolute; left: 0.2em; top: -0.15em; font-size: 3.2em; line-height: 1; color: var(--ms-accent); font-style: normal; }
[data-quote='indent'] blockquote { padding: 0 2em; font-style: italic; }

/* ---------- syntax highlighting ---------- */
[data-code-tone='light'] .hljs-doctag, [data-code-tone='light'] .hljs-keyword, [data-code-tone='light'] .hljs-template-tag, [data-code-tone='light'] .hljs-template-variable, [data-code-tone='light'] .hljs-type, [data-code-tone='light'] .hljs-variable.language_ { color: #cf222e; }
[data-code-tone='light'] .hljs-title, [data-code-tone='light'] .hljs-title.class_, [data-code-tone='light'] .hljs-title.function_ { color: #8250df; }
[data-code-tone='light'] .hljs-attr, [data-code-tone='light'] .hljs-attribute, [data-code-tone='light'] .hljs-literal, [data-code-tone='light'] .hljs-meta, [data-code-tone='light'] .hljs-number, [data-code-tone='light'] .hljs-operator, [data-code-tone='light'] .hljs-variable, [data-code-tone='light'] .hljs-selector-attr, [data-code-tone='light'] .hljs-selector-class, [data-code-tone='light'] .hljs-selector-id { color: #0550ae; }
[data-code-tone='light'] .hljs-regexp, [data-code-tone='light'] .hljs-string { color: #0a3069; }
[data-code-tone='light'] .hljs-built_in, [data-code-tone='light'] .hljs-symbol, [data-code-tone='light'] .hljs-bullet { color: #953800; }
[data-code-tone='light'] .hljs-comment, [data-code-tone='light'] .hljs-code, [data-code-tone='light'] .hljs-formula { color: #59636e; }
[data-code-tone='light'] .hljs-name, [data-code-tone='light'] .hljs-quote, [data-code-tone='light'] .hljs-selector-tag, [data-code-tone='light'] .hljs-selector-pseudo { color: #116329; }
[data-code-tone='light'] .hljs-addition { color: #116329; background: #dafbe1; }
[data-code-tone='light'] .hljs-deletion { color: #82071e; background: #ffebe9; }
[data-code-tone='dark'] .hljs-doctag, [data-code-tone='dark'] .hljs-keyword, [data-code-tone='dark'] .hljs-template-tag, [data-code-tone='dark'] .hljs-template-variable, [data-code-tone='dark'] .hljs-type, [data-code-tone='dark'] .hljs-variable.language_ { color: #ff7b72; }
[data-code-tone='dark'] .hljs-title, [data-code-tone='dark'] .hljs-title.class_, [data-code-tone='dark'] .hljs-title.function_ { color: #d2a8ff; }
[data-code-tone='dark'] .hljs-attr, [data-code-tone='dark'] .hljs-attribute, [data-code-tone='dark'] .hljs-literal, [data-code-tone='dark'] .hljs-meta, [data-code-tone='dark'] .hljs-number, [data-code-tone='dark'] .hljs-operator, [data-code-tone='dark'] .hljs-variable, [data-code-tone='dark'] .hljs-selector-attr, [data-code-tone='dark'] .hljs-selector-class, [data-code-tone='dark'] .hljs-selector-id { color: #79c0ff; }
[data-code-tone='dark'] .hljs-regexp, [data-code-tone='dark'] .hljs-string { color: #a5d6ff; }
[data-code-tone='dark'] .hljs-built_in, [data-code-tone='dark'] .hljs-symbol, [data-code-tone='dark'] .hljs-bullet { color: #ffa657; }
[data-code-tone='dark'] .hljs-comment, [data-code-tone='dark'] .hljs-code, [data-code-tone='dark'] .hljs-formula { color: #9ba7b4; }
[data-code-tone='dark'] .hljs-name, [data-code-tone='dark'] .hljs-quote, [data-code-tone='dark'] .hljs-selector-tag, [data-code-tone='dark'] .hljs-selector-pseudo { color: #7ee787; }
[data-code-tone='dark'] .hljs-addition { color: #aff5b4; background: #033a16; }
[data-code-tone='dark'] .hljs-deletion { color: #ffdcd7; background: #67060c; }
.hljs-section { font-weight: bold; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: bold; }

/* ---------- mathematics ---------- */
.ms-math-block { margin: 1.1em 0; overflow-x: auto; overflow-y: hidden; text-align: center; }
.ms-math-block .katex-display { margin: 0; }
.katex { font-size: 1.08em; }
.ms-math-error { display: inline-block; padding: 0 0.4em; color: #b42318; background: color-mix(in srgb, #b42318 9%, transparent); border: 1px solid color-mix(in srgb, #b42318 40%, transparent); border-radius: 4px; font-size: 0.9em; }
.ms-math-block > .ms-math-error { display: block; padding: 0.5em 0.8em; text-align: left; }
.ms-math-error code { background: transparent; padding: 0; }

/* ---------- diagrams ---------- */
.ms-diagram { margin: 1.3em 0; text-align: center; overflow-x: auto; }
.ms-diagram svg { max-width: 100%; height: auto; }
.ms-diagram[data-ms-state='ready'] .ms-diagram-source,
.ms-diagram[data-ms-state='error'] > .ms-diagram-source { display: none; }
.ms-diagram[data-ms-state='pending'] .ms-diagram-source,
.ms-diagram:not([data-ms-state]) .ms-diagram-source { margin: 0; text-align: left; opacity: 0.6; }
.ms-diagram-status { margin: 0.3em 0 0; color: var(--ms-muted); font-size: 0.85em; }
.ms-diagram-error { text-align: left; padding: 0.7em 1em; color: var(--ms-text); background: color-mix(in srgb, #b42318 8%, var(--ms-bg)); border: 1px solid color-mix(in srgb, #b42318 45%, transparent); border-left-width: 4px; border-radius: 4px; }
.ms-diagram-error strong { color: #b42318; }
.ms-diagram-error pre { margin: 0.6em 0 0; font-size: 0.82em; }
[data-page='dark'] .ms-diagram-error strong { color: #ff8a80; }

/* ---------- page breaks ---------- */
.ms-page-break { height: 0; break-after: page; page-break-after: always; }
@media screen { .ms-page-break { margin: 2.2em 0; border-top: 1px dashed var(--ms-border); } }

/* ---------- publishing: captions, references, contents, bibliography ---------- */
figure.ms-figure { margin: 1.2em 0; text-align: center; }
figure.ms-figure img { display: block; margin: 0 auto; }
figcaption, caption { color: var(--ms-muted); font-size: 0.9em; line-height: 1.4; }
figcaption { margin-top: 0.5em; text-align: center; }
caption { caption-side: top; padding: 0 0 0.5em; text-align: left; }
table.ms-table { min-width: min(100%, 26em); }
.ms-caption-label { color: var(--ms-text); font-weight: 650; }
.ms-secnum { margin-right: 0.15em; color: var(--ms-muted); font-variant-numeric: tabular-nums; }
.ms-xref { color: var(--ms-link); }
.ms-xref-missing, .ms-cite-missing { color: #b42318; background: color-mix(in srgb, #b42318 9%, transparent); border-bottom: 1px dotted #b42318; border-radius: 3px; padding: 0 0.15em; font-size: 0.95em; }
[data-page='dark'] .ms-xref-missing, [data-page='dark'] .ms-cite-missing { color: #ff8a80; border-bottom-color: #ff8a80; }
.ms-cite-unresolved { color: var(--ms-muted); }
nav.ms-toc, nav.ms-list { margin: 0 0 1.8em; padding: 0.9em 1.2em; background: var(--ms-subtle); border: 1px solid var(--ms-border); border-radius: 6px; font-size: 0.95em; break-inside: avoid-column; }
.ms-toc-title { margin: 0 0 0.5em; font-family: var(--ms-font-heading); font-size: 1.05em; font-weight: 650; color: var(--ms-heading); }
nav.ms-toc ul, nav.ms-list ul { margin: 0; padding-left: 1.2em; list-style: none; }
nav.ms-toc > ul { padding-left: 0; }
nav.ms-toc li, nav.ms-list li { margin: 0.15em 0; }
nav.ms-toc a, nav.ms-list a { color: var(--ms-text); }
nav.ms-toc a:hover, nav.ms-list a:hover { color: var(--ms-link); }
section.ms-chapter[data-newpage='true'] { break-before: page; page-break-before: always; }
section.ms-chapter > h1:first-child { margin-top: 0; }
section.ms-bibliography { margin-top: 2.2em; }
.ms-bibliography-title { margin-top: 0; }
.csl-entry { margin: 0 0 0.6em; padding-left: 2em; text-indent: -2em; }
.csl-entry a { overflow-wrap: anywhere; }
.ms-publication-title { margin: 0 0 0.3em; }
.ms-publication-meta { margin: 0 0 2em; color: var(--ms-muted); }

img.ms-img-missing { display: inline-block; box-sizing: border-box; max-width: 100%; min-height: 2.6em; padding: 0.5em 0.8em; color: #b42318; background: color-mix(in srgb, #b42318 8%, transparent); border: 1px dashed #b42318; border-radius: 4px; font-size: 0.9em; font-style: normal; }
img.ms-img-missing::after { content: ' \2014  ' attr(title); }

/* ---------- publishing: columns (whole document) ---------- */
@media screen and (min-width: 900px) {
  .markdown-body[data-columns='2'] { max-width: calc(var(--ms-width) * 1.5 + 2 * 48px); }
  .markdown-body[data-columns='2'] > * { max-width: none; }
}
.markdown-body[data-columns='2'] { column-count: 2; column-gap: var(--ms-col-gap, 8mm); column-fill: balance; }
.markdown-body[data-columns='2'] > h1:first-child, .markdown-body[data-columns='2'] > nav.ms-toc, .markdown-body[data-columns='2'] .ms-full-width, .markdown-body[data-columns='2'] .ms-publication-title, .markdown-body[data-columns='2'] .ms-publication-meta, .markdown-body[data-columns='2'] .ms-chapter > h1:first-child { column-span: all; }
.markdown-body[data-columns='2'] .ms-full-width { margin-left: 0; margin-right: 0; }
/* A table with five or more columns is too wide for one column: it spans both. */
.markdown-body[data-columns='2'] table:has(> thead th:nth-child(5)) { column-span: all; table-layout: auto; font-size: 0.9em; }
.markdown-body[data-columns='2'] table { display: table; width: 100%; table-layout: fixed; font-size: 0.85em; overflow: visible; }
.markdown-body[data-columns='2'] th, .markdown-body[data-columns='2'] td { overflow-wrap: anywhere; padding: 0.3em 0.5em; }
.markdown-body[data-columns='2'] .ms-full-width table { table-layout: auto; font-size: 0.9em; }
.markdown-body[data-columns='2'] pre { overflow: auto; }
.markdown-body[data-columns='2'] p { orphans: 2; widows: 2; }
.markdown-body[data-columns='2'] figure, .markdown-body[data-columns='2'] .ms-diagram { break-inside: avoid; }
.markdown-body[data-numbered='true'] h2::before, .markdown-body[data-numbered='true'] h3::before { content: none; }

/* ---------- narrow panes ---------- */
@media (max-width: 640px) {
  .markdown-body { padding: 24px 18px 48px; }
}

/* ---------- print / PDF ---------- */
@media print {
  html, body { background: var(--ms-bg); }
  .markdown-body { max-width: none; padding: 0; margin: 0; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  h1 + *, h2 + *, h3 + *, h4 + *, h5 + *, h6 + * { break-before: avoid; }
  p, li { orphans: 3; widows: 3; }
  pre, pre code { white-space: pre-wrap; overflow-wrap: anywhere; }
  pre { overflow: visible; }
  blockquote, img, tr, figure, .ms-diagram, .ms-math-block, .ms-diagram-error { break-inside: avoid; page-break-inside: avoid; }
  table { display: table; width: auto; max-width: 100%; overflow: visible; }
  th, td { overflow-wrap: anywhere; }
  /* Many columns: smaller text keeps words whole instead of breaking them. */
  table:has(> thead th:nth-child(7)) { font-size: 0.82em; }
  table:has(> thead th:nth-child(7)) th, table:has(> thead th:nth-child(7)) td { padding-left: 0.3em; padding-right: 0.3em; }
  table:has(> thead th:nth-child(10)) { font-size: 0.7em; }
  table.ms-table-short { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  img, .ms-diagram svg { max-height: var(--ms-page-height); object-fit: contain; }
  .ms-math-block { overflow: visible; }
  .ms-diagram { overflow: visible; }
  a { color: var(--ms-link); }
  .ms-page-break { margin: 0; border: 0; }
}
`

/** Colour of the links in running text is theme-defined; these rules give each theme its voice. */
export const THEME_CSS = {
  minimal: String.raw`
h1 { font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.7em; }
h2 { font-weight: 650; letter-spacing: -0.01em; margin-top: 1.9em; }
h3 { font-weight: 600; }
a { text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--ms-link) 35%, transparent); text-underline-offset: 0.18em; }
a:hover { text-decoration-color: var(--ms-link); }
ul > li::marker { color: var(--ms-accent); }
hr { background: var(--ms-border); }
`,
  technical: String.raw`
h1 { padding-bottom: 0.3em; border-bottom: 2px solid var(--ms-accent); letter-spacing: -0.01em; }
h2 { padding-bottom: 0.25em; border-bottom: 1px solid var(--ms-border); margin-top: 1.7em; }
h3 { padding-left: 0.6em; border-left: 4px solid var(--ms-accent); }
h4 { text-transform: uppercase; letter-spacing: 0.06em; font-size: calc(var(--ms-h4) * 0.92); color: var(--ms-muted); }
code:not(pre code) { border: 1px solid var(--ms-border); padding-top: 0.08em; padding-bottom: 0.08em; }
pre { border-left: 4px solid var(--ms-accent); }
th { text-transform: none; font-size: 0.92em; }
hr { height: 2px; }
strong { font-weight: 700; }
`,
  editorial: String.raw`
body { font-kerning: normal; font-feature-settings: 'liga', 'kern'; }
.markdown-body { padding-top: 64px; }
h1 { margin-bottom: 0.9em; font-weight: 400; text-align: center; letter-spacing: 0.01em; line-height: 1.15; }
h1::after { content: ''; display: block; width: 3.2em; height: 2px; margin: 0.55em auto 0; background: var(--ms-accent); }
h2 { margin-top: 2.2em; font-weight: 500; font-style: italic; }
h3 { font-weight: 600; letter-spacing: 0.02em; }
h4, h5, h6 { text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
h1 + p::first-letter { float: left; margin: 0.06em 0.1em 0 0; font-family: var(--ms-font-heading); font-size: 3.7em; line-height: 0.82; color: var(--ms-accent); }
a { color: var(--ms-link); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 0.2em; }
hr { height: auto; margin: 2.4em 0; text-align: center; background: transparent; }
hr::after { content: '\2767'; font-size: 1.4em; color: var(--ms-accent); }
li > p { text-align: left; }
blockquote { font-size: 1.04em; }
`,
  report: String.raw`
body { counter-reset: report-h2 report-h3; }
.markdown-body { max-width: calc(var(--ms-width) + 2 * 56px); padding-left: 56px; padding-right: 56px; }
h1 { margin-bottom: 0.9em; padding-bottom: 0.35em; font-variant: small-caps; letter-spacing: 0.03em; border-bottom: 3px solid var(--ms-accent); }
h2 { counter-increment: report-h2; counter-reset: report-h3; margin-top: 1.8em; padding-bottom: 0.2em; border-bottom: 1px solid var(--ms-border); color: var(--ms-accent); }
h2::before { content: counter(report-h2) '.\00a0\00a0'; }
h3 { counter-increment: report-h3; }
h3::before { content: counter(report-h2) '.' counter(report-h3) '\00a0\00a0'; color: var(--ms-muted); }
h2.manual-number, h3.manual-number { counter-increment: none; }
h2.manual-number::before, h3.manual-number::before { content: none; }
h4 { font-style: italic; font-weight: 600; }
p { text-align: justify; hyphens: auto; -webkit-hyphens: auto; }
li > p { text-align: left; }
th { font-family: var(--ms-font-heading); letter-spacing: 0.02em; }
table { font-family: var(--ms-font-heading); font-size: 0.9em; }
blockquote { margin-left: 1.2em; margin-right: 1.2em; }
hr { height: 2px; background: var(--ms-accent); opacity: 0.55; }
@media print {
  h1 { break-after: avoid; }
}
`
} as const
