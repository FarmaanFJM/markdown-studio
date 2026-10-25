# Performance

Measured with `scripts/benchmark.mjs`, which drives the real Electron application (Playwright,
Xvfb) through generated documents and records typing latency, long tasks, preview latency,
render time (`ms:preview-render` performance marks), PDF-preview time, memory growth, tab
switching and repeated exports.

```sh
npm run build
npm run benchmark                                   # this checkout
node scripts/benchmark.mjs --app /path/to/baseline  # a build of another revision
```

## Environment

|           |                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| OS        | Linux 6.18 (cloud container, software rendering, no GPU)                                                                           |
| CPU / RAM | Intel Xeon @ 2.80 GHz, 4 vCPU / 16 GB                                                                                              |
| Electron  | 44.9.3 (Chromium 152)                                                                                                              |
| Node      | 22.22.0                                                                                                                            |
| Baseline  | `main` at b284c3e (Phase 2), built in a separate worktree                                                                          |
| Phase 3   | this branch                                                                                                                        |
| Raw data  | [`benchmarks/bench-baseline.json`](benchmarks/bench-baseline.json), [`benchmarks/bench-phase3.json`](benchmarks/bench-phase3.json) |

A single run on a shared virtual machine: differences below roughly 15% are noise. Numbers are
not comparable with other hardware. Windows and macOS were not benchmarked.

## Results (full run; milliseconds)

Key-to-frame is the editor's keystroke-to-next-frame latency (p50 / p95). Long tasks are main-thread
tasks over 50 ms during typing (count / total). Preview latency is the time from the last keystroke
to an updated preview.

| Document       | Key→frame p50 base → P3 | p95 base → P3 | Long tasks base → P3 | Preview latency base → P3 | PDF preview base → P3 |
| -------------- | ----------------------- | ------------- | -------------------- | ------------------------- | --------------------- |
| Small notes    | 28 → 27                 | 45 → 41       | 0 → 0                | 118 → 127                 | 401 → 440             |
| Medium (60 KB) | 30 → 30                 | 43 → 38       | 4 → 4                | 349 → 279                 | 1178 → 1691           |
| Large (400 KB) | 53 → 40                 | 65 → 104      | 9 → 9                | 1915 → 1586               | 4758 → 5199           |
| Huge (1.1 MB)  | 86 → 92                 | 130 → 128     | 120 → 124            | 3623 → 3789               | 19223 → 28693         |
| 300 tables     | 32 → 33                 | 72 → 61       | 15 → 15              | 561 → 582                 | 2272 → 1866           |
| 4 large images | 26 → 26                 | 88 → 33       | 8 → 0                | 137 → 129                 | 3439 → 3468           |
| Mixed          | 34 → 33                 | 48 → 90       | 27 → 18              | 613 → 766                 | 2259 → 4057           |

Documents using Phase 3 features (the baseline shows them as plain text, so they are not a
like-for-like comparison):

| Document             | Phase 3 render       | Key→frame p50 | Preview latency | PDF preview |
| -------------------- | -------------------- | ------------- | --------------- | ----------- |
| 10 Mermaid diagrams  | 7 ms (cached)        | 27            | 129             | 878         |
| 500 math expressions | 1239 ms first render | 26            | 224             | 2648        |

Other measurements: tab switching 60× took 163 ms per switch (baseline) vs 179 ms (Phase 3), with
the preview always matching the active document; 60 typing/render cycles of the medium document
showed no measurable renderer-heap growth in either version (the heap reading is coarse, so this
rules out large leaks only); ten repeated exports leaked no more than 0.3 MB in the main
processes.

## Reading the results

- **Editing stays responsive.** Typing latency is unchanged within noise on every document; the
  editor never waits for the preview.
- **Large and huge documents are heavy in both versions.** A 400 KB document takes about 1.6 s to
  refresh the preview, a 1.1 MB document about 3.8 s with more than 100 long tasks. This is
  unchanged from Phase 2 and remains a limitation.
- **Math is the one new cost on text-heavy pages.** 500 expressions take about 1.2 s to render the
  first time (it was about 1 s per edit before equations were rendered once and cached by
  content; edits now re-render in about 190 ms).
- **PDF generation is slower.** The PDF preview is slower for the mixed document (2.3 → 4.1 s) and
  the huge document (19 → 29 s) because the PDF now includes the theme, KaTeX styles and
  rendered diagrams. For small and medium documents the difference is a fraction of a second.
- **Export is slower per run.** The median repeated PDF export went from 243 ms to 1617 ms. The
  Phase 3 figure includes the Export dialog step, print options and PDF validation, which the
  baseline did not have; the split between these costs was not profiled. This is a regression in
  absolute terms.
- **Diagrams** are rendered in a separate sandboxed window, serially, and are cached; typing in a
  document with ten diagrams showed no long tasks.

