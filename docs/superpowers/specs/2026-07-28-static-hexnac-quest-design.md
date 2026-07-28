# Static HexNAcQuest Design

## Goal

Replace the externally hosted HexNAcQuest Shiny applications with a fully
static, reproducible implementation at `https://oglcnac.org/hexnac-quest/`.
All prediction work must run locally in the visitor's browser. The source,
model contract, dependencies, public assets, tests, and deployment
documentation must live in `oglcnac-source`; the generated site must deploy to
the `oglcnac` GitHub Pages repository.

## Public surface

The static tool has four site-native pages:

- `/hexnac-quest/` — overview and privacy statement
- `/hexnac-quest/analysis/` — CSV upload, validation, prediction, and download
- `/hexnac-quest/tutorial/` — migrated tutorial content and images
- `/hexnac-quest/contact/` — site-native contact information

Existing navigation and footer links point to these internal routes. No page
depends on shinyapps.io or a prediction API.

## Prediction contract

Input is one CSV file with the required headers `id`, `f126`, `f138`, `f144`,
`f168`, and `f186`. Header order may vary and extra columns are ignored.
UTF-8 BOM and surrounding header whitespace are normalized. IDs remain text,
including leading zeroes and duplicates, and input order is preserved.

Each feature must be present, finite, numeric, and non-negative. Rows are
invalid when the five-feature total is not positive or when `f126`, `f138`,
and `f144` are all zero. Valid rows are normalized by the total of all five
features and classified with:

```text
eta = 0.79350765966158299
    - 2.4253373848141848 * pf126
    + 3.2544462225879660 * pf138
    - 11.240096307175865 * pf144
```

`eta > 0` yields `GlcNAc`; otherwise it yields `GalNAc`. The exported columns
are exactly `pred_outcome,id,f126,f138,f144,f168,f186`.

Invalid rows are skipped while valid rows are predicted. The UI reports each
skipped data-row number and reason. If no valid rows remain, prediction is
blocked with a clear error. Files are limited to 25 MB and 250,000 data rows.

## Browser architecture

Papa Parse 5.5.4 is pinned and self-hosted. A dedicated Web Worker parses,
validates, and predicts without blocking the main UI. The main thread owns
upload controls, bounded previews, the accessible five-bar spectrum chart,
progress, cancellation, pagination, summaries, and result download.
Cancellation terminates the worker and discards partial results.

The model is represented by a small versioned JSON manifest that records its
formula, coefficients, threshold, labels, required columns, source RDS
checksum, and canonical example checksum. The legacy 250 MB R object and
Shiny sources are not copied into the website repository.

## Verification and retirement

Unit tests cover the formula, threshold, CSV validation, row preservation,
limits, and export contract. A golden fixture derived once from the legacy R
model verifies every row in the canonical 10,000-row example (9,452 GlcNAc
and 548 GalNAc). Playwright checks the complete browser workflow, local-only
network behavior, progress, cancellation, and downloads in Chromium, Firefox,
and WebKit.

Only after the merged static site is deployed and production smoke tests pass
will the two shinyapps.io applications (`o-glcnac-quest` and `HexNAcQuest`)
be archived with `rsconnect::terminateApp()`. Archiving is recoverable and is
preferred to permanent deletion.
