# Connected research workflows release

Status: complete and live at https://oglcnac.org/, verified 2026-09-30.

## Delivered scope

1. Atlas protein pages and collections prepare Workbench inputs from exact tracked sequences. Compatible single-species requests populate FASTA automatically; mixed/incomplete requests have explicit human/mouse choices and per-accession outcomes. Results link back to experimental evidence.
2. Accessible search suggestions rank exact accessions and reported genes before partial matches, expose species, and preserve keyboard, pointer and ordinary search behavior.
3. A searchable directory covers all 427 source studies. Stable PMID pages expose original evidence, counts, methods, samples, source-filtered protein links, collection selection and complete CSV exports.
4. Protein figures export as self-contained SVG and 2× PNG with full/custom ranges, original ambiguity categories, residue-conflict markers, compatible domains/regions, source information and structured SVG metadata.
5. Atlas and Workbench ZIP reports include complete/filtered data, available sequences, citations, filters, version manifests and SHA-256 checksums. Workbench reports capture the completed run independently of later input edits. UniProt fallback sequences on existing record pages are identified explicitly and retain their provider header.

The original blue/teal design remains consistent. Mobile figure controls, compact record actions, study table widths and collection actions were refined during screenshot review. Study and preparation loading space is reserved to avoid moving controls after first paint. The public tutorial documents each workflow.

## Scientific integrity

All 61,035 Atlas rows, the tracked sequence snapshot and OGT-PIN source records remain byte-identical. Suggestions retain source-reported names; there is no inferred external synonym mapping. All 427 study summaries are checked independently against the complete corpus. Multi-PMID rows appear under each cited paper; counts are not independent observations or biological abundance.

Original reported coordinates are retained. Incompatible annotations are omitted; conflicts are marked rather than corrected. Missing sequences remain usable as evidence-only reports. Standard ZIP readers verify archive CRCs and each exported file's SHA-256. Tests verify input identity, full/filtered export parity, sequence hashes, SVG coordinates/XML, PNG dimensions and preservation of a completed run after form edits.

## Local verification

- Repository/public builds, deterministic data generators, route/link/asset audits and the existing unit/protocol checks pass.
- Twenty-five new-workflow cases cover Chromium, Firefox and WebKit, including real local prediction, keyboard search, mixed species, missing data, failures/retries, citation/source provenance, study exports, scientific figures and report checksums.
- Existing affected regression: 84 checks. Two search layout findings were corrected and the relevant checks rerun successfully.
- Full-site accessibility: 110 checks pass. New primary states also pass WCAG A/AA checks at desktop/mobile widths in each of the three engines.
- Eighty visual states cover 320, 390, 768, 1440 and 1920 px. Coverage includes suggestions, directory filters/empty results, studies, absent studies, collections, mixed/missing sequence preparation, automatically prepared input, record actions, complete/regional/missing-sequence figures and completed research reports. Geometry checks find no page overflow, clipped controls or browser exceptions; representative screenshots and exported figures were inspected directly.

Representative mobile lab measurements use three cold Chromium contexts per route, 390×844 viewport, HTTP gzip, 1.6 Mbps download, 150 ms latency and 4× CPU slowdown. Targets are median LCP ≤2.5 s, maximum CLS ≤0.1 and representative small-input readiness ≤8 s. These measurements describe the reviewed artifact under laboratory conditions, not field Core Web Vitals.

| Route | Median LCP | Maximum CLS | Maximum data-ready time |
| --- | ---: | ---: | ---: |
| Publication directory | 800 ms | 0 | 1,608 ms |
| Study PMID 20068230 | 1,480 ms | 0 | 6,455 ms |
| Three-accession preparation | 836 ms | 0.0011 | 2,100 ms |
| OGT gene search | 808 ms | 0.0293 | 4,611 ms |

All targets pass. The first exact-artifact test invocation started before its build finished; the affected setup-dependent case was rerun successfully in each engine after the build. The final live suites below completed in full without failures or skipped cases.

## Publication and live verification

- Implementation: `0ef2dfb7010015ed98c7cb868d54232d1f27888b`.
- Deployment: `b9d946ff4dbf770d1a28409ca7403277fab459e5`. All 1,304 published files match the reviewed artifact. All 55 changed live files match, allowing only reversible Cloudflare email-address protection in HTML.
- [Static site quality](https://github.com/oglcnac/oglcnac-source/actions/runs/36756205915), [prediction smoke](https://github.com/oglcnac/oglcnac-source/actions/runs/36756206019), [HexNAcQuest smoke](https://github.com/oglcnac/oglcnac-source/actions/runs/36756205801) and [Pages deployment](https://github.com/oglcnac/oglcnac/actions/runs/36756635794) passed.
- Live Chromium, Firefox and WebKit: 25 workflow checks each, 75 passed, zero failures or skips. These cover real prediction, exports, ZIP checksums, keyboard interactions, responsive accessibility and explicit failure states.
- Eighty live visual states at five widths match the reviewed control geometry exactly. No page overflow, clipped controls or browser exceptions. Representative phone, tablet and desktop screenshots and full/regional exported PNG figures were inspected directly. Five downloaded Workbench reports also pass independent ZIP CRC and payload SHA-256 checks.
- The full-site browser smoke passes across all 31 primary routes plus record, prediction and HexNAcQuest workflows. The static-file smoke also passes.
- Author and committer are `Yaoxiang Li <liyaoxiang@outlook.com>` for implementation and deployment, with no assistant-credit trailers. No public HTML, CSS or JavaScript references the source repository.

Try [publication discovery](https://oglcnac.org/atlas/publications/), [a study's evidence](https://oglcnac.org/atlas/study/?pmid=20068230), [prepared Workbench input](https://oglcnac.org/analysis/?ids=P12270) or [protein figures and reports](https://oglcnac.org/atlas/detail/?id=P12270).

The implementation contract and reproducible commands are in [RESEARCH-WORKFLOWS.md](RESEARCH-WORKFLOWS.md). Local evidence is retained under `visual-review/research-workflows-20260930/` in the working workspace.