Phase 3 has not been tuned further. The first items for a later phase are incremental rendering
of very large documents and reusing the PDF preview output for export.

## Levels 1 and 2 (publishing layer)

Same machine and method as above (a single run on a shared 4 vCPU virtual machine, software
rendering, no GPU; differences below roughly 15% are noise). The baseline is `main` at `a71434e`
(Phase 3, merged), built in a separate worktree; "Levels 1–2" is this branch. Raw data:
[`bench-level0-phase3.json`](benchmarks/bench-level0-phase3.json),
[`bench-level12.json`](benchmarks/bench-level12.json) and, for the publishing document after the
warm-up change described below, [`bench-level12-publishing-rerun.json`](benchmarks/bench-level12-publishing-rerun.json).
Milliseconds, baseline → Levels 1–2:

| Document                                           | Key→frame p50 | p95           | Long tasks | Preview latency | Open        | PDF preview   |
| -------------------------------------------------- | ------------- | ------------- | ---------- | --------------- | ----------- | ------------- |
| small notes                                        | 26.7 → 28.7   | 50.3 → 41.2   | 0 → 0      | 121 → 122       | 315 → 280   | 484 → 487     |
| medium technical (60 KB)                           | 30.8 → 29.9   | 45.3 → 49.3   | 4 → 4      | 312 → 321       | 583 → 651   | 1660 → 1174   |
| large (400 KB)                                     | 55.5 → 50.8   | 103 → 175.9   | 27 → 24    | 1858 → 1754     | 2041 → 2513 | 7686 → 5655   |
| huge (1.1 MB)                                      | 117 → 116.3   | 200.6 → 183.3 | 132 → 136  | 4125 → 4119     | 4526 → 5347 | 43511 → 32185 |
| tables and headings (300 tables)                   | 49.9 → 40.7   | 62.9 → 80.6   | 15 → 25    | 661 → 738       | 1269 → 1390 | 2487 → 2625   |
| diagrams (10 Mermaid)                              | 28 → 26.4     | 36.9 → 33.2   | 0 → 0      | 129 → 128       | 218 → 246   | 1452 → 910    |
| math (500 expressions)                             | 26.6 → 26.7   | 45.6 → 36.8   | 14 → 14    | 334 → 236       | 2086 → 2897 | 3749 → 3210   |
| large images (4 x 2400 px)                         | 27.8 → 26.7   | 35.1 → 36     | 0 → 8      | 127 → 126       | 198 → 214   | 5603 → 4066   |
| publishing report (captions, citations, numbering) | 27.3 → 26.4   | 34.9 → 71.2   | 9 → 9      | 183 → 207       | 294 → 1720  | 1478 → 1555   |
| mixed (diagrams, tables, math, code)               | 27.5 → 27.4   | 62.3 → 91.4   | 30 → 30    | 899 → 747       | 1000 → 1050 | 4533 → 4058   |

The publishing document (40 sections, 40 captioned tables, 14 captioned figures, 120 citations of
30 sources, front matter with contents and numbering) is shown as plain text by the baseline, so
it is not a like-for-like comparison.

- **Typing stays responsive.** Key-to-frame latency is unchanged within noise on every document;
  the editor never waits for the preview.
- **Open and refresh times** of the large and huge documents are 20–25% higher in this run
  (400 KB: 2.0 → 2.5 s, 1.1 MB: 4.5 → 5.3 s). That is above the noise margin, so treat it as a
  small real cost of the extra parsing passes (front matter, captions, references); it was not
  profiled further. PDF preview times differ in both directions and are within the run-to-run
  variation of this machine.
- **First citation cost.** Building the APA formatter takes about one second. Measured on the
  publishing document, opening it took 1.7 s the first time. The formatter is now created while
  the window is idle when a project has sources, and it is reused when sources are edited
  (previously every edit rebuilt it): opening the document took 1.06 s afterwards, the first
  render had a 0.5 s peak, later renders took 0.1–0.13 s, and typing showed one long task (107 ms)
  instead of nine. Citations are only re-formatted when the set of citations in the document
  changes; the front matter is only re-parsed when it changes.
- **Memory.** The renderer heap at start-up is higher (57 → 125 MB) because the citation engine
  and styles are bundled; the 60 typing/render cycles showed no growth in either version.
- **Tab switching** (60 switches) 209 → 235 ms each (within noise), the preview always matching the
  active document. **Repeated PDF export** (10 runs): median 1.9 → 2.1 s, no growth in the main
  process memory.
- **Publications** build in two passes over the chapters (parse for numbers and labels, then
  render each chapter). They were **not benchmarked**: the end-to-end test project (three short
  chapters) previews and exports normally, but the preview of a publication re-reads and
  re-renders every chapter when any open document changes and nothing is cached per chapter, so a
  book of many large chapters will refresh much more slowly than a single document.

Windows and macOS were not benchmarked.
