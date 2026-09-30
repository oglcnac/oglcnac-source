# Atlas research tools release

The five approved workflows are implemented: evidence-aware search, exact accession batches, local collections, protein comparison, and local curator review. The interface retains the existing blue/teal identity and compact data tables.

## Scientific integrity

The 61,035 source rows and the sequence snapshot are byte-identical to the previous release. All projected method, sample, ambiguity, PMID, identity and position values are checked against every original row. The search projection remains compact (444,185 gzip bytes). Comparison resolves legacy mixed-case accessions and never substitutes canonical entries for missing isoforms. Annotation coordinates require the existing exact sequence checks.

All 1,046 mismatch cases are available in the curator queue: 459 consistent peptide candidates, 83 with partial support and 504 unresolved. Decisions require an identified reviewer and rationale; proposals additionally require a different positive coordinate and supporting PMID. These are browser-local review records. No original scientific value has been corrected or silently overwritten.

## Local validation

- `npm run qa:pr` and `npm run qa:public` passed, including deterministic data, build, route, link and asset audits.
- The final reviewed artifact passed 21 new-workflow checks in each of Chromium, Firefox and WebKit (63 checks), including both desktop/mobile accessibility states, CSV parity, history, file uploads, backups, quota failure, exact identifiers and review history with differing time-zone offsets.
- The 17 existing protein viewer/evidence checks passed in all three engines (51 checks).
- Full-site regression covered 106 accessibility checks and 38 interactions. The search-header spacing finding was corrected and the relevant title, table and all-page overflow tests rerun successfully.
- Sixty-five visual states cover 320, 390, 768, 1440 and 1920 px. Review included batch diagnostics, empty filtered results, saved selections, collection management, independent sequence maps, absent records/sequences, curator decisions and history. Findings corrected: mobile collection selection controls, narrow tablet table columns, control heights, search-header density and inherited section spacing.

## Mobile lab performance

Three fresh Chromium contexts per route; 390×844 viewport, HTTP gzip, 1.6 Mbps download, 150 ms latency and 4× CPU slowdown. These are lab measurements of the exact reviewed artifact, not field Core Web Vitals.

| Workflow | Median LCP | Maximum CLS | Slowest data readiness | Initial transfer |
| --- | ---: | ---: | ---: | ---: |
| OGT search | 0.780 s | 0.0293 | 4.687 s | 567,488 B |
| Three-protein comparison | 0.812 s | 0.0666 | 2.665 s | 239,048 B |
| Curator review | 0.800 s | 0 | 2.282 s | 172,326 B |

All meet the release targets: median LCP ≤2.5 s, maximum CLS ≤0.1 and usable results ≤8 s. Search uses the compact complete projection; comparison/review fetch only the required accession buckets and local annotations. Reserving comparison space before first paint corrected the initial layout shift.

## Publication

Publication verification is pending. Deployment must use Yaoxiang Li's established author and committer identity. Completion requires source CI, exact artifact/repository parity, live route checks and live browser workflows.

Detailed logs, screenshots and performance JSON are retained in the server workspace under `visual-review/research-tools-20260930/`. The implementation/storage contract and reproducible commands are in [ATLAS-RESEARCH-TOOLS.md](ATLAS-RESEARCH-TOOLS.md).
