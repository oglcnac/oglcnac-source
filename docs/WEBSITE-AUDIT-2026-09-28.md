# Website audit — 28 September 2026

The deployed site has a consistent visual foundation and working core research workflows. The next release should prioritize reliable cancellation and network recovery, accessible populated results, useful mobile results, and much faster Atlas data loading. Cosmetic refinement alone would leave the most consequential problems unresolved.

This is an audit and implementation specification. No production website code was changed or deployed during this audit. Existing uncommitted research and configuration work was preserved.

- [Executable improvement goal](WEBSITE-IMPROVEMENT-GOAL.md)
- [Screenshot and evidence gallery](../visual-review/site-audit-2026-09-28/index.html)
- [Route measurements](../visual-review/site-audit-2026-09-28/routes.json)
- [Populated/error state accessibility and navigation measurements](../visual-review/site-audit-2026-09-28/supplemental.json)
- [Interaction report](../visual-review/site-audit-2026-09-28/interactions/report.md)
- [Workbench and HexNAcQuest report](../visual-review/site-audit-2026-09-28/interactions/workbench-hexnac/report.md)
- [Source and verification report](../visual-review/site-audit-2026-09-28/source/source-audit.md)
- [Controlled performance results](../visual-review/site-audit-2026-09-28/source/performance.json)

Screenshots, downloaded test outputs, scripts and raw logs are intentionally in the repository's ignored `visual-review/` directory. These two Markdown documents are the durable audit and work specification; archive the evidence directory separately when sharing the audit.

## Scope and method

Inventory came from `site/site.json`, rendered internal links, source assets and live HTTP responses. There are **28 ordinary deployed pages plus the custom 404 document**. The thirtieth local output, `/research/functional/`, is an unpublished preview and returns HTTP 404 on production. It is not a broken link in the deployed navigation. Slashless `/ogt-pin` redirects correctly to its canonical route.

Every public page received a full-page screenshot and actual visual inspection at **1440×1000 and 390×844**. Automated layout measurements additionally covered **320×740, 768×1024 and 1920×1080**. That is **145 public page/viewport checks and 58 public page screenshots**. Five additional probes confirmed the research route is unpublished. Navigation was exercised at 11 widths from 320 to 3840, including 1100, 1150, 1279, 1280, 1440 and 1600 to expose breakpoint behavior.

Fifteen additional live states were captured and scanned with axe at both desktop and mobile: Workbench results/error; Atlas search results/no-match/network-error/detail; OGT publication disclosure/search results/no-match/network-error/detail; PRED-DL results/error; HexNAcQuest results/error. The network-error cases deliberately intercept requests with HTTP 503; they are not production outages. Four open-navigation states also received axe scans.

The browser was Playwright Chromium on Linux. The runner initially lacked browser libraries and fonts. Those invalid runs were discarded, then the complete public matrix and interaction tests were repeated with working libraries and DejaVu fallback fonts. The retained measurements contain no glyphless captures. Fine wrapping can differ from Windows/macOS fonts. Full-page screenshots after scrolling can incorrectly paint an offscreen fixed skip link; supplemental captures were repeated at scroll position zero with the unfocused skip link suppressed **for screenshots only**, after accessibility scans. This artifact is not a site defect.

## Verification outcome

| Check | Result |
|---|---|
| Public route responses | All 29 configured public outputs returned 200; real unknown routes retain the custom 404 response |
| Five-width layout matrix | No document-level horizontal overflow; all public page images loaded; no page exceptions or unexpected failed asset requests |
| Initial-page WCAG A/AA automated scans | 58/58 scans without violations |
| Populated/error state scans | 27/30 without violations; 3 scans reveal 2 distinct serious accessibility issues |
| Open-navigation axe scans | 4/4 without violations |
| Existing live-adapted table/site/PRED browser regressions | 34 passed, 1 failed: PRED cancellation |
| Additional Atlas/OGT/PRED workflow scenarios | 13/13 passed |
| Workbench and HexNAcQuest workflows | Valid/invalid input, both Workbench species, CSV/JSON exports, filtering, cancellation, keyboard/touch interactions and canonical 10,000-row HexNAc analysis passed; full case list in linked report |
| Repository `npm run qa:pr` | 192 test invocations passed, 14 skipped, zero failed; data tests are invoked twice in this aggregate |
| Download/route validation | 18 public downloadable resource links returned 200; independent generated-site link/file/fragment checks found no broken targets |
| Controlled performance | 12/12 runs completed; serious Atlas data-readiness delay demonstrated |

