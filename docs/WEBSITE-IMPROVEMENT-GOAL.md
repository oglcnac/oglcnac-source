# Executable website improvement goal

## Goal

Deliver a cohesive, accessible and faster research website across **all 28 deployed content pages, the custom 404 page, and their meaningful result/error states**. A researcher should be able to choose a tool, provide input, understand the scientific answer and export evidence comfortably on a phone or laptop. Resolve the defects documented in the [28 September audit](WEBSITE-AUDIT-2026-09-28.md), then validate the complete release against the checks below.

Completion is measured by working workflows, reviewed screenshots, accessibility checks and research-content loading time. It is not measured solely by a generic performance score or a new homepage design.

## Scope and constraints

- Edit authored templates/content/styles under `site/`, browser code/static assets under `public/`, and build/tests under `scripts/`. Build `dist/` from source.
- Preserve published records, model artifacts, numerical outputs, scientific caveats, citation accuracy, query meaning and complete export contents. Model/data parity is an acceptance requirement.
- Preserve private browser execution of FASTA/CSV analysis, working legacy URLs, keyboard navigation, local exports and reduced-motion support.
- Retain the recognizable navy shell and blue/teal/indigo/purple resource accents. Use consistent typography, an 8px spacing rhythm, restrained borders/shadows and aligned reading columns. Make task pages compact; reserve wider layouts for actual evidence tables.
- Preserve existing unrelated uncommitted work. Treat Functional Explorer and prospective model releases as separate work; do not accidentally publish them by deploying the current dirty tree.

## Work packages, in execution order

### 1. Fix reliability and loaded-state accessibility

**Files:** `public/static/js/prediction-ui.js`, `workbench-ui.js`, `static-data.js`; Atlas detail and OGT search after-content; relevant unit/browser tests.

1. Guard worker message/error handlers by current worker and job generation. Cancellation must remain a cancellation; late callbacks must never overwrite a later job.
2. Evict failed JSON requests from the shared cache; preserve deduplication of in-flight/successful requests. Expose an actionable retry where appropriate.
3. Make the Atlas sequence region focusable and named; verify that keyboard users can scroll the complete sequence.
4. Separate OGT internal evidence and external UniProt actions; give each adequate clickable area and clear labels.
5. Parse missing detail identifiers explicitly while retaining legacy accession redirects.

**Acceptance:** deterministic immediate-start and active-inference cancellation passes; resubmission succeeds without reload; a simulated 503 followed by restored network succeeds on retry; canceled/superseded callbacks cannot alter a new result; populated Atlas and OGT states have zero tested WCAG A/AA violations. Missing `id` never renders the literal word `detail` as an accession.

### 2. Establish the shared visual shell and reading layouts

**Files:** `site/templates/header.html`, `footer.html`, `layout.html`; existing shared stylesheet layers; home, support, citation and tutorial content.

1. Keep Workbench discoverable at all widths, including 1101–1599px. Give primary navigation and section navigation a consistent order and hierarchy.
2. Make the open mobile menu use available space sensibly, with visible current resource/section and comfortable tap targets.
3. Align prose headings and text to one 65–80ch reading column. Keep multi-column glossary rules scoped to glossaries.
4. Standardize headings, cards, alerts, buttons, file inputs, content gutters and footer spacing across all tools. Consolidate competing CSS declarations rather than adding another global override stylesheet.
5. Compact repeated landing-page navigation and use a balanced PRED-DL resource grid. Give diagrams adequate label space under system/fallback fonts.

**Acceptance:** review all 29 page screenshots at 390 and 1440 widths, plus representative 1920/3840 views. No clipping, unintended overlaps, disconnected heading/body alignment or orphaned landing cards. All primary destinations remain available at 320, 390, 768, 1100, 1150, 1279, 1280, 1440, 1600, 1920 and 3840 widths. Preserve visible keyboard focus and reduced-motion behavior.

### 3. Improve input, result and recovery layouts

**Files:** Workbench/PRED input templates and UI; `table-utils.js`; Atlas/OGT search/browse/detail content; shared form/table styles.

