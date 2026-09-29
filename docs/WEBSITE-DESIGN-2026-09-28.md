# Mature interface refinement

This release makes oglcnac.org a compact scientific workspace. The homepage starts with a working Atlas search and a directory explaining the input, output, and direct action for each of the five resources. Navigation, page headings, forms, tables, and support pages share a restrained white surface, clear type hierarchy, consistent gutters, and visible keyboard focus.

## Changes

- Replaced the illustrated homepage splash and repeated promotional cards with direct search, a five-resource directory, and concise scientific context and provenance links.
- Simplified the header and resource navigation, removed gradients and heavy shadows, reduced title sizes, and flattened redundant directory and contact borders. Supporting-page headings now align with their content.
- Made PRED-DL and Workbench forms compact, with secondary interpretation guidance available through native disclosure controls. Scientific caveats remain visible. Results retain their complete fields and exports.
- Simplified HexNAcQuest summaries and input/results sections, with a horizontal-scroll hint where intensity tables need it.
- Preserved publication figures, scientific background, data, model artifacts, citations, and reproducibility information. Archived two unused homepage illustrations outside the generated public artifact.
- Kept the prior delivery, cancellation/retry, mobile table, sequence-loading, accessibility, and public-release fixes described in `WEBSITE-IMPROVEMENTS-2026-09-28.md`.

## Validation

The review covers all 29 configured public pages at 320, 390, 768, 1440, and 1920 pixels: 145 route/viewport checks with no console errors, failed requests, HTTP errors, or horizontal overflow. There are 88 reviewed desktop/mobile screenshots, including 15 additional result, empty, error, and expanded-publication-figure states. Navigation was checked at 11 widths from 320 to 3840 pixels.

All 34 shared interaction cases and all 22 PRED-DL, Workbench, and HexNAcQuest cases were confirmed in Chromium, Firefox, and Playwright WebKit. These include real human/mouse inference, golden outputs, cancellation/retry, input modes, full exports, and mobile fields. Earlier overlapping build/validation runs produced four transient failures; all four passed when rechecked against the frozen artifact. Both the original logs and targeted reruns are retained.

The accessibility suite passed 86 checks in each engine, with no detected WCAG A/AA violations. The final Atlas filter alignment additionally passed at four widths in all three engines, including desktop/mobile axe checks and comparison of the 9,832 mouse records with the tracked dataset.

`npm run qa:pr` and `npm run qa:public` passed in the clean release checkout. Asset, route, link/fragment, external-runtime, and public-scope audits passed. The 757-file public build matches the reviewed and performance-test artifacts byte for byte. Unrelated research work in the original workspace is excluded from the release.

The final controlled mobile lab run completed 15/15 measurements at 390 pixels, 1.6 Mbps, 150 ms latency, and 4× CPU slowdown. All route budgets passed and measured layout shift was zero. Median data readiness was 3.50 s for Atlas browse, 3.46 s for accession search, and 1.15 s for detail plus sequence. These are local lab measurements, not field Core Web Vitals.

Evidence is retained locally under `visual-review/mature-ui-2026-09-28/`: `index.html`, `routes.json`, `supplemental.json`, `visual-review-final.json`, browser/test logs, `browse-final.json`, `release-parity.json`, and `performance/`.

## Reproduce

```sh
npm run qa:pr
npm run qa:public
SITE_STATIC_ROOT="$PWD/dist-public" node --test scripts/tests/site-interactions-browser.test.js
SITE_STATIC_ROOT="$PWD/dist-public" node --test scripts/tests/accessibility-browser.test.js
SITE_STATIC_ROOT="$PWD/dist-public" node --test --test-concurrency=1 scripts/tests/prediction-browser.test.js scripts/tests/workbench-browser.test.js scripts/tests/hexnac-quest-browser.test.js
```

Repeat browser suites with `SITE_BROWSER`, `PREDICTION_BROWSER`, `WORKBENCH_BROWSER`, and `HEXNAC_BROWSER` set to `firefox` and `webkit` as appropriate. Install Playwright browser dependencies on a supported host. Linux WebKit checks do not substitute for physical iOS/Safari or assistive-technology testing; those remain untested.
