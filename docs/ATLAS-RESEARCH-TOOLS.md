# Atlas research tools

The public Atlas search, collections, comparison and mapping review pages share a dependency-free browser implementation. Source evidence remains authoritative; saving a review never changes Atlas data.

## Search and batch inputs

`build_atlas_delivery.py` derives dictionary-encoded method, sample, ambiguity and PMID columns in the existing projection, with the same row order and IDs as the original dataset. The complete 61,035-row projection is checked against the original fields in `atlas-tools.test.js`. Publication years come from the verified PubMed snapshot. With both PMID and year selected, the year must belong to that PMID. Missing metadata yields no matches for a specific year and remains visible as “Year unavailable.”

Batch input accepts whitespace, comma and semicolon delimiters, an optional accession header and quoted individual tokens. It rejects more than 500 entries or 100 KB of text without processing a partial batch. Matching is exact and case-insensitive against Atlas identifiers. Isoforms are never substituted. Diagnostic exports retain original input, sequence number and outcome. Full matching-evidence exports load source buckets only on demand and include every original field, including records with missing accessions.

Search URLs retain the submitted query or batch, sidebar filters and result view. Browser history restores these states. Table text filters and column/sort controls remain local to each table. Protein selection is independent of the sidebar filters within the current search; a new search clears it. Selection is limited to 500 accessions. Method, sample, ambiguity, PMID and year are forwarded to protein detail pages.

## Browser storage and backups

- `oglcnac:collections:v1`: `{kind: "oglcnac-collections", schema_version: 1, collections: [...]}`. Each collection has `id`, `name`, `updated` (ISO timestamp), and up to 500 accession strings. Up to 100 collections are supported. Import validates the whole payload before writing. Identical collections are ignored; an incoming collection with a conflicting ID is preserved as a separate imported collection. Changes read current storage before applying an update, and cross-tab storage events refresh the UI. Removal and deletion can be undone in the current page session.
- `oglcnac:reviews:v1`: `{kind: "oglcnac-reviews", schema_version: 1, audit_revision, events: [...]}`. Each event has a unique `id`, `key` (`accession:source-position`), `created`, `reviewer`, `decision`, `rationale`, `pmids`, and nullable `proposed_position`. Decisions are `needs-evidence`, `retain-source` or `propose-correction`. Proposals need a different positive position and a supporting PMID. The entry form also checks the local sequence length when available. Imported reviews are local human proposals, not a verification of the proposed coordinate or citation. Reviewer names are self-reported, not authenticated identities.

Review backups must match the current enrichment audit revision and known case keys. Imports append events, ignore exact duplicate events and reject altered events sharing an ID. The displayed latest decision is determined by timestamp and ID; earlier events remain in history. History supports up to 10,000 events. Backup imports and saved payloads share a 16 MB limit, so exported work remains restorable. Batch-file input is limited to 1 MB before the stricter 100 KB text check. Invalid input, unavailable storage and quota failures are surfaced without a success message or partial write. JSON export is the portable backup mechanism; there is no server synchronization or submission endpoint.

## Scientific comparison and review limits

Comparison accepts 2–4 accessions and uses complete records. Each sequence track has its own axis. Numeric positions, records, publications and sequence length use the same definitions as the detail viewer. Domain/region coordinates require exact accession and sequence hash compatibility; missing or mismatched metadata never produces inferred coordinates. Source-residue conflicts are marked separately. No cross-protein alignment, functional ranking or abundance score is calculated.

The review queue uses all 1,046 mismatches in the existing mapping audit. It exposes original source rows, peptide alignment checks, candidate coordinates, publication links and local decision history. It does not adjudicate the literature automatically. Publication of a scientific correction requires a separate reviewed data release.

## Verification commands

```sh
npm run qa:pr
npm run qa:public
SITE_STATIC_ROOT=dist-public node --test scripts/tests/atlas-tools-browser.test.js
SITE_BROWSER=firefox SITE_STATIC_ROOT=dist-public node --test scripts/tests/atlas-tools-browser.test.js
SITE_BROWSER=webkit SITE_STATIC_ROOT=dist-public node --test scripts/tests/atlas-tools-browser.test.js
REVIEW_OUTPUT=/path/to/screenshots node scripts/capture_atlas_tools_review.js
PERF_SITE_ROOT=/absolute/path/to/dist-public PERF_OUTPUT_ROOT=/path/to/measurements node scripts/measure_atlas_tools_performance.cjs
```

Set `SITE_BASE_URL=https://oglcnac.org` for the same live browser flows and `REVIEW_BASE_URL=https://oglcnac.org` for live screenshots. Test saves are confined to disposable browser contexts; these tools do not write review decisions to the live server. The performance script exits nonzero if a representative workflow misses the specified LCP, layout stability or readiness target.
