# UniProt-inspired interface review

Review date: 2026-09-29. Scope: all 29 public routes. Reference: [the UniProt O15294 entry](https://www.uniprot.org/uniprotkb/O15294/entry). Execution and release criteria are defined in [the goal](UNIPROT-INSPIRED-WEBSITE-GOAL.md).

## Design and functionality delivered

- A shared compact blue shell, original oglcnac.org mark, restrained teal accents, consistent navigation, table headers and record section hierarchy. Desktop navigation remains available while reading long records; mobile navigation preserves the available reading space.
- Global database search with explicit field selection, `/` shortcut, Escape and focus restoration. OGT-PIN also supports protein-name searches.
- Atlas protein and evidence views, species and position-annotation filters, clear counts, reset and shareable URLs. Canonical accessions, isoforms and species remain distinct. Mixed source annotations are preserved; only positive integer positions enter numerical counts and sequence highlights.
- Atlas and OGT-PIN records with identity metadata, section navigation, publication links and complete source-record CSV downloads. Atlas retains all 21 source fields, including condition, log2FC and p_value. Filtering or hiding a table column does not remove fields from complete downloads.
- Shared table reset and column selection, with a chooser that fits short desktop viewports. Mobile cards and contained table scrolling retain access to scientific fields.
- Human/mouse FASTA example loading, direct HexNAcQuest CSV example loading, Workbench evidence filters and filtered CSV, and links back to analysis inputs. Examples populate inputs without submitting a job. Existing model calculations, cancellation, privacy and complete exports are preserved.
- Section navigation and aligned headings in long guides, model documentation, citations and licensing pages. Tutorials explain the new controls and export scopes.

UniProt informed the information hierarchy, section navigation and practical research controls. The logo, styling, implementation and explanatory wording are specific to oglcnac.org.

## Visual review

The review covers every public route at desktop and mobile sizes, including full-page inspection of long records and guides. Automated geometry checks cover 320, 390, 768, 1440 and 1920 pixels; navigation checks also cover intermediate widths and 4K.

The capture suite contains 54 states at four sizes (216 screenshots): 1440 × 1100, 390 × 844, 1920 × 1080 and 3840 × 2160. States include global search, mobile navigation, protein/evidence views, active filters, empty results, failed data requests, populated records, expanded sequence/aliases, column selection, loaded examples, real analysis results, validation errors and guide contents. Wide scientific tables are evaluated inside their scrolling containers.

Review findings corrected include narrow-screen search clipping, colliding navigation controls, verbose protein aliases, crowded view counts and table actions, empty example-status spacing, misaligned guide headings, incomplete raw record fields, ambiguous position parsing, unavailable record-section links, a column chooser extending below a short Firefox viewport, and record-loading layout shifts.

## Validation

Local evidence is retained under `visual-review/uniprot-ui-2026-09-29/`; generated screenshots and machine reports are intentionally excluded from the source repository. The browser suites cover real human/mouse prediction against the Python reference corpus, HexNAcQuest's canonical class totals, Workbench evidence matching, CSV/JSON parity, cancellation/retry, scientific field preservation and privacy.

The final `qa:pr` and `qa:public` gates pass, as do all 216 final screenshot checks. The full 60-case interaction suite passed separately in Chromium, Firefox and WebKit. Both Chromium and Firefox passed 100 accessibility checks covering every route and key states. After the final corrections, five focused record checks passed in each of the three engines, and 16 affected page/state accessibility checks passed again in both Chromium and Firefox. Firefox needs access to the temporary font setup in this server environment; an earlier fontless run is retained as an invalid environment run. The large Firefox prediction corpus was rerun without competing inference jobs and passed; its numerical assertions and timeouts were not weakened.

## Controlled mobile performance

Three cold-cache runs per route use Chromium at 390 × 844, 200,000 bytes/s download, 150 ms latency, CPU slowdown 4× and local gzip delivery. These are lab measurements, not field Core Web Vitals. All five routes meet the release limits: median LCP ≤ 2.5 s, maximum CLS ≤ 0.1, data readiness ≤ 5 s and representative Atlas transfer ≤ 500 kB.

| Route | Median LCP | Maximum CLS | Median data ready | Transferred |
| --- | ---: | ---: | ---: | ---: |
| Homepage | 0.57 s | 0 | — | 27.3 kB |
| Atlas browse | 0.64 s | 0 | 3.54 s | 480.6 kB |
| Atlas search P18583 | 0.66 s | 0.005 | 3.51 s | 483.6 kB |
| Atlas P18583 record | 1.26 s | 0.047 | 1.25 s, including sequence | 62.6 kB |
| Workbench initial page | 0.64 s | 0 | — | 40.1 kB |

The previous release's corresponding Atlas data-readiness medians were 3.50 s, 3.46 s and 1.15 s. The richer interface adds 7–10 kB to these Atlas routes while remaining inside the established limits. A detected 0.142 record CLS was reduced to 0.047 by keeping status above asynchronously populated metadata and reserving page height. No data/model payloads or inference algorithms were changed.

## Publication

The reviewed implementation was published from clean source commit `4236b89809751d7665d1540895829962fa4b7867` through the standard deployment script as Pages commit `4fba0095e4bfd77797ed256426248395ff980802`. GitHub Pages reports the build complete.

- All 759 deployed repository files match the reviewed artifact byte for byte.
- All 38 changed live files match: 34 byte for byte and four contact pages after decoding only Cloudflare's email-protection transformation. The decoded email addresses, links and all remaining HTML match the source.
- All 29 public routes pass live desktop/mobile checks (58 visits), including record pages with real identifiers, one H1, the shared search control, no page-level horizontal overflow and no JavaScript exceptions.
- Both Chromium and Firefox pass the live static-browser smoke suite, including real PRED-DL and HexNAcQuest outputs. Additional live checks verify global search, protein/evidence counts and shareable view, complete source-field download, OGT-PIN protein-name search and both new example loaders.
- The initial GitHub quality run exposed a test reading a native disclosure before its asynchronous `toggle` handler had positioned the column chooser. The assertion now waits for that handler, retaining the same viewport bounds and all export checks. The follow-up CI result is recorded at completion.

The main working tree was synchronized selectively. Unrelated research files, scripts and preview configuration were preserved.

The automated accessibility checks supplement visual and keyboard review. Playwright WebKit is an engine check, not a claim of testing native Safari. Physical devices, screen readers and field Core Web Vitals are outside this lab review.