1. Shorten introductory content before input and move secondary interpretation guidance into concise help/disclosures. At 390×844, target the primary editable input beginning by **y≤480px** and the active method's Run control appearing by **y≤800px**.
2. Give PRED-DL one clear paste/file choice with shared species selection and immediate example loading; preserve both supported input paths and validation rules.
3. Distinguish initial, loading, no-match, missing record, load failure, cancelled and completed states. Avoid empty tables/toolbars where a recovery message is more useful.
4. Present the essential scientific answer without horizontal scrolling on mobile: Workbench site/score/confidence/evidence status; OGT searched interactor/evidence action; Atlas accession/site/gene. Put repeated protein/model metadata in a summary and full metadata in accessible detail expansion.
5. Give Atlas detail an accession summary, counts and evidence jump links; make long sequence display expandable. Preserve highlighting and complete exports.
6. Keep optional wide evidence tables accessible, bounded and keyboard-scrollable, with a visible overflow cue. Exports must clearly indicate whether they contain filtered or all rows.

**Acceptance:** at 320 and 390 widths, essential result fields and recovery actions are visible without horizontal scrolling. Full scientific fields remain accessible in one expansion or the explicitly scrollable full table. No page-level horizontal overflow. CSV/JSON values, row counts, filters and sort behavior match baseline fixtures; Workbench's all-row export semantics remain explicit.

### 4. Finish HexNAcQuest and scientific-figure presentation

**Files:** `site/styles/20-hexnac.css`, relevant rules in `50-publication.css`; HexNAc analysis/tutorial templates and UI; OGT statistics; site SVG assets.

1. Let the two-column skipped-row table wrap; show row number and full reason together on mobile.
2. Align preview and spectrum headings at the top on desktop. Show the selected spectrum identifier and readable mobile labels.
3. Replace outdated Analyze/Save-results tutorial images with screenshots of the current tool. Retain accurate preparation steps and distinguish historical scientific figures from current UI instructions.
4. Defer the original OGT network image until its disclosure opens. Add explicit full-size figure actions and accessible summaries where embedded labels are too small.
5. Add intrinsic dimensions/aspect ratios to prevent image-induced layout shifts. Keep hero imagery eagerly available.

**Acceptance:** canonical 20-row preview and chart align at 1440px; skipped reasons are readable at 320px without table scrolling; keyboard row selection updates the chart; 10,000-row canonical CSV still classifies identically and downloads correctly. Closed OGT figure disclosure sends **zero requests** for the original 6.7MB SVG, and opening it loads the unchanged scientific original.

### 5. Optimize Atlas data delivery and measure research readiness

**Files:** `scripts/generate_static_data.py`, generated `public/static/data/` assets, `static-data.js`, table/detail loaders, Workbench evidence loader and data tests.

1. Generate a compact search/browse index and deterministic accession/species record shards. Fetch the selected accession's sequence rather than the complete sequence snapshot.
2. Preserve substring search, species aliases, isoform distinctions and all record counts. Load full evidence or export data only when needed; show honest progress during any deferred export.
3. Request Workbench evidence for the submitted accessions while preserving exact species/residue/position matching and all existing interpretation boundaries.
4. Measure network transfer and content readiness before choosing further worker/indexing changes. Avoid a framework rewrite or loading all data into a new client library.

**Acceptance:** repeat three cold runs per measured page at 390×844, 200,000 B/s download, 150ms latency, 4× CPU, cache disabled. Median first Atlas browse/search results **≤5s**; P18583 evidence and complete selected sequence **≤5s**, each at least 50% faster than its comparable baseline. Initial required data transfer **≤500KB** for the representative browse/search/detail route, excluding deliberately requested full exports. LCP **≤2.5s**, CLS **≤0.1** on measured pages. Retain raw per-run evidence; these are lab targets, not claims about field percentiles. Unaffected lightweight pages must not materially regress.

### 6. Strengthen route integrity, discovery and continuous checks

**Files:** `scripts/build_site.py`, `check_site.py`, site metadata/templates, `.github/workflows/site-quality.yml`, browser/accessibility/screenshot tests.