The 14 skipped repository tests require the separate pinned research modeling environment. They are disclosed skips, not successful tests. The child interaction audit initially attempted to select an unchanged file and consequently never started its intended cancellation test; the corrected fresh-file cancellation scenario passed. Test-environment and automation failures were separated from the remaining confirmed product defects.

## Confirmed findings

### A1. Prediction cancellation is overwritten by a stale worker error — high priority

On `/pred_dl/input_fasta/`, submit `>CANCEL`, a newline, and `ST` repeated 900 times, then immediately cancel. Cancellation works, clears results and restores controls, but the visible message changes from “Prediction cancelled.” to “The local prediction engine could not start. Please reload and try again.” Reproduced in three fresh-page attempts; resubmission works without reload.

The event trace shows a terminated worker's `importScripts` error arriving after cancellation. `public/static/js/prediction-ui.js` has an unguarded worker error listener. Guard all callbacks by worker identity and active generation; inspect the analogous Workbench listener. Add deterministic startup-cancel, inference-cancel and resubmit tests. Evidence: `interactions/cancel-trace.json`, `prediction-cancelled-full.png` and failed regression in `live-test-output.txt`.

### A2. Failed data requests remain cached — high priority

`public/static/js/static-data.js` retains rejected promises in `DATA_CACHE`. This was reproduced in the actual browser: block the initial Atlas browse data request with a 503; restore the connection; select Mouse. The interface repeats “Please try again” but issues **no new request**. Only reloading fetches again and restores rows. [Browser reproduction](../visual-review/site-audit-2026-09-28/recovery.json).

Evict failed promises while preserving successful caching and concurrent request deduplication. Confirm recovery in Atlas browse and the Workbench evidence-loading stage. This is an application behavior issue, independent of the network simulation used to trigger it.

### A3. Loaded results have accessibility gaps — high priority

- `/atlas/detail/?id=P18583`: `#protein-sequence` is scrollable but cannot receive keyboard focus. Axe reports `scrollable-region-focusable` at 1440 and 390 widths. Give the region keyboard access and a meaningful accessible name; confirm actual arrow/page navigation.
- `/ogt-pin/search/?q=Q9H1M0&field=uuid_b`: the adjacent external UniProt and internal accession links are approximately 51×16 and 68×16 CSS pixels, with inadequate separation. Axe reports WCAG 2.2 `target-size` on mobile. Separate and label “View evidence” and “UniProt”, with sufficient target size and spacing.

These failures are absent from parameterless page scans. Expand accessibility coverage to populated records and results, not just initial pages.

### A4. Navigation loses Workbench at laptop widths — high priority

`site/styles/50-publication.css` explicitly hides `.site-workbench-link` from **1101 through 1599px**. Confirmed at 1150, 1279, 1280 and 1440px, including the open menu below 1280. The link is available again at 1600. Main and section navigation also compete within a dense single desktop row; the narrow menu is a tall column with considerable unused horizontal space.

Use one coherent responsive shell with all destinations available at every width. Keep the user's current resource and current section visually distinct. Preserve semantic navigation, keyboard operation, focus outlines, and the functioning skip link.

### A5. Atlas transfers too much data for the task — high priority

Atlas browse/search fetch a single **29,604,702-byte decoded records JSON** even for a narrow query. A detail page also fetches the complete **6,602,711-byte decoded sequence snapshot**. Hosting already compresses these: records transfer about **2.28 MB** and sequences about **3.76 MB**. Enabling gzip is not the missing optimization.

Controlled cold mobile measurements used 390×844, 200,000 bytes/second downstream, 150ms latency, 4× CPU slowdown, and disabled cache; values below are medians of three runs:

| Page | LCP | CLS | Transfer | Research content ready |
|---|---:|---:|---:|---|
| Home | 0.772s | 0.064 | 25.7 KB | Static content |
| Atlas browse | 0.620s | 0.115 | 2.305 MB | First table: **14.82s** |
| Atlas P18583 detail | 0.652s | 0.128 | 6.065 MB | Evidence table: **13.70s**; sequence response completed **32.59s**; network settled **33.39s** |
| Workbench initial | 0.616s | 0.064 | 28.6 KB | Input form; excludes running analysis |

