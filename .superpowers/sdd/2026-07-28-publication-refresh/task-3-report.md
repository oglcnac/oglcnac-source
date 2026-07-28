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

## Review Fix Round 1: Snapshot Trust, Reconciliation, Bounds, and Provenance

Status: `DONE_WITH_CONCERNS`

Commit:

- `584555182b8d571fe8780e62a6424e2f69d38dbd` — Harden Atlas sequence snapshot generation

### Finding 1: Fail Closed Without Snapshot Membership Proof

Root cause: `getAtlasProteinFasta()` caught snapshot fetch/parse failures and
then fell through to the UniProt fallback. The fallback therefore had no
successful local-snapshot membership proof.

#### RED

```bash
node --test --test-name-pattern='fails closed' \
  scripts/tests/static-data.test.js
```

Result: 1 failed, 0 passed.

```text
Expected values to be strictly deep-equal:
actual:
  /static/data/atlas-sequences-v1.json
  https://rest.uniprot.org/uniprotkb/AT1G01030.fasta
expected:
  /static/data/atlas-sequences-v1.json
```

Log: `/tmp/publication-task3-fix1-red-fail-closed.log`

#### GREEN

```bash
node --test --test-name-pattern='fails closed' \
  scripts/tests/static-data.test.js
```

Result:

```text
tests 1
pass 1
fail 0
```

Log: `/tmp/publication-task3-fix1-green-fail-closed.log`

Fix: snapshot fetch, HTTP, JSON parse, or shape failures now return an empty
sequence immediately. UniProt is contacted only after a successful snapshot
load and exact accession membership in `missing_accessions`.

### Finding 2: Reconcile Existing Snapshot With Every New CSV Release

Root cause: the normal no-FASTA/no-network branch loaded the existing snapshot
and reused its prior sequences, coverage, missing list, and exclusions without
comparing them to current CSV-derived categories.

#### RED

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_normal_regeneration_reconciles_snapshot_to_new_release_accessions \
  -v
```

The controlled first release supplied `P11111`; the second release replaced it
with `P22222`. Before the fix:

```text
FAIL
AssertionError: {'P11111': 'MSTAA'} != {}
Ran 1 test
FAILED (failures=1)
```

Log: `/tmp/publication-task3-fix1-red-stale-snapshot.log`

#### GREEN

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_normal_regeneration_reconciles_snapshot_to_new_release_accessions \
  -v
```

Result:

```text
Ran 1 test
OK
```

Log: `/tmp/publication-task3-fix1-green-stale-snapshot.log`

Fix: normal regeneration now intersects stored sequences with the exact
current eligible-accession set, removes obsolete sequences, rebuilds coverage
and exclusion lists from current CSV categories, lists newly eligible
accessions as missing, rewrites the reconciled snapshot, and passes that exact
coverage into release metadata. The documented normal workflow remains
network-independent but cannot silently publish stale sequence eligibility.

### Finding 3: Enforce Batch/Retry Bounds and Test Network Mechanics Offline

Root cause: curator CLI options used unconstrained `int` parsers even though
the documented interface promised bounded batching and retries.

#### RED

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_network_option_bounds_are_rejected_by_argument_parser \
  -v
```

Result: both subtests failed because invalid values reached the later generic
input validation:

```text
'between 1 and 100' not found in ... Provide --database or CSV inputs.
'between 1 and 5' not found in ... Provide --database or CSV inputs.
Ran 1 test
FAILED (failures=2)
```

Log: `/tmp/publication-task3-fix1-red-bounds.log`

#### GREEN

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_network_option_bounds_are_rejected_by_argument_parser \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_uniprot_batches_are_bounded_to_100_accessions \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_uniprot_batch_retries_then_uses_its_cache \
  -v
```

Result:

```text
test_network_option_bounds_are_rejected_by_argument_parser ... ok
test_uniprot_batches_are_bounded_to_100_accessions ... ok
test_uniprot_batch_retries_then_uses_its_cache ... ok
Ran 3 tests
OK
uniprot_batch=1 requested=100 ... cached=yes
uniprot_batch=2 requested=100 ... cached=yes
uniprot_batch=3 requested=5 ... cached=yes
```

Log: `/tmp/publication-task3-fix1-green-bounds-cache-retry.log`

Fix:

- `--uniprot-batch-size` accepts only 1–100;
- `--uniprot-retries` accepts only 1–5;
- defaults remain 100 and three;
- a 205-accession fake proves 100/100/5 batching;
- a fake transient `URLError` proves retry/backoff;
- a second identical call proves cached response reuse without another network
  call.

All network-mechanics tests use controlled fakes and temporary cache files; no
live UniProt request occurs.

### Finding 4: Reject Mixed Batch Provenance

Root cause: `fetch_uniprot_sequences()` merged batch headers with
`dict.update()`, so the final batch silently overwrote earlier release,
release-date, and API-deployment values.

#### RED

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_mixed_uniprot_batch_provenance_is_rejected \
  -v
```

Result:

```text
FAIL
AssertionError: RuntimeError not raised
Ran 1 test
FAILED (failures=1)
```

Log: `/tmp/publication-task3-fix1-red-provenance.log`

#### GREEN

```bash
python3 -m unittest \
  scripts.tests.test_generate_static_data.StaticDataGeneratorTests.test_mixed_uniprot_batch_provenance_is_rejected \
  -v
```

Result:

```text
Ran 1 test
OK
```

Log: `/tmp/publication-task3-fix1-green-provenance.log`

Fix: each batch contributes to a set for UniProt release, release date, and API
deployment date. Generation raises `RuntimeError` with both conflicting values
as soon as any set contains more than one value. A single-release provenance
claim is emitted only when all reported batch values are consistent.

### Fix-Round Full Verification

```bash
npm run test:data
```

Result:

```text
generator tests: 8 passed, 0 failed
browser-data tests: 5 passed, 0 failed
```

```bash
npm run test:tables
```

Result:

```text
table/static-data unit tests: 9 passed, 0 failed
Chromium interaction tests: 10 passed, 0 failed
```

```bash
npm run build:site
npm run check:site
npm run qa:runtime
npm run test:site
```

Result:

```text
Generated 26 files.
Generated site is current (26 files).
Site QA checks passed.
Site build tests: 14 passed, 0 failed.
```

```bash
git diff --check
python3 -m py_compile \
  frontend/scripts/generate_static_data.py \
  scripts/tests/test_generate_static_data.py
```

Both commands exited 0. A direct tracked-artifact check reported:

```text
artifact_integrity=PASS records=61035 sequences=7239 missing=311
```

### Fix-Round Self-Review

- Confirmed a failed snapshot fetch/parse has no code path to UniProt.
- Confirmed successful local membership remains required for fallback.
- Confirmed two-release regeneration removes the old sequence, marks the new
  eligible accession missing, and publishes matching release coverage.
- Confirmed normal reconciliation is local-only and retains only exact
  currently eligible accessions.
- Confirmed invalid CLI batch/retry bounds fail during argument parsing before
  any input or network work.
- Confirmed batching, one retry/backoff, and cache reuse are observable under
  controlled no-network tests.
- Confirmed each provenance dimension is accumulated independently and any
  mixed reported value aborts generation.
- Confirmed canonical tracked release/snapshot artifacts and their 7,239/311
  coverage remain unchanged by this logic-only fix.
- Confirmed the ledgered unique-site normalization wording was not expanded
  into unrelated UI or counting changes.
