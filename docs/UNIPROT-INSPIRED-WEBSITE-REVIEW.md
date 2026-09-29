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

The full 60-case interaction suite passed separately in Chromium, Firefox and WebKit. Both Chromium and Firefox passed 100 accessibility checks covering every route and key states. Targeted checks are repeated after the final record/column/layout corrections. Firefox needs access to the temporary font setup in this server environment; an earlier fontless run is retained as an invalid environment run. The large Firefox prediction corpus was rerun without competing inference jobs and passed; its numerical assertions and timeouts were not weakened.

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

Publication and live verification are pending the final release checks. The deployment must use the clean source checkout and the standard deployment script. The final report records source and Pages commits, complete artifact parity, changed live-file hashes, all-route desktop/mobile checks and live scientific workflows.

The automated accessibility checks supplement visual and keyboard review. Playwright WebKit is an engine check, not a claim of testing native Safari. Physical devices, screen readers and field Core Web Vitals are outside this lab review.
