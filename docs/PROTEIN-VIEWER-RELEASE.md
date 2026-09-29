# Interactive Atlas protein records

Implement the approved protein-map concept on every Atlas detail record, retaining the blue and teal resource identity and all original scientific evidence.

## Acceptance criteria

- Protein identity and four concise metrics introduce the record: numeric reported positions, source records, distinct PMIDs, and sequence length.
- A responsive overview and separate tracks for source-reported site ambiguity support position selection, regional zoom, previous/next position, and keyboard use through native controls.
- Position selection updates the sequence context, peptide and experimental-evidence tables, and source-publication counts. Clear selection restores all evidence. Complete-record and all-fields exports retain every source row.
- `?id=ACCESSION&site=POSITION` restores the selected position. Browser history, copying the current view, copying the accession, and downloading FASTA work.
- Non-numeric, missing, and out-of-range positions remain in the source tables. Missing sequences and unsupported positions have explicit states; no inferred structure, confidence score, or annotation is fabricated.
- The implementation needs no new external runtime library or data request. Publication titles, additional UniProt annotation tracks, and optional structures remain subsequent enrichment work.

## Verification

- Check all Atlas accessions for position and sequence edge cases; unit-test grouping, duplicate publication handling, unknown ambiguity, and invalid coordinates.
- Exercise P12270, P18583, O15294, one-position, position-free, sequence-free, and missing-record pages with Playwright.
- Verify site filtering and CSV contents against source data, URL restore and browser history, clipboard/FASTA, sequence highlighting, loading and failed-sequence states.
- Review screenshots at 320, 390, 768, 1440, and 1920 pixels; require no page overflow, clipped controls, overlapping labels, or inaccessible evidence.
- Run relevant Chromium, Firefox, WebKit, accessibility, repository, and public-build checks. Compare loading performance with the current record page.
- Publish through the standard source and Pages deployment, then verify live assets and core workflows.

## Results

Local implementation and release verification completed on 2026-09-29:

- Audited all 61,035 source records across 8,881 accessions. No source rows are changed or dropped. The viewer explicitly handles the 734 rows without a single numeric coordinate, 61 rows outside their available sequence, and 1,046 positions where source residue labels differ from the available sequence.
- Nine browser checks pass in each of Chromium, Firefox, and WebKit, including actual P12270 counts, linked filtering, browser history, shared-position links, clipboard and FASTA, full and filtered CSV parity, loading layout, keyboard controls, source exceptions, responsive layout, and WCAG A/AA checks.
- All 38 existing site-interaction checks pass. `npm run qa:pr` and the complete public asset, route, and link audit pass.
- Captured 45 record/viewport states at 320, 390, 768, 1440, and 1920 pixels. Reviewed the record identity, map, sequence context, filtered tables, publications, sparse records, missing sequences, and mismatched coordinates. Fixed long-name overflow, neighboring marker spacing, empty-state spacing, and loading layout shift.
- Controlled mobile performance measurements use a fresh cache, 1.6 Mbps download, 150 ms latency, CPU slowdown 4×, and three runs per record. P12270/P18583/O15294 all meet the existing LCP ≤2.5 s, CLS ≤0.1, and data-ready ≤5 s budgets. These are local lab measurements, not field Core Web Vitals.
- No new external runtime dependency or scientific-data request is introduced. Models, source records, sequences, and analysis algorithms are unchanged.

Review evidence is saved under `visual-review/protein-viewer-2026-09-29/`, including `corpus-audit.json`, browser logs, the screenshot gallery, and before/after performance results. Reproduce browser checks with `node --test scripts/tests/protein-viewer-browser.test.js` after building the site; set `SITE_BROWSER=firefox` or `webkit` for other engines.

The viewer was published from source commit `a8ac19c` as Pages commit `84d5f49` on 2026-09-29. All 760 published files matched the reviewed build, and all 32 changed live files matched after accounting for Cloudflare email protection. Production checks covered 29 public routes at desktop and mobile widths (58 visits), plus the map, selected-position links, history, clipboard, complete and filtered CSV contents, and FASTA in Chromium and Firefox.

The first GitHub accessibility run identified publication links partly covered by the sticky navigation when entering the final table's column chooser. The follow-up keeps the evidence and complete-source tables together before references, matches the section navigation to that order, and gives publication links 44-pixel targets on desktop as well as mobile. The existing column-chooser accessibility check remains unchanged. Local checks at 1440-pixel width and 720, 1100, and 1400-pixel window heights pass with the revised layout; the final automated run and deployment are recorded in the release evidence directory.
