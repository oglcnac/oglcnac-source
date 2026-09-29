# Website improvement completion report — 28 September 2026

The public website improvements are implemented locally. All ten audit findings are addressed, with desktop/mobile visual review of every public page template and the audited interactive states. The deployable output is `dist-public/`; **the live website has not been deployed**.

Open the [before-and-after gallery](../visual-review/site-fixes-2026-09-28/index.html) to compare the original live website with the local implementation. The [original audit](WEBSITE-AUDIT-2026-09-28.md) and [executable goal](WEBSITE-IMPROVEMENT-GOAL.md) document the starting point and acceptance criteria.

## What changed

| Audit finding | Implemented result |
| --- | --- |
| A1: Cancellation and stale worker events | PRED-DL and Workbench reject obsolete callbacks. Cancel, immediate retry and subsequent inference retain the correct state. |
| A2: Failed data requests remain cached | Failed requests are evicted; successful/in-flight requests remain deduplicated. Search and record errors expose recovery; a failed request can succeed on retry without reloading. |
| A3: Populated-state accessibility | Atlas sequence has a named, focusable scroll region. OGT internal evidence and external UniProt links are distinct, adequately spaced actions. Mobile card regions are named. |
| A4: Navigation and Workbench discoverability | Primary and resource navigation have a consistent hierarchy. Workbench remains available throughout the tested 320–3840px range; the mobile menu uses the available width. |
| A5: Atlas loading cost | Compact browse/search indexes, deterministic accession buckets and selective sequence/evidence loading replace whole-corpus loading for representative tasks. Query layout and pending results space are established before first paint, preventing a delayed-script layout jump. Existing complete downloadable datasets remain available. |
| A6: Mobile scientific results | Essential accession, site, score/confidence and evidence fields appear in readable cards. Full fields remain accessible. Workbench offers nine core desktop columns, optional complete fields and pagination while exporting all intended rows. |
| A7: Initial, empty and error states | Missing accessions have useful search/example recovery. Empty tables and toolbars stay hidden until relevant. Loading, no match, load failure, cancellation and completion are distinguishable. |
| A8: Inconsistent visual presentation | Shared navigation, reading columns, headings, cards, spacing and form treatments are consistent. The homepage is shorter, PRED-DL resources form a balanced grid, and workflow diagrams have readable labels and accurate arrows. |
| A9: HexNAcQuest results/tutorial | Skipped reasons wrap on phones; preview and chart align at the top; spectrum identifiers, m/z labels and exact intensities are readable. Current browser workflow diagrams replace obsolete Analyze/Save screenshots; scientific/preparation figures retain full-size links. |
| A10: Delivery and release checks | Heavy historical OGT figures load only when opened. Static assets use content-derived revisions. Public sitemap, robots policy, favicon/share image, internal route/fragment checks and additional browser CI coverage are in place. Public builds exclude the separate research preview. |

Human and mouse prediction goldens, the canonical HexNAcQuest classification fixture, Atlas records, sequences, matching rules and export completeness remain covered by parity tests. FASTA/CSV analysis continues in the browser. Original scientific figures are retained; the two removed images were obsolete user-interface instructions.

At 390×844, PRED-DL input begins around y416 and its Run action around y648; Workbench begins around y450 with Run around y615. Both also meet the planned input/action limits at 320px. Complete evidence tables use bounded scrolling or a full-field expansion; a scroll instruction appears when a shared table actually overflows.

## Visual and browser verification

The [coverage manifest](../visual-review/site-fixes-2026-09-28/visual-coverage.json) identifies every screenshot and its SHA256. Coverage is **29 public templates × 5 widths = 145 route checks**, **58 reviewed page screenshots**, **30 reviewed interactive-state screenshots**, and navigation checks at 11 widths. All recorded routes load without unexpected JavaScript/network errors or page-level horizontal overflow. Record templates use representative accession/query states; this is not a claim to have opened every individual record in the databases.

| Suite | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: |
| Shared table, navigation and layout interactions | 34/34 | 34/34 | 34/34 |
| Standalone PRED-DL | 8/8 | 8/8 | 8/8 |
| Workbench | 8/8 | 8/8 | 8/8 |
| HexNAcQuest | 6/6 | 6/6 | 6/6 |
| Public page/state axe checks | 86/86 | 86/86 | 86/86 |

These are **168 functional browser cases and 258 public axe cases** across the three engines. Shared interaction totals combine each complete 33-case run with the subsequently added delayed-script regression. Firefox and WebKit accessibility totals combine the original and targeted completion logs; skipped cases are not counted as passes. The published evidence retains the initial failures and subsequent fixes. Final HexNAcQuest screenshot refresh additionally checked all four routes at five widths and scanned its result/error states after narrowing a heading selector.

`npm run qa:pr` passed, including build/release, data, table, prediction, Workbench, HexNAcQuest, visual configuration and existing research unit checks. The public artifact passed external-runtime, asset, route, fragment/link and public-scope audits. Local HTTP smoke checks passed for pages, public downloads, model integrity and the new data-delivery assets. `git diff --check` passed.

Keyboard checks cover navigation, retry/cancellation, table sorting and expansion, prediction flows and sequence scrolling. Six task routes also passed a 640px reflow check with root text enlarged to 200%. This is a text-resize/reflow proxy, not a completed browser-zoom or assistive-technology certification.

Evidence:

