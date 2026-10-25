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

| | |
| --- | --- |
| OS | Linux 6.18 (cloud container, software rendering, no GPU) |
| CPU / RAM | Intel Xeon @ 2.80 GHz, 4 vCPU / 16 GB |
| Electron | 44.9.3 (Chromium 152) |
| Node | 22.22.0 |
| Baseline | `main` at b284c3e (Phase 2), built in a separate worktree |
| Phase 3 | this branch |
| Raw data | [`benchmarks/bench-baseline.json`](benchmarks/bench-baseline.json), [`benchmarks/bench-phase3.json`](benchmarks/bench-phase3.json) |

A single run on a shared virtual machine: differences below roughly 15% are noise. Numbers are
not comparable with other hardware. Windows and macOS were not benchmarked.

## Results (full run; milliseconds)

Key-to-frame is the editor's keystroke-to-next-frame latency (p50 / p95). Long tasks are main-thread
tasks over 50 ms during typing (count / total). Preview latency is the time from the last keystroke
to an updated preview.

| Document | Key→frame p50 base → P3 | p95 base → P3 | Long tasks base → P3 | Preview latency base → P3 | PDF preview base → P3 |
| --- | --- | --- | --- | --- | --- |
| Small notes | 28 → 27 | 45 → 41 | 0 → 0 | 118 → 127 | 401 → 440 |
| Medium (60 KB) | 30 → 30 | 43 → 38 | 4 → 4 | 349 → 279 | 1178 → 1691 |
| Large (400 KB) | 53 → 40 | 65 → 104 | 9 → 9 | 1915 → 1586 | 4758 → 5199 |
| Huge (1.1 MB) | 86 → 92 | 130 → 128 | 120 → 124 | 3623 → 3789 | 19223 → 28693 |
| 300 tables | 32 → 33 | 72 → 61 | 15 → 15 | 561 → 582 | 2272 → 1866 |
| 4 large images | 26 → 26 | 88 → 33 | 8 → 0 | 137 → 129 | 3439 → 3468 |
| Mixed | 34 → 33 | 48 → 90 | 27 → 18 | 613 → 766 | 2259 → 4057 |

Documents using Phase 3 features (the baseline shows them as plain text, so they are not a
like-for-like comparison):

| Document | Phase 3 render | Key→frame p50 | Preview latency | PDF preview |
| --- | --- | --- | --- | --- |
| 10 Mermaid diagrams | 7 ms (cached) | 27 | 129 | 878 |
| 500 math expressions | 1239 ms first render | 26 | 224 | 2648 |

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
  Phase 3 figure includes the export dialog round trip, the print options and PDF validation, and
  the baseline exported directly with the preview's cached result. This is a regression in
  absolute terms.
- **Diagrams** are rendered in a separate sandboxed window, serially, and are cached; typing in a
  document with ten diagrams showed no long tasks.

Phase 3 has not been tuned further. The first items for a later phase are incremental rendering
of very large documents and reusing the PDF preview output for export.
