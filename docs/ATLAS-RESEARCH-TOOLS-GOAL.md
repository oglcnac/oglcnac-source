# Atlas research tools release

Approved 2026-09-30. Complete all five workflows and publish the verified result.

## Executable deliverables

1. **Search context.** Add intersecting method, sample, ambiguity, PMID and verified publication-year filters to existing species/position filters. Conditional counts, both result views, source-field CSV, shared URLs and browser Back/Forward must agree. Preserve unknown filters as explicit zero-result states. Missing citation metadata must not silently broaden a year query.
2. **Batch accessions.** Paste or upload a plain accession list (comma, whitespace or semicolon separated, at most 500 identifiers). Match exact Atlas accessions, including isoforms and legacy identifiers; never silently replace a missing isoform with its canonical entry. Report matched, unmatched, invalid and duplicate inputs; export the report. Integrate matched proteins with ordinary filters, collection selection and comparison. Reject oversize input without partial processing.
3. **Local collections.** Select individual proteins or all matching proteins; save named collections, remove members, rename and delete collections with an explicit reversible confirmation. Persist across reloads in this browser. Validate versioned JSON backup/restore atomically, deduplicate members, preserve existing collections on import, and report unavailable storage or quota errors honestly. Show local-only/privacy and backup guidance. Link from search and protein records.
4. **Compare 2–4 proteins.** Share accessions in the URL; show protein identity, species, numeric positions, evidence records, publications, samples and methods. Show individual sequence tracks and verified domains with an accessible coordinate list. Each protein has its own axis; no sequence alignment or functional ranking is implied. Handle absent records, absent sequences and metadata failures explicitly. Export a comparison summary and link to complete evidence.
5. **Curator review.** Provide a searchable queue for all 1,046 audited source-residue conflicts. Show original position/residue, sequence residue, peptide candidates, per-record checks and source publications. Record reviewer, decision, rationale and supporting PMID; proposed coordinates require a positive coordinate and must not be treated as published corrections. Keep append-only local history and versioned export/import. Import must validate audit revision, keys and decisions before any write; conflicting history cannot overwrite local work. This workflow records human review, not automated scientific correction.

## Scientific and release invariants

- Original 61,035 Atlas rows, sequence snapshot and scientific annotations remain byte-identical. Source and projected context must agree for every row; no new remote runtime API or library.
- Persist only explicitly saved collections/reviews. Inputs remain in the browser; shared URLs contain only the accessions/filters needed to reproduce the view. Browser storage is not a server submission or shared curation system.
- Keep the restrained blue/teal design: readable tables, clear labels, compact hierarchy and purposeful protein graphics. No public source-repository references and no AI Git attribution.
- Work in an isolated release checkout; preserve unrelated research in the main workspace.

## Acceptance strategy

- Unit tests: all-row projection parity; intersecting facets and multi-PMID years; exact batch identity and limits; atomic import validation; storage failure; append-only review history and conflicting imports; independent comparison summaries.
- Playwright in Chromium, Firefox and WebKit: search/history/CSV parity, batch paste/upload/report, collection save/reload/import/remove, 2–4 protein comparison, review/save/history/restore, keyboard access, empty/error states. Test original workflows that share modified modules.
- Inspect screenshots at 320, 390, 768, 1440 and 1920 px for filtered search, batch diagnostics, selected results, collection management, comparison, curator queue and record review. No page overflow, overlapping labels, clipped controls or inaccessible focus. Primary controls at least 44 px high.
- WCAG A/AA checks on affected mobile/desktop states and existing whole-site checks; no new violations. Repository/public builds, route/link/asset audits and deterministic data checks pass.
- Measure cold mobile search, comparison and review readiness under 1.6 Mbps, 150 ms latency and 4x CPU slowdown: median LCP <= 2.5 s, maximum CLS <= 0.1, usable results <= 8 s. Record payloads and timing; avoid downloading the full Atlas corpus for these workflows.
- Verify effective human author/committer, push source, deploy the reviewed artifact, pass CI, check live routes and browser workflows and verify artifact parity. Document results and any limits before marking complete.

## Status

All five workflows are implemented. Local acceptance passed: repository/public builds and deterministic data checks; 21 research-tool browser checks in each of Chromium, Firefox and WebKit; existing evidence/viewer regression checks in all three engines; 106 full-site accessibility checks and 38 existing interaction checks, with targeted reruns for corrected layout findings. Sixty-five visual states cover the five required widths. Three cold mobile runs per representative workflow meet the LCP, CLS and readiness targets. Original Atlas records and sequences remain byte-identical. Published on 2026-09-30. The final release passed 21 research-tool checks in each browser locally and again on the live site, plus the original viewer/evidence regressions. All 1,290 deployed files match the reviewed build, and the 169 changed live files pass parity checks. The 65 visual states and whole-site smoke checks were repeated live. See [the release report](ATLAS-RESEARCH-TOOLS-RELEASE.md) for deployment identifiers, validation evidence and the linked CI runs. All five functional and visual deliverables are complete.
