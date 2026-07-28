# Task 3 Report: Canonical Release Metadata and Self-Contained Atlas Sequences

Status: `DONE_WITH_CONCERNS`

## RED Evidence

All behavioral tests were written and observed failing before their production
changes.

### Release metadata and local FASTA snapshot

```bash
python3 -m unittest scripts.tests.test_generate_static_data -v
```

Initial result: 3 tests failed. The generator did not recognize the sequence
options and did not create either versioned artifact:

```text
FileNotFoundError: atlas-release-v1.json
error: unrecognized arguments: --atlas-sequence-fasta ...
```

Log: `/tmp/publication-task3-red-generator.log`

The later auditability assertion also failed before exact identifier lists
were added:

```text
KeyError: 'missing_accessions'
```

Log: `/tmp/publication-task3-red-coverage-lists.log`

The deterministic compressed-output assertion failed before gzip timestamps
were normalized:

```text
AssertionError: b'@\xf5hj' != b'\x00\x00\x00\x00'
```

Log: `/tmp/publication-task3-red-deterministic-gzip.log`

### Local-first browser sequence API

```bash
node --test scripts/tests/static-data.test.js
```

Initial result: 3 tests failed because the browser API did not expose a local
snapshot lookup:

```text
TypeError: api.getAtlasProteinFasta is not a function
```

Log: `/tmp/publication-task3-red-static-data.log`

The explicit non-UniProt guard also failed before implementation:

```text
actual:
  /static/data/atlas-sequences-v1.json
  https://rest.uniprot.org/uniprotkb/AT1G01030.fasta
```

Log: `/tmp/publication-task3-red-non-uniprot.log`

### Non-blocking evidence and current metrics

```bash
node --test \
  --test-name-pattern='Atlas evidence renders completely|Atlas statistics separates' \
  scripts/tests/site-interactions-browser.test.js
```

Both browser tests failed. Atlas evidence remained in its loading state while
the UniProt request was pending, and the statistics page had no live release
metric surface:

```text
page.waitForFunction: Timeout 1500ms exceeded.
locator('[data-atlas-metric="total"]'): Timeout 30000ms exceeded.
```

Log: `/tmp/publication-task3-red-browser.log`

## Implementation

### Canonical release metadata

`frontend/scripts/generate_static_data.py` now generates the tracked,
versioned `atlas-release-v1.json` and deterministic `.json.gz` companion.
Metadata records source filenames and SHA-256 hashes, release identity, exact
dataset counts, unique counts and their rules, identifier classifications,
and sequence coverage.

The generator preserves the canonical dataset split:

- dataset-I is unambiguous;
- dataset-II is ambiguous;
- labels are assigned only from their corresponding input options.

Current canonical counts derived from the tracked Atlas 5.0 CSVs are:

```text
total records                 61,035
dataset-I / unambiguous       46,517
dataset-II / ambiguous        14,518
```

Unique-count rules are explicit and tested:

- proteins: distinct trimmed nonblank accession values = 8,880;
- sites: distinct complete
  `(accession, position_in_protein, site_residue)` triples = 33,047.

Incomplete identifier/site rows remain in the 61,035 curated record count;
they are not silently repaired and do not enter the unique-site count.

### Versioned sequence snapshot

The generator accepts one or more controlled local FASTA inputs through
`--atlas-sequence-fasta`. It only stores an exact FASTA accession when the
Atlas record explicitly identifies the value as UniProt and it passes the
documented UniProt accession syntax. It does not infer canonical/isoform
mappings or map non-UniProt, blank, or unresolved identifiers.

For curator updates, `--fetch-uniprot-sequences` uses the official UniProt REST
query service with:

- sorted batches of at most 100 accessions;
- three attempts with exponential retry delay;
- an inter-batch delay for uncached requests;
- a persistent cache keyed by the exact batch accession set;
- response-header provenance capture.

The canonical update used 76 query batches (75 batches of 100 and one of 50).
It did not make thousands of individual accession requests. A subsequent
regeneration used all 76 cached responses.

The tracked `atlas-sequences-v1.json` contains an accession-to-sequence map,
provenance, aggregate coverage, and exact missing/excluded identifier lists.
The `.json.gz` output is deterministic and decompresses byte-for-byte to the
tracked JSON.

### Browser behavior

`frontend/static/js/static-data.js` now:

- loads the tracked snapshot before considering UniProt;
- returns local sequence data without any UniProt request;
- uses UniProt only for accessions listed in the snapshot's exact
  `missing_accessions` set;
- never sends explicitly excluded non-UniProt or unresolved identifiers to
  UniProt;
- retains browser cache behavior for fallback FASTA;
- returns an empty value when both local data and fallback fail.

The Atlas detail adapter publishes every peptide, evidence, and complete
record row and marks the record ready before starting sequence retrieval.
Sequence fallback is therefore non-blocking: a pending or failed UniProt
request cannot withhold curated evidence tables.

### Current versus historical statistics

The Atlas statistics page now loads current Atlas 5.0 metrics from
`atlas-release-v1.json` and displays:

- 61,035 total records;
- 46,517 dataset-I/unambiguous records;
- 14,518 dataset-II/ambiguous records;
- 8,880 distinct nonblank accessions;
- 33,047 distinct complete sites.

The pre-existing publication figures and images are unchanged. Their section
is labeled “Historical publication statistics (1984—Dec. 31, 2024)” and
explicitly states that the fixed figures are not current live release metrics.

## Sequence Provenance and Coverage

The final tracked snapshot reports:

```text
source                    UniProt REST API
retrieved date            2026-07-28
UniProt release           2026_02
UniProt release date      10-June-2026
API deployment date       10-July-2026
eligible accessions       7,550
resolved locally          7,239
missing                   311
candidate coverage        95.88%
non-UniProt identifiers   1,327
unresolved identifiers    3
blank-accession records   4
```

The three unresolved identifiers are `Q8WT1`, `unknown1`, and `unknown2`.
The four blank-accession record IDs are `10000155`, `10000156`, `10000187`,
and `10000221`. All 311 missing accessions and all 1,327 non-UniProt
identifiers are listed in the snapshot, rather than being silently mapped.

Artifact sizes:

```text
atlas-sequences-v1.json       approximately 6.3 MB
atlas-sequences-v1.json.gz    3,757,045 bytes
```

## GREEN Evidence

### Generator and browser data API

```bash
npm run test:data
```

Result:

```text
Python generator tests: 3 passed, 0 failed
Node browser-data tests: 4 passed, 0 failed
```

These tests cover exact canonical counts, unique-count rules, blank and
excluded identifiers, controlled local FASTA generation, provenance,
coverage, deterministic gzip, local snapshot priority, missing-accession
fallback, fallback failure, and non-UniProt rejection.

### Atlas/browser interactions

```bash
npm run test:tables
```

Result:

```text
table/static-data unit tests: 8 passed, 0 failed
Chromium interaction tests: 10 passed, 0 failed
```

The Chromium suite proves evidence becomes complete while sequence fallback is
still pending, a failed fallback leaves evidence intact, live Atlas metrics
render exactly, historical figures are clearly labeled, and all existing
search, browse, detail, export, PRED-DL table, and mobile interactions remain
green.

### Site build and runtime isolation

```bash
npm run build:site
npm run check:site
npm run qa:runtime
npm run test:site
```

Results:

```text
Generated 26 files.
Generated site is current (26 files).
Site QA checks passed.
Site build tests: 14 passed, 0 failed.
```

### Static and browser smoke

```bash
npm run smoke:static
```

Result: `PASS`.

The final worktree frontend was served locally and exercised with:

```bash
python3 -m http.server 8767 --bind 127.0.0.1 --directory frontend
OGLCNAC_BASE_URL=http://127.0.0.1:8767 npm run smoke:static:browser
```

Result:

```text
PAGE 200 /atlas/statistics/ ... O-GlcNAcAtlas 5.0 metrics
ATLAS_SEARCH_ROWS 10
ATLAS_BROWSE_ROWS 10
OGT_SEARCH_ROWS 2
ATLAS_DETAIL_PEPTIDE_ROWS 10
ATLAS_DETAIL_SEQUENCE_CHARS 2713
OGT_DETAIL_ROWS 10
PREDICTION_ROWS 1
HEXNAC_SUMMARY 2|0|1|1
BROWSER_SUMMARY PASS
```

All public pages returned HTTP 200. No page errors, failed asset requests,
`/api/data/` requests, or prediction API requests were observed.

### Scientific-tool regressions

```bash
npm run test:prediction
npm run test:hexnac
```

Results:

```text
PRED-DL unit:       12 passed, 0 failed
PRED-DL Chromium:    5 passed, 0 failed
HexNAcQuest unit:    8 passed, 0 failed
HexNAcQuest browser: 5 passed, 0 failed
```

### Artifact and protected-path integrity

```bash
git diff --check
python3 -m py_compile \
  frontend/scripts/generate_static_data.py \
  scripts/tests/test_generate_static_data.py \
  scripts/tests/test_site_build.py
```

Both commands exited 0.

A direct JSON/gzip integrity script verified:

```text
artifact_integrity=PASS sequences=7239 missing=311 non_uniprot=1327 unresolved=3 blank_records=4
```

The protected-path audit found no changed canonical CSV datasets, PRED-DL
models/assets, existing FASTA assets, prediction service, or API proxy. The
pre-existing `atlas-records` and `ogt-pin-records` bundles were restored
byte-for-byte after snapshot generation; only the new release and sequence
artifacts are added.

## Commits

- `50a7a62e989014a92ad0d46c916d75ab3215742f` — Add canonical Atlas release and sequence data

## Self-Review

- Confirmed release totals derive from the two canonical Atlas 5.0 CSVs and
  sum exactly: 46,517 + 14,518 = 61,035.
- Confirmed dataset-I and dataset-II labels never cross their input files.
- Confirmed the unique-protein and unique-site rules are literal metadata,
  documentation, and independently asserted test expectations.
- Confirmed four blank accessions remain blank and all incomplete site rows
  remain curated records.
- Confirmed only valid explicitly sourced UniProt accessions are sequence
  candidates.
- Confirmed exact FASTA accession matching prevents invented canonical/isoform
  mappings.
- Confirmed the browser never calls UniProt for locally resolved, non-UniProt,
  or unresolved identifiers.
- Confirmed evidence tables become ready before sequence lookup completes and
  remain complete if fallback fails.
- Confirmed ordinary builds/tests do not fetch UniProt and use tracked local
  artifacts.
- Confirmed the historical images/data were not changed and cannot be mistaken
  for live Atlas 5.0 metrics.
- Confirmed authoritative `site/` sources and tracked generated `frontend/`
  outputs are synchronized.
- Confirmed public route/query contracts and scientific record bundles remain
  unchanged.

## Concerns

1. UniProt release `2026_02` did not return exact FASTA entries for 311 of the
   7,550 eligible Atlas accessions. They remain explicitly listed and use a
   non-blocking browser fallback. Evidence records never depend on sequence
   availability.
2. The local snapshot adds approximately 6.3 MB uncompressed (3.76 MB gzip).
   This removes the normal external sequence dependency but increases the
   first Atlas detail data transfer when the server does not serve the
   precompressed companion.
