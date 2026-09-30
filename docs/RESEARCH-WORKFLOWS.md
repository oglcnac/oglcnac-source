# Connected research workflows

The Atlas source records and tracked sequence snapshot are unchanged. This release connects the existing tools and provides portable scientific outputs.

## Atlas to Workbench

Protein records expose **Analyze in Workbench**. Collections expose **Analyze selected**. `/analysis/?ids=P12270,P18583` resolves identifiers against the exact Atlas accession catalog, retaining isoforms and legacy identifier case. Up to 500 input entries are accepted. Duplicate identifiers are prepared once.

The preparation table reports each unique requested accession, source species, sequence length and outcome. The browser retrieves only the required accession buckets. Missing sequences, absent identifiers, unsupported species/residues, ambiguous species, oversized sequences and proteins without S/T candidates are explicit outcomes. Human and mouse groups remain separate. A wholly compatible single-species request fills FASTA automatically without running prediction. Mixed or incomplete requests require selecting a species group. Groups exceeding the existing 200,000-character FASTA limit are rejected without partial preparation. Researchers can inspect/edit the FASTA before running; the actual submitted input is authoritative.

Workbench results link to source protein records. Matching Atlas sites link directly to the reported position. Predictions and original experimental evidence remain distinct; no model or scientific record was changed.

## Search suggestions

The lazy-loaded protein catalog retains every distinct reported gene name, protein name and species for each accession. Ranking uses exact accession, exact reported gene token, accession prefix, gene prefix, exact/prefix protein name, then substring matching. Ties use accession order. This is not a reviewed-entry ranking or an external identifier mapping service.

The combobox displays up to eight suggestions with species and match context. Arrow keys navigate, Enter accepts the explicitly highlighted result, Escape closes, and Tab leaves the menu. Without a highlighted choice, form submission uses the selected search field. Suggestions are disabled for peptide/species searches. Loading, failed and empty suggestions preserve ordinary search. Suggestion notices and menus do not change the results layout.

## Study evidence

`/atlas/publications/` searches the represented literature by title, author, PMID or DOI, with year and species filters. URLs retain the query, filters and page. `/atlas/study/?pmid=20068230` shows one paper's source-linked records, distinct nonblank accessions and unique accession/species/numeric-position combinations. Numeric positions preserve original source values; they are not a count of independently validated sites.

Rows citing multiple PMIDs belong to each cited study. Directory totals must not be summed as independent evidence. Blank accessions remain in complete study evidence exports and are reported explicitly. The protein table exports summaries; **Download study evidence CSV** exports all original fields and source rows. Collection selection is capped at 500 accessions; large studies require a smaller selection.

## Figures

The protein map's **Export a scientific figure** disclosure accepts a full protein, the current map region or explicit inclusive one-based bounds. It builds a self-contained SVG with embedded structured metadata and a 2× PNG. The exported scope uses record-wide evidence filters; selecting a site only sets the current-map region when that action is chosen. Independent table text searches and column visibility do not change the scientific figure.

Circle/square/diamond tracks retain reported ambiguity categories. Ochre crosses identify residue conflicts at their original reported coordinates. Missing/non-numeric and out-of-sequence records are disclosed. Domains and regions require the existing exact accession/sequence verification. Bar descriptions, full annotation ranges, selected range, sequence hash, record IDs, filters and provenance are embedded in SVG metadata. PNG requires a canvas-compatible image; exceptionally tall figures over 8,000 logical pixels require a smaller range or SVG.

## Research reports

Reports are created in the browser as standard ZIP archives with UTF-8 filenames, CRC-32 archive integrity, a versioned JSON manifest and SHA-256 checksums for each payload. They are downloads, not server submissions or a promise of hosted persistent storage.

- **Atlas protein:** complete and record-wide-filtered source evidence (CSV/JSON), available sequence FASTA, selected position and filters, compatible annotation metadata, citations and dataset provenance. Missing sequences and unverified annotations remain explicit. If the existing record page uses its UniProt fallback, the report retains the provider FASTA header and labels the sequence as live or browser-cached UniProt, rather than the tracked Atlas snapshot. Figure metadata and captions carry the same distinction. A report can still contain evidence when no sequence is available.
- **Workbench:** exact submitted FASTA, complete and filtered results (CSV/JSON), original Atlas/OGT source records for the input accessions, input sequence hashes, species model, model configuration and model asset hashes, tracked sequence snapshot, citations, dataset provenance and UTC run/export timestamps. It captures the completed run; later input edits cannot replace that report's input. Original preparation choices are recorded separately from the actual submitted input.

Model weights are not bundled in reports. The original manifest records paths and checksums for independent retrieval. Citation failures are disclosed per report/PMID. Essential provenance failures or mismatched Atlas/model manifest revisions prevent a report export rather than inventing a version. Normal prediction results remain available if report metadata cannot load.

## Generated catalog and validation

`python3 -m scripts.build_research_catalog` derives the protein/study catalogs and hashes their authoritative source files. `--check` verifies deterministic JSON and gzip outputs. The repository's data-delivery checks include this generator.

```sh
npm run qa:pr
npm run qa:public
SITE_STATIC_ROOT=dist-public node --test scripts/tests/research-workflows-browser.test.js
SITE_BROWSER=firefox SITE_STATIC_ROOT=dist-public node --test scripts/tests/research-workflows-browser.test.js
SITE_BROWSER=webkit SITE_STATIC_ROOT=dist-public node --test scripts/tests/research-workflows-browser.test.js
REVIEW_OUTPUT=/path/to/screenshots node scripts/capture_research_workflows_review.js
PERF_SITE_ROOT=/absolute/path/to/dist-public PERF_OUTPUT_ROOT=/path/to/performance node scripts/measure_research_workflows_performance.cjs
```

Use `SITE_BASE_URL=https://oglcnac.org` for live browser tests and `REVIEW_BASE_URL=https://oglcnac.org` for live visual capture. Collection writes are confined to disposable test browser contexts.