- [Final repository QA](../visual-review/site-fixes-2026-09-28/qa-pr-final.log), [public build](../visual-review/site-fixes-2026-09-28/final-public-build-check.log), [public link/asset audit](../visual-review/site-fixes-2026-09-28/final-public-site-check.log), [local HTTP smoke](../visual-review/site-fixes-2026-09-28/smoke-public-local.log).
- Shared browser checks: [Chromium](../visual-review/site-fixes-2026-09-28/tables-chromium-final.log), [Firefox](../visual-review/site-fixes-2026-09-28/tables-firefox.log), [WebKit](../visual-review/site-fixes-2026-09-28/tables-webkit-isolated-pages.log); delayed-script regression: [Chromium](../visual-review/site-fixes-2026-09-28/performance/query-layout-chromium.log), [Firefox](../visual-review/site-fixes-2026-09-28/performance/query-layout-firefox.log), [WebKit](../visual-review/site-fixes-2026-09-28/performance/query-layout-webkit.log).
- Accessibility: [Chromium](../visual-review/site-fixes-2026-09-28/accessibility-chromium-final.log), [Firefox union](../visual-review/site-fixes-2026-09-28/accessibility-firefox-summary.json), [WebKit union](../visual-review/site-fixes-2026-09-28/accessibility-webkit-summary.json), [keyboard/reflow](../visual-review/site-fixes-2026-09-28/keyboard-reflow.json).
- [PRED-DL and Workbench evidence](../visual-review/site-improvements-2026-09-28/analysis/README.md), [page measurements](../visual-review/site-fixes-2026-09-28/routes.json), [state/navigation measurements](../visual-review/site-fixes-2026-09-28/supplemental.json).
- HexNAcQuest browser logs: [Chromium](../visual-review/site-fixes-2026-09-28/hexnac-chromium.log), [Firefox](../visual-review/site-fixes-2026-09-28/hexnac-firefox.log), [WebKit](../visual-review/site-fixes-2026-09-28/hexnac-webkit.log).

## Performance

The final [raw runs](../visual-review/site-fixes-2026-09-28/performance/results.json), [summary](../visual-review/site-fixes-2026-09-28/performance/summary.json) and [reproduction instructions](../visual-review/site-fixes-2026-09-28/performance/README.md) contain three cold runs each for home, Atlas browse, accession search, P18583 detail and Workbench initial state. Conditions are 390×844, 200,000 bytes/s download, 150ms latency, 4× CPU slowdown and disabled browser caching.

Atlas browse readiness fell from about **14.82s to 3.545s** (about 76% faster); complete selected detail plus sequence fell from **32.59s to 1.155s** (about 96% faster). Accession search is ready in **3.445s**. Representative browse/search transfers are approximately **474KB**, and selected detail approximately **53KB**. All 15 final runs meet the readiness, transfer, LCP and CLS acceptance limits, with CLS 0 throughout. The machine-readable summary contains exact final medians.

The baseline used the production origin and the optimized run used the local public artifact with gzip level 6. Both used the same browser throttling settings, but origin/CDN differences remain; these are controlled lab comparisons, not production field percentiles. Broad peptide substring searches deliberately load additional data to preserve complete matching and can exceed the representative 500KB budget. Full exports also intentionally transfer the complete requested data.

A final repeated run exposed an intermittent search layout shift. Delaying `table-utils.js` by 600ms reproduced CLS 0.399; establishing the query layout before content rendering reduced CLS to 0 in all three forced-delay runs. The before/after measurements and attribution are retained in `performance/search-delayed-script-*.json`, and the browser regression checks geometry before allowing the delayed script to load.

## Environment and remaining coverage limits

Tests used Node20.19, the repository's installed Playwright/axe dependencies, Chromium/Firefox/WebKit and an explicit DejaVu fallback font configuration. Ubuntu26 required browser dependencies and the Ubuntu24 Playwright fallback. Environment-specific runners and font details are retained with the evidence.

This host's WebKit WebProcess crashed on repeated navigation even for a minimal page containing only native HTML, with a captured native segmentation fault. Three independent directory/geometry tests now use a fresh context per route in every engine; all route assertions and genuine navigation behavior tests remain. The [minimal reproduction and investigation](../visual-review/site-fixes-2026-09-28/webkit-runtime-investigation/README.md) document the limitation. The passing suite does not certify repeated-navigation stability on actual Safari.

Physical iOS/Android devices and a screen reader were unavailable. Real Safari/device testing, a full screen-reader pass and actual browser zoom remain unrun. Automated axe results do not establish complete WCAG conformance. The unpublished Functional Explorer has pre-existing target-size findings and is excluded from this public release; opt-in preview checks retain that coverage separately.

## Reviewable artifact and deployment

The [public release archive](../visual-review/site-fixes-2026-09-28/oglcnac-public-release.tar.gz) contains the 759-file public build. Its [manifest](../visual-review/site-fixes-2026-09-28/release-manifest.json) records every file hash, the archive checksum and local source provenance. The evidence directory is ignored by Git; preserve or copy it when sharing the release.

To inspect the same public scope from source:

```sh
npm run qa:public
python3 -m http.server 8891 --directory dist-public
```

Open `http://127.0.0.1:8891/`. In another terminal:

```sh
python3 scripts/smoke_static_site.py \
  --base-url http://127.0.0.1:8891 --static-root dist-public
```

The existing workspace's unrelated research changes were preserved. No blanket commit, production push or deployment was performed. The deployment helper now builds the public-only artifact and retains the repository's clean/pushed-source guard. Follow [deployment and rollback instructions](DEPLOYMENT.md) after the intended source changes are reviewed and committed separately from unrelated work. The default `npm run smoke:static` targets production; use the explicit local URL above to validate an undeployed release.
