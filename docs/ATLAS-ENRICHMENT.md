# Publication and sequence annotation snapshots

The Atlas source records and local sequences remain authoritative inputs. Enrichment is a separately versioned snapshot, used only for display and audit. No source row, position, residue, method, or publication identifier is rewritten.

## Refresh and reproduce

Run from the repository root:

```sh
# Fetch missing batches, reuse cached requests, and build deterministic outputs.
python3 -m scripts.build_atlas_enrichment --refresh
# Reproduce without contacting PubMed or UniProt.
python3 -m scripts.build_atlas_enrichment
# Assert complete request inventory, scientific input hashes, and byte parity.
python3 -m scripts.build_atlas_enrichment --check
python3 -m unittest scripts.tests.test_atlas_enrichment -v
```

`data/atlas-enrichment/` retains gzip-compressed provider responses and retrieval URLs/dates. `coverage.json` reports corpus coverage. The refresh command resumes a partial download and reuses existing batches. To obtain a new provider snapshot, archive the current cache outside this repository, then explicitly refresh an empty cache; do not mix releases. Review coverage and coordinate changes before committing new snapshots. Normal builds and CI use the committed cache without external API calls.

- PubMed: NCBI ESummary, batches of 100 PMIDs, verified response UID and PubMed article ID. Titles/authors/journal/date/DOI are plain text. Metadata missing from a response has an explicit unavailable state. No abstracts are included.
- UniProt: REST search, batches of 100 canonical accessions, primary accession matching, fixed output fields, explicit release header, exact sequence and feature boundary checks. A response reaching the page limit is rejected. Explicit isoform FASTA requests must return the requested FASTA identifier. Canonical annotations are eligible for an isoform only if UniProt declares that isoform `Displayed` and both sequences are identical.
- Browser: local manifest, publication metadata, and one of 256 accession buckets. The displayed sequence is independently checked with SHA-256 before coordinates are plotted. Enrichment failures leave Atlas records, tables, original PMID links, and complete exports accessible.

## Initial audited release: 2026-09-30

61,035 records and 8,881 accessions; all 427 detected publication IDs have verified metadata. UniProt release 2026_03 exactly matches all 7,239 available Atlas snapshot sequences and supplies 47,776 bounded annotations. Another 311 valid UniProt accessions have no local sequence; 1,331 entries do not have an eligible UniProt identifier. None are assigned speculative features. Feature counts include annotations such as predicted disordered regions and repeats; they are not counts of independently established biological functions or O-GlcNAc sites.

All 1,046 source/sequence residue conflicts were audited against both the local sequence and the new provider sequence. Their reported residues remain in disagreement at the original coordinates in the provider snapshot. Full peptide matching gives a consistent single candidate coordinate for every conflicting row at 459 positions, partial support at 83, and no consistent alternative at 504. Candidates are hypotheses for curator review, not automatically corrected sites. A site-level consistent candidate is not evidence that a publication used the same accession, isoform, numbering convention, or sequence version.

`public/static/data/atlas-enrichment/mapping-audit.json` includes each conflicting source record ID, reported residue, peptide-check status, candidates, current residue, and out-of-sequence positions. Modified peptide strings, missing offsets, residue disagreement within a peptide, absent peptides, and repeated peptide matches are kept distinct. Summary entries are also available in the per-protein bucket for the record interface. All original scientific input hashes are recorded in coverage.

## Browser and visual review

```sh
npm run qa:pr
npm run qa:public
# SITE_BROWSER also accepts firefox and webkit.
SITE_STATIC_ROOT=dist-public SITE_BROWSER=chromium node --test \
  scripts/tests/atlas-evidence-browser.test.js \
  scripts/tests/protein-viewer-browser.test.js
# Uses dist-public by default; REVIEW_BASE_URL can point at a live site.
REVIEW_OUTPUT=/path/to/review node scripts/capture_atlas_evidence_review.js
```

The visual capture checks nine states at five widths: overview, combined filters, citations, selected annotation, sparse evidence, absent sequence, residue mismatch, unavailable publication metadata, and incompatible sequence metadata. Geometry assertions cover overflow and control clipping. Review the actual images as well as these assertions. No screenshots or generated HTML are source assets.
