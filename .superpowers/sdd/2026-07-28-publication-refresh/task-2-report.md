# Task 2 Report: Native Scalable Result Tables and Data Interactions

Status: `DONE_WITH_CONCERNS`

## RED Evidence

Tests were added before production changes.

### Native table API

```bash
node --test --test-name-pattern='exports the dependency-free' \
  scripts/tests/native-table-core.test.js
```

The command exited 1 because the legacy table utility did not export the
required native API:

```text
not ok 1 - exports the dependency-free native table state API
error: filterRows must be exported
expected: 'function'
actual: 'undefined'
```

### Browser integration and bounded Atlas rendering

```bash
node --test --test-name-pattern='Atlas search preserves' \
  scripts/tests/site-interactions-browser.test.js
```

The command exited 1 after 30 seconds because the legacy page never created
`window.OglcnacTables` or a registered bounded table:

```text
not ok 1 - Atlas search preserves every field mapping and bounds broad-result DOM rows
error: page.waitForFunction: Timeout 30000ms exceeded.
```

### Strict runtime gate

```bash
python3 -m unittest \
  scripts.tests.test_site_build.SiteBuildTests.test_generated_site_has_no_external_runtime_dependencies \
  -v
```

The command exited 1. Generated pages still loaded the centralized Bootstrap,
jQuery, DataTables, JSZip, and pdfmake CDN declarations. Representative
findings were:

```text
atlas/browse/index.html: external stylesheet https://cdn.jsdelivr.net/npm/bootstrap...
atlas/browse/index.html: external script https://cdnjs.cloudflare.com/ajax/libs/jquery...
atlas/browse/index.html: external script https://cdn.datatables.net/.../datatables.min.js
```

The complete RED logs were retained during implementation at:

- `/tmp/publication-task2-red-unit.log`
- `/tmp/publication-task2-red-browser.log`
- `/tmp/publication-task2-red-runtime.log`

## Implementation Summary

- Replaced `frontend/static/js/table-utils.js` with one dependency-free native
  table component shared by Atlas search, Atlas browse, all three Atlas detail
  tables, OGT-PIN search/detail, and PRED-DL results.
- The component keeps complete result arrays in memory but renders only the
  active page. It provides:
  - case-insensitive full-row filtering;
  - stable text and numeric sorting;
  - 10/25/50/100-row pagination;
  - copy-visible-rows as tab-delimited text;
  - full-filtered RFC-compatible CSV downloads;
  - accessible loading, ready, empty, error, copy, and export announcements.
- Preserved all route/query contracts:
  - `/atlas/search/?q=...&field=...`
  - `/atlas/browse/?species=...`
  - `/atlas/detail/?id=...`
  - `/ogt-pin/search/?q=...&field=...`
  - `/ogt-pin/detail/?id=...`
- Preserved every scientific field mapping and link destination. Page adapters
  convert existing records to text/link/render descriptors without altering
  canonical data.
- Added explicit accessible missing-record and data-load-error states to Atlas
  and OGT-PIN result/detail surfaces.
- Migrated PRED-DL rendering to the same native component without changing its
  worker, model assets, candidate order, scores, or confidence mapping.
- Removed the generator's legacy-runtime branch, both centralized legacy
  template fragments, and obsolete `legacy_runtime` configuration flags.
  Generated pages no longer load Bootstrap, jQuery, DataTables, JSZip, or
  pdfmake.
- Added native control styling to the authoritative modular CSS sources and
  regenerated all tracked `frontend/` HTML/CSS.
- Added package commands for the native table unit and Chromium suites.

## Verification Commands and Results

### Generated site and runtime isolation

```bash
npm run build:site
npm run check:site
npm run qa:runtime
npm run test:site
```

Results:

- Build generated 26 tracked files.
- Drift check: `Generated site is current (26 files).`
- Runtime audit: `Site QA checks passed.`
- Site/generator suite: 14 passed, 0 failed.

### Native table behavior and complete data interactions

```bash
npm run test:tables
```

Results:

- Native unit tests: 4 passed, 0 failed.
- Chromium interaction tests: 7 passed, 0 failed.
- The broad human Atlas search retained more than 30,000 matching records in
  memory and rendered exactly 10 body rows.
- All five Atlas search fields, all five OGT-PIN search fields, all seven Atlas
  browse species branches, known/missing details, empty/error states,
  copy-visible, full-filtered CSV, PRED-DL integration, and mobile navigation
  passed.

### PRED-DL and HexNAcQuest regressions

```bash
npm run test:prediction
npm run test:hexnac
```

Results:

- PRED-DL unit suite: 12 passed, 0 failed.
- PRED-DL Chromium suite: 5 passed, 0 failed, including every row in the
  Python golden FASTA corpus.
- HexNAcQuest unit suite: 8 passed, 0 failed.
- HexNAcQuest Chromium suite: 5 passed, 0 failed.

### Static and all-route browser smoke

```bash
npm run smoke:static
```

Result: `PASS`.

The final generated frontend was also served locally and exercised with:

```bash
OGLCNAC_BASE_URL=http://127.0.0.1:8766 \
  npm run smoke:static:browser
```

Result:

```text
ATLAS_SEARCH_ROWS 10
ATLAS_BROWSE_ROWS 10
OGT_SEARCH_ROWS 2
ATLAS_DETAIL_PEPTIDE_ROWS 10
ATLAS_DETAIL_SEQUENCE_CHARS 2741
OGT_DETAIL_ROWS 10
PREDICTION_ROWS 1
HEXNAC_SUMMARY 2|0|1|1
BROWSER_SUMMARY PASS
```

All 24 content routes returned HTTP 200. The smoke observed no page errors,
failed asset requests, `/api/data/` requests, or prediction API requests.

