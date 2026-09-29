# UniProt-inspired website improvement goal

Status: complete, published and verified on 2026-09-29. Authorized scope: the entire public oglcnac.org website, including deployment and live verification. Design reference chosen by the user: UniProt. Our own identity, scientific content and browser-local analysis are preserved. Results are recorded in [the review report](UNIPROT-INSPIRED-WEBSITE-REVIEW.md).

## Deliverables

1. **One recognizable interface across all 29 public routes.** Use a compact blue navigation shell, oglcnac.org branding, restrained teal accents, readable type, consistent section headings, visible active states, and a quiet footer. Preserve direct access to all five resources, citations, help and downloads. No copied UniProt logo, assets, proprietary wording, or oversized homepage banner.
2. **Search within reach on every page.** Provide a labelled search launcher and keyboard shortcut, explicit database/field selection, sensible examples, Escape/return-focus behavior, and correct links to the existing Atlas and OGT-PIN search workflows. Do not upload or persist analysis inputs.
3. **Atlas results that distinguish proteins from evidence.** Add protein and evidence views, species and reported-position filters, clear counts and reset, shareable query/view/filter URLs, and exports whose scope is clear. Preserve canonical/isoform and species distinctions and every source evidence row.
4. **Structured protein records.** Present accession, gene/protein identity and species together; make overview, sequence, evidence and publication sections easy to reach. Provide full-record exports alongside filtered table exports. Apply the same record hierarchy to OGT-PIN using its actual fields, without inventing metadata or scientific scores.
5. **Useful shared table controls.** Keep sorting, filtering, pagination and mobile cards. Add an explicit reset action and column selection for wide tables; hidden columns must remain in complete CSV exports. Make loading, empty and error states readable and recoverable.
6. **Consistent analysis workflows.** Align input, examples, settings, run/status and result actions across PRED-DL, Workbench and HexNAcQuest. Add direct example loading where missing and easy navigation back to inputs. Preserve real scientific outputs, model/species labels, cancellation/retry, full exports and the distinction between prediction and experimental evidence.
7. **Readable help and provenance.** Improve navigation through longer guides and method pages, preserve citations/publication figures/release information, and make relevant help available beside tasks. All improvements must fit the compact style already preferred by the user.

## Visual review strategy

- Build and serve an isolated public artifact. Capture every configured public route at 1440 × 1100 and 390 × 844, and inspect the rendered screenshots, including the full page where content extends below the fold. Also capture 1920 × 1080 and 3840 × 2160 for wide-screen review.
- Check layout at 320, 390, 768, 1440 and 1920 pixels for all 29 routes. Inspect the shared navigation at intermediate widths and with the mobile menu and global search open.
- Capture success, loading, empty, error/retry, active filters, switched result views, expanded sequences/columns/guides, and real analysis results. Include long accession/name/content cases and isoforms.
- Compare the homepage, Atlas results/record, OGT-PIN record and analysis forms against the selected UniProt patterns. Judge hierarchy, alignment, spacing, contrast, readable tables, clear primary actions and consistency; do not judge success by screenshot counts alone.
- Fix and recapture any clipping, collision, inconsistent control, missing field, unreadable state or unnecessary vertical bulk. Retain a review gallery and a manifest identifying reviewed states.

## Release standards

- No page-level horizontal overflow at the five target widths. Wide scientific tables can scroll inside labelled containers; mobile cards retain access to all fields.
- One meaningful H1 per page, visible keyboard focus, labelled form controls, operable disclosures, and understandable active/disabled/loading states. Check color contrast and automated WCAG A/AA findings; resolve violations introduced by the changes.
- Canonical proteins, isoforms and species remain distinct. Matching evidence counts reconcile with the current datasets. Full exports preserve all source fields and row values; filtered exports match their labels and filters.
- Existing unit/build/data checks and required release gates pass. Run affected interactions and relevant real analysis/data/export cases in Chromium, Firefox and Playwright WebKit; retain existing cancellation/retry and privacy checks.
- Check key data-heavy routes under the existing controlled mobile performance setup; avoid a material regression in loading or layout stability. Keep dependencies and data delivery bounded.
- Publish only the reviewed public build from a clean source checkout through the existing deployment script. Verify source/build parity, GitHub deployment success, and live navigation, search, records, downloads and real analysis workflows.
- Report evidence, deployed commits, and material limitations honestly. Physical devices, native Safari and assistive technology are not implied by simulated viewport or engine tests.

## Completion

All seven deliverables are implemented. Every public route was visually reviewed at desktop and mobile widths; all 216 final gallery checks, browser interaction suites, accessibility checks, scientific/export checks and performance budgets pass. The 759-file published artifact matches the review, every public route was checked live at both widths, and live analysis/download workflows pass. GitHub's follow-up quality and prediction runs pass.

Implementation was isolated in `/tmp/oglcnac-uniprot-20260929`, based on published source commit `880eea1`, and released as source `4236b89` / Pages `4fba009`. Subsequent source commits contain test synchronization and release documentation only. Final changes were synchronized selectively to the main workspace, preserving unrelated research work.
