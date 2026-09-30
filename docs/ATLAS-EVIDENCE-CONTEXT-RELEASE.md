# Atlas evidence and biological context: completed release

Released and verified on 2026-09-30. All goals in [the acceptance plan](ATLAS-EVIDENCE-CONTEXT-GOAL.md) are complete.

## Delivered

- Readable, locally cached PubMed citations for all 427 source identifiers, with author/journal/date/DOI details, plain-text citation copying, and publication-to-evidence navigation.
- Method, sample, ambiguity, and publication filters combined with selected protein positions. Counts, map markers, evidence tables, URLs, browser history, and matching CSV exports agree. Full-record downloads preserve every original source row and field.
- UniProt domains, repeats, coiled coils, and regions with exact sequence verification, annotation descriptions, coordinate lists, keyboard controls, source release/version provenance, and explicit unavailable states. The original blue/teal identity is retained.

## Scientific audit and limits

The release preserves all 61,035 source rows and 8,881 accessions. All 7,239 available Atlas sequences match their verified UniProt release 2026_03 sequences; 47,776 annotations pass exact boundary checks. A further 311 valid UniProt accessions lack a local sequence, and 1,331 entries have no eligible UniProt identifier. Coordinates are not inferred for either group.

All 1,046 reported residue conflicts were audited. Exact peptide matching suggests a consistent candidate coordinate for conflicting rows at 459 positions, partial support at 83, and no consistent alternative at 504. These are curator-review candidates, not validated corrections. All original positions and residues remain intact. Where a residue conflicts, the UI does not assert a site-to-region association. Coordinate overlap by itself does not establish a functional effect.

See [snapshot maintenance and audit methodology](ATLAS-ENRICHMENT.md) and the [public mapping audit](https://oglcnac.org/static/data/atlas-enrichment/mapping-audit.json).

## Validation

- Full repository unit/build checks and public asset/route/link/runtime audits passed.
- 17 affected-page checks passed in each of Chromium, Firefox, and WebKit (51 total); 8 live checks passed in each engine (24 total). These cover filters, URLs/history, keyboard focus, citation copying, matching/full exports, annotation verification, missing metadata, sequence mismatch, and accessibility.
- Whole-site suite: 138 passing checks, including 100 accessibility checks. The updated licenses page also passed live desktop/mobile WCAG checks.
- Visual review: 45 states across 320, 390, 768, 1440, and 1920 pixels; repeated against the live site. Nine scenarios include dense/sparse records, selected annotations, long citations, missing sequences, residue conflicts, unavailable publication data, and incompatible sequence metadata. No page overflow or clipped controls. The review prompted shorter position labels and wider citation action buttons.
- Live static route/data/model smoke and full browser smoke passed without runtime failures. Every one of the 1,280 public build files matches the published repository; all 552 changed public files match live responses (HTML comparison accounts for Cloudflare's email protection).

## Performance

Three cold-cache Chromium runs per entry, 390 px viewport, 1.6 Mbps download, 150 ms latency, and 4x CPU slowdown, measured against the exact published build. These are local lab measurements, not field Core Web Vitals.

| Entry | Median LCP | Maximum CLS | Maximum record readiness | Maximum transfer |
| --- | ---: | ---: | ---: | ---: |
| P12270 | 0.73 s | 0.0000 | 1.72 s | 151.5 kB |
| P18583 | 1.63 s | 0.0000 | 1.71 s | 145.9 kB |
| O15294 | 1.58 s | 0.0089 | 1.63 s | 145.3 kB |

All entries meet LCP <= 2.5 s, CLS <= 0.1, readiness <= 5 s, and initial transfer <= 500 kB. The prior viewer lab baseline had median LCP of 1.57 s (P12270), 1.51 s (P18583), and 1.42 s (O15294), with roughly 72–78 kB transferred. The new citation/annotation payload adds about 73 kB while remaining within the agreed budget. Avoid treating small lab timing differences as proven changes in field performance.

## Publication receipt

- Implementation source: `d0621609c58da3a1091843f66722a4d05465a053`.
- Published Pages artifact: `b1883de8c664effc57c7888d002b37ab5c126003`.
- Author and committer for both: Yaoxiang Li `<liyaoxiang@outlook.com>`; no assistant contributor trailer.
- [Static site quality](https://github.com/oglcnac/oglcnac-source/actions/runs/36736036107), [prediction smoke](https://github.com/oglcnac/oglcnac-source/actions/runs/36736036451), [HexNAcQuest smoke](https://github.com/oglcnac/oglcnac-source/actions/runs/36736036091), and [Pages deployment](https://github.com/oglcnac/oglcnac/actions/runs/36736080012) all passed.
- No public interface links or names the source repository.

Detailed screenshots, test logs, exact hashes, performance results, and publication parity reports are retained under `visual-review/evidence-context-20260930/` in the server workspace. Existing unrelated research work was preserved; overlapping local configuration changes were merged and backed up. Developer documentation changes after the implementation commit do not alter the published website.
