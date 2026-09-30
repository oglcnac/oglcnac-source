# Atlas evidence and biological context release

Approved 2026-09-30. A researcher must be able to select a modification site and understand its supporting studies, experiments, and sequence context without leaving the record.

## Required deliverables

1. Readable publications: retrieve and cache authoritative PubMed metadata for every PMID used by the Atlas; show verified titles, authors, journal, publication date, DOI when present, source links, citation copying, and an action to view a paper's supporting records. Missing or invalid metadata must retain the original identifier and a clear unavailable state. Never invent a citation.
2. Linked evidence filters: method, sample type, site ambiguity, and publication combine with the selected position. Counts, peptide/evidence tables, publication support, shareable URLs, browser history, and filtered CSV must agree. Reset restores the appropriate scope. Complete-record and all-fields exports keep every original source row and field. No scientific source values are rewritten.
3. Verified biological context: cache UniProt domains and annotated regions with provenance, retrieval date, release/version information, and sequence checksums. Plot coordinates only against an identical verified sequence for the requested accession or explicitly supported isoform. Never transfer canonical annotations to a different isoform by assuming an offset. Investigate all 1,046 previously identified source/sequence residue mismatches, preserving source values and reporting the checks and unresolved cases. Display readable feature descriptions and coordinates with an accessible alternative to the plot.

## Data and delivery standards

- Cover the complete source corpus, not only the example entry. Record metadata coverage, invalid identifiers, retrieval failures, unresolved sequences, uncertain feature boundaries, and audit categories in reproducible reports.
- Keep raw provider responses and reproducible refresh/build commands separate from immutable original Atlas data. Normal builds and CI use committed snapshots and never require the external APIs.
- Batch and cache provider requests. The browser loads only local, bounded enrichment payloads; record data stays usable if enrichment is unavailable.
- Keep Atlas evidence counts distinct from external annotations. Explicitly distinguish source residue mismatches from accession/sequence version mismatches.
- No new browser runtime dependency, fabricated confidence score, AI contributor credit, or public source-repository link.

## Acceptance and visual review

- Meaningful unit tests cover citation normalization, identifier verification, multiple PMIDs, missing metadata, filter intersection, zero matches, URL restoration, exact sequence verification, isoform isolation, feature boundaries, and the complete mismatch audit.
- Browser checks in Chromium, Firefox, and WebKit cover real source data, citation copy, publication-to-evidence navigation, filter combinations, clear/reset, history, shared links, filtered/full export parity, feature selection, keyboard use, failure states, and source exceptions.
- Inspect screenshots at 320, 390, 768, 1440, and 1920 pixels for dense and sparse records, long titles, missing metadata, no sequence, residue mismatches, incompatible sequence versions, and annotated features. Require no page overflow, clipped controls, overlapping labels, unreadable text, or hidden focused controls.
- Retain the compact blue/teal site identity. Use restrained typography, clear section hierarchy, and purposeful scientific graphics.
- Run WCAG A/AA checks on affected desktop/mobile states and the existing full-site suite; no new violations. Run repository/public-build checks and relevant existing workflows without weakening assertions.
- On representative records (P12270, P18583, O15294), measure three cold-cache mobile runs under 1.6 Mbps, 150 ms latency, and 4x CPU slowdown. Require median LCP <= 2.5 s, maximum CLS <= 0.1, data readiness <= 5 s, and initial transferred bytes <= 500 kB. Compare against the existing viewer baseline.
- Commit and deploy with the verified Yaoxiang Li identity. Verify public artifact parity, enrichment assets, live desktop/mobile workflows, all public routes, and required CI before completion.

## Completion record

All three deliverables are implemented. Offline checks cover the entire corpus: 61,035 unchanged source rows, 8,881 accessions, 427 verified citations, 7,239 sequence-compatible entries, and 47,776 annotations. All 1,046 source residue conflicts are audited: 459 consistent peptide candidates, 83 with partial support, and 504 unresolved. These are audit classifications, not source corrections.

Local acceptance passed: repository/public-build checks, the full repository unit suite, 17 affected-page checks in each of Chromium/Firefox/WebKit, and 138 whole-site browser checks (including 100 accessibility checks). Forty-five layouts were visually inspected across the specified states and widths; shortened position labels and wider citation buttons address the findings. Representative throttled mobile measurements meet the stated budgets.

Completed and published on 2026-09-30. The deployment receipt, live checks, audit limits, and final performance results are recorded in [the release report](ATLAS-EVIDENCE-CONTEXT-RELEASE.md). Detailed test logs, screenshots, and machine-readable performance reports are retained in the server workspace under `visual-review/evidence-context-20260930/`.