1. Validate extensionless internal routes, relative URLs and fragments against built output. Include failing fixtures so the validator cannot silently skip these targets.
2. Generate a sitemap for intentionally public pages; define and implement index/noindex/canonical policy for search and record states. Add a coherent favicon/share identity and content-derived CSS asset revision.
3. Run standalone PRED-DL and HexNAc browser suites in pre-merge CI. Include loaded Atlas/OGT accessibility states, recovery after failed requests and deterministic cancellation.
4. Make screenshot selection explicit for production versus local research pages. A deployed-site audit must not wait for the unpublished Functional Explorer table.
5. Save reviewed page/state screenshots and a coverage manifest; fail on missing routes, missing screenshots, broken assets, unexpected console errors and document overflow.

**Acceptance:** zero broken internal links/assets/anchors; all 18 baseline public downloads still work; intentional 404s and legacy redirects behave correctly; sitemap excludes 404 and unpublished preview. CI catches a deliberately broken route and each confirmed regression fixture. Every public page/state in the audit has an identifiable reviewed baseline.

### 7. Validate the release and prepare the deployment artifact

Run the required checks after implementation, with a documented Node/browser/fonts environment:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run qa:pr
npm run test:tables:browser
npm run test:prediction:browser
npm run test:workbench:browser
npm run test:hexnac:browser
npm run test:accessibility:browser
npm run smoke:static
```

Exercise the same browser suites in Firefox and WebKit using the existing `SITE_BROWSER`, `PREDICTION_BROWSER`, `WORKBENCH_BROWSER`, `HEXNAC_BROWSER` and `ACCESSIBILITY_BROWSER` environment switches. Validate golden inference results to their existing tolerances; do not change expected scores to make a browser pass.

```sh
for engine in firefox webkit; do
  SITE_BROWSER="$engine" node --test scripts/tests/site-interactions-browser.test.js
  PREDICTION_BROWSER="$engine" node --test scripts/tests/prediction-browser.test.js
  WORKBENCH_BROWSER="$engine" node --test scripts/tests/workbench-browser.test.js
  HEXNAC_BROWSER="$engine" node --test scripts/tests/hexnac-quest-browser.test.js
  ACCESSIBILITY_BROWSER="$engine" node --test scripts/tests/accessibility-browser.test.js
done
```

Also perform keyboard-only review of all task flows, 200% browser zoom/reflow, one screen-reader pass of input/results/errors, and representative real iOS/Android checks when device access is available. Record any unavailable device coverage explicitly; never label an unrun test passed.

Build and inspect the complete deployable artifact, compare before/after screenshots and cold-readiness measurements, and produce a concise change report. Follow `docs/DEPLOYMENT.md` for the actual release and rollback mechanism. Ensure the artifact includes only intended public work; the pre-existing dirty research preview must not become an accidental release dependency.

## Definition of done

- All confirmed A1–A10 findings are resolved or individually documented with evidence and a justified scope decision; no unresolved high-priority reliability/accessibility issue.
- All 29 public page templates and 15 audited interactive states are visually reviewed at desktop/mobile widths, with no document overflow across the five-width matrix.
- Scientific core results are readable on mobile; input forms and recovery states meet the specific layout criteria above.
- Search, browse, detail, filtering, sorting, copying, all exports, both-species prediction, CSV analysis, cancellation and network recovery pass in the supported engines.
- Automated WCAG A/AA scans include populated states and report zero violations; manual keyboard and accessibility limitations are explicitly recorded.
- Atlas readiness and transfer budgets pass using the same controlled conditions as the baseline; current data/model parity tests remain green.
- No unintended external runtime requests or FASTA/CSV uploads are introduced. Published model/data/citation semantics and export completeness remain intact.
- Before/after evidence, a page/state coverage manifest, verification logs and a reviewable release artifact are available. Implementation and deployment status are reported separately.

The first executable milestone is **work package 1**, followed immediately by **the shared shell and mobile scientific-result layouts**. Atlas delivery optimization can proceed independently once its data-parity fixtures are established. Final verification follows integration of every work package.