### Static checks and protected assets

```bash
git diff --check
python3 -m py_compile \
  scripts/build_site.py scripts/check_site.py scripts/tests/test_site_build.py
git diff --name-only | \
  rg '^(frontend/static/(data|dataset|prediction|fasta)|prediction-service|api)'
```

The whitespace and Python compilation checks exited 0. The protected-asset
query produced no paths: canonical JSON/CSV data, Atlas releases, FASTA/model
assets, prediction service, and API proxy were untouched.

An additional test outside the package verification matrix was attempted:

```bash
python3 -m unittest scripts.tests.test_browser_export -v
```

It could not start under the system Python because the optional prediction
export environment is not installed (`ModuleNotFoundError: numpy`). No
dependency was installed and no prediction/export asset was changed. The
required static PRED-DL unit, Chromium, golden-corpus, worker, and all-route
checks all passed.

## Commits

- `1cc8b02624a498e1c2246bc2e2204c30e22fd738` — Replace legacy result table runtime
- `caf35d21188f28727443f996e8a3462514d0c5e7` — Remove obsolete legacy runtime flags
- `b73303ca978b3f0b4d6223cf9b4d49b07bcf1865` — Reset table state for replacement results

## Self-Review

- Confirmed no production HTML references Bootstrap, jQuery, DataTables,
  JSZip, or pdfmake and `npm run qa:runtime` is green.
- Confirmed the unused historical vendor files remain unreferenced; their
  physical cleanup belongs to Task 5's orphan-asset audit.
- Confirmed large Atlas results create at most one page of DOM rows while the
  component's `totalRows` retains the complete result count.
- Confirmed copy uses only `visibleRows`, while CSV uses `filteredRows` and
  correctly quotes commas, quotes, and embedded newlines.
- Confirmed sorting is stable and compares numeric scientific fields
  numerically.
- Confirmed each Atlas/OGT-PIN adapter preserves its original field order,
  detail/UniProt/PubMed links, and public query keys.
- Confirmed missing records and load failures produce visible, live-region
  states instead of silent empty tables.
- Confirmed PRED-DL worker/model code and its reference output were not
  modified.
- Confirmed the generator still owns page HTML/CSS, generated output is
  current, and page-specific `<main>` snapshots remain unchanged.
- Confirmed no canonical dataset, release, model, FASTA, prediction-service,
  or API file appears in the implementation diff.

## Concerns

1. The canonical Atlas JSON is 29.6 MB. Task 2 deliberately keeps all 61,035
   records in memory as required; DOM growth is bounded, but initial download,
   JSON parse, and broad in-memory filtering still carry an unavoidable
   first-load cost.
2. Historical local Bootstrap/DataTables vendor files remain present but
   unreferenced. Task 5 explicitly owns confirmed-unused asset cleanup.
3. The optional Python browser-export test requires the repository's separate
   heavy prediction-export environment and could not run under system Python.
   All required PRED-DL browser/model parity suites passed.

## Review Fix Round 1: Replacement Result State

The review found that `NativeTable.setRows()` reset only the current page.
Secondary filtering, sort direction/column, and page size survived replacement
Atlas/OGT-PIN searches and PRED-DL predictions, so a valid new result could be
silently hidden by stale state.

### RED

Before production changes, the new browser regression dirtied the secondary
filter, page-size, and sorting state, submitted a valid replacement Atlas
query, and waited for its known result:

```bash
node --test --test-name-pattern='replacement Atlas' \
  scripts/tests/site-interactions-browser.test.js
```

The command exited 1:

```text
not ok 1 - replacement Atlas, OGT-PIN, and PRED-DL results reset table interaction state
error: locator.textContent: Timeout 30000ms exceeded.
  - waiting for locator('#atlas-search-results tr').first()
duration_ms: 30890.523236
```

The Atlas data query completed, but the retained
`WILL-HIDE-REPLACEMENT` table filter suppressed the valid `P18583` row.
The complete RED output is in
`/tmp/publication-task2-fix1-red.log`.

### Implementation

- Added `NativeTable.resetState()` to restore the secondary filter, current
  page, configured default page size and selector, sort column, and sort
  direction.
- Added the explicit `preserveState` replacement option to `setRows()`.
  Replacement data resets state unless preservation is explicitly requested.
- Atlas search, Atlas species browse, OGT-PIN search, and both PRED-DL clear
  and result paths explicitly use `preserveState: false`.
- Added a real-browser regression that dirties state and replaces results on
  Atlas, OGT-PIN, and PRED-DL. It asserts that known replacement rows are
  visible and all interaction state is back at its defaults.

### GREEN

The same focused command then exited 0:

```text
ok 1 - replacement Atlas, OGT-PIN, and PRED-DL results reset table interaction state
duration_ms: 1796.164739
tests 1
pass 1
fail 0
```

The complete GREEN output is in
`/tmp/publication-task2-fix1-green.log`.

### Fix-Round Verification

```bash
npm run build:site
npm run check:site
npm run qa:runtime
npm run test:site
npm run test:tables
npm run test:prediction
npm run test:hexnac
git diff --check
```

Results:

- Generated site: 26 files, current.
- Runtime audit: passed with no external runtime dependencies.
- Site/generator: 14 passed.
- Native tables: 4 unit and 8 Chromium tests passed.
- PRED-DL: 12 unit and 5 Chromium tests passed, including the golden corpus.
- HexNAcQuest: 8 unit and 5 Chromium tests passed.
- Total required tests: 56 passed, 0 failed.
- `git diff --check`: exit 0.

The fix did not touch the two ledgered Low findings concerning `aria-sort`
feedback and the LF/CRLF wording.