LCP measures the early heading, not completion of the research task. Prioritize compact generated indexes and accession/sequence shards, defer full export payloads until requested, and preserve query/export semantics. The measurements demonstrate transfer/wait costs; they do not establish large main-thread long tasks as the dominant bottleneck. These are lab results, not field Core Web Vitals or real-user percentiles.

### A6. Mobile results hide the scientific answer — high priority

All tested wide tables correctly contain their overflow. Containment alone is insufficient: Workbench shows repeated Protein/Species/Length while site, score, confidence and evidence remain offscreen; OGT search initially shows interactor A while the searched interactor B is offscreen. Workbench's 318px result region contains a roughly 1540px table, with tall repeated metadata rows.

Provide a compact mobile result summary or priority-column table: site/score/confidence/evidence for Workbench; searched interactor and evidence action for OGT; accession/site/gene for Atlas. Keep full data in accessible expansion and unchanged exports. Add a visible scroll cue when optional wide tables overflow. Give long Atlas records an accession summary, evidence counts, section links and a collapsible sequence pane.

### A7. Empty and missing-record states are misleading and verbose — medium priority

Both initial search pages display “No matching records” before a search and show disabled copy/export/pagination controls. Parameterless detail routes interpret the literal path segment `detail` as the accession, then display “No record was found for detail.” Atlas additionally renders three empty evidence tables.

Distinguish initial, loading, no-match, missing identifier, missing record and failed-load states. Initial search should provide examples and instructions; missing records need one concise explanation and an actionable recovery path. Render result controls when useful. Preserve compatibility redirects for legacy accession URLs.

### A8. Page hierarchy and component spacing need refinement — medium priority

- At 390px, Workbench FASTA input begins around **y=791** and Run around **y=1127**. PRED-DL paste input starts around **y=659** and its submit around **y=1055**; the alternate upload form extends the page before results. Condense introductory panels and use a clear input-method choice.
- Citations, licenses, model card and tutorials put large headings at the panel's left edge but center body text in a narrower column. This creates a visibly disconnected reading path on desktop. Align headings and prose to one reading column; maintain a separate wider glossary layout where useful.
- Resource landing pages repeat hero graphics and large navigation cards. PRED-DL's five cards form an uneven 4+1 grid; mobile home extends to about 4750px. Reduce repeated content and empty space without reducing readable text or touch targets.
- Cards, nested panels, shadows, heading alignment and file controls differ across Workbench and HexNAcQuest. Consolidate shared components while retaining resource accent colors.
- SVG labels in the suite and predictor workflow need more room under fallback fonts. Small embedded scientific figures are difficult to read on mobile; offer an explicit full-size view and a useful text summary.

### A9. HexNAcQuest has specific layout and guidance problems — medium priority

The two-column skipped-row table inherits a 720px minimum width, so a mobile user sees the row number but must scroll to discover the reason. Let this short table wrap naturally. On desktop, shared `.hq-grid-2 { align-items:center }` overrides the analysis grid's top alignment; a long preview strands the spectrum chart halfway down the page. Restore scoped top alignment.

The tutorial's Analyze and Save results screenshots show an earlier interface rather than the current browser tool. Replace those UI illustrations with current examples, preserve third-party preparation screenshots where still accurate, and reduce mobile spacing between steps. Show the selected spectrum identifier and legible mobile chart labels.

### A10. Hidden figures load eagerly; verification and discovery need strengthening — medium/low priority

The collapsed original-figure disclosure on OGT statistics downloads `OGT-Interactome-760.svg` immediately: **969,552 encoded / 6,726,001 decoded bytes**, confirmed in live resource timing. Defer its request until the disclosure opens; retain the full scientific original. Reserve intrinsic image dimensions and avoid lazy-loading primary hero visuals.

`qa:repository` currently skips normal extensionless links, so it can miss a future typo in a route despite today's independent audit passing. Add real link/fragment validation. Pre-merge CI omits dedicated PRED and HexNAc browser suites. Screenshot generation does not itself prove someone inspected screenshots or provide a comparison gate. Make populated states and the confirmed failure paths mandatory.

`/sitemap.xml` is missing. Titles, descriptions and canonical links exist; record-query canonicals point to parameterless detail routes. Generate a sitemap for intended public pages and define an explicit indexing policy for search/detail states. Shared CSS is only about 15.9 KB compressed; its six stacked layers and repeated selectors are primarily a maintenance problem, not the main performance problem. Consolidate gradually and derive the CSS cache revision from content.

## Page-by-page visual review

Every row below was inspected in both full-page desktop and mobile screenshots. The gallery links each route to its images. “Shared” refers to A4/A8, not an undiscovered page-specific failure.

| Public page | Visual assessment / actionable follow-up |
|---|---|
| `/` | Cohesive color coding; long mobile page, repeated tool summaries and small diagram labels; A4/A8 |
| `/analysis/` | Clear evidence distinctions; input too low on mobile, results bury site/score/evidence; A1 review/A2/A6/A8 |
| `/citations/` | All references readable; align headings and citation text, add convenient citation actions; A8 |
| `/licenses/` | Readable and contained; unify heading/prose alignment; A8 |
| `/atlas/` | Primary search is prominent; compact repetitive resource cards and secondary content; shared |
| `/atlas/statistics/` | Current versus historical distinction clear; mobile metric stack long, figures need explicit full-size affordance; A8 |
| `/atlas/search/` | Search form contained; improve initial/no-match states and mobile result columns; A6/A7 |
| `/atlas/browse/` | Species controls work; long data wait, weak horizontal-scroll cue; A2/A5/A6 |
| `/atlas/detail/` and populated record | Missing ID incorrectly becomes `detail`; loaded sequence/evidence need hierarchy and keyboard access; A3/A5/A6/A7 |
| `/atlas/tutorial/` | Glossary readable; desktop heading/prose alignment and mobile jump links; A8 |
| `/atlas/download/` | Clear release separation, all four files reachable; clearer download affordance/file size useful; shared |
| `/atlas/contact/` | Readable contact cards, functioning mail/tel links; reduce excess inner spacing; shared |
| `/ogt-pin/` | Clear accent and calls to action; compact secondary cards and overview diagram; shared |
| `/ogt-pin/statistics/` | Readable live network and working species filter; defer hidden original and expose full-size action; A10 |
| `/ogt-pin/search/` | Initial state misleading; mobile searched identifier offscreen, adjacent link targets too small; A3/A6/A7 |
| `/ogt-pin/detail/` and populated record | Valid evidence works; missing-ID state and mobile evidence hierarchy need refinement; A6/A7 |
| `/ogt-pin/tutorial/` | Content readable; desktop alignment and mobile navigation within long glossary; A8 |
| `/ogt-pin/contact/` | Contained, readable contact cards; shared spacing |
| `/pred_dl/` | Primary action clear; uneven 4+1 resource grid and crowded diagram labels; A8 |
| `/pred_dl/input_fasta/` | Both methods work; cancellation race, long stacked mobile forms, remote result/error area; A1/A8 |
| `/pred_dl/tutorial/` | Steps clear; align headings/body and connect examples directly to input; A8 |
| `/pred_dl/model-card/` | Scope and limitations readable; align prose and headings, optional contents navigation; A8 |
| `/pred_dl/download/` | Four reference downloads work; add size/type cues and consistent download affordance; shared |
| `/pred_dl/contact/` | Both institutions readable; shared card spacing |
| `/hexnac-quest/` | Useful primary action; larger hero and different component treatment from other tools; A8 |
| `/hexnac-quest/analysis/` | Valid/invalid/cancel/export work; fix skipped reasons and chart alignment; A9 |
| `/hexnac-quest/tutorial/` | Complete preparation workflow; old application screenshots, long mobile spacing, tiny image text; A9 |
| `/hexnac-quest/contact/` | Readable and concise; align heading/lead consistently with other support pages; A8 |
| `/404.html` / unknown route | Useful recovery links and contained layout; include Workbench among recovery destinations; shared |

## Limits and separate local work

This audit covers every deployed page template and a substantial set of successful, empty, invalid, loading-failure and cancellation states. It does not enumerate every accession, sequence, CSV or possible interaction. It does not constitute biological/model accuracy validation, external-paper verification, or a guarantee of zero defects.

Firefox, WebKit, real iOS/Android hardware, manual screen-reader testing and real-user performance measurements were not completed in this audit. They are explicit release acceptance tasks in the improvement goal. A clean axe scan is not a claim of full accessibility conformance.

The local Functional Explorer was inspected separately; its screenshots and findings belong to `visual-review/site-audit-2026-09-28/local-preview/`. Its publication and scientific release decisions are independent of this public-site improvement scope.
